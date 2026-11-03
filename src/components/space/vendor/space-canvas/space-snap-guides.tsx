import React from 'react'
import type { View } from './core/space'
import type { SnapGuide } from './core/whiteboard-snap'

const STROKE = 'var(--op-snap-guide, #ec4899)'
const LABEL_TEXT = 'var(--op-snap-guide-text, #ffffff)'
const TICK = 5
const PILL_H = 16
const CHAR_W = 6.5

export type SpaceSnapGuidesProps = { guides: readonly SnapGuide[]; view: View }

function sx(x: number, view: View): number {
  return x * view.scale + view.x
}

function sy(y: number, view: View): number {
  return y * view.scale + view.y
}

export function formatGap(gap: number): string {
  const rounded = Math.round(gap)
  return Math.abs(gap - rounded) < 0.05 ? String(rounded) : gap.toFixed(1)
}

function LineGuide({
  g,
  view
}: {
  g: Extract<SnapGuide, { kind: 'line' }>
  view: View
}): React.JSX.Element {
  const p =
    g.axis === 'x'
      ? { x1: sx(g.at, view), x2: sx(g.at, view), y1: sy(g.from, view), y2: sy(g.to, view) }
      : { x1: sx(g.from, view), x2: sx(g.to, view), y1: sy(g.at, view), y2: sy(g.at, view) }
  return <line data-snap-guide="line" data-axis={g.axis} {...p} stroke={STROKE} strokeWidth={1} />
}

function GapGuide({
  g,
  view
}: {
  g: Extract<SnapGuide, { kind: 'gap' }>
  view: View
}): React.JSX.Element {
  const label = formatGap(g.gap)
  const pillW = label.length * CHAR_W + 10
  const a = g.axis === 'x' ? sx(g.from, view) : sy(g.from, view)
  const b = g.axis === 'x' ? sx(g.to, view) : sy(g.to, view)
  const c = g.axis === 'x' ? sy(g.cross, view) : sx(g.cross, view)
  const at = (main: number, cross: number): { x: number; y: number } =>
    g.axis === 'x' ? { x: main, y: cross } : { x: cross, y: main }
  const seg = (
    m1: number,
    c1: number,
    m2: number,
    c2: number
  ): { x1: number; y1: number; x2: number; y2: number } => {
    const p1 = at(m1, c1)
    const p2 = at(m2, c2)
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
  }
  const mid = at((a + b) / 2, c)
  const pill =
    g.axis === 'x'
      ? { x: mid.x - pillW / 2, y: mid.y - PILL_H - 4 }
      : { x: mid.x + 6, y: mid.y - PILL_H / 2 }
  return (
    <g data-snap-guide="gap" data-axis={g.axis}>
      <line {...seg(a, c - TICK, a, c + TICK)} stroke={STROKE} strokeWidth={1} />
      <line {...seg(b, c - TICK, b, c + TICK)} stroke={STROKE} strokeWidth={1} />
      <line {...seg(a, c, b, c)} stroke={STROKE} strokeWidth={1} />
      <rect x={pill.x} y={pill.y} width={pillW} height={PILL_H} rx={4} fill={STROKE} />
      <text
        x={pill.x + pillW / 2}
        y={pill.y + PILL_H / 2}
        fill={LABEL_TEXT}
        fontSize={11}
        fontFamily="var(--op-font, ui-sans-serif, system-ui, sans-serif)"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </g>
  )
}

export function SpaceSnapGuides({ guides, view }: SpaceSnapGuidesProps): React.JSX.Element | null {
  if (guides.length === 0) {
    return null
  }
  return (
    <svg
      data-space-snap-guides=""
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 42
      }}
    >
      {guides.map((g, i) =>
        g.kind === 'line' ? (
          <LineGuide key={`l${g.axis}${g.at}`} g={g} view={view} />
        ) : (
          <GapGuide key={`g${g.axis}${g.from}:${g.to}:${g.cross}:${i}`} g={g} view={view} />
        )
      )}
    </svg>
  )
}
