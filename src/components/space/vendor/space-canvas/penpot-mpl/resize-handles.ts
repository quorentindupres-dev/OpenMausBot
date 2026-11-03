// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) KALEIDOS SUBSIDIARY SL
//
// Ported from penpot/frontend/src/app/main/data/workspace/transforms.cljs@e20a0d7
//   (get-handler-multiplier, get-handler-resize-origin, fix-init-point, and the `resize` scale
//   step of start-resize: deltav, scalev, proportion lock, resize from center)
// Ported from penpot/common/src/app/common/geom/point.cljc@e20a0d7 (no-zeros)
// Ported from penpot/common/src/app/common/math.cljc@e20a0d7 (almost-zero?)
//
// Changes from the original (see PROVENANCE.md):
// - Unrotated boxes only (no transform matrices), one box (no multi-selection, no image crop).
// - Returns the new box instead of a modifiers object; ctm/resize = scale the corners about the origin.
// - No min / max here: Penpot has none (a box flips). Our glue clamps.
// - Not ported from start-resize: the shape's :proportion-lock flag and scale-text lock (only Shift here),
//   pointer snapping (point-snap), and the 10 px start threshold (see drag-threshold.ts).

export type Handler =
  'right' | 'bottom' | 'left' | 'top' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

/** The 8 handles, sides first (Penpot draws sides, then corners). */
export const HANDLERS: readonly Handler[] = [
  'top',
  'right',
  'bottom',
  'left',
  'top-left',
  'top-right',
  'bottom-right',
  'bottom-left'
]

export type Point = { x: number; y: number }
/** Penpot's selrect: top-left + size. */
export type HandlerRect = { x: number; y: number; width: number; height: number }

/** get-handler-multiplier: which way the pointer delta grows the box for this handle. */
export function getHandlerMultiplier(handler: Handler): Point {
  switch (handler) {
    case 'right':
      return { x: 1, y: 0 }
    case 'bottom':
      return { x: 0, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
    case 'top':
      return { x: 0, y: -1 }
    case 'top-right':
      return { x: 1, y: -1 }
    case 'top-left':
      return { x: -1, y: -1 }
    case 'bottom-right':
      return { x: 1, y: 1 }
    case 'bottom-left':
      return { x: -1, y: 1 }
  }
}

/** get-handler-resize-origin: the opposite side / corner stays where it is. */
export function getHandlerResizeOrigin(r: HandlerRect, handler: Handler): Point {
  const sx = r.x
  const sy = r.y
  const mx = sx + r.width / 2
  const my = sy + r.height / 2
  const ex = sx + r.width
  const ey = sy + r.height
  switch (handler) {
    case 'right':
      return { x: sx, y: my }
    case 'bottom':
      return { x: mx, y: sy }
    case 'left':
      return { x: ex, y: my }
    case 'top':
      return { x: mx, y: ey }
    case 'top-right':
      return { x: sx, y: ey }
    case 'top-left':
      return { x: ex, y: ey }
    case 'bottom-right':
      return { x: sx, y: sy }
    case 'bottom-left':
      return { x: ex, y: sy }
  }
}

/** fix-init-point: snap the start point onto the grabbed edge so the resize is exact. */
export function fixInitPoint(initial: Point, handler: Handler, r: HandlerRect): Point {
  const out = { ...initial }
  if (handler.includes('left')) {
    out.x = r.x
  } else if (handler.includes('right')) {
    out.x = r.x + r.width
  }
  if (handler.includes('top')) {
    out.y = r.y
  } else if (handler.includes('bottom')) {
    out.y = r.y + r.height
  }
  return out
}

/** Penpot `almost-zero?` (math.cljc l.192-193): `abs < 1e-4`. */
export const ALMOST_ZERO = 1e-4

/** no-zeros: a scale that is almost zero becomes 0.001 (Penpot never collapses a box to nothing). */
function noZero(v: number): number {
  return Math.abs(v) < ALMOST_ZERO ? 0.001 : v
}

/** deltav · scalev (with the proportion lock) from start-resize. */
export function getResizeScale(
  r: HandlerRect,
  handler: Handler,
  initial: Point,
  point: Point,
  lock = false
): Point {
  const start = fixInitPoint(initial, handler, r)
  const mult = getHandlerMultiplier(handler)
  const dx = (point.x - start.x) * mult.x
  const dy = (point.y - start.y) * mult.y
  const sx = noZero((r.width + dx) / r.width)
  const sy = noZero((r.height + dy) / r.height)
  if (!lock) {
    return { x: sx, y: sy }
  }
  const v =
    handler === 'right' || handler === 'left'
      ? sx
      : handler === 'top' || handler === 'bottom'
        ? sy
        : Math.max(sx, sy)
  return { x: v, y: v }
}

export type ResizeOptions = {
  /** Shift: keep the proportion. */
  lock?: boolean
  /** Alt: grow from the center. */
  center?: boolean
}

/**
 * start-resize `resize` step: the new box for a pointer at `point`, the drag having started at
 * `initial`. The origin (opposite edge) stays; with `center` the box grows around its center.
 */
export function resizeRect(
  r: HandlerRect,
  handler: Handler,
  initial: Point,
  point: Point,
  opts: ResizeOptions = {}
): HandlerRect {
  const scale = getResizeScale(r, handler, initial, point, opts.lock)
  const handlerOrigin = getHandlerResizeOrigin(r, handler)
  let origin = handlerOrigin
  let box = r
  if (opts.center) {
    const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    // displacement = -((center - origin) * scale + origin - center); `ctm/move` the box, then resize
    // about the displaced origin (Penpot applies the move first).
    const dx = -((center.x - origin.x) * scale.x + origin.x - center.x)
    const dy = -((center.y - origin.y) * scale.y + origin.y - center.y)
    origin = { x: origin.x + dx, y: origin.y + dy }
    box = { ...r, x: r.x + dx, y: r.y + dy }
  }
  const x1 = origin.x + (box.x - origin.x) * scale.x
  const x2 = origin.x + (box.x + box.width - origin.x) * scale.x
  const y1 = origin.y + (box.y - origin.y) * scale.y
  const y2 = origin.y + (box.y + box.height - origin.y) * scale.y
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  }
}
