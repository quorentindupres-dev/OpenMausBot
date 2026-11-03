import {
  buildAgentComputerName,
  type ComputerLease,
  type ComputerLeaseRequest,
  type ComputerMcpEndpoint,
  type ProviderAvailability,
} from "../../../shared/agent-computers.ts";
import { AgentComputerError } from "../errors.ts";
import type {
  ComputerProviderAdapter,
  ExecCommandInput,
  ExecCommandResult,
  LeaseLifecycleResult,
  ProviderContext,
  ProvisionedComputer,
  ScreenshotPreview,
} from "../types.ts";

interface DaytonaSandboxRecord {
  id?: string;
  name?: string;
  state?: string;
  status?: string;
}

export interface DaytonaProviderOptions {
  maxCapacity?: number;
}

export class DaytonaProvider implements ComputerProviderAdapter {
  readonly id = "daytona" as const;
  private readonly maxCapacity: number;

  constructor(options: DaytonaProviderOptions = {}) {
    this.maxCapacity = options.maxCapacity ?? 100;
  }

  private requireApiKey(context: ProviderContext): string {
    const key = context.settings.daytonaApiKey;
    if (!key) {
      throw new AgentComputerError(
        "MISSING_CREDENTIALS",
        "DAYTONA_API_KEY is missing from runtime environment.",
        "Inject DAYTONA_API_KEY via Bitwarden Secrets Manager: keys run stable -- pnpm dev:server",
      );
    }
    return key;
  }

