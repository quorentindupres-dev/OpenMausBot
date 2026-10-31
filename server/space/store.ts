import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { z } from "zod";

import { writeFileAtomic } from "../atomic.ts";
import { DATA_DIR } from "../config.ts";
import { spaceBots } from "./bots.ts";
import { detectC02Project } from "./c02-bridge.ts";
import { SpaceInputError } from "./errors.ts";
import { mirrorFromEnv } from "./mirror.ts";
export { bindSpaceBots, spaceBots, type SpaceBot } from "./bots.ts";
export { SpaceInputError } from "./errors.ts";
import {
  botBindingInputSchema,
  canvasArrowInputSchema,
  canvasArrowPatchSchema,
  canvasNodeInputSchema,
  canvasNodePatchSchema,
  canvasNoteInputSchema,
  canvasNotePatchSchema,
  EMPTY_SPACE,
  goalInputSchema,
  goalPatchSchema,
  layoutSchema,
  logInputSchema,
  normalizeBotBinding,
  normalizeCanvasArrow,
  normalizeCanvasNode,
  normalizeCanvasNote,
  normalizeGoal,
  pinnedSessionsSchema,
  signature,
  taskInputSchema,
  taskPatchSchema,
  whiteboardBatchSchema,
  type BotA01Binding,
  type CanvasArrowInput,
  type CanvasArrowPatch,
  type CanvasNodeInput,
  type CanvasNodePatch,
  type SpaceAsk,
  type SpaceCanvasArrow,
  type SpaceCanvasNode,
  type SpaceCanvasNote,
  type SpaceGoal,
  type SpaceLogEntry,
  type SpaceState,
  type SpaceTask,
} from "../../shared/space.ts";

const MAX_LOG = 500;
const MAX_GOALS = 200;
const MAX_TASKS = 60;
const MAX_ASKS = 30;
const MAX_CANVAS_NOTES = 200;
const MAX_CANVAS_ARROWS = 500;
const MAX_CANVAS_NODES = 200;

function parsed<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new SpaceInputError(400, issue ? `${issue.path.map(String).join(".") || "body"}: ${issue.message}` : "invalid body");
}

const ID = /^[\w-]{1,80}$/;

function normalizeBindingsMap(raw: unknown): Record<string, BotA01Binding> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, BotA01Binding> = {};
  for (const [botId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ID.test(botId) || !value || typeof value !== "object") continue;
    const normalized = normalizeBotBinding(value as Partial<BotA01Binding>);
    if (normalized) out[botId] = normalized;
  }
  return out;
}

function normalizePinnedSessions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, 160);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 100) break;
  }
  return out;
}

function readState(file: string): SpaceState {
  if (!existsSync(file)) return structuredClone(EMPTY_SPACE);
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<SpaceState>;
    return {
      goals: Array.isArray(raw.goals) ? raw.goals.map(normalizeGoal) : [],
      placements: raw.placements && typeof raw.placements === "object" ? raw.placements : {},
      threadGoals: raw.threadGoals && typeof raw.threadGoals === "object" ? raw.threadGoals : {},
      log: Array.isArray(raw.log) ? raw.log.map((entry) => ({ ...entry, signature: entry.signature ?? "" })) : [],
      visualFirst: raw.visualFirst === true,
      ...(raw.bench && layoutSchema.safeParse(raw.bench).success ? { bench: raw.bench } : {}),
      canvasNotes: Array.isArray(raw.canvasNotes)
        ? raw.canvasNotes.map(normalizeCanvasNote).filter((note): note is SpaceCanvasNote => note !== null)
        : [],
      canvasArrows: Array.isArray(raw.canvasArrows)
        ? raw.canvasArrows.map(normalizeCanvasArrow).filter((arrow): arrow is SpaceCanvasArrow => arrow !== null)
        : [],
      canvasNodes: Array.isArray(raw.canvasNodes)
        ? raw.canvasNodes.map(normalizeCanvasNode).filter((node): node is SpaceCanvasNode => node !== null)
        : [],
      pinnedSessions: normalizePinnedSessions(raw.pinnedSessions),
      botBindings: normalizeBindingsMap(raw.botBindings),
    };
  } catch {
    return structuredClone(EMPTY_SPACE);
  }
}

