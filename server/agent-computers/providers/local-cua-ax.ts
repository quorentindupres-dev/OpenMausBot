import type {
  ComputerLease,
  ComputerLeaseRequest,
  ComputerMcpEndpoint,
  ComputerOsFamily,
  ProviderAvailability,
} from "../../../shared/agent-computers.ts";
import { desktopComputer, thisComputerNotReady, type DesktopComputer } from "../../desktop-computer.ts";
import { AgentComputerError } from "../errors.ts";
import {
  buildCleanRemoteShellCommand,
  type ComputerProviderAdapter,
  type ExecCommandInput,
  type ExecCommandResult,
  type LeaseLifecycleResult,
  type ProviderContext,
  type ProvisionedComputer,
  type ScreenshotPreview,
} from "../types.ts";

export interface LocalCuaAxProviderOptions {
  desktop?: DesktopComputer;
  platform?: NodeJS.Platform;
  maxCapacity?: number;
}

function platformToOs(platform: NodeJS.Platform): ComputerOsFamily {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  return "linux";
}

function extractSocketPath(args: readonly string[]): string | null {
  const index = args.indexOf("--socket");
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1] ?? null;
  }
  return null;
}

export class LocalCuaAxProvider implements ComputerProviderAdapter {
  readonly id = "local-cua-ax" as const;
  private readonly desktop: DesktopComputer;
  private readonly platform: NodeJS.Platform;
  private readonly maxCapacity: number;

  constructor(options: LocalCuaAxProviderOptions = {}) {
    this.desktop = options.desktop ?? desktopComputer;
    this.platform = options.platform ?? process.platform;
    this.maxCapacity = options.maxCapacity ?? 4;
  }

  async checkAvailability(context: ProviderContext): Promise<ProviderAvailability> {
    const hostOs = platformToOs(this.platform);
    const activeLeases = context.activeLeases.filter(
      (lease) => lease.provider === this.id && lease.state === "running",
    ).length;

    const granted = this.desktop.granted();
    const connection = granted ? this.desktop.connection() : null;
    if (!granted || !connection) {
      return {
        provider: this.id,
        available: false,
        state: "host_offline",
        reasonCode: "desktop_not_granted",
        message: thisComputerNotReady(this.desktop, this.platform),
        nextStep:
          "Open the OpenMausBot desktop app on this Mac and grant Accessibility + Screen Recording in System Settings → Privacy & Security.",
        activeLeases,
        maxCapacity: this.maxCapacity,
        supportedOs: [hostOs],
        checkedAt: context.now(),
      };
    }

    if (activeLeases >= this.maxCapacity) {
      return {
        provider: this.id,
        available: false,
        state: "capacity_full",
        reasonCode: "capacity_full",
        message: `Local Cua AX driver is at capacity (${activeLeases}/${this.maxCapacity} active agents).`,
        nextStep: "Route additional concurrent agents to mac2-lume-vm or allow Cloud Burst.",
        activeLeases,
        maxCapacity: this.maxCapacity,
        supportedOs: [hostOs],
        checkedAt: context.now(),
      };
    }

    return {
      provider: this.id,
      available: true,
      state: "ready",
      reasonCode: "ok",
      message: "Local Cua AX background driver is ready on this computer.",
      nextStep: null,
      activeLeases,
      maxCapacity: this.maxCapacity,
      supportedOs: [hostOs],
      checkedAt: context.now(),
    };
  }

  async provisionOrLease(
    request: ComputerLeaseRequest,
    context: ProviderContext,
  ): Promise<ProvisionedComputer> {
    const hostOs = platformToOs(this.platform);
    if (request.os !== hostOs) {
      throw new AgentComputerError(
        "UNSUPPORTED_OS",
        `Local Cua AX runs on ${hostOs}, cannot satisfy requested OS ${request.os}.`,
        "Use mac2-lume-vm for macOS/Linux VMs or cua-cloud for Windows.",
        400,
      );
    }
    const availability = await this.checkAvailability(context);
    if (!availability.available) {
      throw new AgentComputerError(
        availability.state === "capacity_full" ? "CAPACITY_FULL" : "HOST_OFFLINE",
        availability.message,
        availability.nextStep ?? "Open OpenMausBot desktop on this Mac.",
      );
    }
    return {
      instanceId: "local-cua-ax-host",
      instanceName: "This Mac (Background AX)",
      os: hostOs,
      state: "running",
      guestIp: "127.0.0.1",
      vncPreviewUrl: null,
    };
  }

  async execCommand(
    _lease: ComputerLease,
    input: ExecCommandInput,
    context: ProviderContext,
  ): Promise<ExecCommandResult> {
    const startedAt = context.now();
    const wrapped = buildCleanRemoteShellCommand(input.command, input.cwd);
    const out = await context.runShell("/bin/sh", ["-c", wrapped], {
      timeoutMs: input.timeoutMs,
    });
    return {
      ok: out.exitCode === 0,
      exitCode: out.exitCode,
      stdout: out.stdout,
      stderr: out.stderr,
      durationMs: Math.max(0, context.now() - startedAt),
    };
  }

  async mcpEndpoint(_lease: ComputerLease, _context: ProviderContext): Promise<ComputerMcpEndpoint | null> {
    const connection = this.desktop.connection();
    if (!connection) return null;
    return {
      kind: "stdio",
      toolSurface: "cua-driver",
      command: connection.command,
      args: [...connection.args],
      env: { ...connection.env },
    };
  }

  async screenshotPreview(
    _lease: ComputerLease,
    context: ProviderContext,
  ): Promise<ScreenshotPreview> {
    const connection = this.desktop.connection();
    if (!connection) {
      throw new AgentComputerError(
        "HOST_OFFLINE",
        "Local Cua Driver socket is not connected.",
        "Open OpenMausBot desktop and verify Accessibility + Screen Recording permissions.",
      );
    }
    const socketPath = extractSocketPath(connection.args);
    const callArgs = [
      "call",
      "screenshot",
      "{}",
      ...(socketPath ? ["--socket", socketPath] : []),
    ];
    const out = await context.runShell(connection.command, callArgs, {
      timeoutMs: 15_000,
      env: connection.env,
    });
    if (out.exitCode !== 0) {
      throw new AgentComputerError(
        "COMMAND_FAILED",
        `Local Cua screenshot failed: ${out.stderr.trim() || `exit ${out.exitCode}`}`,
        "Check Screen Recording permission for OpenMausBot in System Settings.",
      );
    }
    const raw = out.stdout.trim();
    let base64Data = raw;
    let mimeType: "image/png" | "image/jpeg" = "image/png";
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as {
        data?: string;
        image?: string;
        base64?: string;
        mimeType?: string;
      };
      base64Data = parsed.data ?? parsed.image ?? parsed.base64 ?? "";
      if (parsed.mimeType === "image/jpeg") mimeType = "image/jpeg";
    }
    return {
      mimeType,
      base64Data,
      vncPreviewUrl: null,
      capturedAt: context.now(),
    };
  }

  async pauseOrStop(_lease: ComputerLease, _context: ProviderContext): Promise<LeaseLifecycleResult> {
    return {
      state: "stopped",
      detail: "Detached agent session from local embedded Cua AX host.",
    };
  }

  async destroyLease(_lease: ComputerLease, _context: ProviderContext): Promise<LeaseLifecycleResult> {
    return {
      state: "destroyed",
      detail: "Released local embedded Cua AX lease.",
    };
  }
}
