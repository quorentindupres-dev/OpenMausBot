import { z } from "zod";

/** Highest first: the order of the board, the palette and every list. */
export const SPACE_LEVELS = ["P1", "P2", "P3", "general", "side"] as const;
export const MAX_OUTCOMES = 5;
export const MAX_ROADMAP = 12;
export const NOTE_KINDS = ["note", "outcome", "handoff", "ask"] as const;

const text = (max: number) => z.string().trim().max(max);

export const outcomeSchema = z.object({ text: text(160).min(1), done: z.boolean().default(false) });

const coordinate = z.number().finite().min(-100_000).max(100_000);
export const layoutSchema = z.object({ x: coordinate, y: coordinate, w: z.number().finite().min(80).max(4000), h: z.number().finite().min(60).max(8000) });

const spaceFields = {
  title: text(120).min(1),
  goal: text(240),
  level: z.enum(SPACE_LEVELS),
  outcomes: z.array(outcomeSchema).max(MAX_OUTCOMES),
  roadmap: z.array(text(160).min(1)).max(MAX_ROADMAP),
  status: z.enum(["active", "done", "parked"]),
  sortOrder: z.number().int(),
  kanbanCard: text(120),
  jobPath: text(400),
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
  layout: spaceFields.layout.optional(),
});

export const goalPatchSchema = z.object(spaceFields).partial().strict();

const botIdSchema = z.string().regex(/^[\w-]{1,80}$/);

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

/** A Space on the board, one per goal. `kanbanCard` and `jobPath` link it to the owner's board and job folder. */
export interface SpaceGoal {
  id: string;
  title: string;
  goal: string;
  level: SpaceLevel;
  outcomes: SpaceOutcome[];
  roadmap: string[];
  tasks: SpaceTask[];
  asks: SpaceAsk[];
  status: GoalStatus;
  sortOrder: number;
  kanbanCard?: string;
  jobPath?: string;
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
}

export const EMPTY_SPACE: SpaceState = { goals: [], placements: {}, threadGoals: {}, log: [], visualFirst: false };

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
    ...(raw.kanbanCard ? { kanbanCard: raw.kanbanCard } : {}),
    ...(raw.jobPath ? { jobPath: raw.jobPath } : {}),
    ...(raw.layout && layoutSchema.safeParse(raw.layout).success ? { layout: raw.layout } : {}),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}
