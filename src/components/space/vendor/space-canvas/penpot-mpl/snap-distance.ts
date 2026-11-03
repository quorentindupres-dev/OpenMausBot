// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) KALEIDOS SUBSIDIARY SL
//
// Ported from penpot/frontend/src/app/main/snap.cljs@e20a0d7
//   (sr-distance, overlap?, calculate-snap; app.util.range-tree replaced by a sorted array)
// Ported from penpot/frontend/src/app/main/ui/workspace/viewport/snap_distances.cljs@e20a0d7
//   (half-point, calculate-segments)
// Ported from penpot/common/src/app/common/geom/shapes.cljc@e20a0d7 (get-areas)
//
// Changes from the original (see PROVENANCE.md):
// - calculate-snap returns the snap with the smallest ABSOLUTE value (Penpot reduces with `min`,
//   which picks the most negative delta); accuracy is passed in (already divided by zoom).
// - `(apply min #{})` on no candidates returns no segments instead of throwing.
// - Pure TypeScript over {x1, y1, x2, y2}; no shapes, frames, workers or streams.

export type Axis = 'x' | 'y'

/** Penpot's selrect: two corners, x1 <= x2, y1 <= y2. */
export type SelRect = { x1: number; y1: number; x2: number; y2: number }

/** Distance along `axis` from the end of sr1 to the start of sr2 (sr-distance). */
export function srDistance(axis: Axis, sr1: SelRect, sr2: SelRect): number {
  return axis === 'x' ? sr2.x1 - sr1.x2 : sr2.y1 - sr1.y2
}

/** Do sr1 and sr2 overlap on the axis opposite to `axis` (overlap?). Inclusive. */
export function overlap(axis: Axis, sr1: SelRect, sr2: SelRect): boolean {
  const s1c1 = axis === 'x' ? sr1.y1 : sr1.x1
  const s1c2 = axis === 'x' ? sr1.y2 : sr1.x2
  const s2c1 = axis === 'x' ? sr2.y1 : sr2.x1
  const s2c2 = axis === 'x' ? sr2.y2 : sr2.x2
  return (
    (s2c1 >= s1c1 && s2c1 <= s1c2) ||
    (s2c2 >= s1c1 && s2c2 <= s1c2) ||
    (s1c1 >= s2c1 && s1c1 <= s2c2) ||
    (s1c2 >= s2c1 && s1c2 <= s2c2)
  )
}

/** The four strips around `selrect` up to `bounds` (gsh/get-areas). */
export function getAreas(
  bounds: SelRect,
  selrect: SelRect
): { left: SelRect; top: SelRect; right: SelRect; bottom: SelRect } {
  return {
    left: { x1: bounds.x1, y1: selrect.y1, x2: selrect.x1, y2: selrect.y2 },
    top: { x1: selrect.x1, y1: bounds.y1, x2: selrect.x2, y2: selrect.y1 },
    right: { x1: selrect.x2, y1: selrect.y1, x2: bounds.x2, y2: selrect.y2 },
    bottom: { x1: selrect.x1, y1: selrect.y2, x2: selrect.x2, y2: bounds.y2 }
  }
}

/** d/map-perm: f over every ordered pair (i < j) that passes pred. */
function mapPerm<T, R>(
  items: readonly T[],
  f: (a: T, b: T) => R,
  pred: (a: T, b: T) => boolean
): R[] {
  const out: R[] = []
  for (let i = 0; i < items.length; i++) {
    const left = items[i]!
    for (let j = i + 1; j < items.length; j++) {
      const right = items[j]!
      if (pred(left, right)) {
        out.push(f(left, right))
      }
    }
  }
  return out
}

function sortedNumbers(values: Iterable<number>): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b)
}

/** rt/range-query on a sorted array: every value in [lo, hi]. */
function rangeQuery(sorted: readonly number[], lo: number, hi: number): number[] {
  let a = 0
  let b = sorted.length
  while (a < b) {
    const mid = (a + b) >> 1
    if (sorted[mid]! < lo) {
      a = mid + 1
    } else {
      b = mid
    }
  }
  const out: number[] = []
  for (let i = a; i < sorted.length && sorted[i]! <= hi; i++) {
    out.push(sorted[i]!)
  }
  return out
}

/**
 * calculate-snap: the move along `axis` that makes a gap from `selrect` to its neighbours equal
 * to a gap that already exists between neighbours on the same side, or equal on both sides.
 * `shapesLt` / `shapesGt` are the rects before / after `selrect` on `axis`.
 * Returns the delta, or null when nothing is within `accuracy`.
 */
