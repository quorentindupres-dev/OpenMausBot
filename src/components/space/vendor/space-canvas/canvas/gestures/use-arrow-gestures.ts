// WS-0 (TASK_16 wave 2): arrow draw, endpoint reconnect, bend handle and eraser swipe,
// moved verbatim from space-canvas.tsx. Owner: none.
import type { CanvasCtx } from '../canvas-ctx'
import { resolveArrowConnectionEffect } from '../../core/canvas-nodes'
import { type DragModifiers, NO_GUIDES, snapPointTo } from '../../core/whiteboard-snap-drag'
import {
  type Point,
  type SpaceArrow,
  computeSignedBendFromPoint,
  snapPointAngle15Deg
} from '../../core/space'
import type { SnapGuide } from '../../core/whiteboard-snap'
import { findBoxAtPoint } from '../canvas-ctx'

export function useArrowGestures(ctx: CanvasCtx) {
  const {
    activeArrowDash,
    activeArrowRouting,
    beginSnapGesture,
    boxMapRef,
    clientToCanvasPoint,
    endSnapGesture,
    host,
    nodesById,
    onAddArrow,
    onChangeToolMode,
    onDeleteArrow,
    onDeleteNode,
    onDeleteStickyNote,
    onNotify,
    onUpdateArrow,
    onUpdateNode,
    setArrowSnapTargetId,
    setBendingArrow,
    setDrawingArrow,
    setReconnectingArrow,
    setSelectedArrowId,
    setSelectedNodeIds,
    setSelectedStickyIds,
    showSnapGuides,
    snapIndexOf,
    stickiesById,
    toolMode,
    view
  } = ctx

  const applyMagneticArrowSemantics = (fromId?: string, toId?: string): void => {
    const effect = resolveArrowConnectionEffect(fromId, toId, nodesById)
    if (!effect) {
      return
    }
    if (effect.kind === 'bind-project') {
      onUpdateNode?.(effect.targetNodeId, { projectSlug: effect.projectSlug })
      host?.onBindProjectToNode?.(effect.targetNodeId, effect.projectSlug)
      onNotify?.(`Bound C02 project "${effect.projectSlug}" to ${effect.toNode.title}`)
    } else {
      host?.onConnectNodes?.(effect.fromId, effect.toId)
    }
  }
  const startArrowDrag = (
    event: React.PointerEvent,
    explicitFromId?: string,
    explicitFromPoint?: Point
  ): void => {
    if (event.button !== 0) {
      return
    }
    event.stopPropagation()
    const startPt = explicitFromPoint ?? clientToCanvasPoint(event.clientX, event.clientY)
    const detectedFromId = explicitFromId ?? findBoxAtPoint(startPt, boxMapRef.current)
    const fromBox = detectedFromId ? boxMapRef.current.get(detectedFromId) : undefined
    const angleOrigin = fromBox
      ? { x: fromBox.x + fromBox.w / 2, y: fromBox.y + fromBox.h / 2 }
      : startPt
    setDrawingArrow({
      ...(detectedFromId ? { fromId: detectedFromId } : {}),
      fromPoint: startPt,
      currentPoint: startPt
    })
    setArrowSnapTargetId(null)
    const snap = beginSnapGesture([])
    /** Free end: Shift = 15° angle snap; otherwise it snaps to box edges / centers (⌘ = off). */
    const freeEnd = (
      rawPt: Point,
      mods: DragModifiers
    ): Point & { guides: readonly SnapGuide[] } =>
      mods.shiftKey
        ? { ...snapPointAngle15Deg(angleOrigin, rawPt), guides: NO_GUIDES }
        : snapPointTo(rawPt, snapIndexOf(snap), view.scale, mods)

    const onMove = (move: PointerEvent): void => {
      const rawPt = clientToCanvasPoint(move.clientX, move.clientY)
      const snapId = findBoxAtPoint(rawPt, boxMapRef.current, detectedFromId)
      const free = snapId ? null : freeEnd(rawPt, move)
      const nextPt = free ? { x: free.x, y: free.y } : rawPt
      showSnapGuides(free?.guides ?? NO_GUIDES)
      setArrowSnapTargetId(snapId ?? null)
      setDrawingArrow((cur) => (cur ? { ...cur, toId: snapId, currentPoint: nextPt } : null))
    }
    const onUp = (up: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const rawEnd = clientToCanvasPoint(up.clientX, up.clientY)
      const toId = findBoxAtPoint(rawEnd, boxMapRef.current, detectedFromId)
      const free = toId ? null : freeEnd(rawEnd, up)
      const endPt = free ? { x: free.x, y: free.y } : rawEnd
      endSnapGesture(snap)
      setArrowSnapTargetId(null)
      const styleExtras: Partial<SpaceArrow> = {
        routing: activeArrowRouting,
        ...(activeArrowDash === 'dashed' ? { dash: 'dashed' as const } : {})
      }
      if (toId && toId !== detectedFromId) {
        onAddArrow?.({
          ...(detectedFromId ? { fromId: detectedFromId } : { fromPoint: startPt }),
          toId,
          ...styleExtras
        })
        applyMagneticArrowSemantics(detectedFromId, toId)
      } else if (Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) > 20) {
        onAddArrow?.({
          ...(detectedFromId ? { fromId: detectedFromId } : { fromPoint: startPt }),
          toPoint: endPt,
          ...styleExtras
        })
      }
      setDrawingArrow(null)
      if (toolMode === 'arrow' && !up.shiftKey) {
        onChangeToolMode?.('select')
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /** Click or swipe across unlocked whiteboard items and arrows in Eraser mode (`E`). */
  const startEraserSwipe = (event: React.PointerEvent): void => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const erasedIds = new Set<string>()
    const eraseAt = (clientX: number, clientY: number): void => {
      const stack = document.elementsFromPoint(clientX, clientY)
      for (const el of stack) {
        if (el.hasAttribute('data-space-dock')) {
          return
        }
        const stickyId = el.closest<HTMLElement>('[data-space-sticky]')?.dataset.spaceSticky
        if (stickyId && !erasedIds.has(stickyId)) {
          const item = stickiesById.get(stickyId)
          if (item && !item.locked) {
            erasedIds.add(stickyId)
            onDeleteStickyNote?.(stickyId)
            setSelectedStickyIds((cur) => cur.filter((id) => id !== stickyId))
          }
        }
        const nodeId = el.closest<HTMLElement>('[data-space-node]')?.dataset.spaceNode
        if (nodeId && !erasedIds.has(nodeId)) {
          const node = nodesById.get(nodeId)
          if (node && !node.locked) {
            erasedIds.add(nodeId)
            onDeleteNode?.(nodeId)
            setSelectedNodeIds((cur) => cur.filter((id) => id !== nodeId))
          }
        }
        const arrowId = el.closest<HTMLElement>('[data-space-arrow]')?.dataset.spaceArrow
        if (arrowId && !erasedIds.has(arrowId)) {
          erasedIds.add(arrowId)
          onDeleteArrow?.(arrowId)
          setSelectedArrowId((cur) => (cur === arrowId ? null : cur))
        }
      }
    }
    eraseAt(event.clientX, event.clientY)
    const onMove = (move: PointerEvent): void => {
      eraseAt(move.clientX, move.clientY)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /** Drag either endpoint ('from' or 'to') of an existing arrow to reconnect it to any Space, Note, Text, Shape, or point. */
  const startArrowEndpointDrag =
    (arrow: SpaceArrow, end: 'from' | 'to') =>
    (event: React.PointerEvent): void => {
      if (event.button !== 0) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setSelectedArrowId(arrow.id)
      const startPt = clientToCanvasPoint(event.clientX, event.clientY)
      const otherEndId = end === 'from' ? arrow.toId : arrow.fromId
      const otherBox = otherEndId ? boxMapRef.current.get(otherEndId) : undefined
      const angleOrigin = otherBox
        ? { x: otherBox.x + otherBox.w / 2, y: otherBox.y + otherBox.h / 2 }
        : ((end === 'from' ? arrow.toPoint : arrow.fromPoint) ?? startPt)
      setReconnectingArrow({ arrowId: arrow.id, end, point: startPt })
      const snap = beginSnapGesture([])
      const freeEnd = (
        rawPt: Point,
        mods: DragModifiers
      ): Point & { guides: readonly SnapGuide[] } =>
        mods.shiftKey
          ? { ...snapPointAngle15Deg(angleOrigin, rawPt), guides: NO_GUIDES }
          : snapPointTo(rawPt, snapIndexOf(snap), view.scale, mods)

      const onMove = (move: PointerEvent): void => {
        const rawPt = clientToCanvasPoint(move.clientX, move.clientY)
        const snapId = findBoxAtPoint(rawPt, boxMapRef.current, otherEndId)
        const free = snapId ? null : freeEnd(rawPt, move)
        const nextPt = free ? { x: free.x, y: free.y } : rawPt
        showSnapGuides(free?.guides ?? NO_GUIDES)
        setArrowSnapTargetId(snapId ?? null)
        setReconnectingArrow({
          arrowId: arrow.id,
          end,
          point: nextPt,
          ...(snapId ? { snapId } : {})
        })
      }

      const onUp = (up: PointerEvent): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const rawEnd = clientToCanvasPoint(up.clientX, up.clientY)
        const snapId = findBoxAtPoint(rawEnd, boxMapRef.current, otherEndId)
        const free = snapId ? null : freeEnd(rawEnd, up)
        const endPt = free ? { x: free.x, y: free.y } : rawEnd
        endSnapGesture(snap)
        setArrowSnapTargetId(null)
        setReconnectingArrow(null)
        if (end === 'from') {
          onUpdateArrow?.(
            arrow.id,
            snapId
              ? { fromId: snapId, fromPoint: undefined }
              : {
                  fromId: undefined,
                  fromPoint: { x: Math.round(endPt.x), y: Math.round(endPt.y) }
                }
          )
          if (snapId && arrow.toId) {
            applyMagneticArrowSemantics(snapId, arrow.toId)
          }
        } else {
          onUpdateArrow?.(
            arrow.id,
            snapId
              ? { toId: snapId, toPoint: undefined }
              : {
                  toId: undefined,
                  toPoint: { x: Math.round(endPt.x), y: Math.round(endPt.y) }
                }
          )
          if (arrow.fromId && snapId) {
            applyMagneticArrowSemantics(arrow.fromId, snapId)
          }
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

  /** Quickdraw midpoint bend handle: drag perpendicular to chord to bend any arrow smoothly. */
  const startArrowBendDrag =
    (arrow: SpaceArrow, start: Point, end: Point) =>
    (event: React.PointerEvent): void => {
      if (event.button !== 0) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setSelectedArrowId(arrow.id)
      let latestBend = arrow.bend ?? 0
      setBendingArrow({ arrowId: arrow.id, bend: latestBend })

      const onMove = (move: PointerEvent): void => {
        const pt = clientToCanvasPoint(move.clientX, move.clientY)
        latestBend = computeSignedBendFromPoint(start, end, pt, 8 / Math.max(0.25, view.scale))
        setBendingArrow({ arrowId: arrow.id, bend: latestBend })
      }

      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setBendingArrow(null)
        onUpdateArrow?.(arrow.id, { bend: latestBend === 0 ? undefined : latestBend })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
  return {
    startArrowDrag,
    startEraserSwipe,
    startArrowEndpointDrag,
    startArrowBendDrag
  }
}

export type ArrowGestures = ReturnType<typeof useArrowGestures>
