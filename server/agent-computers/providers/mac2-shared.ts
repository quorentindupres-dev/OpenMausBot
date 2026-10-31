import type {
  ComputerLease,
  ComputerLeaseRequest,
  ComputerMcpEndpoint,
  Mac2HostConfig,
  ProviderAvailability,
} from "../../../shared/agent-computers.ts";
import type { SharedComputers } from "../../shared-computers.ts";
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

export interface Mac2SharedProviderOptions {
  sharedComputers?: SharedComputers;
}

const REMOTE_CUA_DRIVER_RESOLVER =
  'for b in /usr/local/bin/cua-driver "$HOME/.local/bin/cua-driver" /Applications/CuaDriver.app/Contents/MacOS/cua-driver; do if [ -x "$b" ]; then CUA_BIN="$b"; break; fi; done; if [ -z "${CUA_BIN:-}" ]; then echo "cua-driver not found on Mac #2" >&2; exit 127; fi';

function resolveSshTarget(config: Mac2HostConfig): string | null {
  if (config.sshAlias) return config.sshAlias;
  if (config.tailscaleHost) {
    return config.sshUser ? `${config.sshUser}@${config.tailscaleHost}` : config.tailscaleHost;
  }
  return null;
}

export class Mac2SharedProvider implements ComputerProviderAdapter {
  readonly id = "mac2-shared" as const;
  private readonly sharedComputers: SharedComputers | undefined;

  constructor(options: Mac2SharedProviderOptions = {}) {
    this.sharedComputers = options.sharedComputers;
  }

  async checkAvailability(context: ProviderContext): Promise<ProviderAvailability> {
    const config = context.mac2Config;
    const activeLeases = context.activeLeases.filter(
      (lease) => lease.provider === this.id && lease.state === "running",
    ).length;

    if (!config.enabled) {
      return {
        provider: this.id,
        available: false,
        state: "disabled",
        reasonCode: "disabled",
        message: "Secondary Mac host is disabled in configuration.",
        nextStep: "Enable mac2.enabled in agent-computers.json.",
        activeLeases,
        maxCapacity: 1,
        supportedOs: ["macos"],
        checkedAt: context.now(),
      };
    }

    const hasSharedBinding = Boolean(
      this.sharedComputers && config.sharedComputerId && config.sharedOwnerPerson,
    );
    const sshTarget = resolveSshTarget(config);

    if (!hasSharedBinding && !sshTarget) {
      return {
        provider: this.id,
        available: false,
        state: "missing_credentials",
        reasonCode: "missing_credentials",
        message: "Secondary Mac direct host has no paired SharedComputers ID or Tailscale SSH host.",
        nextStep:
          "Run ./scripts/setup-agent-mac.sh --install --pair-url <url> on the 2nd Mac or set mac2.tailscaleHost.",
        activeLeases,
        maxCapacity: 1,
        supportedOs: ["macos"],
        checkedAt: context.now(),
      };
    }

    if (hasSharedBinding && this.sharedComputers && config.sharedOwnerPerson && config.sharedComputerId) {
      const entry = this.sharedComputers
        .status(config.sharedOwnerPerson)
        .find((item) => item.id === config.sharedComputerId);

      if (entry?.online) {
        if (entry.busy || activeLeases >= 1) {
          return {
            provider: this.id,
            available: false,
            state: "capacity_full",
            reasonCode: "capacity_full",
            message: `${entry.name} is busy on its single bare-metal cursor.`,
            nextStep: "Use mac2-lume-vm to run 2–4 isolated agents concurrently on Mac #2.",
            activeLeases: Math.max(activeLeases, 1),
            maxCapacity: 1,
            supportedOs: ["macos"],
            checkedAt: context.now(),
          };
        }
        return {
          provider: this.id,
          available: true,
          state: "ready",
          reasonCode: "ok",
          message: `${entry.name} is paired and online via OpenMausBot SharedComputers.`,
          nextStep: null,
          activeLeases,
          maxCapacity: 1,
          supportedOs: ["macos"],
          checkedAt: context.now(),
        };
      }
    }

    if (sshTarget) {
      try {
        const probe = await context.runShell(
          "ssh",
          ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", sshTarget, "uname -s"],
          { timeoutMs: 7_000 },
        );
        if (probe.exitCode === 0 && probe.stdout.trim() === "Darwin") {
          if (activeLeases >= 1) {
            return {
              provider: this.id,
              available: false,
              state: "capacity_full",
              reasonCode: "capacity_full",
              message: `${config.name} direct screen is already leased by an active agent.`,
              nextStep: "Use mac2-lume-vm for concurrent isolated VMs on the same 2nd Mac.",
              activeLeases,
              maxCapacity: 1,
              supportedOs: ["macos"],
              checkedAt: context.now(),
            };
          }
          return {
            provider: this.id,
            available: true,
            state: "ready",
            reasonCode: "ok",
            message: `${config.name} is online over Tailscale SSH (${sshTarget}).`,
            nextStep: null,
            activeLeases,
            maxCapacity: 1,
            supportedOs: ["macos"],
            checkedAt: context.now(),
          };
        }
      } catch {
        // Handled below as host_offline.
      }
    }

    return {
      provider: this.id,
      available: false,
      state: "host_offline",
      reasonCode: "host_offline",
      message: `${config.name} is offline or unreachable over SharedComputers / Tailscale.`,
      nextStep:
        "Ensure the 2nd Mac is powered on AC, connected to Tailscale, and running LaunchAgent com.xlabs.agent-mac-host.",
      activeLeases,
      maxCapacity: 1,
      supportedOs: ["macos"],
      checkedAt: context.now(),
    };
  }

