import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "../system-prompt.ts";
import { EMPTY_SPACE, normalizeGoal, type SpaceState } from "../../shared/space.ts";
import { chiefScanText, goalFor, spacePromptText, spaceStatusText, VISUAL_FIRST_PROMPT, xlabsParts } from "./prompt.ts";

const space: SpaceState = {
  ...EMPTY_SPACE,
  goals: [
    normalizeGoal({
      id: "web", title: "Website up to quality", level: "P1", goal: "Site converts like the old one",
      outcomes: [{ text: "Lighthouse ≥ 90", done: true }, { text: "CR ≥ 2%", done: false }], roadmap: ["audit", "fix", "verify"],
      tasks: [{ id: "t1", text: "Fix hero image", botId: "ea", done: false, createdAt: 0 }, { id: "t2", text: "Rewrite FAQ", botId: "supplier", done: false, createdAt: 0 }, { id: "t3", text: "Pick fonts", done: false, createdAt: 0 }],
    }),
    normalizeGoal({ id: "logo", title: "Fix logo", level: "side" }),
  ],
  placements: { ea: "web", supplier: "web", warm: "logo" },
  threadGoals: { "t-logo": "logo", "t-web": "web" },
  log: [{ id: "1", goalId: "web", botId: "supplier", botName: "Owner-supplier", at: 1, kind: "note", text: "Asked the supplier for photos", signature: "— Owner-supplier (supplier) · Website up to quality · 2026-10-23T12:00:00.000Z" }],
};

const bots = [
  { id: "ea", name: "EA", title: "Assistant" },
  { id: "supplier", name: "Owner-supplier", title: "Supplier lead", tasks: [{ threadId: "t-web", title: "Collect product photos" }] },
  { id: "warm", name: "Warm" },
  { id: "chief", name: "Chief", chiefOfStaff: true },
];

describe("the Space prompt part", () => {
  it("is empty while the board has no Spaces", () => {
    expect(spacePromptText(EMPTY_SPACE, bots, "ea")).toBe("");
  });

  it("names the Space, goal, ticked outcomes, roadmap, my tasks, the others' tasks, teammates and signed notes", () => {
    const text = spacePromptText(space, bots, "ea", undefined, true);
    expect(text).toContain('P1 (top priority) Space "Website up to quality"');
    expect(text).toContain('Goal: "Site converts like the old one"');
    expect(text).toContain('Outcomes: 1. [x] "Lighthouse ≥ 90"; 2. [ ] "CR ≥ 2%"');
    expect(text).toContain('Roadmap (set by the person, read only): 1. "audit" ▸ 2. "fix" ▸ 3. "verify"');
    expect(text).toContain('Your tasks: [ ] "Fix hero image"');
    expect(text).toContain('Other tasks: [ ] "Rewrite FAQ" → Owner-supplier; [ ] "Pick fonts" → unassigned');
    expect(text).toContain('Owner-supplier (Supplier lead) working on "Collect product photos"');
    expect(text).toContain('- [note] "Asked the supplier for photos" — Owner-supplier (supplier) · Website up to quality · 2026-10-23T12:00:00.000Z');
    expect(text).toContain('- Side quest Space "Fix logo": Warm');
    expect(text).toContain("- Bench: Chief");
    expect(text).toContain("space_note");
  });

  it("shows a bot on the bench the whole board", () => {
    const text = spacePromptText(space, bots, "chief");
    expect(text).toContain("You are on the bench");
    expect(text).toContain('- P1 (top priority) Space "Website up to quality": EA, Owner-supplier');
    expect(text).not.toContain("space_note");
  });

  it("uses the thread's Space before the bot's placement", () => {
    expect(goalFor(space, "ea", "t-logo")?.id).toBe("logo");
    expect(goalFor(space, "ea", "t-other")?.id).toBe("web");
  });

  it("adds visual-first only when tools are mounted and the switch is on", () => {
    const on = { ...space, visualFirst: true };
    const text = (pages: boolean, state: SpaceState) => xlabsParts({ botId: "ea", bots, pages }, state).find((part) => part.id === "visual-first")?.text;
    expect(text(true, on)).toBe(VISUAL_FIRST_PROMPT);
    expect(text(false, on)).toBe("");
    expect(text(true, space)).toBe("");
  });

  it("keeps the Space in the volatile half and visual-first in the stable half", () => {
    const built = buildSystemPrompt("persona", "", xlabsParts({ botId: "ea", bots, pages: true }, { ...space, visualFirst: true }));
    expect(built.volatile).toContain("Your Space on the board");
    expect(built.stable).not.toContain("Your Space on the board");
    expect(built.stable).toContain("Explain with visuals first");
  });

  it("gives space_status every Space with its id, and the Chief scan the open tasks", () => {
    const status = spaceStatusText(space, bots, "warm");
    expect(status).toContain('Your Space:\nSide quest Space "Fix logo" [space_id logo]');
    expect(status).toContain('P1 (top priority) Space "Website up to quality" [space_id web]');
    expect(status).toContain('Tasks: [ ] "Fix hero image" → EA');
    const scan = chiefScanText(space, bots);
    expect(scan).toContain('- "Pick fonts" in P1 (top priority) Space "Website up to quality" [space_id web]: unassigned');
    expect(scan).toContain("space_note, kind ask");
  });
});
