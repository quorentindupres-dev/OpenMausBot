import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createSpaceStore, SpaceInputError } from "./store.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const AT = Date.UTC(2026, 9, 23, 12, 0, 0);

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "omb-space-"));
  dirs.push(dir);
  const file = join(dir, "space.json");
  return { file, store: createSpaceStore(file, { now: () => AT }) };
}

describe("the Spaces store", () => {
  it("creates a Space with defaults and keeps it after a reload", () => {
    const { file, store } = fresh();
    const goal = store.createGoal({ title: "  Website up  ", goal: "Site converts", outcomes: [{ text: "Lighthouse ≥ 90" }], roadmap: ["audit", "fix"] });
    expect(goal).toMatchObject({ title: "Website up", goal: "Site converts", level: "general", status: "active", tasks: [], asks: [], roadmap: ["audit", "fix"] });
    expect(goal.outcomes).toEqual([{ text: "Lighthouse ≥ 90", done: false }]);
    expect(createSpaceStore(file).state().goals).toEqual([goal]);
  });

  it("refuses a Space without a name or with more than five outcomes", () => {
    const { store } = fresh();
    expect(() => store.createGoal({ title: "" })).toThrow(SpaceInputError);
    expect(() => store.createGoal({ title: "x", outcomes: [1, 2, 3, 4, 5, 6].map((n) => ({ text: `o${n}` })) })).toThrow(/outcomes/);
  });

  it("reads a first-version goal: its outcome becomes the goal line and its KPIs the outcomes", () => {
    const { file } = fresh();
    writeFileSync(file, JSON.stringify({ goals: [{ id: "g", title: "Web", kind: "quest", priority: "P0", outcome: "Every page passes", kpis: [{ label: "Pages live", current: "4", target: "12" }], status: "active", sortOrder: 0 }] }));
    expect(createSpaceStore(file).state().goals[0]).toMatchObject({ level: "P1", goal: "Every page passes", outcomes: [{ text: "Pages live: 4 / 12", done: false }], roadmap: [], tasks: [], asks: [] });
  });

  it("maps the old priorities and kinds onto the five levels", () => {
    const { file } = fresh();
    const old = (extra: Record<string, unknown>) => ({ id: String(Math.random()), title: "x", status: "active", sortOrder: 0, ...extra });
    writeFileSync(file, JSON.stringify({ goals: [old({ kind: "quest", priority: "P0" }), old({ kind: "quest", priority: "P1" }), old({ kind: "quest", priority: "P2" }), old({ kind: "side", priority: "P1" }), old({}), old({ level: "P3" })] }));
    expect(createSpaceStore(file).state().goals.map((goal) => goal.level)).toEqual(["P1", "P2", "P3", "side", "general", "P3"]);
  });

  it("patches only the given fields", () => {
    const { store } = fresh();
    const goal = store.createGoal({ title: "Fix logo", level: "side" });
    expect(store.updateGoal(goal.id, { goal: "New logo on every page" })).toMatchObject({ level: "side", goal: "New logo on every page" });
    expect(() => store.updateGoal(goal.id, { unknown: 1 })).toThrow(SpaceInputError);
    expect(() => store.updateGoal("missing", {})).toThrow(/no such Space/);
  });

  it("places one bot in one Space, moves it, and benches it", () => {
    const { store } = fresh();
    const a = store.createGoal({ title: "A" });
    const b = store.createGoal({ title: "B" });
    expect(store.place("bot-1", a.id)).toEqual({ "bot-1": a.id });
    expect(store.place("bot-1", b.id)).toEqual({ "bot-1": b.id });
    expect(store.place("bot-1", null)).toEqual({});
    expect(() => store.place("../x", a.id)).toThrow(/botId/);
  });

  it("adds, reassigns, ticks and deletes tasks", () => {
    const { store } = fresh();
    const goal = store.createGoal({ title: "A" });
    const task = store.addTask(goal.id, { text: "Fix hero", botId: "ea" });
    expect(task).toMatchObject({ text: "Fix hero", botId: "ea", done: false });
    expect(store.updateTask(goal.id, task.id, { botId: "sup", done: true })).toMatchObject({ botId: "sup", done: true });
    expect(store.updateTask(goal.id, task.id, { botId: null })).not.toHaveProperty("botId");
    store.deleteTask(goal.id, task.id);
    expect(store.goal(goal.id)!.tasks).toEqual([]);
  });

  it("signs notes, ticks an outcome, and files an ask that a yes turns into an assigned task", () => {
    const { store } = fresh();
    const goal = store.createGoal({ title: "Web", outcomes: [{ text: "CR ≥ 2%" }, { text: "No 404" }] });
    const note = store.addNote(goal.id, { text: "fixed the links", kind: "outcome", outcomeIndex: 1 }, { id: "ea", name: "EA" });
    expect(note.signature).toBe("— EA (ea) · Web · 2026-10-23T12:00:00.000Z");
    expect(store.goal(goal.id)!.outcomes.map((outcome) => outcome.done)).toEqual([false, true]);
    expect(() => store.addNote(goal.id, { text: "x", kind: "outcome", outcomeIndex: 4 }, { id: "ea", name: "EA" })).toThrow(/no outcome 5/);
    store.addNote(goal.id, { text: "I can pick up the FAQ. Plan: draft, review", kind: "ask", forBotId: "sup" }, { id: "chief", name: "Chief" });
    const ask = store.goal(goal.id)!.asks[0]!;
    expect(ask).toMatchObject({ botId: "chief", forBotId: "sup", status: "open" });
    const answered = store.answerAsk(goal.id, ask.id, "yes");
    expect(store.goal(goal.id)!.tasks).toEqual([expect.objectContaining({ id: answered.taskId, text: ask.text, botId: "sup" })]);
    expect(() => store.answerAsk(goal.id, ask.id, "no")).toThrow(/already answered/);
    expect(() => store.addNote(goal.id, { text: "x", kind: "ask" }, { name: "the person" })).toThrow(/only a bot/);
  });

  it("drops a deleted Space's placements, thread links and notes", () => {
    const { file, store } = fresh();
    const goal = store.createGoal({ title: "A" });
    const keep = store.createGoal({ title: "B" });
    store.place("bot-1", goal.id);
    store.place("bot-2", keep.id);
    store.linkThread("thread-1", goal.id);
    store.addNote(goal.id, { text: "did a thing" }, { id: "bot-1", name: "One" });
    store.deleteGoal(goal.id);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved.placements).toEqual({ "bot-2": keep.id });
    expect(saved.threadGoals).toEqual({});
    expect(saved.log).toEqual([]);
  });

  it("imports cards without removing what is there", () => {
    const { store } = fresh();
    expect(store.importCards([{ card: "k1", title: "Find a supplier", roadmap: ["Apex (talking)"], tasks: ["Call Apex"] }])).toEqual({ created: 1, updated: 0 });
    const id = store.state().goals[0]!.id;
    store.addTask(id, { text: "My own task" });
    expect(store.importCards([{ card: "k1", title: "Find a supplier", roadmap: ["Apex (talking)", "Beta"], tasks: ["Call Apex", "Call Beta"] }])).toEqual({ created: 0, updated: 1 });
    const goal = store.goal(id)!;
    expect(goal.roadmap).toEqual(["Apex (talking)", "Beta"]);
    expect(goal.tasks.map((task) => task.text)).toEqual(["Call Apex", "My own task", "Call Beta"]);
  });

  it("keeps each tile's place on the map and the bench's, and refuses a place off the map", () => {
    const { file, store } = fresh();
    const goal = store.createGoal({ title: "A", layout: { x: 120, y: -40, w: 276, h: 300 } });
    store.updateGoal(goal.id, { layout: { x: 400, y: 10, w: 276, h: 300 } });
    store.setBench({ x: 40, y: 900, w: 276, h: 194 });
    const saved = createSpaceStore(file).state();
    expect(saved.goals[0]!.layout).toEqual({ x: 400, y: 10, w: 276, h: 300 });
    expect(saved.bench).toEqual({ x: 40, y: 900, w: 276, h: 194 });
    expect(() => store.setBench({ x: 1e9, y: 0, w: 276, h: 194 })).toThrow(SpaceInputError);
  });

  it("stores the visual-first switch", () => {
    const { file, store } = fresh();
    expect(store.setVisualFirst(true)).toBe(true);
    expect(createSpaceStore(file).state().visualFirst).toBe(true);
    expect(() => store.setVisualFirst("yes")).toThrow(SpaceInputError);
  });
});