  async provisionOrLease(
    request: ComputerLeaseRequest,
    context: ProviderContext,
  ): Promise<ProvisionedComputer> {
    if (request.os !== "macos") {
      throw new AgentComputerError(
        "UNSUPPORTED_OS",
        `mac2-shared runs bare-metal macOS, cannot satisfy OS ${request.os}.`,
        "Use mac2-lume-vm with os='linux' for Ubuntu on Mac #2, or cua-cloud for Windows.",
        400,
      );
    }
    const availability = await this.checkAvailability(context);
    if (!availability.available) {
      throw new AgentComputerError(
        availability.state === "capacity_full"
          ? "CAPACITY_FULL"
          : availability.state === "missing_credentials"
            ? "MISSING_CREDENTIALS"
            : "HOST_OFFLINE",
        availability.message,
        availability.nextStep ?? "Configure Mac #2 host connection.",
      );
    }
    const config = context.mac2Config;
    return {
      instanceId: config.sharedComputerId ?? resolveSshTarget(config) ?? "mac2-host",
      instanceName: config.name,
      os: "macos",
      state: "running",
      guestIp: config.tailscaleHost ?? null,
      vncPreviewUrl: config.tailscaleHost ? `vnc://${config.tailscaleHost}:5900` : null,
    };
  }

