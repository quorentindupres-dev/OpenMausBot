export type ComputerPanelView = "computer" | "android" | "browser" | "routines" | "files" | "data" | "page";

type PanelTabsContext = { advanced: boolean; androidConnected: boolean; hasPage?: boolean };

export function computerPanelTabs({ advanced, androidConnected, hasPage = false }: PanelTabsContext): ComputerPanelView[] {
  return advanced
    ? ["computer", "routines", ...(androidConnected ? (["android"] as const) : []), "browser", "data", ...(hasPage ? (["page"] as const) : [])]
    : ["computer", "browser", "data", "files", ...(hasPage ? (["page"] as const) : [])];
}

export function resolveComputerPanelView(view: ComputerPanelView, context: PanelTabsContext): ComputerPanelView {
  return computerPanelTabs(context).includes(view) ? view : "computer";
}

const STORAGE_PREFIX = "omb-computer-panel-view";

function storageKey(botId: string): string {
  return `${STORAGE_PREFIX}:${botId}`;
}

export function readComputerPanelView(
  botId: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): ComputerPanelView {
  try {
    const value = storage.getItem(storageKey(botId));
    if (value === "android" || value === "browser" || value === "routines" || value === "files" || value === "data" || value === "page") return value;
  } catch {
  }
  return "computer";
}

export function writeComputerPanelView(
  botId: string,
  view: ComputerPanelView,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(storageKey(botId), view);
  } catch {
  }
}
