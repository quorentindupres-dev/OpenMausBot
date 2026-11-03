import { useCallback, useEffect, useState } from "react";
import { api, type Bot } from "@/state/store";
import type {
  AgentComputerProviderId,
  CloudBurstPolicy,
  ComputerLease,
  ComputerLeaseRequestInput,
  Mac2HostConfig,
  ProviderStatusWithCatalog,
} from "../../../shared/agent-computers";
import {
  EMPTY_SPACE,
  type A01BindingMode,
  type BotA01Binding,
  type CanvasArrowInput,
  type CanvasArrowPatch,
  type CanvasNodeInput,
  type CanvasNodePatch,
  type CanvasNoteInput,
  type CanvasNotePatch,
  type GoalInput,
  type GoalPatch,
  type SpaceCanvasArrow,
  type SpaceCanvasNode,
  type SpaceCanvasNote,
  type SpaceGoal,
  type SpaceLayout,
  type SpaceState,
  type WhiteboardBatchInput,
} from "../../../shared/space";

const POLL_MS = 3_000;

export interface A01LookMeta {
  key: string;
  label: string;
  accessory: string;
  layer: string;
  accent: string;
  archetype: string;
  tagline: string;
  badge: string;
  scale?: number;
  marker?: string;
}

export interface A01RoleListItem {
  id: string;
  name: string;
  group: string;
  look: string;
  lookMeta: A01LookMeta;
  kind: "main" | "mini";
  defaultTier: "steward" | "specialist" | "worker";
  parentRole: string;
  openmausId: string;
  mission: string;
  northStar: string;
  formulaCount: number;
  ruleCount: number;
  workflowCount: number;
  dbRefs: string[];
}

export interface A01Summary {
  available: boolean;
  total: number;
  mainCount: number;
  miniCount: number;
}

export interface A01FormulaItem {
  id: string;
  roleId: string;
  name: string;
  category: string;
  expression: string;
  inputs: string[];
  thresholds: Record<string, unknown>;
  whenToUse: string;
  sourceFile: string;
}

export interface A01RuleItem {
  id: string;
  roleId: string;
  severity: "hard_ban" | "must" | "prefer";
  rule: string;
  verifyCmdOrCheck: string;
  sourceFile: string;
}

export interface A01WorkflowItem {
  workflowSlug: string;
  title: string;
  goal: string;
  sourceFile: string;
}

export interface A01DbRefItem {
  dbId: string;
  tableOrCli: string;
  access: string;
  purpose: string;
}

export interface A01HindsightBrief {
  fleetDb: string;
  available: boolean;
  counts: { episodes: number; lessons: number; decisions: number; mistakes: number };
  episodes: Array<Record<string, unknown>>;
  lessons: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  mistakes: Array<Record<string, unknown>>;
  text: string;
}

export interface A01RoleCardBundle {
  role: string;
  name: string;
  kind: "main" | "mini";
  group: string;
  look: string;
  lookMeta: A01LookMeta;
  defaultTier: "steward" | "specialist" | "worker";
  parentRole: string;
  mode: A01BindingMode;
  memoryPolicy: "ephemeral_c01_only" | "hindsight_fleet_db";
  memoryWriteTarget: string;
  fleetDbWriteAllowed: boolean;
  project: string | null;
  mission: string;
  northStar: string;
  systemSummary: string;
  agentsSummary: string;
  systemMd: string;
  agentsMd: string;
  formulas: A01FormulaItem[];
  rules: A01RuleItem[];
  workflows: A01WorkflowItem[];
  dbRefs: A01DbRefItem[];
  hindsightBrief: A01HindsightBrief | null;
}

export interface A01BindReceipt {
  ok: true;
  agentId: string;
  role: string;
  tier: string;
  mode: A01BindingMode;
  project: string | null;
  host: string;
  memoryPolicy: "ephemeral_c01_only" | "hindsight_fleet_db";
  memoryWriteTarget: string;
  fleetDbPersisted: boolean;
  boundAt: string;
}

export interface A01SearchHit {
  roleId: string;
  docKind: string;
  itemId: string;
  title: string;
  body: string;
  sourceFile: string;
  rank: number;
}

export interface A01BindBotInput {
  role: string;
  mode: A01BindingMode;
  projectSlug?: string;
  computerProvider?: AgentComputerProviderId | string;
  computerLeaseId?: string;
  requireLease?: boolean;
}

export interface A01BindBotResponse {
  binding: BotA01Binding;
  receipt: A01BindReceipt;
  lease?: ComputerLease;
  leaseWarning?: string;
}

