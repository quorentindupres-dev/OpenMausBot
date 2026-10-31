import { AgentComputerError, type AgentComputerPool, type ComputerLease } from "../agent-computers/index.ts";
import { A01_BINDING_MODES, type A01BindingMode } from "../../shared/space.ts";
import {
  getA01Summary,
  listA01Roles,
  requireA01RoleCard,
  runA01LookupTool,
  searchA01,
  validateAndBindA01Role,
  type A01BridgeOptions,
} from "../space/a01-bridge.ts";
import { spaceBots, type SpaceBot } from "../space/bots.ts";
import {
  detectC02Project,
  getC02ProjectDetail,
  listC02Projects,
  queryC02Readiness,
  runC02LookupTool,
  type C02BridgeOptions,
} from "../space/c02-bridge.ts";
import {
  execOnSpaceComputer,
  getSpaceComputersSnapshot,
  leaseSpaceComputer,
  normalizeComputerProviderId,
  patchSpaceComputersConfig,
  previewSpaceComputer,
  releaseSpaceComputer,
  spaceComputerPool,
} from "../space/computers-bridge.ts";
import { cardsFromTree, kanbanBin, readKanbanTree } from "../space/kanban.ts";
import { chiefScanText, goalFor, spaceStatusText } from "../space/prompt.ts";
import { SpaceInputError, spaceStore, type SpaceStore } from "../space/store.ts";
import { PASS, type RouteContext, type RouteHandler } from "./table.ts";

const LOG_TAIL = 100;

export type SpaceRouteDeps = {
  store(): SpaceStore;
  bots(): readonly SpaceBot[];
  kanban(): string | null;
  readTree(bin: string): Promise<unknown>;
  computers(): AgentComputerPool;
  a01Opts?: A01BridgeOptions;
  c02Opts?: C02BridgeOptions;
};

const defaults: SpaceRouteDeps = {
  store: spaceStore,
  bots: spaceBots,
  kanban: () => kanbanBin(),
  readTree: readKanbanTree,
  computers: spaceComputerPool,
};

async function answering(ctx: RouteContext, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (error instanceof SpaceInputError) return ctx.json(ctx.res, error.status, { error: error.message });
    if (error instanceof AgentComputerError) {
      return ctx.json(ctx.res, error.status, { error: error.message, code: error.code, next: error.next });
    }
    throw error;
  }
}

function parseBindingMode(raw: unknown): A01BindingMode {
  if (raw === undefined || raw === null || raw === "") return "temporary";
  if (typeof raw === "string" && (A01_BINDING_MODES as readonly string[]).includes(raw)) {
    return raw as A01BindingMode;
  }
  throw new SpaceInputError(400, `Invalid A01 mode '${String(raw)}' (expected temporary | long-term)`);
}

