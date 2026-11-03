import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentRoleId } from './generated/a01-roles'
import type { C02ProjectSummary, DraggableSessionSummary } from './core/canvas-nodes'
import { BENCH_KEY, type Point, type SpaceLevel } from './core/space'

export type DragItem =
  | { kind: 'bot'; botId: string }
  | { kind: 'spawn'; spawnerId: string }
  | { kind: 'space'; level: SpaceLevel }
  | { kind: 'session'; session: DraggableSessionSummary }
  | { kind: 'a01-role'; roleId: AgentRoleId }
  | { kind: 'project'; project: C02ProjectSummary }

export type DropTarget =
  | { kind: 'tile'; key: string }
  | { kind: 'bench' }
  | { kind: 'palette-remove' }
  | { kind: 'canvas' }
  | null

export type DragState = {
  item: DragItem
  point: Point
  over: DropTarget
} | null

function sameDropTarget(a: DropTarget, b: DropTarget): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b || a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'tile' && b.kind === 'tile') {
    return a.key === b.key
  }
  return true
}

function canDropDirectlyOnCanvas(item: DragItem): boolean {
  return (
    item.kind === 'space' ||
    item.kind === 'spawn' ||
    item.kind === 'session' ||
    item.kind === 'a01-role' ||
    item.kind === 'project'
  )
}

function findDropTarget(item: DragItem, clientX: number, clientY: number): DropTarget {
  if (typeof document.elementsFromPoint !== 'function') {
    return canDropDirectlyOnCanvas(item) ? { kind: 'canvas' } : null
  }
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const element of stack) {
    if (item.kind === 'bot' && element.hasAttribute('data-space-remove')) {
      return { kind: 'palette-remove' }
    }
    if (
      element.hasAttribute('data-space-palette') ||
      element.hasAttribute('data-space-dock') ||
      element.hasAttribute('data-space-drawer')
    ) {
      return null
    }
    if (item.kind === 'bot' || item.kind === 'spawn') {
      const tileKey = element.getAttribute('data-space-tile')
      if (tileKey) {
        return { kind: 'tile', key: tileKey }
      }
      if (element.hasAttribute('data-space-bench')) {
        return { kind: 'bench' }
      }
    }
  }
  if (
    canDropDirectlyOnCanvas(item) &&
    stack.some((element) => element.hasAttribute('data-space-canvas'))
  ) {
    return { kind: 'canvas' }
  }
  return null
}

export function isOverTile(drag: DragState, key: string): boolean {
  if (!drag?.over) {
    return false
  }
  if (drag.over.kind === 'tile' && drag.over.key === key) {
    return true
  }
  return drag.over.kind === 'bench' && key === BENCH_KEY
}

export function useSpaceDrag(onDrop: (item: DragItem, over: DropTarget, point: Point) => void): {
  drag: DragState
  ghostRef: React.RefObject<HTMLDivElement | null>
  startDrag: (item: DragItem) => (event: React.PointerEvent) => void
} {
  const [drag, setDrag] = useState<DragState>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  const startDrag = useCallback(
    (item: DragItem) => (event: React.PointerEvent) => {
      if (event.button !== 0) {
        return
      }
      const origin = { x: event.clientX, y: event.clientY }
      let started = false
      let rafId = 0
      let latestX = event.clientX
      let latestY = event.clientY
      let lastOver: DropTarget = null

      const onMove = (move: PointerEvent): void => {
        latestX = move.clientX
        latestY = move.clientY
        if (!started) {
          if (Math.hypot(latestX - origin.x, latestY - origin.y) < 5) {
            return
          }
          started = true
          lastOver = findDropTarget(item, latestX, latestY)
          setDrag({
            item,
            point: { x: latestX, y: latestY },
            over: lastOver
          })
          return
        }
        if (ghostRef.current) {
          ghostRef.current.style.transform = `translate3d(${latestX + 14}px, ${latestY + 14}px, 0)`
        }
        if (rafId !== 0) {
          return
        }
        rafId = window.requestAnimationFrame(() => {
          rafId = 0
          const nextOver = findDropTarget(item, latestX, latestY)
          if (!sameDropTarget(lastOver, nextOver)) {
            lastOver = nextOver
            setDrag({
              item,
              point: { x: latestX, y: latestY },
              over: nextOver
            })
          }
        })
      }

      const onUp = (up: PointerEvent): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        if (rafId !== 0) {
          window.cancelAnimationFrame(rafId)
          rafId = 0
        }
        setDrag(null)
        if (!started) {
          return
        }
        const over = findDropTarget(item, up.clientX, up.clientY)
        onDropRef.current(item, over, { x: up.clientX, y: up.clientY })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    []
  )

  useEffect(() => {
    if (!drag) {
      return
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setDrag(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drag])

  return { drag, ghostRef, startDrag }
}
