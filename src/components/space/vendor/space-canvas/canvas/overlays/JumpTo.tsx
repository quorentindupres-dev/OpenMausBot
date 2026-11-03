// WS-D (TASK_16 wave 2): ⌘F jump to an agent or a Space by name. Same match as the Sessions sidebar
// filter in space-palette.tsx (name, Space title, subagent roles, split pane titles; see
// matchesSessionQuery), plus the agent's role and Space titles / goals. Enter or click = glide to the
// tile (+ select the agent). Never changes a goal or an ask. Owner: WS-D.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SpaceAgent, SpaceGoal } from '../../core/space'
import {
  readAgentSplitInfo,
  readAgentSubagents,
  type AgentPresenceFields
} from '../../sprites/space-agent-presence'
import { MiniSpacewareSprite } from '../../sprites/space-sprite'
import { spriteRoleOf } from '../../sprites/space-sprite-accessory'
import { isImeOwnedKeyboardEvent } from '../../core/ime-guard'
import type { CanvasCtx } from '../canvas-ctx'
import type { AskPinsApi } from './use-ask-pins'

/**
 * The Sessions sidebar match (space-palette.tsx filteredSessions), as one pure function so the
 * sidebar and ⌘F agree. `query` is already trimmed and lower case.
 */
export function matchesSessionQuery(
  agent: SpaceAgent,
  query: string,
  spaceTitle: string | undefined,
  activityText?: string
): boolean {
  const presence = agent as SpaceAgent & AgentPresenceFields
  return (
    agent.name.toLowerCase().includes(query) ||
    (spaceTitle?.toLowerCase().includes(query) ?? false) ||
    (activityText?.toLowerCase().includes(query) ?? false) ||
    readAgentSubagents(presence).some((s) => s.role.toLowerCase().includes(query)) ||
    (readAgentSplitInfo(presence)?.panes.some((p) => p.title?.toLowerCase().includes(query)) ??
      false)
  )
}

export type JumpTarget =
  | { kind: 'agent'; id: string; label: string; sub: string; agent: SpaceAgent }
  | { kind: 'goal'; id: string; label: string; sub: string }

/** Agents first (name starts with the query ranks higher), then Spaces. Max `limit` rows. */
export function searchJumpTargets(
  agents: readonly SpaceAgent[],
  goals: readonly SpaceGoal[],
  tileOfAgent: ReadonlyMap<string, string>,
  rawQuery: string,
  limit = 8
): JumpTarget[] {
  const query = rawQuery.trim().toLowerCase()
  const titleOf = new Map(goals.map((goal) => [goal.id, goal.title]))
  const agentRows: (JumpTarget & { rank: number })[] = []
  for (const agent of agents) {
    const tile = tileOfAgent.get(agent.id)
    const spaceTitle = tile ? titleOf.get(tile) : undefined
    const role = spriteRoleOf(agent)
    const hit =
      !query ||
      matchesSessionQuery(agent, query, spaceTitle) ||
      role.toLowerCase().includes(query) ||
      (agent.role?.toLowerCase().includes(query) ?? false)
    if (!hit) {
      continue
    }
    const name = agent.name.toLowerCase()
    agentRows.push({
      kind: 'agent',
      id: agent.id,
      label: agent.name,
      sub: spaceTitle ?? 'Bench',
      agent,
      rank: !query ? 2 : name.startsWith(query) ? 0 : name.includes(query) ? 1 : 2
    })
  }
  agentRows.sort((a, b) => a.rank - b.rank)
  const goalRows: JumpTarget[] = []
  for (const goal of goals) {
    if (goal.status === 'done') {
      continue
    }
    if (
      !query ||
      goal.title.toLowerCase().includes(query) ||
      goal.goal.toLowerCase().includes(query)
    ) {
      goalRows.push({ kind: 'goal', id: goal.id, label: goal.title, sub: 'Space' })
    }
  }
  return [...agentRows.map(({ rank: _rank, ...row }) => row as JumpTarget), ...goalRows].slice(
    0,
    limit
  )
}

export function JumpTo({
  ctx,
  api,
  onClose
}: {
  ctx: CanvasCtx
  api: AskPinsApi
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const results = useMemo(
    () => searchJumpTargets(ctx.agents, ctx.space.goals, api.tileOfAgent, query),
    [api.tileOfAgent, ctx.agents, ctx.space.goals, query]
  )
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  const pick = (target: JumpTarget | undefined): void => {
    if (!target) {
      return
    }
    if (target.kind === 'agent') {
      api.goToAgent(target.id)
    } else {
      api.goToTile(target.id)
    }
    onClose()
  }
  const active = Math.min(cursor, Math.max(0, results.length - 1))
  return (
    <div
      data-jump-to="true"
      role="dialog"
      aria-label="Jump to agent or Space"
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto absolute left-1/2 top-3 z-40 w-[320px] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-md"
    >
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Jump to agent or Space…"
        aria-label="Jump to agent or Space by name"
        onChange={(event) => {
          setQuery(event.target.value)
          setCursor(0)
        }}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
            onClose()
          }
        }}
        onKeyDown={(event) => {
          if (isImeOwnedKeyboardEvent(event)) {
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            setCursor((c) => Math.min(c + 1, results.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            pick(results[active])
          }
        }}
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/25"
      />
      <ul
        role="listbox"
        aria-label="Matches"
        className="scrollbar-sleek mt-1 max-h-[280px] overflow-y-auto"
      >
        {results.length === 0 ? (
          <li className="px-2.5 py-2 text-xs text-zinc-500">No agent or Space with that name.</li>
        ) : (
          results.map((target, i) => (
            <li
              key={`${target.kind}:${target.id}`}
              role="option"
              aria-selected={i === active}
              data-jump-target={`${target.kind}:${target.id}`}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(target)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                i === active ? 'bg-white/10 text-white' : 'text-zinc-300'
              }`}
            >
              {target.kind === 'agent' ? (
                <MiniSpacewareSprite
                  busy={target.agent.busy}
                  attention={target.agent.attention}
                  awake
                  role={spriteRoleOf(target.agent)}
                />
              ) : (
                <span aria-hidden="true" className="w-6 text-center text-xs text-zinc-500">
                  ▢
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{target.label}</span>
              <span className="shrink-0 text-[10px] text-zinc-500">{target.sub}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
