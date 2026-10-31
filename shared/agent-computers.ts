import { z } from "zod";

/** Ordered by priority in the picker: the 2nd Apple Silicon Mac hypervisor is #1 for isolated $0/hr agents. */
export const AGENT_COMPUTER_PROVIDERS = [
  "mac2-lume-vm",
  "local-cua-ax",
  "mac2-shared",
  "cua-cloud",
  "daytona",
  "orgo",
] as const;
export type AgentComputerProviderId = (typeof AGENT_COMPUTER_PROVIDERS)[number];

export const CLOUD_BURST_PROVIDERS = ["cua-cloud", "daytona", "orgo"] as const;
export type CloudBurstProviderId = (typeof CLOUD_BURST_PROVIDERS)[number];

export const AGENT_COMPUTER_TIERS = [
  "lan-hypervisor",
  "local-ax",
  "lan-direct",
  "cloud-cua",
  "cloud-burst",
] as const;
export type AgentComputerTier = (typeof AGENT_COMPUTER_TIERS)[number];

/** `temporary` clones a fresh disposable VM wiped on session close; `long-term` mounts a persistent named VM stopped when idle. */
export const AGENT_LIFECYCLE_MODES = ["temporary", "long-term"] as const;
export type AgentLifecycleMode = (typeof AGENT_LIFECYCLE_MODES)[number];

export const COMPUTER_OS_FAMILIES = ["macos", "linux", "windows"] as const;
export type ComputerOsFamily = (typeof COMPUTER_OS_FAMILIES)[number];

export const PROVIDER_AVAILABILITY_STATES = [
  "ready",
  "missing_credentials",
  "host_offline",
  "capacity_full",
  "degraded",
  "disabled",
] as const;
export type ProviderAvailabilityState = (typeof PROVIDER_AVAILABILITY_STATES)[number];

export const PROVIDER_REASON_CODES = [
  "ok",
  "missing_api_key",
  "missing_credentials",
  "host_offline",
  "desktop_not_granted",
  "capacity_full",
  "macos_vm_limit_reached",
  "auth_rejected",
  "provider_error",
  "disabled",
] as const;
export type ProviderReasonCode = (typeof PROVIDER_REASON_CODES)[number];

export const COMPUTER_LEASE_STATES = [
  "provisioning",
  "running",
  "paused",
  "stopped",
  "destroyed",
  "error",
] as const;
export type ComputerLeaseState = (typeof COMPUTER_LEASE_STATES)[number];

export const MCP_ENDPOINT_KINDS = ["stdio", "sse", "streamable-http", "rest-bridge"] as const;
export type McpEndpointKind = (typeof MCP_ENDPOINT_KINDS)[number];

export const MCP_TOOL_SURFACES = [
  "cua-driver",
  "shared-computer",
  "daytona-exec",
  "orgo-computer",
] as const;
export type McpToolSurface = (typeof MCP_TOOL_SURFACES)[number];

/** Apple's Virtualization.framework enforces a hard license limit of 2 concurrent macOS VMs per physical Mac host. */
export const APPLE_VIRTUALIZATION_MAX_MACOS_VMS = 2;
export const DEFAULT_LUME_PORT = 7777;
export const DEFAULT_MACOS_BASE_VM = "xlabs-macos-base";
export const DEFAULT_LINUX_BASE_VM = "xlabs-ubuntu-base";

const SAFE_SLUG_INPUT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const HOSTNAME_OR_IP = /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/;
const SSH_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const VM_IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;

export interface AgentComputerProviderCatalogEntry {
  id: AgentComputerProviderId;
  rank: number;
  name: string;
  shortLabel: string;
  tier: AgentComputerTier;
  recommendedFor: string;
  supportedOs: readonly ComputerOsFamily[];
  isolation:
    | "full-vm-per-agent"
    | "shared-background-ax"
    | "shared-host-cursor"
    | "cloud-vm-per-agent"
    | "cloud-container-sandbox";
  concurrency: {
    min: number;
    max: number;
    note: string;
  };
  latencyMs: {
    typicalActionMs: number;
    coldStartMs: number;
    label: string;
  };
  pricing: {
    hourlyUsd: number;
    unit: string;
    label: string;
    freeLocal: boolean;
  };
  cursorConflict: boolean;
  supportsGui: boolean;
  supportsCuaMcp: boolean;
  supportsVncPreview: boolean;
  lifecycleSupport: {
    temporary: boolean;
    longTerm: boolean;
    snapshots: boolean;
  };
  credentialEnvVar: "CUA_API_KEY" | "DAYTONA_API_KEY" | "ORGO_API_KEY" | null;
}

