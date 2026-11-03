import React from 'react'
import { CARDINAL_PORTS, type CardinalSide } from '../core/whiteboard-kit'
import type { SpaceNodeLiveStatus } from '../core/canvas-nodes'
import { HANDLERS, type Handler } from '../penpot-mpl/resize-handles'

export type NodeResizeHandle = Handler

const HANDLE_POSITIONS: Record<Handler, string> = {
  'top-left': '-top-1.5 -left-1.5 cursor-nwse-resize',
  top: '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize',
  'top-right': '-top-1.5 -right-1.5 cursor-nesw-resize',
  right: 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize',
  'bottom-right': '-bottom-1.5 -right-1.5 cursor-nwse-resize',
  bottom: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize',
  'bottom-left': '-bottom-1.5 -left-1.5 cursor-nesw-resize',
  left: 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize'
}

export function NodeResizeHandles({
  dark,
  onStartResize
}: {
  dark: boolean
  onStartResize: (handle: Handler, event: React.PointerEvent) => void
}): React.JSX.Element {
  return (
    <>
      {HANDLERS.map((handle) => (
        <div
          key={handle}
          data-node-resize-handle={handle}
          onPointerDown={(event) => {
            event.stopPropagation()
            onStartResize(handle, event)
          }}
          className={`pointer-events-auto absolute z-30 h-2.5 w-2.5 rounded-sm border shadow-xs transition-transform hover:scale-125 ${HANDLE_POSITIONS[handle]} ${
            dark ? 'border-sky-300 bg-zinc-950' : 'border-sky-600 bg-white'
          }`}
        />
      ))}
    </>
  )
}

const PORT_POSITIONS: Record<CardinalSide, string> = {
  top: '-top-2.5 left-1/2 -translate-x-1/2',
  right: 'top-1/2 -right-2.5 -translate-y-1/2',
  bottom: '-bottom-2.5 left-1/2 -translate-x-1/2',
  left: 'top-1/2 -left-2.5 -translate-y-1/2'
}

export function NodePortHandles({
  nodeId,
  visible,
  onStartPortArrow
}: {
  nodeId: string
  visible: boolean
  onStartPortArrow: (nodeId: string, side: CardinalSide, event: React.PointerEvent) => void
}): React.JSX.Element {
  return (
    <>
      {CARDINAL_PORTS.map((port) => (
        <button
          key={port.side}
          type="button"
          data-node-port={`${nodeId}:${port.side}`}
          title={`Connect magnetic arrow (${port.side})`}
          aria-label={`Connect magnetic arrow from ${port.side}`}
          onPointerDown={(event) => {
            event.stopPropagation()
            onStartPortArrow(nodeId, port.side, event)
          }}
          className={`pointer-events-auto absolute z-30 flex h-4 w-4 items-center justify-center rounded-full border border-sky-300 bg-sky-500 text-[9px] font-bold text-white shadow-sm transition-all hover:scale-125 ${PORT_POSITIONS[port.side]} ${
            visible ? 'opacity-95' : 'opacity-0 group-hover/canvas-node:opacity-90'
          }`}
        />
      ))}
    </>
  )
}

export function nodeStatusMeta(status: SpaceNodeLiveStatus): {
  emoji: string
  label: string
  dotClass: string
  pillClassDark: string
  pillClassLight: string
} {
  if (status === 'working') {
    return {
      emoji: '🟠',
      label: 'Working',
      dotClass: 'bg-amber-400 animate-pulse',
      pillClassDark: 'border-amber-400/35 bg-amber-500/15 text-amber-200',
      pillClassLight: 'border-amber-500/40 bg-amber-50 text-amber-800'
    }
  }
  if (status === 'waiting') {
    return {
      emoji: '🔴',
      label: 'Waiting ask',
      dotClass: 'bg-rose-500 animate-pulse',
      pillClassDark: 'border-rose-400/45 bg-rose-500/20 text-rose-200',
      pillClassLight: 'border-rose-500/45 bg-rose-50 text-rose-800'
    }
  }
  if (status === 'done') {
    return {
      emoji: '🟢',
      label: 'Done',
      dotClass: 'bg-emerald-400',
      pillClassDark: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200',
      pillClassLight: 'border-emerald-500/40 bg-emerald-50 text-emerald-800'
    }
  }
  return {
    emoji: '🟢',
    label: 'Idle',
    dotClass: 'bg-emerald-400',
    pillClassDark: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    pillClassLight: 'border-emerald-500/35 bg-emerald-50 text-emerald-700'
  }
}
