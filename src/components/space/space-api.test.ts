import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@/state/store", () => ({
  api: fixture.api,
}));

import type { Bot } from "@/state/store";
import { EMPTY_SPACE, type SpaceGoal } from "../../../shared/space";
import { computerPanelTabs, resolveComputerPanelView } from "@/lib/computer-panel-view";
import { BotCreationDraft, EMPTY_BOT_DEFAULTS } from "@/lib/bot-creation-draft";
import { pageRows } from "./PagePanel";
import {
  applyWhiteboardBatch,
  benchBots,
  bindBotA01Role,
  createCanvasArrow,
  createCanvasNode,
  deleteCanvasArrow,
  deleteCanvasNode,
  detectC02Project,
  execSpaceComputer,
  fetchA01RoleCard,
  fetchA01Roles,
  fetchC02ProjectDetail,
  fetchC02Projects,
  fetchC02Readiness,
  fetchSpaceComputers,
  hireA01Agent,
  leaseSpaceComputer,
  patchSpaceComputersConfig,
  previewSpaceComputer,
  releaseSpaceComputer,
  savePinnedSessions,
  searchA01Roles,
  sortedGoals,
  spaceSlots,
  spaceThreads,
  unbindBotA01Role,
  updateCanvasArrow,
  updateCanvasNode,
  zoneBots,
  type BoardState,
  type C02ProjectDetail,
  type C02ProjectSummaryItem,
} from "./space-api";
import {
  a01RoleToRoleId,
  applyWhiteboardOptimisticBoard,
  buildC02ProjectSummary,
  buildDraggableSessions,
  canvasComputerToProvider,
  diffWhiteboardSyncPlan,
  formatBotSessionId,
  parseBotSessionId,
  providerToCanvasComputer,
  roleIdToA01Role,
  toWhiteboardSpaceState,
} from "./whiteboard-bridge";
import {
  bindCreatedBotA01IfSelected,
  getPendingA01DraftBinding,
  setPendingA01DraftBinding,
} from "./A01NewBotSection";

const goal = (id: string, extra: Partial<SpaceGoal> = {}): SpaceGoal => ({
  id,
  title: id,
  goal: "",
  level: "general",
  outcomes: [],
  roadmap: [],
  tasks: [],
  asks: [],
  status: "active",
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});
const bots = ["a", "b", "c"].map((id) => ({ id, name: id }) as Bot);

beforeEach(() => {
  fixture.api.mockReset();
});

