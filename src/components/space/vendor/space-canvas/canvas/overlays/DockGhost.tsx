// WS-0 (TASK_16 wave 2): zoom-scaled ghost preview while dragging an item out of the dock (portal),
// moved verbatim from space-canvas.tsx. Owner: none.
import type { CanvasCtx } from '../canvas-ctx'
import { LEVEL_STYLE, resolveWhiteboardSurfaceStyle } from '../../core/space'
import { TOOLBAR_TEXT_PRESETS } from '../../whiteboard-toolbar'
import { createPortal } from 'react-dom'

export function DockGhost({ ctx }: { ctx: CanvasCtx }): React.JSX.Element {
  const {
    activeFillStyle,
    activeShapeColor,
    activeShapeType,
    activeTextPreset,
    dockDrag,
    dockNoteColor,
    dockSpaceLevel,
    view
  } = ctx
  return (
    <>
      {/* Live AFFiNE zoom-scaled floating ghost preview while dragging Space, Note, Shape, or Text Card out of dock */}
      {dockDrag && typeof document !== 'undefined'
        ? createPortal(
            <div
              style={{
                left: 0,
                top: 0,
                transform: `translate3d(${Math.round(dockDrag.clientX - (dockDrag.kind === 'space' ? 112 : 84))}px, ${Math.round(dockDrag.clientY - (dockDrag.kind === 'space' ? 58 : 44))}px, 0) scale(${Math.max(0.76, Math.min(1.16, view.scale)).toFixed(3)})`,
                transformOrigin: 'center center'
              }}
              className="pointer-events-none fixed z-50 will-change-transform"
            >
              {dockDrag.kind === 'space'
                ? (() => {
                    const lvl = dockDrag.options.spaceLevel ?? dockSpaceLevel
                    const st = LEVEL_STYLE[lvl]
                    return (
                      <div className="flex w-56 flex-col overflow-hidden rounded-2xl border-2 border-sky-400/85 bg-zinc-950/95 text-xs text-white shadow-[0_24px_60px_rgba(0,0,0,0.65)] backdrop-blur-md">
                        <div className={`h-2.5 w-full ${st.band}`} />
                        <div className="flex flex-col gap-1.5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">New {st.shortLabel} Space</span>
                            <span
                              className={`rounded border px-1.5 py-0.2 text-[10px] font-bold ${st.chip}`}
                            >
                              {st.shortLabel}
                            </span>
                          </div>
                          <div className="space-y-1 pt-0.5">
                            <div className="h-1 w-28 rounded-full bg-white/25" />
                            <div className="h-1 w-16 rounded-full bg-white/12" />
                          </div>
                          <span className="text-[10px] text-sky-300/90">
                            Release to drop on canvas
                          </span>
                        </div>
                      </div>
                    )
                  })()
                : dockDrag.kind === 'shape'
                  ? (() => {
                      const shapeType = dockDrag.options.shapeType ?? activeShapeType
                      const color = dockDrag.options.color ?? activeShapeColor
                      const fillStyle = dockDrag.options.fillStyle ?? activeFillStyle
                      const surf = resolveWhiteboardSurfaceStyle({
                        kind: 'shape',
                        color,
                        fillStyle,
                        borderStyle: 'solid'
                      })
                      const isSym = shapeType === 'ellipse' || shapeType === 'diamond'
                      const w = isSym ? 132 : 168
                      const h = isSym ? 112 : 84
                      const isSvg = shapeType === 'ellipse' || shapeType === 'diamond'
                      return (
                        <div
                          style={{
                            width: w,
                            height: h,
                            color: surf.textColor,
                            ...(!isSvg
                              ? {
                                  backgroundColor: surf.backgroundColor,
                                  borderColor: surf.borderColor,
                                  borderWidth: 2,
                                  borderStyle: 'solid'
                                }
                              : {})
                          }}
                          className={`relative flex items-center justify-center text-xs font-semibold shadow-[0_24px_60px_rgba(0,0,0,0.58)] ${
                            shapeType === 'pill'
                              ? 'rounded-full'
                              : shapeType === 'rect'
                                ? 'rounded-md'
                                : 'rounded-2xl'
                          } ${!isSvg && surf.backdropBlur ? 'backdrop-blur-md' : ''}`}
                        >
                          {isSvg ? (
                            <svg
                              viewBox={`0 0 ${w} ${h}`}
                              className="pointer-events-none absolute inset-0 size-full overflow-visible drop-shadow-xl"
                            >
                              {shapeType === 'ellipse' ? (
                                <ellipse
                                  cx={w / 2}
                                  cy={h / 2}
                                  rx={w / 2 - 2}
                                  ry={h / 2 - 2}
                                  fill={surf.backgroundColor}
                                  stroke={surf.borderColor}
                                  strokeWidth={2}
                                />
                              ) : (
                                <polygon
                                  points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`}
                                  fill={surf.backgroundColor}
                                  stroke={surf.borderColor}
                                  strokeWidth={2}
                                />
                              )}
                            </svg>
                          ) : null}
                          <span className="relative z-10 text-[11px] opacity-90">
                            Release to drop & label
                          </span>
                        </div>
                      )
                    })()
                  : dockDrag.kind === 'text-card'
                    ? (() => {
                        const preset =
                          TOOLBAR_TEXT_PRESETS.find(
                            (p) => p.id === (dockDrag.options.textCardPreset ?? activeTextPreset)
                          ) ?? TOOLBAR_TEXT_PRESETS[0]!
                        const fillStyle = dockDrag.options.fillStyle ?? preset.fillStyle
                        const color = dockDrag.options.color ?? preset.color
                        const surf = resolveWhiteboardSurfaceStyle({
                          kind: 'text',
                          color,
                          fillStyle,
                          borderStyle: dockDrag.options.borderStyle ?? preset.borderStyle
                        })
                        return (
                          <div
                            style={{
                              backgroundColor:
                                fillStyle === 'none' ? 'rgba(24,24,27,0.9)' : surf.backgroundColor,
                              borderColor:
                                fillStyle === 'none' ? 'rgba(56,189,248,0.65)' : surf.borderColor,
                              color: surf.textColor
                            }}
                            className="flex min-w-40 flex-col gap-0.5 rounded-xl border-2 px-4 py-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.58)] backdrop-blur-md"
                          >
                            <span className="text-sm font-bold">
                              {dockDrag.options.defaultText || preset.sample}
                            </span>
                            <span className="text-[10px] opacity-75">Release to drop & type</span>
                          </div>
                        )
                      })()
                    : (() => {
                        const noteColor = dockDrag.options.color ?? dockNoteColor
                        const surf = resolveWhiteboardSurfaceStyle({
                          kind: 'note',
                          color: noteColor,
                          fillStyle: dockDrag.options.fillStyle ?? 'soft',
                          borderStyle: 'solid'
                        })
                        return (
                          <div
                            style={{
                              backgroundColor: surf.backgroundColor,
                              borderColor: surf.borderColor,
                              color: surf.textColor
                            }}
                            className="relative flex w-44 rotate-1 flex-col gap-1.5 rounded-xl border-2 p-3 text-xs shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between font-semibold">
                              <span>Sticky Note</span>
                              <span className="text-[10px] uppercase opacity-70">{noteColor}</span>
                            </div>
                            <div className="space-y-1 py-0.5">
                              <div className="h-1 w-24 rounded-full bg-current/30" />
                              <div className="h-1 w-16 rounded-full bg-current/20" />
                            </div>
                            <span className="text-[10px] opacity-85">Release to drop & type</span>
                            <span className="pointer-events-none absolute right-0 bottom-0 size-3 rounded-tl-sm bg-black/20" />
                          </div>
                        )
                      })()}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
