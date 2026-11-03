// WS-A (TASK_16 wave 2): smart ⌘D (penpot-mpl/duplicate-delta.ts: move the copy, ⌘D again repeats that
// offset for 10 s). A duplicated group becomes a NEW group (copy + regroup = one undo entry).
// Agent data: copies only notes / shapes / text (+ arrows between them); never a goal tile.
import { useCallback, useRef } from 'react'
import type { CanvasCtx } from '../canvas-ctx'
import type { SpaceStickyNote } from '../../core/space'
import {
  calcDuplicateDelta,
  memorizeDuplicated,
  type DuplicateMemo
} from '../../penpot-mpl/duplicate-delta'
import { regroupCopyPatches } from './duplicate-groups'

/** First-copy offsets (unchanged from before WS-A): one item +24, several +28. */
export const DUPLICATE_OFFSET_ONE = { x: 24, y: 24 }
export const DUPLICATE_OFFSET_MANY = { x: 28, y: 28 }

export function useDuplicateSelected(ctx: CanvasCtx): () => void {
  const {
    effectiveSelectedIds,
    onBatchDuplicateStickyNotes,
    onBatchUpdateStickyNotes,
    onDuplicateStickyNote,
    onWhiteboardTransaction,
    setSelectedStickyIds,
    stickies,
    stickiesById
  } = ctx
  const duplicateMemoRef = useRef<DuplicateMemo | null>(null)
  return useCallback((): void => {
    const unlocked = effectiveSelectedIds.filter((id) => !stickiesById.get(id)?.locked)
    if (unlocked.length === 0) {
      return
    }
    const now = Date.now()
    const delta = calcDuplicateDelta(
      duplicateMemoRef.current,
      unlocked,
      (id) => stickiesById.get(id),
      now,
      unlocked.length >= 2 ? DUPLICATE_OFFSET_MANY : DUPLICATE_OFFSET_ONE
    )
    // The board copies keep the source groupId; a duplicated group must be a NEW group (WS-C rule).
    const grouped = unlocked.some((id) => stickiesById.get(id)?.groupId)
    const run = (): void => {
      if (unlocked.length >= 2 && onBatchDuplicateStickyNotes) {
        const created = onBatchDuplicateStickyNotes(unlocked, delta)
        if (Array.isArray(created) && created.length > 0) {
          setSelectedStickyIds(created)
          duplicateMemoRef.current = memorizeDuplicated(unlocked, created, now)
          if (grouped) {
            // The board returns copies in board order (space.stickies), the same order as here.
            const set = new Set(unlocked)
            regroupCopies(
              stickies.filter((st) => set.has(st.id)),
              created
            )
          }
        }
        return
      }
      const firstId = unlocked[0]!
      const clonedId = onDuplicateStickyNote?.(firstId, delta)
      if (typeof clonedId === 'string') {
        setSelectedStickyIds([clonedId])
        duplicateMemoRef.current = memorizeDuplicated([firstId], [clonedId], now)
        if (grouped) {
          const src = stickiesById.get(firstId)
          regroupCopies(src ? [src] : [], [clonedId])
        }
      }
    }
    function regroupCopies(sources: readonly SpaceStickyNote[], created: readonly string[]): void {
      const patches = regroupCopyPatches(sources, created)
      if (Object.keys(patches).length > 0) {
        onBatchUpdateStickyNotes?.(patches)
      }
    }
    if (grouped && onWhiteboardTransaction) {
      // Copy + regroup = ONE undo entry.
      onWhiteboardTransaction(run)
    } else {
      run()
    }
  }, [
    effectiveSelectedIds,
    onBatchDuplicateStickyNotes,
    onBatchUpdateStickyNotes,
    onDuplicateStickyNote,
    onWhiteboardTransaction,
    setSelectedStickyIds,
    stickies,
    stickiesById
  ])
}
