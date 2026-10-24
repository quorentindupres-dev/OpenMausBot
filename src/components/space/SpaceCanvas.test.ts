// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "@/lib/i18n";
import { EMPTY_SPACE, normalizeGoal, type SpaceState } from "../../../shared/space";

vi.mock("@/state/store", () => ({
  useStore: () => ({ state: { instances: [], selectedId: null, settingsOpen: false }, dispatch: vi.fn() }),
}));
vi.mock("../TeamCanvas", () => ({
  BotCard: ({ bot }: { bot: { id: string; name: string } }) => createElement("div", { "data-bot-card": bot.id }, bot.name),
}));

import { SpaceCanvas, type SpaceCanvasActions } from "./SpaceCanvas";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  setLocale("en");
  Element.prototype.setPointerCapture = () => {};
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
});

function makeActions(overrides: Partial<SpaceCanvasActions> = {}): SpaceCanvasActions {
  return {
    moveTile: vi.fn(),
    open: vi.fn(),
    openCard: vi.fn(),
    menu: vi.fn(),
    pickLevel: vi.fn(),
    canvasMenu: vi.fn(),
    newSpaceAt: vi.fn(),
    addAgent: vi.fn(),
    rename: vi.fn(),
    setIcon: vi.fn(),
    patchNote: vi.fn(),
    deleteNote: vi.fn(),
    ...overrides,
  };
}

describe("SpaceCanvas goal avatars and canvas notes", () => {
  it("renders emoji and image data URL avatars on Space tiles and lets the user pick or clear an icon", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const space: SpaceState = {
      ...EMPTY_SPACE,
      goals: [
        normalizeGoal({ id: "g-emoji", title: "Emoji Space", icon: "🚀", layout: { x: 40, y: 40, w: 280, h: 220 } }),
        normalizeGoal({ id: "g-img", title: "Image Space", icon: dataUrl, layout: { x: 360, y: 40, w: 280, h: 220 } }),
      ],
    };
    const actions = makeActions();
    flushSync(() =>
      root.render(
        createElement(SpaceCanvas, {
          space,
          bots: [],
          actions,
          drag: null,
          editingTitle: null,
          onTitleDone: () => {},
          toCanvasRef: { current: null },
        }),
      ),
    );

    const emojiBadge = host.querySelector<HTMLButtonElement>('[data-goal-avatar="g-emoji"]')!;
    expect(emojiBadge.textContent).toBe("🚀");

    const imgBadge = host.querySelector<HTMLButtonElement>('[data-goal-avatar="g-img"]')!;
    const img = imgBadge.querySelector("img")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(dataUrl);

    flushSync(() => emojiBadge.click());
    const popover = document.querySelector<HTMLElement>('[data-goal-avatar-menu="g-emoji"]')!;
    expect(popover).not.toBeNull();
    flushSync(() => popover.querySelector<HTMLButtonElement>('[data-goal-emoji="🔥"]')!.click());
    expect(actions.setIcon).toHaveBeenCalledWith(expect.objectContaining({ id: "g-emoji" }), "🔥");
  });

  it("renders canvas notes at their (x, y, w, h) layout with their text and color, and supports editing and deleting", () => {
    const space: SpaceState = {
      ...EMPTY_SPACE,
      goals: [normalizeGoal({ id: "g1", title: "Main", layout: { x: 40, y: 40, w: 280, h: 220 } })],
      canvasNotes: [
        {
          id: "note-1",
          text: "Launch checklist",
          color: "blue",
          layout: { x: 420, y: 160, w: 240, h: 180 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const actions = makeActions();
    flushSync(() =>
      root.render(
        createElement(SpaceCanvas, {
          space,
          bots: [],
          actions,
          drag: null,
          editingTitle: null,
          onTitleDone: () => {},
          toCanvasRef: { current: null },
        }),
      ),
    );

    const noteEl = host.querySelector<HTMLElement>('[data-canvas-note="note-1"]')!;
    expect(noteEl).not.toBeNull();
    expect(noteEl.dataset.noteColor).toBe("blue");
    expect(noteEl.style.left).toBe("420px");
    expect(noteEl.style.top).toBe("160px");
    expect(noteEl.style.width).toBe("240px");
    expect(noteEl.style.height).toBe("180px");

    const textarea = noteEl.querySelector<HTMLTextAreaElement>('[data-note-text="note-1"]')!;
    expect(textarea.value).toBe("Launch checklist");

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    flushSync(() => {
      setter.call(textarea, "Updated checklist");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    flushSync(() => {
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(actions.patchNote).toHaveBeenCalledWith("note-1", { text: "Updated checklist" });

    flushSync(() => noteEl.querySelector<HTMLButtonElement>('[data-note-color-pick="pink"]')!.click());
    expect(actions.patchNote).toHaveBeenCalledWith("note-1", { color: "pink" });

    flushSync(() => noteEl.querySelector<HTMLButtonElement>('[data-note-delete="note-1"]')!.click());
    expect(actions.deleteNote).toHaveBeenCalledWith("note-1");
  });
});
