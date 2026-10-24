import { useCallback, useEffect, useState } from "react";
import { api, type Bot } from "@/state/store";
import { EMPTY_SPACE, type GoalInput, type GoalPatch, type SpaceGoal, type SpaceLayout, type SpaceState } from "../../../shared/space";

const POLL_MS = 3_000;

export type BoardState = SpaceState & { kanban?: boolean };

export function useSpace(): { space: BoardState; error: string | null; refresh(): Promise<void>; setSpace(next: BoardState | ((prev: BoardState) => BoardState)): void } {
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

export const createGoal = (input: GoalInput) => api<{ goal: SpaceGoal }>("/api/space/goals", json("POST", input));
export const updateGoal = (id: string, patch: GoalPatch) => api<{ goal: SpaceGoal }>(goalPath(id), json("PATCH", patch));
export const deleteGoal = (id: string) => api(goalPath(id), { method: "DELETE" });
export const placeBot = (botId: string, goalId: string | null) => api("/api/space/placements", json("PUT", { botId, goalId }));
export const linkThread = (threadId: string, goalId: string | null) => api(`/api/space/threads/${encodeURIComponent(threadId)}`, json("PUT", { goalId }));
export const loadThread = (botId: string, threadId: string) =>
  api<{ bot?: Bot }>(`/api/bots/${encodeURIComponent(botId)}/tasks/${encodeURIComponent(threadId)}?messages=80`, json("POST", {}));
export const setBench = (bench: SpaceLayout) => api("/api/space/settings", json("PATCH", { bench }));
export const setVisualFirst = (visualFirst: boolean) => api("/api/space/settings", json("PATCH", { visualFirst }));
export const addTask = (goalId: string, text: string, botId?: string) => api(`${goalPath(goalId)}/tasks`, json("POST", { text, ...(botId ? { botId } : {}) }));
export const patchTask = (goalId: string, taskId: string, patch: { text?: string; botId?: string | null; done?: boolean }) =>
  api(`${goalPath(goalId)}/tasks/${encodeURIComponent(taskId)}`, json("PATCH", patch));
export const deleteTask = (goalId: string, taskId: string) => api(`${goalPath(goalId)}/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
export const answerAsk = (goalId: string, askId: string, answer: "yes" | "no") => api(`${goalPath(goalId)}/asks/${encodeURIComponent(askId)}`, json("POST", { answer }));
export const importKanban = () => api<{ created: number; updated: number }>("/api/space/import-kanban", { method: "POST" });

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
    for (const task of bot.tasks ?? []) {
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
  const slots: SpaceSlot[] = threads.map((item) => ({ id: item.threadId, bot: item.bot, threadId: item.threadId, title: item.title }));
  for (const bot of bots) {
    if (space.placements[bot.id] === goalId && !threadedBots.has(bot.id)) {
      slots.push({ id: bot.id, bot });
    }
  }
  return slots;
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
