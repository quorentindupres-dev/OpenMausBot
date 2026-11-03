import React, { useEffect } from 'react'

export type PresenceSubagentStatus = 'working' | 'waiting' | 'done'

export type PresenceSubagent = {
  id: string
  role: string
  status: PresenceSubagentStatus
  harness?: string
  updatedAt?: number
}

export type PresenceSplitPane = {
  id: number
  title?: string
  active?: boolean
  busy?: boolean
}

export type PresenceSplitInfo = {
  paneCount: number
  direction: 'horizontal' | 'vertical'
  panes: PresenceSplitPane[]
}

export type AgentPresenceFields = {
  subagents?: readonly PresenceSubagent[] | null
  splitInfo?: PresenceSplitInfo | null
}

const EMPTY_SUBAGENTS: readonly PresenceSubagent[] = []
export const AGENT_PRESENCE_STYLE_ID = 'xlabs-space-agent-presence-style'

const AGENT_PRESENCE_CSS = [
  '@keyframes xlabsSubagentBob{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-2.2px,0)}}',
  '@keyframes xlabsSubagentStemPulse{0%{transform:translate3d(0,-10px,0);opacity:0}28%{opacity:.95}75%{opacity:.85}100%{transform:translate3d(0,38px,0);opacity:0}}',
  '@keyframes xlabsSubagentDotWave{0%,80%,100%{opacity:.28;transform:translate3d(0,0,0)}40%{opacity:1;transform:translate3d(0,-1px,0)}}',
  '@keyframes xlabsSubagentWaitPulse{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.18)}}',
  '.xlabs-subagent-bob{animation:xlabsSubagentBob 1.8s ease-in-out infinite;will-change:transform}',
  '.xlabs-subagent-stem-pulse{animation:xlabsSubagentStemPulse 1.65s cubic-bezier(.22,1,.36,1) infinite;will-change:transform,opacity}',
  '.xlabs-subagent-dot-1{animation:xlabsSubagentDotWave 1.2s ease-in-out infinite}',
  '.xlabs-subagent-dot-2{animation:xlabsSubagentDotWave 1.2s ease-in-out infinite .18s}',
  '.xlabs-subagent-dot-3{animation:xlabsSubagentDotWave 1.2s ease-in-out infinite .36s}',
  '.xlabs-subagent-wait-dot{animation:xlabsSubagentWaitPulse 1.3s ease-in-out infinite}',
  '@media (prefers-reduced-motion:reduce){.xlabs-subagent-bob,.xlabs-subagent-stem-pulse,.xlabs-subagent-dot-1,.xlabs-subagent-dot-2,.xlabs-subagent-dot-3,.xlabs-subagent-wait-dot{animation:none!important}}'
].join('\n')

export function ensureAgentPresenceStyles(): void {
  if (typeof document === 'undefined') {
    return
  }
  let node = document.getElementById(AGENT_PRESENCE_STYLE_ID)
  if (!node) {
    node = document.createElement('style')
    node.id = AGENT_PRESENCE_STYLE_ID
    document.head.appendChild(node)
  }
  if (node.textContent !== AGENT_PRESENCE_CSS) {
    node.textContent = AGENT_PRESENCE_CSS
  }
}

export function readAgentSubagents(
  agent: AgentPresenceFields | null | undefined
): readonly PresenceSubagent[] {
  const list = agent?.subagents
  return Array.isArray(list) && list.length > 0 ? list : EMPTY_SUBAGENTS
}

export function readAgentSplitInfo(
  agent: AgentPresenceFields | null | undefined
): PresenceSplitInfo | null {
  const info = agent?.splitInfo
  return info && typeof info.paneCount === 'number' && info.paneCount >= 2 ? info : null
}

function compactRoleLabel(role: string): string {
  const trimmed = role.trim()
  if (!trimmed) {
    return 'Subagent'
  }
  return trimmed.length > 18 ? `${trimmed.slice(0, 17).trimEnd()}…` : trimmed
}

export const SleepingAgentGlyph = React.memo(function SleepingAgentGlyph({
  size = 11,
  className = ''
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      data-sleeping-glyph="true"
      className={`shrink-0 text-zinc-500/75 ${className}`}
    >
      <path
        d="M8.5 8.5a3.3 3.3 0 1 1-6.6 0 3.3 3.3 0 0 1 6.6 0ZM8.8 2.6H12L8.8 5.8H12"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.78"
      />
    </svg>
  )
})

