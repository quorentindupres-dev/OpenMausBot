// Primary Whiteboard Components & Host Adapter Contract
export {
  SpaceCanvas,
  type EndWhiteboardTransaction,
  type WhiteboardBatchAdd,
  type WhiteboardBatchAddResult
} from './space-canvas'
export { SpaceWhiteboard } from './space-whiteboard'
export {
  SpaceCanvasHostProvider,
  useSpaceCanvasHost,
  type A01SpawnRequest,
  type PinnedSessionBodyRenderOpts,
  type SpaceCanvasHostAdapter
} from './host-adapter'

// First-Class Drag-and-Drop Capabilities (Session Nodes, A01 Roster & Spawn Card, C02 Project Cards)
export {
  A01_SPAWN_MODES,
  AGENT_NODE_DEFAULT_SIZE,
  CANVAS_NODE_MAX_H,
  CANVAS_NODE_MAX_W,
  CANVAS_NODE_MIN_H,
  CANVAS_NODE_MIN_W,
  MAX_CANVAS_NODES,
  PROJECT_NODE_DEFAULT_SIZE,
  SESSION_NODE_DEFAULT_SIZE,
  SPACE_COMPUTER_TARGETS,
  SPACE_NODE_DRAG_MIME,
  clampCanvasNodeBox,
  computerTargetMeta,
  createAgentCanvasNode,
  createProjectCanvasNode,
  createSessionCanvasNode,
  isSpaceComputerTarget,
  nextComputerTarget,
  normalizeCanvasNode,
  parseNodeDropPayload,
  patchCanvasNode,
  removeCanvasNode,
  resolveArrowConnectionEffect,
  serializeNodeDropPayload,
  upsertCanvasNode,
  type A01SpawnMode,
  type AgentCanvasNode,
  type BaseCanvasNode,
  type C02ProjectLiveRef,
  type C02ProjectReadiness,
  type C02ProjectSummary,
  type DraggableSessionSummary,
  type MagneticArrowSemanticEffect,
  type ProjectCanvasNode,
  type SessionCanvasNode,
  type SpaceCanvasNode,
  type SpaceComputerTarget,
  type SpaceNodeDropPayload,
  type SpaceNodeLiveStatus,
  type SpaceSessionKind
} from './core/canvas-nodes'

export { A01RosterDrawer } from './nodes/A01RosterDrawer'
export { A01SpawnPopover, type PendingA01Spawn } from './nodes/A01SpawnPopover'
export { AgentNodeCard } from './nodes/AgentNodeCard'
export { CanvasNodeLayer, type NodeBoxOverride } from './nodes/CanvasNodeLayer'
export {
  NodePortHandles,
  NodeResizeHandles,
  nodeStatusMeta,
  type NodeResizeHandle
} from './nodes/NodeResizeHandles'
export { ProjectNodeCard } from './nodes/ProjectNodeCard'
export { BUILTIN_C02_PROJECTS, SessionDrawer } from './nodes/SessionDrawer'
export { SessionNodeCard } from './nodes/SessionNodeCard'
export { SpaceProjectBadge } from './nodes/SpaceProjectBadge'

// Generated 18 Registered A01 Roles & Visual Looks
export {
  A01_GROUPS,
  A01_ROLE_IDS,
  AGENT_ACCESSORY_SVG,
  AGENT_LOOK_KINDS,
  AGENT_ROLE_ACCESSORIES,
  type A01GroupId,
  type A01GroupMeta,
  type AgentAccessory,
  type AgentLayer,
  type AgentRoleAccessory,
  type AgentRoleId
} from './generated/a01-roles'

// Spaceware Sprites, Emoji Graphics, Snap Guides, Toolbar & Drag Engine
export {
  MiniSpacewareSprite,
  SPACEWARE_ISLAND_PALETTE,
  SpacewareSprite
} from './sprites/space-sprite'
export { SpriteRoleAccessory, spriteRoleOf } from './sprites/space-sprite-accessory'
export { SplitTerminalWindowPreview, SubagentBeneathSwarm } from './sprites/space-agent-presence'
export { SpaceEmojiGraphic, readCustomEmojiFile } from './space-emoji'
export { SpaceSnapGuides } from './space-snap-guides'
export {
  isOverTile,
  useSpaceDrag,
  type DragItem,
  type DragState,
  type DropTarget
} from './space-drag'
export {
  WhiteboardEdgelessDock,
  WhiteboardHistoryControls,
  WhiteboardItemInspector,
  WhiteboardMultiSelectBar,
  WhiteboardToolbar,
  TOOLBAR_COLORS,
  TOOLBAR_COLOR_SWATCH,
  type ToolbarArrowRouting,
  type ToolbarBorderStyle,
  type ToolbarColor,
  type ToolbarDockDragOptions,
  type ToolbarDockItemKind,
  type ToolbarFillStyle,
  type ToolbarFontFamily,
  type ToolbarModelOption,
  type ToolbarMultiAlign,
  type ToolbarMultiDistribute,
  type ToolbarShapeType,
  type ToolbarTextAlign,
  type ToolbarTextCardPresetId,
  type ToolbarToolMode
} from './whiteboard-toolbar'

// Pinned Floating Face Squares & Ask Pins
export {
  PIN_LAYER_Z,
  PinButton,
  PinnedSessionsLayer,
  PinnedSquare,
  PinnedWindow,
  dispatchPinned,
  getPinnedState,
  pinSession,
  resetPinnedStoreForTests,
  subscribePinned,
  unpinSession,
  usePinnedState,
  type PinButtonProps,
  type PinnedSessionsLayerProps
} from './pinned-sessions'
export {
  ASK_PIN_SIZE,
  collectOpenAsks,
  layoutAskPins,
  openAsksForAgent,
  type AskEdge,
  type AskPin,
  type AskPinLayout,
  type OpenAskRef
} from './core/ask-pins'

// Core Space Schema, Whiteboard Geometry, Snap, Groups, Clipboard & Viewport Fit
export * from './core/space'
export * from './core/whiteboard-snap'
export * from './core/whiteboard-snap-drag'
export * from './core/whiteboard-groups'
export * from './core/whiteboard-clipboard'
export * from './core/viewport-fit'
export * from './core/space-viewport'
export * from './core/agent-identity'
export * from './core/pinned-sessions'

// Penpot MPL-2.0 Ported Primitives (Provenance preserved in ./penpot-mpl/PROVENANCE.md)
export {
  PENPOT_DRAG_THRESHOLD,
  passedDragThreshold,
  passedResizeThreshold
} from './penpot-mpl/drag-threshold'
export {
  DUPLICATE_MEMO_MS,
  calcDuplicateDelta,
  memorizeDuplicated,
  type DuplicateMemo
} from './penpot-mpl/duplicate-delta'
export {
  createNudgeBurst,
  nudgeVector,
  type NudgeBurst,
  type NudgeDirection
} from './penpot-mpl/nudge-burst'
export {
  HANDLERS,
  resizeRect,
  type Handler,
  type HandlerRect,
  type ResizeOptions
} from './penpot-mpl/resize-handles'
