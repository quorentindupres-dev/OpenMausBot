// WS-0 (TASK_16 wave 2): Space tile drag + edge / corner resize, moved verbatim from space-canvas.tsx.
// Owner: WS-A (adds the move helper for nudge).
import type { CanvasCtx } from '../canvas-ctx'
import type { ArrowGestures } from './use-arrow-gestures'
import { NO_GUIDES, snapMoveDelta, snapResizeDelta } from '../../core/whiteboard-snap-drag'
import { type SpaceTile, type TileResizeHandle, resizeTileLayout } from '../../core/space'

/** WS-A move helper (keyboard nudge): the tile's layout moved by (dx, dy), size kept, same rounding as a drag. */
export function movedTileLayout(
  layout: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number
): { x: number; y: number; w: number; h: number } {
  const x = Math.round(layout.x + dx)
  const y = Math.round(layout.y + dy)
  return {
    x: Number.isFinite(x) ? x : layout.x,
    y: Number.isFinite(y) ? y : layout.y,
    w: layout.w,
    h: layout.h
  }
}

export function useTileGestures(ctx: CanvasCtx, arrowGestures: ArrowGestures) {
  const {
    beginSnapGesture,
    boxMapRef,
    endSnapGesture,
    onMoveTile,
    setTileOffset,
    setTileSizeOverride,
    showSnapGuides,
    snapIndexOf,
    spaceHeldRef,
    toolMode,
    view
  } = ctx
  const { startArrowDrag } = arrowGestures
  const startTileDrag =
    (tile: SpaceTile) =>
    (event: React.PointerEvent): void => {
      if (event.button !== 0) {
        return
      }
      const target = event.target as HTMLElement
      if (
        target.closest(
          'button, input, textarea, [data-space-card], [data-emoji-picker], [data-bg-picker], [data-level-picker], [data-tile-resize], [data-title-edit], [data-quick-port]'
        )
      ) {
        return
      }
      if (spaceHeldRef.current || toolMode === 'eraser') {
        return
      }
      if (toolMode === 'arrow') {
        startArrowDrag(event, tile.key)
        return
      }
      event.stopPropagation()
      const origin = { x: event.clientX, y: event.clientY }
      const startBox = boxMapRef.current.get(tile.key) ?? tile
      const snap = beginSnapGesture([tile.key])
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
          setTileOffset((current) => ({ ...current, [tile.key]: delta }))
          showSnapGuides(snapIndexOf(snap) ? guides : NO_GUIDES)
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
        setTileOffset((current) => {
          const next = { ...current }
          delete next[tile.key]
          return next
        })
        if (Math.hypot(delta.x, delta.y) > 4) {
          onMoveTile(tile.key, {
            x: Math.round(tile.x + delta.x),
            y: Math.round(tile.y + delta.y),
            w: tile.w,
            h: tile.h
          })
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

  /** Corner (nw / ne / sw / se, OpenMausBot parity) and edge (e / s) resize for any Space or Bench tile. */
  const startTileResize =
    (tile: SpaceTile, handle: TileResizeHandle = 'se') =>
    (event: React.PointerEvent): void => {
      if (event.button !== 0) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const origin = { x: event.clientX, y: event.clientY }
      const liveBox = boxMapRef.current.get(tile.key)
      const startBox = {
        x: liveBox?.x ?? tile.x,
        y: liveBox?.y ?? tile.y,
        w: liveBox?.w ?? tile.w,
        h: liveBox?.h ?? tile.h
      }
      let latest = startBox
      let guides = NO_GUIDES
      let rafId = 0
      const snap = beginSnapGesture([tile.key])

      const onMove = (move: PointerEvent): void => {
        const rawDx = (move.clientX - origin.x) / view.scale
        const rawDy = (move.clientY - origin.y) / view.scale
        // Only the dragged edge(s) snap; resizeTileLayout keeps its clamps on the snapped delta.
        const snapped = snapResizeDelta(
          rawDx,
          rawDy,
          handle,
          (dx, dy) => resizeTileLayout(startBox, handle, dx, dy),
          snapIndexOf(snap),
          view.scale,
          move
        )
        latest = resizeTileLayout(startBox, handle, snapped.dx, snapped.dy)
        guides = snapped.guides
        if (rafId !== 0) {
          return
        }
        rafId = window.requestAnimationFrame(() => {
          rafId = 0
          showSnapGuides(snapIndexOf(snap) ? guides : NO_GUIDES)
          setTileSizeOverride((current) => ({
            ...current,
            [tile.key]: { w: latest.w, h: latest.h }
          }))
          if (latest.x !== tile.x || latest.y !== tile.y) {
            setTileOffset((current) => ({
              ...current,
              [tile.key]: { x: latest.x - tile.x, y: latest.y - tile.y }
            }))
          }
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
        setTileSizeOverride((current) => {
          const next = { ...current }
          delete next[tile.key]
          return next
        })
        setTileOffset((current) => {
          if (!current[tile.key]) {
            return current
          }
          const next = { ...current }
          delete next[tile.key]
          return next
        })
        if (
          Math.abs(latest.w - startBox.w) > 2 ||
          Math.abs(latest.h - startBox.h) > 2 ||
          latest.x !== startBox.x ||
          latest.y !== startBox.y
        ) {
          onMoveTile(tile.key, latest)
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
  return {
    startTileDrag,
    startTileResize
  }
}

export type TileGestures = ReturnType<typeof useTileGestures>
