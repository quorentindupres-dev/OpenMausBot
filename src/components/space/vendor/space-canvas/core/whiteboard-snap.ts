// Snapping + smart guides for the Spaces whiteboard. Idea and gap math from Penpot (MPL-2.0):
// frontend/src/app/main/snap.cljs and viewport/snap_distances.cljs. The close ports live in
// ../penpot-mpl/ (MPL-2.0, see PROVENANCE.md); this file is our own glue: the per-gesture index,
// the screen-px threshold, resize handles, combining point + gap snaps, and the guide shapes.

import {
  calculateSegments,
  calculateSnap,
  getAreas,
  overlap,
  srDistance,
  type Axis,
  type SelRect
} from '../penpot-mpl/snap-distance'
import { getMinDistanceSnap, rectToSnapPoints } from '../penpot-mpl/snap-points'

export type { Axis } from '../penpot-mpl/snap-distance'

export type SnapRect = { x: number; y: number; w: number; h: number }
export type SnapKind = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export type SnapGuide =
  | { kind: 'line'; axis: Axis; at: number; from: number; to: number }
  | { kind: 'gap'; axis: Axis; from: number; to: number; cross: number; gap: number }

export type SnapResult = { dx: number; dy: number; guides: SnapGuide[] }

export type SnapOptions = {
  threshold?: number
  kind?: SnapKind
  disabled?: boolean
}

type AxisEntry = { value: number; lo: number; hi: number }
type AxisIndex = { values: Float64Array; entries: AxisEntry[] }

export type SnapIndex = {
  readonly rects: readonly SelRect[]
  readonly x: AxisIndex
  readonly y: AxisIndex
  readonly bounds: SelRect
}

export const SNAP_THRESHOLD_PX = 6
export const MAX_GAP_NEIGHBOURS = 12
const GUIDE_EPSILON_PX = 0.5
const NO_SNAP: SnapResult = Object.freeze({ dx: 0, dy: 0, guides: [] }) as SnapResult
const UNBOUNDED: SelRect = { x1: -Infinity, y1: -Infinity, x2: Infinity, y2: Infinity }

export function toSelRect(r: SnapRect): SelRect {
  const x1 = Math.min(r.x, r.x + r.w)
  const y1 = Math.min(r.y, r.y + r.h)
  return { x1, y1, x2: x1 + Math.abs(r.w), y2: y1 + Math.abs(r.h) }
}

export function snapDisabledBy(event: { metaKey?: boolean }): boolean {
  return Boolean(event.metaKey)
}

function buildAxis(rects: readonly SelRect[], axis: Axis): AxisIndex {
  const entries: AxisEntry[] = []
  for (const r of rects) {
    const [a1, a2, lo, hi] = axis === 'x' ? [r.x1, r.x2, r.y1, r.y2] : [r.y1, r.y2, r.x1, r.x2]
    entries.push(
      { value: a1, lo, hi },
      { value: a2, lo, hi },
      { value: a1 + (a2 - a1) / 2, lo, hi }
    )
  }
  entries.sort((a, b) => a.value - b.value)
  return { values: Float64Array.from(entries, (e) => e.value), entries }
}

export function createSnapIndex(
  others: readonly SnapRect[],
  opts: { bounds?: SnapRect } = {}
): SnapIndex {
  const rects = others.map(toSelRect)
  return {
    rects,
    x: buildAxis(rects, 'x'),
    y: buildAxis(rects, 'y'),
    bounds: opts.bounds ? toSelRect(opts.bounds) : UNBOUNDED
  }
}

function asIndex(others: SnapIndex | readonly SnapRect[]): SnapIndex {
  return 'rects' in others ? others : createSnapIndex(others)
}

function lowerBound(values: Float64Array, lo: number): number {
  let a = 0
  let b = values.length
  while (a < b) {
    const mid = (a + b) >> 1
    if (values[mid]! < lo) {
      a = mid + 1
    } else {
      b = mid
    }
  }
  return a
}

