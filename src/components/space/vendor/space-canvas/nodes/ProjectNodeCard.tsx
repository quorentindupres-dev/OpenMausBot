import React from 'react'
import { ExternalLink, FolderKanban, Package, Trash2 } from 'lucide-react'
import type {
  C02ProjectLiveRef,
  C02ProjectReadiness,
  ProjectCanvasNode
} from '../core/canvas-nodes'

function readinessBadgeMeta(
  readiness: C02ProjectReadiness,
  score?: number
): {
  emoji: string
  text: string
  darkClass: string
  lightClass: string
} {
  const suffix = score !== undefined ? ` ${score}%` : ''
  if (readiness === 'red') {
    return {
      emoji: '🔴',
      text: `🔴 Blocked${suffix}`,
      darkClass: 'border-rose-400/45 bg-rose-500/20 text-rose-200',
      lightClass: 'border-rose-500/45 bg-rose-50 text-rose-800'
    }
  }
  if (readiness === 'orange') {
    return {
      emoji: '🟠',
      text: `🟠 In Setup${suffix}`,
      darkClass: 'border-amber-400/45 bg-amber-500/20 text-amber-200',
      lightClass: 'border-amber-500/45 bg-amber-50 text-amber-800'
    }
  }
  return {
    emoji: '🟢',
    text: `🟢 Ready${suffix}`,
    darkClass: 'border-emerald-400/45 bg-emerald-500/20 text-emerald-200',
    lightClass: 'border-emerald-500/45 bg-emerald-50 text-emerald-800'
  }
}

export function ProjectNodeCard({
  node,
  dark,
  onOpenProjectRef,
  onDelete
}: {
  node: ProjectCanvasNode
  dark: boolean
  onOpenProjectRef?: (projectSlug: string, ref: C02ProjectLiveRef) => void
  onDelete?: (nodeId: string) => void
}): React.JSX.Element {
  const badge = readinessBadgeMeta(node.readiness, node.readinessScore)

  return (
    <div
      data-testid={`project-node-${node.id}`}
      className={`flex h-full w-full flex-col justify-between rounded-2xl border p-3.5 shadow-xl backdrop-blur-md transition-colors ${
        dark
          ? 'border-emerald-500/45 bg-zinc-900/94 text-zinc-100'
          : 'border-emerald-400/75 bg-white/95 text-zinc-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              dark
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                : 'border-emerald-300 bg-emerald-50 text-emerald-700'
            }`}
          >
            <FolderKanban className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase ${
                  dark ? 'bg-emerald-500/18 text-emerald-300' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                C02 Project
              </span>
              <span className="truncate font-mono text-[10px] text-zinc-400">
                {node.projectSlug}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold leading-tight">
              {node.title}
            </div>
          </div>
        </div>

        <span
          data-testid={`project-readiness-${node.id}`}
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            dark ? badge.darkClass : badge.lightClass
          }`}
        >
          {badge.text}
        </span>
      </div>

      <div className="my-2 space-y-1.5">
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${
              dark ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-800'
            }`}
          >
            <Package className="h-3 w-3 text-emerald-400" />
            <span>Products: {node.productsCount}</span>
          </span>
          <span className="truncate text-[10px] text-zinc-400">Arrow ──▶ Agent binds project</span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-semibold text-zinc-400">Channels:</span>
          {node.channels.length > 0 ? (
            node.channels.slice(0, 4).map((channel) => (
              <span
                key={channel}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  dark ? 'bg-zinc-800/90 text-zinc-200' : 'bg-zinc-100 text-zinc-700'
                }`}
              >
                {channel}
              </span>
            ))
          ) : (
            <span className="text-[10px] italic text-zinc-500">No channels listed</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {node.liveRefs.slice(0, 3).map((ref) => (
            <button
              key={ref.label}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onOpenProjectRef?.(node.projectSlug, ref)
              }}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                dark
                  ? 'border-zinc-700 bg-zinc-800/80 text-sky-300 hover:bg-zinc-700'
                  : 'border-zinc-200 bg-zinc-50 text-sky-700 hover:bg-zinc-100'
              }`}
            >
              <span className="truncate max-w-[84px]">{ref.label}</span>
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </button>
          ))}
        </div>

        {!node.locked && onDelete && (
          <button
            type="button"
            aria-label="Remove C02 project card"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(node.id)
            }}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
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
  )
}