export function calculateSnap(
  axis: Axis,
  selrect: SelRect,
  shapesLt: readonly SelRect[],
  shapesGt: readonly SelRect[],
  accuracy: number
): number | null {
  const start = (r: SelRect): number => (axis === 'x' ? r.x1 : r.y1)
  const distLt = (other: SelRect): number => srDistance(axis, other, selrect)
  const distGt = (other: SelRect): number => srDistance(axis, selrect, other)

  // Calculates the distance between all the shapes given as argument
  const innerDistance = (selrects: readonly SelRect[]): number[] =>
    sortedNumbers(
      mapPerm(
        [...selrects].sort((a, b) => start(a) - start(b)),
        (a, b) => srDistance(axis, a, b),
        (a, b) => overlap(axis, a, b)
      )
    )

  // Distance between the elements in an area, these are the snap candidates to either side
  const ltCand = innerDistance(shapesLt)
  const gtCand = innerDistance(shapesGt)

  // Distance between the elements to either side and the current shape: this is what will "snap"
  const ltDist = sortedNumbers(shapesLt.map(distLt))
  const gtDist = sortedNumbers(shapesGt.map(distGt))

  const getSideSnaps = (candidates: readonly number[], distances: readonly number[]): number[] =>
    distances.flatMap((cd) =>
      rangeQuery(candidates, cd - accuracy, cd + accuracy).map((v) => v - cd)
    )

  const getMiddleSnaps = (lt: readonly number[], gt: readonly number[]): number[] =>
    gt.flatMap((cd) =>
      rangeQuery(lt, cd - accuracy * 2, cd + accuracy * 2).map((v) => (cd - v) / 2)
    )

  // Calculate the snaps, we need to reverse depending on area
  const snapList = [
    ...getSideSnaps(ltCand, ltDist),
    ...getSideSnaps(gtDist, gtCand),
    ...getMiddleSnaps(ltDist, gtDist)
  ]

  let best: number | null = null
  for (const s of snapList) {
    if (best === null || Math.abs(s) < Math.abs(best)) {
      best = s
    }
  }
  return best
}

/** half-point: middle of the overlap of sr1 and sr2 on the axis opposite to `axis`. */
export function halfPoint(axis: Axis, sr1: SelRect, sr2: SelRect): number {
  const c1 = Math.max(axis === 'x' ? sr1.y1 : sr1.x1, axis === 'x' ? sr2.y1 : sr2.x1)
  const c2 = Math.min(axis === 'x' ? sr1.y2 : sr1.x2, axis === 'x' ? sr2.y2 : sr2.x2)
  return c1 + (c2 - c1) / 2
}

/**
 * calculate-segments: the pairs of rects whose gap should be drawn, i.e. the smallest gap
 * from `selrect` that repeats somewhere (between neighbours, or on both sides of `selrect`).
 */
export function calculateSegments(
  axis: Axis,
  selrect: SelRect,
  ltShapes: readonly SelRect[],
  gtShapes: readonly SelRect[]
): [SelRect, SelRect][] {
  const start = (r: SelRect): number => (axis === 'x' ? r.x1 : r.y1)

  const distanceToSelrect = (sr: SelRect): number =>
    start(sr) <= start(selrect) ? srDistance(axis, sr, selrect) : srDistance(axis, selrect, sr)

  const getShapesMatch = (
    pred: (d: number) => boolean,
    shapes: readonly SelRect[]
  ): [number, [SelRect, SelRect]][] =>
    mapPerm(
      [...shapes].sort((a, b) => start(a) - start(b)),
      (a, b): [number, [SelRect, SelRect]] => [srDistance(axis, a, b), [a, b]],
      (a, b) => overlap(axis, a, b)
    ).filter(([d]) => pred(d))

  // Checks if the value is in a set of numbers with an error margin
  const checkInSet = (value: number, numbers: Iterable<number>): boolean => {
    for (const n of numbers) {
      if (Math.abs(value - n) <= 1.5) {
        return true
      }
    }
    return false
  }

  const ltDistances = new Set(ltShapes.map(distanceToSelrect).filter((d) => d > 0))
  const gtDistances = new Set(gtShapes.map(distanceToSelrect).filter((d) => d > 0))
  const distances = new Set([...ltDistances, ...gtDistances])

  // We'll show the distances that match a distance from the selrect
  const showCandidate = (d: number): boolean => checkInSet(d, distances)

  // Checks the distances between elements for distances that match the set of distances
  const distanceCoincidences = [
    ...getShapesMatch(showCandidate, ltShapes),
    ...getShapesMatch(showCandidate, gtShapes)
  ]

  // Stores the distance candidates to be shown
  const distanceCandidates = [
    ...distanceCoincidences.map(([d]) => d),
    ...[...gtDistances].filter((d) => checkInSet(d, ltDistances)),
    ...[...ltDistances].filter((d) => checkInSet(d, gtDistances))
  ]
  if (distanceCandidates.length === 0) {
    return []
  }

  // Of these candidates we keep only the smaller to be displayed
  const minDistance = Math.min(...distanceCandidates)
  const showDistance = (d: number): boolean => checkInSet(d, [minDistance])

  // First segments from segments different than the selection
  const otherShapesSegments = distanceCoincidences
    .filter(([d]) => showDistance(d))
    .map(([, pair]) => pair)

  // Segments from the selection to the other shapes
  const selectionSegments = [...ltShapes, ...gtShapes]
    .filter((sr) => showDistance(distanceToSelrect(sr)))
    .map((sr): [SelRect, SelRect] => [selrect, sr])

  return [...otherShapesSegments, ...selectionSegments]
}
