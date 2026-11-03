// WS-0 (TASK_16 wave 2): bottom-right undo / redo + zoom out / fit / zoom in, moved verbatim from
// space-canvas.tsx. Owner: WS-A. WS-A: − / + share zoomStep() with the keys; the `?` shortcut help
// (ShortcutHelp) renders here only while open, so it adds no always-visible control.
import type { CanvasCtx, CanvasHandlers } from '../canvas-ctx'
import { WhiteboardHistoryControls } from '../../whiteboard-toolbar'
import { useEffect, useRef } from 'react'
import { setKeepOut } from '../../core/keep-out'
import { CORNER_GAP, CORNER_W, cornerBottomFor } from '../corner-layout'
import { useCanvasWidth } from '../use-canvas-width'
import { ShortcutHelp } from './ShortcutHelp'
import { endNudgeBurst } from '../keyboard/use-nudge'

export function HistoryZoomControls({
  ctx,
  g
}: {
  ctx: CanvasCtx
  g: CanvasHandlers
}): React.JSX.Element {
  const { canRedo, canUndo, onRedo, onUndo, rootRef, view } = ctx
  const { hasSelection, fitToSelection, fitAllSpaces, zoomStep } = g
  const cornerRef = useRef<HTMLDivElement | null>(null)
  const canvasWidth = useCanvasWidth(rootRef)
  const bottom = cornerBottomFor(canvasWidth)
  // U-37: tell the pinned squares where this column is (keep-out zone, shared/orca-plus/keep-out.ts).
  useEffect(() => {
    const el = cornerRef.current
    const publish = (): void => {
      const r = el?.getBoundingClientRect()
      setKeepOut(
        'canvas-corner',
        r && r.width > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null
      )
    }
    publish()
    window.addEventListener('resize', publish)
    return () => {
      window.removeEventListener('resize', publish)
      setKeepOut('canvas-corner', null)
    }
  }, [bottom, canvasWidth])
  return (
    <>
      {/* Bottom-Right History (Undo/Redo) + Zoom Controls */}
      {/* U-37: one column in the corner, clear of the whiteboard toolbar (see corner-layout.ts). */}
      <div
        ref={cornerRef}
        style={{ width: CORNER_W, right: CORNER_GAP, bottom }}
        className="op-canvas-corner pointer-events-none absolute z-30 flex flex-col items-end gap-1.5"
      >
        <WhiteboardHistoryControls
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={
            onUndo &&
            (() => {
              // A nudge burst still open would write over the undone state: close it first.
              endNudgeBurst(rootRef)
              onUndo()
            })
          }
          onRedo={
            onRedo &&
            (() => {
              endNudgeBurst(rootRef)
              onRedo()
            })
          }
        />
        <div className="pointer-events-auto flex items-center gap-0.5 whitespace-nowrap rounded-2xl border border-border/60 bg-card/95 p-1 text-xs shadow-lg backdrop-blur-md">
          <button
            type="button"
            title="Zoom out (1.5x step)"
            onClick={() => zoomStep('out')}
            className="rounded-xl px-2 py-1 text-sm font-bold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            −
          </button>
          <button
            type="button"
            data-zoom-fit={hasSelection ? 'selection' : 'all'}
            title={
              hasSelection ? 'Zoom to selection (Shift+2)' : 'Fit all Spaces in view (Shift+1)'
            }
            onClick={() => {
              if (!hasSelection || !fitToSelection()) {
                fitAllSpaces()
              }
            }}
            className="rounded-xl px-1.5 py-1 font-mono text-[11px] whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {Math.round(view.scale * 100)}% · Fit
          </button>
          <button
            type="button"
            title="Zoom in (1.5x step)"
            onClick={() => zoomStep('in')}
            className="rounded-xl px-2 py-1 text-sm font-bold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            +
          </button>
        </div>
      </div>
      <ShortcutHelp owner={rootRef} />
    </>
  )
}
