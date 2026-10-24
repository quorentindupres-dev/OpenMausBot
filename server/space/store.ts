import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { z } from "zod";

import { writeFileAtomic } from "../atomic.ts";
import { spaceBots } from "./bots.ts";
import { mirrorFromEnv } from "./mirror.ts";
import { DATA_DIR } from "../config.ts";
export { bindSpaceBots, spaceBots, type SpaceBot } from "./bots.ts";
import {
  EMPTY_SPACE, goalInputSchema, layoutSchema, goalPatchSchema, logInputSchema, normalizeGoal, signature, taskInputSchema, taskPatchSchema,
  type SpaceAsk, type SpaceGoal, type SpaceLogEntry, type SpaceState, type SpaceTask,
} from "../../shared/space.ts";

const MAX_LOG = 500;
const MAX_GOALS = 200;
const MAX_TASKS = 60;
const MAX_ASKS = 30;

export class SpaceInputError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

function parsed<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new SpaceInputError(400, issue ? `${issue.path.map(String).join(".") || "body"}: ${issue.message}` : "invalid body");
}

const ID = /^[\w-]{1,80}$/;

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
    };
  } catch {
    return structuredClone(EMPTY_SPACE);
  }
}

export type NoteAuthor = { id?: string; name: string };
export type SpaceStore = ReturnType<typeof createSpaceStore>;

export function createSpaceStore(file: string, options: { now?: () => number; saved?: (state: SpaceState) => void } = {}) {
  const now = options.now ?? Date.now;
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
    save({ ...all, goals: all.goals.map((candidate) => candidate.id === updated.id ? { ...updated, updatedAt: now() } : candidate) });
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
  const newTask = (text: string, botId?: string): SpaceTask => ({ id: randomUUID(), text, done: false, createdAt: now(), ...(botId ? { botId } : {}) });

  return {
    state: current,
    goal(id: string): SpaceGoal | undefined {
      return current().goals.find((candidate) => candidate.id === id);
    },
    createGoal(body: unknown): SpaceGoal {
      const input = parsed(goalInputSchema, body);
      const all = current();
      if (all.goals.length >= MAX_GOALS) throw new SpaceInputError(409, "too many Spaces");
      const at = now();
      const created: SpaceGoal = {
        ...input, tasks: [], asks: [],
        id: randomUUID(),
        sortOrder: input.sortOrder ?? Math.max(0, ...all.goals.map((candidate) => candidate.sortOrder + 1)),
        createdAt: at,
        updatedAt: at,
      };
      save({ ...all, goals: [...all.goals, created] });
      return created;
    },
    updateGoal(id: string, body: unknown): SpaceGoal {
      const patch = parsed(goalPatchSchema, body);
      return replace({ ...goal(id), ...patch });
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
      replace({ ...space, tasks: space.tasks.map((candidate) => candidate.id === taskId ? updated : candidate) });
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
      replace({ ...space, asks: space.asks.map((candidate) => candidate.id === askId ? answered : candidate), tasks: created ? [...space.tasks, created] : space.tasks });
      return answered;
    },
    /** A signed note. "outcome" with outcomeIndex ticks that outcome; "ask" also files an Ask on the Space. */
    addNote(goalId: string, body: unknown, author: NoteAuthor): SpaceLogEntry {
      const input = parsed(logInputSchema, body);
      const space = goal(goalId);
      const at = now();
      const entry: SpaceLogEntry = {
        id: randomUUID(), goalId, at, kind: input.kind, text: input.text,
        signature: signature(author.name, author.id, space.title, at),
        ...(author.id ? { botId: author.id, botName: author.name } : {}),
      };
      let next = space;
      if (input.kind === "outcome" && input.outcomeIndex !== undefined) {
        if (!space.outcomes[input.outcomeIndex]) throw new SpaceInputError(400, `this Space has no outcome ${input.outcomeIndex + 1}`);
        next = { ...next, outcomes: next.outcomes.map((outcome, index) => index === input.outcomeIndex ? { ...outcome, done: true } : outcome) };
      }
      if (input.kind === "ask") {
        if (!author.id) throw new SpaceInputError(400, "only a bot can file an ask");
        if (space.asks.filter((ask) => ask.status === "open").length >= MAX_ASKS) throw new SpaceInputError(409, "too many open asks in this Space");
        next = { ...next, asks: [...next.asks, { id: randomUUID(), botId: author.id, text: input.text, at, status: "open", ...(input.forBotId ? { forBotId: input.forBotId } : {}) }] };
      }
      const all = current();
      save({
        ...all,
        goals: all.goals.map((candidate) => candidate.id === goalId ? { ...next, updatedAt: next === space ? candidate.updatedAt : at } : candidate),
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
          id: randomUUID(), title: card.title.slice(0, 120), goal: "", level: "general", outcomes: [], roadmap: [], tasks: [], asks: [],
          status: "active", sortOrder: Math.max(0, ...goals.map((candidate) => candidate.sortOrder + 1)), kanbanCard: card.card, createdAt: at, updatedAt: at,
        };
        const roadmap = [...base.roadmap, ...card.roadmap.filter((step) => !base.roadmap.includes(step))].slice(0, 12);
        const tasks = [...base.tasks, ...card.tasks.filter((text) => !base.tasks.some((task) => task.text === text)).map((text) => newTask(text.slice(0, 200)))].slice(0, MAX_TASKS);
        const next = { ...base, roadmap, tasks, updatedAt: at };
        if (existing) { goals[index] = next; updated += 1; } else { goals.push(next); created += 1; }
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
