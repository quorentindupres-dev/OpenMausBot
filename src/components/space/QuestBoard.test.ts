// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "@/lib/i18n";
import { normalizeGoal } from "../../../shared/space";
import { resetPinnedStoreForTests } from "./SpaceCanvas";

const fixture = vi.hoisted(() => ({ api: vi.fn(), dispatch: vi.fn(), board: undefined as unknown }));
vi.mock("@/state/store", () => ({
  api: fixture.api,
  openBot: vi.fn(),
  useStore: () => ({ state: { instances: [], selectedId: null, settingsOpen: false }, dispatch: fixture.dispatch }),
}));
vi.mock("../Avatar", () => ({ BotAvatar: () => null }));
vi.mock("../ChatView", () => ({
  ChatView: ({ bot }: { bot: { id: string; name: string; threadId?: string } }) =>
    createElement("div", { "data-chat-view": bot.id, "data-chat-thread": bot.threadId ?? "" }, bot.name),
}));

import { QuestBoard } from "./QuestBoard";

const makeBoard = () => ({
  goals: [
    normalizeGoal({
      id: "web",
      title: "Website up",
      level: "P1",
      goal: "Site converts like the old one",
      projectSlug: "surge",
      outcomes: [
        { text: "Lighthouse ≥ 90", done: false },
        { text: "No 404", done: true },
      ],
      roadmap: ["audit", "fix", "verify"],
      tasks: [{ id: "t1", text: "Fix hero image", botId: "pepper", done: false, createdAt: 0 }],
      asks: [{ id: "a1", botId: "chief", text: "I can pick up the FAQ. Plan: draft, review", at: 0, status: "open" }],
      layout: { x: 100, y: 80, w: 320, h: 280 },
    }),
    normalizeGoal({ id: "sup", title: "Supplier signed", level: "P2", layout: { x: 460, y: 80, w: 320, h: 260 } }),
    normalizeGoal({ id: "logo", title: "Fix logo", level: "side", layout: { x: 820, y: 80, w: 300, h: 220 } }),
  ],
  placements: { pepper: "web", warm: "logo" },
  threadGoals: { "th-1": "web" },
  log: [
    {
      id: "n1",
      goalId: "web",
      botId: "pepper",
      botName: "Pepper",
      at: 0,
      kind: "note",
      text: "hero swapped",
      signature: "— Pepper (pepper) · Website up · 2026-10-23T12:00:00.000Z",
    },
  ],
  visualFirst: false,
  kanban: true,
  canvasNotes: [] as Array<Record<string, unknown>>,
  canvasArrows: [] as Array<Record<string, unknown>>,
  canvasNodes: [] as Array<Record<string, unknown>>,
  pinnedSessions: [] as string[],
  botBindings: {
    pepper: {
      botId: "pepper",
      role: "MARKETING__media-buying",
      mode: "long-term",
      projectSlug: "surge",
      computerProvider: "mac2-lume-vm",
      computerLeaseId: "lease-pepper-1",
      boundAt: 1,
    },
  },
  c02Projects: [
    {
      slug: "surge",
      title: "Surge",
      status: "active",
      kind: "brand",
      siteUrl: "https://acme-brand.example",
      folderPath: "/Users/g/External-Vault/C02__Project_database/Surge",
      workspaceRoots: ["/workspace/acme-brand"],
      readinessStatus: "green",
      readinessBadge: "🟢",
      readinessScore: "7/7",
      counts: { products: 2, acquisitionChannels: 2, funnels: 1 },
    },
    {
      slug: "precision-peptide",
      title: "Precision Peptide",
      status: "active",
      kind: "brand",
      siteUrl: "https://vet-lab.example",
      folderPath: "/Users/g/External-Vault/C02__Project_database/Precision-Peptide",
      workspaceRoots: ["/Users/g/Code/precision"],
      readinessStatus: "amber",
      readinessBadge: "🟠",
      readinessScore: "6/7",
      counts: { products: 4, acquisitionChannels: 3, funnels: 2 },
    },
  ],
});

const makeBot = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  modelSelection: { instanceId: "", model: "" },
  messages: [],
  ...extra,
});

const bots = [
  makeBot("pepper", { busy: true, tasks: [{ threadId: "th-1", title: "Hero fix" }] }),
  makeBot("warm"),
  makeBot("chief", { chiefOfStaff: true }),
];

