export type PinView = 'auto' | 'chat' | 'terminal'
export type PinKind = 'agent' | 'terminal' | 'browser' | 'editor'
export type Pt = { x: number; y: number }
export type Box = { x: number; y: number; w: number; h: number }
export type Viewport = { w: number; h: number }

export type PinnedSession = {
  tabId: string
  worktreeId: string
  kind: PinKind
  name: string
  square: Pt
  win: Box
  open: boolean
  view: PinView
  z: number
}

export type PinnedState = { pins: PinnedSession[] }

export const PINNED_STORAGE_KEY = 'xlabs-space-canvas:pinned-sessions-v1'
export const MAX_PINS = 6
export const SQUARE_W = 72
export const SQUARE_H = 84
export const TOP_SAFE = 40
export const BOTTOM_SAFE = 36
export const RIGHT_RESERVED = 88
export const WIN_DEFAULT = { w: 420, h: 520 }
export const WIN_MIN = { w: 300, h: 240 }
export const WIN_MAX_FRACTION = 0.9
export const SNAP_PX = 8
const EDGE_GAP = 12

export const EMPTY_PINNED: PinnedState = { pins: [] }

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), Math.max(lo, hi))

export function clampSquare(p: Pt, vp: Viewport): Pt {
  return {
    x: Math.round(clamp(p.x, 0, vp.w - SQUARE_W)),
    y: Math.round(clamp(p.y, TOP_SAFE, vp.h - BOTTOM_SAFE - SQUARE_H))
  }
}

export function clampWinSize(
  size: { w: number; h: number },
  vp: Viewport
): { w: number; h: number } {
  const maxW = Math.max(WIN_MIN.w, vp.w * WIN_MAX_FRACTION)
  const maxH = Math.max(WIN_MIN.h, (vp.h - TOP_SAFE - BOTTOM_SAFE) * WIN_MAX_FRACTION)
  return {
    w: Math.round(clamp(size.w, WIN_MIN.w, maxW)),
    h: Math.round(clamp(size.h, WIN_MIN.h, maxH))
  }
}

export function clampWindow(b: Box, vp: Viewport): Box {
  const size = clampWinSize(b, vp)
  return {
    ...size,
    x: Math.round(clamp(b.x, 0, vp.w - size.w)),
    y: Math.round(clamp(b.y, TOP_SAFE, vp.h - BOTTOM_SAFE - size.h))
  }
}

const hits = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

export function windowNearSquare(
  square: Pt,
  size: { w: number; h: number },
  vp: Viewport,
  avoid: readonly Box[] = []
): Box {
  const s = clampWinSize(size, vp)
  const spots: Pt[] = [
    { x: square.x - s.w - EDGE_GAP, y: square.y + SQUARE_H - s.h },
    { x: square.x + SQUARE_W - s.w, y: square.y - s.h - EDGE_GAP },
    { x: square.x - s.w - EDGE_GAP, y: square.y },
    { x: square.x + SQUARE_W + EDGE_GAP, y: square.y + SQUARE_H - s.h },
    { x: square.x + SQUARE_W + EDGE_GAP, y: square.y },
    { x: square.x, y: square.y + SQUARE_H + EDGE_GAP }
  ]
  const boxes = spots.map((p) => clampWindow({ ...p, ...s }, vp))
  const free = boxes.find((b) => !avoid.some((a) => hits(b, a)))
  return free ?? boxes[0]!
}

export function defaultSquarePos(index: number, vp: Viewport): Pt {
  const step = SQUARE_W + 12
  const perRow = Math.max(1, Math.floor((vp.w - RIGHT_RESERVED - 24) / step))
  const col = index % perRow
  const row = Math.floor(index / perRow)
  return clampSquare(
    {
      x: vp.w - RIGHT_RESERVED - SQUARE_W - col * step,
      y: vp.h - BOTTOM_SAFE - SQUARE_H - row * (SQUARE_H + 12)
    },
    vp
  )
}

