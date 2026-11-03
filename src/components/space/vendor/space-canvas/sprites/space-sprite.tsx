import React, { useEffect } from 'react'
import { type AgentRoleId } from '../core/agent-identity'
import { BENCH_KEY, type ManualAgentStateMode, type SpaceAgent } from '../core/space'
import {
  SplitTerminalWindowPreview,
  SubagentBeneathSwarm,
  readAgentSplitInfo,
  readAgentSubagents
} from './space-agent-presence'
import { SpriteRoleAccessory, spriteRoleOf } from './space-sprite-accessory'

const SPRITE_STYLE_ID = 'xlabs-space-canvas-sprite-style'
const SPRITE_STYLE = `
@keyframes xlabs-spaceware-work-nod {
  0%, 100% { transform: translate3d(0, 1px, 0) rotate(5deg); }
  50% { transform: translate3d(1.5px, 3.5px, 0) rotate(8.5deg); }
}
@keyframes xlabs-spaceware-alert-hop {
  0%, 100% { transform: translate3d(0, 0, 0); }
  25% { transform: translate3d(0, -3.5px, 0) rotate(-2deg); }
  75% { transform: translate3d(0, -1.5px, 0) rotate(2deg); }
}
@keyframes xlabs-spaceware-sleep-breathe {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(0, 1.2px, 0) scale(0.985); }
}
.xlabs-spaceware-needing { animation: xlabs-spaceware-alert-hop 1.1s ease-in-out infinite; }
.xlabs-spaceware-working { transform-origin: 54px 48px; animation: xlabs-spaceware-work-nod 0.9s ease-in-out infinite; }
.xlabs-spaceware-sleeping { animation: xlabs-spaceware-sleep-breathe 3.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .xlabs-spaceware-needing, .xlabs-spaceware-working, .xlabs-spaceware-sleeping { animation: none !important; }
}
`

export const SPACEWARE_ISLAND_PALETTE = {
  bodyFill: '#f4f4f5',
  bodyStroke: 'rgba(0, 0, 0, 0.14)',
  bodyStrokeStrong: 'rgba(0, 0, 0, 0.22)',
  eyeFill: '#111111',
  sleepingEyeFill: '#52525b',
  warmHalo: '#a1a1aa',
  attentionHalo: '#ef4444',
  busyHalo: '#34d399',
  attentionEyeFill: '#111111'
} as const

export function useSpriteKeyframes(): void {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    let node = document.getElementById(SPRITE_STYLE_ID)
    if (!node) {
      node = document.createElement('style')
      node.id = SPRITE_STYLE_ID
      document.head.appendChild(node)
    }
    if (node.textContent !== SPRITE_STYLE) {
      node.textContent = SPRITE_STYLE
    }
  }, [])
}

export function MiniSpacewareSprite({
  busy = false,
  attention = false,
  awake = true,
  role = 'agent',
  size = 24
}: {
  busy?: boolean
  attention?: boolean
  awake?: boolean
  role?: AgentRoleId
  size?: number
}): React.JSX.Element {
  useSpriteKeyframes()
  const isSleeping = !awake && !busy && !attention
  const h = Math.round((size * 88) / 112)
  const stroke = attention
    ? SPACEWARE_ISLAND_PALETTE.attentionHalo
    : busy
      ? SPACEWARE_ISLAND_PALETTE.busyHalo
      : SPACEWARE_ISLAND_PALETTE.bodyStrokeStrong

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 112 88"
      fill="none"
      data-mini-sprite-role={role}
      aria-hidden="true"
    >
      <circle
        cx={busy ? '42' : '16'}
        cy="61"
        r="7"
        fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
        stroke={stroke}
        strokeWidth="1.6"
      />
      <SpriteRoleAccessory role={role} layer="prop" weight={size <= 28 ? 1.35 : 1} />
      <rect
        x="28"
        y="16"
        width="52"
        height="49"
        rx="15.5"
        fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
        stroke={stroke}
        strokeWidth={attention || busy ? '2.4' : '1.6'}
      />
      {isSleeping ? (
        <>
          <rect
            x="55.5"
            y="39.5"
            width="6.5"
            height="2.8"
            rx="1.4"
            fill={SPACEWARE_ISLAND_PALETTE.sleepingEyeFill}
          />
          <rect
            x="65"
            y="39.5"
            width="6.5"
            height="2.8"
            rx="1.4"
            fill={SPACEWARE_ISLAND_PALETTE.sleepingEyeFill}
          />
        </>
      ) : (
        <>
          <rect x="57" y="34" width="4.8" height="11.5" rx="2.4" fill="#111111" />
          <rect x="66.5" y="34" width="4.8" height="11.5" rx="2.4" fill="#111111" />
        </>
      )}
      <SpriteRoleAccessory role={role} layer="head" weight={size <= 28 ? 1.35 : 1} />
    </svg>
  )
}

