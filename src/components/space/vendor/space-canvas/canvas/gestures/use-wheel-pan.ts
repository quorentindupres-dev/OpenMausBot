// WS-0 (TASK_16 wave 2): wheel pan/zoom effect + empty-canvas pointer gestures (pan, marquee, tool draws),
// moved verbatim from space-canvas.tsx. Owner: WS-A (since WS-C: a marquee selects whole groups).
import { useEffect } from 'react'
import type { CanvasState } from '../use-canvas-state'
import type { CanvasCtx } from '../canvas-ctx'
import type { ArrowGestures } from './use-arrow-gestures'
import { ZOOM_WHEEL_SENSITIVITY_IN, ZOOM_WHEEL_SENSITIVITY_OUT, zoomAt } from '../../core/space'
import { createWheelBatcher, decideWheel, normalizeWheel } from '../../core/space-viewport'
import { PAN_SPEED_MULTIPLIER } from '../canvas-ctx'
import { type StickyColor, normalizeMarqueeRect, rectIntersectsBox } from '../../core/space'
import { snapPointTo } from '../../core/whiteboard-snap-drag'
import { expandToGroups } from '../../core/whiteboard-groups'

export function useWheelPan({ rootRef, markZoomTween, setView }: CanvasState): void {
  useEffect(() => {
    const element = rootRef.current
    if (!element) {
      return
    }
    // Penpot-style: only a wheel on the canvas surface pans/zooms; panels keep theirs.
    // Deltas are summed and applied once per animation frame.
    const batcher = createWheelBatcher(({ dx, dy, factor, focal }) => {
      if (factor !== 1) {
        markZoomTween()
      }
      setView((current) => {
        const panned = {
          ...current,
          x: current.x - dx * PAN_SPEED_MULTIPLIER,
          y: current.y - dy * PAN_SPEED_MULTIPLIER
        }
        return factor !== 1 && focal ? zoomAt(panned, panned.scale * factor, focal) : panned
      })
    })
    const onWheel = (event: WheelEvent): void => {
      const decision = decideWheel(event, { root: element })
      if (decision === 'ignore') {
        return
      }
      event.preventDefault()
      if (decision === 'block') {
        return
      }
      const { dx, dy } = normalizeWheel(event)
      if (decision === 'zoom') {
        // Pinch / ctrl+wheel: 1.5x faster sensitivity in both directions.
        const sensitivity = dy > 0 ? ZOOM_WHEEL_SENSITIVITY_OUT : ZOOM_WHEEL_SENSITIVITY_IN
        const rect = element.getBoundingClientRect()
        batcher.zoom(Math.exp(-dy * sensitivity), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        })
      } else {
        // +25% faster pan/move speed across the Space canvas
        batcher.pan(dx, dy)
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', onWheel)
      batcher.dispose()
    }
  }, [markZoomTween, rootRef, setView])
}

