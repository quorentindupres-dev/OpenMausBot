import { describe, expect, it } from "vitest";
import { defaultProjectScope, goalInScope, mergeScopedGoals, projectTabs } from "./project-scope";

describe("project scopes", () => {
  it("keeps only the goals of the scope", () => {
    expect(goalInScope({ projectSlug: "surge" }, "surge")).toBe(true);
    expect(goalInScope({ projectSlug: "surge" }, "precision")).toBe(false);
    expect(goalInScope({ projectSlug: "surge" }, "all")).toBe(true);
    expect(goalInScope({ projectSlug: undefined }, "none")).toBe(true);
    expect(goalInScope({ projectSlug: "surge" }, "none")).toBe(false);
  });

  it("builds one tab per project with a count, then unassigned", () => {
    const goals = [
      { projectSlug: "surge" },
      { projectSlug: "surge" },
      { projectSlug: "precision" },
      { projectSlug: undefined },
    ];
    const tabs = projectTabs(goals, [
      { slug: "surge", title: "Surge" },
      { slug: "precision", title: "Precision" },
      { slug: "empty", title: "Empty" },
    ]);
    expect(tabs.map((tab) => tab.id)).toEqual(["all", "surge", "precision", "none"]);
    expect(tabs[0].count).toBe(4);
    expect(tabs[1]).toEqual({ id: "surge", label: "Surge", count: 2 });
    expect(tabs[3]).toEqual({ id: "none", label: "Unassigned", count: 1 });
  });

  it("still shows a project that has spaces but is missing from the catalog", () => {
    const tabs = projectTabs([{ projectSlug: "ghost" }], []);
    expect(tabs.map((tab) => tab.id)).toEqual(["all", "ghost"]);
    expect(tabs[1]).toEqual({ id: "ghost", label: "ghost", count: 1 });
  });

  it("defaults to the stored tab, else the first project", () => {
    const tabs = [
      { id: "all", label: "All", count: 3 },
      { id: "surge", label: "Surge", count: 2 },
      { id: "precision", label: "Precision", count: 1 },
    ];
    expect(defaultProjectScope(tabs, "precision")).toBe("precision");
    expect(defaultProjectScope(tabs, "gone")).toBe("surge");
    expect(defaultProjectScope(tabs, null)).toBe("surge");
    expect(defaultProjectScope([{ id: "all", label: "All", count: 0 }], null)).toBe("all");
  });
});

describe("mergeScopedGoals", () => {
  it("keeps the other projects' spaces when the canvas only returns the open tab", () => {
    const prev = [
      { id: "a", projectSlug: "surge" },
      { id: "b", projectSlug: "precision" },
      { id: "c", projectSlug: "precision" },
    ];
    const next = [{ id: "a", projectSlug: "surge" }, { id: "d", projectSlug: "surge" }];
    expect(mergeScopedGoals(prev, next, "surge").map((g) => g.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("does not duplicate a kept goal, and returns the canvas as-is for all", () => {
    const prev = [{ id: "a", projectSlug: "surge" }, { id: "b" }];
    expect(mergeScopedGoals(prev, [{ id: "a", projectSlug: "surge" }], "surge").map((g) => g.id)).toEqual(["a", "b"]);
    expect(mergeScopedGoals(prev, [{ id: "z" }], "all").map((g) => g.id)).toEqual(["z"]);
  });
});