  private async apiJson(
    context: ProviderContext,
    method: "GET" | "POST" | "DELETE",
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const key = this.requireApiKey(context);
    const response = await context.fetchImpl(`${context.settings.daytonaApiBaseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(payload ? { "content-type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(25_000),
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
    return { ok: response.ok, status: response.status, body };
  }

  async checkAvailability(context: ProviderContext): Promise<ProviderAvailability> {
    const activeLeases = context.activeLeases.filter(
      (lease) => lease.provider === this.id && lease.state === "running",
    ).length;

    if (!context.settings.daytonaApiKey) {
      return {
        provider: this.id,
        available: false,
        state: "missing_credentials",
        reasonCode: "missing_api_key",
        message: "DAYTONA_API_KEY is not set in environment.",
        nextStep: "Inject DAYTONA_API_KEY at runtime via: keys run stable -- pnpm dev:server",
        activeLeases,
        maxCapacity: this.maxCapacity,
        supportedOs: ["linux"],
        checkedAt: context.now(),
      };
    }

    try {
      const res = await this.apiJson(context, "GET", "/sandbox");
      if (res.status === 401 || res.status === 403) {
        return {
          provider: this.id,
          available: false,
          state: "missing_credentials",
          reasonCode: "auth_rejected",
          message: "Daytona rejected DAYTONA_API_KEY (HTTP 401/403).",
          nextStep: "Rotate DAYTONA_API_KEY in Bitwarden Secrets Manager.",
          activeLeases,
          maxCapacity: this.maxCapacity,
          supportedOs: ["linux"],
          checkedAt: context.now(),
        };
      }
      if (!res.ok) {
        return {
          provider: this.id,
          available: false,
          state: "degraded",
          reasonCode: "provider_error",
          message: `Daytona status check returned HTTP ${res.status}.`,
          nextStep: "Check https://app.daytona.io status.",
          activeLeases,
          maxCapacity: this.maxCapacity,
          supportedOs: ["linux"],
          checkedAt: context.now(),
        };
      }
      return {
        provider: this.id,
        available: activeLeases < this.maxCapacity,
        state: activeLeases < this.maxCapacity ? "ready" : "capacity_full",
        reasonCode: activeLeases < this.maxCapacity ? "ok" : "capacity_full",
        message: "Daytona sub-second Linux sandboxes ready (~$0.05/vCPU-hr).",
        nextStep: null,
        activeLeases,
        maxCapacity: this.maxCapacity,
        supportedOs: ["linux"],
        checkedAt: context.now(),
      };
    } catch (error) {
      return {
        provider: this.id,
        available: false,
        state: "host_offline",
        reasonCode: "host_offline",
        message: `Could not reach Daytona API: ${error instanceof Error ? error.message : String(error)}`,
        nextStep: "Check network connectivity to app.daytona.io.",
        activeLeases,
        maxCapacity: this.maxCapacity,
        supportedOs: ["linux"],
        checkedAt: context.now(),
      };
    }
  }

  private extractSandboxes(raw: unknown): DaytonaSandboxRecord[] {
    if (Array.isArray(raw)) return raw as DaytonaSandboxRecord[];
    if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
      return (raw as { items: DaytonaSandboxRecord[] }).items;
    }
    return [];
  }

  async provisionOrLease(
    request: ComputerLeaseRequest,
    context: ProviderContext,
  ): Promise<ProvisionedComputer> {
    if (request.os !== "linux") {
      throw new AgentComputerError(
        "UNSUPPORTED_OS",
        `Daytona supports Linux sandboxes only, cannot satisfy OS '${request.os}'.`,
        "Use mac2-lume-vm or cua-cloud for macOS/Windows.",
        400,
      );
    }

    this.requireApiKey(context);
    const sandboxName = buildAgentComputerName(request);

    if (request.mode === "long-term") {
      const listed = await this.apiJson(context, "GET", "/sandbox");
      if (listed.ok) {
        const existing = this.extractSandboxes(listed.body).find(
          (item) => item.name === sandboxName && typeof item.id === "string",
        );
        if (existing && existing.id) {
          const state = (existing.state ?? existing.status ?? "").toLowerCase();
          if (state !== "started" && state !== "running") {
            const started = await this.apiJson(
              context,
              "POST",
              `/sandbox/${encodeURIComponent(existing.id)}/start`,
              {},
            );
            if (!started.ok && started.status !== 409) {
              throw new AgentComputerError(
                "PROVIDER_ERROR",
                `Failed to start Daytona sandbox '${sandboxName}' (HTTP ${started.status}).`,
                "Inspect sandbox state in Daytona dashboard.",
                502,
              );
            }
          }
          return {
            instanceId: existing.id,
            instanceName: sandboxName,
            os: "linux",
            state: "running",
          };
        }
      }
    }

    const created = await this.apiJson(context, "POST", "/sandbox", {
      name: sandboxName,
      snapshot: "default",
      cpu: request.cpuCores ?? 2,
      memory: request.memoryGb ?? 4,
      disk: 10,
      ephemeral: request.mode === "temporary",
      autoStopInterval: request.mode === "long-term" ? 30 : 15,
      labels: {
        "xlabs.mode": request.mode,
        "xlabs.agent": request.agentId,
      },
    });
    if (!created.ok || !created.body || typeof created.body !== "object") {
      throw new AgentComputerError(
        created.status === 401 || created.status === 403 ? "MISSING_CREDENTIALS" : "PROVIDER_ERROR",
        `Daytona failed to create sandbox '${sandboxName}' (HTTP ${created.status}).`,
        "Verify DAYTONA_API_KEY and organization sandbox limits.",
        created.status >= 400 && created.status < 600 ? created.status : 502,
      );
    }

    const record = created.body as DaytonaSandboxRecord;
    return {
      instanceId: record.id ?? sandboxName,
      instanceName: record.name ?? sandboxName,
      os: "linux",
      state: "running",
    };
  }

  async execCommand(
    lease: ComputerLease,
    input: ExecCommandInput,
    context: ProviderContext,
  ): Promise<ExecCommandResult> {
    const startedAt = context.now();
    const id = encodeURIComponent(lease.instanceId);
    const payload = {
      command: input.command,
      ...(input.cwd ? { cwd: input.cwd } : {}),
      timeout: Math.ceil((input.timeoutMs ?? 60_000) / 1000),
    };

    let res = await this.apiJson(context, "POST", `/sandbox/${id}/toolbox/process/execute`, payload);
    if (res.status === 404) {
      res = await this.apiJson(context, "POST", `/sandbox/${id}/process/execute`, payload);
    }
    if (!res.ok) {
      throw new AgentComputerError(
        "COMMAND_FAILED",
        `Daytona command execution failed on '${lease.instanceId}' (HTTP ${res.status}).`,
        "Verify the Daytona sandbox is in 'started' state.",
      );
    }

    const body = (res.body && typeof res.body === "object" ? res.body : {}) as {
      exitCode?: number;
      code?: number;
      result?: string;
      stdout?: string;
      stderr?: string;
    };
    const exitCode =
      typeof body.exitCode === "number"
        ? body.exitCode
        : typeof body.code === "number"
          ? body.code
          : 0;

    return {
      ok: exitCode === 0,
      exitCode,
      stdout: body.stdout ?? body.result ?? "",
      stderr: body.stderr ?? "",
      durationMs: Math.max(0, context.now() - startedAt),
    };
  }

  async mcpEndpoint(lease: ComputerLease, context: ProviderContext): Promise<ComputerMcpEndpoint | null> {
    const key = context.settings.daytonaApiKey;
    if (!key) return null;
    return {
      kind: "rest-bridge",
      toolSurface: "daytona-exec",
      url: `${context.settings.daytonaApiBaseUrl}/sandbox/${encodeURIComponent(lease.instanceId)}`,
      headers: {
        authorization: `Bearer ${key}`,
      },
      env: {
        DAYTONA_SANDBOX_ID: lease.instanceId,
      },
    };
  }

  async screenshotPreview(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<ScreenshotPreview> {
    const capture = await this.execCommand(
      lease,
      {
        command:
          "if command -v import >/dev/null 2>&1 && [ -n \"${DISPLAY:-}\" ]; then import -window root png:- | base64 | tr -d '\\n'; else exit 2; fi",
        timeoutMs: 10_000,
      },
      context,
    );
    if (!capture.ok || !capture.stdout.trim()) {
      throw new AgentComputerError(
        "COMMAND_FAILED",
        `Daytona sandbox '${lease.instanceId}' has no active X11 GUI display for screenshots.`,
        "Use orgo, cua-cloud, or mac2-lume-vm when full GUI desktop screenshots are required.",
      );
    }
    return {
      mimeType: "image/png",
      base64Data: capture.stdout.trim(),
      vncPreviewUrl: null,
      capturedAt: context.now(),
    };
  }

  async pauseOrStop(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<LeaseLifecycleResult> {
    const res = await this.apiJson(
      context,
      "POST",
      `/sandbox/${encodeURIComponent(lease.instanceId)}/stop`,
      {},
    );
    if (!res.ok && res.status !== 404 && res.status !== 409) {
      throw new AgentComputerError(
        "PROVIDER_ERROR",
        `Failed to stop Daytona sandbox '${lease.instanceId}' (HTTP ${res.status}).`,
        "Inspect sandbox status in Daytona dashboard.",
        502,
      );
    }
    return {
      state: "stopped",
      detail: `Stopped Daytona sandbox '${lease.instanceId}'.`,
    };
  }

  async destroyLease(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<LeaseLifecycleResult> {
    const res = await this.apiJson(
      context,
      "DELETE",
      `/sandbox/${encodeURIComponent(lease.instanceId)}`,
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new AgentComputerError(
        "PROVIDER_ERROR",
        `Failed to delete Daytona sandbox '${lease.instanceId}' (HTTP ${res.status}).`,
        "Delete the sandbox manually in Daytona dashboard.",
        502,
      );
    }
    return {
      state: "destroyed",
      detail: `Deleted Daytona sandbox '${lease.instanceId}'.`,
    };
  }
}
