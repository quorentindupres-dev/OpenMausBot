import { useCallback } from 'react'
import { clampCanvasNodeBox } from '../../core/canvas-nodes'
import { getCardinalPortPoints, type CardinalSide } from '../../core/whiteboard-kit'
import type { SnapKind } from '../../core/whiteboard-snap'
import {
  NO_GUIDES,
  snapMoveDelta,
  snapResizeDelta,
  unionRect
} from '../../core/whiteboard-snap-drag'
import {
  PENPOT_DRAG_THRESHOLD,
  passedDragThreshold,
  passedResizeThreshold
} from '../../penpot-mpl/drag-threshold'
import { resizeRect, type Handler } from '../../penpot-mpl/resize-handles'
import type { CanvasCtx } from '../canvas-ctx'
import type { ArrowGestures } from './use-arrow-gestures'

function handlerToSnapKind(handler: Handler): Exclude<SnapKind, 'move'> {
  switch (handler) {
    case 'top':
      return 'n'
    case 'bottom':
      return 's'
    case 'left':
      return 'w'
    case 'right':
      return 'e'
    case 'top-left':
      return 'nw'
    case 'top-right':
      return 'ne'
    case 'bottom-left':
      return 'sw'
    case 'bottom-right':
      return 'se'
  }
}

export function useNodeGestures(ctx: CanvasCtx, arrowGestures: ArrowGestures) {
  const {
    beginSnapGesture,
    boxMapRef,
    clientToCanvasPoint,
    effectiveSelectedNodeIds,
    endSnapGesture,
    nodesById,
    onDeleteNode,
    onUpdateNode,
    onWhiteboardTransaction,
    selectedNodeIdSet,
    setMultiNodeDragDelta,
    setNodeOffset,
    setNodeSizeOverride,
    setSelectedArrowId,
    setSelectedNodeIds,
    setSelectedStickyIds,
    showSnapGuides,
    snapIndexOf,
    spaceHeldRef,
    view
  } = ctx
  const { startArrowDrag } = arrowGestures

  const selectNode = useCallback(
    (nodeId: string, additive: boolean): void => {
      setSelectedArrowId(null)
      if (!additive) {
        setSelectedStickyIds([])
        setSelectedNodeIds([nodeId])
        return
      }
      setSelectedNodeIds((cur) =>
        cur.includes(nodeId) ? cur.filter((id) => id !== nodeId) : [...cur, nodeId]
      )
    },
    [setSelectedArrowId, setSelectedNodeIds, setSelectedStickyIds]
  )

  const startNodeDrag = useCallback(
    (nodeId: string, event: React.PointerEvent): void => {
      if (event.button !== 0 || spaceHeldRef.current) {
        return
      }
      const node = nodesById.get(nodeId)
      if (!node || node.locked) {
        return
      }
      const startCanvas = clientToCanvasPoint(event.clientX, event.clientY)
      const movingIds =
        selectedNodeIdSet.has(nodeId) && effectiveSelectedNodeIds.length > 1
          ? effectiveSelectedNodeIds.filter((id) => !nodesById.get(id)?.locked)
          : [nodeId]
      const initialBoxes = movingIds.flatMap((id) => {
        const b = boxMapRef.current.get(id)
        return b ? [{ id, ...b }] : []
      })
      const bounds = unionRect(initialBoxes) ?? { x: node.x, y: node.y, w: node.w, h: node.h }
      const snap = beginSnapGesture(movingIds)
      let started = false
      let endTxn: (() => void) | null = null
      let latestDelta = { x: 0, y: 0 }

      const onMove = (move: PointerEvent): void => {
        const curCanvas = clientToCanvasPoint(move.clientX, move.clientY)
        if (!started) {
          if (!passedDragThreshold(startCanvas, curCanvas, PENPOT_DRAG_THRESHOLD, view.scale)) {
            return
          }
          started = true
          endTxn = onWhiteboardTransaction ? onWhiteboardTransaction() : null
        }
        const rawDx = curCanvas.x - startCanvas.x
        const rawDy = curCanvas.y - startCanvas.y
        const snapped = snapMoveDelta(bounds, rawDx, rawDy, snapIndexOf(snap), view.scale, move)
        latestDelta = { x: Math.round(snapped.dx), y: Math.round(snapped.dy) }
        showSnapGuides(snapped.guides)
        if (movingIds.length > 1) {
          setMultiNodeDragDelta(latestDelta)
        } else {
          setNodeOffset({ id: nodeId, dx: latestDelta.x, dy: latestDelta.y })
        }
      }

      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        endSnapGesture(snap)
        showSnapGuides(NO_GUIDES)
        setNodeOffset(null)
        setMultiNodeDragDelta(null)
        if (started && (latestDelta.x !== 0 || latestDelta.y !== 0)) {
          for (const item of initialBoxes) {
            onUpdateNode?.(item.id, {
              x: Math.round(item.x + latestDelta.x),
              y: Math.round(item.y + latestDelta.y)
            })
          }
        }
        endTxn?.()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [
      beginSnapGesture,
      boxMapRef,
      clientToCanvasPoint,
      effectiveSelectedNodeIds,
      endSnapGesture,
      nodesById,
      onUpdateNode,
      onWhiteboardTransaction,
      selectedNodeIdSet,
      setMultiNodeDragDelta,
      setNodeOffset,
      showSnapGuides,
      snapIndexOf,
      spaceHeldRef,
      view.scale
    ]
  )

  const startNodeResize = useCallback(
    (nodeId: string, handle: Handler, event: React.PointerEvent): void => {
      if (event.button !== 0) {
        return
      }
      const node = nodesById.get(nodeId)
      if (!node || node.locked) {
        return
      }
      const origin = { x: node.x, y: node.y, w: node.w, h: node.h }
      const penpotOrigin = { x: node.x, y: node.y, width: node.w, height: node.h }
      const startCanvas = clientToCanvasPoint(event.clientX, event.clientY)
      const snapKind = handlerToSnapKind(handle)
      const snap = beginSnapGesture([nodeId])
      let started = false
      let endTxn: (() => void) | null = null
      let latestBox = origin

      const onMove = (move: PointerEvent): void => {
        const curCanvas = clientToCanvasPoint(move.clientX, move.clientY)
        if (!started) {
          if (!passedResizeThreshold(startCanvas, curCanvas, view.scale)) {
            return
          }
          started = true
          endTxn = onWhiteboardTransaction ? onWhiteboardTransaction() : null
        }
        const rawDx = curCanvas.x - startCanvas.x
        const rawDy = curCanvas.y - startCanvas.y
        const computeCandidate = (dx: number, dy: number) => {
          const r = resizeRect(
            penpotOrigin,
            handle,
            startCanvas,
            { x: startCanvas.x + dx, y: startCanvas.y + dy },
            { lock: move.shiftKey, center: move.altKey }
          )
          return clampCanvasNodeBox({ x: r.x, y: r.y, w: r.width, h: r.height })
        }
        const snapped = snapResizeDelta(
          rawDx,
          rawDy,
          snapKind,
          computeCandidate,
          snapIndexOf(snap),
          view.scale,
          move
        )
        showSnapGuides(snapped.guides)
        latestBox = computeCandidate(snapped.dx, snapped.dy)
        setNodeSizeOverride({ id: nodeId, ...latestBox })
      }

      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        endSnapGesture(snap)
        showSnapGuides(NO_GUIDES)
        setNodeSizeOverride(null)
        if (started) {
          onUpdateNode?.(nodeId, latestBox)
        }
        endTxn?.()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [
      beginSnapGesture,
      clientToCanvasPoint,
      endSnapGesture,
      nodesById,
      onUpdateNode,
      onWhiteboardTransaction,
      setNodeSizeOverride,
      showSnapGuides,
      snapIndexOf,
      view.scale
    ]
  )

  const startNodePortArrow = useCallback(
    (nodeId: string, side: CardinalSide, event: React.PointerEvent): void => {
      const box = boxMapRef.current.get(nodeId)
      const hit = box ? getCardinalPortPoints(box).find((p) => p.side === side) : undefined
      startArrowDrag(event, nodeId, hit ? { x: hit.x, y: hit.y } : undefined)
    },
    [boxMapRef, startArrowDrag]
  )

  const eraseNode = useCallback(
    (nodeId: string): void => {
      const node = nodesById.get(nodeId)
      if (!node || node.locked) {
        return
      }
      onDeleteNode?.(nodeId)
      setSelectedNodeIds((cur) => cur.filter((id) => id !== nodeId))
    },
    [nodesById, onDeleteNode, setSelectedNodeIds]
  )

  return {
    selectNode,
    startNodeDrag,
    startNodeResize,
    startNodePortArrow,
    eraseNode
  }
}

export type NodeGestures = ReturnType<typeof useNodeGestures>
