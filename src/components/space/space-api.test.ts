import { describe, expect, it } from "vitest";

import type { Bot } from "@/state/store";
import { EMPTY_SPACE, type SpaceGoal } from "../../../shared/space";
import { computerPanelTabs, resolveComputerPanelView } from "@/lib/computer-panel-view";
import { pageRows } from "./PagePanel";
import { benchBots, sortedGoals, spaceSlots, spaceThreads, zoneBots } from "./space-api";

const goal = (id: string, extra: Partial<SpaceGoal> = {}): SpaceGoal => ({
  id, title: id, goal: "", level: "general", outcomes: [], roadmap: [], tasks: [], asks: [], status: "active", sortOrder: 0, createdAt: 0, updatedAt: 0, ...extra,
});
const bots = ["a", "b", "c"].map((id) => ({ id, name: id }) as Bot);

describe("quest board helpers", () => {
  it("puts bots with no zone, or a deleted zone, on the bench", () => {
    const space = { ...EMPTY_SPACE, goals: [goal("g")], placements: { a: "g", b: "gone" } };
    expect(zoneBots(space, bots, "g").map((bot) => bot.id)).toEqual(["a"]);
    expect(benchBots(space, bots).map((bot) => bot.id)).toEqual(["b", "c"]);
  });

  it("lists a Space's open threads, not the archived ones, and creates one slot per thread", () => {
    const owners = [
      { id: "a", name: "A", tasks: [{ threadId: "t1", title: "Hero fix" }, { threadId: "t2", title: "Old", archivedAt: 1 }, { threadId: "t3", title: "Copy fix" }] },
      { id: "b", name: "B" },
    ] as unknown as Bot[];
    const space = { ...EMPTY_SPACE, placements: { a: "g", b: "g" }, threadGoals: { t1: "g", t2: "g", t3: "g" } };
    expect(spaceThreads(space, owners, "g").map((thread) => [thread.bot.id, thread.threadId, thread.title])).toEqual([
      ["a", "t1", "Hero fix"],
      ["a", "t3", "Copy fix"],
    ]);
    expect(spaceSlots(space, owners, "g").map((slot) => [slot.bot.id, slot.threadId ?? null])).toEqual([
      ["a", "t1"],
      ["a", "t3"],
      ["b", null],
    ]);
  });

  it("orders active goals first, then by their order", () => {
    const goals = [goal("done", { status: "done" }), goal("second", { sortOrder: 2 }), goal("first", { sortOrder: 1 })];
    expect(sortedGoals(goals).map((entry) => entry.id)).toEqual(["first", "second", "done"]);
  });

  it("finds the thread's pages in order", () => {
    const rows = pageRows([
      { id: "m1", kind: "app", app: { title: "One", source: "html", doc: "d1" } },
      { id: "m2", kind: "text", text: "hi" },
      { id: "m3", kind: "app", app: { title: "Two", source: "html", doc: "d3", rev: 2 } },
    ] as never);
    expect(rows.map((row) => row.message.id)).toEqual(["m1", "m3"]);
  });
});

describe("the Page tab", () => {
  it("is on the row only while the open thread has a page", () => {
    expect(computerPanelTabs({ advanced: false, androidConnected: false })).not.toContain("page");
    expect(computerPanelTabs({ advanced: false, androidConnected: false, hasPage: true }).at(-1)).toBe("page");
    expect(computerPanelTabs({ advanced: true, androidConnected: true, hasPage: true }).at(-1)).toBe("page");
    expect(resolveComputerPanelView("page", { advanced: true, androidConnected: false })).toBe("computer");
  });
});
