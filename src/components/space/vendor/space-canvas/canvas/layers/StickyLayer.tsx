// WS-0 (TASK_16 wave 2): notes, shapes and text cards (sortedStickies.map), moved verbatim from
// space-canvas.tsx. Owner: WS-C (hidden / groupId / name / opacity land here).
// WS-C: hidden stickies are skipped, `opacity` is applied, a double-click enters a group (gestures).
import type { CanvasCtx, CanvasHandlers } from '../canvas-ctx'
import { QuickConnectPorts } from '../canvas-parts'
import {
  STICKY_COLOR_STYLE,
  type SpaceStickyNote,
  type StickyColor,
  resolveWhiteboardSurfaceStyle
} from '../../core/space'
import { isImeOwnedKeyboardEvent } from '../../core/ime-guard'
import { Lock } from 'lucide-react'

/** WS-C: `data-whiteboard-group` only on grouped stickies (old boards render the same DOM). */
function layerAttrs(sticky: SpaceStickyNote): Record<string, string> {
  return sticky.groupId ? { 'data-whiteboard-group': sticky.groupId } : {}
}

/** WS-C: the layer opacity (0–1); absent = no style key at all. */
function opacityStyle(sticky: SpaceStickyNote): React.CSSProperties {
  return sticky.opacity !== undefined ? { opacity: sticky.opacity } : {}
}

