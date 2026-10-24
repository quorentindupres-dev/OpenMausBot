import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { json, readBody } from "../harness/http.ts";
import { createSpaceStore } from "../space/store.ts";
import { createSpaceInternalRoutes, createSpaceRoutes } from "./space.ts";
import { dispatchRoutes, type RouteHandler } from "./table.ts";

const servers: Server[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const BOTS = [{ id: "ea", name: "EA" }, { id: "chief", name: "Chief", chiefOfStaff: true }];
const TREE = { nodes: [{ id: "k1", kind: "goal", title: "Find a supplier", depth: 0 }, { id: "k2", kind: "task", title: "Call Apex", depth: 1 }] };

async function serve(kanban: string | null = null): Promise<{ base: string; store: ReturnType<typeof createSpaceStore> }> {
  const dir = mkdtempSync(join(tmpdir(), "omb-space-route-"));
  dirs.push(dir);
  const store = createSpaceStore(join(dir, "space.json"));
  const owner = createSpaceRoutes({ store: () => store, bots: () => BOTS, kanban: () => kanban, readTree: async () => TREE });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const as = req.headers["x-bot"];
    const routes: RouteHandler[] = typeof as === "string"
      ? [createSpaceInternalRoutes({ from: BOTS.find((bot) => bot.id === as)!, threadId: "t-1", store: () => store, bots: () => BOTS })]
      : [owner];
    const handled = await dispatchRoutes(routes, {
      req, res, url, path: url.pathname, method: req.method ?? "GET",
      auth: { kind: "loopback", scopes: ["admin", "client"] }, json, readBody,
    });
    if (!handled) json(res, 404, { from: "inline routes" });
  });
  servers.push(server);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, store };
}

const call = async (base: string, method: string, path: string, body?: unknown, bot?: string) => {
  const headers: Record<string, string> = { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(bot ? { "x-bot": bot } : {}) };
  const response = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() as any };
};