export type C02ReadinessStatus = "green" | "amber" | "red";

export interface C02ProjectCounts {
  products: number;
  acquisitionChannels: number;
  folders: number;
  refs: number;
  campaignNotes: number;
}

export interface C02ProjectSummaryItem {
  slug: string;
  title: string;
  kind: string;
  status: string;
  size: string | null;
  folderPath: string | null;
  siteUrl: string | null;
  workspaceRoots: string[];
  aliases: string[];
  readinessStatus: C02ReadinessStatus;
  readinessBadge: "🟢" | "🟠" | "🔴";
  readinessScore: string;
  whenToUse: string;
  hasDb: boolean;
  counts: C02ProjectCounts;
}

export interface C02ReadinessPillar {
  pillarNum: number;
  pillar: string;
  home: string;
  required: boolean;
  status: string;
  missingFields: string;
}

export interface C02ProductRow {
  sku: string;
  name: string;
  category: string | null;
  format: string;
  problemSolved: string | null;
  mechanismSpec: string | null;
  listPrice: number | null;
  listPriceText: string | null;
  unitCost: number | null;
  folderPath: string | null;
  offers: Array<Record<string, unknown>>;
  state: string;
}

export interface C02AcquisitionChannelRow {
  channelId: string;
  channel: string;
  howWeGetClients: string;
  entryFormats: string[];
  winningAngles: string[];
  maxCacLimit: number | null;
  breakevenMultiple: number | null;
  adAccountRef: string | null;
  pageRef: string | null;
  state: string;
}

export interface C02FunnelRow {
  funnelId: string;
  name: string;
  stepsFlow: string;
  entryUrl: string | null;
  storeRepo: string | null;
  trustMechanisms: string[];
  state: string;
}

export interface C02UnitEconomics {
  currency: string;
  targetAov: number | null;
  landedUnitCost: number | null;
  shippingCost: number | null;
  feePct: number | null;
  marginPct: number | null;
  maxCacLimit: number | null;
  paybackRule: string | null;
  paymentStack: string[];
}

export interface C02ProjectDetail {
  slug: string;
  title: string;
  kind: string;
  status: string;
  siteUrl: string | null;
  folderPath: string | null;
  hasDb: boolean;
  readiness: {
    status: C02ReadinessStatus;
    badge: "🟢" | "🟠" | "🔴";
    score: string;
    pillars: C02ReadinessPillar[];
    missingSummary: string[];
  };
  businessProfile: Record<string, unknown> | null;
  products: C02ProductRow[];
  avatars: Array<Record<string, unknown>>;
  acquisitionChannels: C02AcquisitionChannelRow[];
  funnels: C02FunnelRow[];
  unitEconomics: C02UnitEconomics | null;
  operations: Record<string, unknown> | null;
  facts: Array<Record<string, unknown>>;
  folders: Array<{ path: string; what: string; whenToUse: string; writer: string }>;
  refs: Array<{ ref: string; role: string; why: string; state: string }>;
  campaignNotes: Array<Record<string, unknown>>;
}

export interface C02DetectResult {
  target: string;
  slug: string;
  title: string;
  kind: string;
  matched: boolean;
  matchedBy: string;
  readinessStatus: C02ReadinessStatus;
  readinessScore: string;
  folderPath: string | null;
}

export interface SpaceComputersSnapshot {
  providers: ProviderStatusWithCatalog[];
  leases: ComputerLease[];
  mac2: Mac2HostConfig;
  burstPolicy: CloudBurstPolicy;
}

export interface SpaceComputerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
}

export interface SpaceComputerPreview {
  mimeType?: string;
  dataBase64?: string;
  vncUrl?: string | null;
  capturedAt?: number;
  [key: string]: unknown;
}

export interface SpaceComputersConfigPatch {
  mac2?: Partial<Mac2HostConfig>;
  burstPolicy?: Partial<CloudBurstPolicy>;
}

export interface WhiteboardBatchResponse {
  ok: boolean;
  canvasNotes: SpaceCanvasNote[];
  canvasArrows: SpaceCanvasArrow[];
  canvasNodes: SpaceCanvasNode[];
  botBindings: Record<string, BotA01Binding>;
  goals: SpaceGoal[];
}

export type BoardState = SpaceState & {
  kanban?: boolean;
  a01Summary?: A01Summary;
  c02Projects?: C02ProjectSummaryItem[];
};

