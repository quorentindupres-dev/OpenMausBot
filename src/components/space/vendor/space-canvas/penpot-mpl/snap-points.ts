// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) KALEIDOS SUBSIDIARY SL
//
// Ported from penpot/common/src/app/common/geom/snap.cljc@e20a0d7 (rect->snap-points)
// Ported from penpot/frontend/src/app/main/snap.cljs@e20a0d7
//   (snap-accuracy-ranges + calculate-distance + get-min-distance-snap, snap->vector)
//
// Changes from the original (see PROVENANCE.md):
// - The worker index query is replaced by a caller-given `query(lo, hi)` per axis.
// - Pure TypeScript; no streams, no frames.

import type { SelRect } from './snap-distance'

export type SnapPoint = { x: number; y: number }

/** rect->snap-points: the 4 corners and the center. */
export function rectToSnapPoints(r: SelRect): SnapPoint[] {
  return [
    { x: r.x1, y: r.y1 },
    { x: r.x2, y: r.y1 },
    { x: r.x2, y: r.y2 },
    { x: r.x1, y: r.y2 },
    { x: r.x1 + (r.x2 - r.x1) / 2, y: r.y1 + (r.y2 - r.y1) / 2 }
  ]
}

/**
 * snap-accuracy-ranges + get-min-distance-snap for one axis: for every moving coordinate, query the
 * candidates in [c - accuracy, c + accuracy] and keep the closest pair as [from, to].
 */
export function getMinDistanceSnap(
  coords: readonly number[],
  accuracy: number,
  query: (lo: number, hi: number) => Iterable<number>
): [from: number, to: number] | null {
  let best: [number, number] | null = null
  let bestDist = Infinity
  for (const c of coords) {
    for (const value of query(c - accuracy, c + accuracy)) {
      const dist = Math.abs(value - c)
      if (dist < bestDist) {
        bestDist = dist
        best = [c, value]
      }
    }
  }
  return best
}

/** snap->vector: [[from-x to-x] [from-y to-y]] → the move vector, or null when neither axis snapped. */
export function snapToVector(
  x: [number, number] | null,
  y: [number, number] | null
): { x: number; y: number } | null {
  if (!x && !y) {
    return null
  }
  return { x: x ? x[1] - x[0] : 0, y: y ? y[1] - y[0] : 0 }
}
