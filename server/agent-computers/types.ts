import { execFile } from "node:child_process";
import type {
  AgentComputerProviderId,
  CloudBurstPolicy,
  ComputerLease,
  ComputerLeaseRequest,
  ComputerLeaseState,
  ComputerMcpEndpoint,
  ComputerOsFamily,
  Mac2HostConfig,
  ProviderAvailability,
} from "../../shared/agent-computers.ts";
import type { AgentComputerRuntimeSettings } from "./settings.ts";

export interface ShellCommandOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
  input?: string;
}

export interface ShellCommandOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ShellCommandRunner = (
  command: string,
  args: readonly string[],
  options?: ShellCommandOptions,
) => Promise<ShellCommandOutput>;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface ProviderContext {
  readonly settings: AgentComputerRuntimeSettings;
  readonly mac2Config: Mac2HostConfig;
  readonly burstPolicy: CloudBurstPolicy;
  readonly activeLeases: readonly ComputerLease[];
  readonly fetchImpl: FetchLike;
  readonly runShell: ShellCommandRunner;
  readonly now: () => number;
}

export interface ProvisionedComputer {
  instanceId: string;
  instanceName: string;
  os: ComputerOsFamily;
  state: ComputerLeaseState;
  guestIp?: string | null;
  vncPreviewUrl?: string | null;
  snapshotName?: string | null;
}

export interface ExecCommandInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface ExecCommandResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ScreenshotPreview {
  mimeType: "image/png" | "image/jpeg";
  base64Data: string;
  width?: number;
  height?: number;
  vncPreviewUrl?: string | null;
  capturedAt: number;
}

export interface LeaseLifecycleResult {
  state: ComputerLeaseState;
  snapshotName?: string | null;
  detail?: string;
}

/** Uniform contract implemented by local AX, 2nd Mac direct/Lume VM, Cua Cloud, Daytona, and Orgo providers. */
export interface ComputerProviderAdapter {
  readonly id: AgentComputerProviderId;
  checkAvailability(context: ProviderContext): Promise<ProviderAvailability>;
  provisionOrLease(request: ComputerLeaseRequest, context: ProviderContext): Promise<ProvisionedComputer>;
  execCommand(lease: ComputerLease, input: ExecCommandInput, context: ProviderContext): Promise<ExecCommandResult>;
  mcpEndpoint(lease: ComputerLease, context: ProviderContext): Promise<ComputerMcpEndpoint | null>;
  screenshotPreview(lease: ComputerLease, context: ProviderContext): Promise<ScreenshotPreview>;
  pauseOrStop(lease: ComputerLease, context: ProviderContext): Promise<LeaseLifecycleResult>;
  destroyLease(lease: ComputerLease, context: ProviderContext): Promise<LeaseLifecycleResult>;
}

/** Single-quotes an arbitrary shell string safely for `sh -c` or remote SSH invocation. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Wraps a remote command in a clean minimal environment so host daemon tokens never leak into guest processes. */
export function buildCleanRemoteShellCommand(command: string, cwd?: string): string {
  const body = cwd ? `cd ${shellQuote(cwd)} && ${command}` : command;
  return [
    "env -i",
    'HOME="${HOME:-/tmp}"',
    'USER="${USER:-agent}"',
    'PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"',
    'LANG="en_US.UTF-8"',
    "/bin/sh -c",
    shellQuote(body),
  ].join(" ");
}

const DEFAULT_SHELL_TIMEOUT_MS = 60_000;
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;

export const defaultShellRunner: ShellCommandRunner = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      command,
      [...args],
      {
        timeout: options.timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER_BYTES,
        env: options.env
          ? { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", ...options.env }
          : { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp" },
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ exitCode: 0, stdout: String(stdout), stderr: String(stderr) });
          return;
        }
        const coded = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null };
        if (typeof coded.code === "number") {
          resolve({ exitCode: coded.code, stdout: String(stdout), stderr: String(stderr) });
          return;
        }
        reject(error);
      },
    );
    if (options.input !== undefined && child.stdin) {
      child.stdin.end(options.input);
    }
  });
