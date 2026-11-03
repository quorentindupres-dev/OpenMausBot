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

interface CuaCloudSpaceRecord {
  id?: string;
  name?: string;
  status?: string;
  state?: string;
  os?: string;
  ip?: string | null;
  vncUrl?: string | null;
  streamUrl?: string | null;
}

export interface CuaCloudProviderOptions {
  maxCapacity?: number;
}

export class CuaCloudProvider implements ComputerProviderAdapter {
  readonly id = "cua-cloud" as const;
  private readonly maxCapacity: number;

  constructor(options: CuaCloudProviderOptions = {}) {
    this.maxCapacity = options.maxCapacity ?? 50;
  }

  private requireApiKey(context: ProviderContext): string {
    const key = context.settings.cuaApiKey;
    if (!key) {
      throw new AgentComputerError(
        "MISSING_CREDENTIALS",
        "CUA_API_KEY is missing from runtime environment.",
        "Inject CUA_API_KEY via Bitwarden Secrets Manager: keys run stable -- pnpm dev:server",
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
    const response = await context.fetchImpl(`${context.settings.cuaApiBaseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(payload ? { "content-type": "application/json" } : {}),
      },
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
    return { ok: response.ok, status: response.status, body };
  }

  async checkAvailability(context: ProviderContext): Promise<ProviderAvailability> {
    const activeLeases = context.activeLeases.filter(
      (lease) => lease.provider === this.id && lease.state === "running",
    ).length;

    if (!context.settings.cuaApiKey) {
      return {
        provider: this.id,
        available: false,
        state: "missing_credentials",
        reasonCode: "missing_api_key",
        message: "CUA_API_KEY is not set in environment.",
        nextStep: "Inject CUA_API_KEY at runtime via: keys run stable -- pnpm dev:server",
        activeLeases,
        maxCapacity: this.maxCapacity,
        supportedOs: ["macos", "linux", "windows"],
        checkedAt: context.now(),
      };
    }

    try {
      const res = await this.apiJson(context, "GET", "/spaces");
      if (res.status === 401 || res.status === 403) {
        return {
          provider: this.id,
          available: false,
          state: "missing_credentials",
          reasonCode: "auth_rejected",
          message: "Cua Cloud rejected CUA_API_KEY (HTTP 401/403).",
          nextStep: "Verify or rotate CUA_API_KEY in Bitwarden Secrets Manager.",
          activeLeases,
          maxCapacity: this.maxCapacity,
          supportedOs: ["macos", "linux", "windows"],
          checkedAt: context.now(),
        };
      }
      if (!res.ok) {
        return {
          provider: this.id,
          available: false,
          state: "degraded",
          reasonCode: "provider_error",
          message: `Cua Cloud status check returned HTTP ${res.status}.`,
          nextStep: "Check https://cua.ai service status or CUA_API_URL.",
          activeLeases,
          maxCapacity: this.maxCapacity,
          supportedOs: ["macos", "linux", "windows"],
          checkedAt: context.now(),
        };
      }
      return {
        provider: this.id,
        available: activeLeases < this.maxCapacity,
        state: activeLeases < this.maxCapacity ? "ready" : "capacity_full",
        reasonCode: activeLeases < this.maxCapacity ? "ok" : "capacity_full",
        message: "Cua.ai Cloud Spaces ready (macOS, Linux, Windows).",
        nextStep: null,
        activeLeases,
        maxCapacity: this.maxCapacity,
        supportedOs: ["macos", "linux", "windows"],
        checkedAt: context.now(),
      };
    } catch (error) {
      return {
        provider: this.id,
        available: false,
        state: "host_offline",
        reasonCode: "host_offline",
        message: `Could not reach Cua Cloud API: ${error instanceof Error ? error.message : String(error)}`,
        nextStep: "Check network connectivity to api.cua.ai.",
        activeLeases,
        maxCapacity: this.maxCapacity,
        supportedOs: ["macos", "linux", "windows"],
        checkedAt: context.now(),
      };
    }
  }

  private extractSpaces(raw: unknown): CuaCloudSpaceRecord[] {
    if (Array.isArray(raw)) return raw as CuaCloudSpaceRecord[];
    if (raw && typeof raw === "object" && Array.isArray((raw as { spaces?: unknown }).spaces)) {
      return (raw as { spaces: CuaCloudSpaceRecord[] }).spaces;
    }
    return [];
  }

  async provisionOrLease(
    request: ComputerLeaseRequest,
    context: ProviderContext,
  ): Promise<ProvisionedComputer> {
    this.requireApiKey(context);
    const spaceName = buildAgentComputerName(request);

    if (request.mode === "long-term") {
      const listed = await this.apiJson(context, "GET", "/spaces");
      if (listed.ok) {
        const existing = this.extractSpaces(listed.body).find(
          (item) => item.name === spaceName && typeof item.id === "string",
        );
        if (existing && existing.id) {
          const currentState = (existing.status ?? existing.state ?? "").toLowerCase();
          if (currentState !== "running" && currentState !== "ready") {
            const started = await this.apiJson(
              context,
              "POST",
              `/spaces/${encodeURIComponent(existing.id)}/start`,
              {},
            );
            if (!started.ok && started.status !== 409) {
              throw new AgentComputerError(
                "PROVIDER_ERROR",
                `Failed to wake Cua Cloud Space '${spaceName}' (HTTP ${started.status}).`,
                "Check Space status in Cua Cloud console.",
                502,
              );
            }
          }
          return {
            instanceId: existing.id,
            instanceName: spaceName,
            os: request.os,
            state: "running",
            guestIp: existing.ip ?? null,
            vncPreviewUrl: existing.vncUrl ?? existing.streamUrl ?? null,
          };
        }
      }
    }

    const created = await this.apiJson(context, "POST", "/spaces", {
      name: spaceName,
      os: request.os,
      persistent: request.mode === "long-term",
      ephemeral: request.mode === "temporary",
      cpu: request.cpuCores ?? 4,
      memoryGb: request.memoryGb ?? 8,
    });
    if (!created.ok || !created.body || typeof created.body !== "object") {
      throw new AgentComputerError(
        created.status === 401 || created.status === 403 ? "MISSING_CREDENTIALS" : "PROVIDER_ERROR",
        `Cua Cloud failed to provision Space '${spaceName}' (HTTP ${created.status}).`,
        "Check CUA_API_KEY quota and requested OS availability.",
        created.status >= 400 && created.status < 600 ? created.status : 502,
      );
    }

    const record = ((created.body as { space?: CuaCloudSpaceRecord }).space ??
      created.body) as CuaCloudSpaceRecord;
    const spaceId = record.id ?? spaceName;
    return {
      instanceId: spaceId,
      instanceName: record.name ?? spaceName,
      os: request.os,
      state: "running",
      guestIp: record.ip ?? null,
      vncPreviewUrl: record.vncUrl ?? record.streamUrl ?? null,
    };
  }

  async execCommand(
    lease: ComputerLease,
    input: ExecCommandInput,
    context: ProviderContext,
  ): Promise<ExecCommandResult> {
    const startedAt = context.now();
    const res = await this.apiJson(
      context,
      "POST",
      `/spaces/${encodeURIComponent(lease.instanceId)}/commands`,
      {
        command: input.command,
        ...(input.cwd ? { cwd: input.cwd } : {}),
        timeoutMs: input.timeoutMs ?? 60_000,
      },
    );
    if (!res.ok) {
      throw new AgentComputerError(
        "COMMAND_FAILED",
        `Cua Cloud command failed on Space '${lease.instanceId}' (HTTP ${res.status}).`,
        "Verify the Cua Cloud Space is still running.",
      );
    }
    const payload = (res.body && typeof res.body === "object" ? res.body : {}) as {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
    const exitCode = typeof payload.exitCode === "number" ? payload.exitCode : 0;
    return {
      ok: exitCode === 0,
      exitCode,
      stdout: payload.stdout ?? "",
      stderr: payload.stderr ?? "",
      durationMs: Math.max(0, context.now() - startedAt),
    };
  }

  async mcpEndpoint(lease: ComputerLease, context: ProviderContext): Promise<ComputerMcpEndpoint | null> {
    const key = context.settings.cuaApiKey;
    if (!key) return null;
    return {
      kind: "streamable-http",
      toolSurface: "cua-driver",
      url: `${context.settings.cuaApiBaseUrl}/spaces/${encodeURIComponent(lease.instanceId)}/mcp`,
      headers: {
        authorization: `Bearer ${key}`,
      },
      env: {
        CUA_SPACE_ID: lease.instanceId,
      },
    };
  }

  async screenshotPreview(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<ScreenshotPreview> {
    const res = await this.apiJson(
      context,
      "GET",
      `/spaces/${encodeURIComponent(lease.instanceId)}/screenshot`,
    );
    if (!res.ok) {
      throw new AgentComputerError(
        "COMMAND_FAILED",
        `Cua Cloud screenshot failed on '${lease.instanceId}' (HTTP ${res.status}).`,
        "Check that the Cua Cloud Space desktop session is active.",
      );
    }
    const payload = (res.body && typeof res.body === "object" ? res.body : {}) as {
      data?: string;
      image?: string;
      base64?: string;
      mimeType?: string;
    };
    return {
      mimeType: payload.mimeType === "image/jpeg" ? "image/jpeg" : "image/png",
      base64Data: payload.data ?? payload.image ?? payload.base64 ?? "",
      vncPreviewUrl: lease.vncPreviewUrl,
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
      `/spaces/${encodeURIComponent(lease.instanceId)}/stop`,
      {},
    );
    if (!res.ok && res.status !== 404 && res.status !== 409) {
      throw new AgentComputerError(
        "PROVIDER_ERROR",
        `Failed to stop Cua Cloud Space '${lease.instanceId}' (HTTP ${res.status}).`,
        "Retry stopping the Space or inspect Cua Cloud console.",
        502,
      );
    }
    return {
      state: "stopped",
      detail: `Stopped Cua Cloud Space '${lease.instanceId}'.`,
    };
  }

  async destroyLease(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<LeaseLifecycleResult> {
    const res = await this.apiJson(
      context,
      "DELETE",
      `/spaces/${encodeURIComponent(lease.instanceId)}`,
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new AgentComputerError(
        "PROVIDER_ERROR",
        `Failed to delete Cua Cloud Space '${lease.instanceId}' (HTTP ${res.status}).`,
        "Verify Space deletion in Cua Cloud console.",
        502,
      );
    }
    return {
      state: "destroyed",
      detail: `Deleted Cua Cloud Space '${lease.instanceId}'.`,
    };
  }
}
