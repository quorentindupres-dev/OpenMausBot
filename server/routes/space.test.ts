import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AgentComputerPool, AgentComputerStore } from "../agent-computers/index.ts";
import { callTool } from "../drivers/agents-call.ts";
import type { ToolCallContext } from "../drivers/agents-call.ts";
import { availableTools, catalogProfileFromEnv } from "../drivers/agents-catalog.ts";
import type { RequestAuth } from "../request-auth.ts";
import { clearA01Cache } from "../space/a01-bridge.ts";
import { clearC02Cache } from "../space/c02-bridge.ts";
import { createSpaceStore } from "../space/store.ts";
import { createSpaceInternalRoutes, createSpaceRoutes } from "./space.ts";
import { PASS, type RouteContext, type RouteHandler } from "./table.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  clearA01Cache();
  clearC02Cache();
});

function createTestHarness() {
  const dir = mkdtempSync(join(tmpdir(), "omb-space-routes-"));
  tempDirs.push(dir);
  const store = createSpaceStore(join(dir, "space.json"), { now: () => 1_761_868_800_000 });
  const compStore = new AgentComputerStore(join(dir, "computers"));
  compStore.updateMac2Config({
    tailscaleHost: "mac2.tailnet.ts.net",
    sshUser: "gregorio",
    maxConcurrentVms: 4,
  });

  const vms = new Map<string, { name: string; os: "macos" | "linux"; status: "running" | "stopped"; ipAddress: string | null; vncUrl: string | null }>([
    ["xlabs-macos-base", { name: "xlabs-macos-base", os: "macos", status: "stopped", ipAddress: null, vncUrl: null }],
  ]);
  let ipSeq = 10;

  const pool = new AgentComputerPool({
    store: compStore,
    platform: "darwin",
    getSettings: () => ({
      cuaApiKey: null,
      cuaApiBaseUrl: "https://api.cua.ai/v1",
      daytonaApiKey: null,
      daytonaApiBaseUrl: "https://app.daytona.io/api",
      orgoApiKey: null,
      orgoApiBaseUrl: "https://www.orgo.ai/api",
    }),
    lumeReadyPollDelaysMs: [0],
    runShell: async () => ({ exitCode: 0, stdout: '{"data":"iVBORw0KGgoAAAANSUhEUg=="}\n', stderr: "" }),
    fetchImpl: async (input, init) => {
      const u = new URL(typeof input === "string" ? input : input.toString());
      const m = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      if (m === "GET" && u.pathname === "/lume/vms") {
        return new Response(JSON.stringify([...vms.values()]), { status: 200 });
      }
      if (m === "POST" && u.pathname === "/lume/vms/clone") {
        const newName = String(body?.newName ?? "");
        vms.set(newName, { name: newName, os: "macos", status: "stopped", ipAddress: null, vncUrl: null });
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      }
      const runMatch = u.pathname.match(/^\/lume\/vms\/([^/]+)\/run$/);
      if (m === "POST" && runMatch) {
        const vm = vms.get(decodeURIComponent(runMatch[1]!));
        if (!vm) return new Response("{}", { status: 404 });
        ipSeq += 1;
        vm.status = "running";
        vm.ipAddress = `192.168.64.${ipSeq}`;
        vm.vncUrl = `vnc://127.0.0.1:${5900 + ipSeq}`;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      const stopMatch = u.pathname.match(/^\/lume\/vms\/([^/]+)\/stop$/);
      if (m === "POST" && stopMatch) {
        const vm = vms.get(decodeURIComponent(stopMatch[1]!));
        if (vm) vm.status = "stopped";
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      const vmMatch = u.pathname.match(/^\/lume\/vms\/([^/]+)$/);
      if (vmMatch) {
        const name = decodeURIComponent(vmMatch[1]!);
        if (m === "GET") {
          const vm = vms.get(name);
          return vm ? new Response(JSON.stringify(vm), { status: 200 }) : new Response("{}", { status: 404 });
        }
        if (m === "DELETE") {
          vms.delete(name);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
      }
      return new Response("{}", { status: 404 });
    },
  });

  const isolatedFleetDb = join(dir, "fleet.db");
  const bots = [
    { id: "ea", name: "EA" },
    { id: "bot-mb", name: "Media Buyer" },
  ];

  const handler = createSpaceRoutes({
    store: () => store,
    bots: () => bots,
    kanban: () => null,
    computers: () => pool,
    a01Opts: { fleetDbPath: isolatedFleetDb },
  });

  const internalHandler = createSpaceInternalRoutes({
    from: { id: "bot-mb", name: "Media Buyer" },
    threadId: "thr-1",
    store: () => store,
    bots: () => bots,
    a01Opts: { fleetDbPath: isolatedFleetDb },
  });

  async function invoke(route: RouteHandler, method: string, urlPath: string, payload?: unknown) {
    let status = 0;
    let responseBody: Record<string, unknown> = {};
    const parsedUrl = new URL(urlPath, "http://127.0.0.1:4173");
    const ctx: RouteContext = {
      req: {} as IncomingMessage,
      res: { headersSent: false, writableEnded: false } as ServerResponse,
      url: parsedUrl,
      path: parsedUrl.pathname,
      method,
      auth: { kind: "local" } as unknown as RequestAuth,
      json: (_res, code, data) => {
        status = code;
        responseBody = (data ?? {}) as Record<string, unknown>;
      },
      readBody: async () => payload ?? {},
    };
    const out = await route(ctx);
    return { passed: out === PASS, status, body: responseBody };
  }

  return { store, pool, invoke, handler, internalHandler };
}

describe("Space HTTP API & Internal Agent Tools", () => {
  it("serves GET /api/space with A01 summary and C02 projects, plus A01 & C02 endpoints", async () => {
    const { invoke, handler } = createTestHarness();

    const overview = await invoke(handler, "GET", "/api/space");
    expect(overview.status).toBe(200);
    expect(overview.body.a01Summary).toMatchObject({ available: true, total: 33, mainCount: 18, miniCount: 15 });
    expect(Array.isArray(overview.body.c02Projects)).toBe(true);
    expect((overview.body.c02Projects as Array<{ slug: string }>).some((p) => p.slug === "surge")).toBe(true);

    const rolesRes = await invoke(handler, "GET", "/api/space/a01/roles");
    expect(rolesRes.status).toBe(200);
    expect((rolesRes.body.roles as unknown[]).length).toBe(33);

    const cardRes = await invoke(handler, "GET", "/api/space/a01/card/EA?mode=temporary&project=surge");
    expect(cardRes.status).toBe(200);
    expect(cardRes.body.card).toMatchObject({ role: "EA", mode: "temporary", project: "surge" });

    const badCard = await invoke(handler, "GET", "/api/space/a01/card/NOT_A_REAL_ROLE");
    expect(badCard.status).toBe(400);

    const searchRes = await invoke(handler, "GET", "/api/space/a01/search?q=bottleneck&limit=5");
    expect(searchRes.status).toBe(200);
    expect(Number(searchRes.body.count)).toBeGreaterThan(0);

    const c02List = await invoke(handler, "GET", "/api/space/c02/projects");
    expect(c02List.status).toBe(200);
    expect((c02List.body.projects as unknown[]).length).toBeGreaterThanOrEqual(9);

    const c02Surge = await invoke(handler, "GET", "/api/space/c02/projects/surge");
    expect(c02Surge.status).toBe(200);
    expect(c02Surge.body.project).toMatchObject({ slug: "surge", hasDb: true });

    const c02Detect = await invoke(handler, "GET", "/api/space/c02/detect?target=C01__work_board%2Fsurge__vsl");
    expect(c02Detect.status).toBe(200);
    expect(c02Detect.body).toMatchObject({ slug: "surge", matched: true });
  });

  it("validates A01 bot bindings, acquires/releases AgentComputerPool leases, and manages computer config", async () => {
    const { invoke, handler } = createTestHarness();

    const rejected = await invoke(handler, "PUT", "/api/space/a01/bindings/bot-mb", {
      role: "INVENTED_ROLE",
      mode: "temporary",
    });
    expect(rejected.status).toBe(400);

    // Bind bot-mb to media-buyer + Surge + UI alias `mac2-lume-isolated` (maps to `mac2-lume-vm`)
    const bound = await invoke(handler, "PUT", "/api/space/a01/bindings/bot-mb", {
      role: "media-buyer",
      mode: "temporary",
      projectSlug: "surge",
      computerProvider: "mac2-lume-isolated",
      requireLease: true,
    });
    expect(bound.status).toBe(200);
    const lease = bound.body.lease as { leaseId: string; provider: string };
    expect(lease.provider).toBe("mac2-lume-vm");
    expect(bound.body.binding).toMatchObject({
      role: "media-buyer",
      mode: "temporary",
      projectSlug: "surge",
      computerProvider: "mac2-lume-vm",
      computerLeaseId: lease.leaseId,
    });

    // Inspect computers snapshot, exec command, preview, config patch, and unbind
    const snap = await invoke(handler, "GET", "/api/space/computers");
    expect(snap.status).toBe(200);
    expect((snap.body.leases as unknown[]).length).toBe(1);

    const execRes = await invoke(handler, "POST", `/api/space/computers/${lease.leaseId}/exec`, {
      command: "uname -a",
    });
    expect(execRes.status).toBe(200);
    expect(execRes.body.result).toMatchObject({ exitCode: 0 });

    const previewRes = await invoke(handler, "GET", `/api/space/computers/${lease.leaseId}/preview`);
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.preview).toBeDefined();

    const cfgPatch = await invoke(handler, "PATCH", "/api/space/computers/config", {
      mac2: { maxConcurrentVms: 6 },
      burstPolicy: { enabled: false },
    });
    expect(cfgPatch.status).toBe(200);
    expect(cfgPatch.body.mac2).toMatchObject({ maxConcurrentVms: 6 });
    expect(cfgPatch.body.burstPolicy).toMatchObject({ enabled: false });

    const unbindRes = await invoke(handler, "DELETE", "/api/space/a01/bindings/bot-mb");
    expect(unbindRes.status).toBe(200);

    // Direct lease + release endpoint check
    const directLease = await invoke(handler, "POST", "/api/space/computers/lease", {
      agentId: "scout-1",
      mode: "temporary",
      preferredProvider: "mac2-lume-vm",
    });
    expect(directLease.status).toBe(201);
    const directId = (directLease.body.lease as { leaseId: string }).leaseId;

    const released = await invoke(handler, "POST", `/api/space/computers/${directId}/release`, {
      action: "close",
    });
    expect(released.status).toBe(200);
  });

  it("handles Whiteboard v2 arrows, nodes, batch semantic wiring, pinned-sessions, and internal agent lookup tools", async () => {
    const { invoke, handler, internalHandler } = createTestHarness();

    const n1 = await invoke(handler, "POST", "/api/space/canvas-nodes", {
      id: "node:proj:surge",
      kind: "c02-project",
      title: "Surge",
      projectSlug: "surge",
      layout: { x: 80, y: 80, w: 240, h: 150 },
    });
    expect(n1.status).toBe(201);

    const n2 = await invoke(handler, "POST", "/api/space/canvas-nodes", {
      id: "node:agent:mb",
      kind: "a01-agent",
      title: "Media Buyer",
      botId: "bot-mb",
      a01Role: "media-buyer",
      a01Mode: "temporary",
      layout: { x: 420, y: 80, w: 240, h: 150 },
    });
    expect(n2.status).toBe(201);

    const arrow = await invoke(handler, "POST", "/api/space/canvas-arrows", {
      id: "arrow:1",
      fromId: "node:proj:surge",
      toId: "node:agent:mb",
      label: "context",
    });
    expect(arrow.status).toBe(201);

    const patchedArrow = await invoke(handler, "PATCH", "/api/space/canvas-arrows/arrow%3A1", {
      label: "owns ad account",
    });
    expect(patchedArrow.status).toBe(200);
    expect(patchedArrow.body.arrow).toMatchObject({ label: "owns ad account" });

    const batchRes = await invoke(handler, "POST", "/api/space/whiteboard/batch", {
      addNotes: [{ id: "note:wb1", text: "Check ROAS", color: "yellow", layout: { x: 10, y: 10, w: 200, h: 140 } }],
      patchNodes: [{ id: "node:agent:mb", patch: { title: "Lead Media Buyer" } }],
    });
    expect(batchRes.status).toBe(200);
    expect((batchRes.body.botBindings as Record<string, unknown>)["bot-mb"]).toMatchObject({
      role: "media-buyer",
      projectSlug: "surge",
    });

    const pinned = await invoke(handler, "PUT", "/api/space/pinned-sessions", {
      pinnedSessions: ["sess-a", "sess-b", "sess-a"],
    });
    expect(pinned.status).toBe(200);
    expect(pinned.body.pinnedSessions).toEqual(["sess-a", "sess-b"]);

    // Verify catalog exposes a01_lookup and c02_project_lookup when OMB_SPACE=1, and callTool dispatches to internal routes
    const spaceToolNames = availableTools(catalogProfileFromEnv({ OMB_SPACE: "1" })).map((t) => t.name);
    expect(spaceToolNames).toEqual(expect.arrayContaining(["space_status", "space_note", "a01_lookup", "c02_project_lookup"]));

    const toolCtx = {
      botId: "bot-mb",
      threadId: "thr-1",
      depth: 0,
      externalRuntime: false,
      sharedComputers: false,
      client: {
        apiResponse: async (apiPath: string, init?: { method?: string; body?: string }) => {
          const payload = init?.body ? JSON.parse(init.body) : undefined;
          const res = await invoke(internalHandler, init?.method ?? "GET", apiPath, payload);
          return { ok: res.status >= 200 && res.status < 300, status: res.status, body: res.body };
        },
      },
    } as unknown as ToolCallContext;

    const a01Out = await callTool("a01_lookup", { action: "formula", role: "media-buyer" }, toolCtx);
    expect(a01Out.isError).toBeUndefined();
    expect(a01Out.text).toContain("A01 formulas");

    const c02Out = await callTool("c02_project_lookup", { action: "card", slug: "surge" }, toolCtx);
    expect(c02Out.isError).toBeUndefined();
    expect(c02Out.text).toContain("[C02 Business Context — surge");
  });
});
