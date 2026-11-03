// U-37: after a Fit that showed only the Spaces with members, a small chip on each side says how many
// Spaces are off screen ("← 4 Spaces"); a click pans to the nearest one. Renders nothing otherwise.
import type { CanvasCtx } from '../canvas-ctx'
import { offscreenGroups, type OffscreenSide } from '../../core/viewport-fit'

const ARROW: Record<OffscreenSide, string> = { left: '←', right: '→', top: '↑', bottom: '↓' }
const POS: Record<OffscreenSide, string> = {
  left: 'left-2 top-1/2 -translate-y-1/2',
  right: 'right-2 top-1/2 -translate-y-1/2',
  top: 'top-14 left-1/2 -translate-x-1/2',
  bottom: 'bottom-28 left-1/2 -translate-x-1/2'
}

export function OffscreenCue({ ctx }: { ctx: CanvasCtx }): React.JSX.Element | null {
  const { boxMap, fitPartial, markZoomTween, rootRef, setView, view } = ctx
  const el = rootRef.current
  if (!fitPartial || !el) {
    return null
  }
  const boxes = ctx.tiles.flatMap((t) => {
    const b = boxMap.get(t.key)
    return b ? [b] : []
  })
  const groups = offscreenGroups(boxes, view, el.clientWidth, el.clientHeight)
  if (groups.length === 0) {
    return null
  }
  return (
    <>
      {groups.map((group) => (
        <button
          key={group.side}
          type="button"
          data-offscreen-cue={group.side}
          title="Pan to the nearest Space"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            markZoomTween()
            setView((v) => ({
              scale: v.scale,
              x: el.clientWidth / 2 - group.target.x * v.scale,
              y: el.clientHeight / 2 - group.target.y * v.scale
            }))
          }}
          className={`pointer-events-auto absolute z-30 whitespace-nowrap rounded-full border border-border/60 bg-card/95 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-lg backdrop-blur-md hover:bg-accent ${POS[group.side]}`}
        >
          {ARROW[group.side]} {group.count} {group.count === 1 ? 'Space' : 'Spaces'}
        </button>
      ))}
    </>
  )
}
