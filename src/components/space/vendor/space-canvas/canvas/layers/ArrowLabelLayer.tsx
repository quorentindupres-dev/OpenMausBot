// WS-0 (TASK_16 wave 2): arrow label / toolbar chips: the second arrows.map block, moved verbatim
// from space-canvas.tsx. Owner: WS-C (skips hidden arrows).
import type { CanvasCtx } from '../canvas-ctx'
import {
  STICKY_COLORS,
  STICKY_COLOR_STYLE,
  WHITEBOARD_ARROW_ROUTINGS,
  resolveArrowPathAndHandles
} from '../../core/space'
import { hiddenIds, isArrowHidden } from '../../core/whiteboard-groups'
import { useMemo } from 'react'
import { isImeOwnedKeyboardEvent } from '../../core/ime-guard'

export function ArrowLabelLayer({ ctx }: { ctx: CanvasCtx }): React.JSX.Element {
  const {
    arrowLabelDraft,
    arrows,
    bendingArrow,
    boxMap,
    editingArrowId,
    hoveredArrowId,
    onDeleteArrow,
    onUpdateArrow,
    selectedArrowId,
    setArrowLabelDraft,
    setEditingArrowId,
    setHoveredArrowId,
    setSelectedArrowId
  } = ctx
  // WS-C: hidden arrows, and arrows that end on a hidden sticky, are not drawn.
  const hiddenStickyIds = useMemo(() => hiddenIds(ctx.stickies), [ctx.stickies])
  return (
    <>
      {arrows.map((arrow) => {
        if (isArrowHidden(arrow, hiddenStickyIds)) {
          return null
        }
        const withBend =
          bendingArrow && bendingArrow.arrowId === arrow.id
            ? { ...arrow, bend: bendingArrow.bend }
            : arrow
        const geom = resolveArrowPathAndHandles(withBend, boxMap)
        if (!geom) {
          return null
        }
        const isSelected = selectedArrowId === arrow.id
        const isHovered = hoveredArrowId === arrow.id
        const isEditing = editingArrowId === arrow.id
        if (!arrow.label && !isSelected && !isHovered && !isEditing) {
          return null
        }
        const showControls = isSelected || isHovered || isEditing
        const curRouting = arrow.routing ?? 'curve'
        return (
          <div
            key={`label-${arrow.id}`}
            data-space-arrow={arrow.id}
            onMouseEnter={() => setHoveredArrowId(arrow.id)}
            onMouseLeave={() => setHoveredArrowId((cur) => (cur === arrow.id ? null : cur))}
            style={{
              left: geom.mid.x,
              top: showControls ? geom.mid.y - 28 : geom.mid.y,
              transform: 'translate(-50%, -50%)'
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setSelectedArrowId(arrow.id)
            }}
            className="pointer-events-auto absolute z-20 flex items-center gap-1.5 rounded-xl border border-sky-500/45 bg-zinc-900/95 px-2.5 py-1 text-xs text-zinc-100 shadow-xl whitespace-nowrap"
          >
            {isEditing ? (
              <input
                autoFocus
                value={arrowLabelDraft}
                onChange={(event) => setArrowLabelDraft(event.target.value)}
                onBlur={() => {
                  onUpdateArrow?.(arrow.id, { label: arrowLabelDraft.trim() || undefined })
                  setEditingArrowId(null)
                }}
                onKeyDown={(event) => {
                  if (isImeOwnedKeyboardEvent(event)) {
                    return
                  }
                  if (event.key === 'Enter') {
                    onUpdateArrow?.(arrow.id, { label: arrowLabelDraft.trim() || undefined })
                    setEditingArrowId(null)
                  } else if (event.key === 'Escape') {
                    setEditingArrowId(null)
                  }
                }}
                placeholder="Arrow label…"
                className="w-36 bg-transparent text-xs text-white outline-none"
              />
            ) : (
              <>
                {arrow.label ? <span className="font-medium px-1">{arrow.label}</span> : null}
                {isSelected || isHovered ? (
                  <>
                    <div className="flex items-center gap-1">
                      {STICKY_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={`Arrow color: ${STICKY_COLOR_STYLE[c].label}`}
                          onClick={() => onUpdateArrow?.(arrow.id, { color: c })}
                          className={`size-3.5 rounded-full transition-transform hover:scale-110 ${STICKY_COLOR_STYLE[c].dot} ${
                            arrow.color === c ? 'ring-2 ring-white' : 'opacity-75 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="mx-0.5 h-3.5 w-px bg-white/15" />
                    <div className="flex items-center gap-0.5 rounded-lg bg-zinc-950/80 p-0.5">
                      {WHITEBOARD_ARROW_ROUTINGS.map((rt) => {
                        const label = rt === 'curve' ? 'Curve' : rt === 'elbow' ? 'Elbow' : 'Line'
                        const active = curRouting === rt
                        return (
                          <button
                            key={rt}
                            type="button"
                            title={`Routing: ${label}`}
                            onClick={() =>
                              onUpdateArrow?.(arrow.id, { routing: rt, bend: undefined })
                            }
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                              active
                                ? 'bg-sky-500/25 text-sky-200'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      title={
                        arrow.dash === 'dashed' ? 'Switch to solid line' : 'Switch to dashed line'
                      }
                      onClick={() =>
                        onUpdateArrow?.(arrow.id, {
                          dash: arrow.dash === 'dashed' ? 'solid' : 'dashed'
                        })
                      }
                      className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                        arrow.dash === 'dashed'
                          ? 'bg-sky-500/25 text-sky-200'
                          : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      ╌
                    </button>
                    <button
                      type="button"
                      title="Edit arrow label"
                      onClick={() => {
                        setSelectedArrowId(arrow.id)
                        setEditingArrowId(arrow.id)
                        setArrowLabelDraft(arrow.label ?? '')
                      }}
                      className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
                    >
                      ✎ Label
                    </button>
                    <button
                      type="button"
                      title="Flip arrow direction"
                      onClick={() =>
                        onUpdateArrow?.(arrow.id, {
                          fromId: arrow.toId,
                          toId: arrow.fromId,
                          fromPoint: arrow.toPoint,
                          toPoint: arrow.fromPoint
                        })
                      }
                      className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20"
                    >
                      ⇄
                    </button>
                    <button
                      type="button"
                      title="Delete arrow"
                      onClick={() => {
                        onDeleteArrow?.(arrow.id)
                        setSelectedArrowId(null)
                      }}
                      className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 hover:text-rose-200"
                    >
                      ✕
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
