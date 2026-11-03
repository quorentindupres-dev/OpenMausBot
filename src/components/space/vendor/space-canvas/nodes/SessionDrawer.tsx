import React, { useMemo, useState } from 'react'
import { FolderKanban, MessageSquare, Plus, X } from 'lucide-react'
import {
  SPACE_NODE_DRAG_MIME,
  computerTargetMeta,
  serializeNodeDropPayload,
  type C02ProjectSummary,
  type DraggableSessionSummary
} from '../core/canvas-nodes'
import type { DragItem } from '../space-drag'
import { MiniSpacewareSprite } from '../sprites/space-sprite'
import { nodeStatusMeta } from './NodeResizeHandles'

export const BUILTIN_C02_PROJECTS: readonly C02ProjectSummary[] = [
  {
    slug: 'precision-peptide',
    title: 'Precision Peptide',
    readiness: 'green',
    readinessScore: 92,
    productsCount: 6,
    channels: ['Meta Ads', 'Educational VSL', 'Trustpilot', 'WhatsApp Backend'],
    liveRefs: [{ label: 'C02 Folder', path: 'C02__Project_database/precision-peptide' }]
  },
  {
    slug: 'surge',
    title: 'Surge',
    readiness: 'green',
    readinessScore: 86,
    productsCount: 3,
    channels: ['Meta Ads', 'UGC Hooks', 'Shop Funnel'],
    liveRefs: [{ label: 'C02 Folder', path: 'C02__Project_database/surge' }]
  },
  {
    slug: 'x-labs',
    title: 'X-Labs Platform',
    readiness: 'green',
    readinessScore: 95,
    productsCount: 4,
    channels: ['Internal Fleet', 'Orca Plus', 'OpenManus'],
    liveRefs: [{ label: 'C02 Folder', path: 'C02__Project_database/x-labs' }]
  }
]

export function SessionDrawer({
  open,
  dark,
  sessions,
  projects,
  onClose,
  onPlaceSession,
  onPlaceProject,
  onStartPointerDrag
}: {
  open: boolean
  dark: boolean
  sessions?: readonly DraggableSessionSummary[]
  projects?: readonly C02ProjectSummary[]
  onClose: () => void
  onPlaceSession: (session: DraggableSessionSummary) => void
  onPlaceProject: (project: C02ProjectSummary) => void
  onStartPointerDrag?: (item: DragItem) => (event: React.PointerEvent) => void
}): React.JSX.Element | null {
  const [tab, setTab] = useState<'sessions' | 'projects'>('sessions')
  const sessionList = sessions ?? []
  const projectList = useMemo(
    () => (projects && projects.length > 0 ? projects : BUILTIN_C02_PROJECTS),
    [projects]
  )

  if (!open) {
    return null
  }

  return (
    <div
      data-space-drawer="sessions-projects"
      data-testid="session-project-drawer"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className={`pointer-events-auto absolute top-14 left-3 z-40 flex max-h-[calc(100%-5rem)] w-80 flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${
        dark
          ? 'border-zinc-700/85 bg-zinc-900/95 text-zinc-100'
          : 'border-zinc-300 bg-white/96 text-zinc-900'
      }`}
    >
      <div
        className={`flex items-center justify-between border-b px-3.5 py-2.5 ${
          dark ? 'border-zinc-800' : 'border-zinc-200'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="drawer-tab-sessions"
            onClick={() => setTab('sessions')}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              tab === 'sessions'
                ? 'bg-sky-500 text-white'
                : dark
                  ? 'text-zinc-300 hover:bg-zinc-800'
                  : 'text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            <span>Sessions ({sessionList.length})</span>
          </button>
          <button
            type="button"
            data-testid="drawer-tab-projects"
            onClick={() => setTab('projects')}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              tab === 'projects'
                ? 'bg-emerald-500 text-white'
                : dark
                  ? 'text-zinc-300 hover:bg-zinc-800'
                  : 'text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            <FolderKanban className="h-3 w-3" />
            <span>C02 ({projectList.length})</span>
          </button>
        </div>
        <button
          type="button"
          aria-label="Close Sessions & Projects drawer"
          onClick={onClose}
          className={`rounded-lg p-1 ${
            dark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-100'
          }`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {tab === 'sessions' ? (
          sessionList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700/60 p-4 text-center text-[11px] text-zinc-400">
              No live sessions passed in <code>host.sessions</code> yet. Drag any session from your
              sidebar or spawn an A01 agent!
            </div>
          ) : (
            sessionList.map((session) => {
              const status = nodeStatusMeta(session.status)
              const comp = computerTargetMeta(session.computer)
              const serialized = serializeNodeDropPayload({ kind: 'session', session })
              return (
                <div
                  key={session.sessionId}
                  data-testid={`drawer-session-${session.sessionId}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy'
                    e.dataTransfer.setData(SPACE_NODE_DRAG_MIME, serialized)
                    e.dataTransfer.setData('text/plain', serialized)
                  }}
                  onPointerDown={
                    onStartPointerDrag
                      ? onStartPointerDrag({ kind: 'session', session })
                      : undefined
                  }
                  className={`flex cursor-grab items-center justify-between gap-2 rounded-xl border p-2 active:cursor-grabbing ${
                    dark
                      ? 'border-zinc-800 bg-zinc-950/60 hover:border-sky-500/40'
                      : 'border-zinc-200 bg-zinc-50 hover:border-sky-300'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MiniSpacewareSprite
                      role={session.roleId}
                      busy={session.status === 'working'}
                      attention={session.status === 'waiting'}
                      awake={session.status === 'working' || session.status === 'waiting'}
                      size={24}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold">{session.title}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                        <span>
                          {status.emoji} {status.label}
                        </span>
                        <span>·</span>
                        <span>{comp.shortBadge}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid={`place-session-${session.sessionId}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onPlaceSession(session)
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-sky-500/20 px-2 py-1 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/30"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Card</span>
                  </button>
                </div>
              )
            })
          )
        ) : (
          projectList.map((project) => {
            const serialized = serializeNodeDropPayload({ kind: 'project', project })
            return (
              <div
                key={project.slug}
                data-testid={`drawer-project-${project.slug}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy'
                  e.dataTransfer.setData(SPACE_NODE_DRAG_MIME, serialized)
                  e.dataTransfer.setData('text/plain', serialized)
                }}
                onPointerDown={
                  onStartPointerDrag ? onStartPointerDrag({ kind: 'project', project }) : undefined
                }
                className={`flex cursor-grab items-center justify-between gap-2 rounded-xl border p-2.5 active:cursor-grabbing ${
                  dark
                    ? 'border-zinc-800 bg-zinc-950/60 hover:border-emerald-500/40'
                    : 'border-zinc-200 bg-zinc-50 hover:border-emerald-300'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-semibold">{project.title}</span>
                    <span className="font-mono text-[10px] text-zinc-400">{project.slug}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-zinc-400">
                    Products: {project.productsCount} · {project.channels.slice(0, 2).join(', ')}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid={`place-project-${project.slug}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onPlaceProject(project)
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/30"
                >
                  <Plus className="h-3 w-3" />
                  <span>Card</span>
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
