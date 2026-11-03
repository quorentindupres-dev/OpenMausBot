// WS-A (TASK_16 wave 2): open / closed state of the `?` shortcut help. A tiny external store, so the key
// effect (keyboard/) and the overlay (overlays/HistoryZoomControls -> ShortcutHelp) share it without a new
// CanvasCtx field or a SpaceCanvas prop. Idea from Penpot's shortcuts panel; no Penpot code.
import { useSyncExternalStore } from 'react'

let open = false
const listeners = new Set<() => void>()

export function isShortcutHelpOpen(): boolean {
  return open
}

export function setShortcutHelpOpen(next: boolean): void {
  if (open === next) {
    return
  }
  open = next
  for (const fn of listeners) {
    fn()
  }
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useShortcutHelpOpen(): boolean {
  return useSyncExternalStore(subscribe, isShortcutHelpOpen, isShortcutHelpOpen)
}
