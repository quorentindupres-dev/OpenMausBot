// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_SPACE, normalizeGoal } from "../../../shared/space";
import type { BoardState } from "./space-api";
import {
  SpaceCanvas,
  resetPinnedStoreForTests,
  type SpaceCanvasHostAdapter,
} from "./SpaceCanvas";
import { toWhiteboardSpaceState } from "./whiteboard-bridge";

let hostEl: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetPinnedStoreForTests();
  Element.prototype.setPointerCapture = () => {};
  hostEl = document.createElement("div");
  document.body.append(hostEl);
  root = createRoot(hostEl);
});

afterEach(() => {
  flushSync(() => root.unmount());
  hostEl.remove();
  resetPinnedStoreForTests();
});

describe("SpaceCanvas (@xlabs/space-canvas SpaceWhiteboard wrapper)", () => {
  it("renders Space tiles with emoji & custom data-URL icons, sticky notes, and C02 project header badge", () => {
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const board: BoardState = {
      ...EMPTY_SPACE,
      goals: [
        normalizeGoal({ id: "g-emoji", title: "Emoji Space", icon: "🚀", level: "P1", layout: { x: 40, y: 40, w: 320, h: 220 } }),
        normalizeGoal({ id: "g-img", title: "Image Space", icon: dataUrl, level: "P2", layout: { x: 400, y: 40, w: 320, h: 220 } }),
      ],
      canvasNotes: [
        {
          id: "note-1",
          text: "Launch checklist",
          color: "blue",
          layout: { x: 420, y: 300, w: 240, h: 180 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const wb = toWhiteboardSpaceState({ board, bots: [], activeProjectSlug: "surge" });
    const onSelectSpaceProject = vi.fn();
    const adapter: SpaceCanvasHostAdapter = {
      activeProjectSlug: "surge",
      projects: [
        { slug: "surge", title: "Surge", readiness: "green", readinessScore: 100, productsCount: 2, channels: ["Meta Paid"], liveRefs: [] },
        { slug: "x-labs", title: "X-Labs", readiness: "green", readinessScore: 100, productsCount: 1, channels: ["Direct"], liveRefs: [] },
      ],
      onSelectSpaceProject,
    };

    flushSync(() =>
      root.render(
        createElement(SpaceCanvas, {
          space: wb,
          agents: [],
          host: adapter,
          dark: true,
          onChangeSpace: vi.fn(),
        }),
      ),
    );

    const emojiTile = hostEl.querySelector<HTMLElement>('[data-space-tile="g-emoji"]')!;
    expect(emojiTile).not.toBeNull();
    expect(emojiTile.textContent).toContain("🚀");
    expect(emojiTile.textContent).toContain("Emoji Space");

    const imgTile = hostEl.querySelector<HTMLElement>('[data-space-tile="g-img"]')!;
    expect(imgTile).not.toBeNull();
    const img = imgTile.querySelector("img")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(dataUrl);

    const stickyEl = hostEl.querySelector<HTMLElement>('[data-space-sticky="note-1"]')!;
    expect(stickyEl).not.toBeNull();
    expect(stickyEl.textContent).toContain("Launch checklist");

    const projectSelect = hostEl.querySelector<HTMLSelectElement>('[data-testid="space-project-select"]')!;
    expect(projectSelect.value).toBe("surge");
    flushSync(() => {
      projectSelect.value = "x-labs";
      projectSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSelectSpaceProject).toHaveBeenCalledWith("x-labs");
  });

  it("spawns a registered A01 role from A01RosterDrawer + A01SpawnPopover and places Session / C02 Project nodes", () => {
    const board: BoardState = { ...EMPTY_SPACE };
    let currentWb = toWhiteboardSpaceState({ board, bots: [], activeProjectSlug: "surge" });
    const onSpawnA01Agent = vi.fn();
    const onOpenSession = vi.fn();
    const onPinSession = vi.fn();
    const onSwitchNodeComputer = vi.fn();

    const adapter: SpaceCanvasHostAdapter = {
      activeProjectSlug: "surge",
      sessions: [
        {
          sessionId: "pepper::th-1",
          sessionKind: "openmanus-thread",
          title: "Pepper · Hero fix",
          roleId: "media-buyer",
          agentName: "Pepper",
          status: "working",
          workingLine: "🧠 Long-Term · Auditing ad sets",
          projectSlug: "surge",
          computer: "mac2-lume-isolated",
        },
      ],
      projects: [
        {
          slug: "surge",
          title: "Surge",
          readiness: "green",
          readinessScore: 100,
          productsCount: 3,
          channels: ["Meta Ads", "TikTok Shop"],
          liveRefs: [{ label: "Live Site", url: "https://acme-brand.example" }],
        },
      ],
      onSpawnA01Agent,
      onOpenSession,
      onPinSession,
      onSwitchNodeComputer,
    };

    const rerender = () => {
      flushSync(() =>
        root.render(
          createElement(SpaceCanvas, {
            space: currentWb,
            agents: [],
            host: adapter,
            dark: true,
            onChangeSpace: (updater) => {
              currentWb = typeof updater === "function" ? updater(currentWb) : updater;
              rerender();
            },
          }),
        ),
      );
    };
    rerender();

    // 1. Open A01 Roster drawer & request spawn of Media Buyer
    flushSync(() => hostEl.querySelector<HTMLButtonElement>('[data-testid="toggle-a01-roster"]')!.click());
    expect(hostEl.querySelector('[data-testid="a01-roster-drawer"]')).not.toBeNull();
    flushSync(() => hostEl.querySelector<HTMLButtonElement>('[data-testid="spawn-role-btn-media-buyer"]')!.click());

    const popover = hostEl.querySelector<HTMLElement>('[data-testid="a01-spawn-popover"]')!;
    expect(popover).not.toBeNull();
    flushSync(() => popover.querySelector<HTMLButtonElement>('[data-testid="spawn-mode-long-term-employee"]')!.click());
    flushSync(() => popover.querySelector<HTMLButtonElement>('[data-testid="spawn-computer-mac2-lume-isolated"]')!.click());
    flushSync(() => popover.querySelector<HTMLButtonElement>('[data-testid="confirm-a01-spawn"]')!.click());

    expect(onSpawnA01Agent).toHaveBeenCalledTimes(1);
    expect(onSpawnA01Agent.mock.calls[0]![0]).toMatchObject({
      roleId: "media-buyer",
      spawnMode: "long-term-employee",
      projectSlug: "surge",
      computer: "mac2-lume-isolated",
    });
    expect(hostEl.querySelectorAll('[data-space-node-kind="agent"]')).toHaveLength(1);

    // 2. Open Sessions & Projects drawer, place session & C02 project card
    flushSync(() => hostEl.querySelector<HTMLButtonElement>('[data-testid="toggle-session-drawer"]')!.click());
    const sessionDrawer = hostEl.querySelector<HTMLElement>('[data-testid="session-project-drawer"]')!;
    expect(sessionDrawer).not.toBeNull();
    flushSync(() => sessionDrawer.querySelector<HTMLButtonElement>('[data-testid="place-session-pepper::th-1"]')!.click());
    expect(hostEl.querySelectorAll('[data-space-node-kind="session"]')).toHaveLength(1);

    const sessionNodeEl = hostEl.querySelector<HTMLElement>('[data-space-node-kind="session"]')!;
    const sessionNodeId = sessionNodeEl.getAttribute("data-space-node")!;
    flushSync(() => sessionNodeEl.querySelector<HTMLButtonElement>(`[data-testid="open-session-${sessionNodeId}"]`)!.click());
    expect(onOpenSession).toHaveBeenCalledWith("pepper::th-1", "openmanus-thread");

    flushSync(() => sessionNodeEl.querySelector<HTMLButtonElement>(`[data-testid="pin-session-${sessionNodeId}"]`)!.click());
    expect(onPinSession).toHaveBeenCalledWith("pepper::th-1", true, expect.objectContaining({ sessionId: "pepper::th-1" }));

    flushSync(() => sessionNodeEl.querySelector<HTMLButtonElement>(`[data-testid="switch-computer-${sessionNodeId}"]`)!.click());
    expect(onSwitchNodeComputer).toHaveBeenCalledWith(sessionNodeId, expect.any(String));

    // Place C02 project card via header quick button
    flushSync(() => hostEl.querySelector<HTMLButtonElement>('[data-testid="drop-active-project-card"]')!.click());
    const projectNodeEl = hostEl.querySelector<HTMLElement>('[data-space-node-kind="project"]')!;
    expect(projectNodeEl).not.toBeNull();
    expect(projectNodeEl.textContent).toContain("Surge");
    expect(projectNodeEl.textContent).toContain("Meta Ads");
  });
});
