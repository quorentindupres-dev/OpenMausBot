// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "@/lib/i18n";
import { normalizeGoal } from "../../../shared/space";

const fixture = vi.hoisted(() => ({ api: vi.fn(), dispatch: vi.fn(), board: undefined as unknown }));
vi.mock("@/state/store", () => ({
  api: fixture.api, openBot: vi.fn(),
  useStore: () => ({ state: { instances: [], selectedId: null, settingsOpen: false }, dispatch: fixture.dispatch }),
}));
vi.mock("../Avatar", () => ({ BotAvatar: () => null }));

import { QuestBoard } from "./QuestBoard";

const board = () => ({
  goals: [
    normalizeGoal({
      id: "web", title: "Website up", level: "P1", goal: "Site converts like the old one",
      outcomes: [{ text: "Lighthouse ≥ 90", done: false }, { text: "No 404", done: true }], roadmap: ["audit", "fix", "verify"],
      tasks: [{ id: "t1", text: "Fix hero image", botId: "pepper", done: false, createdAt: 0 }],
      asks: [{ id: "a1", botId: "chief", text: "I can pick up the FAQ. Plan: draft, review", at: 0, status: "open" }],
      layout: { x: 100, y: 80, w: 276, h: 300 },
    }),
    normalizeGoal({ id: "sup", title: "Supplier signed", level: "P2" }),
    normalizeGoal({ id: "logo", title: "Fix logo", level: "side" }),
  ],
  placements: { pepper: "web", warm: "logo" },
  threadGoals: { "th-1": "web" },
  log: [{ id: "n1", goalId: "web", botId: "pepper", botName: "Pepper", at: 0, kind: "note", text: "hero swapped", signature: "— Pepper (pepper) · Website up · 2026-10-23T12:00:00.000Z" }],
  visualFirst: false,
  kanban: true,
});
const bot = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), modelSelection: { instanceId: "", model: "" }, messages: [], ...extra });
const bots = [bot("pepper", { busy: true, tasks: [{ threadId: "th-1", title: "Hero fix" }] }), bot("warm"), bot("chief", { chiefOfStaff: true })];

