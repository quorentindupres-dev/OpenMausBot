// WS-0 (TASK_16 wave 2): SpaceCanvas local state + refs, moved verbatim from space-canvas.tsx.
// Owner: WS-A (with canvas-ctx.ts). One memoised object, so the canvas context stays stable when nothing changed.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SPACE_EMOJI_CATEGORIES,
  ZOOM_TWEEN_MS,
  type Point,
  type SpaceLevel,
  type StickyColor,
  type View,
  type WhiteboardArrowRouting,
  type WhiteboardFillStyle
} from '../core/space'
import type {
  ToolbarDockDragOptions,
  ToolbarDockItemKind,
  ToolbarShapeType,
  ToolbarTextCardPresetId
} from '../whiteboard-toolbar'
import type { NodeBoxOverride } from '../nodes/CanvasNodeLayer'
import type { PendingA01Spawn } from '../nodes/A01SpawnPopover'
import { usePrefersReducedMotion } from './canvas-parts'
import { useClipboardBuffer } from './selection/use-clipboard'

export function useCanvasState() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const emojiFileInputRef = useRef<HTMLInputElement | null>(null)
  const [view, setView] = useState<View>({ x: 32, y: 24, scale: 1 })
  const reducedMotion = usePrefersReducedMotion()
  const [zoomTweening, setZoomTweening] = useState(false)
  // U-37: the last Fit showed only the Spaces with members, so the rest may be off screen (edge cue).
  const [fitPartial, setFitPartial] = useState(false)
  const zoomTweenTimerRef = useRef<number | null>(null)
  const markZoomTween = useCallback((): void => {
    if (reducedMotion || typeof window === 'undefined') {
      return
    }
    setZoomTweening(true)
    if (zoomTweenTimerRef.current !== null) {
      window.clearTimeout(zoomTweenTimerRef.current)
    }
    zoomTweenTimerRef.current = window.setTimeout(() => {
      zoomTweenTimerRef.current = null
      setZoomTweening(false)
    }, ZOOM_TWEEN_MS)
  }, [reducedMotion])
  useEffect(() => {
    return () => {
      if (zoomTweenTimerRef.current !== null) {
        window.clearTimeout(zoomTweenTimerRef.current)
        zoomTweenTimerRef.current = null
      }
    }
  }, [])
  const [panning, setPanning] = useState(false)
  const [tileOffset, setTileOffset] = useState<Record<string, Point>>({})
  const [tileSizeOverride, setTileSizeOverride] = useState<
    Record<string, { w: number; h: number }>
  >({})
  const [stickyOffset, setStickyOffset] = useState<Record<string, Point>>({})
  const [stickySizeOverride, setStickySizeOverride] = useState<
    Record<string, { w: number; h: number; fontSize?: number }>
  >({})
  const [selectedStickyIds, setSelectedStickyIds] = useState<string[]>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [nodeOffset, setNodeOffset] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [multiNodeDragDelta, setMultiNodeDragDelta] = useState<Point | null>(null)
  const [nodeSizeOverride, setNodeSizeOverride] = useState<NodeBoxOverride | null>(null)
  const [rosterDrawerOpen, setRosterDrawerOpen] = useState(false)
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false)
  const [pendingA01Spawn, setPendingA01Spawn] = useState<PendingA01Spawn | null>(null)
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null)
  const [emojiPickerGoalId, setEmojiPickerGoalId] = useState<string | null>(null)
  const [emojiCategoryTab, setEmojiCategoryTab] = useState<string>(SPACE_EMOJI_CATEGORIES[0]!.id)
  const [levelPickerGoalId, setLevelPickerGoalId] = useState<string | null>(null)
  const [imageDropGoalId, setImageDropGoalId] = useState<string | null>(null)
  const [customEmojiDraft, setCustomEmojiDraft] = useState('')
  const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null)
  const [hoveredArrowId, setHoveredArrowId] = useState<string | null>(null)
  const [editingArrowId, setEditingArrowId] = useState<string | null>(null)
  const [arrowLabelDraft, setArrowLabelDraft] = useState('')
  const [arrowSnapTargetId, setArrowSnapTargetId] = useState<string | null>(null)
  const [drawingArrow, setDrawingArrow] = useState<{
    fromId?: string
    toId?: string
    fromPoint: Point
    currentPoint: Point
  } | null>(null)
  const [reconnectingArrow, setReconnectingArrow] = useState<{
    arrowId: string
    end: 'from' | 'to'
    point: Point
    snapId?: string
  } | null>(null)
  const [bendingArrow, setBendingArrow] = useState<{
    arrowId: string
    bend: number
  } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const spaceHeldRef = useRef(false)
  const [activeShapeType, setActiveShapeType] = useState<ToolbarShapeType>('rounded')
  const [activeShapeColor, setActiveShapeColor] = useState<StickyColor>('sky')
  const [activeFillStyle, setActiveFillStyle] = useState<WhiteboardFillStyle>('soft')
  const [activeArrowRouting, setActiveArrowRouting] = useState<WhiteboardArrowRouting>('curve')
  const [activeArrowDash, setActiveArrowDash] = useState<'solid' | 'dashed'>('solid')
  const [activeTextPreset, setActiveTextPreset] = useState<ToolbarTextCardPresetId>('backed-label')
  const [dockSpaceLevel, setDockSpaceLevel] = useState<SpaceLevel>('general')
  const [dockNoteColor, setDockNoteColor] = useState<StickyColor>('amber')
  const [marqueeRect, setMarqueeRect] = useState<{ start: Point; current: Point } | null>(null)
  const [drawingShapeRect, setDrawingShapeRect] = useState<{
    start: Point
    current: Point
    shapeType: ToolbarShapeType
    color: StickyColor
    fillStyle: WhiteboardFillStyle
  } | null>(null)
  const [drawingFrameRect, setDrawingFrameRect] = useState<{
    start: Point
    current: Point
    level: SpaceLevel
  } | null>(null)
  const [dockDrag, setDockDrag] = useState<{
    kind: ToolbarDockItemKind
    options: ToolbarDockDragOptions
    clientX: number
    clientY: number
  } | null>(null)
  const { copiedStickiesRef, pasteCountRef } = useClipboardBuffer()
  return useMemo(
    () => ({
      rootRef,
      emojiFileInputRef,
      view,
      setView,
      reducedMotion,
      zoomTweening,
      setZoomTweening,
      fitPartial,
      setFitPartial,
      zoomTweenTimerRef,
      markZoomTween,
      panning,
      setPanning,
      tileOffset,
      setTileOffset,
      tileSizeOverride,
      setTileSizeOverride,
      stickyOffset,
      setStickyOffset,
      stickySizeOverride,
      setStickySizeOverride,
      selectedStickyIds,
      setSelectedStickyIds,
      selectedNodeIds,
      setSelectedNodeIds,
      nodeOffset,
      setNodeOffset,
      multiNodeDragDelta,
      setMultiNodeDragDelta,
      nodeSizeOverride,
      setNodeSizeOverride,
      rosterDrawerOpen,
      setRosterDrawerOpen,
      sessionDrawerOpen,
      setSessionDrawerOpen,
      pendingA01Spawn,
      setPendingA01Spawn,
      editingStickyId,
      setEditingStickyId,
      emojiPickerGoalId,
      setEmojiPickerGoalId,
      emojiCategoryTab,
      setEmojiCategoryTab,
      levelPickerGoalId,
      setLevelPickerGoalId,
      imageDropGoalId,
      setImageDropGoalId,
      customEmojiDraft,
      setCustomEmojiDraft,
      selectedArrowId,
      setSelectedArrowId,
      hoveredArrowId,
      setHoveredArrowId,
      editingArrowId,
      setEditingArrowId,
      arrowLabelDraft,
      setArrowLabelDraft,
      arrowSnapTargetId,
      setArrowSnapTargetId,
      drawingArrow,
      setDrawingArrow,
      reconnectingArrow,
      setReconnectingArrow,
      bendingArrow,
      setBendingArrow,
      spaceHeld,
      setSpaceHeld,
      spaceHeldRef,
      activeShapeType,
      setActiveShapeType,
      activeShapeColor,
      setActiveShapeColor,
      activeFillStyle,
      setActiveFillStyle,
      activeArrowRouting,
      setActiveArrowRouting,
      activeArrowDash,
      setActiveArrowDash,
      activeTextPreset,
      setActiveTextPreset,
      dockSpaceLevel,
      setDockSpaceLevel,
      dockNoteColor,
      setDockNoteColor,
      marqueeRect,
      setMarqueeRect,
      drawingShapeRect,
      setDrawingShapeRect,
      drawingFrameRect,
      setDrawingFrameRect,
      dockDrag,
      setDockDrag,
      copiedStickiesRef,
      pasteCountRef
    }),
    [
      rootRef,
      emojiFileInputRef,
      view,
      setView,
      reducedMotion,
      zoomTweening,
      setZoomTweening,
      fitPartial,
      setFitPartial,
      zoomTweenTimerRef,
      markZoomTween,
      panning,
      setPanning,
      tileOffset,
      setTileOffset,
      tileSizeOverride,
      setTileSizeOverride,
      stickyOffset,
      setStickyOffset,
      stickySizeOverride,
      setStickySizeOverride,
      selectedStickyIds,
      setSelectedStickyIds,
      selectedNodeIds,
      setSelectedNodeIds,
      nodeOffset,
      setNodeOffset,
      multiNodeDragDelta,
      setMultiNodeDragDelta,
      nodeSizeOverride,
      setNodeSizeOverride,
      rosterDrawerOpen,
      setRosterDrawerOpen,
      sessionDrawerOpen,
      setSessionDrawerOpen,
      pendingA01Spawn,
      setPendingA01Spawn,
      editingStickyId,
      setEditingStickyId,
      emojiPickerGoalId,
      setEmojiPickerGoalId,
      emojiCategoryTab,
      setEmojiCategoryTab,
      levelPickerGoalId,
      setLevelPickerGoalId,
      imageDropGoalId,
      setImageDropGoalId,
      customEmojiDraft,
      setCustomEmojiDraft,
      selectedArrowId,
      setSelectedArrowId,
      hoveredArrowId,
      setHoveredArrowId,
      editingArrowId,
      setEditingArrowId,
      arrowLabelDraft,
      setArrowLabelDraft,
      arrowSnapTargetId,
      setArrowSnapTargetId,
      drawingArrow,
      setDrawingArrow,
      reconnectingArrow,
      setReconnectingArrow,
      bendingArrow,
      setBendingArrow,
      spaceHeld,
      setSpaceHeld,
      spaceHeldRef,
      activeShapeType,
      setActiveShapeType,
      activeShapeColor,
      setActiveShapeColor,
      activeFillStyle,
      setActiveFillStyle,
      activeArrowRouting,
      setActiveArrowRouting,
      activeArrowDash,
      setActiveArrowDash,
      activeTextPreset,
      setActiveTextPreset,
      dockSpaceLevel,
      setDockSpaceLevel,
      dockNoteColor,
      setDockNoteColor,
      marqueeRect,
      setMarqueeRect,
      drawingShapeRect,
      setDrawingShapeRect,
      drawingFrameRect,
      setDrawingFrameRect,
      dockDrag,
      setDockDrag,
      copiedStickiesRef,
      pasteCountRef
    ]
  )
}

export type CanvasState = ReturnType<typeof useCanvasState>