function defaultDetectProjectSlug(jobPath: string): string | undefined {
  try {
    const res = detectC02Project(jobPath);
    return res.matched && res.slug && res.slug !== "uncategorized" ? res.slug : undefined;
  } catch {
    return undefined;
  }
}

function buildArrowRecord(input: z.output<typeof canvasArrowInputSchema>, at: number): SpaceCanvasArrow {
  return {
    id: input.id ?? randomUUID(),
    fromId: input.fromId,
    toId: input.toId,
    ...(input.fromAnchor ? { fromAnchor: input.fromAnchor } : {}),
    ...(input.toAnchor ? { toAnchor: input.toAnchor } : {}),
    ...(input.fromPoint ? { fromPoint: input.fromPoint } : {}),
    ...(input.toPoint ? { toPoint: input.toPoint } : {}),
    ...(input.label ? { label: input.label } : {}),
    ...(input.color ? { color: input.color } : {}),
    createdAt: at,
    updatedAt: at,
  };
}

function applyArrowPatch(existing: SpaceCanvasArrow, patch: z.output<typeof canvasArrowPatchSchema>, at: number): SpaceCanvasArrow {
  const next: SpaceCanvasArrow = {
    ...existing,
    ...(patch.fromId !== undefined ? { fromId: patch.fromId } : {}),
    ...(patch.toId !== undefined ? { toId: patch.toId } : {}),
    updatedAt: at,
  };
  if (patch.fromAnchor === null || patch.fromAnchor === "") delete next.fromAnchor;
  else if (patch.fromAnchor !== undefined) next.fromAnchor = patch.fromAnchor;

  if (patch.toAnchor === null || patch.toAnchor === "") delete next.toAnchor;
  else if (patch.toAnchor !== undefined) next.toAnchor = patch.toAnchor;

  if (patch.fromPoint === null) delete next.fromPoint;
  else if (patch.fromPoint !== undefined) next.fromPoint = patch.fromPoint;

  if (patch.toPoint === null) delete next.toPoint;
  else if (patch.toPoint !== undefined) next.toPoint = patch.toPoint;

  if (patch.label === null || patch.label === "") delete next.label;
  else if (patch.label !== undefined) next.label = patch.label;

  if (patch.color === null || patch.color === "") delete next.color;
  else if (patch.color !== undefined) next.color = patch.color;

  return next;
}

function buildNodeRecord(input: z.output<typeof canvasNodeInputSchema>, at: number): SpaceCanvasNode {
  return {
    id: input.id ?? randomUUID(),
    kind: input.kind,
    title: input.title,
    layout: input.layout,
    ...(input.botId ? { botId: input.botId } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.a01Role ? { a01Role: input.a01Role } : {}),
    ...(input.a01Mode ? { a01Mode: input.a01Mode } : {}),
    ...(input.projectSlug ? { projectSlug: input.projectSlug } : {}),
    ...(input.computerProvider ? { computerProvider: input.computerProvider } : {}),
    ...(input.computerLeaseId ? { computerLeaseId: input.computerLeaseId } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
    createdAt: at,
    updatedAt: at,
  };
}

function applyNodePatch(existing: SpaceCanvasNode, patch: z.output<typeof canvasNodePatchSchema>, at: number): SpaceCanvasNode {
  const next: SpaceCanvasNode = {
    ...existing,
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.layout !== undefined ? { layout: patch.layout } : {}),
    updatedAt: at,
  };
  if (patch.botId === null) delete next.botId;
  else if (patch.botId !== undefined) next.botId = patch.botId;

  if (patch.threadId === null || patch.threadId === "") delete next.threadId;
  else if (patch.threadId !== undefined) next.threadId = patch.threadId;

  if (patch.a01Role === null || patch.a01Role === "") delete next.a01Role;
  else if (patch.a01Role !== undefined) next.a01Role = patch.a01Role;

  if (patch.a01Mode === null) delete next.a01Mode;
  else if (patch.a01Mode !== undefined) next.a01Mode = patch.a01Mode;

  if (patch.projectSlug === null || patch.projectSlug === "") delete next.projectSlug;
  else if (patch.projectSlug !== undefined) next.projectSlug = patch.projectSlug;

  if (patch.computerProvider === null || patch.computerProvider === "") delete next.computerProvider;
  else if (patch.computerProvider !== undefined) next.computerProvider = patch.computerProvider;

  if (patch.computerLeaseId === null || patch.computerLeaseId === "") delete next.computerLeaseId;
  else if (patch.computerLeaseId !== undefined) next.computerLeaseId = patch.computerLeaseId;

  if (patch.meta === null) delete next.meta;
  else if (patch.meta !== undefined) next.meta = patch.meta;

  return next;
}