function* queryValues(axis: AxisIndex, lo: number, hi: number): Generator<number> {
  for (let i = lowerBound(axis.values, lo); i < axis.values.length && axis.values[i]! <= hi; i++) {
    yield axis.values[i]!
  }
}

export function snapPoints(rect: SnapRect, kind: SnapKind = 'move'): { x: number[]; y: number[] } {
  const r = toSelRect(rect)
  if (kind === 'move') {
    const pts = rectToSnapPoints(r)
    const center = pts[4]!
    return { x: [r.x1, r.x2, center.x], y: [r.y1, r.y2, center.y] }
  }
  const x: number[] = []
  const y: number[] = []
  if (kind.includes('w')) {
    x.push(r.x1)
  }
  if (kind.includes('e')) {
    x.push(r.x2)
  }
  if (kind.includes('n')) {
    y.push(r.y1)
  }
  if (kind.includes('s')) {
    y.push(r.y2)
  }
  return { x, y }
}

export function applySnapDelta(
  rect: SnapRect,
  dx: number,
  dy: number,
  kind: SnapKind = 'move'
): SnapRect {
  if (kind === 'move') {
    return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h }
  }
  let { x, y, w, h } = rect
  if (kind.includes('w')) {
    x += dx
    w -= dx
  } else if (kind.includes('e')) {
    w += dx
  }
  if (kind.includes('n')) {
    y += dy
    h -= dy
  } else if (kind.includes('s')) {
    h += dy
  }
  return { x, y, w, h }
}

function pointDelta(coords: readonly number[], axis: AxisIndex, accuracy: number): number | null {
  const hit = getMinDistanceSnap(coords, accuracy, (lo, hi) => queryValues(axis, lo, hi))
  return hit ? hit[1] - hit[0] : null
}

function lineGuides(
  final: SelRect,
  coords: readonly number[],
  axisName: Axis,
  axis: AxisIndex,
  eps: number
): SnapGuide[] {
  const crossLo = axisName === 'x' ? final.y1 : final.x1
  const crossHi = axisName === 'x' ? final.y2 : final.x2
  const byValue = new Map<number, { from: number; to: number }>()
  for (const c of coords) {
    for (
      let i = lowerBound(axis.values, c - eps);
      i < axis.values.length && axis.values[i]! <= c + eps;
      i++
    ) {
      const e = axis.entries[i]!
      const cur = byValue.get(e.value) ?? { from: crossLo, to: crossHi }
      cur.from = Math.min(cur.from, e.lo)
      cur.to = Math.max(cur.to, e.hi)
      byValue.set(e.value, cur)
    }
  }
  return [...byValue].map(([at, span]) => ({
    kind: 'line',
    axis: axisName,
    at,
    from: span.from,
    to: span.to
  }))
}

function sideNeighbours(
  index: SnapIndex,
  sel: SelRect,
  axis: Axis
): { lt: SelRect[]; gt: SelRect[] } {
  const areas = getAreas(index.bounds, sel)
  const ltArea = axis === 'x' ? areas.left : areas.top
  const gtArea = axis === 'x' ? areas.right : areas.bottom
  const lt: SelRect[] = []
  const gt: SelRect[] = []
  for (const r of index.rects) {
    if (!overlap(axis, r, sel)) {
      continue
    }
    if (axis === 'x') {
      if (r.x2 <= sel.x1 && r.x1 >= ltArea.x1) {
        lt.push(r)
      } else if (r.x1 >= sel.x2 && r.x2 <= gtArea.x2) {
        gt.push(r)
      }
    } else if (r.y2 <= sel.y1 && r.y1 >= ltArea.y1) {
      lt.push(r)
    } else if (r.y1 >= sel.y2 && r.y2 <= gtArea.y2) {
      gt.push(r)
    }
  }
  return {
    lt: nearest(lt, (r) => srDistance(axis, r, sel)),
    gt: nearest(gt, (r) => srDistance(axis, sel, r))
  }
}

