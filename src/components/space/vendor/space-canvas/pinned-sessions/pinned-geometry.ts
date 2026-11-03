import { getKeepOuts, pushOutOfKeepOut } from '../core/keep-out'
import { createSnapIndex, snapRect } from '../core/whiteboard-snap'
import {
  getHandlerResizeOrigin,
  getResizeScale,
  resizeRect,
  type Handler
} from '../penpot-mpl/resize-handles'
import {
  BOTTOM_SAFE,
  SNAP_PX,
  TOP_SAFE,
  WIN_MAX_FRACTION,
  WIN_MIN,
  clampSquare,
  clampWindow,
  type Box,
  type Pt,
  type Viewport
} from '../core/pinned-sessions'

export function keepOutBoxes(): Box[] {
  return getKeepOuts().map((z) => ({
    x: z.left,
    y: z.top,
    w: z.right - z.left,
    h: z.bottom - z.top
  }))
}

export function clearOfKeepOut(b: Box): Box {
  const r = pushOutOfKeepOut({ left: b.x, top: b.y, right: b.x + b.w, bottom: b.y + b.h }, 8)
  return { x: Math.round(r.left), y: Math.round(r.top), w: b.w, h: b.h }
}

export function snapSquareMove(
  start: Box,
  dx: number,
  dy: number,
  others: readonly Box[],
  vp: Viewport,
  disabled = false
): Pt {
  const area: Box = { x: 0, y: TOP_SAFE, w: vp.w, h: vp.h - TOP_SAFE - BOTTOM_SAFE }
  const index = createSnapIndex([...others, area])
  const moved: Box = { ...start, x: start.x + dx, y: start.y + dy }
  const r = snapRect(moved, index, 1, { threshold: SNAP_PX, disabled })
  return clampSquare({ x: moved.x + r.dx, y: moved.y + r.dy }, vp)
}

type AxisFit = { a: number; b: number }

function fitAxis(
  a: number,
  b: number,
  lo: number,
  hi: number,
  min: number,
  max: number,
  movesA: boolean,
  movesB: boolean
): AxisFit {
  let na = Math.max(a, lo)
  let nb = Math.min(b, hi)
  const target = Math.min(Math.max(nb - na, min), max)
  if (nb - na !== target) {
    if (movesA && !movesB) {
      na = nb - target
    } else if (movesB && !movesA) {
      nb = na + target
    } else {
      const mid = (na + nb) / 2
      na = mid - target / 2
      nb = mid + target / 2
    }
  }
  if (na < lo) {
    nb += lo - na
    na = lo
  }
  if (nb > hi) {
    na -= nb - hi
    nb = hi
  }
  return { a: na, b: nb }
}

type Bounds = { lo: number; hi: number }

function maxScaleOnAxis(a: number, b: number, o: number, bounds: Bounds): number {
  let m = Infinity
  if (a < o) {
    m = Math.min(m, (o - bounds.lo) / (o - a))
  }
  if (b > o) {
    m = Math.min(m, (bounds.hi - o) / (b - o))
  }
  return m
}

function resizeLocked(start: Box, handler: Handler, from: Pt, to: Pt, vp: Viewport): Box {
  const rect = { x: start.x, y: start.y, width: start.w, height: start.h }
  const raw = getResizeScale(rect, handler, from, to, true).x
  const o = getHandlerResizeOrigin(rect, handler)
  const maxW = Math.max(WIN_MIN.w, vp.w * WIN_MAX_FRACTION)
  const maxH = Math.max(WIN_MIN.h, (vp.h - TOP_SAFE - BOTTOM_SAFE) * WIN_MAX_FRACTION)
  const sMin = Math.max(WIN_MIN.w / start.w, WIN_MIN.h / start.h)
  const sMax = Math.min(
    maxW / start.w,
    maxH / start.h,
    maxScaleOnAxis(start.x, start.x + start.w, o.x, { lo: 0, hi: vp.w }),
    maxScaleOnAxis(start.y, start.y + start.h, o.y, { lo: TOP_SAFE, hi: vp.h - BOTTOM_SAFE })
  )
  const s = Math.max(sMin, Math.min(Math.max(0, raw), sMax))
  const w = Math.round(start.w * s)
  const h = Math.round(start.h * s)
  return clampWindow(
    { x: Math.round(o.x + (start.x - o.x) * s), y: Math.round(o.y + (start.y - o.y) * s), w, h },
    vp
  )
}

export function resizeWindowByHandle(
  start: Box,
  handler: Handler,
  from: Pt,
  to: Pt,
  vp: Viewport,
  lock = false
): Box {
  if (lock) {
    return resizeLocked(start, handler, from, to, vp)
  }
  const r = {
    ...resizeRect({ x: start.x, y: start.y, width: start.w, height: start.h }, handler, from, to)
  }
  const scale = getResizeScale(
    { x: start.x, y: start.y, width: start.w, height: start.h },
    handler,
    from,
    to
  )
  if (scale.x < 0) {
    r.x = handler.includes('left') ? start.x + start.w : start.x
    r.width = 0
  }
  if (scale.y < 0) {
    r.y = handler.includes('top') ? start.y + start.h : start.y
    r.height = 0
  }
  const maxW = Math.max(WIN_MIN.w, vp.w * WIN_MAX_FRACTION)
  const maxH = Math.max(WIN_MIN.h, (vp.h - TOP_SAFE - BOTTOM_SAFE) * WIN_MAX_FRACTION)
  const x = fitAxis(
    r.x,
    r.x + r.width,
    0,
    vp.w,
    WIN_MIN.w,
    maxW,
    handler.includes('left'),
    handler.includes('right')
  )
  const y = fitAxis(
    r.y,
    r.y + r.height,
    TOP_SAFE,
    vp.h - BOTTOM_SAFE,
    WIN_MIN.h,
    maxH,
    handler.includes('top'),
    handler.includes('bottom')
  )
  return {
    x: Math.round(x.a),
    y: Math.round(y.a),
    w: Math.round(x.b - x.a),
    h: Math.round(y.b - y.a)
  }
}