let host: HTMLDivElement;
let root: Root;
let threads = 0;

beforeEach(() => {
  setLocale("en");
  resetPinnedStoreForTests();
  threads = 0;
  Element.prototype.setPointerCapture = () => {};
  fixture.board = makeBoard();
  fixture.dispatch.mockReset();
  fixture.api.mockReset();

  fixture.api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    const current = fixture.board as ReturnType<typeof makeBoard>;
    if (path === "/api/space") return current;
    if (path === "/api/space/a01/roles") {
      return {
        roles: [
          {
            id: "EA",
            name: "Executive Assistant",
            group: "executive",
            look: "ea",
            lookMeta: {
              key: "ea",
              label: "Executive Assistant",
              accessory: "headset",
              layer: "front",
              accent: "#6366f1",
              archetype: "steward",
              tagline: "Inbox, schedule, and daily bottlenecks",
              badge: "AI employee",
            },
            kind: "main",
            defaultTier: "steward",
            parentRole: "",
            openmausId: "ea",
            mission: "Own daily prioritization & inbox triage",
            northStar: "Zero dropped asks",
            formulaCount: 3,
            ruleCount: 8,
            workflowCount: 4,
            dbRefs: ["W93"],
          },
          {
            id: "MARKETING__media-buying",
            name: "Media Buyer",
            group: "growth",
            look: "media-buyer",
            lookMeta: {
              key: "media-buyer",
              label: "Media Buyer",
              accessory: "visor",
              layer: "front",
              accent: "#10b981",
              archetype: "operator",
              tagline: "Scale Meta & TikTok ROAS",
              badge: "AI employee",
            },
            kind: "main",
            defaultTier: "specialist",
            parentRole: "",
            openmausId: "media-buyer",
            mission: "Scale ad spend profitably",
            northStar: "Contribution margin",
            formulaCount: 5,
            ruleCount: 12,
            workflowCount: 3,
            dbRefs: ["W20"],
          },
        ],
      };
    }
    if (path.startsWith("/api/space/a01/card/")) {
      return {
        card: {
          id: "MARKETING__media-buying",
          name: "Media Buyer",
          group: "growth",
          look: "media-buyer",
          lookMeta: {
            key: "media-buyer",
            label: "Media Buyer",
            accessory: "visor",
            layer: "front",
            accent: "#10b981",
            archetype: "operator",
            tagline: "Scale Meta & TikTok ROAS",
            badge: "AI employee",
          },
          kind: "main",
          mode: "long-term",
          mission: "Scale ad spend profitably",
          northStar: "Contribution margin",
          formulas: [{ name: "ROAS", expression: "Rev / Spend", notes: "" }],
          rules: [{ code: "R1", severity: "hard", statement: "Kill losers fast" }],
          workflows: [{ id: "spend-loop", name: "Spend Loop", trigger: "daily", output: "report" }],
          dbRefs: ["W20"],
        },
      };
    }
    if (path === "/api/space/c02/projects") {
      return { projects: current.c02Projects };
    }
    if (path.startsWith("/api/space/c02/projects/")) {
      const slug = decodeURIComponent(path.slice("/api/space/c02/projects/".length));
      return {
        project: {
          slug,
          title: slug === "precision-peptide" ? "Precision Peptide" : "Surge",
          status: "active",
          kind: "brand",
          siteUrl: slug === "precision-peptide" ? "https://vet-lab.example" : "https://acme-brand.example",
          folderPath: `/Users/g/External-Vault/C02__Project_database/${slug}`,
          products: [{ slug: "p1", name: "Core Offer", kind: "physical", priceUsd: 59, cogsUsd: 11, frequency: "monthly", status: "live" }],
          acquisitionChannels: [
            { channel: "Meta Paid VSL", howWeGetClients: "Educational VSL -> Quiz", primaryFunnelSlug: "vsl", targetCacUsd: 29, status: "live" },
          ],
          funnels: [{ slug: "vsl", name: "Educational VSL", entryUrl: "https://acme-brand.example/vsl", stepsJson: "[]", targetCvrPct: 3.8 }],
          unitEconomics: null,
          readiness: { status: "green", badge: "🟢", score: "7/7", pillars: {}, missingPillars: [] },
        },
      };
    }
    if (path.startsWith("/api/space/c02/detect?")) {
      return {
        target: path,
        matched: true,
        slug: "precision-peptide",
        title: "Precision Peptide",
        kind: "brand",
        matchedBy: "c01-job",
        readinessStatus: "amber",
        readinessScore: "6/7",
        folderPath: "/Users/g/External-Vault/C02__Project_database/Precision-Peptide",
      };
    }
    if (path === "/api/space/computers" && (!init?.method || init.method === "GET")) {
      return {
        providers: [],
        leases: [
          {
            leaseId: "lease-pepper-1",
            provider: "mac2-lume-vm",
            agentId: "pepper",
            mode: "long-term",
            project: "surge",
            os: "macos",
            instanceName: "xlabs-lt-pepper",
            state: "running",
            hostEndpoint: "http://mac2.tailnet.ts.net:7777",
            guestIp: "192.168.64.5",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        mac2: {
          enabled: true,
          tailscaleHost: "mac2.tailnet.ts.net",
          sshUser: "gregorio",
          lumePort: 7777,
          maxConcurrentVms: 3,
          macosBaseImage: "xlabs-macos-base",
        },
        burstPolicy: { enabled: true },
      };
    }
    if (path === "/api/space/computers/config" && init?.method === "PATCH") {
      return { ok: true, mac2: JSON.parse(init.body!).mac2 };
    }
    if (path === "/api/space/goals" && init?.method === "POST") {
      const goal = normalizeGoal({ id: "new-goal", ...JSON.parse(init.body!) });
      fixture.board = { ...current, goals: [...current.goals, goal] };
      return { goal };
    }
    if (path.startsWith("/api/space/goals/") && init?.method === "PATCH") {
      const id = path.slice("/api/space/goals/".length);
      const patch = JSON.parse(init.body!);
      fixture.board = {
        ...current,
        goals: current.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      };
      return { goal: current.goals.find((g) => g.id === id) };
    }
    if (path === "/api/space/scan") return { text: "Scan the Spaces board" };
    if (path === "/api/bots" && init?.method === "POST") {
      const body = JSON.parse(init.body!);
      return { bot: makeBot("hired-bot", { name: body.name, title: body.title, threadId: "th-hired" }) };
    }
    if (path.startsWith("/api/space/a01/bindings/") && init?.method === "PUT") {
      const botId = decodeURIComponent(path.slice("/api/space/a01/bindings/".length));
      const body = JSON.parse(init.body!);
      const binding = {
        botId,
        role: body.role,
        mode: body.mode,
        projectSlug: body.projectSlug,
        computerProvider: body.computerProvider,
        computerLeaseId: "lease-new-1",
        boundAt: 100,
      };
      fixture.board = {
        ...current,
        botBindings: { ...current.botBindings, [botId]: binding },
      };
      return { ok: true, binding };
    }
    if (path === "/api/space/canvas-notes" && init?.method === "POST") {
      const body = JSON.parse(init.body!);
      const note = {
        id: "cn-1",
        text: body.text ?? "",
        color: body.color ?? "yellow",
        layout: body.layout,
        createdAt: 1,
        updatedAt: 1,
      };
      fixture.board = { ...current, canvasNotes: [...(current.canvasNotes ?? []), note] };
      return { note };
    }
    if (path === "/api/space/canvas-nodes" && init?.method === "POST") {
      const body = JSON.parse(init.body!);
      const node = { ...body, id: body.id ?? "node-1", createdAt: 1, updatedAt: 1 };
      fixture.board = { ...current, canvasNodes: [...(current.canvasNodes ?? []), node] };
      return { node };
    }
    if (path.startsWith("/api/space/canvas-nodes/") && init?.method === "PATCH") {
      const nodeId = decodeURIComponent(path.slice("/api/space/canvas-nodes/".length));
      const patch = JSON.parse(init.body!);
      const nodes = [...(current.canvasNodes ?? [])];
      const idx = nodes.findIndex((n) => n.id === nodeId);
      if (idx >= 0) {
        nodes[idx] = { ...nodes[idx], ...patch };
        fixture.board = { ...current, canvasNodes: nodes };
        return { node: nodes[idx] };
      }
      throw new Error("Node not found");
    }
    if (path === "/api/space/whiteboard/batch" && init?.method === "POST") {
      const batch = JSON.parse(init.body!);
      const nextNodes = [...(current.canvasNodes ?? []), ...(batch.addNodes ?? [])];
      const nextNotes = [...(current.canvasNotes ?? []), ...(batch.addNotes ?? [])];
      const nextArrows = [...(current.canvasArrows ?? []), ...(batch.addArrows ?? [])];
      fixture.board = {
        ...current,
        canvasNodes: nextNodes,
        canvasNotes: nextNotes,
        canvasArrows: nextArrows,
      };
      return {
        ok: true,
        canvasNodes: nextNodes,
        canvasNotes: nextNotes,
        canvasArrows: nextArrows,
        botBindings: current.botBindings,
        goals: current.goals,
      };
    }
    if (path === "/api/space/pinned-sessions" && init?.method === "PUT") {
      const body = JSON.parse(init.body!);
      fixture.board = { ...current, pinnedSessions: body.pinnedSessions };
      return { pinnedSessions: body.pinnedSessions };
    }
    if (/^\/api\/bots\/\w[\w-]*\/tasks$/.test(path)) {
      const threadId = threads++ === 0 ? "t-new" : `t-new-${threads}`;
      return { bot: {}, task: { threadId, title: init?.body ? JSON.parse(init.body).title : undefined } };
    }
    if (path === "/api/space/import-kanban") return { created: 2, updated: 1 };
    return {};
  });

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
  resetPinnedStoreForTests();
});