export function createSpaceRoutes(deps: Partial<SpaceRouteDeps> = {}): RouteHandler {
  const { store, bots, kanban, readTree, computers, a01Opts, c02Opts } = { ...defaults, ...deps };
  return async (ctx) => {
    const { req, res, url, path, method, json, readBody } = ctx;
    if (path !== "/api/space" && !path.startsWith("/api/space/")) return PASS;
    const space = store();
    const body = async () => (method === "GET" || method === "DELETE" ? undefined : await readBody(req));
    await answering(ctx, async () => {
      if (path === "/api/space" && method === "GET") {
        const state = space.state();
        return json(res, 200, {
          ...state,
          log: state.log.slice(-LOG_TAIL),
          kanban: kanban() !== null,
          a01Summary: getA01Summary(a01Opts),
          c02Projects: listC02Projects(c02Opts),
        });
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
      if (path === "/api/space/plugin" && method === "GET") return json(res, 200, { ok: true, id: "xlabs-spaces", version: "2.0.0" });
      if (path === "/api/space/canvas-notes" && method === "POST") return json(res, 201, { note: space.addCanvasNote(await body()) });
      if (path === "/api/space/canvas-arrows" && method === "POST") return json(res, 201, { arrow: space.addCanvasArrow(await body()) });
      if (path === "/api/space/canvas-nodes" && method === "POST") return json(res, 201, { node: space.addCanvasNode(await body()) });
      if (path === "/api/space/whiteboard/batch" && method === "POST") {
        const next = space.applyWhiteboardBatch(await body());
        return json(res, 200, {
          ok: true,
          canvasNotes: next.canvasNotes ?? [],
          canvasArrows: next.canvasArrows ?? [],
          canvasNodes: next.canvasNodes ?? [],
          botBindings: next.botBindings ?? {},
          goals: next.goals,
        });
      }
      if (path === "/api/space/pinned-sessions" && method === "PUT") {
        return json(res, 200, { pinnedSessions: space.setPinnedSessions(await body()) });
      }
      if (path === "/api/space/import-kanban" && method === "POST") {
        const bin = kanban();
        if (!bin) return json(res, 404, { error: "Kanban import is off: OMB_KANBAN_BIN is not set" });
        return json(res, 200, space.importCards(cardsFromTree(await readTree(bin))));
      }

      // A01 Standing Fleet Routes
      if (path === "/api/space/a01/roles" && method === "GET") {
        return json(res, 200, { roles: listA01Roles(a01Opts), summary: getA01Summary(a01Opts) });
      }
      if (path.startsWith("/api/space/a01/card/") && method === "GET") {
        const role = decodeURIComponent(path.slice("/api/space/a01/card/".length));
        const mode = parseBindingMode(url.searchParams.get("mode"));
        const project = url.searchParams.get("project");
        return json(res, 200, { card: requireA01RoleCard(role, mode, project, a01Opts) });
      }
      if (path === "/api/space/a01/search" && method === "GET") {
        const q = url.searchParams.get("q") ?? "";
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : 20;
        return json(res, 200, searchA01(q, limit, a01Opts));
      }
      let m = path.match(/^\/api\/space\/a01\/bindings\/([\w-]+)$/);
      if (m && method === "PUT") {
        const botId = m[1]!;
        const input = ((await body()) ?? {}) as {
          role?: unknown;
          mode?: unknown;
          projectSlug?: unknown;
          computerProvider?: unknown;
          computerLeaseId?: unknown;
          requireLease?: unknown;
        };
        if (typeof input.role !== "string" || !input.role.trim()) {
          throw new SpaceInputError(400, "role is required");
        }
        const mode = parseBindingMode(input.mode);
        const projectSlug = typeof input.projectSlug === "string" && input.projectSlug.trim() ? input.projectSlug.trim() : undefined;
        const normalizedProvider =
          typeof input.computerProvider === "string" && input.computerProvider.trim()
            ? normalizeComputerProviderId(input.computerProvider)
            : undefined;
        let leaseId =
          typeof input.computerLeaseId === "string" && input.computerLeaseId.trim() ? input.computerLeaseId.trim() : undefined;

        const mergedA01Opts: A01BridgeOptions | undefined =
          a01Opts || c02Opts?.vaultRoot ? { ...a01Opts, ...(c02Opts?.vaultRoot ? { vaultRoot: c02Opts.vaultRoot } : {}) } : undefined;

        const { binding: validated, receipt } = validateAndBindA01Role(
          {
            botId,
            role: input.role,
            mode,
            projectSlug,
            computerProvider: normalizedProvider,
            computerLeaseId: leaseId,
          },
          mergedA01Opts,
        );

        let lease: ComputerLease | undefined;
        let leaseWarning: string | undefined;
        const previous = space.getBotBinding(botId);

        if (normalizedProvider && !leaseId) {
          try {
            lease = await computers().acquireComputer({
              agentId: botId,
              mode,
              ...(projectSlug ? { project: projectSlug } : {}),
              preferredProvider: normalizedProvider,
              os: normalizedProvider === "daytona" ? "linux" : "macos",
              needsGui: normalizedProvider !== "daytona",
              allowCloudBurst: false,
            });
            leaseId = lease.leaseId;
          } catch (error) {
            if (input.requireLease === true) throw error;
            leaseWarning = error instanceof Error ? error.message : String(error);
          }
        }

        if (previous?.computerLeaseId && previous.computerLeaseId !== leaseId) {
          await computers().closeSession(previous.computerLeaseId).catch(() => undefined);
        }

        const saved = space.bindBot(botId, {
          ...validated,
          ...(lease ? { computerProvider: lease.provider, computerLeaseId: lease.leaseId } : {}),
        });
        return json(res, 200, {
          binding: saved,
          receipt,
          ...(lease ? { lease } : {}),
          ...(leaseWarning ? { leaseWarning } : {}),
        });
      }
      if (m && method === "DELETE") {
        const botId = m[1]!;
        const previous = space.getBotBinding(botId);
        if (previous?.computerLeaseId) {
          await computers().closeSession(previous.computerLeaseId).catch(() => undefined);
        }
        return space.unbindBot(botId) ? json(res, 200, { ok: true }) : json(res, 404, { error: "no such bot binding" });
      }

      // C02 Business Project Routes
      if (path === "/api/space/c02/projects" && method === "GET") {
        return json(res, 200, { projects: listC02Projects(c02Opts) });
      }
      if (path === "/api/space/c02/detect" && method === "GET") {
        const target = url.searchParams.get("target") ?? "";
        const detection = detectC02Project(target, c02Opts);
        return json(res, 200, { ...detection, detection });
      }
      if (path === "/api/space/c02/readiness" && method === "GET") {
        const slug = url.searchParams.get("slug") ?? undefined;
        return json(res, 200, queryC02Readiness(slug, c02Opts));
      }
      m = path.match(/^\/api\/space\/c02\/projects\/([\w-]+)$/);
      if (m && method === "GET") {
        const detail = getC02ProjectDetail(m[1]!, c02Opts);
        return detail ? json(res, 200, { project: detail }) : json(res, 404, { error: `no such C02 project '${m[1]}'` });
      }

      // Agent Computer Pool Routes
      if (path === "/api/space/computers" && method === "GET") {
        return json(res, 200, await getSpaceComputersSnapshot(computers()));
      }
      if (path === "/api/space/computers/lease" && method === "POST") {
        return json(res, 201, { lease: await leaseSpaceComputer(computers(), await body()) });
      }
      if (path === "/api/space/computers/config" && method === "PATCH") {
        return json(res, 200, patchSpaceComputersConfig(computers(), await body()));
      }
      m = path.match(/^\/api\/space\/computers\/([\w-]+)\/exec$/);
      if (m && method === "POST") {
        return json(res, 200, { result: await execOnSpaceComputer(computers(), m[1]!, await body()) });
      }
      m = path.match(/^\/api\/space\/computers\/([\w-]+)\/preview$/);
      if (m && method === "GET") {
        return json(res, 200, await previewSpaceComputer(computers(), m[1]!));
      }
      m = path.match(/^\/api\/space\/computers\/([\w-]+)\/release$/);
      if (m && method === "POST") {
        return json(res, 200, { lease: await releaseSpaceComputer(computers(), m[1]!, await body()) });
      }

      // Goals, Tasks, Asks, Threads & Canvas Entity Routes
      m = path.match(/^\/api\/space\/goals\/([\w-]+)$/);
      if (m && method === "PATCH") return json(res, 200, { goal: space.updateGoal(m[1]!, await body()) });
      if (m && method === "DELETE") {
        space.deleteGoal(m[1]!);
        return json(res, 200, { ok: true });
      }
      m = path.match(/^\/api\/space\/goals\/([\w-]+)\/log$/);
      if (m && method === "POST") return json(res, 201, { entry: space.addNote(m[1]!, await body(), { name: "the person" }) });
      m = path.match(/^\/api\/space\/goals\/([\w-]+)\/tasks$/);
      if (m && method === "POST") return json(res, 201, { task: space.addTask(m[1]!, await body()) });
      m = path.match(/^\/api\/space\/goals\/([\w-]+)\/tasks\/([\w-]+)$/);
      if (m && method === "PATCH") return json(res, 200, { task: space.updateTask(m[1]!, m[2]!, await body()) });
      if (m && method === "DELETE") {
        space.deleteTask(m[1]!, m[2]!);
        return json(res, 200, { ok: true });
      }
      m = path.match(/^\/api\/space\/goals\/([\w-]+)\/asks\/([\w-]+)$/);
      if (m && method === "POST") {
        const input = (await body()) as { answer?: unknown } | null;
        return json(res, 200, { ask: space.answerAsk(m[1]!, m[2]!, input?.answer) });
      }
      m = path.match(/^\/api\/space\/threads\/([\w-]+)$/);
      if (m && method === "PUT") {
        const input = (await body()) as { goalId?: unknown } | null;
        return json(res, 200, { threadGoals: space.linkThread(m[1]!, input?.goalId) });
      }
      m = path.match(/^\/api\/space\/canvas-notes\/([^/]+)$/);
      if (m && method === "PATCH") {
        const note = space.patchCanvasNote(decodeURIComponent(m[1]!), await body());
        return note ? json(res, 200, { note }) : json(res, 404, { error: "no such canvas note" });
      }
      if (m && method === "DELETE") {
        return space.deleteCanvasNote(decodeURIComponent(m[1]!))
          ? json(res, 200, { ok: true })
          : json(res, 404, { error: "no such canvas note" });
      }
      m = path.match(/^\/api\/space\/canvas-arrows\/([^/]+)$/);
      if (m && method === "PATCH") {
        const arrow = space.patchCanvasArrow(decodeURIComponent(m[1]!), await body());
        return arrow ? json(res, 200, { arrow }) : json(res, 404, { error: "no such canvas arrow" });
      }
      if (m && method === "DELETE") {
        return space.deleteCanvasArrow(decodeURIComponent(m[1]!))
          ? json(res, 200, { ok: true })
          : json(res, 404, { error: "no such canvas arrow" });
      }
      m = path.match(/^\/api\/space\/canvas-nodes\/([^/]+)$/);
      if (m && method === "PATCH") {
        const node = space.patchCanvasNode(decodeURIComponent(m[1]!), await body());
        return node ? json(res, 200, { node }) : json(res, 404, { error: "no such canvas node" });
      }
      if (m && method === "DELETE") {
        return space.deleteCanvasNode(decodeURIComponent(m[1]!))
          ? json(res, 200, { ok: true })
          : json(res, 404, { error: "no such canvas node" });
      }
      return json(res, 404, { error: "no such Space route" });
    });
  };
}

export const spaceRoutes: RouteHandler = createSpaceRoutes();

const INTERNAL_SPACE_PATHS = new Set([
  "/api/internal/space/status",
  "/api/internal/space/note",
  "/api/internal/space/a01-lookup",
  "/api/internal/space/c02-lookup",
]);

/** The agents tools' routes. Only mounted inside the internal capability gate: `from` and `threadId` come from the
 * caller's capability, so a bot signs only as itself. */
export function createSpaceInternalRoutes(deps: {
  from: SpaceBot;
  threadId: string;
  store?: () => SpaceStore;
  bots?: () => readonly SpaceBot[];
  a01Opts?: A01BridgeOptions;
  c02Opts?: C02BridgeOptions;
}): RouteHandler {
  const store = deps.store ?? spaceStore;
  const bots = deps.bots ?? spaceBots;
  return async (ctx) => {
    const { req, res, path, method, json, readBody } = ctx;
    if (!INTERNAL_SPACE_PATHS.has(path)) return PASS;
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
          return json(res, 409, {
            error:
              typeof spaceId === "string" && spaceId
                ? "no such Space; space_status lists their ids"
                : "You are not in a Space yet. Pass space_id (from space_status), or ask the person to place you.",
          });
        }
        const entry = space.addNote(goal.id, note, { id: deps.from.id, name: deps.from.name });
        return json(res, 201, { entry, space: goal.title });
      }
      if (path === "/api/internal/space/a01-lookup" && method === "POST") {
        const input = ((await readBody(req)) ?? {}) as { action?: unknown; role?: unknown; query?: unknown };
        return json(res, 200, runA01LookupTool(input, deps.a01Opts));
      }
      if (path === "/api/internal/space/c02-lookup" && method === "POST") {
        const input = ((await readBody(req)) ?? {}) as { action?: unknown; slug?: unknown; query?: unknown };
        return json(res, 200, runC02LookupTool(input, deps.c02Opts));
      }
      return json(res, 405, { error: "method not allowed" });
    });
  };
}