describe("quest board helpers", () => {
  it("puts bots with no zone, or a deleted zone, on the bench", () => {
    const space = { ...EMPTY_SPACE, goals: [goal("g")], placements: { a: "g", b: "gone" } };
    expect(zoneBots(space, bots, "g").map((bot) => bot.id)).toEqual(["a"]);
    expect(benchBots(space, bots).map((bot) => bot.id)).toEqual(["b", "c"]);
  });

  it("lists a Space's open threads, not the archived ones, and creates one slot per thread", () => {
    const owners = [
      {
        id: "a",
        name: "A",
        tasks: [
          { threadId: "t1", title: "Hero fix" },
          { threadId: "t2", title: "Old", archivedAt: 1 },
          { threadId: "t3", title: "Copy fix" },
        ],
      },
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
    const serverOrdered = [
      {
        id: "a",
        name: "A",
        tasks: [
          { threadId: "t-newer", title: "Goal #2", createdAt: 20 },
          { threadId: "t-older", title: "Goal", createdAt: 10 },
        ],
      },
      { id: "c", name: "C", tasks: [{ threadId: "t-closed", title: "Closed", createdAt: 5, archivedAt: 30 }] },
    ] as unknown as Bot[];
    const state2 = {
      ...EMPTY_SPACE,
      placements: { a: "g", c: "g" },
      threadGoals: { "t-newer": "g", "t-older": "g", "t-closed": "g" },
    };
    expect(spaceSlots(state2, serverOrdered, "g").map((slot) => [slot.bot.id, slot.threadId ?? null, slot.title ?? null])).toEqual([
      ["a", "t-older", "Goal"],
      ["a", "t-newer", "Goal #2"],
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

describe("Space API v2 client wrappers (A01, C02, Computers, Whiteboard)", () => {
  it("calls strict A01 registration & hire pipeline in order (card -> POST /api/bots -> PUT binding -> POST canvas-nodes)", async () => {
    fixture.api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path.startsWith("/api/space/a01/card/")) {
        return {
          card: {
            id: "MARKETING__media-buying",
            name: "Media Buyer",
            mission: "Scale profitable ad spend",
            lookMeta: { label: "Media Buyer" },
            formulas: ["ROAS"],
            rules: [],
            workflows: [],
          },
        };
      }
      if (path === "/api/bots" && init?.method === "POST") {
        const body = JSON.parse(init.body!);
        return { bot: { id: "bot-mb-1", name: body.name, title: body.title, threadId: "th-mb-1" } };
      }
      if (path === "/api/space/a01/bindings/bot-mb-1" && init?.method === "PUT") {
        const body = JSON.parse(init.body!);
        return {
          ok: true,
          binding: {
            botId: "bot-mb-1",
            role: body.role,
            mode: body.mode,
            projectSlug: body.projectSlug,
            computerProvider: body.computerProvider,
            computerLeaseId: "lease-lume-1",
            boundAt: 100,
          },
        };
      }
      if (path === "/api/space/canvas-nodes" && init?.method === "POST") {
        const body = JSON.parse(init.body!);
        return { node: { ...body, id: body.id ?? "node-mb-1", createdAt: 100, updatedAt: 100 } };
      }
      if (path === "/api/space/placements" && init?.method === "PUT") {
        return { placements: { "bot-mb-1": "goal-1" } };
      }
      return {};
    });

    const hired = await hireA01Agent({
      role: "MARKETING__media-buying",
      mode: "long-term",
      projectSlug: "surge",
      computerProvider: "mac2-lume-vm",
      goalId: "goal-1",
      nodeId: "node-mb-1",
    });

    expect(hired.bot.id).toBe("bot-mb-1");
    expect(hired.binding.computerLeaseId).toBe("lease-lume-1");
    expect(hired.node?.id).toBe("node-mb-1");

    const calledPaths = fixture.api.mock.calls.map(([p, init]) => `${init?.method ?? "GET"} ${p}`);
    expect(calledPaths).toEqual([
      "GET /api/space/a01/card/MARKETING__media-buying?mode=long-term&project=surge",
      "POST /api/bots",
      "PUT /api/space/a01/bindings/bot-mb-1",
      "PUT /api/space/placements",
      "POST /api/space/canvas-nodes",
    ]);
  });

  it("wires all C02, Agent Computers, and Whiteboard v2 endpoints cleanly", async () => {
    fixture.api.mockResolvedValue({ ok: true });

    await fetchA01Roles();
    await fetchA01RoleCard("EA", "temporary", "x-labs");
    await searchA01Roles("creative");
    await bindBotA01Role("bot-1", { role: "EA", mode: "long-term", projectSlug: "surge", computerProvider: "mac2-lume-vm" });
    await unbindBotA01Role("bot-1");

    await fetchC02Projects();
    await fetchC02ProjectDetail("surge");
    await detectC02Project("/Users/g/External-Vault/C01__work_board/surge__launch");
    await fetchC02Readiness();

    await fetchSpaceComputers();
    await leaseSpaceComputer({ agentId: "bot-1", mode: "temporary", preferredProvider: "mac2-lume-vm" });
    await execSpaceComputer("lease-1", { command: "sw_vers" });
    await previewSpaceComputer("lease-1");
    await releaseSpaceComputer("lease-1", "close");
    await patchSpaceComputersConfig({ mac2: { tailscaleHost: "mac2.tailnet.ts.net", lumePort: 7777 } });

    await createCanvasArrow({ fromId: "n1", toId: "n2" });
    await updateCanvasArrow("arr-1", { label: "handoff" });
    await deleteCanvasArrow("arr-1");
    await createCanvasNode({ kind: "c02-project", title: "Surge", layout: { x: 10, y: 20, w: 324, h: 196 }, projectSlug: "surge" });
    await updateCanvasNode("node-1", { projectSlug: "precision-peptide" });
    await deleteCanvasNode("node-1");
    await applyWhiteboardBatch({ deleteNoteIds: ["note-1"] });
    await savePinnedSessions(["bot-1::th-1"]);

    expect(fixture.api).toHaveBeenCalledWith("/api/space/a01/roles");
    expect(fixture.api).toHaveBeenCalledWith("/api/space/a01/search?q=creative&limit=20");
    expect(fixture.api).toHaveBeenCalledWith("/api/space/c02/projects");
    expect(fixture.api).toHaveBeenCalledWith("/api/space/c02/projects/surge");
    expect(fixture.api).toHaveBeenCalledWith(
      "/api/space/c02/detect?target=%2FUsers%2Fg%2FExternal-Vault%2FC01__work_board%2Fsurge__launch",
    );
    expect(fixture.api).toHaveBeenCalledWith("/api/space/c02/readiness");
    expect(fixture.api).toHaveBeenCalledWith("/api/space/computers");
    expect(fixture.api).toHaveBeenCalledWith(
      "/api/space/computers/config",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fixture.api).toHaveBeenCalledWith(
      "/api/space/whiteboard/batch",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fixture.api).toHaveBeenCalledWith(
      "/api/space/pinned-sessions",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ pinnedSessions: ["bot-1::th-1"] }) }),
    );
  });

  it("binds a newly created bot from NewBotDialog when an A01 role was selected on the draft", async () => {
    fixture.api.mockResolvedValue({ ok: true, binding: { botId: "bot-99", role: "COO", mode: "long-term", boundAt: 1 } });
    const draft = new BotCreationDraft(EMPTY_BOT_DEFAULTS, () => {});

    // No-op when nothing selected
    await bindCreatedBotA01IfSelected(draft, "bot-99");
    expect(fixture.api).not.toHaveBeenCalled();

    setPendingA01DraftBinding(draft, {
      role: "COO",
      mode: "long-term",
      projectSlug: "surge",
      computerProvider: "mac2-lume-vm",
    });
    expect(getPendingA01DraftBinding(draft)).toMatchObject({ role: "COO", projectSlug: "surge" });

    await bindCreatedBotA01IfSelected(draft, "bot-99");
    expect(fixture.api).toHaveBeenCalledWith("/api/space/a01/bindings/bot-99", {
      method: "PUT",
      body: JSON.stringify({
        role: "COO",
        mode: "long-term",
        projectSlug: "surge",
        computerProvider: "mac2-lume-vm",
      }),
    });
    expect(getPendingA01DraftBinding(draft)).toBeUndefined();
  });
});