export function StickyLayer({ ctx, g }: { ctx: CanvasCtx; g: CanvasHandlers }): React.JSX.Element {
  const {
    arrowSnapTargetId,
    boxMap,
    editingStickyId,
    onUpdateStickyNote,
    selectedStickyIdSet,
    sortedStickies,
    stickyOffset,
    stickySizeOverride
  } = ctx
  const {
    startArrowDrag,
    commitStickyEdit,
    handleStickyTextareaBlur,
    onStickyDoubleClick,
    startStickyDrag,
    startStickyResize
  } = g
  return (
    <>
      {sortedStickies.map((sticky) => {
        // WS-C: a hidden sticky is not drawn (no DOM = no hit-test); it stays in the layers panel.
        if (sticky.hidden) {
          return null
        }
        const offset = stickyOffset[sticky.id]
        const sizeOvr = stickySizeOverride[sticky.id]
        const kind = sticky.kind ?? 'note'
        const isSelected = selectedStickyIdSet.has(sticky.id)
        const isEditing = editingStickyId === sticky.id && !sticky.locked
        const isArrowTarget = arrowSnapTargetId === sticky.id
        const colorKey: StickyColor =
          sticky.color && STICKY_COLOR_STYLE[sticky.color] ? sticky.color : 'amber'
        const box = boxMap.get(sticky.id)
        const effectiveW = box?.w ?? (sticky.w || 220)
        const effectiveH = box?.h ?? (sticky.h || 140)
        const fontClass =
          sticky.fontFamily === 'serif'
            ? 'font-serif'
            : sticky.fontFamily === 'mono'
              ? 'font-mono'
              : 'font-sans'
        const defaultAlign = kind === 'shape' ? 'center' : 'left'
        const effectiveAlign = sticky.textAlign ?? defaultAlign
        const alignClass =
          effectiveAlign === 'center'
            ? 'text-center'
            : effectiveAlign === 'right'
              ? 'text-right'
              : 'text-left'

        if (kind === 'shape') {
          const shapeType = sticky.shapeType ?? 'rounded'
          const effectiveFontSize = sizeOvr?.fontSize ?? sticky.fontSize ?? 16
          const effectiveWeight = sticky.fontWeight ?? 'semibold'
          const weightClass =
            effectiveWeight === 'bold'
              ? 'font-bold'
              : effectiveWeight === 'semibold'
                ? 'font-semibold'
                : 'font-normal'
          const surface = resolveWhiteboardSurfaceStyle({
            kind: 'shape',
            color: colorKey,
            fillStyle: sticky.fillStyle ?? 'soft',
            borderStyle: sticky.borderStyle ?? 'solid'
          })
          const isSvgShape = shapeType === 'ellipse' || shapeType === 'diamond'
          const shapeRadiusClass =
            shapeType === 'pill'
              ? 'rounded-full'
              : shapeType === 'rect'
                ? 'rounded-md'
                : 'rounded-2xl'
          const padClass =
            shapeType === 'diamond'
              ? 'px-7 py-5'
              : shapeType === 'ellipse'
                ? 'px-5 py-4'
                : shapeType === 'pill'
                  ? 'px-5 py-2.5'
                  : 'px-3.5 py-2.5'

          return (
            <div
              key={sticky.id}
              data-space-sticky={sticky.id}
              data-whiteboard-shape={shapeType}
              {...layerAttrs(sticky)}
              onPointerDown={startStickyDrag(sticky)}
              onDoubleClick={onStickyDoubleClick(sticky)}
              style={{
                ...opacityStyle(sticky),
                left: sticky.x + (offset?.x ?? 0),
                top: sticky.y + (offset?.y ?? 0),
                width: effectiveW,
                minHeight: effectiveH,
                color: surface.textColor,
                ...(!isSvgShape
                  ? {
                      backgroundColor: surface.backgroundColor,
                      borderColor: surface.borderColor,
                      borderWidth: surface.borderStyle === 'none' ? 0 : 2,
                      borderStyle: surface.borderStyle === 'dashed' ? 'dashed' : 'solid'
                    }
                  : {})
              }}
              className={`pointer-events-auto group/shape absolute z-10 flex flex-col justify-center overflow-visible transition-shadow ${
                isSvgShape ? 'rounded-xl' : `${shapeRadiusClass} shadow-lg`
              } ${!isSvgShape && surface.backdropBlur ? 'backdrop-blur-md' : ''} ${
                sticky.locked
                  ? 'cursor-default'
                  : isEditing
                    ? 'cursor-text'
                    : 'cursor-grab active:cursor-grabbing'
              } ${
                isArrowTarget
                  ? 'ring-2 ring-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.45)]'
                  : isEditing
                    ? 'ring-2 ring-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.28)]'
                    : isSelected
                      ? 'ring-2 ring-sky-400/90'
                      : ''
              }`}
            >
              {isSvgShape ? (
                <svg
                  viewBox={`0 0 ${effectiveW} ${effectiveH}`}
                  className="pointer-events-none absolute inset-0 size-full overflow-visible drop-shadow-lg"
                  aria-hidden="true"
                >
                  {shapeType === 'ellipse' ? (
                    <ellipse
                      cx={effectiveW / 2}
                      cy={effectiveH / 2}
                      rx={Math.max(2, effectiveW / 2 - 2)}
                      ry={Math.max(2, effectiveH / 2 - 2)}
                      fill={surface.backgroundColor}
                      stroke={surface.borderStyle === 'none' ? 'transparent' : surface.borderColor}
                      strokeWidth={surface.borderStyle === 'none' ? 0 : 2}
                      strokeDasharray={surface.borderStyle === 'dashed' ? '7 5' : undefined}
                    />
                  ) : (
                    <polygon
                      points={`${effectiveW / 2},2 ${effectiveW - 2},${effectiveH / 2} ${effectiveW / 2},${effectiveH - 2} 2,${effectiveH / 2}`}
                      strokeLinejoin="round"
                      fill={surface.backgroundColor}
                      stroke={surface.borderStyle === 'none' ? 'transparent' : surface.borderColor}
                      strokeWidth={surface.borderStyle === 'none' ? 0 : 2}
                      strokeDasharray={surface.borderStyle === 'dashed' ? '7 5' : undefined}
                    />
                  )}
                </svg>
              ) : null}

              {sticky.locked ? (
                <span
                  title="Locked"
                  className="pointer-events-none absolute top-1.5 right-1.5 z-20 flex size-5 items-center justify-center rounded-full bg-zinc-950/80 text-amber-300 shadow"
                >
                  <Lock className="size-3" />
                </span>
              ) : null}

              <QuickConnectPorts
                visible={isSelected && !isEditing}
                hoverClass="group-hover/shape:opacity-85"
                onStartArrow={(event) => startArrowDrag(event, sticky.id)}
              />

              <div
                className={`relative z-10 flex w-full flex-1 items-center justify-center ${padClass}`}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={sticky.text}
                    rows={Math.max(1, sticky.text.split('\n').length)}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => handleStickyTextareaBlur(sticky, event)}
                    onKeyDown={(event) => {
                      if (isImeOwnedKeyboardEvent(event)) {
                        return
                      }
                      if (
                        event.key === 'Escape' ||
                        (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
                      ) {
                        event.preventDefault()
                        commitStickyEdit(sticky)
                      }
                    }}
                    onChange={(event) =>
                      onUpdateStickyNote?.(sticky.id, { text: event.target.value })
                    }
                    placeholder="Type label…"
                    style={{
                      fontSize: `${effectiveFontSize}px`,
                      lineHeight: 1.28,
                      color: surface.textColor
                    }}
                    className={`w-full resize-none rounded-lg bg-transparent caret-sky-400 outline-none selection:bg-sky-400/35 ${fontClass} ${weightClass} ${alignClass}`}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: `${effectiveFontSize}px`,
                      lineHeight: 1.28,
                      color: surface.textColor
                    }}
                    className={`pointer-events-none w-full whitespace-pre-wrap break-words ${fontClass} ${weightClass} ${alignClass}`}
                  >
                    {sticky.text ||
                      (isSelected ? (
                        <span
                          style={{ color: surface.placeholderColor }}
                          className="text-xs font-normal"
                        >
                          Double-click or press Enter to label…
                        </span>
                      ) : null)}
                  </div>
                )}
              </div>

              {!sticky.locked ? (
                <>
                  <div
                    data-sticky-resize="true"
                    title="Drag right edge to widen shape"
                    onPointerDown={startStickyResize(sticky, 'e')}
                    className="absolute top-3 bottom-5 -right-1 z-20 w-2.5 cursor-ew-resize"
                  />
                  <div
                    data-sticky-resize="true"
                    title="Drag bottom edge to resize shape height"
                    onPointerDown={startStickyResize(sticky, 's')}
                    className="absolute right-5 -bottom-1 left-3 z-20 h-2.5 cursor-ns-resize"
                  />
                  <div
                    data-sticky-resize="true"
                    title="Drag corner to resize shape (hold Shift for aspect lock)"
                    onPointerDown={startStickyResize(sticky, 'se')}
                    className={`absolute -right-2 -bottom-2 z-20 flex size-6 cursor-nwse-resize items-center justify-center rounded-lg border text-[11px] font-bold shadow-md transition ${
                      isSelected || isEditing
                        ? 'border-sky-300 bg-sky-500 text-zinc-950 opacity-100 hover:scale-110'
                        : 'border-white/20 bg-zinc-900/90 text-zinc-200 opacity-0 group-hover/shape:opacity-100 hover:border-sky-400'
                    }`}
                  >
                    ↘
                  </div>
                </>
              ) : null}
            </div>
          )
        }

        if (kind === 'text') {
          const hasBg = Boolean(sticky.fillStyle && sticky.fillStyle !== 'none')
          const effectiveFontSize = sizeOvr?.fontSize ?? sticky.fontSize ?? (hasBg ? 18 : 36)
          const effectiveWeight = sticky.fontWeight ?? (hasBg ? 'semibold' : 'bold')
          const weightClass =
            effectiveWeight === 'bold'
              ? 'font-bold'
              : effectiveWeight === 'semibold'
                ? 'font-semibold'
                : 'font-normal'
          const surface = resolveWhiteboardSurfaceStyle({
            kind: 'text',
            color: colorKey,
            fillStyle: sticky.fillStyle ?? 'none',
            borderStyle: sticky.borderStyle ?? (hasBg ? 'solid' : 'none')
          })

          return (
            <div
              key={sticky.id}
              data-space-sticky={sticky.id}
              {...layerAttrs(sticky)}
              onPointerDown={startStickyDrag(sticky)}
              onDoubleClick={onStickyDoubleClick(sticky)}
              style={{
                ...opacityStyle(sticky),
                left: sticky.x + (offset?.x ?? 0),
                top: sticky.y + (offset?.y ?? 0),
                width: effectiveW,
                minHeight: effectiveH,
                color: surface.textColor,
                ...(hasBg
                  ? {
                      backgroundColor: surface.backgroundColor,
                      borderColor: surface.borderColor,
                      borderWidth: surface.borderStyle === 'none' ? 0 : 2,
                      borderStyle: surface.borderStyle === 'dashed' ? 'dashed' : 'solid'
                    }
                  : {})
              }}
              className={`pointer-events-auto group/text absolute z-10 flex flex-col justify-center transition ${
                hasBg ? 'rounded-xl shadow-lg' : 'rounded-2xl'
              } ${hasBg && surface.backdropBlur ? 'backdrop-blur-md' : ''} ${
                sticky.locked
                  ? 'cursor-default'
                  : isEditing
                    ? 'cursor-text'
                    : 'cursor-grab active:cursor-grabbing'
              } ${
                isArrowTarget
                  ? 'ring-2 ring-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.45)]'
                  : hasBg
                    ? isSelected || isEditing
                      ? 'ring-2 ring-sky-400/90'
                      : ''
                    : isSelected || isEditing
                      ? 'border-2 border-dashed border-sky-400/80 bg-zinc-900/45 shadow-lg'
                      : 'border-2 border-transparent hover:border-dashed hover:border-white/30'
              }`}
            >
              {sticky.locked ? (
                <span
                  title="Locked"
                  className="pointer-events-none absolute top-1 right-1 z-20 flex size-5 items-center justify-center rounded-full bg-zinc-950/80 text-amber-300 shadow"
                >
                  <Lock className="size-3" />
                </span>
              ) : null}

              <QuickConnectPorts
                visible={isSelected && !isEditing}
                hoverClass="group-hover/text:opacity-85"
                onStartArrow={(event) => startArrowDrag(event, sticky.id)}
              />

              {isEditing ? (
                <textarea
                  autoFocus
                  value={sticky.text}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={(event) => handleStickyTextareaBlur(sticky, event)}
                  onKeyDown={(event) => {
                    if (isImeOwnedKeyboardEvent(event)) {
                      return
                    }
                    if (
                      event.key === 'Escape' ||
                      (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
                    ) {
                      event.preventDefault()
                      commitStickyEdit(sticky)
                    }
                  }}
                  onChange={(event) =>
                    onUpdateStickyNote?.(sticky.id, { text: event.target.value })
                  }
                  placeholder="Write something…"
                  style={{
                    fontSize: `${effectiveFontSize}px`,
                    lineHeight: 1.2,
                    color: surface.textColor
                  }}
                  className={`w-full flex-1 resize-none bg-transparent outline-none ${
                    hasBg ? 'px-4 py-2.5' : 'p-2.5'
                  } ${fontClass} ${weightClass} ${alignClass}`}
                />
              ) : (
                <div
                  style={{
                    fontSize: `${effectiveFontSize}px`,
                    lineHeight: 1.2,
                    color: surface.textColor
                  }}
                  className={`pointer-events-none w-full flex-1 whitespace-pre-wrap break-words ${
                    hasBg ? 'px-4 py-2.5' : 'p-2.5'
                  } ${fontClass} ${weightClass} ${alignClass}`}
                >
                  {sticky.text || (
                    <span style={{ color: surface.placeholderColor }}>Write something…</span>
                  )}
                </div>
              )}

              {!sticky.locked ? (
                <>
                  <div
                    data-sticky-resize="true"
                    title="Drag right edge to adjust text width"
                    onPointerDown={startStickyResize(sticky, 'width')}
                    className={`absolute top-2.5 bottom-6 -right-1.5 flex w-3 cursor-ew-resize items-center justify-center rounded-full transition ${
                      isSelected || isEditing
                        ? 'bg-sky-400/55 opacity-100 hover:bg-sky-400'
                        : 'bg-white/25 opacity-0 group-hover/text:opacity-75 hover:bg-sky-400'
                    }`}
                  />
                  <div
                    data-sticky-resize="true"
                    title="Drag corner to scale text size"
                    onPointerDown={startStickyResize(sticky, 'scale')}
                    className={`absolute -right-2 -bottom-2 flex size-6 cursor-nwse-resize items-center justify-center rounded-lg border text-[11px] font-bold shadow-md transition ${
                      isSelected || isEditing
                        ? 'border-sky-300 bg-sky-500 text-zinc-950 opacity-100 hover:scale-110'
                        : 'border-white/20 bg-zinc-900/90 text-zinc-200 opacity-0 group-hover/text:opacity-100 hover:border-sky-400'
                    }`}
                  >
                    ↘
                  </div>
                </>
              ) : null}
            </div>
          )
        }

        // Sleek AFFiNE Sticky Note card (`kind === 'note'`) — zero inline button clutter; floating inspector handles controls
        const effectiveFontSize = sizeOvr?.fontSize ?? sticky.fontSize ?? 14
        const effectiveWeight = sticky.fontWeight ?? 'normal'
        const weightClass =
          effectiveWeight === 'bold'
            ? 'font-bold'
            : effectiveWeight === 'semibold'
              ? 'font-semibold'
              : 'font-normal'
        const surface = resolveWhiteboardSurfaceStyle({
          kind: 'note',
          color: colorKey,
          fillStyle: sticky.fillStyle ?? 'soft',
          borderStyle: sticky.borderStyle ?? 'solid'
        })

        return (
          <div
            key={sticky.id}
            data-space-sticky={sticky.id}
            {...layerAttrs(sticky)}
            onPointerDown={startStickyDrag(sticky)}
            onDoubleClick={onStickyDoubleClick(sticky)}
            style={{
              ...opacityStyle(sticky),
              left: sticky.x + (offset?.x ?? 0),
              top: sticky.y + (offset?.y ?? 0),
              width: effectiveW,
              minHeight: effectiveH,
              backgroundColor: surface.backgroundColor,
              borderColor: surface.borderColor,
              borderWidth: surface.borderStyle === 'none' ? 0 : 1.5,
              borderStyle: surface.borderStyle === 'dashed' ? 'dashed' : 'solid',
              color: surface.textColor
            }}
            className={`pointer-events-auto group/sticky absolute z-10 flex flex-col overflow-visible rounded-2xl shadow-xl transition-shadow ${
              surface.backdropBlur ? 'backdrop-blur-md' : ''
            } ${
              sticky.locked
                ? 'cursor-default'
                : isEditing
                  ? 'cursor-text'
                  : 'cursor-grab active:cursor-grabbing'
            } ${
              isArrowTarget
                ? 'ring-2 ring-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.45)]'
                : isSelected
                  ? 'ring-2 ring-sky-400/90'
                  : ''
            }`}
          >
            {/* Minimal top accent strip */}
            <div className="flex h-3 w-full items-center justify-between rounded-t-2xl px-2.5 pt-1">
              <span
                style={{ backgroundColor: surface.accentHex }}
                className="h-1 w-8 rounded-full opacity-55"
              />
              {sticky.locked ? <Lock className="size-3 text-amber-400" /> : null}
            </div>

            <QuickConnectPorts
              visible={isSelected && !isEditing}
              hoverClass="group-hover/sticky:opacity-85"
              onStartArrow={(event) => startArrowDrag(event, sticky.id)}
            />

            {isEditing ? (
              <textarea
                autoFocus
                value={sticky.text}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onBlur={(event) => handleStickyTextareaBlur(sticky, event)}
                onKeyDown={(event) => {
                  if (isImeOwnedKeyboardEvent(event)) {
                    return
                  }
                  if (
                    event.key === 'Escape' ||
                    (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
                  ) {
                    event.preventDefault()
                    commitStickyEdit(sticky)
                  }
                }}
                onChange={(event) => onUpdateStickyNote?.(sticky.id, { text: event.target.value })}
                placeholder="Write a note…"
                style={{
                  fontSize: `${effectiveFontSize}px`,
                  height: effectiveH - 22,
                  color: surface.textColor
                }}
                className={`min-h-[84px] w-full flex-1 resize-none bg-transparent px-3.5 py-2.5 leading-relaxed outline-none ${fontClass} ${weightClass} ${alignClass}`}
              />
            ) : (
              <div
                style={{
                  fontSize: `${effectiveFontSize}px`,
                  minHeight: effectiveH - 22,
                  color: surface.textColor
                }}
                className={`pointer-events-none w-full flex-1 whitespace-pre-wrap break-words px-3.5 py-2.5 leading-relaxed ${fontClass} ${weightClass} ${alignClass}`}
              >
                {sticky.text || (
                  <span style={{ color: surface.placeholderColor }}>Double-click to write…</span>
                )}
              </div>
            )}

            {/* Subtle AFFiNE folded paper corner */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-0 bottom-0 size-3.5 rounded-tl-md rounded-br-2xl bg-black/14"
            />

            {!sticky.locked ? (
              <>
                <div
                  data-sticky-resize="true"
                  title="Drag right edge to widen sticky note"
                  onPointerDown={startStickyResize(sticky, 'e')}
                  className="absolute top-4 bottom-6 -right-1 w-2.5 cursor-ew-resize"
                />
                <div
                  data-sticky-resize="true"
                  title="Drag bottom edge to lengthen sticky note"
                  onPointerDown={startStickyResize(sticky, 's')}
                  className="absolute right-6 -bottom-1 left-3 h-2.5 cursor-ns-resize"
                />
                <div
                  data-sticky-resize="true"
                  title="Drag corner to resize sticky note"
                  onPointerDown={startStickyResize(sticky, 'se')}
                  className={`absolute right-1 bottom-1 flex size-6 cursor-nwse-resize items-center justify-center rounded-lg text-[11px] transition ${
                    isSelected || isEditing
                      ? 'bg-sky-500 text-zinc-950 opacity-100'
                      : 'bg-black/20 text-current opacity-0 group-hover/sticky:opacity-80 hover:opacity-100'
                  }`}
                >
                  ↘
                </div>
              </>
            ) : null}
          </div>
        )
      })}
    </>
  )
}
