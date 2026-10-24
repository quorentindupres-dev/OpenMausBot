import { execFile } from "node:child_process";

export type KanbanCard = { card: string; title: string; roadmap: string[]; tasks: string[] };

type TreeNode = { id?: unknown; kind?: unknown; title?: unknown; state?: unknown; depth?: unknown };

/** The Kanban CLI's `tree` (read only): each goal card at depth 0 and the cards under it until the next goal.
 * Tasks become the Space's tasks; options and candidates become its roadmap. */
export function cardsFromTree(tree: unknown): KanbanCard[] {
  const nodes = tree && typeof tree === "object" && Array.isArray((tree as { nodes?: unknown }).nodes) ? (tree as { nodes: TreeNode[] }).nodes : [];
  const cards: KanbanCard[] = [];
  for (const node of nodes) {
    const title = typeof node.title === "string" ? node.title.trim() : "";
    if (!title) continue;
    if (node.depth === 0 && node.kind === "goal" && typeof node.id === "string") {
      cards.push({ card: node.id, title, roadmap: [], tasks: [] });
      continue;
    }
    const current = cards.at(-1);
    if (!current || node.depth === 0) continue;
    if (node.kind === "task") current.tasks.push(title);
    else current.roadmap.push(typeof node.state === "string" && node.state ? `${title} (${node.state})` : title);
  }
  return cards;
}

export function kanbanBin(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.OMB_KANBAN_BIN?.trim() || null;
}

export function readKanbanTree(bin: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [bin, "tree", "--limit", "500"], { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(new Error(`the Kanban CLI failed: ${error.message.split("\n")[0]}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("the Kanban CLI did not answer with JSON"));
      }
    });
  });
}