  async execCommand(
    _lease: ComputerLease,
    input: ExecCommandInput,
    context: ProviderContext,
  ): Promise<ExecCommandResult> {
    const startedAt = context.now();
    const config = context.mac2Config;

    if (this.sharedComputers && config.sharedComputerId && config.sharedOwnerPerson) {
      const status = this.sharedComputers
        .status(config.sharedOwnerPerson)
        .find((item) => item.id === config.sharedComputerId);
      if (status?.online && status.scopes.terminal) {
        const timeoutSeconds = Math.min(
          240,
          Math.max(1, Math.ceil((input.timeoutMs ?? 60_000) / 1000)),
        );
        const raw = (await this.sharedComputers.request(
          {
            computer_id: config.sharedComputerId,
            action: "run_command",
            command: input.cwd
              ? `cd '${input.cwd.replace(/'/g, "'\\''")}' && ${input.command}`
              : input.command,
            timeout_seconds: timeoutSeconds,
          },
          config.sharedOwnerPerson,
          () => true,
        )) as { exitCode?: number; stdout?: string; stderr?: string } | null;

        const exitCode = typeof raw?.exitCode === "number" ? raw.exitCode : 0;
        return {
          ok: exitCode === 0,
          exitCode,
          stdout: typeof raw?.stdout === "string" ? raw.stdout : "",
          stderr: typeof raw?.stderr === "string" ? raw.stderr : "",
          durationMs: Math.max(0, context.now() - startedAt),
        };
      }
    }

    const sshTarget = resolveSshTarget(config);
    if (!sshTarget) {
      throw new AgentComputerError(
        "HOST_OFFLINE",
        "No online SharedComputers terminal or SSH target available for Mac #2.",
        "Verify Tailscale SSH or OpenMausBot pairing on Mac #2.",
      );
    }

    const out = await context.runShell(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        sshTarget,
        buildCleanRemoteShellCommand(input.command, input.cwd),
      ],
      { timeoutMs: input.timeoutMs ?? 60_000 },
    );
    return {
      ok: out.exitCode === 0,
      exitCode: out.exitCode,
      stdout: out.stdout,
      stderr: out.stderr,
      durationMs: Math.max(0, context.now() - startedAt),
    };
  }

  async mcpEndpoint(_lease: ComputerLease, context: ProviderContext): Promise<ComputerMcpEndpoint | null> {
    const config = context.mac2Config;
    const sshTarget = resolveSshTarget(config);
    if (sshTarget) {
      return {
        kind: "stdio",
        toolSurface: "cua-driver",
        command: "ssh",
        args: [
          "-o",
          "BatchMode=yes",
          sshTarget,
          `${REMOTE_CUA_DRIVER_RESOLVER}; exec "$CUA_BIN" mcp`,
        ],
      };
    }
    if (config.sharedComputerId) {
      return {
        kind: "rest-bridge",
        toolSurface: "shared-computer",
        env: { OMB_SHARED_COMPUTER_ID: config.sharedComputerId },
      };
    }
    return null;
  }

  async screenshotPreview(
    _lease: ComputerLease,
    context: ProviderContext,
  ): Promise<ScreenshotPreview> {
    const config = context.mac2Config;
    if (this.sharedComputers && config.sharedComputerId && config.sharedOwnerPerson) {
      const status = this.sharedComputers
        .status(config.sharedOwnerPerson)
        .find((item) => item.id === config.sharedComputerId);
      if (status?.online && status.scopes.screen) {
        const result = (await this.sharedComputers.request(
          {
            computer_id: config.sharedComputerId,
            action: "computer_call",
            tool_name: "screenshot",
            arguments: {},
          },
          config.sharedOwnerPerson,
          () => true,
        )) as { data?: string; image?: string } | null;
        return {
          mimeType: "image/png",
          base64Data: result?.data ?? result?.image ?? "",
          vncPreviewUrl: config.tailscaleHost ? `vnc://${config.tailscaleHost}:5900` : null,
          capturedAt: context.now(),
        };
      }
    }

    const sshTarget = resolveSshTarget(config);
    if (!sshTarget) {
      throw new AgentComputerError(
        "HOST_OFFLINE",
        "Cannot capture screenshot on Mac #2: neither screen lending nor SSH is reachable.",
        "Open OpenMausBot on Mac #2 or enable Tailscale SSH.",
      );
    }
    const out = await context.runShell(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        sshTarget,
        `${REMOTE_CUA_DRIVER_RESOLVER}; exec "$CUA_BIN" call get_desktop_state '{}'`,
      ],
      { timeoutMs: 15_000 },
    );
    if (out.exitCode !== 0) {
      throw new AgentComputerError(
        "COMMAND_FAILED",
        `Mac #2 screenshot failed: ${out.stderr.trim() || `exit ${out.exitCode}`}`,
        "Verify Screen Recording permission for cua-driver on Mac #2.",
      );
    }
    return {
      mimeType: "image/png",
      base64Data: out.stdout.trim(),
      vncPreviewUrl: config.tailscaleHost ? `vnc://${config.tailscaleHost}:5900` : null,
      capturedAt: context.now(),
    };
  }

  async pauseOrStop(_lease: ComputerLease, _context: ProviderContext): Promise<LeaseLifecycleResult> {
    return {
      state: "stopped",
      detail: "Released direct host lease on Mac #2 (host remains online).",
    };
  }

  async destroyLease(_lease: ComputerLease, _context: ProviderContext): Promise<LeaseLifecycleResult> {
    return {
      state: "destroyed",
      detail: "Released direct host lease on Mac #2.",
    };
  }
}
