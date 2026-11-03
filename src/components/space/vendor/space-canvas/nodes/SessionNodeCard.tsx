import React from 'react'
import { ExternalLink, FolderKanban, Laptop, Pin, Trash2 } from 'lucide-react'
import {
  computerTargetMeta,
  nextComputerTarget,
  type SessionCanvasNode,
  type SpaceComputerTarget,
  type SpaceSessionKind
} from '../core/canvas-nodes'
import { AGENT_ROLE_ACCESSORIES } from '../generated/a01-roles'
import { MiniSpacewareSprite } from '../sprites/space-sprite'
import { nodeStatusMeta } from './NodeResizeHandles'

function sessionKindLabel(kind: SpaceSessionKind): string {
  if (kind === 'orca-terminal') {
    return 'Orca Terminal'
  }
  if (kind === 'orca-agent') {
    return 'Orca Agent'
  }
  return 'OpenManus Thread'
}

export function SessionNodeCard({
  node,
  dark,
  onOpenSession,
  onTogglePin,
  onSwitchComputer,
  onDelete
}: {
  node: SessionCanvasNode
  dark: boolean
  onOpenSession?: (sessionId: string, kind: SpaceSessionKind) => void
  onTogglePin?: (node: SessionCanvasNode, nextPinned: boolean) => void
  onSwitchComputer?: (nodeId: string, nextComputer: SpaceComputerTarget) => void
  onDelete?: (nodeId: string) => void
}): React.JSX.Element {
  const status = nodeStatusMeta(node.status)
  const computer = computerTargetMeta(node.computer)
  const roleMeta = node.roleId ? AGENT_ROLE_ACCESSORIES[node.roleId] : null

  return (
    <div
      data-testid={`session-node-${node.id}`}
      className={`flex h-full w-full flex-col justify-between rounded-2xl border p-3.5 shadow-xl backdrop-blur-md transition-colors ${
        dark
          ? 'border-zinc-700/80 bg-zinc-900/92 text-zinc-100'
          : 'border-zinc-300/90 bg-white/95 text-zinc-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              dark ? 'border-zinc-700/80 bg-zinc-800/90' : 'border-zinc-200 bg-zinc-100'
            }`}
          >
            <MiniSpacewareSprite
              role={node.roleId}
              busy={node.status === 'working'}
              attention={node.status === 'waiting'}
              awake={node.status === 'working' || node.status === 'waiting'}
              size={28}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase ${
                  dark ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {sessionKindLabel(node.sessionKind)}
              </span>
              {roleMeta && (
                <span className="truncate text-[10px] font-medium text-sky-400">
                  {roleMeta.archetype}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[13px] font-semibold leading-tight">
              {node.title}
            </div>
          </div>
        </div>

        <span
          data-testid={`session-status-${node.id}`}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            dark ? status.pillClassDark : status.pillClassLight
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
          <span>
            {status.emoji} {status.label}
          </span>
        </span>
      </div>

      <div
        className={`my-2 line-clamp-2 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug ${
          dark ? 'bg-zinc-950/65 text-zinc-300' : 'bg-zinc-100/90 text-zinc-700'
        }`}
      >
        {node.workingLine ||
          (node.agentName ? `${node.agentName} · Ready for instructions` : 'Session ready')}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            data-testid={`node-project-pill-${node.id}`}
            className={`inline-flex max-w-[140px] items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
              node.projectSlug
                ? dark
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-emerald-500/40 bg-emerald-50 text-emerald-800'
                : dark
                  ? 'border-zinc-700 bg-zinc-800/80 text-zinc-400'
                  : 'border-zinc-200 bg-zinc-100 text-zinc-500'
            }`}
            title={
              node.projectSlug
                ? `Bound C02 Project: ${node.projectSlug}`
                : 'Draw arrow from a C02 Project card to bind'
            }
          >
            <FolderKanban className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{node.projectSlug ?? 'No C02 project'}</span>
          </span>

          <button
            type="button"
            data-testid={`switch-computer-${node.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onSwitchComputer?.(node.id, nextComputerTarget(node.computer))
            }}
            title={`Computer: ${computer.label} (click to switch)`}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              dark
                ? 'border-sky-400/35 bg-sky-500/12 text-sky-200 hover:bg-sky-500/25'
                : 'border-sky-500/35 bg-sky-50 text-sky-800 hover:bg-sky-100'
            }`}
          >
            <Laptop className="h-2.5 w-2.5 shrink-0" />
            <span>{computer.shortBadge}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid={`pin-session-${node.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onTogglePin?.(node, !node.pinned)
            }}
            title={node.pinned ? 'Unpin floating face square' : 'Pin floating face square'}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
              node.pinned
                ? 'border-amber-400/50 bg-amber-500/20 text-amber-300'
                : dark
                  ? 'border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
                  : 'border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            <Pin className="h-3 w-3" />
          </button>

          <button
            type="button"
            data-testid={`open-session-${node.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onOpenSession?.(node.sessionId, node.sessionKind)
            }}
            title={node.sessionKind === 'orca-terminal' ? 'Open Terminal' : 'Open Chat'}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              dark
                ? 'border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                : 'border-zinc-300 bg-zinc-900 text-white hover:bg-zinc-800'
            }`}
          >
            <span>{node.sessionKind === 'orca-terminal' ? 'Terminal' : 'Open'}</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </button>

          {!node.locked && onDelete && (
            <button
              type="button"
              aria-label="Remove session card"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(node.id)
              }}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                dark
                  ? 'text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300'
                  : 'text-zinc-400 hover:bg-rose-50 hover:text-rose-600'
              }`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
