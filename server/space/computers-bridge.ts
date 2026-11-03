import { z } from "zod";

import {
  AGENT_COMPUTER_PROVIDERS,
  cloudBurstPolicySchema,
  computerLeaseRequestSchema,
  createDefaultAgentComputerPool,
  mac2HostConfigSchema,
  type AgentComputerPool,
  type AgentComputerProviderId,
  type CloudBurstPolicy,
  type ComputerLease,
  type ComputerMcpEndpoint,
  type Mac2HostConfig,
  type ProviderStatusWithCatalog,
  type ScreenshotPreview,
  type ExecCommandResult,
} from "../agent-computers/index.ts";
import { DATA_DIR } from "../config.ts";
import { desktopComputer } from "../desktop-computer.ts";
import { SpaceInputError } from "./errors.ts";

/** Maps UI canvas target aliases (`local-ax`, `mac2-lume-isolated`) onto canonical `AgentComputerProviderId`s. */
const PROVIDER_ALIASES: Record<string, AgentComputerProviderId> = {
  "local-ax": "local-cua-ax",
  "mac2-lume-isolated": "mac2-lume-vm",
};

export function normalizeComputerProviderId(raw: string): AgentComputerProviderId {
  const trimmed = raw.trim();
  if (Object.hasOwn(PROVIDER_ALIASES, trimmed)) {
    return PROVIDER_ALIASES[trimmed]!;
  }
  if ((AGENT_COMPUTER_PROVIDERS as readonly string[]).includes(trimmed)) {
    return trimmed as AgentComputerProviderId;
  }
  throw new SpaceInputError(
    400,
    `Unknown computer provider '${raw}'. Choose one of: ${AGENT_COMPUTER_PROVIDERS.join(", ")}.`,
  );
}

const execRequestSchema = z
  .object({
    command: z.string().trim().min(1).max(16_000),
    cwd: z.string().trim().min(1).max(1024).optional(),
    timeoutMs: z.number().int().min(100).max(600_000).optional(),
  })
  .strict();

const releaseRequestSchema = z
  .object({
    action: z.enum(["close", "pause", "destroy"]).default("close"),
  })
  .partial()
  .strict();

const configPatchSchema = z
  .object({
    mac2: mac2HostConfigSchema.partial().optional(),
    burstPolicy: cloudBurstPolicySchema.partial().optional(),
  })
  .strict();

let sharedPool: AgentComputerPool | null = null;

export function spaceComputerPool(): AgentComputerPool {
  return (sharedPool ??= createDefaultAgentComputerPool({
    dataDir: DATA_DIR,
    desktop: desktopComputer,
  }));
}

export async function getSpaceComputersSnapshot(pool: AgentComputerPool): Promise<{
  providers: ProviderStatusWithCatalog[];
  leases: ComputerLease[];
  mac2: Mac2HostConfig;
  burstPolicy: CloudBurstPolicy;
}> {
  const providers = await pool.listProvidersWithStatus();
  const store = pool.getStore();
  return {
    providers,
    leases: store.listLeases(),
    mac2: store.getMac2Config(),
    burstPolicy: store.getBurstPolicy(),
  };
}

export async function leaseSpaceComputer(pool: AgentComputerPool, body: unknown): Promise<ComputerLease> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SpaceInputError(400, "lease request body must be a JSON object");
  }
  const raw = body as Record<string, unknown>;
  const normalized = {
    ...raw,
    ...(typeof raw.preferredProvider === "string"
      ? { preferredProvider: normalizeComputerProviderId(raw.preferredProvider) }
      : {}),
  };
  const parsed = computerLeaseRequestSchema.safeParse(normalized);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SpaceInputError(
      400,
      issue ? `${issue.path.map(String).join(".") || "body"}: ${issue.message}` : "invalid computer lease request",
    );
  }
  return pool.acquireComputer(parsed.data);
}

export async function execOnSpaceComputer(
  pool: AgentComputerPool,
  leaseId: string,
  body: unknown,
): Promise<ExecCommandResult> {
  const parsed = execRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SpaceInputError(
      400,
      issue ? `${issue.path.map(String).join(".") || "body"}: ${issue.message}` : "invalid exec payload",
    );
  }
  return pool.execCommand(leaseId, parsed.data);
}

export async function previewSpaceComputer(
  pool: AgentComputerPool,
  leaseId: string,
): Promise<{ preview: ScreenshotPreview; mcpEndpoint: ComputerMcpEndpoint | null }> {
  const [preview, mcpEndpoint] = await Promise.all([
    pool.screenshotPreview(leaseId),
    pool.getMcpEndpoint(leaseId),
  ]);
  return { preview, mcpEndpoint };
}

export async function releaseSpaceComputer(
  pool: AgentComputerPool,
  leaseId: string,
  body?: unknown,
): Promise<ComputerLease> {
  const parsed = releaseRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new SpaceInputError(400, "invalid release payload; expected action: close | pause | destroy");
  }
  const action = parsed.data.action ?? "close";
  if (action === "destroy") return pool.destroyLease(leaseId);
  if (action === "pause") return pool.pauseOrStopLease(leaseId);
  return pool.closeSession(leaseId);
}

export function patchSpaceComputersConfig(
  pool: AgentComputerPool,
  body: unknown,
): { mac2: Mac2HostConfig; burstPolicy: CloudBurstPolicy } {
  const parsed = configPatchSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SpaceInputError(
      400,
      issue ? `${issue.path.map(String).join(".") || "body"}: ${issue.message}` : "invalid computer config patch",
    );
  }
  const store = pool.getStore();
  const mac2 = parsed.data.mac2 ? store.updateMac2Config(parsed.data.mac2) : store.getMac2Config();
  const burstPolicy = parsed.data.burstPolicy
    ? store.updateBurstPolicy(parsed.data.burstPolicy)
    : store.getBurstPolicy();
  return { mac2, burstPolicy };
}
