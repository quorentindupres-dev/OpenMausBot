// WS-0 (TASK_16 wave 2): selection actions (front / back / duplicate / delete / align / distribute,
// zoom to selection, fit all), moved verbatim from space-canvas.tsx. Owner: WS-A.
// WS-A: smart duplicate lives in use-duplicate.ts (move the copy, ⌘D again repeats that offset for
// 10 s) and the zoom steps shared by the keys (+ / - / Shift+0) and the bottom-right buttons.
// Agent data: duplicate copies only notes / shapes / text (+ arrows between them); never a goal tile.
import type { CanvasCtx } from '../canvas-ctx'
import type { BoxRect } from '../canvas-ctx'
import {
  type SpaceStickyNote,
  alignWhiteboardItems,
  fitSpaces,
  distributeWhiteboardItems,
  ZOOM_STEP_IN_FACTOR,
  ZOOM_STEP_OUT_FACTOR,
  zoomAt
} from '../../core/space'
import type { ToolbarMultiAlign, ToolbarMultiDistribute } from '../../whiteboard-toolbar'
import { fitFreeArea, fitSelection } from '../../core/viewport-fit'
import { FIT_BOTTOM_INSET, FIT_SIDE_INSET, FIT_TOP_INSET } from '../corner-layout'
import { useDuplicateSelected } from './use-duplicate'
import { useCallback } from 'react'

export { DUPLICATE_OFFSET_MANY, DUPLICATE_OFFSET_ONE } from './use-duplicate'