function MiniSubagentBotIcon({
  status,
  size = 12
}: {
  status: PresenceSubagentStatus
  size?: number
}): React.JSX.Element {
  const isWorking = status === 'working'
  const isWaiting = status === 'waiting'
  const headFill = '#f4f4f5'
  const headStroke = isWorking ? '#34d399' : isWaiting ? '#f59e0b' : 'rgba(0,0,0,0.22)'
  const eyeFill = status === 'done' ? '#52525b' : '#111'
  const haloFill = isWorking ? '#34d399' : isWaiting ? '#f59e0b' : ''

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      data-subagent-bot-icon={status}
      className="shrink-0 overflow-visible"
    >
      {haloFill ? (
        <rect x="1" y="1.5" width="14" height="13" rx="4.5" fill={haloFill} fillOpacity="0.2" />
      ) : null}
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="10.2"
        rx="3.4"
        fill={headFill}
        stroke={headStroke}
        strokeWidth="1.2"
      />
      {isWorking ? (
        <path
          d="M4.8 5.6H11.2 M4.8 14.1H11.2"
          stroke="#10b981"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      ) : null}
      <path
        d={status === 'done' ? 'M5.2 7.8H7.2 M8.8 7.8H10.8' : 'M6.2 6.8V9.4 M9.8 6.8V9.4'}
        stroke={eyeFill}
        strokeWidth={status === 'done' ? '1.3' : '1.6'}
        strokeLinecap="round"
      />
    </svg>
  )
}

function selectVisibleSubagents(
  subagents: readonly PresenceSubagent[],
  maxVisible: number
): readonly PresenceSubagent[] {
  if (subagents.length <= maxVisible) {
    return subagents
  }
  const ranked = subagents.map((sub, idx) => ({
    sub,
    idx,
    rank: sub.status === 'working' ? 0 : sub.status === 'waiting' ? 1 : 2
  }))
  ranked.sort((a, b) => a.rank - b.rank || a.idx - b.idx)
  return ranked.slice(0, maxVisible).map((entry) => entry.sub)
}

