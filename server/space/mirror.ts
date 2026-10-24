import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "../atomic.ts";
import { levelWords, type SpaceGoal, type SpaceLogEntry, type SpaceState } from "../../shared/space.ts";
import type { SpaceBot } from "./bots.ts";

export function botSlug(bot: SpaceBot, bots: readonly SpaceBot[]): string {
  const base = (name: string) => name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "bot";
  const slug = base(bot.name);
  return bots.some((other) => other.id !== bot.id && base(other.name) === slug) ? `${slug}-${bot.id.slice(0, 8)}` : slug;
}

function readLog(file: string): SpaceLogEntry[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").flatMap((line) => {
    try {
      return line.trim() ? [JSON.parse(line) as SpaceLogEntry] : [];
    } catch {
      return [];
    }
  });
}

const signed = (entry: SpaceLogEntry) => `- [${entry.kind}] ${entry.text} ${entry.signature}`;

function card(bot: SpaceBot, space: SpaceGoal | undefined, state: SpaceState, at: number): string {
  const mine = state.goals.flatMap((goal) => goal.tasks.filter((task) => task.botId === bot.id).map((task) => `- [${task.done ? "x" : " "}] ${task.text} (${goal.title})`));
  const doing = (bot.tasks ?? []).filter((task) => space && state.threadGoals[task.threadId] === space.id && task.title).map((task) => `- ${task.title}`);
  return [
    `# ${bot.name}`,
    "",
    `- id: ${bot.id}`,
    ...(bot.title ? [`- role: ${bot.title}`] : []),
    `- Space: ${space ? `${space.title} (${levelWords(space.level)})` : "bench"}`,
    ...(space?.goal ? [`- goal: ${space.goal}`] : []),
    "",
    "## Outcomes",
    ...(space?.outcomes.length ? space.outcomes.map((outcome) => `- [${outcome.done ? "x" : " "}] ${outcome.text}`) : ["- none"]),
    "",
    "## My tasks",
    ...(mine.length ? mine : ["- none"]),
    "",
    "## Now doing",
    ...(doing.length ? doing : ["- nothing linked to a Space"]),
    "",
    `updated: ${new Date(at).toISOString()}`,
    "",
  ].join("\n");
}

/** Mirrors the board into `root`: space.json, log.jsonl (every note ever written, oldest first) and one folder per bot.
 * A bot's folder is never deleted. */
export function mirrorSpace(root: string, state: SpaceState, bots: readonly SpaceBot[], at: number = Date.now()): void {
  mkdirSync(root, { recursive: true });
  writeFileAtomic(join(root, "space.json"), `${JSON.stringify({ ...state, bots: bots.map((bot) => ({ id: bot.id, name: bot.name, space: state.placements[bot.id] ?? null })) }, null, 2)}\n`);
  const logFile = join(root, "log.jsonl");
  const written = readLog(logFile);
  const seen = new Set(written.map((entry) => entry.id));
  const log = [...written, ...state.log.filter((entry) => !seen.has(entry.id))];
  writeFileAtomic(logFile, log.map((entry) => JSON.stringify(entry)).join("\n") + (log.length ? "\n" : ""));
  for (const bot of bots) {
    const notes = log.filter((entry) => entry.botId === bot.id);
    const space = state.goals.find((goal) => goal.id === state.placements[bot.id]);
    const involved = space || notes.length > 0 || state.goals.some((goal) => goal.tasks.some((task) => task.botId === bot.id));
    const folder = join(root, "agents", botSlug(bot, bots));
    if (!involved && !existsSync(folder)) continue;
    mkdirSync(folder, { recursive: true });
    writeFileAtomic(join(folder, "card.md"), card(bot, space, state, at));
    writeFileAtomic(join(folder, "notes.md"), [`# ${bot.name}: notes`, "", ...(notes.length ? [...notes].reverse().map(signed) : ["- none yet"]), ""].join("\n"));
  }
}

/** Off unless OMB_SPACE_C01_DIR names the folder. A failed mirror never fails the save it follows. */
export function mirrorFromEnv(state: SpaceState, bots: readonly SpaceBot[], env: NodeJS.ProcessEnv = process.env): void {
  const root = env.OMB_SPACE_C01_DIR?.trim();
  if (!root) return;
  try {
    mirrorSpace(root, state, bots);
  } catch (error) {
    console.warn(`space mirror: ${error instanceof Error ? error.message : String(error)}`);
  }
}