/** Static comparison metadata for the computer picker UI and fallback planner. */
export const AGENT_COMPUTER_PROVIDER_CATALOG: readonly AgentComputerProviderCatalogEntry[] = [
  {
    id: "mac2-lume-vm",
    rank: 1,
    name: "2nd Mac · Cua Lume Isolated VM",
    shortLabel: "Mac #2 VM (Primary)",
    tier: "lan-hypervisor",
    recommendedFor: "Primary dedicated desktop per agent (2–4 concurrent VMs at $0/hr, zero cursor conflict)",
    supportedOs: ["macos", "linux"],
    isolation: "full-vm-per-agent",
    concurrency: {
      min: 1,
      max: 4,
      note: "Up to 2 macOS VMs (Apple Virtualization.framework limit) + 2 Linux VMs concurrently",
    },
    latencyMs: {
      typicalActionMs: 18,
      coldStartMs: 4_500,
      label: "~18ms Tailscale LAN · ~4.5s APFS clone boot",
    },
    pricing: {
      hourlyUsd: 0,
      unit: "owned-hardware",
      label: "$0.00/hr (owned Apple Silicon)",
      freeLocal: true,
    },
    cursorConflict: false,
    supportsGui: true,
    supportsCuaMcp: true,
    supportsVncPreview: true,
    lifecycleSupport: { temporary: true, longTerm: true, snapshots: true },
    credentialEnvVar: null,
  },
  {
    id: "local-cua-ax",
    rank: 2,
    name: "This Mac · Background AX Driver",
    shortLabel: "This Mac (AX)",
    tier: "local-ax",
    recommendedFor: "Fast local macOS app control via background Accessibility tree without stealing cursor",
    supportedOs: ["macos", "linux", "windows"],
    isolation: "shared-background-ax",
    concurrency: {
      min: 1,
      max: 4,
      note: "PID-targeted AX actions run in background; pixel fallback shares local screen",
    },
    latencyMs: {
      typicalActionMs: 4,
      coldStartMs: 0,
      label: "~4ms unix socket · 0s warm daemon",
    },
    pricing: {
      hourlyUsd: 0,
      unit: "local",
      label: "$0.00/hr (bundled Cua Driver)",
      freeLocal: true,
    },
    cursorConflict: false,
    supportsGui: true,
    supportsCuaMcp: true,
    supportsVncPreview: false,
    lifecycleSupport: { temporary: true, longTerm: true, snapshots: false },
    credentialEnvVar: null,
  },
  {
    id: "mac2-shared",
    rank: 3,
    name: "2nd Mac · Direct Host",
    shortLabel: "Mac #2 Host",
    tier: "lan-direct",
    recommendedFor: "Bare-metal Metal/GPU jobs or native Xcode builds on the 2nd Mac host OS",
    supportedOs: ["macos"],
    isolation: "shared-host-cursor",
    concurrency: {
      min: 1,
      max: 1,
      note: "1 GUI agent at a time on bare-metal host screen; unlimited background shell jobs",
    },
    latencyMs: {
      typicalActionMs: 15,
      coldStartMs: 0,
      label: "~15ms Tailscale LAN · 0s always-on",
    },
    pricing: {
      hourlyUsd: 0,
      unit: "owned-hardware",
      label: "$0.00/hr (owned Apple Silicon)",
      freeLocal: true,
    },
    cursorConflict: true,
    supportsGui: true,
    supportsCuaMcp: true,
    supportsVncPreview: false,
    lifecycleSupport: { temporary: true, longTerm: true, snapshots: false },
    credentialEnvVar: null,
  },
  {
    id: "cua-cloud",
    rank: 4,
    name: "Cua.ai Cloud Spaces",
    shortLabel: "Cua Cloud",
    tier: "cloud-cua",
    recommendedFor: "Elastic cloud macOS, Linux, or Windows GUI Spaces with identical cua-driver MCP tools",
    supportedOs: ["macos", "linux", "windows"],
    isolation: "cloud-vm-per-agent",
    concurrency: {
      min: 1,
      max: 50,
      note: "Elastic cloud fleet when Mac #2 VM slots are full or Windows is required",
    },
    latencyMs: {
      typicalActionMs: 85,
      coldStartMs: 6_000,
      label: "~85ms WAN · ~6s Space wake",
    },
    pricing: {
      hourlyUsd: 0.28,
      unit: "vm-hr",
      label: "~$0.15–$0.45/hr per active Space",
      freeLocal: false,
    },
    cursorConflict: false,
    supportsGui: true,
    supportsCuaMcp: true,
    supportsVncPreview: true,
    lifecycleSupport: { temporary: true, longTerm: true, snapshots: true },
    credentialEnvVar: "CUA_API_KEY",
  },
  {
    id: "daytona",
    rank: 5,
    name: "Daytona Cloud Sandboxes",
    shortLabel: "Daytona",
    tier: "cloud-burst",
    recommendedFor: "Sub-second Linux code, CLI, and headless browser burst sandboxes at minimal cost",
    supportedOs: ["linux"],
    isolation: "cloud-container-sandbox",
    concurrency: {
      min: 1,
      max: 100,
      note: "High-parallelism Linux sandboxes with auto-stop idle billing",
    },
    latencyMs: {
      typicalActionMs: 45,
      coldStartMs: 300,
      label: "~45ms API · ~300ms sub-second boot",
    },
    pricing: {
      hourlyUsd: 0.05,
      unit: "vcpu-hr",
      label: "~$0.05/vCPU-hr (billed per second)",
      freeLocal: false,
    },
    cursorConflict: false,
    supportsGui: false,
    supportsCuaMcp: false,
    supportsVncPreview: false,
    lifecycleSupport: { temporary: true, longTerm: true, snapshots: true },
    credentialEnvVar: "DAYTONA_API_KEY",
  },
  {
    id: "orgo",
    rank: 6,
    name: "Orgo.ai Cloud Computers",
    shortLabel: "Orgo.ai",
    tier: "cloud-burst",
    recommendedFor: "Persistent Ubuntu GUI desktops with direct REST screenshot, click, and bash endpoints",
    supportedOs: ["linux"],
    isolation: "cloud-vm-per-agent",
    concurrency: {
      min: 1,
      max: 50,
      note: "Persistent cloud Ubuntu desktops that pause cleanly between runs",
    },
    latencyMs: {
      typicalActionMs: 70,
      coldStartMs: 2_500,
      label: "~70ms API · ~2.5s Ubuntu boot",
    },
    pricing: {
      hourlyUsd: 0.12,
      unit: "vm-hr",
      label: "~$0.12/hr while running",
      freeLocal: false,
    },
    cursorConflict: false,
    supportsGui: true,
    supportsCuaMcp: false,
    supportsVncPreview: true,
    lifecycleSupport: { temporary: true, longTerm: true, snapshots: true },
    credentialEnvVar: "ORGO_API_KEY",
  },
] as const;