/** Pointer down on the canvas surface: pan, marquee, eraser, and the shape / frame / text / arrow tools. */
export function useStartPan(ctx: CanvasCtx, arrowGestures: ArrowGestures) {
  const {
    activeFillStyle,
    activeShapeColor,
    activeShapeType,
    beginSnapGesture,
    boxMapRef,
    clientToCanvasPoint,
    dockSpaceLevel,
    effectiveSelectedIds,
    effectiveSelectedNodeIds,
    emojiPickerGoalId,
    endSnapGesture,
    levelPickerGoalId,
    nodes,
    onAddStickyNote,
    onChangeToolMode,
    onCreateSpaceAt,
    setDrawingFrameRect,
    setDrawingShapeRect,
    setEditingStickyId,
    setEmojiPickerGoalId,
    setLevelPickerGoalId,
    setMarqueeRect,
    setPanning,
    setSelectedArrowId,
    setSelectedNodeIds,
    setSelectedStickyIds,
    setView,
    showSnapGuides,
    snapIndexOf,
    spaceHeldRef,
    stickies,
    toolMode,
    view
  } = ctx
  const { startArrowDrag, startEraserSwipe } = arrowGestures
  const startPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return
    }
    const target = event.target as HTMLElement
    if (emojiPickerGoalId && !target.closest('[data-emoji-picker]')) {
      setEmojiPickerGoalId(null)
    }
    if (levelPickerGoalId && !target.closest('[data-level-picker]')) {
      setLevelPickerGoalId(null)
    }
    if (
      target.closest(
        '[data-space-dock], [data-space-drawer], [data-whiteboard-inspector], [data-whiteboard-multiselect], [data-whiteboard-history]'
      )
    ) {
      return
    }
    if (!spaceHeldRef.current && toolMode === 'eraser') {
      if (
        !target.closest(
          'button, input, textarea, [data-space-card], [data-quick-port], [data-node-port]'
        )
      ) {
        startEraserSwipe(event)
        return
      }
    }
    if (!target.closest('[data-space-sticky]')) {
      if (!event.shiftKey) {
        setSelectedStickyIds([])
      }
      setEditingStickyId(null)
    }
    if (!target.closest('[data-space-node]')) {
      if (!event.shiftKey) {
        setSelectedNodeIds([])
      }
    }
    const onEmptyCanvas = !target.closest(
      '[data-space-tile], [data-space-card], [data-space-sticky], [data-space-node], [data-space-arrow], button, input, textarea'
    )
    if (!spaceHeldRef.current && onEmptyCanvas && toolMode === 'shape') {
      setSelectedArrowId(null)
      setSelectedStickyIds([])
      const startPt = clientToCanvasPoint(event.clientX, event.clientY)
      const originClient = { x: event.clientX, y: event.clientY }
      const shapeType = activeShapeType
      const color = activeShapeColor
      const fillStyle = activeFillStyle
      setDrawingShapeRect({ start: startPt, current: startPt, shapeType, color, fillStyle })
      const snap = beginSnapGesture([])
      const onMove = (move: PointerEvent): void => {
        const raw = clientToCanvasPoint(move.clientX, move.clientY)
        const hit = snapPointTo(raw, snapIndexOf(snap), view.scale, move)
        const curPt = { x: hit.x, y: hit.y }
        showSnapGuides(hit.guides)
        setDrawingShapeRect((cur) => (cur ? { ...cur, current: curPt } : null))
      }
      const onUp = (up: PointerEvent): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setDrawingShapeRect(null)
        const endHit = snapPointTo(
          clientToCanvasPoint(up.clientX, up.clientY),
          snapIndexOf(snap),
          view.scale,
          up
        )
        endSnapGesture(snap)
        const dragDist = Math.hypot(up.clientX - originClient.x, up.clientY - originClient.y)
        const isSym = shapeType === 'ellipse' || shapeType === 'diamond'
        let x: number
        let y: number
        let w: number
        let h: number
        if (dragDist < 12) {
          w = isSym ? 150 : 196
          h = isSym ? 150 : 96
          x = Math.round(startPt.x - w / 2)
          y = Math.round(startPt.y - h / 2)
        } else {
          const rect = normalizeMarqueeRect(startPt, { x: endHit.x, y: endHit.y })
          w = Math.max(80, Math.round(rect.w))
          h = Math.max(52, Math.round(rect.h))
          x = Math.round(rect.x)
          y = Math.round(rect.y)
        }
        const createdId = onAddStickyNote?.({ x, y }, color, 'shape', '', {
          w,
          h,
          shapeType,
          fillStyle,
          borderStyle: 'solid',
          textAlign: 'center',
          fontSize: 16
        })
        if (typeof createdId === 'string') {
          setSelectedStickyIds([createdId])
          setEditingStickyId(createdId)
        }
        if (!up.shiftKey) {
          onChangeToolMode?.('select')
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }
    if (!spaceHeldRef.current && onEmptyCanvas && toolMode === 'frame') {
      setSelectedArrowId(null)
      setSelectedStickyIds([])
      const startPt = clientToCanvasPoint(event.clientX, event.clientY)
      const originClient = { x: event.clientX, y: event.clientY }
      const level = dockSpaceLevel
      setDrawingFrameRect({ start: startPt, current: startPt, level })
      const snap = beginSnapGesture([])
      const onMove = (move: PointerEvent): void => {
        const raw = clientToCanvasPoint(move.clientX, move.clientY)
        const hit = snapPointTo(raw, snapIndexOf(snap), view.scale, move)
        const curPt = { x: hit.x, y: hit.y }
        showSnapGuides(hit.guides)
        setDrawingFrameRect((cur) => (cur ? { ...cur, current: curPt } : null))
      }
      const onUp = (up: PointerEvent): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setDrawingFrameRect(null)
        const endHit = snapPointTo(
          clientToCanvasPoint(up.clientX, up.clientY),
          snapIndexOf(snap),
          view.scale,
          up
        )
        endSnapGesture(snap)
        const dragDist = Math.hypot(up.clientX - originClient.x, up.clientY - originClient.y)
        if (dragDist < 12) {
          onCreateSpaceAt?.(level, {
            x: Math.round(startPt.x - 170),
            y: Math.round(startPt.y - 110),
            w: 340,
            h: 220
          })
        } else {
          const rect = normalizeMarqueeRect(startPt, { x: endHit.x, y: endHit.y })
          onCreateSpaceAt?.(level, {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.max(320, Math.round(rect.w)),
            h: Math.max(200, Math.round(rect.h))
          })
        }
        if (!up.shiftKey) {
          onChangeToolMode?.('select')
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }
    if (!spaceHeldRef.current && onEmptyCanvas && toolMode === 'text') {
      const pt = clientToCanvasPoint(event.clientX, event.clientY)
      const hasBg = activeFillStyle !== 'none'
      const color: StickyColor =
        activeFillStyle === 'paper' || activeFillStyle === 'paper-light'
          ? 'paper'
          : hasBg
            ? activeShapeColor
            : 'zinc'
      const fontSize = hasBg ? 18 : 36
      const createdId = onAddStickyNote?.(
        { x: Math.round(pt.x - (hasBg ? 64 : 16)), y: Math.round(pt.y - 24) },
        color,
        'text',
        '',
        {
          fillStyle: activeFillStyle,
          borderStyle: hasBg ? 'solid' : 'none',
          fontSize,
          fontWeight: hasBg ? 'semibold' : 'bold',
          textAlign: 'left',
          autosize: true
        }
      )
      if (typeof createdId === 'string') {
        setSelectedStickyIds([createdId])
        setEditingStickyId(createdId)
      }
      onChangeToolMode?.('select')
      return
    }
    if (!spaceHeldRef.current && toolMode === 'arrow') {
      if (
        !target.closest(
          'button, input, textarea, [data-space-card], [data-quick-port], [data-node-port]'
        )
      ) {
        const fromTile = target.closest<HTMLElement>('[data-space-tile]')?.dataset.spaceTile
        const fromSticky = target.closest<HTMLElement>('[data-space-sticky]')?.dataset.spaceSticky
        const fromNode = target.closest<HTMLElement>('[data-space-node]')?.dataset.spaceNode
        startArrowDrag(event, fromNode || fromSticky || fromTile)
        return
      }
    }
    if (
      !spaceHeldRef.current &&
      onEmptyCanvas &&
      (toolMode === 'marquee' || (toolMode === 'select' && event.shiftKey))
    ) {
      setSelectedArrowId(null)
      setEditingStickyId(null)
      const startPt = clientToCanvasPoint(event.clientX, event.clientY)
      const baseSet = event.shiftKey ? new Set(effectiveSelectedIds) : new Set<string>()
      const baseNodeSet = event.shiftKey ? new Set(effectiveSelectedNodeIds) : new Set<string>()
      setMarqueeRect({ start: startPt, current: startPt })
      const onMove = (move: PointerEvent): void => {
        const curPt = clientToCanvasPoint(move.clientX, move.clientY)
        setMarqueeRect({ start: startPt, current: curPt })
        const mRect = normalizeMarqueeRect(startPt, curPt)
        const nextIds = new Set<string>(baseSet)
        for (const s of stickies) {
          if (s.locked) {
            continue
          }
          const b = boxMapRef.current.get(s.id)
          if (b && rectIntersectsBox(mRect, b)) {
            nextIds.add(s.id)
          }
        }
        const nextNodeIds = new Set<string>(baseNodeSet)
        for (const n of nodes) {
          if (n.locked || n.hidden) {
            continue
          }
          const b = boxMapRef.current.get(n.id)
          if (b && rectIntersectsBox(mRect, b)) {
            nextNodeIds.add(n.id)
          }
        }
        // A marquee touching one member selects its whole (visible) group, like a click.
        setSelectedStickyIds(expandToGroups(stickies, Array.from(nextIds)))
        setSelectedNodeIds(Array.from(nextNodeIds))
      }
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setMarqueeRect(null)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }
    if (!spaceHeldRef.current && !onEmptyCanvas) {
      return
    }
    setSelectedArrowId(null)
    const originClient = { x: event.clientX, y: event.clientY }
    const originView = { x: view.x, y: view.y }
    let rafId = 0
    let latestX = event.clientX
    let latestY = event.clientY
    setPanning(true)
    const onMove = (move: PointerEvent): void => {
      latestX = move.clientX
      latestY = move.clientY
      if (rafId !== 0) {
        return
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        setView((c) => ({
          ...c,
          x: originView.x + (latestX - originClient.x) * PAN_SPEED_MULTIPLIER,
          y: originView.y + (latestY - originClient.y) * PAN_SPEED_MULTIPLIER
        }))
      })
    }
    const onUp = (): void => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId)
        rafId = 0
      }
      setPanning(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  return {
    startPan
  }
}
