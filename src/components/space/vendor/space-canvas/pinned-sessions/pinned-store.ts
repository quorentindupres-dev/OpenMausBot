import { useSyncExternalStore } from 'react'
import { keepOutBoxes } from './pinned-geometry'
import {
  EMPTY_PINNED,
  PINNED_STORAGE_KEY,
  canPin,
  isPinnable,
  isPinned,
  parsePinned,
  pinnedReducer,
  serializePinned,
  type PinInput,
  type PinnedAction,
  type PinnedState,
  type Viewport
} from '../core/pinned-sessions'

let state: PinnedState | null = null
const listeners = new Set<() => void>()
const toastListeners = new Set<(text: string) => void>()

function load(): PinnedState {
  try {
    if (typeof window === 'undefined') {
      return EMPTY_PINNED
    }
    return parsePinned(window.localStorage.getItem(PINNED_STORAGE_KEY))
  } catch {
    // ok: private mode or restricted localStorage safely returns EMPTY_PINNED
    return EMPTY_PINNED
  }
}

let listeningStorage = false

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== PINNED_STORAGE_KEY) {
    return
  }
  state = event.key === null ? load() : parsePinned(event.newValue)
  listeners.forEach((l) => l())
}

export function getPinnedState(): PinnedState {
  if (state === null) {
    state = load()
    if (!listeningStorage && typeof window !== 'undefined') {
      listeningStorage = true
      window.addEventListener('storage', onStorage)
    }
  }
  return state
}

export function dispatchPinned(action: PinnedAction): void {
  const prev = getPinnedState()
  const next = pinnedReducer(prev, action)
  if (next === prev) {
    return
  }
  state = next
  try {
    window.localStorage.setItem(PINNED_STORAGE_KEY, serializePinned(next))
  } catch {
    // ok: storage quota errors do not break in-memory pinned state
    // continue with in-memory state
  }
  listeners.forEach((l) => l())
}

export function subscribePinned(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function usePinnedState(): PinnedState {
  return useSyncExternalStore(subscribePinned, getPinnedState, getPinnedState)
}

export function onPinnedToast(l: (text: string) => void): () => void {
  toastListeners.add(l)
  return () => toastListeners.delete(l)
}

export function currentViewport(): Viewport {
  if (typeof window === 'undefined') {
    return { w: 1280, h: 800 }
  }
  return { w: window.innerWidth || 1280, h: window.innerHeight || 800 }
}

export function pinSession(input: PinInput): boolean {
  const s = getPinnedState()
  if (isPinned(s, input.tabId)) {
    return true
  }
  if (!isPinnable(input.kind)) {
    return false
  }
  if (!canPin(s)) {
    toastListeners.forEach((l) => l('6 pins max'))
    return false
  }
  dispatchPinned({ type: 'pin', input, vp: currentViewport(), keepOut: keepOutBoxes() })
  return true
}

export function unpinSession(tabId: string): void {
  dispatchPinned({ type: 'unpin', tabId })
}

export function resetPinnedStoreForTests(): void {
  if (listeningStorage && typeof window !== 'undefined') {
    window.removeEventListener('storage', onStorage)
    listeningStorage = false
  }
  state = null
  listeners.clear()
  toastListeners.clear()
}

let focusRequest: string | null = null
export function requestPinFocus(tabId: string): void {
  focusRequest = tabId
}
export function consumePinFocus(tabId: string): boolean {
  if (focusRequest !== tabId) {
    return false
  }
  focusRequest = null
  return true
}
