import React, { useMemo, useState } from 'react'
import { Plus, Search, Users, X } from 'lucide-react'
import { SPACE_NODE_DRAG_MIME, serializeNodeDropPayload } from '../core/canvas-nodes'
import {
  A01_GROUPS,
  A01_ROLE_IDS,
  AGENT_ROLE_ACCESSORIES,
  type A01GroupId,
  type AgentRoleId
} from '../generated/a01-roles'
import type { DragItem } from '../space-drag'
import { MiniSpacewareSprite } from '../sprites/space-sprite'

export function A01RosterDrawer({
  open,
  dark,
  onClose,
  onRequestSpawn,
  onStartPointerDrag
}: {
  open: boolean
  dark: boolean
  onClose: () => void
  onRequestSpawn: (roleId: AgentRoleId) => void
  onStartPointerDrag?: (item: DragItem) => (event: React.PointerEvent) => void
}): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState<'all' | A01GroupId>('all')

  const filteredRoles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return A01_ROLE_IDS.filter((roleId) => {
      const meta = AGENT_ROLE_ACCESSORIES[roleId]
      if (groupFilter !== 'all' && meta.group !== groupFilter) {
        return false
      }
      if (!q) {
        return true
      }
      return (
        roleId.toLowerCase().includes(q) ||
        meta.label.toLowerCase().includes(q) ||
        meta.tagline.toLowerCase().includes(q) ||
        meta.archetype.toLowerCase().includes(q)
      )
    })
  }, [groupFilter, query])

  if (!open) {
    return null
  }

  return (
    <div
      data-space-drawer="a01-roster"
      data-testid="a01-roster-drawer"
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
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-400" />
          <div>
            <div className="text-[12px] font-semibold">
              A01 Registered Team ({A01_ROLE_IDS.length})
            </div>
            <div className="text-[10px] text-zinc-400">Drag onto whiteboard or click Spawn</div>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close A01 Roster"
          onClick={onClose}
          className={`rounded-lg p-1 transition-colors ${
            dark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-100'
          }`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2 p-2.5">
        <div
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${
            dark ? 'border-zinc-700/80 bg-zinc-950/70' : 'border-zinc-200 bg-zinc-50'
          }`}
        >
          <Search className="h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 18 registered A01 roles…"
            className="w-full bg-transparent text-[11px] outline-none placeholder:text-zinc-500"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setGroupFilter('all')}
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
              groupFilter === 'all'
                ? 'bg-indigo-500 text-white'
                : dark
                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            All ({A01_ROLE_IDS.length})
          </button>
          {A01_GROUPS.map((grp) => (
            <button
              key={grp.id}
              type="button"
              onClick={() => setGroupFilter(grp.id)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                groupFilter === grp.id
                  ? 'bg-indigo-500 text-white'
                  : dark
                    ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              {grp.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-2.5 pb-3">
        {filteredRoles.map((roleId) => {
          const meta = AGENT_ROLE_ACCESSORIES[roleId]
          const serialized = serializeNodeDropPayload({ kind: 'a01-role', roleId })
          return (
            <div
              key={roleId}
              data-testid={`a01-roster-role-${roleId}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'copy'
                event.dataTransfer.setData(SPACE_NODE_DRAG_MIME, serialized)
                event.dataTransfer.setData('text/plain', serialized)
              }}
              onPointerDown={
                onStartPointerDrag ? onStartPointerDrag({ kind: 'a01-role', roleId }) : undefined
              }
              className={`flex cursor-grab items-center justify-between gap-2 rounded-xl border p-2 transition-colors active:cursor-grabbing ${
                dark
                  ? 'border-zinc-800 bg-zinc-950/55 hover:border-indigo-500/45 hover:bg-zinc-800/70'
                  : 'border-zinc-200 bg-zinc-50/75 hover:border-indigo-300 hover:bg-indigo-50/40'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                    dark ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-200 bg-white'
                  }`}
                >
                  <MiniSpacewareSprite role={roleId} awake size={26} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-semibold">{meta.label}</span>
                    <span
                      className={`rounded px-1 py-0.2 text-[9px] font-medium ${
                        meta.longTermEmployeeCapable
                          ? dark
                            ? 'bg-violet-500/20 text-violet-200'
                            : 'bg-violet-100 text-violet-700'
                          : dark
                            ? 'bg-amber-500/20 text-amber-200'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {meta.longTermEmployeeCapable ? '🧠 A01' : '⚡ Worker'}
                    </span>
                  </div>
                  <div className="truncate text-[10px] text-zinc-400">{meta.tagline}</div>
                </div>
              </div>

              <button
                type="button"
                data-testid={`spawn-role-btn-${roleId}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onRequestSpawn(roleId)
                }}
                className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors ${
                  dark
                    ? 'border-indigo-400/40 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/35'
                    : 'border-indigo-300 bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                <Plus className="h-3 w-3" />
                <span>Spawn</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
