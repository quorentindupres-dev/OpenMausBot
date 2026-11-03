import { randomUUID } from "node:crypto";
import {
  AGENT_COMPUTER_PROVIDERS,
  AGENT_COMPUTER_PROVIDER_CATALOG,
  buildAgentComputerName,
  computerLeaseRequestSchema,
  getProviderCatalogEntry,
  type AgentComputerProviderId,
  type CloudBurstProviderId,
  type ComputerLease,
  type ComputerLeaseRequestInput,
  type ComputerMcpEndpoint,
  type ProviderAvailability,
  type ProviderStatusWithCatalog,
} from "../../shared/agent-computers.ts";
import { DATA_DIR } from "../config.ts";
import type { DesktopComputer } from "../desktop-computer.ts";
import type { SharedComputers } from "../shared-computers.ts";
import { AgentComputerError } from "./errors.ts";
import { CuaCloudProvider } from "./providers/cua-cloud.ts";
import { DaytonaProvider } from "./providers/daytona.ts";
import { LocalCuaAxProvider } from "./providers/local-cua-ax.ts";
import { Mac2LumeVmProvider } from "./providers/mac2-lume-vm.ts";
import { Mac2SharedProvider } from "./providers/mac2-shared.ts";
import { OrgoProvider } from "./providers/orgo.ts";
import { loadAgentComputerSettings, type AgentComputerRuntimeSettings } from "./settings.ts";
import { AgentComputerStore } from "./store.ts";
import {
  defaultShellRunner,
  type ComputerProviderAdapter,
  type ExecCommandInput,
  type ExecCommandResult,
  type FetchLike,
  type ProviderContext,
  type ScreenshotPreview,
  type ShellCommandRunner,
} from "./types.ts";

export interface AgentComputerPoolOptions {
  store: AgentComputerStore;
  getSettings?: () => AgentComputerRuntimeSettings;
  fetchImpl?: FetchLike;
  runShell?: ShellCommandRunner;
  now?: () => number;
  desktop?: DesktopComputer;
  platform?: NodeJS.Platform;
  sharedComputers?: SharedComputers;
  lumeReadyPollDelaysMs?: readonly number[];
  adapters?: Partial<Record<AgentComputerProviderId, ComputerProviderAdapter>>;
}

const BURSTABLE_ERROR_CODES = new Set([
  "CAPACITY_FULL",
  "HOST_OFFLINE",
  "MISSING_CREDENTIALS",
  "UNSUPPORTED_OS",
]);

export class AgentComputerPool {
  private readonly store: AgentComputerStore;
  private readonly getSettings: () => AgentComputerRuntimeSettings;
  private readonly fetchImpl: FetchLike;
  private readonly runShell: ShellCommandRunner;
  private readonly now: () => number;
  private readonly adapters: Map<AgentComputerProviderId, ComputerProviderAdapter>;

  constructor(options: AgentComputerPoolOptions) {
    this.store = options.store;
    this.getSettings = options.getSettings ?? (() => loadAgentComputerSettings(process.env));
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.runShell = options.runShell ?? defaultShellRunner;
    this.now = options.now ?? Date.now;

    const defaults: ComputerProviderAdapter[] = [
      new Mac2LumeVmProvider({ readyPollDelaysMs: options.lumeReadyPollDelaysMs }),
      new LocalCuaAxProvider({ desktop: options.desktop, platform: options.platform }),
      new Mac2SharedProvider({ sharedComputers: options.sharedComputers }),
      new CuaCloudProvider(),
      new DaytonaProvider(),
      new OrgoProvider(),
    ];

    this.adapters = new Map();
    for (const adapter of defaults) {
      this.adapters.set(adapter.id, options.adapters?.[adapter.id] ?? adapter);
    }
  }

  getStore(): AgentComputerStore {
    return this.store;
  }

