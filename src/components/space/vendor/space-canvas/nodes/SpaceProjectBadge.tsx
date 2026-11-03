import React, { useMemo } from 'react'
import { FolderKanban, MessageSquare, Plus, Users } from 'lucide-react'
import type { C02ProjectSummary } from '../core/canvas-nodes'
import { A01_ROLE_IDS } from '../generated/a01-roles'
import { BUILTIN_C02_PROJECTS } from './SessionDrawer'

export function SpaceProjectBadge({
  dark,
  projectSlug,
  projects,
  sessionCount,
  rosterOpen,
  sessionDrawerOpen,
  onSelectProject,
  onDropActiveProjectCard,
  onToggleRoster,
  onToggleSessionDrawer
}: {
  dark: boolean
  projectSlug?: string
  projects?: readonly C02ProjectSummary[]
  sessionCount: number
  rosterOpen: boolean
  sessionDrawerOpen: boolean
  onSelectProject: (slug: string) => void
  onDropActiveProjectCard: (project: C02ProjectSummary) => void
  onToggleRoster: () => void
  onToggleSessionDrawer: () => void
}): React.JSX.Element {
  const catalog = useMemo(
    () => (projects && projects.length > 0 ? projects : BUILTIN_C02_PROJECTS),
    [projects]
  )
  const activeSlug = projectSlug || catalog[0]?.slug || 'x-labs'
  const activeProject: C02ProjectSummary = useMemo(
    () =>
      catalog.find((p) => p.slug === activeSlug) ?? {
        slug: activeSlug,
        title: activeSlug,
        readiness: 'green',
        productsCount: 0,
        channels: [],
        liveRefs: []
      },
    [activeSlug, catalog]
  )

  return (
    <div
      data-space-dock="project-header"
      data-testid="space-project-badge"
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute top-3 left-3 z-30 flex flex-wrap items-center gap-1.5"
    >
      <div
        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 shadow-lg backdrop-blur-md ${
          dark
            ? 'border-zinc-700/80 bg-zinc-900/90 text-zinc-100'
            : 'border-zinc-300 bg-white/95 text-zinc-900'
        }`}
      >
        <FolderKanban className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">C02</span>
        <select
          aria-label="Space C02 Project"
          data-testid="space-project-select"
          value={activeSlug}
          onChange={(e) => onSelectProject(e.target.value)}
          className="bg-transparent text-[11px] font-semibold outline-none"
        >
          {catalog.map((proj) => (
            <option
              key={proj.slug}
              value={proj.slug}
              className={dark ? 'bg-zinc-900 text-zinc-100' : 'bg-white text-zinc-900'}
            >
              {proj.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="drop-active-project-card"
          onClick={() => onDropActiveProjectCard(activeProject)}
          title="Drop C02 Project context card onto canvas"
          className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
            dark
              ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/35'
              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
          }`}
        >
          <Plus className="h-2.5 w-2.5" />
          <span>Card</span>
        </button>
      </div>

      <button
        type="button"
        data-testid="toggle-a01-roster"
        onClick={onToggleRoster}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-semibold shadow-lg backdrop-blur-md transition-colors ${
          rosterOpen
            ? 'border-indigo-400 bg-indigo-500 text-white'
            : dark
              ? 'border-zinc-700/80 bg-zinc-900/90 text-zinc-100 hover:bg-zinc-800'
              : 'border-zinc-300 bg-white/95 text-zinc-900 hover:bg-zinc-100'
        }`}
      >
        <Users className="h-3.5 w-3.5" />
        <span>A01 Roster ({A01_ROLE_IDS.length})</span>
      </button>

      <button
        type="button"
        data-testid="toggle-session-drawer"
        onClick={onToggleSessionDrawer}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-semibold shadow-lg backdrop-blur-md transition-colors ${
          sessionDrawerOpen
            ? 'border-sky-400 bg-sky-500 text-white'
            : dark
              ? 'border-zinc-700/80 bg-zinc-900/90 text-zinc-100 hover:bg-zinc-800'
              : 'border-zinc-300 bg-white/95 text-zinc-900 hover:bg-zinc-100'
        }`}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        <span>Sessions{sessionCount > 0 ? ` (${sessionCount})` : ''}</span>
      </button>
    </div>
  )
}
