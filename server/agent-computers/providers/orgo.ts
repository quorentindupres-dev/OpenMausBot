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

interface OrgoComputerRecord {
  id?: string;
  name?: string;
  status?: string;
  state?: string;
  url?: string | null;
  vnc_url?: string | null;
}

export interface OrgoProviderOptions {
  maxCapacity?: number;
}

export class OrgoProvider implements ComputerProviderAdapter {
  readonly id = "orgo" as const;
  private readonly maxCapacity: number;

  constructor(options: OrgoProviderOptions = {}) {
    this.maxCapacity = options.maxCapacity ?? 50;
  }

  private requireApiKey(context: ProviderContext): string {
    const key = context.settings.orgoApiKey;
    if (!key) {
      throw new AgentComputerError(
        "MISSING_CREDENTIALS",
        "ORGO_API_KEY is missing from runtime environment.",
        "Inject ORGO_API_KEY via Bitwarden Secrets Manager: keys run stable -- pnpm dev:server",
      );
    }
    return key;
  }

  private async apiRequest(
    context: ProviderContext,
    method: "GET" | "POST" | "DELETE",
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; contentType: string; bytes: Uint8Array; body: unknown }> {
    const key = this.requireApiKey(context);
    const response = await context.fetchImpl(`${context.settings.orgoApiBaseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(payload ? { "content-type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const bytes = new Uint8Array(await response.arrayBuffer());
    let body: unknown = null;
    if (!contentType.startsWith("image/") && bytes.byteLength > 0) {
      const text = Buffer.from(bytes).toString("utf8");
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { ok: response.ok, status: response.status, contentType, bytes, body };
  }

  async checkAvailability(context: ProviderContext): Promise<ProviderAvailability> {
    const activeLeases = context.activeLeases.filter(
      (lease) => lease.provider === this.id && lease.state === "running",
    ).length;

    if (!context.settings.orgoApiKey) {
      return {
        provider: this.id,
        available: false,
        state: "missing_credentials",
        reasonCode: "missing_api_key",
        message: "ORGO_API_KEY is not set in environment.",
        nextStep: "Inject ORGO_API_KEY at runtime via: keys run stable -- pnpm dev:server",
        activeLeases,
        maxCapacity: this.maxCapacity,
        supportedOs: ["linux"],
        checkedAt: context.now(),
      };
    }

    try {
      const res = await this.apiRequest(context, "GET", "/computers");
      if (res.status === 401 || res.status === 403) {
        return {
          provider: this.id,
          available: false,
          state: "missing_credentials",
          reasonCode: "auth_rejected",
          message: "Orgo.ai rejected ORGO_API_KEY (HTTP 401/403).",
          nextStep: "Verify or rotate ORGO_API_KEY in Bitwarden Secrets Manager.",
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
          message: `Orgo.ai status check returned HTTP ${res.status}.`,
          nextStep: "Check https://www.orgo.ai status.",
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
        message: "Orgo.ai Ubuntu computer-use VMs ready (/computers API).",
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
        message: `Could not reach Orgo.ai API: ${error instanceof Error ? error.message : String(error)}`,
        nextStep: "Check network connectivity to www.orgo.ai.",
        activeLeases,
        maxCapacity: this.maxCapacity,
        supportedOs: ["linux"],
        checkedAt: context.now(),
      };
    }
  }

  private extractComputers(raw: unknown): OrgoComputerRecord[] {
    if (Array.isArray(raw)) return raw as OrgoComputerRecord[];
    if (raw && typeof raw === "object" && Array.isArray((raw as { computers?: unknown }).computers)) {
      return (raw as { computers: OrgoComputerRecord[] }).computers;
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
        `Orgo.ai provides Ubuntu Linux desktops only, cannot satisfy OS '${request.os}'.`,
        "Use mac2-lume-vm or cua-cloud for macOS/Windows.",
        400,
      );
    }

    this.requireApiKey(context);
    const computerName = buildAgentComputerName(request);

    if (request.mode === "long-term") {
      const listed = await this.apiRequest(context, "GET", "/computers");
      if (listed.ok) {
        const existing = this.extractComputers(listed.body).find(
          (item) => item.name === computerName && typeof item.id === "string",
        );
        if (existing && existing.id) {
          const state = (existing.status ?? existing.state ?? "").toLowerCase();
          if (state !== "running") {
            const started = await this.apiRequest(
              context,
              "POST",
              `/computers/${encodeURIComponent(existing.id)}/start`,
              {},
            );
            if (!started.ok && started.status !== 409) {
              throw new AgentComputerError(
                "PROVIDER_ERROR",
                `Failed to start Orgo computer '${computerName}' (HTTP ${started.status}).`,
                "Check Orgo workspace quota.",
                502,
              );
            }
          }
          return {
            instanceId: existing.id,
            instanceName: computerName,
            os: "linux",
            state: "running",
            vncPreviewUrl: existing.vnc_url ?? existing.url ?? null,
          };
        }
      }
    }

    const created = await this.apiRequest(context, "POST", "/computers", {
      name: computerName,
      cpu: request.cpuCores ?? 2,
      ram: request.memoryGb ?? 4,
    });
    if (!created.ok || !created.body || typeof created.body !== "object") {
      throw new AgentComputerError(
        created.status === 401 || created.status === 403 ? "MISSING_CREDENTIALS" : "PROVIDER_ERROR",
        `Orgo.ai failed to create computer '${computerName}' (HTTP ${created.status}).`,
        "Check ORGO_API_KEY and project quota.",
        created.status >= 400 && created.status < 600 ? created.status : 502,
      );
    }

    const record = ((created.body as { computer?: OrgoComputerRecord }).computer ??
      created.body) as OrgoComputerRecord;
    return {
      instanceId: record.id ?? computerName,
      instanceName: record.name ?? computerName,
      os: "linux",
      state: "running",
      vncPreviewUrl: record.vnc_url ?? record.url ?? null,
    };
  }

  async execCommand(
    lease: ComputerLease,
    input: ExecCommandInput,
    context: ProviderContext,
  ): Promise<ExecCommandResult> {
    const startedAt = context.now();
    const command = input.cwd
      ? `cd '${input.cwd.replace(/'/g, "'\\''")}' && ${input.command}`
      : input.command;
    const res = await this.apiRequest(
      context,
      "POST",
      `/computers/${encodeURIComponent(lease.instanceId)}/bash`,
      { command },
    );
    if (!res.ok) {
      throw new AgentComputerError(
        "COMMAND_FAILED",
        `Orgo /bash failed on '${lease.instanceId}' (HTTP ${res.status}).`,
        "Verify the Orgo computer is running.",
      );
    }
    const payload = (res.body && typeof res.body === "object" ? res.body : {}) as {
      exit_code?: number;
      exitCode?: number;
      output?: string;
      stdout?: string;
      stderr?: string;
    };
    const exitCode = payload.exitCode ?? payload.exit_code ?? 0;
    return {
      ok: exitCode === 0,
      exitCode,
      stdout: payload.stdout ?? payload.output ?? "",
      stderr: payload.stderr ?? "",
      durationMs: Math.max(0, context.now() - startedAt),
    };
  }

  /** Direct Orgo GUI mouse click action (`POST /computers/{id}/click`). */
  async click(
    lease: ComputerLease,
    point: { x: number; y: number; button?: "left" | "right" | "middle" },
    context: ProviderContext,
  ): Promise<void> {
    const res = await this.apiRequest(
      context,
      "POST",
      `/computers/${encodeURIComponent(lease.instanceId)}/click`,
      {
        x: Math.round(point.x),
        y: Math.round(point.y),
        button: point.button ?? "left",
      },
    );
    if (!res.ok) {
      throw new AgentComputerError(
        "COMMAND_FAILED",
        `Orgo /click failed on '${lease.instanceId}' (HTTP ${res.status}).`,
        "Verify coordinates and computer state.",
      );
    }
  }

  async mcpEndpoint(lease: ComputerLease, context: ProviderContext): Promise<ComputerMcpEndpoint | null> {
    const key = context.settings.orgoApiKey;
    if (!key) return null;
    return {
      kind: "rest-bridge",
      toolSurface: "orgo-computer",
      url: `${context.settings.orgoApiBaseUrl}/computers/${encodeURIComponent(lease.instanceId)}`,
      headers: {
        authorization: `Bearer ${key}`,
      },
      env: {
        ORGO_COMPUTER_ID: lease.instanceId,
      },
    };
  }

  async screenshotPreview(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<ScreenshotPreview> {
    const res = await this.apiRequest(
      context,
      "GET",
      `/computers/${encodeURIComponent(lease.instanceId)}/screenshot`,
    );
    if (!res.ok) {
      throw new AgentComputerError(
        "COMMAND_FAILED",
        `Orgo /screenshot failed on '${lease.instanceId}' (HTTP ${res.status}).`,
        "Verify the Orgo Ubuntu desktop is running.",
      );
    }
    if (res.contentType.startsWith("image/")) {
      return {
        mimeType: res.contentType.includes("jpeg") ? "image/jpeg" : "image/png",
        base64Data: Buffer.from(res.bytes).toString("base64"),
        vncPreviewUrl: lease.vncPreviewUrl,
        capturedAt: context.now(),
      };
    }
    const payload = (res.body && typeof res.body === "object" ? res.body : {}) as {
      image?: string;
      screenshot?: string;
      data?: string;
    };
    return {
      mimeType: "image/png",
      base64Data: payload.image ?? payload.screenshot ?? payload.data ?? "",
      vncPreviewUrl: lease.vncPreviewUrl,
      capturedAt: context.now(),
    };
  }

  async pauseOrStop(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<LeaseLifecycleResult> {
    const res = await this.apiRequest(
      context,
      "POST",
      `/computers/${encodeURIComponent(lease.instanceId)}/stop`,
      {},
    );
    if (!res.ok && res.status !== 404 && res.status !== 409) {
      throw new AgentComputerError(
        "PROVIDER_ERROR",
        `Failed to stop Orgo computer '${lease.instanceId}' (HTTP ${res.status}).`,
        "Check computer status in Orgo console.",
        502,
      );
    }
    return {
      state: "stopped",
      detail: `Stopped Orgo computer '${lease.instanceId}'.`,
    };
  }

  async destroyLease(
    lease: ComputerLease,
    context: ProviderContext,
  ): Promise<LeaseLifecycleResult> {
    const res = await this.apiRequest(
      context,
      "DELETE",
      `/computers/${encodeURIComponent(lease.instanceId)}`,
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new AgentComputerError(
        "PROVIDER_ERROR",
        `Failed to delete Orgo computer '${lease.instanceId}' (HTTP ${res.status}).`,
        "Delete the computer in Orgo console.",
        502,
      );
    }
    return {
      state: "destroyed",
      detail: `Deleted Orgo computer '${lease.instanceId}'.`,
    };
  }
}