export function useSelectionActions(ctx: CanvasCtx) {
  const {
    agentsBySpace,
    boxMapRef,
    effectiveSelectedIds,
    effectiveSelectedNodeIds,
    markZoomTween,
    nodesById,
    onBatchDeleteStickyNotes,
    onBatchUpdateStickyNotes,
    onDeleteArrow,
    onDeleteNode,
    onDeleteStickyNote,
    onUpdateStickyNote,
    rootRef,
    selectedArrowId,
    selectedGoalId,
    setEditingStickyId,
    setSelectedArrowId,
    setSelectedNodeIds,
    setSelectedStickyIds,
    setFitPartial,
    setView,
    stickies,
    stickiesById,
    tiles
  } = ctx
  const bringIdsToFront = useCallback(
    (ids: readonly string[]): void => {
      const unlocked = ids.filter((id) => !stickiesById.get(id)?.locked)
      if (unlocked.length === 0) {
        return
      }
      let maxZ = 0
      for (const s of stickies) {
        if ((s.zIndex ?? 0) > maxZ) {
          maxZ = s.zIndex ?? 0
        }
      }
      if (unlocked.length === 1) {
        onUpdateStickyNote?.(unlocked[0]!, { zIndex: Math.min(500, maxZ + 1) })
        return
      }
      const patches: Record<string, Partial<SpaceStickyNote>> = {}
      unlocked.forEach((id, idx) => {
        patches[id] = { zIndex: Math.min(500, maxZ + 1 + idx) }
      })
      onBatchUpdateStickyNotes?.(patches)
    },
    [onBatchUpdateStickyNotes, onUpdateStickyNote, stickies, stickiesById]
  )

  const sendIdsToBack = useCallback(
    (ids: readonly string[]): void => {
      const unlocked = ids.filter((id) => !stickiesById.get(id)?.locked)
      if (unlocked.length === 0) {
        return
      }
      let minZ = 0
      for (const s of stickies) {
        if ((s.zIndex ?? 0) < minZ) {
          minZ = s.zIndex ?? 0
        }
      }
      if (unlocked.length === 1) {
        onUpdateStickyNote?.(unlocked[0]!, { zIndex: Math.max(-50, minZ - 1) })
        return
      }
      const patches: Record<string, Partial<SpaceStickyNote>> = {}
      unlocked.forEach((id, idx) => {
        patches[id] = { zIndex: Math.max(-50, minZ - unlocked.length + idx) }
      })
      onBatchUpdateStickyNotes?.(patches)
    },
    [onBatchUpdateStickyNotes, onUpdateStickyNote, stickies, stickiesById]
  )

  const duplicateSelected = useDuplicateSelected(ctx)

  const deleteSelected = useCallback((): boolean => {
    if (selectedArrowId) {
      onDeleteArrow?.(selectedArrowId)
      setSelectedArrowId(null)
      return true
    }
    const unlockedNodes = effectiveSelectedNodeIds.filter((id) => !nodesById.get(id)?.locked)
    const unlocked = effectiveSelectedIds.filter((id) => !stickiesById.get(id)?.locked)
    if (unlocked.length === 0 && unlockedNodes.length === 0) {
      return false
    }
    for (const nodeId of unlockedNodes) {
      onDeleteNode?.(nodeId)
    }
    if (unlockedNodes.length > 0) {
      setSelectedNodeIds((cur) => cur.filter((id) => !unlockedNodes.includes(id)))
    }
    if (unlocked.length >= 2 && onBatchDeleteStickyNotes) {
      onBatchDeleteStickyNotes(unlocked)
    } else {
      for (const id of unlocked) {
        onDeleteStickyNote?.(id)
      }
    }
    if (unlocked.length > 0) {
      setSelectedStickyIds((cur) => cur.filter((id) => !unlocked.includes(id)))
      setEditingStickyId(null)
    }
    return true
  }, [
    effectiveSelectedIds,
    effectiveSelectedNodeIds,
    nodesById,
    onBatchDeleteStickyNotes,
    onDeleteArrow,
    onDeleteNode,
    onDeleteStickyNote,
    selectedArrowId,
    setEditingStickyId,
    setSelectedArrowId,
    setSelectedNodeIds,
    setSelectedStickyIds,
    stickiesById
  ])

  const handleMultiAlign = useCallback(
    (alignment: ToolbarMultiAlign): void => {
      const items = effectiveSelectedIds
        .filter((id) => !stickiesById.get(id)?.locked)
        .map((id) => {
          const b = boxMapRef.current.get(id)
          return b ? { id, x: b.x, y: b.y, w: b.w, h: b.h } : null
        })
        .filter((it): it is { id: string; x: number; y: number; w: number; h: number } =>
          Boolean(it)
        )
      if (items.length < 2) {
        return
      }
      const nextCoords = alignWhiteboardItems(items, alignment)
      onBatchUpdateStickyNotes?.(nextCoords)
    },
    [boxMapRef, effectiveSelectedIds, onBatchUpdateStickyNotes, stickiesById]
  )

  const handleMultiDistribute = useCallback(
    (axis: ToolbarMultiDistribute): void => {
      const items = effectiveSelectedIds
        .filter((id) => !stickiesById.get(id)?.locked)
        .map((id) => {
          const b = boxMapRef.current.get(id)
          return b ? { id, x: b.x, y: b.y, w: b.w, h: b.h } : null
        })
        .filter((it): it is { id: string; x: number; y: number; w: number; h: number } =>
          Boolean(it)
        )
      if (items.length < 3) {
        return
      }
      const nextCoords = distributeWhiteboardItems(items, axis)
      onBatchUpdateStickyNotes?.(nextCoords)
    },
    [boxMapRef, effectiveSelectedIds, onBatchUpdateStickyNotes, stickiesById]
  )

  const hasSelection =
    effectiveSelectedIds.length > 0 ||
    effectiveSelectedNodeIds.length > 0 ||
    Boolean(selectedGoalId)
  /** Boxes of what is selected: whiteboard items + canvas nodes, else the selected Space tile. */
  const selectionBoxes = useCallback((): BoxRect[] => {
    const selectedBoardIds = [...effectiveSelectedIds, ...effectiveSelectedNodeIds]
    const ids =
      selectedBoardIds.length > 0 ? selectedBoardIds : selectedGoalId ? [selectedGoalId] : []
    return ids.flatMap((id) => {
      const box = boxMapRef.current.get(id)
      return box ? [box] : []
    })
  }, [boxMapRef, effectiveSelectedIds, effectiveSelectedNodeIds, selectedGoalId])
  /** Zoom to selection (Shift+2): fit it with 40 px padding, zoom clamped. False = nothing selected. */
  const fitToSelection = useCallback((): boolean => {
    const el = rootRef.current
    const next = el ? fitSelection(selectionBoxes(), el.clientWidth, el.clientHeight) : null
    if (!next) {
      return false
    }
    markZoomTween()
    setView(next)
    return true
  }, [markZoomTween, rootRef, selectionBoxes, setView])
  /** Fit all Spaces in the free area, centred, never below a readable scale (U-37). */
  const fitAllSpaces = useCallback((): void => {
    const el = rootRef.current
    if (!el) {
      return
    }
    const next = fitFreeArea(
      tiles.map((t) => {
        const box = boxMapRef.current.get(t.key) ?? t
        return {
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          hasMembers: (agentsBySpace.get(t.key)?.length ?? 0) > 0
        }
      }),
      el.clientWidth,
      el.clientHeight,
      {
        top: FIT_TOP_INSET,
        bottom: FIT_BOTTOM_INSET,
        left: FIT_SIDE_INSET,
        right: FIT_SIDE_INSET
      }
    )
    markZoomTween()
    if (next) {
      setFitPartial(next.partial)
      setView({ x: next.x, y: next.y, scale: next.scale })
    } else {
      // Nothing to fit (empty board, canvas not laid out): reset the view as before.
      setFitPartial(false)
      setView(fitSpaces(tiles, el.clientWidth, el.clientHeight))
    }
  }, [agentsBySpace, boxMapRef, markZoomTween, rootRef, setFitPartial, setView, tiles])
  /** One zoom step around the viewport center (the − / + buttons and keys), with the zoom tween. */
  const zoomStep = useCallback(
    (direction: 'in' | 'out'): void => {
      const el = rootRef.current
      const center = el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 400, y: 260 }
      markZoomTween()
      setView((v) =>
        zoomAt(
          v,
          direction === 'in' ? v.scale * ZOOM_STEP_IN_FACTOR : v.scale / ZOOM_STEP_OUT_FACTOR,
          center
        )
      )
    },
    [markZoomTween, rootRef, setView]
  )
  /** Shift+0: 100 % around the viewport center, with the zoom tween. */
  const zoomTo100 = useCallback((): void => {
    const el = rootRef.current
    const center = el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 400, y: 260 }
    markZoomTween()
    setView((v) => zoomAt(v, 1, center))
  }, [markZoomTween, rootRef, setView])
  return {
    zoomStep,
    zoomTo100,
    bringIdsToFront,
    sendIdsToBack,
    duplicateSelected,
    deleteSelected,
    handleMultiAlign,
    handleMultiDistribute,
    hasSelection,
    selectionBoxes,
    fitToSelection,
    fitAllSpaces
  }
}

export type SelectionActions = ReturnType<typeof useSelectionActions>
