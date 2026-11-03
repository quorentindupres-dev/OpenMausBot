import React, { useEffect, useMemo, useState } from 'react'
import { FolderKanban, Laptop, Sparkles, X } from 'lucide-react'
import {
  A01_SPAWN_MODES,
  SPACE_COMPUTER_TARGETS,
  type A01SpawnMode,
  type C02ProjectSummary,
  type SpaceComputerTarget
} from '../core/canvas-nodes'
import type { Point } from '../core/space'
import { AGENT_ROLE_ACCESSORIES, type AgentRoleId } from '../generated/a01-roles'
import { MiniSpacewareSprite } from '../sprites/space-sprite'

const DEFAULT_PROJECT_SLUGS = ['precision-peptide', 'surge', 'x-labs'] as const

export type PendingA01Spawn = {
  roleId: AgentRoleId
  position: Point
}

export function A01SpawnPopover({
  pending,
  dark,
  projects,
  defaultProjectSlug,
  onConfirm,
  onCancel
}: {
  pending: PendingA01Spawn | null
  dark: boolean
  projects?: readonly C02ProjectSummary[]
  defaultProjectSlug?: string
  onConfirm: (params: {
    roleId: AgentRoleId
    spawnMode: A01SpawnMode
    projectSlug: string
    computer: SpaceComputerTarget
    position: Point
  }) => void
  onCancel: () => void
}): React.JSX.Element | null {
  const roleMeta = pending ? AGENT_ROLE_ACCESSORIES[pending.roleId] : null

  const projectOptions = useMemo(() => {
    const slugs = new Map<string, string>()
    if (projects) {
      for (const proj of projects) {
        slugs.set(proj.slug, `${proj.title} (${proj.slug})`)
      }
    }
    for (const fallback of DEFAULT_PROJECT_SLUGS) {
      if (!slugs.has(fallback)) {
        slugs.set(fallback, fallback)
      }
    }
    if (defaultProjectSlug && !slugs.has(defaultProjectSlug)) {
      slugs.set(defaultProjectSlug, defaultProjectSlug)
    }
    return [...slugs.entries()].map(([slug, label]) => ({ slug, label }))
  }, [defaultProjectSlug, projects])

  const initialMode: A01SpawnMode = roleMeta?.longTermEmployeeCapable
    ? 'long-term-employee'
    : 'temporary-worker'

  const [spawnMode, setSpawnMode] = useState<A01SpawnMode>(initialMode)
  const [projectSlug, setProjectSlug] = useState<string>(
    defaultProjectSlug || projectOptions[0]?.slug || 'x-labs'
  )
  const [computer, setComputer] = useState<SpaceComputerTarget>('local-ax')

  useEffect(() => {
    if (!pending) {
      return
    }
    const meta = AGENT_ROLE_ACCESSORIES[pending.roleId]
    setSpawnMode(meta.longTermEmployeeCapable ? 'long-term-employee' : 'temporary-worker')
    setProjectSlug(defaultProjectSlug || projectOptions[0]?.slug || 'x-labs')
    setComputer('local-ax')
  }, [defaultProjectSlug, pending, projectOptions])

  if (!pending || !roleMeta) {
    return null
  }

  return (
    <div
      data-space-drawer="a01-spawn-popover"
      data-testid="a01-spawn-popover"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          onConfirm({
            roleId: pending.roleId,
            spawnMode,
            projectSlug,
            computer,
            position: pending.position
          })
        }
      }}
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[2px]"
    >
      <div
        className={`w-[380px] rounded-2xl border p-4 shadow-2xl ${
          dark
            ? 'border-indigo-500/45 bg-zinc-900 text-zinc-100'
            : 'border-indigo-300 bg-white text-zinc-900'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                dark ? 'border-indigo-400/40 bg-indigo-500/15' : 'border-indigo-200 bg-indigo-50'
              }`}
            >
              <MiniSpacewareSprite role={pending.roleId} awake size={32} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-bold">{roleMeta.label}</span>
                <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                  {roleMeta.archetype}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400">{roleMeta.tagline}</div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cancel spawn"
            onClick={onCancel}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3.5 space-y-3">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
              1 · Registration Mode
            </div>
            <div className="grid grid-cols-2 gap-2">
              {A01_SPAWN_MODES.map((mode) => {
                const disabled =
                  mode.id === 'long-term-employee' && !roleMeta.longTermEmployeeCapable
                const active = spawnMode === mode.id
                return (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={disabled}
                    data-testid={`spawn-mode-${mode.id}`}
                    onClick={() => setSpawnMode(mode.id)}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      disabled
                        ? 'cursor-not-allowed opacity-40'
                        : active
                          ? dark
                            ? 'border-indigo-400 bg-indigo-500/20 text-white'
                            : 'border-indigo-500 bg-indigo-50 text-indigo-950'
                          : dark
                            ? 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    <div className="text-[11px] font-semibold">{mode.label}</div>
                    <div className="mt-0.5 text-[9px] leading-snug text-zinc-400">
                      {mode.subtitle}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="a01-spawn-project"
              className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase"
            >
              <FolderKanban className="h-3 w-3 text-emerald-400" />
              <span>2 · Bound C02 Project</span>
            </label>
            <select
              id="a01-spawn-project"
              data-testid="spawn-project-select"
              value={projectSlug}
              onChange={(e) => setProjectSlug(e.target.value)}
              className={`w-full rounded-xl border px-2.5 py-1.5 text-[12px] font-medium outline-none ${
                dark
                  ? 'border-zinc-700 bg-zinc-950 text-zinc-100'
                  : 'border-zinc-300 bg-zinc-50 text-zinc-900'
              }`}
            >
              {projectOptions.map((opt) => (
                <option key={opt.slug} value={opt.slug}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
              <Laptop className="h-3 w-3 text-sky-400" />
              <span>3 · Target Computer</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {SPACE_COMPUTER_TARGETS.map((target) => {
                const active = computer === target.id
                return (
                  <button
                    key={target.id}
                    type="button"
                    data-testid={`spawn-computer-${target.id}`}
                    onClick={() => setComputer(target.id)}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors ${
                      active
                        ? dark
                          ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                          : 'border-sky-500 bg-sky-50 text-sky-950'
                        : dark
                          ? 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    {target.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-xl px-3 py-1.5 text-[11px] font-medium ${
              dark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="confirm-a01-spawn"
            onClick={() =>
              onConfirm({
                roleId: pending.roleId,
                spawnMode,
                projectSlug,
                computer,
                position: pending.position
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-600"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Spawn on Canvas</span>
          </button>
        </div>
      </div>
    </div>
  )
}