describe("whiteboard-bridge bidirectional mapping", () => {
  it("maps A01 roles, computer providers, C02 7-pillar details, sessions, and sync diffs accurately", () => {
    expect(roleIdToA01Role("media-buyer")).toBe("MARKETING__media-buying");
    expect(roleIdToA01Role("ea")).toBe("EA");
    expect(a01RoleToRoleId("MARKETING__media-buying")).toBe("media-buyer");
    expect(a01RoleToRoleId("CREATIVE__scout")).toBe("creative-scout");

    expect(providerToCanvasComputer("mac2-lume-vm")).toBe("mac2-lume-isolated");
    expect(providerToCanvasComputer("local-cua-ax")).toBe("local-ax");
    expect(canvasComputerToProvider("mac2-lume-isolated")).toBe("mac2-lume-vm");
    expect(canvasComputerToProvider("local-ax")).toBe("local-cua-ax");

    const sessionId = formatBotSessionId("pepper", "th-42");
    expect(sessionId).toBe("pepper::th-42");
    expect(parseBotSessionId(sessionId)).toEqual({ botId: "pepper", threadId: "th-42" });

    const summaryItem: C02ProjectSummaryItem = {
      slug: "surge",
      title: "Surge",
      status: "active",
      kind: "brand",
      size: "flagship",
      siteUrl: "https://acme-brand.example",
      folderPath: "/Users/g/External-Vault/C02__Project_database/Surge",
      workspaceRoots: ["/workspace/acme-brand"],
      aliases: ["surge"],
      readinessStatus: "green",
      readinessBadge: "🟢",
      readinessScore: "7/7",
      whenToUse: "Surge supplement brand",
      hasDb: true,
      counts: { products: 2, acquisitionChannels: 2, folders: 1, refs: 2, campaignNotes: 0 },
    };
    const detail: C02ProjectDetail = {
      slug: "surge",
      title: "Surge",
      status: "active",
      kind: "brand",
      siteUrl: "https://acme-brand.example",
      folderPath: "/Users/g/External-Vault/C02__Project_database/Surge",
      hasDb: true,
      businessProfile: null,
      products: [
        {
          sku: "surge-gummies",
          name: "Surge Gummies",
          category: "supplement",
          format: "physical",
          problemSolved: "Energy",
          mechanismSpec: null,
          listPrice: 49,
          listPriceText: "$49",
          unitCost: 9,
          folderPath: null,
          offers: [],
          state: "live",
        },
      ],
      avatars: [],
      acquisitionChannels: [
        {
          channelId: "ch-1",
          channel: "Meta Paid Social",
          howWeGetClients: "Educational VSL -> Quiz",
          entryFormats: ["video"],
          winningAngles: [],
          maxCacLimit: 28,
          breakevenMultiple: 1.5,
          adAccountRef: null,
          pageRef: null,
          state: "live",
        },
        {
          channelId: "ch-2",
          channel: "Trustpilot Organic",
          howWeGetClients: "Verified reviews",
          entryFormats: ["review"],
          winningAngles: [],
          maxCacLimit: 0,
          breakevenMultiple: null,
          adAccountRef: null,
          pageRef: null,
          state: "live",
        },
      ],
      funnels: [
        {
          funnelId: "quiz",
          name: "Quiz Funnel",
          stepsFlow: "Ad -> Quiz -> Checkout",
          entryUrl: "https://acme-brand.example/quiz",
          storeRepo: null,
          trustMechanisms: [],
          state: "live",
        },
      ],
      unitEconomics: null,
      operations: null,
      facts: [],
      folders: [],
      refs: [],
      campaignNotes: [],
      readiness: {
        status: "green",
        badge: "🟢",
        score: "7/7",
        pillars: [],
        missingSummary: [],
      },
    };
    const c02Card = buildC02ProjectSummary(summaryItem, detail);
    expect(c02Card.readiness).toBe("green");
    expect(c02Card.readinessScore).toBe(100);
    expect(c02Card.productsCount).toBe(1);
    expect(c02Card.channels).toEqual(["Meta Paid Social", "Trustpilot Organic"]);
    expect(c02Card.liveRefs.map((r) => r.label)).toContain("Quiz Funnel");

    const board: BoardState = {
      ...EMPTY_SPACE,
      goals: [goal("g1", { title: "Scale Ads", projectSlug: "surge", layout: { x: 40, y: 40, w: 320, h: 240 } })],
      placements: { mb: "g1" },
      botBindings: {
        mb: {
          role: "MARKETING__media-buying",
          mode: "long-term",
          projectSlug: "surge",
          computerProvider: "mac2-lume-vm",
          boundAt: 1,
        },
      },
      pinnedSessions: ["mb::th-1"],
    };
    const liveBots = [
      { id: "mb", name: "Buyer", threadId: "th-1", busy: true, tasks: [{ threadId: "th-1", title: "CBO Test", busy: true }] },
    ] as unknown as Bot[];

    const sessions = buildDraggableSessions(board, liveBots);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId: "mb::th-1",
      roleId: "media-buyer",
      status: "working",
      projectSlug: "surge",
      computer: "mac2-lume-isolated",
      pinned: true,
    });
    expect(sessions[0]!.workingLine).toContain("🧠 Long-Term");

    const wb = toWhiteboardSpaceState({
      board,
      bots: liveBots,
      activeProjectSlug: "surge",
      c02BySlug: new Map([["surge", c02Card]]),
    });
    const edited = {
      ...wb,
      stickies: [{ id: "st-1", text: "Check CPA", color: "sky" as const, kind: "note" as const, x: 200, y: 120, w: 220, h: 160, createdAt: 1 }],
      arrows: [{ id: "ar-1", fromId: "g1", toId: "st-1", label: "next", createdAt: 1 }],
    };
    const plan = diffWhiteboardSyncPlan(board, edited);
    expect(plan.batch?.addNotes).toHaveLength(1);
    expect(plan.batch?.addNotes?.[0]).toMatchObject({ id: "st-1", text: "Check CPA", color: "blue" });
    expect(plan.batch?.addArrows).toHaveLength(1);

    const optimistic = applyWhiteboardOptimisticBoard(board, edited);
    expect(optimistic.canvasNotes).toHaveLength(1);
    expect(optimistic.canvasArrows).toHaveLength(1);
  });
});
