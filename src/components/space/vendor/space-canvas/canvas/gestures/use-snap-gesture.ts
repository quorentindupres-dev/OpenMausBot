// WS-0 (TASK_16 wave 2): smart-guide snap gesture + guides state, moved verbatim from space-canvas.tsx.
// Owner: none (WS-B reads it).
import { NO_GUIDES } from '../../core/whiteboard-snap-drag'
import {
  type SnapGuide,
  type SnapIndex,
  type SnapRect,
  createSnapIndex
} from '../../core/whiteboard-snap'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasState } from '../use-canvas-state'
import type { CanvasModel } from '../use-canvas-model'

export function useSnapGesture({ rootRef, view }: CanvasState, { boxMapRef }: CanvasModel) {
  // Smart-guide snapping (TASK_16 WS2b): one index per drag gesture, guides drawn in screen space.
  const [snapGuides, setSnapGuides] = useState<readonly SnapGuide[]>(NO_GUIDES)
  const snapGestureRef = useRef<{ index: SnapIndex; off: boolean } | null>(null)
  const showSnapGuides = useCallback((guides: readonly SnapGuide[]): void => {
    setSnapGuides((cur) => (cur.length === 0 && guides.length === 0 ? cur : guides))
  }, [])
  /** Pointer down: every box except the moving ones, inside the visible viewport for gap search. */
  const beginSnapGesture = (exclude: Iterable<string>): { index: SnapIndex; off: boolean } => {
    const skip = new Set(exclude)
    const others: SnapRect[] = []
    for (const [id, box] of boxMapRef.current) {
      if (!skip.has(id)) {
        others.push(box)
      }
    }
    const rect = rootRef.current?.getBoundingClientRect()
    const scale = view.scale || 1
    const bounds =
      rect && rect.width > 0 && rect.height > 0
        ? { x: -view.x / scale, y: -view.y / scale, w: rect.width / scale, h: rect.height / scale }
        : undefined
    const gesture = { index: createSnapIndex(others, bounds ? { bounds } : {}), off: false }
    snapGestureRef.current = gesture
    return gesture
  }
  /** The index to snap against, or null once Escape / pointercancel turned this gesture's snap off. */
  const snapIndexOf = (gesture: { index: SnapIndex; off: boolean }): SnapIndex | null =>
    gesture.off ? null : gesture.index
  const endSnapGesture = (gesture: { index: SnapIndex; off: boolean }): void => {
    if (snapGestureRef.current === gesture) {
      snapGestureRef.current = null
    }
    showSnapGuides(NO_GUIDES)
  }
  useEffect(() => {
    const stop = (): void => {
      if (snapGestureRef.current) {
        snapGestureRef.current.off = true
        showSnapGuides(NO_GUIDES)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        stop()
      }
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointercancel', stop)
    }
  }, [showSnapGuides])
  return {
    snapGuides,
    setSnapGuides,
    snapGestureRef,
    showSnapGuides,
    beginSnapGesture,
    snapIndexOf,
    endSnapGesture
  }
}

export type CanvasSnap = ReturnType<typeof useSnapGesture>