let host: HTMLDivElement;
let root: Root;
let animations: string[];
let under: Element | null;
beforeEach(() => {
  setLocale("en");
  animations = [];
  under = null;
  HTMLElement.prototype.animate = function (this: HTMLElement) { animations.push(this.dataset.spaceCard ?? ""); return {} as Animation; } as never;
  document.elementFromPoint = () => under;
  Element.prototype.setPointerCapture = () => {};
  fixture.board = board();
  fixture.dispatch.mockReset();
  fixture.api.mockReset();
  fixture.api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    if (path === "/api/space") return fixture.board;
    if (path === "/api/space/goals" && init?.method === "POST") {
      const goal = normalizeGoal({ id: "new", ...JSON.parse(init.body!) });
      const current = fixture.board as ReturnType<typeof board>;
      fixture.board = { ...current, goals: [...current.goals, goal] };
      return { goal };
    }
    if (path === "/api/space/scan") return { text: "Scan the Spaces board" };
    if (path === "/api/bots") return { bot: bot("scout", { name: JSON.parse(init!.body!).name }) };
    if (/^\/api\/bots\/\w[\w-]*\/tasks$/.test(path)) return { bot: {}, task: { threadId: "t-new" } };
    if (path === "/api/space/import-kanban") return { created: 2, updated: 1 };
    return {};
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { flushSync(() => root.unmount()); host.remove(); });

const render = async () => {
  flushSync(() => root.render(createElement(QuestBoard, { bots: bots as never })));
  await vi.waitFor(() => expect(host.querySelectorAll("[data-space-key]")).toHaveLength(4));
};
const tile = (key: string) => host.querySelector<HTMLElement>(`[data-space-key="${key}"]`)!;
const canvas = () => host.querySelector<HTMLElement>("[data-space-canvas]")!;
const drawer = () => host.querySelector<HTMLElement>("[data-space-drawer]")!;
const part = (name: string) => drawer().querySelector<HTMLElement>(`[data-space-part="${name}"]`)!;
const button = (scope: ParentNode, label: string) => [...scope.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label || item.getAttribute("aria-label") === label)!;
const calls = (path: string) => fixture.api.mock.calls.filter(([called]) => called === path).map(([, init]) => init);
const pointer = (target: EventTarget, type: string, x: number, y: number) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
/** Presses `from`, moves past the threshold over `over`, and lets go there, as a mouse would. */
const dragTo = (from: Element, over: Element | null) => {
  flushSync(() => pointer(from, "pointerdown", 10, 10));
  under = over;
  flushSync(() => pointer(window, "pointermove", 30, 30));
  flushSync(() => pointer(window, "pointermove", 60, 60));
  flushSync(() => pointer(window, "pointerup", 60, 60));
};

describe("the Spaces map", () => {
  it("draws every Space and the bench as tiles in their level's colors, with the bots' cards inside", async () => {
    await render();
    expect(tile("web").style.left).toBe("100px");
    expect(tile("web").className).toContain("border-danger");
    expect(tile("web").querySelector("span[data-level]")?.textContent).toBe("P1");
    expect(tile("sup").className).toContain("border-warning");
    expect(tile("logo").className).toContain("border-dashed");
    expect(tile("web").textContent).toContain("Outcomes 1/2 · Open tasks 1 · Asks 1");
    expect(tile("web").querySelector('[data-space-card="pepper"]')?.textContent).toContain("Pepper");
    expect([...tile("bench").querySelectorAll("[data-space-card]")].map((card) => card.getAttribute("data-space-card"))).toEqual(["chief"]);
  });

  it("lists the five levels in order and every agent with where it is on the shelf", async () => {
    await render();
    const shelf = host.querySelector("[data-space-palette]")!;
    expect([...shelf.querySelectorAll("[data-drag-new]")].map((item) => item.textContent)).toEqual(["P1", "P2", "P3", "General", "Side quest"]);
    expect(shelf.querySelector('[data-palette-bot="pepper"]')?.textContent).toContain("in Website up");
    expect(shelf.querySelector('[data-palette-bot="chief"]')?.textContent).toContain("on the bench");
  });

  it("drags a level from the shelf onto the map: a Space of that level there, its name ready to type", async () => {
    await render();
    dragTo(host.querySelector('[data-drag-new="P3"]')!, canvas());
    await vi.waitFor(() => expect(calls("/api/space/goals")).toHaveLength(1));
    expect(JSON.parse(calls("/api/space/goals")[0].body)).toMatchObject({ title: "New Space", level: "P3", layout: { x: expect.any(Number), y: expect.any(Number), w: 276 } });
    await vi.waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("Space name"));
    const input = document.activeElement as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    flushSync(() => { setter.call(input, "Launch ads"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    flushSync(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await vi.waitFor(() => expect(calls("/api/space/goals/new")).toEqual([{ method: "PATCH", body: JSON.stringify({ title: "Launch ads" }) }]));
  });

  it("drags an agent from the shelf onto a Space, and a card back to the shelf to bench it", async () => {
    await render();
    dragTo(host.querySelector('[data-palette-bot="chief"]')!, tile("sup").querySelector("header")!);
    await vi.waitFor(() => expect(calls("/api/space/placements")).toEqual([{ method: "PUT", body: JSON.stringify({ botId: "chief", goalId: "sup" }) }]));
    dragTo(tile("web").querySelector('[data-space-card="pepper"] [data-bot-id]')!, host.querySelector("[data-space-palette]"));
    await vi.waitFor(() => expect(calls("/api/space/placements").at(-1)).toEqual({ method: "PUT", body: JSON.stringify({ botId: "pepper", goalId: null }) }));
  });

  it("drags a card from one tile to another, which glides it there, and a press without moving stays a click", async () => {
    await render();
    const ghost = () => document.querySelector("[data-space-ghost]");
    flushSync(() => pointer(tile("web").querySelector('[data-space-card="pepper"] [data-bot-id]')!, "pointerdown", 10, 10));
    under = tile("logo");
    flushSync(() => pointer(window, "pointermove", 40, 40));
    expect(ghost()?.textContent).toContain("Move to Fix logo");
    expect(tile("logo").dataset.dropping).toBe("true");
    flushSync(() => pointer(window, "pointerup", 40, 40));
    expect(ghost()).toBeNull();
    await vi.waitFor(() => expect(tile("logo").querySelector('[data-space-card="pepper"]')).not.toBeNull());
    expect(calls("/api/space/placements")).toEqual([{ method: "PUT", body: JSON.stringify({ botId: "pepper", goalId: "logo" }) }]);
    expect(animations).toEqual(["pepper"]);
    flushSync(() => pointer(tile("logo").querySelector('[data-space-card="warm"]')!, "pointerdown", 10, 10));
    flushSync(() => pointer(window, "pointerup", 11, 11));
    expect(calls("/api/space/placements")).toHaveLength(1);
  });

  it("moves a tile by its header and saves its place", async () => {
    await render();
    const handle = tile("web").querySelector("[data-tile-handle]")!;
    flushSync(() => pointer(handle, "pointerdown", 10, 10));
    flushSync(() => pointer(canvas(), "pointermove", 40, 50));
    flushSync(() => pointer(canvas(), "pointerup", 40, 50));
    await vi.waitFor(() => expect(calls("/api/space/goals/web")).toHaveLength(1));
    expect(JSON.parse(calls("/api/space/goals/web")[0].body).layout).toMatchObject({ x: expect.any(Number), y: expect.any(Number), w: 276 });
  });

  it("opens a Space's details from its header, where outcomes, asks and threads work", async () => {
    await render();
    const handle = tile("web").querySelector("[data-tile-handle]")!;
    flushSync(() => { pointer(handle, "pointerdown", 5, 5); pointer(handle, "pointerup", 5, 5); });
    expect([...drawer().querySelectorAll("[data-space-part]")].map((el) => el.getAttribute("data-space-part")))
      .toEqual(["goal", "outcomes", "roadmap", "agents", "tasks", "asks", "threads", "notes"]);
    expect(drawer().querySelector("span[data-level]")?.textContent).toBe("P1");
    flushSync(() => part("outcomes").querySelector<HTMLInputElement>("input")!.click());
    await vi.waitFor(() => expect(JSON.parse(calls("/api/space/goals/web")[0].body)).toEqual({ outcomes: [{ text: "Lighthouse ≥ 90", done: true }, { text: "No 404", done: true }] }));
    flushSync(() => button(part("asks"), "Yes").click());
    await vi.waitFor(() => expect(calls("/api/space/goals/web/asks/a1")).toEqual([{ method: "POST", body: JSON.stringify({ answer: "yes" }) }]));
    flushSync(() => button(part("threads"), "Open").click());
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "switchTask", botId: "pepper", threadId: "th-1" });
    flushSync(() => button(part("threads"), "Close").click());
    expect(fixture.dispatch).toHaveBeenCalledWith({ type: "updateTask", botId: "pepper", threadId: "th-1", patch: { archivedAt: expect.any(Number) } });
  });

  it("adds an agent from the tile: an existing bot, or a new one placed in the Space", async () => {
    await render();
    flushSync(() => button(tile("sup"), "Add an agent to Supplier signed").click());
    const menu = () => document.querySelector<HTMLElement>("[data-quest-menu]")!;
    flushSync(() => [...menu().querySelectorAll("button")].find((item) => item.textContent === "Chief")!.click());
    await vi.waitFor(() => expect(calls("/api/space/placements")).toEqual([{ method: "PUT", body: JSON.stringify({ botId: "chief", goalId: "sup" }) }]));
    flushSync(() => button(tile("sup"), "Add an agent to Supplier signed").click());
    const input = menu().querySelector<HTMLInputElement>("input")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    flushSync(() => { setter.call(input, "Scout"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    flushSync(() => menu().querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    await vi.waitFor(() => expect(calls("/api/space/placements").at(-1)).toEqual({ method: "PUT", body: JSON.stringify({ botId: "scout", goalId: "sup" }) }));
  });

  it("makes a Space where the map was double-clicked, with the level picked in the editor", async () => {
    await render();
    flushSync(() => canvas().dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 300, clientY: 200 })));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const name = dialog.querySelector<HTMLInputElement>("input")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    flushSync(() => { setter.call(name, "Launch ads"); name.dispatchEvent(new Event("input", { bubbles: true })); });
    expect([...dialog.querySelectorAll('[aria-label="Level"] button')].map((item) => item.textContent)).toEqual(["P1", "P2", "P3", "General", "Side quest"]);
    flushSync(() => button(dialog, "P2").click());
    flushSync(() => dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    await vi.waitFor(() => expect(calls("/api/space/goals")).toHaveLength(1));
    expect(JSON.parse(calls("/api/space/goals")[0].body)).toMatchObject({ title: "Launch ads", level: "P2", layout: { x: expect.any(Number) } });
  });

  it("asks the Chief to scan in a new thread, imports from Kanban, and opens a linked thread from a tile's menu", async () => {
    await render();
    flushSync(() => button(host, "Ask Chief to scan").click());
    await vi.waitFor(() => expect(fixture.dispatch).toHaveBeenCalledWith({ type: "switchTask", botId: "chief", threadId: "t-new" }));
    expect(JSON.parse(calls("/api/bots/chief/messages")[0].body)).toMatchObject({ threadId: "t-new", text: "Scan the Spaces board" });
    flushSync(() => button(host, "Import from Kanban").click());
    await vi.waitFor(() => expect(host.textContent).toContain("Kanban import: 2 new Spaces, 1 updated"));
    flushSync(() => tile("web").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    const items = () => [...document.querySelectorAll<HTMLButtonElement>("[data-quest-menu] button")];
    expect(items().map((item) => item.textContent)).toEqual(["Pepper", "Another bot…", "Edit Space"]);
  });
});
