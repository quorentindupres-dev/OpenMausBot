// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) KALEIDOS SUBSIDIARY SL
//
// Ported from penpot/frontend/src/app/main/data/workspace/selection.cljs@e20a0d7
//   (memorize-duplicated, clear-memorize-duplicated, calc-duplicate-delta)
//
// Changes from the original (see PROVENANCE.md):
// - The memo holds id SETS (a multi-selection is one object): the distance is taken between the
//   top-left corners of the two sets' bounding boxes, not between two single shapes.
// - The 10 s timer is a timestamp checked at use (`now`), not an rx timer that clears state.
// - The fallback is the caller's default offset (ours is +24/+28), not Penpot's frame rule.
// - Pure TypeScript; no state atom.

export type DupPoint = { x: number; y: number }
export type DupBox = { x: number; y: number }

/** memorize-duplicated: what the last ⌘D copied, and when. */
export type DuplicateMemo = {
  originalIds: readonly string[]
  duplicateIds: readonly string[]
  at: number
}

/** Penpot: "This time may be adjusted after some user testing." */
export const DUPLICATE_MEMO_MS = 10_000

export function memorizeDuplicated(
  originalIds: readonly string[],
  duplicateIds: readonly string[],
  now: number
): DuplicateMemo {
  return { originalIds: [...originalIds], duplicateIds: [...duplicateIds], at: now }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length || a.length === 0) {
    return false
  }
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

/** Top-left of the bounding box (selrect point); null when any id is gone (deleted). */
function topLeft(
  ids: readonly string[],
  boxOf: (id: string) => DupBox | undefined
): DupPoint | null {
  let x = Infinity
  let y = Infinity
  for (const id of ids) {
    const b = boxOf(id)
    if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      return null
    }
    x = Math.min(x, b.x)
    y = Math.min(y, b.y)
  }
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

/**
 * calc-duplicate-delta: the offset for the next copy of `selectedIds`.
 * - selection = the last copies → repeat the distance the user moved them (grid / cascade);
 * - selection = the last originals → the copy lands one distance past the first copy;
 * - else, memo older than 10 s, or an id deleted → `fallback`.
 */
export function calcDuplicateDelta(
  memo: DuplicateMemo | null,
  selectedIds: readonly string[],
  boxOf: (id: string) => DupBox | undefined,
  now: number,
  fallback: DupPoint
): DupPoint {
  if (!memo || now - memo.at > DUPLICATE_MEMO_MS) {
    return fallback
  }
  if (!sameSet(selectedIds, memo.originalIds) && !sameSet(selectedIds, memo.duplicateIds)) {
    return fallback
  }
  const ptOriginal = topLeft(memo.originalIds, boxOf)
  const ptDuplicated = topLeft(memo.duplicateIds, boxOf)
  const ptObj = topLeft(selectedIds, boxOf)
  if (!ptOriginal || !ptDuplicated || !ptObj) {
    return fallback
  }
  const distance = { x: ptDuplicated.x - ptOriginal.x, y: ptDuplicated.y - ptOriginal.y }
  const newPos = { x: ptDuplicated.x + distance.x, y: ptDuplicated.y + distance.y }
  return { x: newPos.x - ptObj.x, y: newPos.y - ptObj.y }
}
