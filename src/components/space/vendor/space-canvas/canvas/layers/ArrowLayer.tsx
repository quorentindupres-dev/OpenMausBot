// WS-0 (TASK_16 wave 2): arrow SVG layer (paths, bend + endpoint handles, draw preview): the first
// arrows.map block, moved verbatim from space-canvas.tsx. Labels: ArrowLabelLayer.tsx. Owner: WS-C (skips hidden arrows).
import type { CanvasCtx, CanvasHandlers } from '../canvas-ctx'
import { DEFAULT_ARROW_STROKE } from '../canvas-ctx'
import { STICKY_COLORS, STICKY_COLOR_STYLE, resolveArrowPathAndHandles } from '../../core/space'
import { hiddenIds, isArrowHidden } from '../../core/whiteboard-groups'
import { useMemo } from 'react'

export function ArrowSvgLayer({
  ctx,
  g
}: {
  ctx: CanvasCtx
  g: CanvasHandlers
}): React.JSX.Element {
  const {
    activeArrowDash,
    activeArrowRouting,
    arrows,
    bendingArrow,
    boxMap,
    drawingArrow,
    hoveredArrowId,
    onUpdateArrow,
    reconnectingArrow,
    selectedArrowId,
    setArrowLabelDraft,
    setEditingArrowId,
    setHoveredArrowId,
    setSelectedArrowId,
    setSelectedStickyIds,
    toolMode
  } = ctx
  // WS-C: hidden arrows, and arrows that end on a hidden sticky, are not drawn.
  const hiddenStickyIds = useMemo(() => hiddenIds(ctx.stickies), [ctx.stickies])
  const { startArrowBendDrag, startArrowEndpointDrag, startEraserSwipe } = g
  const previewGeometry = drawingArrow
    ? resolveArrowPathAndHandles(
        {
          fromId: drawingArrow.fromId,
          toId: drawingArrow.toId,
          fromPoint: drawingArrow.fromPoint,
          toPoint: drawingArrow.currentPoint,
          routing: activeArrowRouting
        },
        boxMap,
        activeArrowRouting
      )
    : null
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      width="1"
      height="1"
    >
      <defs>
        <marker
          id="orca-space-arrowhead-default"
          markerWidth="10"
          markerHeight="8"
          refX="9.2"
          refY="4"
          orient="auto"
        >
          <path d="M0,0.5 L10,4 L0,7.5 Z" fill={DEFAULT_ARROW_STROKE} />
        </marker>
        {STICKY_COLORS.map((c) => (
          <marker
            key={c}
            id={`orca-space-arrowhead-${c}`}
            markerWidth="10"
            markerHeight="8"
            refX="9.2"
            refY="4"
            orient="auto"
          >
            <path d="M0,0.5 L10,4 L0,7.5 Z" fill={STICKY_COLOR_STYLE[c].stroke} />
          </marker>
        ))}
      </defs>
      {arrows.map((arrow) => {
        if (isArrowHidden(arrow, hiddenStickyIds)) {
          return null
        }
        const withBend =
          bendingArrow && bendingArrow.arrowId === arrow.id
            ? { ...arrow, bend: bendingArrow.bend }
            : arrow
        const effectiveArrow =
          reconnectingArrow && reconnectingArrow.arrowId === arrow.id
            ? reconnectingArrow.end === 'from'
              ? {
                  ...withBend,
                  fromId: reconnectingArrow.snapId,
                  fromPoint: reconnectingArrow.point
                }
              : {
                  ...withBend,
                  toId: reconnectingArrow.snapId,
                  toPoint: reconnectingArrow.point
                }
            : withBend
        const geom = resolveArrowPathAndHandles(effectiveArrow, boxMap)
        if (!geom) {
          return null
        }
        const colorKey = arrow.color && STICKY_COLOR_STYLE[arrow.color] ? arrow.color : null
        const stroke = colorKey ? STICKY_COLOR_STYLE[colorKey].stroke : DEFAULT_ARROW_STROKE
        const markerId = colorKey
          ? `orca-space-arrowhead-${colorKey}`
          : 'orca-space-arrowhead-default'
        const isSelected = selectedArrowId === arrow.id
        const isHovered = hoveredArrowId === arrow.id
        const dashPattern = arrow.dash === 'dashed' ? '8 6' : isSelected ? '7 4' : undefined
        return (
          <g
            key={arrow.id}
            data-space-arrow={arrow.id}
            onMouseEnter={() => setHoveredArrowId(arrow.id)}
            onMouseLeave={() => setHoveredArrowId((cur) => (cur === arrow.id ? null : cur))}
          >
            <path
              d={geom.path}
              fill="none"
              stroke="transparent"
              strokeWidth={28}
              className="pointer-events-auto cursor-pointer"
              onPointerDown={(event) => {
                if (toolMode === 'eraser') {
                  startEraserSwipe(event)
                  return
                }
                event.stopPropagation()
                setSelectedArrowId(arrow.id)
                setSelectedStickyIds([])
              }}
              onClick={(event) => {
                event.stopPropagation()
                setSelectedArrowId(arrow.id)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                setSelectedArrowId(arrow.id)
                setEditingArrowId(arrow.id)
                setArrowLabelDraft(arrow.label ?? '')
              }}
            />
            <path
              d={geom.path}
              fill="none"
              stroke={stroke}
              strokeWidth={isSelected ? 4 : isHovered ? 3.5 : 2.75}
              strokeDasharray={dashPattern}
              markerEnd={`url(#${markerId})`}
            />
            {/* Quickdraw midpoint bend diamond handle: drag perpendicular to bend arc, double-click to straighten */}
            {isSelected || isHovered || (bendingArrow && bendingArrow.arrowId === arrow.id) ? (
              <g
                className="pointer-events-auto cursor-grab active:cursor-grabbing"
                onPointerDown={startArrowBendDrag(arrow, geom.start, geom.end)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  onUpdateArrow?.(arrow.id, { bend: undefined })
                }}
              >
                <title>Drag to bend arrow curve · Double-click to reset</title>
                <circle cx={geom.bendHandle.x} cy={geom.bendHandle.y} r={14} fill="transparent" />
                <rect
                  x={geom.bendHandle.x - 5.5}
                  y={geom.bendHandle.y - 5.5}
                  width={11}
                  height={11}
                  rx={2.5}
                  transform={`rotate(45 ${geom.bendHandle.x} ${geom.bendHandle.y})`}
                  fill="#09090b"
                  stroke={stroke}
                  strokeWidth={2.5}
                />
              </g>
            ) : null}
            {/* Draggable Endpoint Hit-Targets (always active) + Visible Handles on hover/select/arrow-tool */}
            <g
              className="pointer-events-auto cursor-grab active:cursor-grabbing"
              onPointerDown={startArrowEndpointDrag(arrow, 'from')}
            >
              <title>Drag to move arrow start to another Space, Shape, Note, Text, or point</title>
              <circle cx={geom.start.x} cy={geom.start.y} r={18} fill="transparent" />
              {isSelected || isHovered || toolMode === 'arrow' ? (
                <circle
                  cx={geom.start.x}
                  cy={geom.start.y}
                  r={isSelected || isHovered ? 8.5 : 5}
                  fill="#09090b"
                  stroke={stroke}
                  strokeWidth={isSelected || isHovered ? 2.75 : 2}
                />
              ) : null}
            </g>
            <g
              className="pointer-events-auto cursor-grab active:cursor-grabbing"
              onPointerDown={startArrowEndpointDrag(arrow, 'to')}
            >
              <title>Drag to move arrow tip to another Space, Shape, Note, Text, or point</title>
              <circle cx={geom.end.x} cy={geom.end.y} r={18} fill="transparent" />
              {isSelected || isHovered || toolMode === 'arrow' ? (
                <circle
                  cx={geom.end.x}
                  cy={geom.end.y}
                  r={isSelected || isHovered ? 8.5 : 5}
                  fill={stroke}
                  stroke="#09090b"
                  strokeWidth={isSelected || isHovered ? 2.5 : 1.5}
                />
              ) : null}
            </g>
          </g>
        )
      })}
      {previewGeometry ? (
        <path
          d={previewGeometry.path}
          fill="none"
          stroke={DEFAULT_ARROW_STROKE}
          strokeWidth={3}
          strokeDasharray={activeArrowDash === 'dashed' ? '8 6' : '6 4'}
          markerEnd="url(#orca-space-arrowhead-default)"
        />
      ) : null}
    </svg>
  )
}
