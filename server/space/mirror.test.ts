import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { botSlug, mirrorFromEnv, mirrorSpace } from "./mirror.ts";
import { createSpaceStore } from "./store.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const temp = () => { const dir = mkdtempSync(join(tmpdir(), "omb-mirror-")); dirs.push(dir); return dir; };

const bots = [{ id: "ea-1", name: "EA", title: "Assistant" }, { id: "sup-1", name: "Owner supplier" }, { id: "idle-1", name: "Idle" }];

describe("the C01 mirror", () => {
  it("writes space.json, an append-only log and one folder per bot that takes part", () => {
    const root = temp();
    let now = Date.UTC(2026, 9, 23, 12);
    const store = createSpaceStore(join(temp(), "space.json"), { now: () => now, saved: (state) => mirrorSpace(root, state, bots, now) });
    const web = store.createGoal({ title: "Web", goal: "Site converts", outcomes: [{ text: "No 404" }] });
    store.place("ea-1", web.id);
    store.addTask(web.id, { text: "Fix hero", botId: "ea-1" });
    store.addNote(web.id, { text: "first" }, { id: "ea-1", name: "EA" });
    now += 1000;
    store.addNote(web.id, { text: "second" }, { id: "ea-1", name: "EA" });
    store.addNote(web.id, { text: "photos asked" }, { id: "sup-1", name: "Owner supplier" });

    expect(readdirSync(join(root, "agents")).sort()).toEqual(["ea", "owner-supplier"]);
    const card = readFileSync(join(root, "agents", "ea", "card.md"), "utf8");
    expect(card).toContain("# EA\n\n- id: ea-1\n- role: Assistant\n- Space: Web (General)\n- goal: Site converts");
    expect(card).toContain("## My tasks\n- [ ] Fix hero (Web)");
    const notes = readFileSync(join(root, "agents", "ea", "notes.md"), "utf8");
    expect(notes.indexOf("second")).toBeLessThan(notes.indexOf("first"));
    expect(notes).toContain("- [note] second — EA (ea-1) · Web · 2026-10-23T12:00:01.000Z");
    expect(readFileSync(join(root, "log.jsonl"), "utf8").trim().split("\n")).toHaveLength(3);
    expect(JSON.parse(readFileSync(join(root, "space.json"), "utf8")).bots).toContainEqual({ id: "ea-1", name: "EA", space: web.id });

    store.deleteGoal(web.id);
    expect(existsSync(join(root, "agents", "ea", "card.md"))).toBe(true);
    expect(readFileSync(join(root, "agents", "ea", "card.md"), "utf8")).toContain("- Space: bench");
    expect(readFileSync(join(root, "log.jsonl"), "utf8").trim().split("\n")).toHaveLength(3);
  });

  it("is off without OMB_SPACE_C01_DIR, and gives same-named bots their own folder", () => {
    expect(() => mirrorFromEnv({ goals: [], placements: {}, threadGoals: {}, log: [], visualFirst: false }, bots, {})).not.toThrow();
    const twins = [{ id: "aaaaaaaa-1", name: "EA" }, { id: "bbbbbbbb-2", name: "ea" }];
    expect(twins.map((bot) => botSlug(bot, twins))).toEqual(["ea-aaaaaaaa", "ea-bbbbbbbb"]);
  });
});