export function freeSquarePos(
  existing: readonly Pt[],
  vp: Viewport,
  keepOut: readonly Box[] = []
): Pt {
  const taken: Box[] = [
    ...existing.map((p) => ({ x: p.x, y: p.y, w: SQUARE_W, h: SQUARE_H })),
    ...keepOut
  ]
  for (let k = 0; k < 120; k++) {
    const pos = defaultSquarePos(k, vp)
    const box = { x: pos.x, y: pos.y, w: SQUARE_W, h: SQUARE_H }
    if (!taken.some((t) => hits(box, t))) {
      return pos
    }
  }
  return defaultSquarePos(existing.length, vp)
}

export type PinInput = { tabId: string; worktreeId: string; kind: PinKind; name: string }

export type PinnedAction =
  | { type: 'pin'; input: PinInput; vp: Viewport; keepOut?: readonly Box[] }
  | { type: 'setView'; tabId: string; view: PinView }
  | { type: 'unpin'; tabId: string }
  | { type: 'rename'; tabId: string; name: string }
  | { type: 'moveSquare'; tabId: string; to: Pt; vp: Viewport }
  | { type: 'setWindow'; tabId: string; box: Box; vp: Viewport }
  | { type: 'open'; tabId: string; vp: Viewport; keepOut?: readonly Box[] }
  | { type: 'close'; tabId: string }
  | { type: 'raise'; tabId: string }
  | { type: 'resetPosition'; tabId: string; vp: Viewport; keepOut?: readonly Box[] }
  | { type: 'prune'; keep: ReadonlySet<string> }
  | { type: 'clampAll'; vp: Viewport }

export const isPinned = (s: PinnedState, tabId: string): boolean =>
  s.pins.some((p) => p.tabId === tabId)

export const isPinnable = (kind: PinKind): boolean => kind !== 'editor'

const topZ = (s: PinnedState): number => s.pins.reduce((m, p) => Math.max(m, p.z), 0)

export const canPin = (s: PinnedState): boolean => s.pins.length < MAX_PINS

function patch(
  s: PinnedState,
  tabId: string,
  fn: (p: PinnedSession) => PinnedSession
): PinnedState {
  let changed = false
  const pins = s.pins.map((p) => {
    if (p.tabId !== tabId) {
      return p
    }
    const next = fn(p)
    changed = changed || next !== p
    return next
  })
  return changed ? { pins } : s
}