export function useSpace(): {
  space: BoardState;
  error: string | null;
  refresh(): Promise<void>;
  setSpace(next: BoardState | ((prev: BoardState) => BoardState)): void;
} {
  const [space, setSpace] = useState<BoardState>(EMPTY_SPACE);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setSpace(await api<BoardState>("/api/space"));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { space, error, refresh, setSpace };
}

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
const goalPath = (id: string) => `/api/space/goals/${encodeURIComponent(id)}`;
const canvasNotePath = (id: string) => `/api/space/canvas-notes/${encodeURIComponent(id)}`;
const canvasArrowPath = (id: string) => `/api/space/canvas-arrows/${encodeURIComponent(id)}`;
const canvasNodePath = (id: string) => `/api/space/canvas-nodes/${encodeURIComponent(id)}`;

export const createGoal = (input: GoalInput) => api<{ goal: SpaceGoal }>("/api/space/goals", json("POST", input));
export const updateGoal = (id: string, patch: GoalPatch) => api<{ goal: SpaceGoal }>(goalPath(id), json("PATCH", patch));
export const deleteGoal = (id: string) => api(goalPath(id), { method: "DELETE" });
export const placeBot = (botId: string, goalId: string | null) => api("/api/space/placements", json("PUT", { botId, goalId }));
export const linkThread = (threadId: string, goalId: string | null) => api(`/api/space/threads/${encodeURIComponent(threadId)}`, json("PUT", { goalId }));
export const loadThread = (botId: string, threadId: string) =>
  api<{ bot?: Bot }>(`/api/bots/${encodeURIComponent(botId)}/tasks/${encodeURIComponent(threadId)}?messages=80`, json("POST", {}));
export const setBench = (bench: SpaceLayout) => api("/api/space/settings", json("PATCH", { bench }));
export const setVisualFirst = (visualFirst: boolean) => api("/api/space/settings", json("PATCH", { visualFirst }));
export const addTask = (goalId: string, text: string, botId?: string) =>
  api(`${goalPath(goalId)}/tasks`, json("POST", { text, ...(botId ? { botId } : {}) }));
export const patchTask = (goalId: string, taskId: string, patch: { text?: string; botId?: string | null; done?: boolean }) =>
  api(`${goalPath(goalId)}/tasks/${encodeURIComponent(taskId)}`, json("PATCH", patch));
