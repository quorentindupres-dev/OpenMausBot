import { spaceBots, type SpaceBot } from "../space/bots.ts";
import { cardsFromTree, kanbanBin, readKanbanTree } from "../space/kanban.ts";
import { chiefScanText, goalFor, spaceStatusText } from "../space/prompt.ts";
import { SpaceInputError, spaceStore, type SpaceStore } from "../space/store.ts";
import { PASS, type RouteContext, type RouteHandler } from "./table.ts";

const LOG_TAIL = 100;

type SpaceRouteDeps = { store(): SpaceStore; bots(): readonly SpaceBot[]; kanban(): string | null; readTree(bin: string): Promise<unknown> };

const defaults: SpaceRouteDeps = { store: spaceStore, bots: spaceBots, kanban: () => kanbanBin(), readTree: readKanbanTree };

async function answering(ctx: RouteContext, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (error instanceof SpaceInputError) return ctx.json(ctx.res, error.status, { error: error.message });
    throw error;
  }
}

export function createSpaceRoutes(deps: Partial<SpaceRouteDeps> = {}): RouteHandler {
  const { store, bots, kanban, readTree } = { ...defaults, ...deps };
  return async (ctx) => {
    const { req, res, path, method, json, readBody } = ctx;
    if (path !== "/api/space" && !path.startsWith("/api/space/")) return PASS;
    const space = store();
    const body = async () => method === "GET" || method === "DELETE" ? undefined : await readBody(req);
    await answering(ctx, async () => {
      if (path === "/api/space" && method === "GET") {
        const state = space.state();
        return json(res, 200, { ...state, log: state.log.slice(-LOG_TAIL), kanban: kanban() !== null });
      }
      if (path === "/api/space/goals" && method === "POST") return json(res, 201, { goal: space.createGoal(await body()) });
      if (path === "/api/space/placements" && method === "PUT") {
        const input = (await body()) as { botId?: unknown; goalId?: unknown } | null;
        return json(res, 200, { placements: space.place(input?.botId, input?.goalId) });
      }
      if (path === "/api/space/settings" && method === "PATCH") {
        const input = (await body()) as { visualFirst?: unknown; bench?: unknown } | null;
        if (input?.bench !== undefined) return json(res, 200, { bench: space.setBench(input.bench) });
        return json(res, 200, { visualFirst: space.setVisualFirst(input?.visualFirst) });
      }
      if (path === "/api/space/scan" && method === "GET") return json(res, 200, { text: chiefScanText(space.state(), bots()) });
      if (path === "/api/space/import-kanban" && method === "POST") {
        const bin = kanban();
        if (!bin) return json(res, 404, { error: "Kanban import is off: OMB_KANBAN_BIN is not set" });
        return json(res, 200, space.importCards(cardsFromTree(await readTree(bin))));
      }
      let m = path.match(/^\/api\/space\/goals\/([\w-]+)$/);
      if (m && method === "PATCH") return json(res, 200, { goal: space.updateGoal(m[1], await body()) });
      if (m && method === "DELETE") {
        space.deleteGoal(m[1]);
        return json(res, 200, { ok: true });
      }
      m = path.match(/^\/api\/space\/goals\/([\w-]+)\/log$/);
      if (m && method === "POST") return json(res, 201, { entry: space.addNote(m[1], await body(), { name: "the person" }) });
      m = path.match(/^\/api\/space\/goals\/([\w-]+)\/tasks$/);
      if (m && method === "POST") return json(res, 201, { task: space.addTask(m[1], await body()) });
      m = path.match(/^\/api\/space\/goals\/([\w-]+)\/tasks\/([\w-]+)$/);
      if (m && method === "PATCH") return json(res, 200, { task: space.updateTask(m[1], m[2], await body()) });
      if (m && method === "DELETE") {
        space.deleteTask(m[1], m[2]);
        return json(res, 200, { ok: true });
      }
      m = path.match(/^\/api\/space\/goals\/([\w-]+)\/asks\/([\w-]+)$/);
      if (m && method === "POST") {
        const input = (await body()) as { answer?: unknown } | null;
        return json(res, 200, { ask: space.answerAsk(m[1], m[2], input?.answer) });
      }
      m = path.match(/^\/api\/space\/threads\/([\w-]+)$/);
      if (m && method === "PUT") {
        const input = (await body()) as { goalId?: unknown } | null;
        return json(res, 200, { threadGoals: space.linkThread(m[1], input?.goalId) });
      }
      return json(res, 404, { error: "no such Space route" });
    });
  };
}

export const spaceRoutes: RouteHandler = createSpaceRoutes();

/** The agents tools' routes. Only mounted inside the internal capability gate: `from` and `threadId` come from the
 * caller's capability, so a bot signs only as itself. */
export function createSpaceInternalRoutes(deps: { from: SpaceBot; threadId: string; store?: () => SpaceStore; bots?: () => readonly SpaceBot[] }): RouteHandler {
  const store = deps.store ?? spaceStore;
  const bots = deps.bots ?? spaceBots;
  return async (ctx) => {
    const { req, res, path, method, json, readBody } = ctx;
    if (path !== "/api/internal/space/status" && path !== "/api/internal/space/note") return PASS;
    const space = store();
    await answering(ctx, async () => {
      if (path === "/api/internal/space/status" && method === "GET") {
        return json(res, 200, { text: spaceStatusText(space.state(), bots(), deps.from.id, deps.threadId) });
      }
      if (path === "/api/internal/space/note" && method === "POST") {
        const input = (await readBody(req)) as Record<string, unknown> | null;
        const { spaceId, ...note } = input && typeof input === "object" ? input : {};
        const goal = typeof spaceId === "string" && spaceId ? space.goal(spaceId) : goalFor(space.state(), deps.from.id, deps.threadId);
        if (!goal) {
          return json(res, 409, { error: typeof spaceId === "string" && spaceId ? "no such Space; space_status lists their ids" : "You are not in a Space yet. Pass space_id (from space_status), or ask the person to place you." });
        }
        const entry = space.addNote(goal.id, note, { id: deps.from.id, name: deps.from.name });
        return json(res, 201, { entry, space: goal.title });
      }
      return json(res, 405, { error: "method not allowed" });
    });
  };
}