export function pinnedReducer(s: PinnedState, a: PinnedAction): PinnedState {
  switch (a.type) {
    case 'pin': {
      if (isPinned(s, a.input.tabId) || !canPin(s) || !isPinnable(a.input.kind)) {
        return s
      }
      const square = freeSquarePos(
        s.pins.map((p) => p.square),
        a.vp,
        a.keepOut
      )
      const win = windowNearSquare(square, WIN_DEFAULT, a.vp)
      const name = a.input.name.trim() || 'Session'
      return {
        pins: [
          ...s.pins,
          { ...a.input, name, square, win, open: false, view: 'auto', z: topZ(s) + 1 }
        ]
      }
    }
    case 'unpin':
      return isPinned(s, a.tabId) ? { pins: s.pins.filter((p) => p.tabId !== a.tabId) } : s
    case 'rename': {
      const name = a.name.trim()
      return name ? patch(s, a.tabId, (p) => (p.name === name ? p : { ...p, name })) : s
    }
    case 'moveSquare':
      return patch(s, a.tabId, (p) => {
        const square = clampSquare(a.to, a.vp)
        return square.x === p.square.x && square.y === p.square.y ? p : { ...p, square }
      })
    case 'setWindow':
      return patch(s, a.tabId, (p) => ({ ...p, win: clampWindow(a.box, a.vp) }))
    case 'open': {
      const target = s.pins.find((p) => p.tabId === a.tabId)
      if (!target) {
        return s
      }
      const avoid = [
        ...s.pins
          .filter((p) => p !== target && !p.open)
          .map((p) => ({ x: p.square.x, y: p.square.y, w: SQUARE_W, h: SQUARE_H })),
        ...(a.keepOut ?? [])
      ]
      const win = windowNearSquare(target.square, target.win, a.vp, avoid)
      const z = topZ(s) + 1
      return { pins: s.pins.map((p) => (p === target ? { ...p, win, open: true, z } : p)) }
    }
    case 'setView':
      return patch(s, a.tabId, (p) => (p.view === a.view ? p : { ...p, view: a.view }))
    case 'close':
      return patch(s, a.tabId, (p) => (p.open ? { ...p, open: false } : p))
    case 'raise':
      return patch(s, a.tabId, (p) => (p.z === topZ(s) ? p : { ...p, z: topZ(s) + 1 }))
    case 'resetPosition': {
      const target = s.pins.find((p) => p.tabId === a.tabId)
      if (!target) {
        return s
      }
      const others = s.pins.filter((p) => p !== target)
      const square = freeSquarePos(
        others.map((p) => p.square),
        a.vp,
        a.keepOut
      )
      const avoid = [
        ...others
          .filter((p) => !p.open)
          .map((p) => ({ x: p.square.x, y: p.square.y, w: SQUARE_W, h: SQUARE_H })),
        ...(a.keepOut ?? [])
      ]
      const win = windowNearSquare(square, target.win, a.vp, avoid)
      return patch(s, a.tabId, (p) => ({ ...p, square, win }))
    }
    case 'prune': {
      const pins = s.pins.filter((p) => a.keep.has(p.tabId))
      return pins.length === s.pins.length ? s : { pins }
    }
    case 'clampAll': {
      let changed = false
      const pins = s.pins.map((p) => {
        const square = clampSquare(p.square, a.vp)
        const win = clampWindow(p.win, a.vp)
        if (
          square.x === p.square.x &&
          square.y === p.square.y &&
          win.x === p.win.x &&
          win.y === p.win.y &&
          win.w === p.win.w &&
          win.h === p.win.h
        ) {
          return p
        }
        changed = true
        return { ...p, square, win }
      })
      return changed ? { pins } : s
    }
  }
}

const KINDS: readonly PinKind[] = ['agent', 'terminal', 'browser', 'editor']
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function parsePinned(raw: string | null): PinnedState {
  if (!raw) {
    return EMPTY_PINNED
  }
  try {
    const data: unknown = JSON.parse(raw)
    const list = (data as { pins?: unknown })?.pins
    if (!Array.isArray(list)) {
      return EMPTY_PINNED
    }
    const pins: PinnedSession[] = []
    const seen = new Set<string>()
    for (const item of list) {
      const p = item as Partial<PinnedSession> | null
      if (
        !p ||
        typeof p.tabId !== 'string' ||
        typeof p.worktreeId !== 'string' ||
        typeof p.name !== 'string' ||
        !p.square ||
        !num(p.square.x) ||
        !num(p.square.y) ||
        !p.win ||
        !num(p.win.x) ||
        !num(p.win.y) ||
        !num(p.win.w) ||
        !num(p.win.h) ||
        seen.has(p.tabId) ||
        pins.length >= MAX_PINS
      ) {
        continue
      }
      seen.add(p.tabId)
      pins.push({
        tabId: p.tabId,
        worktreeId: p.worktreeId,
        kind: KINDS.includes(p.kind as PinKind) ? (p.kind as PinKind) : 'agent',
        name: p.name,
        square: { x: p.square.x, y: p.square.y },
        win: { x: p.win.x, y: p.win.y, w: p.win.w, h: p.win.h },
        open: p.open === true,
        view: p.view === 'chat' || p.view === 'terminal' ? p.view : 'auto',
        z: num(p.z) ? p.z : pins.length + 1
      })
    }
    return { pins }
  } catch {
    // ok: corrupted saved pin state safely falls back to EMPTY_PINNED
    return EMPTY_PINNED
  }
}

export const serializePinned = (s: PinnedState): string => JSON.stringify({ pins: s.pins })
