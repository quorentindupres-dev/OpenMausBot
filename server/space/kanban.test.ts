import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { cardsFromTree, kanbanBin, readKanbanTree } from "./kanban.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const STUB_TREE = {
  nodes: [
    { id: "find-a-supplier", kind: "goal", title: "Find a supplier", state: "In progress", depth: 0 },
    { id: "apex", kind: "candidate", title: "Apex Pharma", state: "talking", depth: 1 },
    { id: "call-apex", kind: "task", title: "Call Apex", state: "To do", depth: 2 },
    { id: "site", kind: "goal", title: "Website up", state: "To do", depth: 0 },
    { id: "audit", kind: "option", title: "Audit", state: "", depth: 1 },
    { id: "loose", kind: "task", title: "Loose task", depth: 0 },
  ],
};

describe("the Kanban import", () => {
  it("makes one card per goal, tasks from task cards and roadmap steps from the rest", () => {
    expect(cardsFromTree(STUB_TREE)).toEqual([
      { card: "find-a-supplier", title: "Find a supplier", roadmap: ["Apex Pharma (talking)"], tasks: ["Call Apex"] },
      { card: "site", title: "Website up", roadmap: ["Audit"], tasks: [] },
    ]);
    expect(cardsFromTree({ nope: true })).toEqual([]);
  });

  it("reads the tree from a stub CLI, and is off without OMB_KANBAN_BIN", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-kanban-"));
    dirs.push(dir);
    const bin = join(dir, "kanban.js");
    writeFileSync(bin, `if (process.argv[2] !== "tree") process.exit(2); process.stdout.write(${JSON.stringify(JSON.stringify(STUB_TREE))});`);
    expect(await readKanbanTree(bin)).toEqual(STUB_TREE);
    expect(kanbanBin({})).toBeNull();
    expect(kanbanBin({ OMB_KANBAN_BIN: bin })).toBe(bin);
  });
});
