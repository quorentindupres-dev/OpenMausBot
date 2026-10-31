import {
  buildAgentComputerName,
  type ComputerLease,
  type ComputerLeaseRequest,
  type ComputerMcpEndpoint,
  type ComputerOsFamily,
  type Mac2HostConfig,
  type ProviderAvailability,
} from "../../../shared/agent-computers.ts";
import { AgentComputerError } from "../errors.ts";
import {
  buildCleanRemoteShellCommand,
  shellQuote,
  type ComputerProviderAdapter,
  type ExecCommandInput,
  type ExecCommandResult,
  type LeaseLifecycleResult,
  type ProviderContext,
  type ProvisionedComputer,
  type ScreenshotPreview,
} from "../types.ts";

interface LumeVmRecord {
  name?: string;
  status?: string;
  os?: string;
  ipAddress?: string | null;
  ip_address?: string | null;
  vncUrl?: string | null;
  vnc_url?: string | null;
}

interface LumeApiResponse {
  status: number;
  ok: boolean;
  body: unknown;
}

export interface Mac2LumeVmProviderOptions {
  readyPollDelaysMs?: readonly number[];
  guestUser?: string;
}

const DEFAULT_READY_POLL_DELAYS_MS = [0, 300, 700, 1_500, 2_500] as const;

function resolveMac2SshTarget(config: Mac2HostConfig): string | null {
  if (config.sshAlias) return config.sshAlias;
  if (config.tailscaleHost) {
    return config.sshUser ? `${config.sshUser}@${config.tailscaleHost}` : config.tailscaleHost;
  }
  return null;
}

function isRunningVm(vm: LumeVmRecord): boolean {
  const status = (vm.status ?? "").toLowerCase();
  return status === "running";
}

function vmOsFamily(vm: LumeVmRecord): ComputerOsFamily {
  const os = (vm.os ?? "").toLowerCase();
  return os.includes("linux") || os.includes("ubuntu") ? "linux" : "macos";
}

function extractGuestIp(vm: LumeVmRecord | null | undefined): string | null {
  const ip = vm?.ipAddress ?? vm?.ip_address ?? null;
  return typeof ip === "string" && ip.trim().length > 0 ? ip.trim() : null;
}

function rewriteTailscaleVncUrl(rawUrl: string | null | undefined, config: Mac2HostConfig): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  if (!config.tailscaleHost) return rawUrl;
  return rawUrl.replace(/\/\/(127\.0\.0\.1|localhost)(?=[:/]|$)/i, `//${config.tailscaleHost}`);
}

export class Mac2LumeVmProvider implements ComputerProviderAdapter {
  readonly id = "mac2-lume-vm" as const;
  private readonly readyPollDelaysMs: readonly number[];
  private readonly guestUser: string;

  constructor(options: Mac2LumeVmProviderOptions = {}) {
    this.readyPollDelaysMs = options.readyPollDelaysMs ?? DEFAULT_READY_POLL_DELAYS_MS;
    this.guestUser = options.guestUser ?? "agent";
  }