export const deleteTask = (goalId: string, taskId: string) =>
  api(`${goalPath(goalId)}/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
export const answerAsk = (goalId: string, askId: string, answer: "yes" | "no") =>
  api(`${goalPath(goalId)}/asks/${encodeURIComponent(askId)}`, json("POST", { answer }));
export const importKanban = () => api<{ created: number; updated: number }>("/api/space/import-kanban", { method: "POST" });

// Whiteboard v1 + v2 Canvas Notes, Arrows, Nodes, Batch & Pinned Sessions
export const createCanvasNote = (input: CanvasNoteInput) => api<{ note: SpaceCanvasNote }>("/api/space/canvas-notes", json("POST", input));
export const updateCanvasNote = (id: string, patch: CanvasNotePatch) => api<{ note: SpaceCanvasNote }>(canvasNotePath(id), json("PATCH", patch));
export const deleteCanvasNote = (id: string) => api<{ ok: boolean }>(canvasNotePath(id), { method: "DELETE" });

export const createCanvasArrow = (input: CanvasArrowInput) => api<{ arrow: SpaceCanvasArrow }>("/api/space/canvas-arrows", json("POST", input));
export const updateCanvasArrow = (id: string, patch: CanvasArrowPatch) => api<{ arrow: SpaceCanvasArrow }>(canvasArrowPath(id), json("PATCH", patch));
export const deleteCanvasArrow = (id: string) => api<{ ok: boolean }>(canvasArrowPath(id), { method: "DELETE" });

export const createCanvasNode = (input: CanvasNodeInput) => api<{ node: SpaceCanvasNode }>("/api/space/canvas-nodes", json("POST", input));
export const updateCanvasNode = (id: string, patch: CanvasNodePatch) => api<{ node: SpaceCanvasNode }>(canvasNodePath(id), json("PATCH", patch));
export const deleteCanvasNode = (id: string) => api<{ ok: boolean }>(canvasNodePath(id), { method: "DELETE" });

export const applyWhiteboardBatch = (batch: WhiteboardBatchInput) =>
  api<WhiteboardBatchResponse>("/api/space/whiteboard/batch", json("POST", batch));

export const savePinnedSessions = (pinnedSessions: readonly string[]) =>
  api<{ pinnedSessions: string[] }>("/api/space/pinned-sessions", json("PUT", { pinnedSessions }));

// A01 Strict Registration API
export const fetchA01Roles = () =>
  api<{ roles: A01RoleListItem[]; summary: A01Summary }>("/api/space/a01/roles");

export const fetchA01RoleCard = (role: string, mode: A01BindingMode = "temporary", project?: string) => {
  const params = new URLSearchParams({ mode });
  if (project?.trim()) params.set("project", project.trim());
  return api<{ card: A01RoleCardBundle }>(`/api/space/a01/card/${encodeURIComponent(role)}?${params.toString()}`);
};

export const searchA01Roles = (query: string, limit = 20) => {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return api<{ query: string; count: number; hits: A01SearchHit[] }>(`/api/space/a01/search?${params.toString()}`);
};

export const bindBotA01Role = (botId: string, input: A01BindBotInput) =>
  api<A01BindBotResponse>(`/api/space/a01/bindings/${encodeURIComponent(botId)}`, json("PUT", input));

export const unbindBotA01Role = (botId: string) =>
  api<{ ok: boolean }>(`/api/space/a01/bindings/${encodeURIComponent(botId)}`, { method: "DELETE" });

export interface HireA01AgentInput {
  role: string;
  mode: A01BindingMode;
  projectSlug?: string;
  computerProvider?: AgentComputerProviderId | string;
  name?: string;
  fallbackTitle?: string;
  fallbackTagline?: string;
  goalId?: string;
  nodeId?: string;
  layout?: SpaceLayout;
  modelId?: string;
  persistNode?: boolean;
  requireLease?: boolean;
}

export interface HireA01AgentResult {
  bot: Bot;
  binding: BotA01Binding;
  receipt?: A01BindReceipt;
  lease?: ComputerLease;
  leaseWarning?: string;
  node?: SpaceCanvasNode;
  card?: A01RoleCardBundle;
}

/**
 * Strictly creates an OpenMausBot agent from a registered A01 role card, validates + binds its
 * lifecycle (`temporary` vs `long-term`), attaches its C02 project + Agent Computer lease, and
 * optionally persists its `a01-agent` node on `/api/space/canvas-nodes`.
 */
export async function hireA01Agent(input: HireA01AgentInput): Promise<HireA01AgentResult> {
  let card: A01RoleCardBundle | undefined;
  try {
    const res = await fetchA01RoleCard(input.role, input.mode, input.projectSlug);
    card = res?.card;
  } catch {
    // Allow fallback when card preview fetch is unavailable; PUT /api/space/a01/bindings/:botId enforces team.db strictly.
    card = undefined;
  }

  const resolvedRole = card?.role || input.role;
  const botName = (input.name?.trim() || card?.name || input.fallbackTitle || resolvedRole).slice(0, 100);
  const botTitle = (card?.lookMeta?.label || card?.name || input.fallbackTitle || botName).slice(0, 120);
  const botDescription = (card?.mission || card?.lookMeta?.tagline || input.fallbackTagline || "").slice(0, 240);

  const created = await api<{ bot: Bot }>(
    "/api/bots",
    json("POST", {
      name: botName,
      title: botTitle,
      ...(botDescription ? { description: botDescription } : {}),
    }),
  );
  const bot = created.bot;

  const bindRes = await bindBotA01Role(bot.id, {
    role: resolvedRole,
    mode: input.mode,
    ...(input.projectSlug?.trim() ? { projectSlug: input.projectSlug.trim() } : {}),
    ...(input.computerProvider ? { computerProvider: input.computerProvider } : {}),
    ...(input.requireLease !== undefined ? { requireLease: input.requireLease } : {}),
  });

  const binding: BotA01Binding = bindRes?.binding ?? {
    role: resolvedRole,
    mode: input.mode,
    ...(input.projectSlug?.trim() ? { projectSlug: input.projectSlug.trim() } : {}),
    ...(input.computerProvider ? { computerProvider: String(input.computerProvider) } : {}),
    boundAt: Date.now(),
  };

  if (input.goalId) {
    await placeBot(bot.id, input.goalId);
  }

  let savedNode: SpaceCanvasNode | undefined;
  if (input.persistNode !== false) {
    const resolvedLayout = input.layout ?? { x: 220, y: 160, w: 312, h: 184 };
    const nodeRes = await createCanvasNode({
      ...(input.nodeId ? { id: input.nodeId } : {}),
      kind: "a01-agent",
      title: bot.name,
      layout: resolvedLayout,
      botId: bot.id,
      ...(bot.threadId ? { threadId: bot.threadId } : {}),
      a01Role: binding.role,
      a01Mode: binding.mode,
      ...(binding.projectSlug ? { projectSlug: binding.projectSlug } : {}),
      ...(binding.computerProvider ? { computerProvider: binding.computerProvider } : {}),
      ...(binding.computerLeaseId ? { computerLeaseId: binding.computerLeaseId } : {}),
      ...(input.modelId ? { meta: { modelId: input.modelId } } : {}),
    });
    savedNode = nodeRes?.node;
  }

  return {
    bot,
    binding,
    ...(bindRes?.receipt ? { receipt: bindRes.receipt } : {}),
    ...(bindRes?.lease ? { lease: bindRes.lease } : {}),
    ...(bindRes?.leaseWarning ? { leaseWarning: bindRes.leaseWarning } : {}),
    ...(savedNode ? { node: savedNode } : {}),
    ...(card ? { card } : {}),
  };
}

// C02 First-Principles Business DB v2 API
export const fetchC02Projects = () =>
  api<{ projects: C02ProjectSummaryItem[] }>("/api/space/c02/projects");

export const fetchC02ProjectDetail = (slug: string) =>
  api<{ project: C02ProjectDetail }>(`/api/space/c02/projects/${encodeURIComponent(slug)}`);

export const detectC02Project = (target: string) =>
  api<C02DetectResult>(`/api/space/c02/detect?target=${encodeURIComponent(target)}`);

export const fetchC02Readiness = (slug?: string) =>
  api<Record<string, unknown>>(`/api/space/c02/readiness${slug?.trim() ? `?slug=${encodeURIComponent(slug.trim())}` : ""}`);

// Agent Computer Pool API
export const fetchSpaceComputers = () =>
  api<SpaceComputersSnapshot>("/api/space/computers");

export const leaseSpaceComputer = (
  input: Omit<ComputerLeaseRequestInput, "preferredProvider"> & { preferredProvider?: AgentComputerProviderId | string },
) => api<{ lease: ComputerLease }>("/api/space/computers/lease", json("POST", input));

export const execSpaceComputer = (leaseId: string, body: { command: string; cwd?: string; timeoutMs?: number }) =>
  api<{ result: SpaceComputerExecResult }>(`/api/space/computers/${encodeURIComponent(leaseId)}/exec`, json("POST", body));

export const previewSpaceComputer = (leaseId: string) =>
  api<{ preview: SpaceComputerPreview }>(`/api/space/computers/${encodeURIComponent(leaseId)}/preview`);

export const releaseSpaceComputer = (leaseId: string, action: "close" | "pause" | "destroy" = "close") =>
  api<{ lease: ComputerLease | null }>(`/api/space/computers/${encodeURIComponent(leaseId)}/release`, json("POST", { action }));

export const patchSpaceComputersConfig = (patch: SpaceComputersConfigPatch) =>
  api<{ mac2: Mac2HostConfig; burstPolicy: CloudBurstPolicy }>("/api/space/computers/config", json("PATCH", patch));

/** Opens a new thread for `botId`, titled after the Space and linked to it, and returns the created thread and updated bot. */
export async function createGoalThread(botId: string, goal: SpaceGoal, title: string = goal.title): Promise<{ threadId: string; bot?: Bot; title: string }> {
  const created = await api<{ bot?: Bot; task: { threadId: string; title?: string } }>(`/api/bots/${encodeURIComponent(botId)}/tasks`, json("POST", { title }));
  const threadId = created.task.threadId;
  await linkThread(threadId, goal.id);
  return { threadId, bot: created.bot, title: created.task.title || title };
}

/** Opens a new thread for `botId`, titled after the Space and linked to it, and returns its id. */
export async function newGoalThread(botId: string, goal: SpaceGoal, title: string = goal.title): Promise<string> {
  return (await createGoalThread(botId, goal, title)).threadId;
}

/** Creates a bot with the existing create-bot route and places it in the Space. */
export async function newAgentInSpace(name: string, goalId: string): Promise<Bot> {
  const created = await api<{ bot: Bot }>("/api/bots", json("POST", { name }));
  await placeBot(created.bot.id, goalId);
  return created.bot;
}

/** Starts a thread with the Chief of Staff and sends it the board's scan request. */
export async function askChiefToScan(chief: Bot): Promise<string> {
  const { text } = await api<{ text: string }>("/api/space/scan");
  const created = await api<{ task: { threadId: string } }>(`/api/bots/${encodeURIComponent(chief.id)}/tasks`, json("POST", { title: "Spaces scan" }));
  const threadId = created.task.threadId;
  await api(`/api/bots/${encodeURIComponent(chief.id)}/messages`, json("POST", { threadId, text, sendId: crypto.randomUUID() }));
  return threadId;
}

export type SpaceThread = { bot: Bot; threadId: string; title: string };
export type KnownThread = { botId: string; title: string; goalId: string | null };
export type SpaceSlot = { id: string; bot: Bot; threadId?: string; title?: string };

function threadGoalOf(space: SpaceState, known: Readonly<Record<string, KnownThread>>, threadId: string): string | null {
  return threadId in known ? known[threadId]!.goalId : (space.threadGoals[threadId] ?? null);
}

export function spaceThreads(space: SpaceState, bots: readonly Bot[], goalId: string, known: Readonly<Record<string, KnownThread>> = {}): SpaceThread[] {
  const seen = new Set<string>();
  const list: SpaceThread[] = [];
  for (const bot of bots) {
    const tasks = [...(bot.tasks ?? [])]
      .map((task, index) => ({ task, index }))
      .sort((a, b) => (a.task.createdAt !== undefined && b.task.createdAt !== undefined
        ? a.task.createdAt - b.task.createdAt || b.index - a.index
        : a.index - b.index))
      .map((entry) => entry.task);
    for (const task of tasks) {
      if (threadGoalOf(space, known, task.threadId) === goalId && !task.archivedAt) {
        seen.add(task.threadId);
        list.push({ bot, threadId: task.threadId, title: task.title });
      }
    }
  }
  for (const [threadId, info] of Object.entries(known)) {
    if (info.goalId !== goalId || seen.has(threadId)) continue;
    const bot = bots.find((candidate) => candidate.id === info.botId);
    if (bot) list.push({ bot, threadId, title: info.title });
  }
  return list;
}

export function spaceSlots(space: SpaceState, bots: readonly Bot[], goalId: string, known: Readonly<Record<string, KnownThread>> = {}): SpaceSlot[] {
  const threads = spaceThreads(space, bots, goalId, known);
  const threadedBots = new Set(threads.map((item) => item.bot.id));
  for (const bot of bots) {
    if ((bot.tasks ?? []).some((task) => threadGoalOf(space, known, task.threadId) === goalId)) {
      threadedBots.add(bot.id);
    }
  }
  const slots: SpaceSlot[] = threads.map((item) => ({ id: item.threadId, bot: item.bot, threadId: item.threadId, title: item.title }));
  for (const bot of bots) {
    if (space.placements[bot.id] === goalId && !threadedBots.has(bot.id)) {
      slots.push({ id: bot.id, bot });
    }
  }
  return slots;
}

export function slotBot(slot: SpaceSlot): Bot {
  if (!slot.threadId) return slot.bot;
  const task = slot.bot.tasks?.find((candidate) => candidate.threadId === slot.threadId);
  if (!task) return slot.bot;
  return {
    ...slot.bot,
    threadId: task.threadId,
    ...(task.modelSelection ? { modelSelection: task.modelSelection } : {}),
    ...(task.activity ? { activity: task.activity } : {}),
    ...(task.busy !== undefined ? { busy: task.busy } : {}),
  };
}

export function zoneBots(space: SpaceState, bots: readonly Bot[], goalId: string, known: Readonly<Record<string, KnownThread>> = {}): Bot[] {
  const inThreads = new Set(spaceThreads(space, bots, goalId, known).map((item) => item.bot.id));
  return bots.filter((bot) => space.placements[bot.id] === goalId || inThreads.has(bot.id));
}

export function benchBots(space: SpaceState, bots: readonly Bot[], known: Readonly<Record<string, KnownThread>> = {}): Bot[] {
  const goals = new Set(space.goals.map((goal) => goal.id));
  const activeBots = new Set<string>();
  for (const [botId, goalId] of Object.entries(space.placements)) {
    if (goals.has(goalId)) activeBots.add(botId);
  }
  for (const goal of space.goals) {
    for (const item of spaceThreads(space, bots, goal.id, known)) activeBots.add(item.bot.id);
  }
  return bots.filter((bot) => !activeBots.has(bot.id));
}

export function sortedGoals(goals: readonly SpaceGoal[]): SpaceGoal[] {
  const rank = { active: 0, parked: 1, done: 2 } as const;
  return [...goals].sort((a, b) => rank[a.status] - rank[b.status] || a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}
