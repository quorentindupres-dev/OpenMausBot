// WS-0 (TASK_16 wave 2): note / shape / text drag (single, group, Alt-copy), resize / scale, and the
// textarea commit-on-blur, moved verbatim from space-canvas.tsx. Owner: WS-C.
// WS-C groups (idea from Penpot's data/workspace/selection.cljs, re-implemented): a click on a group
// member selects and drags the whole group; ⌘/Ctrl-click or a double-click selects only that member.
import type { CanvasCtx } from '../canvas-ctx'
import type { ArrowGestures } from './use-arrow-gestures'
import {
  NO_GUIDES,
  snapMoveDelta,
  snapResizeDelta,
  unionRect
} from '../../core/whiteboard-snap-drag'
import { type SpaceStickyNote, computeAutoTextDimensions } from '../../core/space'
import { groupSelectionFor, remapCopiedGroups } from '../../core/whiteboard-groups'

export function useStickyGestures(ctx: CanvasCtx, arrowGestures: ArrowGestures) {
  const {
    beginSnapGesture,
    boxMapRef,
    editingStickyId,
    effectiveSelectedIds,
    endSnapGesture,
    onBatchDuplicateStickyNotes,
    onBatchUpdateStickyNotes,
    onDeleteStickyNote,
    onDuplicateStickyNote,
    onUpdateStickyNote,
    selectedStickyIdSet,
    setEditingStickyId,
    setSelectedArrowId,
    setSelectedStickyIds,
    setStickyOffset,
    setStickySizeOverride,
    showSnapGuides,
    singleSelectedStickyId,
    snapIndexOf,
    spaceHeldRef,
    stickies,
    stickiesById,
    toolMode,
    view
  } = ctx
  const { startArrowDrag, startEraserSwipe } = arrowGestures
  const commitStickyEdit = (sticky: SpaceStickyNote): void => {
    setEditingStickyId((cur) => (cur === sticky.id ? null : cur))
    // Empty shapes, sticky notes, and backed text cards stay intact; only transparent headings evaporate if left blank
    const hasBg = Boolean(sticky.fillStyle && sticky.fillStyle !== 'none')
    if (sticky.kind === 'text' && !hasBg && !sticky.text.trim()) {
      onDeleteStickyNote?.(sticky.id)
      setSelectedStickyIds((cur) => cur.filter((id) => id !== sticky.id))
    }
  }

  const handleStickyTextareaBlur = (
    sticky: SpaceStickyNote,
    event: React.FocusEvent<HTMLTextAreaElement>
  ): void => {
    const next = event.relatedTarget as HTMLElement | null
    if (
      next &&
      next.closest('[data-whiteboard-inspector], [data-space-dock], [data-whiteboard-multiselect]')
    ) {
      event.currentTarget.focus()
      return
    }
    commitStickyEdit(sticky)
  }

  /** Drag anywhere on a Shape, Sticky Note, or Canvas Text block to move single or multi-selected items. */
  const startStickyDrag =
    (sticky: SpaceStickyNote) =>
    (event: React.PointerEvent): void => {
      if (event.button !== 0 || spaceHeldRef.current) {
        return
      }
      const target = event.target as HTMLElement
      if (target.closest('button, input, [data-sticky-resize], [data-quick-port]')) {
        return
      }
      if (editingStickyId === sticky.id && target.closest('textarea')) {
        return
      }
      if (toolMode === 'eraser') {
        startEraserSwipe(event)
        return
      }
      if (toolMode === 'arrow') {
        startArrowDrag(event, sticky.id)
        return
      }
      event.stopPropagation()
      setSelectedArrowId(null)

      if (sticky.locked) {
        setSelectedStickyIds([sticky.id])
        setEditingStickyId(null)
        return
      }

      const deepSelect = event.metaKey || event.ctrlKey
      if (event.shiftKey && !event.altKey) {
        setEditingStickyId(null)
        // WS-C: Shift toggles the whole group (just [sticky.id] when it has none, or with ⌘/Ctrl).
        const toggled = new Set(deepSelect ? [sticky.id] : groupSelectionFor(stickies, sticky.id))
        if (selectedStickyIdSet.has(sticky.id)) {
          setSelectedStickyIds(effectiveSelectedIds.filter((id) => !toggled.has(id)))
        } else {
          setSelectedStickyIds([
            ...effectiveSelectedIds,
            ...[...toggled].filter((id) => !selectedStickyIdSet.has(id))
          ])
        }
        return
      }

      // Group Multi-Drag when dragging an item inside an active multi-selection
      if (selectedStickyIdSet.has(sticky.id) && effectiveSelectedIds.length >= 2) {
        startMultiDrag(event, effectiveSelectedIds)
        return
      }

      // WS-C: a member of a group (2+ visible members) picks up the whole group, unless ⌘/Ctrl is held.
      const groupMembers = deepSelect ? [sticky.id] : groupSelectionFor(stickies, sticky.id)
      if (groupMembers.length >= 2) {
        setSelectedStickyIds(groupMembers)
        startMultiDrag(event, groupMembers)
        return
      }

      startSingleDrag(event, sticky)
    }

  /** Moves every unlocked id in `selection` as one box (Alt = copy first). One batch write on release. */
  const startMultiDrag = (event: React.PointerEvent, selection: readonly string[]): void => {
    setEditingStickyId(null)
    const sourceIds = selection.filter((id) => !stickiesById.get(id)?.locked)
    if (sourceIds.length === 0) {
      return
    }
    const sourcePositions = sourceIds.map((id) => {
      const item = stickiesById.get(id)
      return { x: item?.x ?? 0, y: item?.y ?? 0 }
    })
    let movingIds = sourceIds
    // WS-C: an Alt copy of a group is a NEW group (the board's copy keeps the source groupId).
    let copyGroupIds: (string | undefined)[] = []
    if (event.altKey && onBatchDuplicateStickyNotes && sourceIds.length >= 2) {
      const clonedIds = onBatchDuplicateStickyNotes(sourceIds, { x: 0, y: 0 })
      if (Array.isArray(clonedIds) && clonedIds.length === sourceIds.length) {
        movingIds = clonedIds
        setSelectedStickyIds(clonedIds)
        copyGroupIds = remapCopiedGroups(
          sourceIds.map((id) => ({ groupId: stickiesById.get(id)?.groupId }))
        ).map((c) => c.groupId)
      }
    }
    const origin = { x: event.clientX, y: event.clientY }
    // The selection moves as one box (an Alt copy starts exactly on the originals).
    const groupBox = unionRect(
      sourceIds.flatMap((id) => {
        const b = boxMapRef.current.get(id)
        return b ? [b] : []
      })
    )
    // Alt-copy: the originals stay put and are fair targets (the copy can line up with them).
    const snap = beginSnapGesture(movingIds === sourceIds ? sourceIds : movingIds)
    let delta = { x: 0, y: 0 }
    let guides = NO_GUIDES
    let rafId = 0
    const onMove = (move: PointerEvent): void => {
      const rawDx = (move.clientX - origin.x) / view.scale
      const rawDy = (move.clientY - origin.y) / view.scale
      const snapped = groupBox
        ? snapMoveDelta(groupBox, rawDx, rawDy, snapIndexOf(snap), view.scale, move)
        : snapMoveDelta({ x: 0, y: 0, w: 0, h: 0 }, rawDx, rawDy, null, view.scale, move)
      delta = { x: snapped.dx, y: snapped.dy }
      guides = snapped.guides
      if (rafId !== 0) {
        return
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        showSnapGuides(snapIndexOf(snap) ? guides : NO_GUIDES)
        setStickyOffset((current) => {
          const next = { ...current }
          for (const id of movingIds) {
            next[id] = delta
          }
          return next
        })
      })
    }
    const onUp = (): void => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId)
        rafId = 0
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      endSnapGesture(snap)
      setStickyOffset((current) => {
        const next = { ...current }
        for (const id of movingIds) {
          delete next[id]
        }
        return next
      })
      const moved = Math.hypot(delta.x, delta.y) > 3
      const regroup = copyGroupIds.some(Boolean)
      if (moved || regroup) {
        const patches: Record<string, Partial<SpaceStickyNote>> = {}
        movingIds.forEach((id, idx) => {
          const base = sourcePositions[idx]
          if (!base) {
            return
          }
          patches[id] = {
            ...(moved ? { x: Math.round(base.x + delta.x), y: Math.round(base.y + delta.y) } : {}),
            ...(copyGroupIds[idx] ? { groupId: copyGroupIds[idx] } : {})
          }
        })
        onBatchUpdateStickyNotes?.(patches)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /** Moves one sticky (Alt = copy first); a click with no move on the selected sticky starts editing. */
  const startSingleDrag = (event: React.PointerEvent, sticky: SpaceStickyNote): void => {
    const wasAlreadySingleSelected =
      singleSelectedStickyId === sticky.id && editingStickyId !== sticky.id
    let activeId = sticky.id
    const baseX = sticky.x
    const baseY = sticky.y
    let cloned = false

    if (event.altKey && onDuplicateStickyNote) {
      const clonedId = onDuplicateStickyNote(sticky.id, { x: 0, y: 0 })
      if (typeof clonedId === 'string') {
        activeId = clonedId
        cloned = true
      }
    }

    setSelectedStickyIds([activeId])
    const origin = { x: event.clientX, y: event.clientY }
    const liveBox = boxMapRef.current.get(sticky.id)
    const startBox = { x: baseX, y: baseY, w: liveBox?.w ?? 0, h: liveBox?.h ?? 0 }
    // Alt-copy: the original stays put and is a fair target; only the moving copy is left out.
    const snap = beginSnapGesture(cloned ? [activeId] : [sticky.id])
    let delta = { x: 0, y: 0 }
    let guides = NO_GUIDES
    let rafId = 0
    const onMove = (move: PointerEvent): void => {
      const rawDx = (move.clientX - origin.x) / view.scale
      const rawDy = (move.clientY - origin.y) / view.scale
      const snapped = snapMoveDelta(startBox, rawDx, rawDy, snapIndexOf(snap), view.scale, move)
      delta = { x: snapped.dx, y: snapped.dy }
      guides = snapped.guides
      if (rafId !== 0) {
        return
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        showSnapGuides(snapIndexOf(snap) ? guides : NO_GUIDES)
        setStickyOffset((current) => ({ ...current, [activeId]: delta }))
      })
    }
    const onUp = (): void => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId)
        rafId = 0
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      endSnapGesture(snap)
      setStickyOffset((current) => {
        const next = { ...current }
        delete next[activeId]
        return next
      })
      if (Math.hypot(delta.x, delta.y) > 3) {
        onUpdateStickyNote?.(activeId, {
          x: Math.round(baseX + delta.x),
          y: Math.round(baseY + delta.y)
        })
      } else if (!cloned && wasAlreadySingleSelected) {
        setEditingStickyId(activeId)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /** Smooth multi-mode resize/scale handle for Shapes, Sticky Notes, and Canvas Text. */
  const startStickyResize =
    (sticky: SpaceStickyNote, mode: 'scale' | 'width' | 'se' | 'e' | 's' = 'se') =>
    (event: React.PointerEvent): void => {
      if (event.button !== 0 || sticky.locked) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setSelectedStickyIds([sticky.id])
      const kind = sticky.kind ?? 'note'
      const isText = kind === 'text'
      const isShape = kind === 'shape'
      const hasBg = Boolean(sticky.fillStyle && sticky.fillStyle !== 'none')
      const manualWidthResize = isText && (mode === 'width' || mode === 'e')
      const origin = { x: event.clientX, y: event.clientY }
      const liveBox = boxMapRef.current.get(sticky.id)
      const startW = liveBox?.w ?? (sticky.w || (isText ? 240 : isShape ? 196 : 220))
      const startH = liveBox?.h ?? (sticky.h || (isText ? 76 : isShape ? 96 : 140))
      const startFont = sticky.fontSize ?? (isText ? (hasBg ? 18 : 36) : isShape ? 16 : 14)
      let latestW = startW
      let latestH = startH
      let latestFont = startFont
      let rafId = 0
      let guides = NO_GUIDES
      // Which edge snaps: a manual text width = the right edge; note / shape grips = their own edges.
      // Text font scaling has no edge to snap.
      const snapKind: 'se' | 'e' | 's' | null = manualWidthResize
        ? 'e'
        : !isText && (mode === 'se' || mode === 'e' || mode === 's')
          ? mode
          : null
      const startX = liveBox?.x ?? sticky.x
      const startY = liveBox?.y ?? sticky.y
      const snap = beginSnapGesture([sticky.id])
      // The one size rule (clamp + round) for both the snap check and the live size.
      const [minW, maxW] = isText ? [90, 1400] : isShape ? [64, 1600] : [150, 1100]
      const [minH, maxH] = isShape ? [44, 1600] : [96, 950]
      const sizeW = (d: number): number => Math.max(minW, Math.min(maxW, Math.round(startW + d)))
      const sizeH = (d: number): number => Math.max(minH, Math.min(maxH, Math.round(startH + d)))

      const onMove = (move: PointerEvent): void => {
        let dx = (move.clientX - origin.x) / view.scale
        let dy = (move.clientY - origin.y) / view.scale
        // Shift on a shape's corner keeps its aspect: no edge snap then.
        if (snapKind && !(isShape && move.shiftKey && mode === 'se')) {
          const snapped = snapResizeDelta(
            dx,
            dy,
            snapKind,
            (ddx, ddy) => ({
              x: startX,
              y: startY,
              w: sizeW(ddx),
              h: isText ? startH : sizeH(ddy)
            }),
            snapIndexOf(snap),
            view.scale,
            move
          )
          dx = snapped.dx
          dy = snapped.dy
          guides = snapped.guides
        } else {
          guides = NO_GUIDES
        }
        if (isText) {
          if (manualWidthResize) {
            latestW = sizeW(dx)
            latestH = computeAutoTextDimensions(
              sticky.text,
              startFont,
              latestW,
              false,
              920,
              hasBg
            ).h
          } else {
            const deltaScale = (dx + dy * 0.85) * 0.38
            latestFont = Math.max(12, Math.min(180, Math.round(startFont + deltaScale)))
            const ratio = latestFont / Math.max(12, startFont)
            if (sticky.autosize !== false) {
              const autoDims = computeAutoTextDimensions(
                sticky.text,
                latestFont,
                startW,
                true,
                920,
                hasBg
              )
              latestW = autoDims.w
              latestH = autoDims.h
            } else {
              latestW = Math.max(90, Math.min(1400, Math.round(startW * ratio)))
              latestH = computeAutoTextDimensions(
                sticky.text,
                latestFont,
                latestW,
                false,
                920,
                hasBg
              ).h
            }
          }
        } else if (isShape) {
          if (move.shiftKey && mode === 'se') {
            const aspect = startH / Math.max(1, startW)
            latestW = sizeW(dx)
            latestH = Math.max(44, Math.min(1600, Math.round(latestW * aspect)))
          } else {
            if (mode === 'se' || mode === 'e') {
              latestW = sizeW(dx)
            }
            if (mode === 'se' || mode === 's') {
              latestH = sizeH(dy)
            }
          }
        } else {
          if (mode === 'se' || mode === 'e') {
            latestW = sizeW(dx)
          }
          if (mode === 'se' || mode === 's') {
            latestH = sizeH(dy)
          }
        }
        if (rafId !== 0) {
          return
        }
        rafId = window.requestAnimationFrame(() => {
          rafId = 0
          showSnapGuides(snapIndexOf(snap) ? guides : NO_GUIDES)
          setStickySizeOverride((current) => ({
            ...current,
            [sticky.id]: {
              w: latestW,
              h: latestH,
              ...(isText ? { fontSize: latestFont } : {})
            }
          }))
        })
      }

      const onUp = (): void => {
        if (rafId !== 0) {
          window.cancelAnimationFrame(rafId)
          rafId = 0
        }
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        endSnapGesture(snap)
        setStickySizeOverride((current) => {
          const next = { ...current }
          delete next[sticky.id]
          return next
        })
        onUpdateStickyNote?.(sticky.id, {
          w: latestW,
          h: latestH,
          ...(isText ? { fontSize: latestFont } : {}),
          ...(manualWidthResize ? { autosize: false } : {})
        })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
  /** Double-click: on a selected group, enter it (select only this member); otherwise edit as before. */
  const onStickyDoubleClick =
    (sticky: SpaceStickyNote) =>
    (event: React.MouseEvent): void => {
      event.stopPropagation()
      const entersGroup =
        effectiveSelectedIds.length >= 2 &&
        selectedStickyIdSet.has(sticky.id) &&
        groupSelectionFor(stickies, sticky.id).length >= 2
      setSelectedStickyIds([sticky.id])
      if (!sticky.locked && !entersGroup) {
        setEditingStickyId(sticky.id)
      }
    }

  return {
    commitStickyEdit,
    handleStickyTextareaBlur,
    onStickyDoubleClick,
    startStickyDrag,
    startStickyResize
  }
}

export type StickyGestures = ReturnType<typeof useStickyGestures>
