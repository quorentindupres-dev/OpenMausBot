import React, { useCallback, useEffect, useMemo } from 'react'
import {
  SPACE_NODE_DRAG_MIME,
  createAgentCanvasNode,
  createProjectCanvasNode,
  createSessionCanvasNode,
  parseNodeDropPayload,
  type C02ProjectSummary,
  type DraggableSessionSummary,
  type SessionCanvasNode,
  type SpaceCanvasNode,
  type SpaceComputerTarget
} from './core/canvas-nodes'
import {
  DEFAULT_SPACE_MODEL_ID,
  ZOOM_TWEEN_MS,
  newSpaceId,
  type ManualAgentStateMode,
  type Point,
  type SpaceAgent,
  type SpaceArrow,
  type SpaceGoal,
  type SpaceLayout,
  type SpaceLevel,
  type SpaceState,
  type SpaceStickyNote,
  type StickyColor
} from './core/space'
import { NO_GUIDES } from './core/whiteboard-snap-drag'
import type { AgentRoleId } from './generated/a01-roles'
import {
  SpaceCanvasHostProvider,
  useSpaceCanvasHost,
  type SpaceCanvasHostAdapter
} from './host-adapter'
import { A01RosterDrawer } from './nodes/A01RosterDrawer'
import { A01SpawnPopover, type PendingA01Spawn } from './nodes/A01SpawnPopover'
import { CanvasNodeLayer } from './nodes/CanvasNodeLayer'
import { SessionDrawer } from './nodes/SessionDrawer'
import { SpaceProjectBadge } from './nodes/SpaceProjectBadge'
import type { DragItem, DragState } from './space-drag'
import { SpaceSnapGuides } from './space-snap-guides'
import type { ToolbarToolMode } from './whiteboard-toolbar'
import { makeClientToCanvasPoint, type CanvasCtx, type CanvasHandlers } from './canvas/canvas-ctx'
import { hasImageFile, useGlide } from './canvas/canvas-parts'
import { useArrowGestures } from './canvas/gestures/use-arrow-gestures'
import { useDockDrag } from './canvas/gestures/use-dock-drag'
import { useNodeGestures } from './canvas/gestures/use-node-gestures'
import { useSnapGesture } from './canvas/gestures/use-snap-gesture'
import { useStickyGestures } from './canvas/gestures/use-sticky-gestures'
import { useTileGestures } from './canvas/gestures/use-tile-gestures'
import { useStartPan, useWheelPan } from './canvas/gestures/use-wheel-pan'
import { useCanvasKeys } from './canvas/keyboard/use-canvas-keys'
import { ArrowLabelLayer } from './canvas/layers/ArrowLabelLayer'
import { ArrowSvgLayer } from './canvas/layers/ArrowLayer'
import { DrawPreview } from './canvas/layers/DrawPreview'
import { StickyLayer } from './canvas/layers/StickyLayer'
import { TileLayer } from './canvas/layers/TileLayer'
import { AskLayer } from './canvas/overlays/AskPins'
import { useCanvasContextMenus } from './canvas/overlays/ContextMenus'
import { Dock } from './canvas/overlays/Dock'
import { DockGhost } from './canvas/overlays/DockGhost'
import { HistoryZoomControls } from './canvas/overlays/HistoryZoomControls'
import { ItemInspector } from './canvas/overlays/ItemInspector'
import { LayersPanel } from './canvas/overlays/LayersPanel'
import { MultiSelectBar } from './canvas/overlays/MultiSelectBar'
import { OffscreenCue } from './canvas/overlays/OffscreenCue'
import { useSelectionActions } from './canvas/selection/use-selection-actions'
import { useCanvasModel } from './canvas/use-canvas-model'
import { useCanvasState } from './canvas/use-canvas-state'

export type EndWhiteboardTransaction = () => void

export type WhiteboardBatchAdd = {
  stickies?: readonly (Omit<SpaceStickyNote, 'id' | 'createdAt'> & { id?: string })[]
  arrows?: readonly Omit<SpaceArrow, 'id' | 'createdAt'>[]
}

