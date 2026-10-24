// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "@/lib/i18n";

const fetched = vi.hoisted(() => vi.fn());
vi.mock("../app/app-api", () => ({ fetchAppDocument: fetched, AppDocumentError: class extends Error {} }));
vi.mock("../app/AppFrame", () => ({
  AppFrame: ({ doc, fill }: { doc: { messageId: string }; fill?: boolean }) => createElement("iframe", { "data-frame": doc.messageId, "data-fill": String(fill) }),
}));

import { PagePanel } from "./PagePanel";
import { setPanelPageId, usePanelPageId } from "./space-ui-state";

let host: HTMLDivElement;
let root: Root;
let shown: string | null = null;
function Watch() { shown = usePanelPageId(); return null; }

const bot = (messages: unknown[]) => ({ id: "b1", name: "Pepper", threadId: "t1", messages }) as never;
const render = (value: unknown) => flushSync(() => root.render(createElement("div", null, createElement(PagePanel, { bot: value as never }), createElement(Watch))));

beforeEach(() => {
  setLocale("en");
  fetched.mockReset();
  fetched.mockImplementation(async (_thread: string, messageId: string) => ({ messageId, srcdoc: "<p>hi</p>", can: {} }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
  setPanelPageId(null);
});

describe("the Page panel", () => {
  it("says there is no page yet", () => {
    render(bot([]));
    expect(host.textContent).toContain("No page yet");
    expect(shown).toBeNull();
  });

  it("shows the newest page full height, marks it as shown, and steps back to an older one", async () => {
    render(bot([
      { id: "m1", kind: "app", app: { title: "Plan", source: "html", doc: "d1" } },
      { id: "m2", kind: "app", app: { title: "Verdict", source: "html", doc: "d2", rev: 1 } },
    ]));
    expect(host.textContent).toContain("Verdict");
    expect(host.textContent).toContain("2 of 2");
    await vi.waitFor(() => expect(host.querySelector("iframe")?.getAttribute("data-frame")).toBe("m2"));
    expect(host.querySelector("iframe")?.getAttribute("data-fill")).toBe("true");
    expect(fetched).toHaveBeenCalledWith("t1", "m2", expect.any(AbortSignal));
    expect(shown).toBe("m2");
    flushSync(() => host.querySelector<HTMLButtonElement>('button[aria-label="Older page"]')!.click());
    await vi.waitFor(() => expect(host.querySelector("iframe")?.getAttribute("data-frame")).toBe("m1"));
    expect(shown).toBe("m1");
  });
});