  getAdapter(id: AgentComputerProviderId): ComputerProviderAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new AgentComputerError(
        "INVALID_REQUEST",
        `Unknown computer provider '${id}'.`,
        `Choose one of: ${AGENT_COMPUTER_PROVIDERS.join(", ")}.`,
        400,
      );
    }
    return adapter;
  }

  private buildContext(): ProviderContext {
    return {
      settings: this.getSettings(),
      mac2Config: this.store.getMac2Config(),
      burstPolicy: this.store.getBurstPolicy(),
      activeLeases: this.store.listLeases(),
      fetchImpl: this.fetchImpl,
      runShell: this.runShell,
      now: this.now,
    };
  }

  async checkProvider(id: AgentComputerProviderId): Promise<ProviderAvailability> {
    const adapter = this.getAdapter(id);
    return adapter.checkAvailability(this.buildContext());
  }

  async listProvidersWithStatus(): Promise<ProviderStatusWithCatalog[]> {
    const context = this.buildContext();
    const results = await Promise.all(
      AGENT_COMPUTER_PROVIDER_CATALOG.map(async (catalog) => {
        const adapter = this.getAdapter(catalog.id);
        const status = await adapter.checkAvailability(context);
        return { catalog, status };
      }),
    );
    return results;
  }

  private rankBurstCandidates(input: {
    requestedProvider: AgentComputerProviderId;
    os: "macos" | "linux" | "windows";
    needsGui: boolean;
  }): CloudBurstProviderId[] {
    const policy = this.store.getBurstPolicy();
    if (!policy.enabled) return [];

    const compatible = policy.fallbackOrder.filter((candidate) => {
      if (candidate === input.requestedProvider) return false;
      const meta = getProviderCatalogEntry(candidate);
      return meta.supportedOs.includes(input.os);
    });

    if (input.os === "linux" && !input.needsGui && policy.preferDaytonaForHeadlessLinux) {
      return [
        ...compatible.filter((id) => id === "daytona"),
        ...compatible.filter((id) => id !== "daytona"),
      ];
    }

    if (input.needsGui) {
      return [
        ...compatible.filter((id) => getProviderCatalogEntry(id).supportsGui),
        ...compatible.filter((id) => !getProviderCatalogEntry(id).supportsGui),
      ];
    }

    return compatible;
  }

  /**
   * Provisions or attaches an isolated computer for an agent.
   * Defaults to `mac2-lume-vm` (#1 Primary Dedicated Computer) and bursts to cloud when full or offline.
   */
  async acquireComputer(rawRequest: ComputerLeaseRequestInput): Promise<ComputerLease> {
    const request = computerLeaseRequestSchema.parse(rawRequest);
    const requestedProvider: AgentComputerProviderId = request.preferredProvider ?? "mac2-lume-vm";

    const existingRunning = this.store
      .listLeases({ agentId: request.agentId })
      .find(
        (lease) =>
          lease.state === "running" &&
          lease.mode === request.mode &&
          lease.os === request.os &&
          (request.preferredProvider === undefined ||
            lease.requestedProvider === requestedProvider ||
            lease.provider === requestedProvider),
      );
    if (existingRunning) {
      const refreshed: ComputerLease = {
        ...existingRunning,
        updatedAt: this.now(),
        lastUsedAt: this.now(),
      };
      return this.store.upsertLease(refreshed);
    }

    const context = this.buildContext();
    const primaryAdapter = this.getAdapter(requestedProvider);

    try {
      const provisioned = await primaryAdapter.provisionOrLease(request, context);
      return this.recordProvisionedLease({
        request,
        provider: requestedProvider,
        requestedProvider,
        burstedFrom: null,
        provisioned,
      });
    } catch (primaryError) {
      const canBurst =
        request.allowCloudBurst &&
        this.store.getBurstPolicy().enabled &&
        primaryError instanceof AgentComputerError &&
        BURSTABLE_ERROR_CODES.has(primaryError.code);

      if (!canBurst) {
        throw primaryError;
      }

      const candidates = this.rankBurstCandidates({
        requestedProvider,
        os: request.os,
        needsGui: request.needsGui,
      });

      const fallbackDiagnostics: string[] = [];
      for (const candidateId of candidates) {
        const candidateAdapter = this.getAdapter(candidateId);
        const availability = await candidateAdapter.checkAvailability(context);
        if (!availability.available) {
          fallbackDiagnostics.push(`${candidateId}: ${availability.reasonCode}`);
          continue;
        }
        try {
          const provisioned = await candidateAdapter.provisionOrLease(request, context);
          return this.recordProvisionedLease({
            request,
            provider: candidateId,
            requestedProvider,
            burstedFrom: requestedProvider,
            provisioned,
          });
        } catch (burstError) {
          fallbackDiagnostics.push(
            `${candidateId}: ${burstError instanceof Error ? burstError.message : String(burstError)}`,
          );
        }
      }

      const primaryErr = primaryError as AgentComputerError;
      const fallbackSummary =
        fallbackDiagnostics.length > 0
          ? ` Burst candidates unavailable (${fallbackDiagnostics.join("; ")}).`
          : " No OS-compatible Cloud Burst providers enabled.";

      throw new AgentComputerError(
        primaryErr.code,
        `${primaryErr.message}${fallbackSummary}`,
        primaryErr.next,
        primaryErr.status,
      );
    }
  }

  private recordProvisionedLease(input: {
    request: ReturnType<typeof computerLeaseRequestSchema.parse>;
    provider: AgentComputerProviderId;
    requestedProvider: AgentComputerProviderId;
    burstedFrom: AgentComputerProviderId | null;
    provisioned: {
      instanceId: string;
      instanceName: string;
      os: "macos" | "linux" | "windows";
      state: "provisioning" | "running" | "paused" | "stopped" | "destroyed" | "error";
      guestIp?: string | null;
      vncPreviewUrl?: string | null;
      snapshotName?: string | null;
    };
  }): ComputerLease {
    const at = this.now();
    const expectedName = buildAgentComputerName(input.request);
    const previousPersistent =
      input.request.mode === "long-term"
        ? this.store.findPersistentLease({
            provider: input.provider,
            instanceName: input.provisioned.instanceName || expectedName,
          })
        : null;

    const lease: ComputerLease = {
      leaseId: previousPersistent?.leaseId ?? randomUUID(),
      agentId: input.request.agentId,
      provider: input.provider,
      requestedProvider: input.requestedProvider,
      burstedFrom: input.burstedFrom,
      mode: input.request.mode,
      os: input.provisioned.os,
      ...(input.request.role ? { role: input.request.role } : {}),
      ...(input.request.project ? { project: input.request.project } : {}),
      instanceId: input.provisioned.instanceId,
      instanceName: input.provisioned.instanceName,
      state: input.provisioned.state,
      guestIp: input.provisioned.guestIp ?? null,
      vncPreviewUrl: input.provisioned.vncPreviewUrl ?? null,
      snapshotName: input.provisioned.snapshotName ?? previousPersistent?.snapshotName ?? null,
      createdAt: previousPersistent?.createdAt ?? at,
      updatedAt: at,
      lastUsedAt: at,
    };

    return this.store.upsertLease(lease);
  }

  private requireLease(leaseId: string): ComputerLease {
    const lease = this.store.getLease(leaseId);
    if (!lease || lease.state === "destroyed") {
      throw new AgentComputerError(
        "LEASE_NOT_FOUND",
        `Computer lease '${leaseId}' does not exist or was already destroyed.`,
        "Acquire a new computer lease via pool.acquireComputer().",
        404,
      );
    }
    return lease;
  }

  async execCommand(leaseId: string, input: ExecCommandInput): Promise<ExecCommandResult> {
    const lease = this.requireLease(leaseId);
    if (lease.state !== "running") {
      throw new AgentComputerError(
        "INVALID_REQUEST",
        `Cannot execute command on lease '${leaseId}' while state is '${lease.state}'.`,
        "Re-acquire or wake the computer lease before executing commands.",
      );
    }
    const adapter = this.getAdapter(lease.provider);
    const result = await adapter.execCommand(lease, input, this.buildContext());
    this.store.upsertLease({
      ...lease,
      updatedAt: this.now(),
      lastUsedAt: this.now(),
    });
    return result;
  }

  async getMcpEndpoint(leaseId: string): Promise<ComputerMcpEndpoint | null> {
    const lease = this.requireLease(leaseId);
    if (lease.state !== "running") return null;
    const adapter = this.getAdapter(lease.provider);
    return adapter.mcpEndpoint(lease, this.buildContext());
  }

  async screenshotPreview(leaseId: string): Promise<ScreenshotPreview> {
    const lease = this.requireLease(leaseId);
    if (lease.state !== "running") {
      throw new AgentComputerError(
        "INVALID_REQUEST",
        `Cannot capture screenshot on lease '${leaseId}' while state is '${lease.state}'.`,
        "Wake the computer lease first.",
      );
    }
    const adapter = this.getAdapter(lease.provider);
    return adapter.screenshotPreview(lease, this.buildContext());
  }

  /**
   * Lifecycle-aware session close:
   * - `temporary` -> destroys & wipes ephemeral VM (`tmp-<agentId>`)
   * - `long-term` -> snapshots & stops persistent VM (`a01-<role>-<project>`)
   */
  async closeSession(leaseId: string): Promise<ComputerLease> {
    const lease = this.requireLease(leaseId);
    if (lease.mode === "temporary") {
      return this.destroyLease(leaseId);
    }
    return this.pauseOrStopLease(leaseId);
  }

  async pauseOrStopLease(leaseId: string): Promise<ComputerLease> {
    const lease = this.requireLease(leaseId);
    const adapter = this.getAdapter(lease.provider);
    const outcome = await adapter.pauseOrStop(lease, this.buildContext());
    return this.store.upsertLease({
      ...lease,
      state: outcome.state,
      snapshotName: outcome.snapshotName !== undefined ? outcome.snapshotName : lease.snapshotName,
      updatedAt: this.now(),
    });
  }

  async destroyLease(leaseId: string): Promise<ComputerLease> {
    const lease = this.requireLease(leaseId);
    const adapter = this.getAdapter(lease.provider);
    const outcome = await adapter.destroyLease(lease, this.buildContext());
    return this.store.upsertLease({
      ...lease,
      state: outcome.state,
      snapshotName: null,
      updatedAt: this.now(),
    });
  }
}

export function createDefaultAgentComputerPool(options: {
  dataDir?: string;
  desktop?: DesktopComputer;
  sharedComputers?: SharedComputers;
} = {}): AgentComputerPool {
  const store = new AgentComputerStore(options.dataDir ?? DATA_DIR);
  return new AgentComputerPool({
    store,
    desktop: options.desktop,
    sharedComputers: options.sharedComputers,
  });
}