  private async lumeRequest(
    context: ProviderContext,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<LumeApiResponse> {
    const config = context.mac2Config;

    if (config.lumeTransport === "http" && config.tailscaleHost) {
      const url = `http://${config.tailscaleHost}:${config.lumePort}${path}`;
      const response = await context.fetchImpl(url, {
        method,
        headers: payload ? { "content-type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      let body: unknown = null;
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      return { status: response.status, ok: response.ok, body };
    }

    const sshTarget = resolveMac2SshTarget(config);
    if (!sshTarget) {
      throw new AgentComputerError(
        "MISSING_CREDENTIALS",
        "Mac #2 Lume host requires either tailscaleHost or sshAlias.",
        "Run ./scripts/setup-agent-mac.sh --install --init-vm-pool on Mac #2 and configure mac2.tailscaleHost.",
      );
    }

    const url = `http://127.0.0.1:${config.lumePort}${path}`;
    const bodyArg = payload ? `-H 'content-type: application/json' -d ${shellQuote(JSON.stringify(payload))}` : "";
    const remoteCurl = `curl -sS -w '\\n__HTTP_STATUS__:%{http_code}' -X ${method} ${bodyArg} ${shellQuote(url)}`;
    const out = await context.runShell(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", sshTarget, remoteCurl],
      { timeoutMs: 35_000 },
    );
    if (out.exitCode !== 0) {
      throw new Error(out.stderr.trim() || `SSH curl to Lume exited ${out.exitCode}`);
    }
    const markerIndex = out.stdout.lastIndexOf("\n__HTTP_STATUS__:");
    const rawBody = markerIndex >= 0 ? out.stdout.slice(0, markerIndex).trim() : out.stdout.trim();
    const statusText =
      markerIndex >= 0 ? out.stdout.slice(markerIndex + "\n__HTTP_STATUS__:".length).trim() : "200";
    const status = Number.parseInt(statusText, 10) || 500;
    let body: unknown = null;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }
    return { status, ok: status >= 200 && status < 300, body };
  }

  private async listVms(context: ProviderContext): Promise<LumeVmRecord[]> {
    const res = await this.lumeRequest(context, "GET", "/lume/vms");
    if (!res.ok) {
      throw new Error(`Lume GET /lume/vms returned HTTP ${res.status}`);
    }
    if (Array.isArray(res.body)) {
      return res.body as LumeVmRecord[];
    }
    if (res.body && typeof res.body === "object" && Array.isArray((res.body as { vms?: unknown }).vms)) {
      return (res.body as { vms: LumeVmRecord[] }).vms;
    }
    return [];
  }

  private async inspectVm(context: ProviderContext, vmName: string): Promise<LumeVmRecord | null> {
    const res = await this.lumeRequest(
      context,
      "GET",
      `/lume/vms/${encodeURIComponent(vmName)}`,
    );
    if (res.status === 404) return null;
    if (!res.ok || !res.body || typeof res.body !== "object") return null;
    return res.body as LumeVmRecord;
  }

  private async cloneVm(
    context: ProviderContext,
    sourceName: string,
    newName: string,
  ): Promise<void> {
    // Support both `POST /lume/vms/clone` ({ name, newName }) and `POST /lume/vms/{name}/clone` ({ newName }).
    const primary = await this.lumeRequest(context, "POST", "/lume/vms/clone", {
      name: sourceName,
      newName,
    });
    if (primary.ok) return;
    if (primary.status === 404 || primary.status === 405) {
      const alt = await this.lumeRequest(
        context,
        "POST",
        `/lume/vms/${encodeURIComponent(sourceName)}/clone`,
        { newName },
      );
      if (alt.ok) return;
      throw new AgentComputerError(
        "PROVIDER_ERROR",
        `Lume failed to clone base VM '${sourceName}' to '${newName}' (HTTP ${alt.status}).`,
        `Run ./scripts/setup-agent-mac.sh --init-vm-pool on Mac #2 to ensure '${sourceName}' exists.`,
        502,
      );
    }
    throw new AgentComputerError(
      "PROVIDER_ERROR",
      `Lume failed to clone base VM '${sourceName}' to '${newName}' (HTTP ${primary.status}).`,
      `Verify base template '${sourceName}' exists in 'lume ls' on Mac #2.`,
      502,
    );
  }

  async checkAvailability(context: ProviderContext): Promise<ProviderAvailability> {
    const config = context.mac2Config;
    const trackedActive = context.activeLeases.filter(
      (lease) => lease.provider === this.id && lease.state === "running",
    ).length;

    if (!config.enabled) {
      return {
        provider: this.id,
        available: false,
        state: "disabled",
        reasonCode: "disabled",
        message: "Mac #2 Lume VM pool is disabled.",
        nextStep: "Enable mac2.enabled in agent-computers.json.",
        activeLeases: trackedActive,
        maxCapacity: config.maxConcurrentVms,
        supportedOs: ["macos", "linux"],
        checkedAt: context.now(),
      };
    }

    const hasEndpoint =
      (config.lumeTransport === "http" && Boolean(config.tailscaleHost)) ||
      Boolean(resolveMac2SshTarget(config));

    if (!hasEndpoint) {
      return {
        provider: this.id,
        available: false,
        state: "missing_credentials",
        reasonCode: "missing_credentials",
        message: "Mac #2 Lume hypervisor host is not configured yet.",
        nextStep:
          "Run ./scripts/setup-agent-mac.sh --install --init-vm-pool on your reset 2nd Mac and set mac2.tailscaleHost.",
        activeLeases: trackedActive,
        maxCapacity: config.maxConcurrentVms,
        supportedOs: ["macos", "linux"],
        checkedAt: context.now(),
      };
    }

    let vms: LumeVmRecord[];
    try {
      vms = await this.listVms(context);
    } catch (error) {
      return {
        provider: this.id,
        available: false,
        state: "host_offline",
        reasonCode: "host_offline",
        message: `Could not reach Lume daemon on ${config.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        nextStep:
          "Confirm Tailscale is online and LaunchAgent com.xlabs.agent-mac-host (lume serve on 127.0.0.1:7777) is active on Mac #2.",
        activeLeases: trackedActive,
        maxCapacity: config.maxConcurrentVms,
        supportedOs: ["macos", "linux"],
        checkedAt: context.now(),
      };
    }

    const runningCount = Math.max(trackedActive, vms.filter(isRunningVm).length);
    if (runningCount >= config.maxConcurrentVms) {
      return {
        provider: this.id,
        available: false,
        state: "capacity_full",
        reasonCode: "capacity_full",
        message: `${config.name} Lume VM pool is full (${runningCount}/${config.maxConcurrentVms} VMs running).`,
        nextStep: "Stop an idle VM or allow Cloud Burst fallback to Cua Cloud / Daytona.",
        activeLeases: runningCount,
        maxCapacity: config.maxConcurrentVms,
        supportedOs: ["macos", "linux"],
        checkedAt: context.now(),
      };
    }

    const hasMacBase = vms.some((vm) => vm.name === config.macosBaseImage);
    const hasLinuxBase = vms.some((vm) => vm.name === config.linuxBaseImage);
    const supportedOs: ComputerOsFamily[] = [];
    if (hasMacBase || (!hasMacBase && !hasLinuxBase)) supportedOs.push("macos");
    if (hasLinuxBase || (!hasMacBase && !hasLinuxBase)) supportedOs.push("linux");

    return {
      provider: this.id,
      available: true,
      state: "ready",
      reasonCode: "ok",
      message: `${config.name} Lume hypervisor ready (${runningCount}/${config.maxConcurrentVms} VM slots active).`,
      nextStep: null,
      activeLeases: runningCount,
      maxCapacity: config.maxConcurrentVms,
      supportedOs,
      checkedAt: context.now(),
    };
  }

  async provisionOrLease(
    request: ComputerLeaseRequest,
    context: ProviderContext,
  ): Promise<ProvisionedComputer> {
    if (request.os === "windows") {
      throw new AgentComputerError(
        "UNSUPPORTED_OS",
        "Apple Virtualization.framework (Lume) supports macOS and Linux guests only, not Windows.",
        "Route Windows computer-use sessions to cua-cloud.",
        400,
      );
    }

    const config = context.mac2Config;
    const vmName = buildAgentComputerName(request);
    const baseImage = request.os === "linux" ? config.linuxBaseImage : config.macosBaseImage;

    let vms: LumeVmRecord[];
    try {
      vms = await this.listVms(context);
    } catch (error) {
      throw new AgentComputerError(
        "HOST_OFFLINE",
        `Could not reach Lume on ${config.name}: ${error instanceof Error ? error.message : String(error)}`,
        "Verify Tailscale and com.xlabs.agent-mac-host on Mac #2, or enable Cloud Burst.",
        503,
      );
    }

    const existingVm = vms.find((vm) => vm.name === vmName);
    const otherRunningVms = vms.filter((vm) => vm.name !== vmName && isRunningVm(vm));
    const trackedOtherRunning = context.activeLeases.filter(
      (lease) =>
        lease.provider === this.id &&
        lease.state === "running" &&
        lease.instanceId !== vmName,
    );

    const effectiveRunningCount = Math.max(otherRunningVms.length, trackedOtherRunning.length);
    if (effectiveRunningCount >= config.maxConcurrentVms) {
      throw new AgentComputerError(
        "CAPACITY_FULL",
        `${config.name} is already running ${effectiveRunningCount}/${config.maxConcurrentVms} VMs.`,
        "Stop an idle VM or allow Cloud Burst fallback.",
      );
    }

    if (request.os === "macos") {
      const runningMacVms = Math.max(
        otherRunningVms.filter((vm) => vmOsFamily(vm) === "macos").length,
        trackedOtherRunning.filter((lease) => lease.os === "macos").length,
      );
      if (runningMacVms >= config.maxMacOsVms) {
        throw new AgentComputerError(
          "CAPACITY_FULL",
          `${config.name} already runs ${runningMacVms}/${config.maxMacOsVms} macOS VMs (Apple Virtualization.framework limit).`,
          "Use os='linux' on mac2-lume-vm or allow Cloud Burst to cua-cloud for additional macOS desktops.",
        );
      }
    }

    if (request.mode === "temporary") {
      if (existingVm) {
        await this.lumeRequest(
          context,
          "POST",
          `/lume/vms/${encodeURIComponent(vmName)}/stop`,
          {},
        ).catch(() => null);
        await this.lumeRequest(
          context,
          "DELETE",
          `/lume/vms/${encodeURIComponent(vmName)}`,
        ).catch(() => null);
      }
      await this.cloneVm(context, baseImage, vmName);
    } else if (!existingVm) {
      await this.cloneVm(context, baseImage, vmName);
    }

    if (request.cpuCores !== undefined || request.memoryGb !== undefined) {
      const sizing: Record<string, unknown> = {};
      if (request.cpuCores !== undefined) sizing.cpu = request.cpuCores;
      if (request.memoryGb !== undefined) sizing.memory = `${request.memoryGb}GB`;
      await this.lumeRequest(
        context,
        "PATCH",
        `/lume/vms/${encodeURIComponent(vmName)}`,
        sizing,
      ).catch(() => null);
    }

    if (!existingVm || !isRunningVm(existingVm)) {
      const started = await this.lumeRequest(
        context,
        "POST",
        `/lume/vms/${encodeURIComponent(vmName)}/run`,
        { noDisplay: true },
      );
      if (!started.ok && started.status !== 409) {
        throw new AgentComputerError(
          "PROVIDER_ERROR",
          `Lume failed to start VM '${vmName}' (HTTP ${started.status}).`,
          `Inspect 'lume get ${vmName}' on Mac #2.`,
          502,
        );
      }
    }

    let detail: LumeVmRecord | null = null;
    for (const delayMs of this.readyPollDelaysMs) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      detail = await this.inspectVm(context, vmName);
      if (detail && isRunningVm(detail) && extractGuestIp(detail)) {
        break;
      }
    }

    const guestIp = extractGuestIp(detail);
    const vncPreviewUrl = rewriteTailscaleVncUrl(
      detail?.vncUrl ?? detail?.vnc_url ?? null,
      config,
    );

    return {
      instanceId: vmName,
      instanceName: vmName,
      os: request.os,
      state: "running",
      guestIp,
      vncPreviewUrl,
      snapshotName: null,
    };
  }

  private buildGuestSshArgs(lease: ComputerLease, config: Mac2HostConfig, remoteCommand: string): string[] {
    if (!lease.guestIp) {
      throw new AgentComputerError(
        "PROVIDER_ERROR",
        `Lume VM '${lease.instanceId}' has no guest IP address yet.`,
        `Verify '${lease.instanceId}' finished booting via 'lume get ${lease.instanceId}'.`,
      );
    }
    const jumpHost = resolveMac2SshTarget(config);
    const guestTarget = `${this.guestUser}@${lease.guestIp}`;
    return [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=10",
      ...(jumpHost ? ["-J", jumpHost] : []),
      guestTarget,
      remoteCommand,
    ];
  }

  async execCommand(
    lease: ComputerLease,
    input: ExecCommandInput,
    context: ProviderContext,
  ): Promise<ExecCommandResult> {
    const startedAt = context.now();
    const sshArgs = this.buildGuestSshArgs(
      lease,
      context.mac2Config,
      buildCleanRemoteShellCommand(input.command, input.cwd),
    );
    const out = await context.runShell("ssh", sshArgs, {
      timeoutMs: input.timeoutMs ?? 60_000,
    });
    return {
      ok: out.exitCode === 0,
      exitCode: out.exitCode,
      stdout: out.stdout,
      stderr: out.stderr,
      durationMs: Math.max(0, context.now() - startedAt),
    };
  }

  async mcpEndpoint(lease: ComputerLease, context: ProviderContext): Promise<ComputerMcpEndpoint | null> {
    if (!lease.guestIp) return null;
    const jumpHost = resolveMac2SshTarget(context.mac2Config);
    return {
      kind: "stdio",
      toolSurface: "cua-driver",
      command: "ssh",
      args: [
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        ...(jumpHost ? ["-J", jumpHost] : []),
        `${this.guestUser}@${lease.guestIp}`,
        "cua-driver",
        "mcp",
      ],
      env: {
        XLABS_LUME_VM: lease.instanceId,
      },
    };
  }

  async screenshotPreview(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<ScreenshotPreview> {
    const sshArgs = this.buildGuestSshArgs(
      lease,
      context.mac2Config,
      "cua-driver call screenshot '{}'",
    );
    const out = await context.runShell("ssh", sshArgs, { timeoutMs: 15_000 });
    if (out.exitCode !== 0) {
      throw new AgentComputerError(
        "COMMAND_FAILED",
        `Lume VM '${lease.instanceId}' screenshot failed: ${out.stderr.trim() || `exit ${out.exitCode}`}`,
        "Verify cua-driver is running inside the guest VM template.",
      );
    }
    const raw = out.stdout.trim();
    let base64Data = raw;
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as { data?: string; image?: string; base64?: string };
      base64Data = parsed.data ?? parsed.image ?? parsed.base64 ?? "";
    }
    return {
      mimeType: "image/png",
      base64Data,
      vncPreviewUrl: lease.vncPreviewUrl,
      capturedAt: context.now(),
    };
  }

  async pauseOrStop(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<LeaseLifecycleResult> {
    const vmName = lease.instanceId;
    const stopped = await this.lumeRequest(
      context,
      "POST",
      `/lume/vms/${encodeURIComponent(vmName)}/stop`,
      {},
    );
    if (!stopped.ok && stopped.status !== 404 && stopped.status !== 409) {
      throw new AgentComputerError(
        "PROVIDER_ERROR",
        `Failed to stop Lume VM '${vmName}' (HTTP ${stopped.status}).`,
        `Inspect 'lume get ${vmName}' on Mac #2.`,
        502,
      );
    }

    let snapshotName: string | null = lease.snapshotName;
    if (lease.mode === "long-term" && context.mac2Config.snapshotOnLongTermStop) {
      const candidateSnap = `${vmName}-snap`;
      await this.lumeRequest(
        context,
        "DELETE",
        `/lume/vms/${encodeURIComponent(candidateSnap)}`,
      ).catch(() => null);
      const snapped = await this.lumeRequest(context, "POST", "/lume/vms/clone", {
        name: vmName,
        newName: candidateSnap,
      }).catch(() => ({ ok: false, status: 500, body: null }));
      if (snapped.ok) {
        snapshotName = candidateSnap;
      }
    }

    return {
      state: "stopped",
      snapshotName,
      detail: `Stopped persistent Lume VM '${vmName}' cleanly.`,
    };
  }

  async destroyLease(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<LeaseLifecycleResult> {
    const vmName = lease.instanceId;
    await this.lumeRequest(
      context,
      "POST",
      `/lume/vms/${encodeURIComponent(vmName)}/stop`,
      {},
    ).catch(() => null);

    const deleted = await this.lumeRequest(
      context,
      "DELETE",
      `/lume/vms/${encodeURIComponent(vmName)}`,
    );
    if (!deleted.ok && deleted.status !== 404 && deleted.status !== 410) {
      throw new AgentComputerError(
        "PROVIDER_ERROR",
        `Failed to delete Lume VM '${vmName}' (HTTP ${deleted.status}).`,
        `Run 'lume delete ${vmName} --force' on Mac #2 to reclaim disk.`,
        502,
      );
    }
    return {
      state: "destroyed",
      snapshotName: null,
      detail: `Destroyed and wiped Lume VM '${vmName}'.`,
    };
  }
}
