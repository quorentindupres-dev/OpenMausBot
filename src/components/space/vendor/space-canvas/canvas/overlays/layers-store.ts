// WS-C (TASK_16 wave 2): open / closed state of the whiteboard layers panel. A tiny external store (same
// shape as keyboard/help-store.ts), so the ⌥L key row and the panel share it without a new CanvasCtx
// field or a SpaceCanvas prop.
import { useSyncExternalStore } from 'react'

let open = false
const listeners = new Set<() => void>()

export function isLayersPanelOpen(): boolean {
  return open
}

export function setLayersPanelOpen(next: boolean): void {
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

export function useLayersPanelOpen(): boolean {
  return useSyncExternalStore(subscribe, isLayersPanelOpen, isLayersPanelOpen)
}
