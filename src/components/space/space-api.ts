import { useCallback, useEffect, useState } from "react";
import { api, type Bot } from "@/state/store";
import { EMPTY_SPACE, type GoalInput, type GoalPatch, type SpaceGoal, type SpaceLayout, type SpaceState } from "../../../shared/space";

const POLL_MS = 3_000;

export type BoardState = SpaceState & { kanban?: boolean };

export function useSpace(): { space: BoardState; error: string | null; refresh(): Promise<void>; setSpace(next: BoardState): void } {
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
export const setBench = (bench: SpaceLayout) => api("/api/space/settings", json("PATCH", { bench }));
export const setVisualFirst = (visualFirst: boolean) => api("/api/space/settings", json("PATCH", { visualFirst }));
export const addTask = (goalId: string, text: string, botId?: string) => api(`${goalPath(goalId)}/tasks`, json("POST", { text, ...(botId ? { botId } : {}) }));
export const patchTask = (goalId: string, taskId: string, patch: { text?: string; botId?: string | null; done?: boolean }) =>
  api(`${goalPath(goalId)}/tasks/${encodeURIComponent(taskId)}`, json("PATCH", patch));
export const deleteTask = (goalId: string, taskId: string) => api(`${goalPath(goalId)}/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
export const answerAsk = (goalId: string, askId: string, answer: "yes" | "no") => api(`${goalPath(goalId)}/asks/${encodeURIComponent(askId)}`, json("POST", { answer }));
export const importKanban = () => api<{ created: number; updated: number }>("/api/space/import-kanban", { method: "POST" });

/** Opens a new thread for `botId`, titled after the Space and linked to it, and returns its id. */
export async function newGoalThread(botId: string, goal: SpaceGoal, title: string = goal.title): Promise<string> {
  const created = await api<{ bot: Bot; task: { threadId: string } }>(`/api/bots/${encodeURIComponent(botId)}/tasks`, json("POST", { title }));
  const threadId = created.task.threadId;
  await api(`/api/space/threads/${encodeURIComponent(threadId)}`, json("PUT", { goalId: goal.id }));
  return threadId;
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

export function spaceThreads(space: SpaceState, bots: readonly Bot[], goalId: string): SpaceThread[] {
  return bots.flatMap((bot) => (bot.tasks ?? [])
    .filter((task) => space.threadGoals[task.threadId] === goalId && !task.archivedAt)
    .map((task) => ({ bot, threadId: task.threadId, title: task.title })));
}

export function zoneBots(space: SpaceState, bots: readonly Bot[], goalId: string): Bot[] {
  return bots.filter((bot) => space.placements[bot.id] === goalId);
}

export function benchBots(space: SpaceState, bots: readonly Bot[]): Bot[] {
  const goals = new Set(space.goals.map((goal) => goal.id));
  return bots.filter((bot) => !goals.has(space.placements[bot.id] ?? ""));
}

export function sortedGoals(goals: readonly SpaceGoal[]): SpaceGoal[] {
  const rank = { active: 0, parked: 1, done: 2 } as const;
  return [...goals].sort((a, b) => rank[a.status] - rank[b.status] || a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}