function nearest(rects: SelRect[], dist: (r: SelRect) => number): SelRect[] {
  if (rects.length <= MAX_GAP_NEIGHBOURS) {
    return rects
  }
  return rects
    .map((r) => ({ r, d: dist(r) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_GAP_NEIGHBOURS)
    .map((e) => e.r)
}

function gapGuides(index: SnapIndex, sel: SelRect, axis: Axis): SnapGuide[] {
  const { lt, gt } = sideNeighbours(index, sel, axis)
  return calculateSegments(axis, sel, lt, gt).map(([a, b]) => {
    const from = axis === 'x' ? Math.min(a.x2, b.x2) : Math.min(a.y2, b.y2)
    const to = axis === 'x' ? Math.max(a.x1, b.x1) : Math.max(a.y1, b.y1)
    const c1 = axis === 'x' ? Math.max(a.y1, b.y1) : Math.max(a.x1, b.x1)
    const c2 = axis === 'x' ? Math.min(a.y2, b.y2) : Math.min(a.x2, b.x2)
    return { kind: 'gap', axis, from, to, cross: c1 + (c2 - c1) / 2, gap: to - from }
  })
}

function closer(a: number | null, b: number | null): number | null {
  if (a === null || b === null) {
    return a ?? b
  }
  return Math.abs(b) < Math.abs(a) ? b : a
}

type Use = { points: boolean; gaps: boolean }

function solve(
  moving: SnapRect,
  others: SnapIndex | readonly SnapRect[],
  zoom: number,
  opts: SnapOptions,
  use: Use
): SnapResult {
  const kind = opts.kind ?? 'move'
  const gaps = use.gaps && kind === 'move'
  if (opts.disabled || (!use.points && !gaps)) {
    return NO_SNAP
  }
  const index = asIndex(others)
  const accuracy = (opts.threshold ?? SNAP_THRESHOLD_PX) / zoom
  let dx: number | null = null
  let dy: number | null = null
  if (use.points) {
    const pts = snapPoints(moving, kind)
    dx = pointDelta(pts.x, index.x, accuracy)
    dy = pointDelta(pts.y, index.y, accuracy)
  }
  if (gaps) {
    const sel = toSelRect(moving)
    const nx = sideNeighbours(index, sel, 'x')
    const ny = sideNeighbours(index, sel, 'y')
    dx = closer(dx, calculateSnap('x', sel, nx.lt, nx.gt, accuracy))
    dy = closer(dy, calculateSnap('y', sel, ny.lt, ny.gt, accuracy))
  }
  const moved = applySnapDelta(moving, dx ?? 0, dy ?? 0, kind)
  const final = toSelRect(moved)
  const guides: SnapGuide[] = []
  if (use.points) {
    const pts = snapPoints(moved, kind)
    const eps = GUIDE_EPSILON_PX / zoom
    guides.push(...lineGuides(final, pts.x, 'x', index.x, eps))
    guides.push(...lineGuides(final, pts.y, 'y', index.y, eps))
  }
  if (gaps) {
    guides.push(...gapGuides(index, final, 'x'), ...gapGuides(index, final, 'y'))
  }
  return { dx: dx ?? 0, dy: dy ?? 0, guides }
}

export function snapMove(
  moving: SnapRect,
  others: SnapIndex | readonly SnapRect[],
  zoom: number,
  opts: SnapOptions = {}
): SnapResult {
  return solve(moving, others, zoom, opts, { points: true, gaps: false })
}

export function snapGaps(
  moving: SnapRect,
  others: SnapIndex | readonly SnapRect[],
  zoom: number,
  opts: SnapOptions = {}
): SnapResult {
  return solve(moving, others, zoom, opts, { points: false, gaps: true })
}

export function snapRect(
  moving: SnapRect,
  others: SnapIndex | readonly SnapRect[],
  zoom: number,
  opts: SnapOptions = {}
): SnapResult {
  return solve(moving, others, zoom, opts, { points: true, gaps: true })
}
