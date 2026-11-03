// WS-0 (TASK_16 wave 2): drag an item out of the bottom dock and drop it on the canvas,
// moved verbatim from space-canvas.tsx. Owner: none.
import type { CanvasCtx } from '../canvas-ctx'
import {
  TOOLBAR_TEXT_PRESETS,
  type ToolbarDockDragOptions,
  type ToolbarDockItemKind
} from '../../whiteboard-toolbar'
import { toCanvas } from '../../core/space'
import { useCallback } from 'react'

export function useDockDrag(ctx: CanvasCtx) {
  const {
    activeFillStyle,
    activeShapeColor,
    activeShapeType,
    activeTextPreset,
    dockNoteColor,
    dockSpaceLevel,
    onAddStickyNote,
    onChangeToolMode,
    onCreateSpaceAt,
    rootRef,
    setActiveFillStyle,
    setActiveShapeColor,
    setActiveShapeType,
    setActiveTextPreset,
    setDockDrag,
    setDockNoteColor,
    setDockSpaceLevel,
    setEditingStickyId,
    setSelectedArrowId,
    setSelectedStickyIds,
    view
  } = ctx
  /** Tactile bottom-dock drag-and-drop for Space frames, Sticky Notes, Geometric Shapes, and Backed-Text Cards. */
  const handleStartDockItemDrag = useCallback(
    (
      kind: ToolbarDockItemKind,
      event: React.PointerEvent,
      options: ToolbarDockDragOptions = {}
    ): void => {
      if (event.button !== 0) {
        return
      }
      const origin = { x: event.clientX, y: event.clientY }
      let dragged = false

      const cleanup = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
      }

      const onMove = (move: PointerEvent): void => {
        if (!dragged && Math.hypot(move.clientX - origin.x, move.clientY - origin.y) >= 4) {
          dragged = true
        }
        if (dragged) {
          setDockDrag({
            kind,
            options,
            clientX: move.clientX,
            clientY: move.clientY
          })
        }
      }

      const onUp = (up: PointerEvent): void => {
        cleanup()
        setDockDrag(null)
        if (!dragged) {
          return
        }
        const stack = document.elementsFromPoint(up.clientX, up.clientY)
        const overDock = stack.some((el) => el.hasAttribute('data-space-dock'))
        const overCanvas = stack.some((el) => el.hasAttribute('data-space-canvas'))
        if (!overCanvas || overDock) {
          return
        }
        const rect = rootRef.current?.getBoundingClientRect()
        const pt = rect
          ? toCanvas({ x: up.clientX - rect.left, y: up.clientY - rect.top }, view)
          : { x: 160, y: 120 }
        setSelectedArrowId(null)

        if (kind === 'space') {
          const lvl = options.spaceLevel ?? dockSpaceLevel
          setDockSpaceLevel(lvl)
          onCreateSpaceAt?.(lvl, {
            x: Math.round(pt.x - 170),
            y: Math.round(pt.y - 110),
            w: 340,
            h: 220
          })
        } else if (kind === 'note') {
          const color = options.color ?? dockNoteColor
          setDockNoteColor(color)
          const createdId = onAddStickyNote?.(
            { x: Math.round(pt.x - 110), y: Math.round(pt.y - 70) },
            color,
            'note',
            '',
            {
              fillStyle: options.fillStyle ?? 'soft',
              borderStyle: 'solid'
            }
          )
          if (typeof createdId === 'string') {
            setSelectedStickyIds([createdId])
            setEditingStickyId(createdId)
          }
        } else if (kind === 'shape') {
          const shapeType = options.shapeType ?? activeShapeType
          const color = options.color ?? activeShapeColor
          const fillStyle = options.fillStyle ?? activeFillStyle
          setActiveShapeType(shapeType)
          setActiveShapeColor(color)
          setActiveFillStyle(fillStyle)
          const isSym = shapeType === 'ellipse' || shapeType === 'diamond'
          const w = isSym ? 150 : 196
          const h = isSym ? 150 : 96
          const createdId = onAddStickyNote?.(
            { x: Math.round(pt.x - w / 2), y: Math.round(pt.y - h / 2) },
            color,
            'shape',
            '',
            {
              w,
              h,
              shapeType,
              fillStyle,
              borderStyle: options.borderStyle ?? 'solid',
              textAlign: 'center',
              fontSize: options.fontSize ?? 16
            }
          )
          if (typeof createdId === 'string') {
            setSelectedStickyIds([createdId])
            setEditingStickyId(createdId)
          }
        } else if (kind === 'text-card') {
          const preset =
            TOOLBAR_TEXT_PRESETS.find(
              (p) => p.id === (options.textCardPreset ?? activeTextPreset)
            ) ?? TOOLBAR_TEXT_PRESETS[0]!
          if (options.textCardPreset) {
            setActiveTextPreset(options.textCardPreset)
          }
          const fillStyle = options.fillStyle ?? preset.fillStyle
          const borderStyle = options.borderStyle ?? preset.borderStyle
          const color = options.color ?? preset.color
          const fontFamily = options.fontFamily ?? preset.fontFamily
          const fontSize = options.fontSize ?? preset.fontSize
          const bold = options.bold ?? preset.bold
          const createdId = onAddStickyNote?.(
            { x: Math.round(pt.x - 76), y: Math.round(pt.y - 26) },
            color,
            'text',
            '',
            {
              fillStyle,
              borderStyle,
              fontFamily,
              fontSize,
              fontWeight: bold ? 'bold' : 'normal',
              textAlign: 'left',
              autosize: true
            }
          )
          if (typeof createdId === 'string') {
            setSelectedStickyIds([createdId])
            setEditingStickyId(createdId)
          }
        }
        onChangeToolMode?.('select')
      }

      const onCancel = (): void => {
        cleanup()
        setDockDrag(null)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
    },
    [
      activeFillStyle,
      activeShapeColor,
      activeShapeType,
      activeTextPreset,
      dockNoteColor,
      dockSpaceLevel,
      onAddStickyNote,
      onChangeToolMode,
      onCreateSpaceAt,
      rootRef,
      setActiveFillStyle,
      setActiveShapeColor,
      setActiveShapeType,
      setActiveTextPreset,
      setDockDrag,
      setDockNoteColor,
      setDockSpaceLevel,
      setEditingStickyId,
      setSelectedArrowId,
      setSelectedStickyIds,
      view
    ]
  )
  return {
    handleStartDockItemDrag
  }
}

export type DockDrag = ReturnType<typeof useDockDrag>
