import { useSyncExternalStore } from "react";

function externalValue<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    use(): T {
      return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => value, () => value);
    },
  };
}

const BOARD_KEY = "omb-quest-board";

function storedBoard(): boolean {
  try {
    return localStorage.getItem(BOARD_KEY) === "1";
  } catch {
    return false;
  }
}

const board = externalValue(storedBoard());

export const useQuestBoard = board.use;

export function showQuestBoard(on: boolean): void {
  board.set(on);
  try {
    localStorage.setItem(BOARD_KEY, on ? "1" : "0");
  } catch {
  }
}

const panelPage = externalValue<string | null>(null);

/** The app row the Page panel shows, so its chat row does not run the same page a second time. */
export const usePanelPageId = panelPage.use;
export const setPanelPageId = panelPage.set;
