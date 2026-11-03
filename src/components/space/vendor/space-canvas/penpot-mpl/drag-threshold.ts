// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) KALEIDOS SUBSIDIARY SL
//
// Ported from penpot/frontend/src/app/main/data/workspace/transforms.cljs@e20a0d7
//   (start-move-selected: `(rx/map gpt/length)` + `(rx/filter #(> % (/ 10 zoom)))` + `(rx/take 1)`)
// Ported from penpot/frontend/src/app/main/data/workspace/transforms.cljs@e20a0d7
//   (start-resize l.404-410: the same rule decides when a resize starts, "a click in the border will not resize")
//
// Changes from the original (see PROVENANCE.md):
// - A pure check per pointer event instead of an rx stream; threshold is a parameter
//   (Penpot 10, the pinned square uses 4 so a click stays a click).

/** True once the pointer is farther than `threshold / zoom` from where it went down. */
export function passedDragThreshold(
  start: { x: number; y: number },
  now: { x: number; y: number },
  threshold: number,
  zoom = 1
): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) > threshold / zoom
}

/** Penpot's value for both rules: 10 px (document units, divided by zoom). */
export const PENPOT_DRAG_THRESHOLD = 10

/** start-resize: a resize starts only after the pointer moved farther than 10 / zoom. */
export function passedResizeThreshold(
  start: { x: number; y: number },
  now: { x: number; y: number },
  zoom = 1,
  threshold = PENPOT_DRAG_THRESHOLD
): boolean {
  return passedDragThreshold(start, now, threshold, zoom)
}
