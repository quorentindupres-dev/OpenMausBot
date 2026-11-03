// WS-0 (TASK_16 wave 2): live draw previews (shape, frame), multi-select bounds and the marquee box,
// moved verbatim from space-canvas.tsx. Owner: none.
import type { CanvasCtx } from '../canvas-ctx'
import { LEVEL_STYLE, normalizeMarqueeRect, resolveWhiteboardSurfaceStyle } from '../../core/space'

export function DrawPreview({ ctx }: { ctx: CanvasCtx }): React.JSX.Element {
  const { boxMap, drawingFrameRect, drawingShapeRect, effectiveSelectedIds, marqueeRect } = ctx
  return (
    <>
      {/* Live canvas draw-preview boxes (Shape, Frame, and Box-Marquee) */}
      {drawingShapeRect
        ? (() => {
            const r = normalizeMarqueeRect(drawingShapeRect.start, drawingShapeRect.current)
            const w = Math.max(24, Math.round(r.w))
            const h = Math.max(20, Math.round(r.h))
            const surf = resolveWhiteboardSurfaceStyle({
              kind: 'shape',
              color: drawingShapeRect.color,
              fillStyle: drawingShapeRect.fillStyle,
              borderStyle: 'dashed'
            })
            const st = drawingShapeRect.shapeType
            const isSvg = st === 'ellipse' || st === 'diamond'
            return (
              <div
                style={{
                  left: r.x,
                  top: r.y,
                  width: w,
                  height: h,
                  ...(!isSvg
                    ? {
                        backgroundColor: surf.backgroundColor,
                        borderColor: surf.borderColor,
                        borderWidth: 2,
                        borderStyle: 'dashed'
                      }
                    : {})
                }}
                className={`pointer-events-none absolute z-40 flex items-center justify-center ${
                  st === 'pill' ? 'rounded-full' : st === 'rect' ? 'rounded-md' : 'rounded-2xl'
                }`}
              >
                {isSvg ? (
                  <svg
                    viewBox={`0 0 ${w} ${h}`}
                    className="pointer-events-none absolute inset-0 size-full overflow-visible"
                  >
                    {st === 'ellipse' ? (
                      <ellipse
                        cx={w / 2}
                        cy={h / 2}
                        rx={Math.max(1, w / 2 - 2)}
                        ry={Math.max(1, h / 2 - 2)}
                        fill={surf.backgroundColor}
                        stroke={surf.borderColor}
                        strokeWidth={2}
                        strokeDasharray="6 4"
                      />
                    ) : (
                      <polygon
                        points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`}
                        fill={surf.backgroundColor}
                        stroke={surf.borderColor}
                        strokeWidth={2}
                        strokeDasharray="6 4"
                      />
                    )}
                  </svg>
                ) : null}
                {w >= 64 && h >= 36 ? (
                  <span className="relative z-10 rounded-md bg-zinc-950/85 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-300 shadow">
                    {Math.max(80, w)} × {Math.max(52, h)}
                  </span>
                ) : null}
              </div>
            )
          })()
        : null}

      {drawingFrameRect
        ? (() => {
            const r = normalizeMarqueeRect(drawingFrameRect.start, drawingFrameRect.current)
            const w = Math.max(40, Math.round(r.w))
            const h = Math.max(32, Math.round(r.h))
            const st = LEVEL_STYLE[drawingFrameRect.level]
            return (
              <div
                style={{ left: r.x, top: r.y, width: w, height: h }}
                className="pointer-events-none absolute z-40 flex flex-col overflow-hidden rounded-3xl border-2 border-dashed border-sky-400/85 bg-zinc-950/45 backdrop-blur-xs"
              >
                <div className={`h-2 w-full ${st.band}`} />
                <div className="flex flex-1 items-center justify-center">
                  <span className="rounded-lg bg-zinc-950/90 px-2 py-1 font-mono text-[11px] font-semibold text-sky-200 shadow">
                    {st.shortLabel} Space · {Math.max(320, w)} × {Math.max(200, h)}
                  </span>
                </div>
              </div>
            )
          })()
        : null}

      {effectiveSelectedIds.length >= 2
        ? (() => {
            let minX = Number.POSITIVE_INFINITY
            let minY = Number.POSITIVE_INFINITY
            let maxX = Number.NEGATIVE_INFINITY
            let maxY = Number.NEGATIVE_INFINITY
            for (const id of effectiveSelectedIds) {
              const b = boxMap.get(id)
              if (b) {
                minX = Math.min(minX, b.x)
                minY = Math.min(minY, b.y)
                maxX = Math.max(maxX, b.x + b.w)
                maxY = Math.max(maxY, b.y + b.h)
              }
            }
            if (!Number.isFinite(minX)) {
              return null
            }
            return (
              <div
                data-multiselect-bounds="true"
                style={{
                  left: minX - 10,
                  top: minY - 10,
                  width: maxX - minX + 20,
                  height: maxY - minY + 20
                }}
                className="pointer-events-none absolute z-20 rounded-2xl border border-dashed border-sky-400/65 bg-sky-400/[0.035]"
              >
                <span className="absolute -top-1.5 -left-1.5 size-2.5 rounded-xs border border-sky-300 bg-zinc-950 shadow" />
                <span className="absolute -top-1.5 -right-1.5 size-2.5 rounded-xs border border-sky-300 bg-zinc-950 shadow" />
                <span className="absolute -bottom-1.5 -left-1.5 size-2.5 rounded-xs border border-sky-300 bg-zinc-950 shadow" />
                <span className="absolute -right-1.5 -bottom-1.5 size-2.5 rounded-xs border border-sky-300 bg-zinc-950 shadow" />
              </div>
            )
          })()
        : null}

      {marqueeRect
        ? (() => {
            const r = normalizeMarqueeRect(marqueeRect.start, marqueeRect.current)
            return (
              <div
                style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                className="pointer-events-none absolute z-40 rounded-sm border border-sky-400 bg-sky-400/12 ring-1 ring-sky-400/25"
              />
            )
          })()
        : null}
    </>
  )
}