const renderBoard = async () => {
  flushSync(() => root.render(createElement(QuestBoard, { bots: bots as never })));
  await vi.waitFor(() => expect(host.querySelectorAll("[data-space-tile]")).toHaveLength(4));
};

const calls = (path: string) =>
  fixture.api.mock.calls.filter(([called]) => called === path).map(([, init]) => init);

const buttonByText = (scope: ParentNode, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === label || item.getAttribute("aria-label") === label,
  )!;

describe("QuestBoard with Penpot-grade @xlabs/space-canvas Whiteboard", () => {
  it("renders Spaces tiles, bench, plugin badge, Note creation, Chief scan, Kanban import, and Space details drawer", async () => {
    await renderBoard();

    expect(host.querySelector('[data-space-tile="web"]')?.textContent).toContain("Website up");
    expect(host.querySelector('[data-space-tile="sup"]')?.textContent).toContain("Supplier signed");
    expect(host.querySelector('[data-space-tile="logo"]')?.textContent).toContain("Fix logo");
    expect(host.querySelector('[data-space-tile="bench"]')).not.toBeNull();
    expect(host.querySelector("[data-space-plugin-badge]")?.textContent).toContain("Plugin active");

    // Create sticky note from top bar
    flushSync(() => host.querySelector<HTMLButtonElement>("[data-add-canvas-note]")!.click());
    await vi.waitFor(() => expect(calls("/api/space/canvas-notes")).toHaveLength(1));
    await vi.waitFor(() => expect(host.querySelector('[data-space-sticky="cn-1"]')).not.toBeNull());

    // Ask Chief to scan & Import from Kanban
    flushSync(() => buttonByText(host, "Ask Chief to scan").click());
    await vi.waitFor(() =>
      expect(fixture.dispatch).toHaveBeenCalledWith({ type: "switchTask", botId: "chief", threadId: "t-new" }),
    );
    flushSync(() => buttonByText(host, "Import from Kanban").click());
    await vi.waitFor(() => expect(host.textContent).toContain("Kanban import: 2 new Spaces, 1 updated"));

    // Open Space details drawer by clicking the goal summary row on "web"
    const webTile = host.querySelector<HTMLElement>('[data-space-tile="web"]')!;
    const goalSummaryBtn = [...webTile.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("Site converts like the old one"),
    )!;
    flushSync(() => goalSummaryBtn.click());

    const drawer = host.querySelector<HTMLElement>('[data-space-goal-drawer="web"]')!;
    expect(drawer).not.toBeNull();
    const outcomesPart = drawer.querySelector<HTMLElement>('[data-space-part="outcomes"]')!;
    flushSync(() => outcomesPart.querySelector<HTMLInputElement>("input")!.click());
    await vi.waitFor(() => expect(calls("/api/space/goals/web")).toHaveLength(1));

    const asksPart = drawer.querySelector<HTMLElement>('[data-space-part="asks"]')!;
    flushSync(() => buttonByText(asksPart, "Yes").click());
    await vi.waitFor(() =>
      expect(calls("/api/space/goals/web/asks/a1")).toEqual([
        { method: "POST", body: JSON.stringify({ answer: "yes" }) },
      ]),
    );
  });

  it("spawns a strict A01 employee from the A01RosterDrawer AND via '+ Hire A01 Agent' modal (POST /api/bots -> PUT binding -> canvas node)", async () => {
    await renderBoard();

    // Flow A: Spawn from whiteboard A01RosterDrawer + A01SpawnPopover
    flushSync(() => host.querySelector<HTMLButtonElement>('[data-testid="toggle-a01-roster"]')!.click());
    flushSync(() => host.querySelector<HTMLButtonElement>('[data-testid="spawn-role-btn-media-buyer"]')!.click());

    const popover = host.querySelector<HTMLElement>('[data-testid="a01-spawn-popover"]')!;
    flushSync(() => popover.querySelector<HTMLButtonElement>('[data-testid="spawn-mode-long-term-employee"]')!.click());
    flushSync(() => popover.querySelector<HTMLButtonElement>('[data-testid="spawn-computer-mac2-lume-isolated"]')!.click());
    flushSync(() => popover.querySelector<HTMLButtonElement>('[data-testid="confirm-a01-spawn"]')!.click());

    await vi.waitFor(() => expect(calls("/api/bots")).toHaveLength(1));
    await vi.waitFor(() => expect(calls("/api/space/a01/bindings/hired-bot")).toHaveLength(1));
    expect(JSON.parse(calls("/api/space/a01/bindings/hired-bot")[0]!.body!)).toMatchObject({
      role: "MARKETING__media-buying",
      mode: "long-term",
      projectSlug: "surge",
      computerProvider: "mac2-lume-vm",
    });

    // Flow B: Spawn from top-bar "+ Hire A01 Agent" modal
    flushSync(() => host.querySelector<HTMLButtonElement>("[data-hire-a01-btn]")!.click());
    const modal = document.querySelector<HTMLElement>("[data-hire-a01-modal]")!;
    expect(modal).not.toBeNull();
    await vi.waitFor(() => expect(modal.querySelector('[data-hire-role-option="MARKETING__media-buying"]')).not.toBeNull());
    flushSync(() => modal.querySelector<HTMLButtonElement>('[data-hire-role-option="MARKETING__media-buying"]')!.click());
    flushSync(() => modal.querySelector<HTMLButtonElement>('[data-hire-mode="temporary"]')!.click());
    flushSync(() => modal.querySelector<HTMLButtonElement>("[data-confirm-hire-a01]")!.click());

    await vi.waitFor(() => expect(calls("/api/bots")).toHaveLength(2));
    await vi.waitFor(() => expect(calls("/api/space/canvas-nodes").length).toBeGreaterThanOrEqual(1));
  });

  it("auto-detects C02 project when typing jobPath in GoalEditor and opens AgentComputersModal to save 2nd Mac Tailscale host", async () => {
    await renderBoard();

    // 1. Open New Space GoalEditor & test C02 dropdown + live jobPath auto-detect
    flushSync(() => host.querySelector<HTMLButtonElement>("[data-new-space-btn]")!.click());
    const editor = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(editor).not.toBeNull();

    const titleInput = editor.querySelector<HTMLInputElement>("input")!;
    const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    flushSync(() => {
      inputSetter.call(titleInput, "Peptide Launch");
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const jobPathInput = editor.querySelector<HTMLInputElement>("[data-goal-job-path]")!;
    flushSync(() => {
      inputSetter.call(jobPathInput, "/Users/g/External-Vault/C01__work_board/precision-peptide__vsl");
      jobPathInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await vi.waitFor(() =>
      expect(editor.querySelector("[data-goal-c02-detected]")?.textContent).toContain("Precision Peptide"),
    );
    expect(editor.querySelector<HTMLSelectElement>("[data-goal-c02-select]")!.value).toBe("precision-peptide");

    flushSync(() => editor.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    await vi.waitFor(() => expect(calls("/api/space/goals")).toHaveLength(1));
    expect(JSON.parse(calls("/api/space/goals")[0]!.body!)).toMatchObject({
      title: "Peptide Launch",
      projectSlug: "precision-peptide",
      jobPath: "/Users/g/External-Vault/C01__work_board/precision-peptide__vsl",
    });

    // 2. Open Agent Computers Modal, verify all 6 providers + active lease, and save 2nd Mac Tailscale host
    flushSync(() => host.querySelector<HTMLButtonElement>("[data-open-computers-btn]")!.click());
    const compModal = document.querySelector<HTMLElement>("[data-agent-computers-modal]")!;
    expect(compModal).not.toBeNull();
    await vi.waitFor(() => expect(compModal.querySelector('[data-computer-lease="lease-pepper-1"]')).not.toBeNull());

    for (const providerId of ["mac2-lume-vm", "local-cua-ax", "mac2-shared", "cua-cloud", "daytona", "orgo"]) {
      expect(compModal.querySelector(`[data-computer-provider="${providerId}"]`)).not.toBeNull();
    }

    const hostInput = compModal.querySelector<HTMLInputElement>("[data-mac2-host-input]")!;
    flushSync(() => {
      inputSetter.call(hostInput, "100.88.12.4");
      hostInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    flushSync(() => compModal.querySelector<HTMLButtonElement>("[data-save-mac2-config]")!.click());

    await vi.waitFor(() => expect(calls("/api/space/computers/config")).toHaveLength(1));
    expect(JSON.parse(calls("/api/space/computers/config")[0]!.body!)).toMatchObject({
      mac2: expect.objectContaining({ tailscaleHost: "100.88.12.4" }),
    });
  });

  it("places a live bot session card on the whiteboard, pins it to /api/space/pinned-sessions, and opens its thread drawer", async () => {
    await renderBoard();

    flushSync(() => host.querySelector<HTMLButtonElement>('[data-testid="toggle-session-drawer"]')!.click());
    const sessionDrawer = host.querySelector<HTMLElement>('[data-testid="session-project-drawer"]')!;
    flushSync(() => sessionDrawer.querySelector<HTMLButtonElement>('[data-testid="place-session-pepper::th-1"]')!.click());

    const sessionNode = host.querySelector<HTMLElement>('[data-space-node-kind="session"]')!;
    expect(sessionNode).not.toBeNull();
    const nodeId = sessionNode.getAttribute("data-space-node")!;

    // Pin floating square
    flushSync(() => sessionNode.querySelector<HTMLButtonElement>(`[data-testid="pin-session-${nodeId}"]`)!.click());
    await vi.waitFor(() => expect(calls("/api/space/pinned-sessions")).toHaveLength(1));
    expect(JSON.parse(calls("/api/space/pinned-sessions")[0]!.body!)).toEqual({
      pinnedSessions: ["pepper::th-1"],
    });
    expect(document.querySelector("[data-pinned-sessions-layer]")).not.toBeNull();

    // Switch computer target in 1 click on the session card -> rebinds bot computer lease
    flushSync(() => sessionNode.querySelector<HTMLButtonElement>(`[data-testid="switch-computer-${nodeId}"]`)!.click());
    await vi.waitFor(() => expect(calls("/api/space/a01/bindings/pepper").length).toBeGreaterThanOrEqual(1));

    // Place a C02 Project Card from the Sessions & Projects drawer & enrich 7-pillar details
    if (!host.querySelector('[data-testid="session-project-drawer"]')) {
      flushSync(() => host.querySelector<HTMLButtonElement>('[data-testid="toggle-session-drawer"]')!.click());
    }
    const projectDrawer = host.querySelector<HTMLElement>('[data-testid="session-project-drawer"]')!;
    flushSync(() => projectDrawer.querySelector<HTMLButtonElement>('[data-testid="drawer-tab-projects"]')!.click());
    flushSync(() =>
      projectDrawer.querySelector<HTMLButtonElement>('[data-testid="place-project-precision-peptide"]')!.click(),
    );
    await vi.waitFor(() => expect(host.querySelector('[data-space-node-kind="project"]')).not.toBeNull());
    await vi.waitFor(() => expect(calls("/api/space/c02/projects/precision-peptide").length).toBeGreaterThanOrEqual(1));

    // Open thread conversation drawer
    flushSync(() => sessionNode.querySelector<HTMLButtonElement>(`[data-testid="open-session-${nodeId}"]`)!.click());
    const chatDrawer = host.querySelector<HTMLElement>("[data-space-chat]")!;
    expect(chatDrawer.dataset.spaceChat).toBe("pepper");
    expect(chatDrawer.dataset.spaceChatThread).toBe("th-1");
  });
});
