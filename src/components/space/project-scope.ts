import type { SpaceGoal } from "../../../shared/space";

/** What the board is scoped to. `all` = every project, `none` = spaces with no project. */
export type ProjectScope = "all" | "none" | string;

export interface ProjectTab {
  id: ProjectScope;
  label: string;
  count: number;
}

export function goalInScope(goal: Pick<SpaceGoal, "projectSlug">, scope: ProjectScope): boolean {
  if (scope === "all") return true;
  const slug = goal.projectSlug?.trim() ?? "";
  if (scope === "none") return !slug;
  return slug === scope;
}

/**
 * One tab per project that has a space, plus `all`, plus `none` when some space
 * has no project. Order: All, then projects in catalog order, then Unassigned.
 * A project with no spaces still gets a tab when `includeEmpty` is set, so you
 * can start work in it.
 */
export function projectTabs(
  goals: readonly Pick<SpaceGoal, "projectSlug">[],
  projects: readonly { slug: string; title?: string }[],
  options: { includeEmpty?: boolean; allLabel?: string; noneLabel?: string } = {},
): ProjectTab[] {
  const counts = new Map<string, number>();
  let none = 0;
  for (const goal of goals) {
    const slug = goal.projectSlug?.trim();
    if (!slug) none += 1;
    else counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  const tabs: ProjectTab[] = [
    { id: "all", label: options.allLabel ?? "All", count: goals.length },
  ];

  const seen = new Set<string>();
  for (const project of projects) {
    const slug = project.slug?.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const count = counts.get(slug) ?? 0;
    if (count === 0 && !options.includeEmpty) continue;
    tabs.push({ id: slug, label: project.title?.trim() || slug, count });
  }

  // Spaces on a project that is missing from the catalog still need a tab.
  for (const [slug, count] of counts) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    tabs.push({ id: slug, label: slug, count });
  }

  if (none > 0) tabs.push({ id: "none", label: options.noneLabel ?? "Unassigned", count: none });

  return tabs;
}

export function defaultProjectScope(tabs: readonly ProjectTab[], stored?: string | null): ProjectScope {
  if (stored && tabs.some((tab) => tab.id === stored)) return stored;
  return tabs.find((tab) => tab.id !== "all" && tab.id !== "none")?.id ?? "all";
}

/**
 * The canvas only knows the goals in the open tab. Merge its version back into
 * the full board instead of letting the other projects' spaces disappear from
 * local state until the next refresh.
 */
export function mergeScopedGoals<T extends { id: string; projectSlug?: string }>(
  previous: readonly T[],
  next: readonly T[],
  scope: ProjectScope,
): T[] {
  if (scope === "all") return [...next];
  const kept = previous.filter((goal) => !goalInScope(goal, scope));
  const keptIds = new Set(kept.map((goal) => goal.id));
  return [...next.filter((goal) => !keptIds.has(goal.id)), ...kept];
}