/**
 * Semantic arrow wiring: connecting a `c02-project` node to a `session` / `a01-agent` node (or Space goal)
 * auto-binds `projectSlug` onto that target node and any matching `botBindings[botId]` entry.
 */
function applyArrowSemanticBindings(
  arrowsToApply: readonly SpaceCanvasArrow[],
  stateIn: {
    goals: SpaceGoal[];
    nodes: SpaceCanvasNode[];
    bindings: Record<string, BotA01Binding>;
  },
  at: number,
): {
  goals: SpaceGoal[];
  nodes: SpaceCanvasNode[];
  bindings: Record<string, BotA01Binding>;
} {
  let { goals, nodes, bindings } = stateIn;

  for (const arrow of arrowsToApply) {
    const fromNode = nodes.find((n) => n.id === arrow.fromId);
    const toNode = nodes.find((n) => n.id === arrow.toId);

    const projectNode =
      fromNode?.kind === "c02-project" && fromNode.projectSlug
        ? fromNode
        : toNode?.kind === "c02-project" && toNode.projectSlug
          ? toNode
          : null;
    if (!projectNode || !projectNode.projectSlug) continue;

    const projectSlug = projectNode.projectSlug;
    const otherNode = projectNode === fromNode ? toNode : fromNode;

    if (otherNode && (otherNode.kind === "session" || otherNode.kind === "a01-agent")) {
      nodes = nodes.map((candidate) =>
        candidate.id === otherNode.id ? { ...candidate, projectSlug, updatedAt: at } : candidate,
      );
      if (otherNode.botId) {
        const existingBinding = bindings[otherNode.botId];
        if (existingBinding) {
          bindings = {
            ...bindings,
            [otherNode.botId]: { ...existingBinding, projectSlug },
          };
        } else if (otherNode.a01Role) {
          bindings = {
            ...bindings,
            [otherNode.botId]: {
              role: otherNode.a01Role,
              mode: otherNode.a01Mode ?? "temporary",
              projectSlug,
              ...(otherNode.computerProvider ? { computerProvider: otherNode.computerProvider } : {}),
              ...(otherNode.computerLeaseId ? { computerLeaseId: otherNode.computerLeaseId } : {}),
              boundAt: at,
            },
          };
        }
      }
    }

    const otherId = projectNode === fromNode ? arrow.toId : arrow.fromId;
    if (goals.some((g) => g.id === otherId)) {
      goals = goals.map((g) => (g.id === otherId ? { ...g, projectSlug, updatedAt: at } : g));
    }
  }

  return { goals, nodes, bindings };
}

export type NoteAuthor = { id?: string; name: string };
export type SpaceStore = ReturnType<typeof createSpaceStore>;