export type WhiteboardBatchAddResult = {
  stickyIds: string[]
  arrowIds: string[]
  droppedStickies: number
  droppedArrows: number
}

export const SpaceCanvas = React.memo(function SpaceCanvas({
  agents,
  space,
  host: hostProp,
  dark = true,
  showProjectHeader = true,
  selectedGoalId,
  inspectedAgentId = null,
  drag,
  toolMode = 'select',
  onChangeToolMode,
  selectedModelId = DEFAULT_SPACE_MODEL_ID,
  onSelectModelId,
  askModelOnDrop = true,
  onToggleAskModelOnDrop,
  onStartDrag,
  onSelectAgent,
  onChangeAgentState,
  onRemoveAgent,
  onOpenGoal,
  onCreateSpaceAt,
  onRenameGoal,
  onChangeGoalEmoji,
  onUpdateGoal,
  onRegisterCustomEmoji,
  onNotify,
  onGoalMenu,
  onContextCreate,
  onMoveTile,
  onAddStickyNote,
  onDuplicateStickyNote,
  onUpdateStickyNote,
  onDeleteStickyNote,
  onBatchUpdateStickyNotes,
  onBatchDeleteStickyNotes,
  onBatchDuplicateStickyNotes,
  onAddArrow,
  onUpdateArrow,
  onDeleteArrow,
  onAddNode,
  onUpdateNode,
  onDeleteNode,
  onSelectSpaceProject,
  pendingSpawnRequest = null,
  onConsumePendingSpawnRequest,
  onWhiteboardTransaction,
  onBatchAddWhiteboard,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  pendingEditStickyId = null,
  onConsumePendingEditSticky
}: {
  agents: readonly SpaceAgent[]
  space: SpaceState
  host?: SpaceCanvasHostAdapter
  dark?: boolean
  showProjectHeader?: boolean
  selectedGoalId: string | null
  inspectedAgentId?: string | null
  drag: DragState
  toolMode?: ToolbarToolMode
  onChangeToolMode?: (mode: ToolbarToolMode) => void
  selectedModelId?: string
  onSelectModelId?: (modelId: string) => void
  askModelOnDrop?: boolean
  onToggleAskModelOnDrop?: (next: boolean) => void
  onStartDrag: (item: DragItem) => (event: React.PointerEvent) => void
  onSelectAgent: (agentId: string) => void
  onChangeAgentState?: (agentId: string, mode: ManualAgentStateMode) => void
  onRemoveAgent?: (agentId: string) => void
  onOpenGoal: (goal: SpaceGoal) => void
  onCreateSpaceAt?: (level: SpaceLevel, pointOrLayout?: Point | SpaceLayout) => SpaceGoal | void
  onRenameGoal: (goalId: string, title: string) => void
  onChangeGoalEmoji?: (goalId: string, emoji: string) => void
  onUpdateGoal?: (goalId: string, patch: Partial<SpaceGoal>) => void
  onRegisterCustomEmoji?: (emoji: string) => void
  onNotify?: (message: string) => void
  onGoalMenu: (goal: SpaceGoal, point: Point) => void
  onContextCreate: (screenPoint: Point, canvasPoint: Point) => void
  onMoveTile: (key: string, layout: SpaceLayout) => void
  onAddStickyNote?: (
    point?: Point,
    color?: StickyColor,
    kind?: 'note' | 'text' | 'shape',
    initialText?: string,
    options?: Partial<SpaceStickyNote>
  ) => string | void
  onDuplicateStickyNote?: (id: string, delta?: Point) => string | null | void
  onUpdateStickyNote?: (id: string, patch: Partial<SpaceStickyNote>) => void
  onDeleteStickyNote?: (id: string) => void
  onBatchUpdateStickyNotes?: (patches: Record<string, Partial<SpaceStickyNote>>) => void
  onBatchDeleteStickyNotes?: (ids: readonly string[]) => void
  onBatchDuplicateStickyNotes?: (ids: readonly string[], delta?: Point) => string[] | void
  onAddArrow?: (arrow: Omit<SpaceArrow, 'id' | 'createdAt'>) => void
  onUpdateArrow?: (id: string, patch: Partial<SpaceArrow>) => void
  onDeleteArrow?: (id: string) => void
  onAddNode?: (node: SpaceCanvasNode) => void
  onUpdateNode?: (nodeId: string, patch: Partial<SpaceCanvasNode>) => void
  onDeleteNode?: (nodeId: string) => void
  onSelectSpaceProject?: (projectSlug: string) => void
  pendingSpawnRequest?: PendingA01Spawn | null
  onConsumePendingSpawnRequest?: () => void
  onWhiteboardTransaction?: (fn?: () => void) => EndWhiteboardTransaction
  onBatchAddWhiteboard?: (items: WhiteboardBatchAdd) => WhiteboardBatchAddResult
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  pendingEditStickyId?: string | null
  onConsumePendingEditSticky?: () => void
}): React.JSX.Element {
  const inheritedHost = useSpaceCanvasHost()
  const host = hostProp ?? inheritedHost

  const canvasState = useCanvasState()
  const {
    rootRef,
    view,
    reducedMotion,
    zoomTweening,
    panning,
    spaceHeld,
    rosterDrawerOpen,
    setRosterDrawerOpen,
    sessionDrawerOpen,
    setSessionDrawerOpen,
    pendingA01Spawn,
    setPendingA01Spawn,
    nodeOffset,
    multiNodeDragDelta,
    nodeSizeOverride,
    setSelectedNodeIds,
    setSelectedStickyIds,
    arrowSnapTargetId
  } = canvasState

  useEffect(() => {
    if (pendingSpawnRequest) {
      setPendingA01Spawn(pendingSpawnRequest)
      onConsumePendingSpawnRequest?.()
    }
  }, [onConsumePendingSpawnRequest, pendingSpawnRequest, setPendingA01Spawn])

  const canvasModel = useCanvasModel(
    { agents, space, pendingEditStickyId, onConsumePendingEditSticky },
    canvasState
  )

  const canvasSnap = useSnapGesture(canvasState, canvasModel)
  const { snapGuides } = canvasSnap

  useGlide(rootRef, space.placements)
  useWheelPan(canvasState)

  const clientToCanvasPoint = makeClientToCanvasPoint(rootRef, view)

  const notifyMerged = useCallback(
    (msg: string): void => {
      onNotify?.(msg)
      host.onNotify?.(msg, 'info')
    },
    [host, onNotify]
  )

  const canvasProps = useMemo(
    () => ({
      agents,
      space,
      host,
      dark,
      showProjectHeader,
      selectedGoalId,
      inspectedAgentId,
      drag,
      toolMode,
      onChangeToolMode,
      selectedModelId,
      onSelectModelId,
      askModelOnDrop,
      onToggleAskModelOnDrop,
      onStartDrag,
      onSelectAgent,
      onChangeAgentState,
      onRemoveAgent,
      onOpenGoal,
      onCreateSpaceAt,
      onRenameGoal,
      onChangeGoalEmoji,
      onUpdateGoal,
      onRegisterCustomEmoji,
      onNotify: notifyMerged,
      onGoalMenu,
      onContextCreate,
      onMoveTile,
      onAddStickyNote,
      onDuplicateStickyNote,
      onUpdateStickyNote,
      onDeleteStickyNote,
      onBatchUpdateStickyNotes,
      onBatchDeleteStickyNotes,
      onBatchDuplicateStickyNotes,
      onAddArrow,
      onUpdateArrow,
      onDeleteArrow,
      onAddNode,
      onUpdateNode,
      onDeleteNode,
      onSelectSpaceProject,
      pendingSpawnRequest,
      onConsumePendingSpawnRequest,
      onWhiteboardTransaction,
      onBatchAddWhiteboard,
      canUndo,
      canRedo,
      onUndo,
      onRedo,
      pendingEditStickyId,
      onConsumePendingEditSticky
    }),
    [
      agents,
      space,
      host,
      dark,
      showProjectHeader,
      selectedGoalId,
      inspectedAgentId,
      drag,
      toolMode,
      onChangeToolMode,
      selectedModelId,
      onSelectModelId,
      askModelOnDrop,
      onToggleAskModelOnDrop,
      onStartDrag,
      onSelectAgent,
      onChangeAgentState,
      onRemoveAgent,
      onOpenGoal,
      onCreateSpaceAt,
      onRenameGoal,
      onChangeGoalEmoji,
      onUpdateGoal,
      onRegisterCustomEmoji,
      notifyMerged,
      onGoalMenu,
      onContextCreate,
      onMoveTile,
      onAddStickyNote,
      onDuplicateStickyNote,
      onUpdateStickyNote,
      onDeleteStickyNote,
      onBatchUpdateStickyNotes,
      onBatchDeleteStickyNotes,
      onBatchDuplicateStickyNotes,
      onAddArrow,
      onUpdateArrow,
      onDeleteArrow,
      onAddNode,
      onUpdateNode,
      onDeleteNode,
      onSelectSpaceProject,
      pendingSpawnRequest,
      onConsumePendingSpawnRequest,
      onWhiteboardTransaction,
      onBatchAddWhiteboard,
      canUndo,
      canRedo,
      onUndo,
      onRedo,
      pendingEditStickyId,
      onConsumePendingEditSticky
    ]
  )

  const ctx: CanvasCtx = useMemo(
    () => ({
      ...canvasProps,
      ...canvasState,
      ...canvasModel,
      ...canvasSnap,
      clientToCanvasPoint
    }),
    [canvasProps, canvasState, canvasModel, canvasSnap, clientToCanvasPoint]
  )

  const selectionActions = useSelectionActions(ctx)
  useCanvasKeys(ctx, selectionActions)

  const arrowGestures = useArrowGestures(ctx)
  const panGesture = useStartPan(ctx, arrowGestures)
  const { startPan } = panGesture
  const tileGestures = useTileGestures(ctx, arrowGestures)
  const stickyGestures = useStickyGestures(ctx, arrowGestures)
  const nodeGestures = useNodeGestures(ctx, arrowGestures)
  const { onCanvasDoubleClick, onCanvasContextMenu } = useCanvasContextMenus(ctx)
  const dockDragGesture = useDockDrag(ctx)

  const g: CanvasHandlers = {
    ...selectionActions,
    ...arrowGestures,
    ...panGesture,
    ...tileGestures,
    ...stickyGestures,
    ...nodeGestures,
    ...dockDragGesture
  }

  const defaultDropPoint = useCallback((): Point => {
    const el = rootRef.current
    const cx = el && el.clientWidth > 0 ? el.clientWidth / 2 : 520
    const cy = el && el.clientHeight > 0 ? el.clientHeight / 2 : 340
    return {
      x: Math.round((cx - view.x) / view.scale),
      y: Math.round((cy - view.y) / view.scale)
    }
  }, [rootRef, view.scale, view.x, view.y])

  const activeProjectSlug = space.projectSlug ?? host.activeProjectSlug ?? 'x-labs'

  const placeSessionAt = useCallback(
    (session: DraggableSessionSummary, pt: Point): void => {
      const node = createSessionCanvasNode(
        {
          ...session,
          projectSlug: session.projectSlug ?? activeProjectSlug
        },
        { x: pt.x - 160, y: pt.y - 88 },
        newSpaceId
      )
      onAddNode?.(node)
      setSelectedStickyIds([])
      setSelectedNodeIds([node.id])
    },
    [activeProjectSlug, onAddNode, setSelectedNodeIds, setSelectedStickyIds]
  )

  const placeProjectAt = useCallback(
    (project: C02ProjectSummary, pt: Point): void => {
      const node = createProjectCanvasNode(project, { x: pt.x - 162, y: pt.y - 98 }, newSpaceId)
      onAddNode?.(node)
      setSelectedStickyIds([])
      setSelectedNodeIds([node.id])
    },
    [onAddNode, setSelectedNodeIds, setSelectedStickyIds]
  )

  const requestSpawnRoleAt = useCallback(
    (roleId: AgentRoleId, pt?: Point): void => {
      const target = pt ?? defaultDropPoint()
      setPendingA01Spawn({
        roleId,
        position: { x: Math.round(target.x - 156), y: Math.round(target.y - 92) }
      })
    },
    [defaultDropPoint, setPendingA01Spawn]
  )

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    const dt = event.dataTransfer
    if (!dt || hasImageFile(dt)) {
      return
    }
    const types = Array.from(dt.types ?? [])
    if (types.includes(SPACE_NODE_DRAG_MIME) || types.includes('text/plain')) {
      event.preventDefault()
      dt.dropEffect = 'copy'
    }
  }, [])

  const handleCanvasDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>): void => {
      const dt = event.dataTransfer
      if (!dt || hasImageFile(dt)) {
        return
      }
      const raw = dt.getData(SPACE_NODE_DRAG_MIME) || dt.getData('text/plain')
      const payload = parseNodeDropPayload(raw)
      if (!payload) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const pt =
        Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
          ? clientToCanvasPoint(event.clientX, event.clientY)
          : defaultDropPoint()
      if (payload.kind === 'session') {
        placeSessionAt(payload.session, pt)
      } else if (payload.kind === 'project') {
        placeProjectAt(payload.project, pt)
      } else {
        requestSpawnRoleAt(payload.roleId, pt)
      }
    },
    [clientToCanvasPoint, defaultDropPoint, placeProjectAt, placeSessionAt, requestSpawnRoleAt]
  )

  const handleSwitchNodeComputer = useCallback(
    (nodeId: string, nextComputer: SpaceComputerTarget): void => {
      onUpdateNode?.(nodeId, { computer: nextComputer })
      host.onSwitchNodeComputer?.(nodeId, nextComputer)
    },
    [host, onUpdateNode]
  )

  const handleTogglePinSession = useCallback(
    (node: SessionCanvasNode, nextPinned: boolean): void => {
      onUpdateNode?.(node.id, { pinned: nextPinned })
      host.onPinSession?.(node.sessionId, nextPinned, {
        sessionId: node.sessionId,
        sessionKind: node.sessionKind,
        title: node.title,
        roleId: node.roleId,
        agentName: node.agentName,
        status: node.status,
        workingLine: node.workingLine,
        projectSlug: node.projectSlug,
        computer: node.computer,
        pinned: nextPinned
      })
    },
    [host, onUpdateNode]
  )

  const handleSelectProject = useCallback(
    (slug: string): void => {
      onSelectSpaceProject?.(slug)
      host.onSelectSpaceProject?.(slug)
    },
    [host, onSelectSpaceProject]
  )

  return (
    <SpaceCanvasHostProvider adapter={host}>
      <div
        ref={rootRef}
        data-space-canvas="true"
        data-view-x={view.x}
        data-view-y={view.y}
        data-view-scale={view.scale}
        onPointerDown={startPan}
        onDoubleClick={onCanvasDoubleClick}
        onContextMenu={onCanvasContextMenu}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
        style={{
          backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px)',
          backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
          backgroundPosition: `${view.x}px ${view.y}px`
        }}
        className={`@container relative flex-1 overflow-hidden select-none ${
          spaceHeld
            ? panning
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : toolMode === 'text'
              ? 'cursor-text'
              : toolMode === 'eraser'
                ? 'cursor-cell'
                : toolMode === 'arrow' ||
                    toolMode === 'shape' ||
                    toolMode === 'frame' ||
                    toolMode === 'marquee'
                  ? 'cursor-crosshair'
                  : panning
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
        }`}
      >
        <div
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            transformOrigin: '0 0',
            transition:
              zoomTweening && !reducedMotion
                ? `transform ${ZOOM_TWEEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
                : undefined
          }}
          className="pointer-events-none absolute top-0 left-0"
        >
          <ArrowSvgLayer ctx={ctx} g={g} />
          <ArrowLabelLayer ctx={ctx} />
          <StickyLayer ctx={ctx} g={g} />
          <TileLayer ctx={ctx} g={g} />
          <CanvasNodeLayer
            nodes={canvasModel.sortedNodes}
            dark={dark}
            toolMode={toolMode}
            selectedNodeIds={canvasModel.selectedNodeIdSet}
            arrowTargetNodeId={arrowSnapTargetId ?? undefined}
            nodeOffset={nodeOffset}
            multiDragDelta={multiNodeDragDelta}
            nodeSizeOverride={nodeSizeOverride}
            onSelectNode={nodeGestures.selectNode}
            onStartDragNode={nodeGestures.startNodeDrag}
            onStartResizeNode={nodeGestures.startNodeResize}
            onStartPortArrow={nodeGestures.startNodePortArrow}
            onEraseNode={nodeGestures.eraseNode}
            onOpenSession={host.onOpenSession}
            onTogglePinSession={handleTogglePinSession}
            onSwitchComputer={handleSwitchNodeComputer}
            onOpenProjectRef={host.onOpenProjectRef}
            onDeleteNode={onDeleteNode}
          />
          <DrawPreview ctx={ctx} />
        </div>

        <SpaceSnapGuides guides={zoomTweening ? NO_GUIDES : snapGuides} view={view} />

        <AskLayer ctx={ctx} />

        <LayersPanel ctx={ctx} />

        {showProjectHeader && (
          <SpaceProjectBadge
            dark={dark}
            projectSlug={activeProjectSlug}
            projects={host.projects}
            sessionCount={host.sessions?.length ?? 0}
            rosterOpen={rosterDrawerOpen}
            sessionDrawerOpen={sessionDrawerOpen}
            onSelectProject={handleSelectProject}
            onDropActiveProjectCard={(proj) => placeProjectAt(proj, defaultDropPoint())}
            onToggleRoster={() => {
              setRosterDrawerOpen((v) => !v)
              setSessionDrawerOpen(false)
            }}
            onToggleSessionDrawer={() => {
              setSessionDrawerOpen((v) => !v)
              setRosterDrawerOpen(false)
            }}
          />
        )}

        <A01RosterDrawer
          open={rosterDrawerOpen}
          dark={dark}
          onClose={() => setRosterDrawerOpen(false)}
          onRequestSpawn={(roleId) => {
            setRosterDrawerOpen(false)
            requestSpawnRoleAt(roleId)
          }}
          onStartPointerDrag={onStartDrag}
        />

        <SessionDrawer
          open={sessionDrawerOpen}
          dark={dark}
          sessions={host.sessions}
          projects={host.projects}
          onClose={() => setSessionDrawerOpen(false)}
          onPlaceSession={(session) => {
            setSessionDrawerOpen(false)
            placeSessionAt(session, defaultDropPoint())
          }}
          onPlaceProject={(project) => {
            setSessionDrawerOpen(false)
            placeProjectAt(project, defaultDropPoint())
          }}
          onStartPointerDrag={onStartDrag}
        />

        <A01SpawnPopover
          pending={pendingA01Spawn}
          dark={dark}
          projects={host.projects}
          defaultProjectSlug={activeProjectSlug}
          onCancel={() => setPendingA01Spawn(null)}
          onConfirm={({ roleId, spawnMode, projectSlug, computer, position }) => {
            const node = createAgentCanvasNode(
              {
                roleId,
                spawnMode,
                projectSlug,
                computer,
                position,
                modelId: selectedModelId
              },
              newSpaceId
            )
            onAddNode?.(node)
            setSelectedStickyIds([])
            setSelectedNodeIds([node.id])
            setPendingA01Spawn(null)
            void host.onSpawnA01Agent?.({
              nodeId: node.id,
              roleId,
              spawnMode,
              projectSlug,
              computer,
              position,
              modelId: selectedModelId
            })
          }}
        />

        <MultiSelectBar ctx={ctx} g={g} />
        <ItemInspector ctx={ctx} g={g} />
        <Dock ctx={ctx} g={g} />
        <DockGhost ctx={ctx} />
        <OffscreenCue ctx={ctx} />
        <HistoryZoomControls ctx={ctx} g={g} />
      </div>
    </SpaceCanvasHostProvider>
  )
})