export function getProviderCatalogEntry(id: AgentComputerProviderId): AgentComputerProviderCatalogEntry {
  const entry = AGENT_COMPUTER_PROVIDER_CATALOG.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Unknown agent computer provider: ${id}`);
  }
  return entry;
}

/** Normalizes arbitrary agent, role, or project identifiers into safe lowercase DNS/Lume VM slugs. */
export function sanitizeComputerSlug(raw: string, fallback = "agent"): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return cleaned || fallback;
}

/**
 * Canonical VM/sandbox naming convention across Lume, Cua Cloud, Daytona, and Orgo:
 * - `temporary` -> `tmp-<agentId>`
 * - `long-term` -> `a01-<role>-<project>`
 */
export function buildAgentComputerName(input: {
  mode: AgentLifecycleMode;
  agentId: string;
  role?: string;
  project?: string;
}): string {
  if (input.mode === "temporary") {
    return `tmp-${sanitizeComputerSlug(input.agentId, "session")}`;
  }
  const roleSlug = sanitizeComputerSlug(input.role ?? input.agentId, "worker");
  const projectSlug = sanitizeComputerSlug(input.project ?? "main", "main");
  return `a01-${roleSlug}-${projectSlug}`;
}

export const mac2HostConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    name: z.string().trim().min(1).max(120).default("Mac #2 Agent Host"),
    tailscaleHost: z.string().trim().regex(HOSTNAME_OR_IP).optional(),
    sshAlias: z.string().trim().regex(SSH_ALIAS_PATTERN).optional(),
    sshUser: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,64}$/).optional(),
    lumePort: z.number().int().min(1024).max(65535).default(DEFAULT_LUME_PORT),
    lumeTransport: z.enum(["http", "ssh-tunnel"]).default("http"),
    sharedComputerId: z.string().uuid().optional(),
    sharedOwnerPerson: z.string().trim().min(1).max(200).optional(),
    maxConcurrentVms: z.number().int().min(1).max(8).default(3),
    maxMacOsVms: z.number().int().min(1).max(APPLE_VIRTUALIZATION_MAX_MACOS_VMS).default(APPLE_VIRTUALIZATION_MAX_MACOS_VMS),
    macosBaseImage: z.string().trim().regex(VM_IMAGE_NAME).default(DEFAULT_MACOS_BASE_VM),
    linuxBaseImage: z.string().trim().regex(VM_IMAGE_NAME).default(DEFAULT_LINUX_BASE_VM),
    snapshotOnLongTermStop: z.boolean().default(true),
  })
  .strict();
export type Mac2HostConfig = z.output<typeof mac2HostConfigSchema>;
export type Mac2HostConfigInput = z.input<typeof mac2HostConfigSchema>;

export const cloudBurstPolicySchema = z
  .object({
    enabled: z.boolean().default(true),
    fallbackOrder: z
      .array(z.enum(CLOUD_BURST_PROVIDERS))
      .min(1)
      .max(CLOUD_BURST_PROVIDERS.length)
      .default(["cua-cloud", "daytona", "orgo"]),
    preferDaytonaForHeadlessLinux: z.boolean().default(true),
  })
  .strict();
export type CloudBurstPolicy = z.output<typeof cloudBurstPolicySchema>;
export type CloudBurstPolicyInput = z.input<typeof cloudBurstPolicySchema>;

export const computerLeaseRequestSchema = z
  .object({
    agentId: z.string().trim().regex(SAFE_SLUG_INPUT),
    mode: z.enum(AGENT_LIFECYCLE_MODES),
    role: z.string().trim().regex(SAFE_SLUG_INPUT).optional(),
    project: z.string().trim().regex(SAFE_SLUG_INPUT).optional(),
    preferredProvider: z.enum(AGENT_COMPUTER_PROVIDERS).optional(),
    os: z.enum(COMPUTER_OS_FAMILIES).default("macos"),
    needsGui: z.boolean().default(true),
    allowCloudBurst: z.boolean().default(true),
    cpuCores: z.number().int().min(1).max(16).optional(),
    memoryGb: z.number().int().min(2).max(64).optional(),
  })
  .strict();
export type ComputerLeaseRequest = z.output<typeof computerLeaseRequestSchema>;
export type ComputerLeaseRequestInput = z.input<typeof computerLeaseRequestSchema>;

/** Non-secret MCP endpoint descriptor; runtime auth headers are attached in-memory only and never persisted to disk. */
export const computerMcpEndpointSchema = z
  .object({
    kind: z.enum(MCP_ENDPOINT_KINDS),
    toolSurface: z.enum(MCP_TOOL_SURFACES),
    command: z.string().min(1).max(1024).optional(),
    args: z.array(z.string().max(1024)).max(32).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().max(2048).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type ComputerMcpEndpoint = z.output<typeof computerMcpEndpointSchema>;

export const computerLeaseSchema = z
  .object({
    leaseId: z.string().uuid(),
    agentId: z.string().trim().regex(SAFE_SLUG_INPUT),
    provider: z.enum(AGENT_COMPUTER_PROVIDERS),
    requestedProvider: z.enum(AGENT_COMPUTER_PROVIDERS),
    burstedFrom: z.enum(AGENT_COMPUTER_PROVIDERS).nullable().default(null),
    mode: z.enum(AGENT_LIFECYCLE_MODES),
    os: z.enum(COMPUTER_OS_FAMILIES),
    role: z.string().trim().regex(SAFE_SLUG_INPUT).optional(),
    project: z.string().trim().regex(SAFE_SLUG_INPUT).optional(),
    instanceId: z.string().min(1).max(200),
    instanceName: z.string().min(1).max(200),
    state: z.enum(COMPUTER_LEASE_STATES),
    guestIp: z.string().max(120).nullable().default(null),
    vncPreviewUrl: z.string().max(2048).nullable().default(null),
    snapshotName: z.string().max(200).nullable().default(null),
    createdAt: z.number(),
    updatedAt: z.number(),
    lastUsedAt: z.number().nullable().default(null),
  })
  .strict();
export type ComputerLease = z.output<typeof computerLeaseSchema>;

export const providerAvailabilitySchema = z
  .object({
    provider: z.enum(AGENT_COMPUTER_PROVIDERS),
    available: z.boolean(),
    state: z.enum(PROVIDER_AVAILABILITY_STATES),
    reasonCode: z.enum(PROVIDER_REASON_CODES),
    message: z.string(),
    nextStep: z.string().nullable(),
    activeLeases: z.number().int().min(0),
    maxCapacity: z.number().int().min(0),
    supportedOs: z.array(z.enum(COMPUTER_OS_FAMILIES)),
    checkedAt: z.number(),
  })
  .strict();
export type ProviderAvailability = z.output<typeof providerAvailabilitySchema>;

export interface ProviderStatusWithCatalog {
  catalog: AgentComputerProviderCatalogEntry;
  status: ProviderAvailability;
}
