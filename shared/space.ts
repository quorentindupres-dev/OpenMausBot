import { z } from "zod";

/** Highest first: the order of the board, the palette and every list. */
export const SPACE_LEVELS = ["P1", "P2", "P3", "general", "side"] as const;
export const MAX_OUTCOMES = 5;
export const MAX_ROADMAP = 12;
export const NOTE_KINDS = ["note", "outcome", "handoff", "ask"] as const;
export const A01_BINDING_MODES = ["temporary", "long-term"] as const;
export type A01BindingMode = (typeof A01_BINDING_MODES)[number];

const text = (max: number) => z.string().trim().max(max);

export const outcomeSchema = z.object({ text: text(160).min(1), done: z.boolean().default(false) });

const coordinate = z.number().finite().min(-100_000).max(100_000);
export const layoutSchema = z.object({ x: coordinate, y: coordinate, w: z.number().finite().min(80).max(4000), h: z.number().finite().min(60).max(8000) });
export const pointSchema = z.object({ x: coordinate, y: coordinate });
export type SpacePoint = z.output<typeof pointSchema>;

const spaceFields = {
  title: text(120).min(1),
  goal: text(240),
  icon: z.string().trim().max(300_000).optional(),
  level: z.enum(SPACE_LEVELS),
  outcomes: z.array(outcomeSchema).max(MAX_OUTCOMES),
  roadmap: z.array(text(160).min(1)).max(MAX_ROADMAP),
  status: z.enum(["active", "done", "parked"]),
  sortOrder: z.number().int(),
  kanbanCard: text(120),
  jobPath: text(400),
  projectSlug: text(120),
  defaultComputerProvider: text(80),
  layout: layoutSchema,
};

export const goalInputSchema = z.object({
  ...spaceFields,
  goal: spaceFields.goal.default(""),
  level: spaceFields.level.default("general"),
  outcomes: spaceFields.outcomes.default([]),
  roadmap: spaceFields.roadmap.default([]),
  status: spaceFields.status.default("active"),
  sortOrder: spaceFields.sortOrder.optional(),
  kanbanCard: spaceFields.kanbanCard.optional(),
  jobPath: spaceFields.jobPath.optional(),
  projectSlug: spaceFields.projectSlug.optional(),
  defaultComputerProvider: spaceFields.defaultComputerProvider.optional(),
  layout: spaceFields.layout.optional(),
});

export const goalPatchSchema = z.object({
  ...spaceFields,
  icon: z.string().trim().max(300_000).nullable(),
  projectSlug: text(120).nullable(),
  defaultComputerProvider: text(80).nullable(),
}).partial().strict();

export const CANVAS_NOTE_COLORS = ["yellow", "blue", "green", "pink", "neutral"] as const;
export const NOTE_COLORS = CANVAS_NOTE_COLORS;
export type CanvasNoteColor = (typeof CANVAS_NOTE_COLORS)[number];
export const canvasNoteInputSchema = z.object({
  id: text(120).min(1).optional(),
  text: text(2000).default(""),
  color: z.enum(CANVAS_NOTE_COLORS).default("yellow"),
  layout: layoutSchema,
});
export const canvasNotePatchSchema = z.object({
  text: text(2000),
  color: z.enum(CANVAS_NOTE_COLORS),
  layout: layoutSchema,
}).partial().strict();
export type CanvasNoteInput = z.input<typeof canvasNoteInputSchema>;
export type CanvasNotePatch = z.input<typeof canvasNotePatchSchema>;
export interface SpaceCanvasNote {
  id: string;
  text: string;
  color: CanvasNoteColor;
  layout: SpaceLayout;
  createdAt: number;
  updatedAt: number;
}

const botIdSchema = z.string().regex(/^[\w-]{1,80}$/);
const entityIdSchema = text(120).min(1);

