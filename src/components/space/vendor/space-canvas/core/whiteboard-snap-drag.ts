import { snapAxisDelta } from './whiteboard-kit'
import {
  applySnapDelta,
  snapDisabledBy,
  snapRect,
  type Axis,
  type SnapGuide,
  type SnapIndex,
  type SnapKind,
  type SnapRect
} from './whiteboard-snap'

export type DragModifiers = { shiftKey?: boolean; metaKey?: boolean }
export type SnappedDelta = { dx: number; dy: number; guides: readonly SnapGuide[] }

export const NO_GUIDES: readonly SnapGuide[] = Object.freeze([]) as readonly SnapGuide[]

function off(index: SnapIndex | null, mods: DragModifiers): boolean {
  return index === null || snapDisabledBy(mods)
}

export function snapMoveDelta(
  start: SnapRect,
  rawDx: number,
  rawDy: number,
  index: SnapIndex | null,
  zoom: number,
  mods: DragModifiers
): SnappedDelta {
  const locked = mods.shiftKey ? snapAxisDelta(rawDx, rawDy) : null
  const dx = locked ? locked.dx : rawDx
  const dy = locked ? locked.dy : rawDy
  if (off(index, mods)) {
    return { dx, dy, guides: NO_GUIDES }
  }
  const moved = { x: start.x + dx, y: start.y + dy, w: start.w, h: start.h }
  const r = snapRect(moved, index as SnapIndex, zoom)
  if (!locked) {
    return { dx: dx + r.dx, dy: dy + r.dy, guides: r.guides.length ? r.guides : NO_GUIDES }
  }
  const lockedAxis: Axis = Math.abs(rawDx) >= Math.abs(rawDy) ? 'y' : 'x'
  const fx = lockedAxis === 'x' ? dx : dx + r.dx
  const fy = lockedAxis === 'y' ? dy : dy + r.dy
  const final = snapRect(
    { x: start.x + fx, y: start.y + fy, w: start.w, h: start.h },
    index as SnapIndex,
    zoom
  )
  const guides = final.guides.filter((g) => g.axis !== lockedAxis)
  return { dx: fx, dy: fy, guides: guides.length ? guides : NO_GUIDES }
}

function draggedEdge(rect: SnapRect, kind: Exclude<SnapKind, 'move'>, axis: Axis): number | null {
  if (axis === 'x') {
    return kind.includes('w') ? rect.x : kind.includes('e') ? rect.x + rect.w : null
  }
  return kind.includes('n') ? rect.y : kind.includes('s') ? rect.y + rect.h : null
}

const CLAMPED_PX = 1
const ON_TARGET = 1e-6

export function snapResizeDelta(
  rawDx: number,
  rawDy: number,
  kind: Exclude<SnapKind, 'move'>,
  resize: (dx: number, dy: number) => SnapRect,
  index: SnapIndex | null,
  zoom: number,
  mods: DragModifiers
): SnappedDelta {
  if (off(index, mods)) {
    return { dx: rawDx, dy: rawDy, guides: NO_GUIDES }
  }
  const before = resize(rawDx, rawDy)
  const r = snapRect(before, index as SnapIndex, zoom, { kind })
  if (r.dx === 0 && r.dy === 0 && r.guides.length === 0) {
    return { dx: rawDx, dy: rawDy, guides: NO_GUIDES }
  }
  const target = applySnapDelta(before, r.dx, r.dy, kind)
  const final = resize(rawDx + r.dx, rawDy + r.dy)
  let dx = rawDx + r.dx
  let dy = rawDy + r.dy
  const hidden = new Set<Axis>()
  for (const axis of ['x', 'y'] as const) {
    const want = draggedEdge(target, kind, axis)
    const got = draggedEdge(final, kind, axis)
    if (want === null || got === null) {
      continue
    }
    const miss = Math.abs(got - want)
    if (miss > ON_TARGET) {
      hidden.add(axis)
    }
    if (miss > CLAMPED_PX) {
      if (axis === 'x') {
        dx = rawDx
      } else {
        dy = rawDy
      }
    }
  }
  const guides = hidden.size ? r.guides.filter((g) => !hidden.has(g.axis)) : r.guides
  return { dx, dy, guides: guides.length ? guides : NO_GUIDES }
}

export function snapPointTo(
  pt: { x: number; y: number },
  index: SnapIndex | null,
  zoom: number,
  mods: DragModifiers
): { x: number; y: number; guides: readonly SnapGuide[] } {
  if (off(index, mods)) {
    return { x: pt.x, y: pt.y, guides: NO_GUIDES }
  }
  const r = snapRect({ x: pt.x, y: pt.y, w: 0, h: 0 }, index as SnapIndex, zoom, { kind: 'se' })
  return { x: pt.x + r.dx, y: pt.y + r.dy, guides: r.guides.length ? r.guides : NO_GUIDES }
}

export function unionRect(rects: readonly SnapRect[]): SnapRect | null {
  if (rects.length === 0) {
    return null
  }
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.w)
    y2 = Math.max(y2, r.y + r.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}
