import React from 'react'
import { ExternalLink, FolderKanban, Laptop, Trash2 } from 'lucide-react'
import {
  computerTargetMeta,
  nextComputerTarget,
  type AgentCanvasNode,
  type SpaceComputerTarget,
  type SpaceSessionKind
} from '../core/canvas-nodes'
import { AGENT_ROLE_ACCESSORIES } from '../generated/a01-roles'
import { MiniSpacewareSprite } from '../sprites/space-sprite'
import { nodeStatusMeta } from './NodeResizeHandles'

export function AgentNodeCard({
  node,
  dark,
  onOpenSession,
  onSwitchComputer,
  onDelete
}: {
  node: AgentCanvasNode
  dark: boolean
  onOpenSession?: (sessionId: string, kind: SpaceSessionKind) => void
  onSwitchComputer?: (nodeId: string, nextComputer: SpaceComputerTarget) => void
  onDelete?: (nodeId: string) => void
}): React.JSX.Element {
  const roleMeta = AGENT_ROLE_ACCESSORIES[node.roleId]
  const status = nodeStatusMeta(node.status)
  const computer = computerTargetMeta(node.computer)
  const isEmployee = node.spawnMode === 'long-term-employee'

  return (
    <div
      data-testid={`agent-node-${node.id}`}
      className={`flex h-full w-full flex-col justify-between rounded-2xl border p-3.5 shadow-xl backdrop-blur-md transition-colors ${
        dark
          ? 'border-indigo-500/45 bg-zinc-900/94 text-zinc-100'
          : 'border-indigo-300 bg-white/95 text-zinc-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              dark ? 'border-indigo-400/40 bg-indigo-500/15' : 'border-indigo-200 bg-indigo-50'
            }`}
          >
            <MiniSpacewareSprite
              role={node.roleId}
              busy={node.status === 'working'}
              attention={node.status === 'waiting'}
              awake={node.status === 'working' || node.status === 'waiting'}
              size={30}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                data-testid={`agent-mode-${node.id}`}
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                  isEmployee
                    ? dark
                      ? 'bg-violet-500/20 text-violet-200'
                      : 'bg-violet-100 text-violet-800'
                    : dark
                      ? 'bg-amber-500/20 text-amber-200'
                      : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isEmployee ? '🧠 Long-Term Employee' : '⚡ Temporary Worker'}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[13px] font-semibold leading-tight">
              {node.title}
            </div>
            <div className="truncate text-[10px] text-zinc-400">{roleMeta.tagline}</div>
          </div>
        </div>

        <span
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
          (isEmployee
            ? `A01/${roleMeta.a01} + fleet.db Hindsight ready`
            : 'Ephemeral C01 worker ready')}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            data-testid={`node-project-pill-${node.id}`}
            className={`inline-flex max-w-[145px] items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
              node.projectSlug
                ? dark
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-emerald-500/40 bg-emerald-50 text-emerald-800'
                : dark
                  ? 'border-zinc-700 bg-zinc-800/80 text-zinc-400'
                  : 'border-zinc-200 bg-zinc-100 text-zinc-500'
            }`}
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
          {node.sessionId && onOpenSession && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onOpenSession(node.sessionId!, 'orca-agent')
              }}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                dark
                  ? 'border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                  : 'border-zinc-300 bg-zinc-900 text-white hover:bg-zinc-800'
              }`}
            >
              <span>Open</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          )}
          {!node.locked && onDelete && (
            <button
              type="button"
              aria-label="Remove A01 agent card"
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