export const canvasArrowInputSchema = z.object({
  id: entityIdSchema.optional(),
  fromId: entityIdSchema,
  toId: entityIdSchema,
  fromAnchor: text(40).optional(),
  toAnchor: text(40).optional(),
  fromPoint: pointSchema.optional(),
  toPoint: pointSchema.optional(),
  label: text(240).optional(),
  color: text(40).optional(),
});
export const canvasArrowPatchSchema = z.object({
  fromId: entityIdSchema,
  toId: entityIdSchema,
  fromAnchor: text(40).nullable(),
  toAnchor: text(40).nullable(),
  fromPoint: pointSchema.nullable(),
  toPoint: pointSchema.nullable(),
  label: text(240).nullable(),
  color: text(40).nullable(),
}).partial().strict();
export type CanvasArrowInput = z.input<typeof canvasArrowInputSchema>;
export type CanvasArrowPatch = z.input<typeof canvasArrowPatchSchema>;
export interface SpaceCanvasArrow {
  id: string;
  fromId: string;
  toId: string;
  fromAnchor?: string;
  toAnchor?: string;
  fromPoint?: SpacePoint;
  toPoint?: SpacePoint;
  label?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export const CANVAS_NODE_KINDS = ["session", "a01-agent", "c02-project", "computer", "text", "emoji"] as const;
export type CanvasNodeKind = (typeof CANVAS_NODE_KINDS)[number];
export const canvasNodeLayoutSchema = z.object({
  x: coordinate,
  y: coordinate,
  w: z.number().finite().min(24).max(4000),
  h: z.number().finite().min(24).max(8000),
});

export const canvasNodeInputSchema = z.object({
  id: entityIdSchema.optional(),
  kind: z.enum(CANVAS_NODE_KINDS),
  title: text(240).default(""),
  layout: canvasNodeLayoutSchema,
  botId: botIdSchema.optional(),
  threadId: text(120).optional(),
  a01Role: text(80).optional(),
  a01Mode: z.enum(A01_BINDING_MODES).optional(),
  projectSlug: text(120).optional(),
  computerProvider: text(80).optional(),
  computerLeaseId: text(120).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export const canvasNodePatchSchema = z.object({
  kind: z.enum(CANVAS_NODE_KINDS),
  title: text(240),
  layout: canvasNodeLayoutSchema,
  botId: botIdSchema.nullable(),
  threadId: text(120).nullable(),
  a01Role: text(80).nullable(),
  a01Mode: z.enum(A01_BINDING_MODES).nullable(),
  projectSlug: text(120).nullable(),
  computerProvider: text(80).nullable(),
  computerLeaseId: text(120).nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
}).partial().strict();
export type CanvasNodeInput = z.input<typeof canvasNodeInputSchema>;
export type CanvasNodePatch = z.input<typeof canvasNodePatchSchema>;
export interface SpaceCanvasNode {
  id: string;
  kind: CanvasNodeKind;
  title: string;
  layout: SpaceLayout;
  botId?: string;
  threadId?: string;
  a01Role?: string;
  a01Mode?: A01BindingMode;
  projectSlug?: string;
  computerProvider?: string;
  computerLeaseId?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export const botBindingInputSchema = z.object({
  role: text(80).min(1),
  mode: z.enum(A01_BINDING_MODES).default("temporary"),
  projectSlug: text(120).optional(),
  computerProvider: text(80).optional(),
  computerLeaseId: text(120).optional(),
  boundAt: z.number().finite().optional(),
});
export type BotBindingInput = z.input<typeof botBindingInputSchema>;
export interface BotA01Binding {
  role: string;
  mode: A01BindingMode;
  projectSlug?: string;
  computerProvider?: string;
  computerLeaseId?: string;
  boundAt: number;
}

export const pinnedSessionsSchema = z.array(text(160).min(1)).max(100);

export const whiteboardBatchSchema = z.object({
  addNotes: z.array(canvasNoteInputSchema).max(200).optional(),
  patchNotes: z.array(z.object({ id: entityIdSchema, patch: canvasNotePatchSchema })).max(200).optional(),
  deleteNoteIds: z.array(entityIdSchema).max(200).optional(),
  addArrows: z.array(canvasArrowInputSchema).max(500).optional(),
  patchArrows: z.array(z.object({ id: entityIdSchema, patch: canvasArrowPatchSchema })).max(500).optional(),
  deleteArrowIds: z.array(entityIdSchema).max(500).optional(),
  addNodes: z.array(canvasNodeInputSchema).max(200).optional(),
  patchNodes: z.array(z.object({ id: entityIdSchema, patch: canvasNodePatchSchema })).max(200).optional(),
  deleteNodeIds: z.array(entityIdSchema).max(200).optional(),
}).strict();
export type WhiteboardBatchInput = z.input<typeof whiteboardBatchSchema>;

export const taskInputSchema = z.object({ text: text(200).min(1), botId: botIdSchema.optional() });
export const taskPatchSchema = z.object({ text: text(200).min(1), botId: botIdSchema.nullable(), done: z.boolean() }).partial().strict();

export const logInputSchema = z.object({
  text: text(500).min(1),
  kind: z.enum(NOTE_KINDS).default("note"),
  botId: botIdSchema.optional(),
  outcomeIndex: z.number().int().min(0).max(MAX_OUTCOMES - 1).optional(),
  forBotId: botIdSchema.optional(),
});

export type GoalInput = z.input<typeof goalInputSchema>;
export type GoalPatch = z.input<typeof goalPatchSchema>;
export type SpaceLevel = (typeof SPACE_LEVELS)[number];
export type GoalStatus = "active" | "done" | "parked";
export type NoteKind = (typeof NOTE_KINDS)[number];

/** Where a tile sits on the canvas, in canvas units. */
export type SpaceLayout = z.output<typeof layoutSchema>;

export interface SpaceOutcome { text: string; done: boolean }

/** One piece of work in a Space, owned by at most one of its agents. */
export interface SpaceTask { id: string; text: string; botId?: string; done: boolean; createdAt: number }

/** An agent's offer to pick something up (`forBotId`: a teammate it proposes instead); a yes turns it into a task
 * assigned to that bot. */
export interface SpaceAsk { id: string; botId: string; forBotId?: string; text: string; at: number; status: "open" | "yes" | "no"; taskId?: string }

/** A Space on the board, one per goal. `kanbanCard`, `jobPath`, and `projectSlug` link it to Kanban, C01, and C02. */
export interface SpaceGoal {
  id: string;
  title: string;
  goal: string;
  icon?: string;
  level: SpaceLevel;
  outcomes: SpaceOutcome[];
  roadmap: string[];
  tasks: SpaceTask[];
  asks: SpaceAsk[];
  status: GoalStatus;
  sortOrder: number;
  kanbanCard?: string;
  jobPath?: string;
  projectSlug?: string;
  defaultComputerProvider?: string;
  layout?: SpaceLayout;
  createdAt: number;
  updatedAt: number;
}

/** A signed note: `signature` is "— name (id) · Space · ISO time", fixed when it is written. */
export interface SpaceLogEntry {
  id: string;
  goalId: string;
  botId?: string;
  botName?: string;
  at: number;
  kind: NoteKind;
  text: string;
  signature: string;
}

/** `placements`: bot id to Space id, one Space per bot; a bot with no entry is on the bench.
 * `threadGoals`: thread id to Space id, set when a thread is opened from a Space. */
export interface SpaceState {
  goals: SpaceGoal[];
  placements: Record<string, string>;
  threadGoals: Record<string, string>;
  log: SpaceLogEntry[];
  visualFirst: boolean;
  /** The bench tile's place on the canvas. */
  bench?: SpaceLayout;
  /** Free-floating sticky/text notes on the canvas. */
  canvasNotes?: SpaceCanvasNote[];
  /** Magnetic connector arrows between canvas nodes and tiles. */
  canvasArrows?: SpaceCanvasArrow[];
  /** Session, A01 agent, C02 project, computer, text, and emoji nodes on the canvas. */
  canvasNodes?: SpaceCanvasNode[];
  /** Session/thread IDs pinned as floating quick-access windows. */
  pinnedSessions?: string[];
  /** Validated A01 role + lifecycle + C02 project + computer lease bindings keyed by botId. */
  botBindings?: Record<string, BotA01Binding>;
}

export const EMPTY_SPACE: SpaceState = {
  goals: [],
  placements: {},
  threadGoals: {},
  log: [],
  visualFirst: false,
  canvasNotes: [],
  canvasArrows: [],
  canvasNodes: [],
  pinnedSessions: [],
  botBindings: {},
};

export function signature(name: string, botId: string | undefined, space: string, at: number): string {
  return `— ${name}${botId ? ` (${botId})` : ""} · ${space} · ${new Date(at).toISOString()}`;
}

const LEVEL_WORDS: Record<SpaceLevel, string> = {
  P1: "P1 (top priority)", P2: "P2 (high priority)", P3: "P3 (normal priority)", general: "General", side: "Side quest",
};

export const levelWords = (level: SpaceLevel): string => LEVEL_WORDS[level];

const OLD_PRIORITIES: Record<string, SpaceLevel> = { P0: "P1", P1: "P2", P2: "P3" };

type LegacyGoal = Partial<SpaceGoal> & { kind?: unknown; priority?: unknown; outcome?: unknown; kpis?: Array<{ label?: unknown; current?: unknown; target?: unknown }> };

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function levelOf(raw: LegacyGoal): SpaceLevel {
  if (SPACE_LEVELS.includes(raw.level as SpaceLevel)) return raw.level as SpaceLevel;
  if (raw.kind === "side") return "side";
  return typeof raw.priority === "string" && Object.hasOwn(OLD_PRIORITIES, raw.priority) ? OLD_PRIORITIES[raw.priority]! : "general";
}

/** Reads a Space saved by any version: P0, P1 and P2 become P1, P2 and P3, a side quest the side level; a
 * first-version goal's outcome becomes its goal line and its KPIs its outcomes. */
export function normalizeGoal(raw: LegacyGoal): SpaceGoal {
  const kpis = Array.isArray(raw.kpis) ? raw.kpis : [];
  const outcomes = Array.isArray(raw.outcomes)
    ? raw.outcomes.filter((item) => item && typeof item.text === "string").map((item) => ({ text: item.text, done: item.done === true }))
    : kpis.filter((kpi) => typeof kpi?.label === "string").map((kpi) => ({
      text: [kpi.label, [kpi.current, kpi.target].filter((part) => typeof part === "string" && part).join(" / ")].filter(Boolean).join(": "),
      done: false,
    }));
  return {
    id: String(raw.id),
    title: typeof raw.title === "string" ? raw.title : "",
    goal: typeof raw.goal === "string" ? raw.goal : typeof raw.outcome === "string" ? raw.outcome : "",
    level: levelOf(raw),
    outcomes: outcomes.slice(0, MAX_OUTCOMES),
    roadmap: strings(raw.roadmap).slice(0, MAX_ROADMAP),
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    asks: Array.isArray(raw.asks) ? raw.asks : [],
    status: raw.status === "done" || raw.status === "parked" ? raw.status : "active",
    sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : 0,
    ...(typeof raw.icon === "string" && raw.icon.trim() ? { icon: raw.icon.trim() } : {}),
    ...(raw.kanbanCard ? { kanbanCard: raw.kanbanCard } : {}),
    ...(raw.jobPath ? { jobPath: raw.jobPath } : {}),
    ...(typeof raw.projectSlug === "string" && raw.projectSlug.trim() ? { projectSlug: raw.projectSlug.trim() } : {}),
    ...(typeof raw.defaultComputerProvider === "string" && raw.defaultComputerProvider.trim()
      ? { defaultComputerProvider: raw.defaultComputerProvider.trim() }
      : {}),
    ...(raw.layout && layoutSchema.safeParse(raw.layout).success ? { layout: raw.layout } : {}),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

export function normalizeCanvasNote(raw: Partial<SpaceCanvasNote>): SpaceCanvasNote | null {
  if (!raw || typeof raw.id !== "string" || !raw.layout || !layoutSchema.safeParse(raw.layout).success) return null;
  const color = CANVAS_NOTE_COLORS.includes(raw.color as CanvasNoteColor) ? (raw.color as CanvasNoteColor) : "yellow";
  return {
    id: raw.id,
    text: typeof raw.text === "string" ? raw.text.slice(0, 2000) : "",
    color,
    layout: raw.layout,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

export function normalizeCanvasArrow(raw: Partial<SpaceCanvasArrow>): SpaceCanvasArrow | null {
  if (!raw || typeof raw.id !== "string" || !raw.id.trim()) return null;
  if (typeof raw.fromId !== "string" || !raw.fromId.trim() || typeof raw.toId !== "string" || !raw.toId.trim()) return null;
  const fromPoint = raw.fromPoint && pointSchema.safeParse(raw.fromPoint).success ? raw.fromPoint : undefined;
  const toPoint = raw.toPoint && pointSchema.safeParse(raw.toPoint).success ? raw.toPoint : undefined;
  return {
    id: raw.id.trim().slice(0, 120),
    fromId: raw.fromId.trim().slice(0, 120),
    toId: raw.toId.trim().slice(0, 120),
    ...(typeof raw.fromAnchor === "string" && raw.fromAnchor.trim() ? { fromAnchor: raw.fromAnchor.trim().slice(0, 40) } : {}),
    ...(typeof raw.toAnchor === "string" && raw.toAnchor.trim() ? { toAnchor: raw.toAnchor.trim().slice(0, 40) } : {}),
    ...(fromPoint ? { fromPoint } : {}),
    ...(toPoint ? { toPoint } : {}),
    ...(typeof raw.label === "string" && raw.label.trim() ? { label: raw.label.trim().slice(0, 240) } : {}),
    ...(typeof raw.color === "string" && raw.color.trim() ? { color: raw.color.trim().slice(0, 40) } : {}),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

export function normalizeCanvasNode(raw: Partial<SpaceCanvasNode>): SpaceCanvasNode | null {
  if (!raw || typeof raw.id !== "string" || !raw.id.trim()) return null;
  const rawKind = raw.kind as string | undefined;
  const kind: CanvasNodeKind | null = CANVAS_NODE_KINDS.includes(rawKind as CanvasNodeKind)
    ? (rawKind as CanvasNodeKind)
    : rawKind === "agent"
      ? "a01-agent"
      : rawKind === "project"
        ? "c02-project"
        : null;
  if (!kind || !raw.layout || !canvasNodeLayoutSchema.safeParse(raw.layout).success) return null;
  const a01Mode = A01_BINDING_MODES.includes(raw.a01Mode as A01BindingMode) ? (raw.a01Mode as A01BindingMode) : undefined;
  return {
    id: raw.id.trim().slice(0, 120),
    kind,
    title: typeof raw.title === "string" ? raw.title.trim().slice(0, 240) : "",
    layout: raw.layout,
    ...(typeof raw.botId === "string" && botIdSchema.safeParse(raw.botId).success ? { botId: raw.botId } : {}),
    ...(typeof raw.threadId === "string" && raw.threadId.trim() ? { threadId: raw.threadId.trim().slice(0, 120) } : {}),
    ...(typeof raw.a01Role === "string" && raw.a01Role.trim() ? { a01Role: raw.a01Role.trim().slice(0, 80) } : {}),
    ...(a01Mode ? { a01Mode } : {}),
    ...(typeof raw.projectSlug === "string" && raw.projectSlug.trim() ? { projectSlug: raw.projectSlug.trim().slice(0, 120) } : {}),
    ...(typeof raw.computerProvider === "string" && raw.computerProvider.trim() ? { computerProvider: raw.computerProvider.trim().slice(0, 80) } : {}),
    ...(typeof raw.computerLeaseId === "string" && raw.computerLeaseId.trim() ? { computerLeaseId: raw.computerLeaseId.trim().slice(0, 120) } : {}),
    ...(raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta) ? { meta: raw.meta } : {}),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

export function normalizeBotBinding(raw: Partial<BotA01Binding>): BotA01Binding | null {
  if (!raw || typeof raw.role !== "string" || !raw.role.trim()) return null;
  const mode: A01BindingMode = A01_BINDING_MODES.includes(raw.mode as A01BindingMode) ? (raw.mode as A01BindingMode) : "temporary";
  return {
    role: raw.role.trim().slice(0, 80),
    mode,
    ...(typeof raw.projectSlug === "string" && raw.projectSlug.trim() ? { projectSlug: raw.projectSlug.trim().slice(0, 120) } : {}),
    ...(typeof raw.computerProvider === "string" && raw.computerProvider.trim() ? { computerProvider: raw.computerProvider.trim().slice(0, 80) } : {}),
    ...(typeof raw.computerLeaseId === "string" && raw.computerLeaseId.trim() ? { computerLeaseId: raw.computerLeaseId.trim().slice(0, 120) } : {}),
    boundAt: typeof raw.boundAt === "number" ? raw.boundAt : 0,
  };
}
