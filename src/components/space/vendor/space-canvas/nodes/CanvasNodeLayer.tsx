import React from 'react'
import type {
  C02ProjectLiveRef,
  SessionCanvasNode,
  SpaceCanvasNode,
  SpaceComputerTarget,
  SpaceSessionKind
} from '../core/canvas-nodes'
import type { Point } from '../core/space'
import type { CardinalSide } from '../core/whiteboard-kit'
import type { Handler } from '../penpot-mpl/resize-handles'
import type { ToolbarToolMode } from '../whiteboard-toolbar'
import { AgentNodeCard } from './AgentNodeCard'
import { NodePortHandles, NodeResizeHandles } from './NodeResizeHandles'
import { ProjectNodeCard } from './ProjectNodeCard'
import { SessionNodeCard } from './SessionNodeCard'

export type NodeBoxOverride = {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export function CanvasNodeLayer({
  nodes,
  dark,
  toolMode,
  selectedNodeIds,
  arrowTargetNodeId,
  nodeOffset,
  multiDragDelta,
  nodeSizeOverride,
  onSelectNode,
  onStartDragNode,
  onStartResizeNode,
  onStartPortArrow,
  onEraseNode,
  onOpenSession,
  onTogglePinSession,
  onSwitchComputer,
  onOpenProjectRef,
  onDeleteNode,
  onContextMenuNode
}: {
  nodes: readonly SpaceCanvasNode[]
  dark: boolean
  toolMode: ToolbarToolMode
  selectedNodeIds: ReadonlySet<string>
  arrowTargetNodeId?: string
  nodeOffset: { id: string; dx: number; dy: number } | null
  multiDragDelta: Point | null
  nodeSizeOverride: NodeBoxOverride | null
  onSelectNode: (nodeId: string, additive: boolean) => void
  onStartDragNode: (nodeId: string, event: React.PointerEvent) => void
  onStartResizeNode: (nodeId: string, handle: Handler, event: React.PointerEvent) => void
  onStartPortArrow: (nodeId: string, side: CardinalSide, event: React.PointerEvent) => void
  onEraseNode: (nodeId: string) => void
  onOpenSession?: (sessionId: string, kind: SpaceSessionKind) => void
  onTogglePinSession?: (node: SessionCanvasNode, nextPinned: boolean) => void
  onSwitchComputer?: (nodeId: string, nextComputer: SpaceComputerTarget) => void
  onOpenProjectRef?: (projectSlug: string, ref: C02ProjectLiveRef) => void
  onDeleteNode?: (nodeId: string) => void
  onContextMenuNode?: (nodeId: string, event: React.MouseEvent) => void
}): React.JSX.Element | null {
  if (nodes.length === 0) {
    return null
  }

  return (
    <>
      {nodes.map((node, index) => {
        if (node.hidden) {
          return null
        }
        const selected = selectedNodeIds.has(node.id)
        const isArrowTarget = arrowTargetNodeId === node.id
        const sizeOvr = nodeSizeOverride?.id === node.id ? nodeSizeOverride : null
        const singleOff = nodeOffset?.id === node.id ? nodeOffset : null
        const groupOff = selected && multiDragDelta ? multiDragDelta : null
        const x = (sizeOvr ? sizeOvr.x : node.x) + (singleOff?.dx ?? 0) + (groupOff?.x ?? 0)
        const y = (sizeOvr ? sizeOvr.y : node.y) + (singleOff?.dy ?? 0) + (groupOff?.y ?? 0)
        const w = sizeOvr ? sizeOvr.w : node.w
        const h = sizeOvr ? sizeOvr.h : node.h
        const z = 20 + (node.zIndex ?? index)

        return (
          <div
            key={node.id}
            data-space-node={node.id}
            data-space-node-kind={node.kind}
            style={{
              transform: `translate3d(${x}px, ${y}px, 0)`,
              width: w,
              height: h,
              zIndex: selected ? z + 60 : z
            }}
            onContextMenu={(event) => {
              if (onContextMenuNode) {
                event.preventDefault()
                event.stopPropagation()
                onContextMenuNode(node.id, event)
              }
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return
              }
              event.stopPropagation()
              if (toolMode === 'eraser') {
                if (!node.locked) {
                  onEraseNode(node.id)
                }
                return
              }
              if (toolMode === 'arrow') {
                onStartPortArrow(node.id, 'right', event)
                return
              }
              const additive = event.shiftKey || event.metaKey || event.ctrlKey
              onSelectNode(node.id, additive)
              if (!node.locked && toolMode === 'select') {
                onStartDragNode(node.id, event)
              }
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              if (node.kind === 'session') {
                onOpenSession?.(node.sessionId, node.sessionKind)
              } else if (node.kind === 'agent' && node.sessionId) {
                onOpenSession?.(node.sessionId, 'orca-agent')
              }
            }}
            className={`group/canvas-node pointer-events-auto absolute top-0 left-0 select-none ${
              node.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
            } ${
              isArrowTarget
                ? 'rounded-2xl ring-2 ring-sky-400 ring-offset-2 ring-offset-transparent'
                : selected
                  ? 'rounded-2xl ring-2 ring-indigo-400'
                  : ''
            }`}
          >
            {node.kind === 'session' ? (
              <SessionNodeCard
                node={node}
                dark={dark}
                onOpenSession={onOpenSession}
                onTogglePin={onTogglePinSession}
                onSwitchComputer={onSwitchComputer}
                onDelete={onDeleteNode}
              />
            ) : node.kind === 'agent' ? (
              <AgentNodeCard
                node={node}
                dark={dark}
                onOpenSession={onOpenSession}
                onSwitchComputer={onSwitchComputer}
                onDelete={onDeleteNode}
              />
            ) : (
              <ProjectNodeCard
                node={node}
                dark={dark}
                onOpenProjectRef={onOpenProjectRef}
                onDelete={onDeleteNode}
              />
            )}

            {!node.locked && selected && toolMode === 'select' && (
              <NodeResizeHandles
                dark={dark}
                onStartResize={(handle, event) => onStartResizeNode(node.id, handle, event)}
              />
            )}

            <NodePortHandles
              nodeId={node.id}
              visible={toolMode === 'arrow' || isArrowTarget || selected}
              onStartPortArrow={onStartPortArrow}
            />
          </div>
        )
      })}
    </>
  )
}
