// WS-0 (TASK_16 wave 2): shared canvas context for the split SpaceCanvas modules. Owner: WS-A
// (others request a field). Moved verbatim from space-canvas.tsx: constants, box types, the pure hit-test,
// the client->canvas point mapper. CanvasCtx = props + state + derived + snap; CanvasHandlers = gestures.
// Module map (owner in wave 2):
//   use-canvas-state.ts, use-canvas-model.ts, canvas-ctx.ts ............ WS-A
//   canvas-parts.tsx (ports, title editor, clamped toolbar, glide) ...... none
//   gestures/use-wheel-pan.ts (wheel + startPan/marquee/tool draws) ...... WS-A
//   gestures/use-snap-gesture.ts ........................................ none (WS-B reads)
//   gestures/use-arrow-gestures.ts, gestures/use-dock-drag.ts ........... none
//   gestures/use-tile-gestures.ts ....................................... WS-A (move helper for nudge)
//   gestures/use-sticky-gestures.ts ..................................... WS-C
//   keyboard/use-canvas-keys.ts, selection/use-selection-actions.ts ..... WS-A
//   selection/use-clipboard.ts .......................................... WS-E
//   layers/ArrowLayer.tsx, ArrowLabelLayer.tsx, StickyLayer.tsx ......... WS-C
//   layers/TileLayer.tsx, TileHeader.tsx, DrawPreview.tsx ............... none
//   overlays/MultiSelectBar.tsx ......................................... WS-B
//   overlays/ItemInspector.tsx, overlays/ContextMenus.tsx ............... WS-E
//   overlays/Dock.tsx, overlays/DockGhost.tsx ........................... none
//   overlays/HistoryZoomControls.tsx .................................... WS-A
import { toCanvas, type Point, type View } from '../core/space'
import type { SpaceCanvas } from '../space-canvas'
import type { ArrowGestures } from './gestures/use-arrow-gestures'
import type { DockDrag } from './gestures/use-dock-drag'
import type { NodeGestures } from './gestures/use-node-gestures'
import type { CanvasSnap } from './gestures/use-snap-gesture'
import type { StickyGestures } from './gestures/use-sticky-gestures'
import type { TileGestures } from './gestures/use-tile-gestures'
import type { useStartPan } from './gestures/use-wheel-pan'
import type { SelectionActions } from './selection/use-selection-actions'
import type { CanvasModel } from './use-canvas-model'
import type { CanvasState } from './use-canvas-state'

export const GLIDE_MS = 400
export const DEFAULT_ARROW_STROKE = '#38bdf8'
export const SNAP_MARGIN = 26
export const PAN_SPEED_MULTIPLIER = 1.25
export type Box = { left: number; top: number; spaceKey: string }
export type BoxRect = { x: number; y: number; w: number; h: number }

/** Pure geometric hit-test in canvas coordinates with a magnetic snap margin. */
export function findBoxAtPoint(
  pt: Point,
  boxMap: ReadonlyMap<string, BoxRect>,
  excludeId?: string,
  margin = SNAP_MARGIN
): string | undefined {
  let bestInsideId: string | undefined
  let bestInsideArea = Number.POSITIVE_INFINITY
  let bestSnapId: string | undefined
  let bestSnapDist = Number.POSITIVE_INFINITY

  for (const [id, box] of boxMap.entries()) {
    if (id === excludeId) {
      continue
    }
    const insideX = pt.x >= box.x && pt.x <= box.x + box.w
    const insideY = pt.y >= box.y && pt.y <= box.y + box.h
    if (insideX && insideY) {
      const area = box.w * box.h
      if (area < bestInsideArea) {
        bestInsideArea = area
        bestInsideId = id
      }
      continue
    }
    const clampedX = Math.max(box.x, Math.min(box.x + box.w, pt.x))
    const clampedY = Math.max(box.y, Math.min(box.y + box.h, pt.y))
    const dist = Math.hypot(pt.x - clampedX, pt.y - clampedY)
    if (dist <= margin && dist < bestSnapDist) {
      bestSnapDist = dist
      bestSnapId = id
    }
  }
  return bestInsideId ?? bestSnapId
}

/** Canvas point under a client (screen) point; same closure as before, built once per render. */
export function makeClientToCanvasPoint(
  rootRef: React.RefObject<HTMLDivElement | null>,
  view: View
): (clientX: number, clientY: number) => Point {
  const clientToCanvasPoint = (clientX: number, clientY: number): Point => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) {
      return { x: 160, y: 120 }
    }
    return toCanvas({ x: clientX - rect.left, y: clientY - rect.top }, view)
  }
  return clientToCanvasPoint
}

/** Everything the split canvas modules read: SpaceCanvas props (defaults applied), local state + refs,
 *  derived data, the snap gesture and the point mapper. Built with useMemo in SpaceCanvas, passed as an
 *  argument (no React context). */
type SpaceCanvasProps = React.ComponentProps<typeof SpaceCanvas>
/** Props with SpaceCanvas's destructuring defaults applied (those are always set inside). */
type DefaultedProp =
  | 'inspectedAgentId'
  | 'toolMode'
  | 'selectedModelId'
  | 'askModelOnDrop'
  | 'canUndo'
  | 'canRedo'
  | 'pendingEditStickyId'
  | 'dark'
  | 'showProjectHeader'
export type CanvasProps = Omit<SpaceCanvasProps, DefaultedProp> &
  Required<Pick<SpaceCanvasProps, DefaultedProp>>
export type CanvasCtx = CanvasProps &
  CanvasState &
  CanvasModel &
  CanvasSnap & {
    clientToCanvasPoint: (clientX: number, clientY: number) => Point
  }

/** The gesture starters and selection actions the layers and overlays call (one object per render). */
export type CanvasHandlers = SelectionActions &
  ArrowGestures &
  ReturnType<typeof useStartPan> &
  TileGestures &
  StickyGestures &
  NodeGestures &
  DockDrag