describe("the Spaces routes", () => {
  it("passes requests that are not its own", async () => {
    const { base } = await serve();
    expect(await call(base, "GET", "/api/spaces")).toEqual({ status: 404, body: { from: "inline routes" } });
  });

  it("creates Spaces, places bots, manages tasks, answers asks and links threads", async () => {
    const { base } = await serve();
    const web = (await call(base, "POST", "/api/space/goals", { title: "Website up", level: "P1", outcomes: [{ text: "No 404" }] })).body.goal;
    const side = (await call(base, "POST", "/api/space/goals", { title: "Fix logo", level: "side" })).body.goal;
    expect((await call(base, "PUT", "/api/space/placements", { botId: "ea", goalId: web.id })).body).toEqual({ placements: { ea: web.id } });
    expect((await call(base, "PUT", "/api/space/threads/t-1", { goalId: side.id })).body).toEqual({ threadGoals: { "t-1": side.id } });
    const task = (await call(base, "POST", `/api/space/goals/${web.id}/tasks`, { text: "Fix hero", botId: "ea" })).body.task;
    expect((await call(base, "PATCH", `/api/space/goals/${web.id}/tasks/${task.id}`, { done: true })).body.task.done).toBe(true);
    expect((await call(base, "POST", `/api/space/goals/${web.id}/log`, { text: "Started" })).body.entry.signature).toMatch(/^— the person · Website up · /);
    expect((await call(base, "PATCH", "/api/space/settings", { visualFirst: true })).body).toEqual({ visualFirst: true });
    const state = (await call(base, "GET", "/api/space")).body;
    expect(state.goals.map((goal: { title: string }) => goal.title)).toEqual(["Website up", "Fix logo"]);
    expect(state.kanban).toBe(false);
    expect((await call(base, "DELETE", `/api/space/goals/${web.id}/tasks/${task.id}`)).status).toBe(200);
    expect((await call(base, "DELETE", `/api/space/goals/${web.id}`)).status).toBe(200);
    expect((await call(base, "GET", "/api/space")).body.placements).toEqual({});
  });

  it("lets a bot read the board and post signed notes, outcomes and asks as itself", async () => {
    const { base, store } = await serve();
    const web = (await call(base, "POST", "/api/space/goals", { title: "Website up", outcomes: [{ text: "No 404" }] })).body.goal;
    expect((await call(base, "POST", "/api/internal/space/note", { text: "hi" }, "ea")).status).toBe(409);
    await call(base, "PUT", "/api/space/placements", { botId: "ea", goalId: web.id });
    const note = await call(base, "POST", "/api/internal/space/note", { text: "links fixed", kind: "outcome", outcomeIndex: 0, botId: "chief" }, "ea");
    expect(note.status).toBe(201);
    expect(note.body.entry).toMatchObject({ botId: "ea", botName: "EA" });
    expect(note.body.entry.signature).toMatch(/^— EA \(ea\) · Website up · \d{4}-/);
    expect(store.goal(web.id)!.outcomes[0]!.done).toBe(true);
    const ask = await call(base, "POST", "/api/internal/space/note", { text: "EA can pick up the FAQ. Plan: draft", kind: "ask", spaceId: web.id, forBotId: "ea" }, "chief");
    expect(ask.status).toBe(201);
    const filed = store.goal(web.id)!.asks[0]!;
    expect((await call(base, "POST", `/api/space/goals/${web.id}/asks/${filed.id}`, { answer: "yes" })).body.ask.status).toBe("yes");
    expect(store.goal(web.id)!.tasks).toEqual([expect.objectContaining({ text: filed.text, botId: "ea" })]);
    const status = await call(base, "GET", "/api/internal/space/status", undefined, "ea");
    expect(status.body.text).toContain('Your Space:\nGeneral Space "Website up"');
    expect((await call(base, "GET", "/api/space/scan")).body.text).toContain("Scan the Spaces board");
  });

  it("imports from Kanban only when its CLI is set", async () => {
    const off = await serve();
    expect((await call(off.base, "POST", "/api/space/import-kanban")).status).toBe(404);
    const on = await serve("/stub/kanban.js");
    expect((await call(on.base, "GET", "/api/space")).body.kanban).toBe(true);
    expect((await call(on.base, "POST", "/api/space/import-kanban")).body).toEqual({ created: 1, updated: 0 });
    expect(on.store.state().goals[0]).toMatchObject({ title: "Find a supplier", kanbanCard: "k1", tasks: [expect.objectContaining({ text: "Call Apex" })] });
  });

  it("answers bad input with 400 and a missing Space with 404", async () => {
    const { base } = await serve();
    expect((await call(base, "POST", "/api/space/goals", { title: "" })).status).toBe(400);
    expect((await call(base, "PUT", "/api/space/placements", { botId: "ea", goalId: "missing" })).status).toBe(404);
    expect((await call(base, "PATCH", "/api/space/settings", { visualFirst: "yes" })).status).toBe(400);
    expect((await call(base, "GET", "/api/space/nothing")).status).toBe(404);
  });

  it("supports goal icons, canvas notes CRUD, and plugin metadata route", async () => {
    const { base } = await serve();
    expect(await call(base, "GET", "/api/space/plugin")).toEqual({
      status: 200,
      body: { ok: true, id: "xlabs-spaces", version: "1.0.0" },
    });
    const goal = (await call(base, "POST", "/api/space/goals", { title: "Ads", icon: "🔥" })).body.goal;
    expect(goal.icon).toBe("🔥");
    const patchedGoal = (await call(base, "PATCH", `/api/space/goals/${goal.id}`, { icon: null })).body.goal;
    expect(patchedGoal.icon).toBeUndefined();

    const createdNote = await call(base, "POST", "/api/space/canvas-notes", {
      text: "Check ROAS",
      color: "green",
      layout: { x: 200, y: 150, w: 220, h: 160 },
    });
    expect(createdNote.status).toBe(201);
    expect(createdNote.body.note).toMatchObject({
      text: "Check ROAS",
      color: "green",
      layout: { x: 200, y: 150, w: 220, h: 160 },
    });
    const noteId = createdNote.body.note.id as string;
    const updatedNote = await call(base, "PATCH", `/api/space/canvas-notes/${noteId}`, {
      text: "ROAS > 2.5",
      color: "pink",
    });
    expect(updatedNote.status).toBe(200);
    expect(updatedNote.body.note).toMatchObject({ id: noteId, text: "ROAS > 2.5", color: "pink" });
    expect((await call(base, "PATCH", "/api/space/canvas-notes/missing", { text: "x" })).status).toBe(404);
    expect((await call(base, "DELETE", `/api/space/canvas-notes/${noteId}`)).status).toBe(200);
    expect((await call(base, "DELETE", `/api/space/canvas-notes/${noteId}`)).status).toBe(404);
  });
});