export function SpacewareSprite({
  agent,
  tileKey = BENCH_KEY,
  taskText,
  hasOpenAsk = false,
  isSelected = false,
  onSelect,
  onClick,
  onStartDrag,
  onPointerDown,
  onRemove,
  onChangeState: _onChangeState,
  isDragging = false
}: {
  agent: SpaceAgent
  tileKey?: string
  taskText?: string
  hasOpenAsk?: boolean
  isSelected?: boolean
  onSelect?: () => void
  onClick?: () => void
  onStartDrag?: (e: React.PointerEvent) => void
  onPointerDown?: (e: React.PointerEvent) => void
  onRemove?: () => void
  onChangeState?: (mode: ManualAgentStateMode) => void
  isDragging?: boolean
}): React.JSX.Element {
  useSpriteKeyframes()
  const needsAttention = Boolean(agent.attention) || hasOpenAsk
  const isBusy = Boolean(agent.busy) && !needsAttention
  const isSleeping = !needsAttention && !isBusy
  const role = spriteRoleOf({ name: agent.name, role: agent.role })
  const statusDot = needsAttention ? '#ef4444' : isBusy ? '#34d399' : '#71717a'
  const handleSelect = onSelect ?? onClick
  const handleDrag = onStartDrag ?? onPointerDown
  const subagents = readAgentSubagents(agent)
  const splitInfo = readAgentSplitInfo(agent)

  return (
    <div
      data-space-card={agent.id}
      data-space-in={tileKey}
      data-space-sprite={agent.id}
      data-sprite-role={role}
      onPointerDown={handleDrag}
      onClick={(e) => {
        e.stopPropagation()
        handleSelect?.()
      }}
      style={{
        width: 140,
        opacity: isDragging ? 0.45 : 1,
        cursor: handleDrag ? 'grab' : 'pointer',
        userSelect: 'none'
      }}
      className={`group/sprite relative flex flex-col items-center rounded-2xl p-1 transition ${
        isSelected ? 'ring-2 ring-sky-400/75 bg-sky-500/10' : ''
      }`}
    >
      {onRemove ? (
        <button
          type="button"
          title="Remove from Space"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute top-0.5 right-0.5 hidden size-5 items-center justify-center rounded-full bg-zinc-900/90 text-[10px] text-zinc-400 hover:text-rose-300 group-hover/sprite:flex"
        >
          ✕
        </button>
      ) : null}
      <div
        className={
          needsAttention
            ? 'xlabs-spaceware-needing'
            : isBusy
              ? 'xlabs-spaceware-working'
              : 'xlabs-spaceware-sleeping'
        }
      >
        <MiniSpacewareSprite
          busy={isBusy}
          attention={needsAttention}
          awake={!isSleeping}
          role={role}
          size={78}
        />
      </div>
      <div
        style={{
          marginTop: 2,
          maxWidth: 138,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          border: `1px solid ${needsAttention ? 'rgba(239,68,68,0.55)' : isBusy ? 'rgba(52,211,153,0.45)' : 'rgba(255,255,255,0.14)'}`,
          background: needsAttention
            ? 'rgba(69,10,10,0.85)'
            : isBusy
              ? 'rgba(6,78,59,0.72)'
              : 'rgba(24,24,27,0.82)',
          color: '#f4f4f5'
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusDot,
            flexShrink: 0
          }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.name}
        </span>
      </div>
      {taskText || agent.activity ? (
        <div
          style={{
            marginTop: 2,
            maxWidth: 136,
            fontSize: 9.5,
            color: 'rgba(244,244,245,0.68)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {taskText ?? agent.activity}
        </div>
      ) : null}
      {splitInfo ? <SplitTerminalWindowPreview splitInfo={splitInfo} variant="map" /> : null}
      {subagents.length > 0 ? <SubagentBeneathSwarm subagents={subagents} variant="map" /> : null}
    </div>
  )
}