export const SubagentBeneathSwarm = React.memo(function SubagentBeneathSwarm({
  subagents = EMPTY_SUBAGENTS,
  variant = 'map',
  maxVisible,
  className = ''
}: {
  subagents: readonly PresenceSubagent[]
  variant?: 'map' | 'sidebar' | 'bar'
  maxVisible?: number
  className?: string
}): React.JSX.Element | null {
  useEffect(() => {
    ensureAgentPresenceStyles()
  }, [])

  if (!subagents || subagents.length === 0) {
    return null
  }

  let workingCount = 0
  let waitingCount = 0
  for (const sub of subagents) {
    if (sub.status === 'working') {
      workingCount += 1
    } else if (sub.status === 'waiting') {
      waitingCount += 1
    }
  }
  const hasWorking = workingCount > 0
  const summaryTitle = `Subagents (${subagents.length}): ${subagents
    .map((s) => `${s.role || 'Subagent'} (${s.status})`)
    .join(', ')}`

  if (variant === 'bar') {
    const barTone = hasWorking
      ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-200'
      : waitingCount > 0
        ? 'border-amber-400/45 bg-amber-500/15 text-amber-200'
        : 'border-white/12 bg-zinc-900/80 text-zinc-400'
    return (
      <span
        data-subagent-swarm="bar"
        data-subagent-count={String(subagents.length)}
        title={summaryTitle}
        className={`inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border px-1.5 text-[9.5px] font-semibold leading-none tabular-nums ${barTone} ${className}`}
      >
        <MiniSubagentBotIcon
          status={hasWorking ? 'working' : waitingCount > 0 ? 'waiting' : 'done'}
          size={11}
        />
        <span>{subagents.length} sub</span>
      </span>
    )
  }

  const resolvedMax = Math.max(1, maxVisible ?? (variant === 'sidebar' ? 2 : 3))
  const visible = selectVisibleSubagents(subagents, resolvedMax)
  const overflowCount = Math.max(0, subagents.length - visible.length)
  const isMap = variant === 'map'

  return (
    <div
      data-subagent-swarm={variant}
      data-subagent-count={String(subagents.length)}
      title={summaryTitle}
      className={`flex flex-col ${
        isMap ? 'mt-1 w-full max-w-[144px]' : 'mt-0.5 w-full pl-3.5 pr-1 pb-0.5'
      } ${className}`}
    >
      <div className="relative flex flex-col gap-1 pl-2.5">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute top-0 bottom-2 left-[3px] w-[1.5px] overflow-hidden rounded-full ${
            hasWorking ? 'bg-emerald-500/30' : 'bg-white/14'
          }`}
        >
          {hasWorking ? (
            <span className="xlabs-subagent-stem-pulse block h-3 w-full rounded-full bg-emerald-300" />
          ) : null}
        </div>
        {visible.map((sub, idx) => {
          const isWorking = sub.status === 'working'
          const isWaiting = sub.status === 'waiting'
          const chipStyle = isWorking
            ? 'xlabs-subagent-bob border-emerald-400/45 bg-emerald-950/75 text-emerald-100 ring-1 ring-emerald-400/20'
            : isWaiting
              ? 'border-amber-400/45 bg-amber-950/65 text-amber-100 ring-1 ring-red-500/20'
              : 'border-white/[0.08] bg-zinc-900/80 text-zinc-400'
          return (
            <div key={sub.id} className="relative flex items-center">
              <div
                data-subagent-id={sub.id}
                data-subagent-status={sub.status}
                style={isWorking ? { animationDelay: `${idx * 220}ms` } : undefined}
                className={`flex h-[19px] min-w-0 flex-1 items-center gap-1 rounded-md border px-1.5 text-[9.5px] font-medium leading-none ${chipStyle}`}
              >
                <MiniSubagentBotIcon status={sub.status} size={12} />
                <span className="min-w-0 flex-1 truncate">{compactRoleLabel(sub.role)}</span>
              </div>
            </div>
          )
        })}
        {overflowCount > 0 ? (
          <span className="inline-flex h-4 w-fit items-center rounded-full border border-white/12 bg-zinc-900/90 px-1.5 font-mono text-[9px] font-semibold text-zinc-300 tabular-nums">
            +{overflowCount}
          </span>
        ) : null}
      </div>
    </div>
  )
})

export const SplitTerminalWindowPreview = React.memo(function SplitTerminalWindowPreview({
  splitInfo,
  variant = 'map',
  className = ''
}: {
  splitInfo: PresenceSplitInfo
  variant?: 'map' | 'compact'
  className?: string
}): React.JSX.Element | null {
  if (!splitInfo || splitInfo.paneCount < 2) {
    return null
  }
  const allPanes =
    splitInfo.panes.length > 0
      ? splitInfo.panes
      : Array.from({ length: Math.min(Math.max(2, splitInfo.paneCount), 3) }, (_, idx) => ({
          id: idx + 1,
          title: `Pane ${idx + 1}`,
          active: idx === 0
        }))
  const visiblePanes = allPanes.slice(0, 3)
  const isVertical = splitInfo.direction === 'vertical'
  const isMap = variant === 'map'

  return (
    <div
      data-split-terminal-preview={variant}
      className={`flex flex-col ${isMap ? 'mt-1 w-full max-w-[142px]' : 'w-full'} ${className}`}
    >
      <div
        className={`flex rounded-md border border-white/15 bg-zinc-950/90 p-0.5 shadow-inner ${
          isVertical ? 'flex-col gap-0.5' : 'flex-row items-stretch gap-0.5'
        }`}
      >
        {visiblePanes.map((pane, idx) => (
          <div
            key={pane.id}
            className={`flex min-w-0 flex-1 items-center gap-1 rounded-[3px] border px-1.5 py-0.5 ${
              pane.active
                ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-100'
                : 'border-white/[0.06] bg-zinc-900/95 text-zinc-300'
            }`}
          >
            <span className="shrink-0 font-mono text-[7.5px] font-bold text-emerald-300">
              &gt;_
            </span>
            <span className="min-w-0 flex-1 truncate text-[8.5px] font-medium leading-tight">
              {pane.title?.trim() || `Pane ${idx + 1}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})