export function createSpaceStore(
  file: string,
  options: {
    now?: () => number;
    saved?: (state: SpaceState) => void;
    detectProject?: (jobPath: string) => string | undefined;
  } = {},
) {
  const now = options.now ?? Date.now;
  const detectProject = options.detectProject ?? defaultDetectProjectSlug;
  let state: SpaceState | null = null;
  const current = (): SpaceState => (state ??= readState(file));
  const save = (next: SpaceState): SpaceState => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileAtomic(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    state = next;
    options.saved?.(next);
    return next;
  };
  const goal = (id: string): SpaceGoal => {
    const found = current().goals.find((candidate) => candidate.id === id);
    if (!found) throw new SpaceInputError(404, "no such Space");
    return found;
  };
  const replace = (updated: SpaceGoal): SpaceGoal => {
    const all = current();
    save({ ...all, goals: all.goals.map((candidate) => (candidate.id === updated.id ? { ...updated, updatedAt: now() } : candidate)) });
    return goal(updated.id);
  };
  const goalIdOrNull = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") throw new SpaceInputError(400, "goalId must be a string or null");
    return goal(value).id;
  };
  const checkId = (value: unknown, name: string): string => {
    if (typeof value !== "string" || !ID.test(value)) throw new SpaceInputError(400, `${name} is not a valid id`);
    return value;
  };
  const task = (space: SpaceGoal, taskId: string): SpaceTask => {
    const found = space.tasks.find((candidate) => candidate.id === taskId);
    if (!found) throw new SpaceInputError(404, "no such task");
    return found;
  };
  const newTask = (text: string, botId?: string): SpaceTask => ({
    id: randomUUID(),
    text,
    done: false,
    createdAt: now(),
    ...(botId ? { botId } : {}),
  });

  return {
    state: current,
    goal(id: string): SpaceGoal | undefined {
      return current().goals.find((candidate) => candidate.id === id);
    },
    createGoal(body: unknown): SpaceGoal {
      const { icon, projectSlug, defaultComputerProvider, ...input } = parsed(goalInputSchema, body);
      const all = current();
      if (all.goals.length >= MAX_GOALS) throw new SpaceInputError(409, "too many Spaces");
      const at = now();
      const resolvedProjectSlug =
        projectSlug && projectSlug.trim()
          ? projectSlug.trim()
          : input.jobPath
            ? detectProject(input.jobPath)
            : undefined;
      const created: SpaceGoal = {
        ...input,
        ...(icon ? { icon } : {}),
        ...(resolvedProjectSlug ? { projectSlug: resolvedProjectSlug } : {}),
        ...(defaultComputerProvider ? { defaultComputerProvider } : {}),
        tasks: [],
        asks: [],
        id: randomUUID(),
        sortOrder: input.sortOrder ?? Math.max(0, ...all.goals.map((candidate) => candidate.sortOrder + 1)),
        createdAt: at,
        updatedAt: at,
      };
      save({ ...all, goals: [...all.goals, created] });
      return created;
    },
    updateGoal(id: string, body: unknown): SpaceGoal {
      const { icon, projectSlug, defaultComputerProvider, ...patch } = parsed(goalPatchSchema, body);
      const existing = goal(id);
      const next: SpaceGoal = {
        ...existing,
        ...patch,
      };
      if (icon === null || icon === "") delete next.icon;
      else if (typeof icon === "string") next.icon = icon;

      if (projectSlug === null || projectSlug === "") {
        delete next.projectSlug;
      } else if (typeof projectSlug === "string") {
        next.projectSlug = projectSlug;
      } else if (patch.jobPath && !next.projectSlug) {
        const autoSlug = detectProject(patch.jobPath);
        if (autoSlug) next.projectSlug = autoSlug;
      }

      if (defaultComputerProvider === null || defaultComputerProvider === "") {
        delete next.defaultComputerProvider;
      } else if (typeof defaultComputerProvider === "string") {
        next.defaultComputerProvider = defaultComputerProvider;
      }

      return replace(next);
    },
    deleteGoal(id: string): void {
      goal(id);
      const all = current();
      const keep = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).filter(([, goalId]) => goalId !== id));
      save({
        ...all,
        goals: all.goals.filter((candidate) => candidate.id !== id),
        placements: keep(all.placements),
        threadGoals: keep(all.threadGoals),
        log: all.log.filter((entry) => entry.goalId !== id),
        canvasArrows: (all.canvasArrows ?? []).filter((arrow) => arrow.fromId !== id && arrow.toId !== id),
      });
    },
    place(botId: unknown, goalId: unknown): Record<string, string> {
      const bot = checkId(botId, "botId");
      const target = goalIdOrNull(goalId);
      const { [bot]: _previous, ...rest } = current().placements;
      return save({ ...current(), placements: target ? { ...rest, [bot]: target } : rest }).placements;
    },
    linkThread(threadId: unknown, goalId: unknown): Record<string, string> {
      const thread = checkId(threadId, "threadId");
      const target = goalIdOrNull(goalId);
      const { [thread]: _previous, ...rest } = current().threadGoals;
      return save({ ...current(), threadGoals: target ? { ...rest, [thread]: target } : rest }).threadGoals;
    },
    bindBot(botId: unknown, body: unknown): BotA01Binding {
      const bot = checkId(botId, "botId");
      const input = parsed(botBindingInputSchema, body);
      const all = current();
      const binding: BotA01Binding = {
        role: input.role,
        mode: input.mode,
        ...(input.projectSlug ? { projectSlug: input.projectSlug } : {}),
        ...(input.computerProvider ? { computerProvider: input.computerProvider } : {}),
        ...(input.computerLeaseId ? { computerLeaseId: input.computerLeaseId } : {}),
        boundAt: input.boundAt ?? now(),
      };
      save({
        ...all,
        botBindings: { ...all.botBindings, [bot]: binding },
      });
      return binding;
    },
    unbindBot(botId: unknown): boolean {
      const bot = checkId(botId, "botId");
      const all = current();
      const bindings = all.botBindings ?? {};
      if (!Object.hasOwn(bindings, bot)) return false;
      const { [bot]: _removed, ...rest } = bindings;
      save({ ...all, botBindings: rest });
      return true;
    },
    getBotBinding(botId: string): BotA01Binding | undefined {
      return current().botBindings?.[botId];
    },
    addTask(goalId: string, body: unknown): SpaceTask {
      const input = parsed(taskInputSchema, body);
      const space = goal(goalId);
      if (space.tasks.length >= MAX_TASKS) throw new SpaceInputError(409, "too many tasks in this Space");
      const created = newTask(input.text, input.botId);
      replace({ ...space, tasks: [...space.tasks, created] });
      return created;
    },
    updateTask(goalId: string, taskId: string, body: unknown): SpaceTask {
      const patch = parsed(taskPatchSchema, body);
      const space = goal(goalId);
      const { botId, ...rest } = patch;
      const before = task(space, taskId);
      const { botId: _old, ...unassigned } = before;
      const updated: SpaceTask = { ...(botId === null ? unassigned : before), ...rest, ...(botId ? { botId } : {}) };
      replace({ ...space, tasks: space.tasks.map((candidate) => (candidate.id === taskId ? updated : candidate)) });
      return updated;
    },
    deleteTask(goalId: string, taskId: string): void {
      const space = goal(goalId);
      task(space, taskId);
      replace({ ...space, tasks: space.tasks.filter((candidate) => candidate.id !== taskId) });
    },
    answerAsk(goalId: string, askId: string, answer: unknown): SpaceAsk {
      if (answer !== "yes" && answer !== "no") throw new SpaceInputError(400, "answer must be yes or no");
      const space = goal(goalId);
      const ask = space.asks.find((candidate) => candidate.id === askId);
      if (!ask) throw new SpaceInputError(404, "no such ask");
      if (ask.status !== "open") throw new SpaceInputError(409, "this ask was already answered");
      const created = answer === "yes" ? newTask(ask.text, ask.forBotId ?? ask.botId) : null;
      const answered: SpaceAsk = { ...ask, status: answer, ...(created ? { taskId: created.id } : {}) };
      replace({
        ...space,
        asks: space.asks.map((candidate) => (candidate.id === askId ? answered : candidate)),
        tasks: created ? [...space.tasks, created] : space.tasks,
      });
      return answered;
    },
    /** A signed note. "outcome" with outcomeIndex ticks that outcome; "ask" also files an Ask on the Space. */
    addNote(goalId: string, body: unknown, author: NoteAuthor): SpaceLogEntry {
      const input = parsed(logInputSchema, body);
      const space = goal(goalId);
      const at = now();
      const entry: SpaceLogEntry = {
        id: randomUUID(),
        goalId,
        at,
        kind: input.kind,
        text: input.text,
        signature: signature(author.name, author.id, space.title, at),
        ...(author.id ? { botId: author.id, botName: author.name } : {}),
      };
      let next = space;
      if (input.kind === "outcome" && input.outcomeIndex !== undefined) {
        if (!space.outcomes[input.outcomeIndex]) throw new SpaceInputError(400, `this Space has no outcome ${input.outcomeIndex + 1}`);
        next = {
          ...next,
          outcomes: next.outcomes.map((outcome, index) => (index === input.outcomeIndex ? { ...outcome, done: true } : outcome)),
        };
      }
      if (input.kind === "ask") {
        if (!author.id) throw new SpaceInputError(400, "only a bot can file an ask");
        if (space.asks.filter((ask) => ask.status === "open").length >= MAX_ASKS) throw new SpaceInputError(409, "too many open asks in this Space");
        next = {
          ...next,
          asks: [
            ...next.asks,
            {
              id: randomUUID(),
              botId: author.id,
              text: input.text,
              at,
              status: "open",
              ...(input.forBotId ? { forBotId: input.forBotId } : {}),
            },
          ],
        };
      }
      const all = current();
      save({
        ...all,
        goals: all.goals.map((candidate) => (candidate.id === goalId ? { ...next, updatedAt: next === space ? candidate.updatedAt : at } : candidate)),
        log: [...all.log, entry].slice(-MAX_LOG),
      });
      return entry;
    },
    setBench(layout: unknown): SpaceState["bench"] {
      return save({ ...current(), bench: parsed(layoutSchema, layout) }).bench;
    },
    setVisualFirst(on: unknown): boolean {
      if (typeof on !== "boolean") throw new SpaceInputError(400, "visualFirst must be true or false");
      return save({ ...current(), visualFirst: on }).visualFirst;
    },
    addCanvasNote(body: unknown): SpaceCanvasNote {
      const input = parsed(canvasNoteInputSchema, body);
      const all = current();
      const list = all.canvasNotes ?? [];
      if (list.length >= MAX_CANVAS_NOTES) throw new SpaceInputError(409, "too many canvas notes");
      const at = now();
      const note: SpaceCanvasNote = {
        id: input.id ?? randomUUID(),
        text: input.text,
        color: input.color,
        layout: input.layout,
        createdAt: at,
        updatedAt: at,
      };
      save({ ...all, canvasNotes: [...list.filter((n) => n.id !== note.id), note] });
      return note;
    },
    patchCanvasNote(id: string, body: unknown): SpaceCanvasNote | null {
      const patch = parsed(canvasNotePatchSchema, body);
      const all = current();
      const list = all.canvasNotes ?? [];
      const existing = list.find((candidate) => candidate.id === id);
      if (!existing) return null;
      const updated: SpaceCanvasNote = { ...existing, ...patch, updatedAt: now() };
      save({ ...all, canvasNotes: list.map((candidate) => (candidate.id === id ? updated : candidate)) });
      return updated;
    },
    deleteCanvasNote(id: string): boolean {
      const all = current();
      const list = all.canvasNotes ?? [];
      if (!list.some((candidate) => candidate.id === id)) return false;
      save({ ...all, canvasNotes: list.filter((candidate) => candidate.id !== id) });
      return true;
    },
    addCanvasArrow(body: CanvasArrowInput | unknown): SpaceCanvasArrow {
      const input = parsed(canvasArrowInputSchema, body);
      const all = current();
      const list = all.canvasArrows ?? [];
      if (list.length >= MAX_CANVAS_ARROWS) throw new SpaceInputError(409, "too many canvas arrows");
      const at = now();
      const arrow = buildArrowRecord(input, at);
      const nextArrows = [...list.filter((a) => a.id !== arrow.id), arrow];
      const wired = applyArrowSemanticBindings(
        [arrow],
        {
          goals: all.goals,
          nodes: all.canvasNodes ?? [],
          bindings: all.botBindings ?? {},
        },
        at,
      );
      save({
        ...all,
        goals: wired.goals,
        canvasNodes: wired.nodes,
        botBindings: wired.bindings,
        canvasArrows: nextArrows,
      });
      return arrow;
    },
    patchCanvasArrow(id: string, body: CanvasArrowPatch | unknown): SpaceCanvasArrow | null {
      const patch = parsed(canvasArrowPatchSchema, body);
      const all = current();
      const list = all.canvasArrows ?? [];
      const existing = list.find((candidate) => candidate.id === id);
      if (!existing) return null;
      const at = now();
      const updated = applyArrowPatch(existing, patch, at);
      const wired = applyArrowSemanticBindings(
        [updated],
        {
          goals: all.goals,
          nodes: all.canvasNodes ?? [],
          bindings: all.botBindings ?? {},
        },
        at,
      );
      save({
        ...all,
        goals: wired.goals,
        canvasNodes: wired.nodes,
        botBindings: wired.bindings,
        canvasArrows: list.map((candidate) => (candidate.id === id ? updated : candidate)),
      });
      return updated;
    },
    deleteCanvasArrow(id: string): boolean {
      const all = current();
      const list = all.canvasArrows ?? [];
      if (!list.some((candidate) => candidate.id === id)) return false;
      save({ ...all, canvasArrows: list.filter((candidate) => candidate.id !== id) });
      return true;
    },
    addCanvasNode(body: CanvasNodeInput | unknown): SpaceCanvasNode {
      const input = parsed(canvasNodeInputSchema, body);
      const all = current();
      const list = all.canvasNodes ?? [];
      if (list.length >= MAX_CANVAS_NODES) throw new SpaceInputError(409, "too many canvas nodes");
      const at = now();
      const node = buildNodeRecord(input, at);
      save({ ...all, canvasNodes: [...list.filter((n) => n.id !== node.id), node] });
      return node;
    },
    patchCanvasNode(id: string, body: CanvasNodePatch | unknown): SpaceCanvasNode | null {
      const patch = parsed(canvasNodePatchSchema, body);
      const all = current();
      const list = all.canvasNodes ?? [];
      const existing = list.find((candidate) => candidate.id === id);
      if (!existing) return null;
      const updated = applyNodePatch(existing, patch, now());
      save({ ...all, canvasNodes: list.map((candidate) => (candidate.id === id ? updated : candidate)) });
      return updated;
    },
    deleteCanvasNode(id: string): boolean {
      const all = current();
      const list = all.canvasNodes ?? [];
      if (!list.some((candidate) => candidate.id === id)) return false;
      save({
        ...all,
        canvasNodes: list.filter((candidate) => candidate.id !== id),
        canvasArrows: (all.canvasArrows ?? []).filter((arrow) => arrow.fromId !== id && arrow.toId !== id),
      });
      return true;
    },
    setPinnedSessions(body: unknown): string[] {
      const rawList =
        body && typeof body === "object" && !Array.isArray(body) && "pinnedSessions" in body
          ? (body as { pinnedSessions?: unknown }).pinnedSessions
          : body;
      const validated = parsed(pinnedSessionsSchema, rawList);
      const deduped = normalizePinnedSessions(validated);
      save({ ...current(), pinnedSessions: deduped });
      return deduped;
    },
    applyWhiteboardBatch(body: unknown): SpaceState {
      const batch = parsed(whiteboardBatchSchema, body);
      const all = current();
      const at = now();

      const deleteNoteSet = new Set(batch.deleteNoteIds ?? []);
      let notes = (all.canvasNotes ?? []).filter((n) => !deleteNoteSet.has(n.id));
      for (const item of batch.patchNotes ?? []) {
        notes = notes.map((n) => (n.id === item.id ? { ...n, ...item.patch, updatedAt: at } : n));
      }
      for (const item of batch.addNotes ?? []) {
        const created: SpaceCanvasNote = {
          id: item.id ?? randomUUID(),
          text: item.text,
          color: item.color,
          layout: item.layout,
          createdAt: at,
          updatedAt: at,
        };
        notes = [...notes.filter((n) => n.id !== created.id), created];
      }
      if (notes.length > MAX_CANVAS_NOTES) throw new SpaceInputError(409, "too many canvas notes");

      const deleteNodeSet = new Set(batch.deleteNodeIds ?? []);
      let nodes = (all.canvasNodes ?? []).filter((n) => !deleteNodeSet.has(n.id));
      for (const item of batch.patchNodes ?? []) {
        nodes = nodes.map((n) => (n.id === item.id ? applyNodePatch(n, item.patch, at) : n));
      }
      for (const item of batch.addNodes ?? []) {
        const created = buildNodeRecord(item, at);
        nodes = [...nodes.filter((n) => n.id !== created.id), created];
      }
      if (nodes.length > MAX_CANVAS_NODES) throw new SpaceInputError(409, "too many canvas nodes");

      const deleteArrowSet = new Set(batch.deleteArrowIds ?? []);
      let arrows = (all.canvasArrows ?? []).filter(
        (a) => !deleteArrowSet.has(a.id) && !deleteNodeSet.has(a.fromId) && !deleteNodeSet.has(a.toId),
      );
      const touchedArrows: SpaceCanvasArrow[] = [];
      for (const item of batch.patchArrows ?? []) {
        arrows = arrows.map((a) => {
          if (a.id !== item.id) return a;
          const updated = applyArrowPatch(a, item.patch, at);
          touchedArrows.push(updated);
          return updated;
        });
      }
      for (const item of batch.addArrows ?? []) {
        const created = buildArrowRecord(item, at);
        touchedArrows.push(created);
        arrows = [...arrows.filter((a) => a.id !== created.id), created];
      }
      if (arrows.length > MAX_CANVAS_ARROWS) throw new SpaceInputError(409, "too many canvas arrows");

      const wired = applyArrowSemanticBindings(
        touchedArrows,
        {
          goals: all.goals,
          nodes,
          bindings: all.botBindings ?? {},
        },
        at,
      );

      return save({
        ...all,
        goals: wired.goals,
        canvasNotes: notes,
        canvasNodes: wired.nodes,
        canvasArrows: arrows,
        botBindings: wired.bindings,
      });
    },
    /** Adds Spaces, or fills the ones already linked to a card; never removes what is there. */
    importCards(cards: ReadonlyArray<{ card: string; title: string; roadmap: string[]; tasks: string[] }>): { created: number; updated: number } {
      let created = 0;
      let updated = 0;
      const all = current();
      const at = now();
      const goals = [...all.goals];
      for (const card of cards) {
        const index = goals.findIndex((candidate) => candidate.kanbanCard === card.card);
        const existing = index >= 0 ? goals[index]! : null;
        const base: SpaceGoal = existing ?? {
          id: randomUUID(),
          title: card.title.slice(0, 120),
          goal: "",
          level: "general",
          outcomes: [],
          roadmap: [],
          tasks: [],
          asks: [],
          status: "active",
          sortOrder: Math.max(0, ...goals.map((candidate) => candidate.sortOrder + 1)),
          kanbanCard: card.card,
          createdAt: at,
          updatedAt: at,
        };
        const roadmap = [...base.roadmap, ...card.roadmap.filter((step) => !base.roadmap.includes(step))].slice(0, 12);
        const tasks = [
          ...base.tasks,
          ...card.tasks.filter((text) => !base.tasks.some((task) => task.text === text)).map((text) => newTask(text.slice(0, 200))),
        ].slice(0, MAX_TASKS);
        const next = { ...base, roadmap, tasks, updatedAt: at };
        if (existing) {
          goals[index] = next;
          updated += 1;
        } else {
          goals.push(next);
          created += 1;
        }
      }
      save({ ...all, goals });
      return { created, updated };
    },
  };
}

let shared: SpaceStore | null = null;

export function spaceStore(): SpaceStore {
  return (shared ??= createSpaceStore(join(DATA_DIR, "space.json"), { saved: (state) => mirrorFromEnv(state, spaceBots()) }));
}
