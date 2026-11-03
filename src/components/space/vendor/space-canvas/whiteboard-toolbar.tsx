import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUpRight,
  Bold,
  BringToFront,
  Copy,
  Lock,
  Pencil,
  Redo2,
  SendToBack,
  Trash2,
  Undo2,
  Unlock,
  X
} from 'lucide-react'
import { isImeOwnedKeyboardEvent } from './core/ime-guard'
import {
  A01_TEAM_SPAWNERS,
  DEFAULT_SPACE_MODEL_ID,
  LEVEL_STYLE,
  SPACE_HARNESS_MODELS,
  SPACE_LEVELS,
  buildSpawnerCommand,
  groupSpawners,
  type SpaceHarnessId,
  type SpaceLevel,
  type SpaceSpawner
} from './core/space'
import { SPACEWARE_ISLAND_PALETTE } from './sprites/space-sprite'

export type SpaceTeamSpawner = SpaceSpawner

export type ToolbarModelOption = {
  id: string
  label: string
  harness?: SpaceHarnessId
  badge?: string
}

const DOCK_HARNESS_PILLS: readonly { id: SpaceHarnessId; label: string }[] = [
  { id: 'agy', label: 'AGY' },
  { id: 'claude', label: 'Claude' },
  { id: 'grok', label: 'Grok' },
  { id: 'unchain', label: 'Unchain' }
]

// ---------------------------------------------------------------------------
// Shared Union Types (aligned 1:1 with Subagent A's whiteboard schema)
// ---------------------------------------------------------------------------

export type ToolbarToolMode = 'select' | 'marquee' | 'frame' | 'shape' | 'text' | 'arrow' | 'eraser'

export type ToolbarShapeType = 'rounded' | 'rect' | 'pill' | 'ellipse' | 'diamond'
export type ToolbarFillStyle = 'none' | 'soft' | 'solid' | 'glass' | 'paper' | 'paper-light'
export type ToolbarBorderStyle = 'none' | 'solid' | 'dashed'
export type ToolbarTextAlign = 'left' | 'center' | 'right'
export type ToolbarFontFamily = 'sans' | 'serif' | 'mono'
export type ToolbarArrowRouting = 'curve' | 'elbow' | 'straight'
export type ToolbarColor =
  'amber' | 'emerald' | 'sky' | 'rose' | 'violet' | 'indigo' | 'paper' | 'zinc'

export type ToolbarDockItemKind = 'space' | 'note' | 'shape' | 'text-card'

export type ToolbarTextCardPresetId =
  'backed-label' | 'paper-card' | 'paper-light-card' | 'heading-h1' | 'glass-callout' | 'mono-tag'

export type ToolbarTextPresetSpec = {
  id: ToolbarTextCardPresetId
  label: string
  subtitle: string
  sample: string
  fillStyle: ToolbarFillStyle
  borderStyle: ToolbarBorderStyle
  color: ToolbarColor
  fontFamily: ToolbarFontFamily
  fontSize: number
  bold: boolean
}

export type ToolbarDockDragOptions = {
  spaceLevel?: SpaceLevel
  color?: ToolbarColor
  shapeType?: ToolbarShapeType
  fillStyle?: ToolbarFillStyle
  borderStyle?: ToolbarBorderStyle
  fontFamily?: ToolbarFontFamily
  fontSize?: number
  bold?: boolean
  textCardPreset?: ToolbarTextCardPresetId
  defaultText?: string
}

export type ToolbarMultiAlign = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type ToolbarMultiDistribute = 'horizontal' | 'vertical'
export type WhiteboardInspectorKind = 'shape' | 'text' | 'note'

// ---------------------------------------------------------------------------
// Palette & Preset Catalogs
// ---------------------------------------------------------------------------

export const TOOLBAR_COLORS: readonly ToolbarColor[] = [
  'amber',
  'emerald',
  'sky',
  'rose',
  'violet',
  'indigo',
  'paper',
  'zinc'
]

export type ToolbarColorMeta = {
  label: string
  hex: string
  secondaryHex: string
  dotClass: string
  noteCardClass: string
  softPreviewClass: string
  solidPreviewClass: string
}

export const TOOLBAR_COLOR_SWATCH: Record<ToolbarColor, ToolbarColorMeta> = {
  amber: {
    label: 'Amber',
    hex: '#fbbf24',
    secondaryHex: '#f59e0b',
    dotClass: 'bg-amber-400',
    noteCardClass: 'bg-amber-300/95 border-amber-200/80 text-amber-950',
    softPreviewClass: 'bg-amber-400/18 border-amber-400/55 text-amber-100',
    solidPreviewClass: 'bg-amber-400 border-amber-300 text-zinc-950'
  },
  emerald: {
    label: 'Emerald',
    hex: '#34d399',
    secondaryHex: '#10b981',
    dotClass: 'bg-emerald-400',
    noteCardClass: 'bg-emerald-300/95 border-emerald-200/80 text-emerald-950',
    softPreviewClass: 'bg-emerald-400/18 border-emerald-400/55 text-emerald-100',
    solidPreviewClass: 'bg-emerald-400 border-emerald-300 text-zinc-950'
  },
  sky: {
    label: 'Sky',
    hex: '#38bdf8',
    secondaryHex: '#0ea5e9',
    dotClass: 'bg-sky-400',
    noteCardClass: 'bg-sky-300/95 border-sky-200/80 text-sky-950',
    softPreviewClass: 'bg-sky-400/18 border-sky-400/55 text-sky-100',
    solidPreviewClass: 'bg-sky-400 border-sky-300 text-zinc-950'
  },
  rose: {
    label: 'Rose',
    hex: '#fb7185',
    secondaryHex: '#f43f5e',
    dotClass: 'bg-rose-400',
    noteCardClass: 'bg-rose-300/95 border-rose-200/80 text-rose-950',
    softPreviewClass: 'bg-rose-400/18 border-rose-400/55 text-rose-100',
    solidPreviewClass: 'bg-rose-400 border-rose-300 text-zinc-950'
  },
  violet: {
    label: 'Violet',
    hex: '#a78bfa',
    secondaryHex: '#8b5cf6',
    dotClass: 'bg-violet-400',
    noteCardClass: 'bg-violet-300/95 border-violet-200/80 text-violet-950',
    softPreviewClass: 'bg-violet-400/18 border-violet-400/55 text-violet-100',
    solidPreviewClass: 'bg-violet-400 border-violet-300 text-zinc-950'
  },
  indigo: {
    label: 'Indigo',
    hex: '#818cf8',
    secondaryHex: '#6366f1',
    dotClass: 'bg-indigo-400',
    noteCardClass: 'bg-indigo-300/95 border-indigo-200/80 text-indigo-950',
    softPreviewClass: 'bg-indigo-400/18 border-indigo-400/55 text-indigo-100',
    solidPreviewClass: 'bg-indigo-400 border-indigo-300 text-zinc-950'
  },
  paper: {
    label: 'Paper',
    hex: '#faf9f6',
    secondaryHex: '#e7e5e4',
    dotClass: 'bg-[#faf9f6] ring-1 ring-inset ring-black/25',
    noteCardClass: 'bg-[#faf9f6] border-stone-300 text-zinc-900',
    softPreviewClass: 'bg-[#faf9f6]/92 border-stone-300 text-zinc-900',
    solidPreviewClass: 'bg-[#faf9f6] border-stone-300 text-zinc-950'
  },
  zinc: {
    label: 'Slate',
    hex: '#a1a1aa',
    secondaryHex: '#71717a',
    dotClass: 'bg-zinc-400',
    noteCardClass: 'bg-zinc-800 border-zinc-600/80 text-zinc-100',
    softPreviewClass: 'bg-zinc-800/85 border-zinc-500/60 text-zinc-100',
    solidPreviewClass: 'bg-zinc-200 border-zinc-100 text-zinc-950'
  }
}

export const TOOLBAR_SHAPES: readonly {
  id: ToolbarShapeType
  label: string
  shortLabel: string
}[] = [
  { id: 'rounded', label: 'Rounded', shortLabel: 'Round' },
  { id: 'rect', label: 'Rectangle', shortLabel: 'Rect' },
  { id: 'pill', label: 'Pill', shortLabel: 'Pill' },
  { id: 'ellipse', label: 'Circle', shortLabel: 'Circle' },
  { id: 'diamond', label: 'Diamond', shortLabel: 'Diamond' }
]

export const TOOLBAR_TEXT_PRESETS: readonly ToolbarTextPresetSpec[] = [
  {
    id: 'backed-label',
    label: 'Backed Label',
    subtitle: 'Solid pill + crisp text',
    sample: 'Label',
    fillStyle: 'solid',
    borderStyle: 'solid',
    color: 'amber',
    fontFamily: 'sans',
    fontSize: 16,
    bold: true
  },
  {
    id: 'paper-card',
    label: 'Island Paper Card',
    subtitle: 'Near-black glass + light text',
    sample: 'Note card',
    fillStyle: 'paper',
    borderStyle: 'solid',
    color: 'paper',
    fontFamily: 'serif',
    fontSize: 18,
    bold: false
  },
  {
    id: 'paper-light-card',
    label: 'Daylight Paper Card',
    subtitle: 'Warm #faf9f6 + ink (deliberate light)',
    sample: 'Note card',
    fillStyle: 'paper-light',
    borderStyle: 'solid',
    color: 'paper',
    fontFamily: 'serif',
    fontSize: 18,
    bold: false
  },
  {
    id: 'heading-h1',
    label: 'Heading H1',
    subtitle: 'Bold canvas title',
    sample: 'H1 Title',
    fillStyle: 'none',
    borderStyle: 'none',
    color: 'zinc',
    fontFamily: 'sans',
    fontSize: 36,
    bold: true
  },
  {
    id: 'glass-callout',
    label: 'Glass Callout',
    subtitle: 'Frosted dark frame',
    sample: 'Callout',
    fillStyle: 'glass',
    borderStyle: 'solid',
    color: 'sky',
    fontFamily: 'sans',
    fontSize: 16,
    bold: false
  },
  {
    id: 'mono-tag',
    label: 'Mono Tag',
    subtitle: 'Monospace badge',
    sample: 'P0 · KPI',
    fillStyle: 'soft',
    borderStyle: 'solid',
    color: 'emerald',
    fontFamily: 'mono',
    fontSize: 14,
    bold: true
  }
]

const FONT_SIZE_PRESETS: readonly { label: string; size: number }[] = [
  { label: 'S', size: 14 },
  { label: 'M', size: 18 },
  { label: 'L', size: 26 },
  { label: 'XL', size: 40 }
]

type DockPopoverId =
  | 'select-menu'
  | 'frame-menu'
  | 'arrow-menu'
  | 'shape-menu'
  | 'text-fan'
  | 'shapes-fan'
  | 'notes-fan'
  | 'spaces-fan'
  | 'agents-tray'

function isTypingElement(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el !== 'object') {
    return false
  }
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true
  }
  if (el.isContentEditable) {
    return true
  }
  return Boolean(
    el.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
  )
}

type HoverTooltipState = {
  id: string
  label: string
  shortcut?: string
  centerX: number
}

// ---------------------------------------------------------------------------
// Crisp Inline Vector Icons & AFFiNE Tactile Well Illustrations
// ---------------------------------------------------------------------------

function CursorPointerVector({ active }: { active: boolean }): React.JSX.Element {
  const stroke = active ? '#38bdf8' : 'currentColor'
  return (
    <svg viewBox="0 0 22 22" className="size-[19px]" fill="none" aria-hidden="true">
      <path
        d="M5.4 3.45a.75.75 0 0 1 1.07-.62l11.2 6.1a.75.75 0 0 1-.12 1.37l-4.65 1.48-1.95 4.52a.75.75 0 0 1-1.4-.08L5.44 3.68a.75.75 0 0 1-.04-.23Z"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinejoin="round"
        fill={active ? 'rgba(56, 189, 248, 0.14)' : 'none'}
      />
    </svg>
  )
}

function MarqueeSelectVector({ active }: { active: boolean }): React.JSX.Element {
  const stroke = active ? '#38bdf8' : 'currentColor'
  return (
    <svg viewBox="0 0 22 22" className="size-[19px]" fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="3.5"
        width="13"
        height="13"
        rx="2.5"
        stroke={stroke}
        strokeWidth="1.65"
        strokeDasharray="2.6 2.3"
        fill={active ? 'rgba(56, 189, 248, 0.12)' : 'none'}
      />
      <path
        d="M13.5 13.2l5 2.4-2.15.82-.82 2.15-2.03-5.37Z"
        stroke={stroke}
        strokeWidth="1.45"
        strokeLinejoin="round"
        fill={active ? '#38bdf8' : 'currentColor'}
      />
    </svg>
  )
}

function FrameGridVector({ active }: { active: boolean }): React.JSX.Element {
  const stroke = active ? '#38bdf8' : 'currentColor'
  return (
    <svg viewBox="0 0 22 22" className="size-[19px]" fill="none" aria-hidden="true">
      <path
        d="M7.5 3.75v14.5M14.5 3.75v14.5M3.75 7.5h14.5M3.75 14.5h14.5"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ConnectorCurveVector({
  active,
  routing
}: {
  active: boolean
  routing: ToolbarArrowRouting
}): React.JSX.Element {
  const stroke = active ? '#38bdf8' : 'currentColor'
  if (routing === 'elbow') {
    return (
      <svg viewBox="0 0 22 22" className="size-[19px]" fill="none" aria-hidden="true">
        <path
          d="M4.5 16.5h6.5v-10h6.5M14.3 3.7l3.2 2.8-3.2 2.8"
          stroke={stroke}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (routing === 'straight') {
    return (
      <svg viewBox="0 0 22 22" className="size-[19px]" fill="none" aria-hidden="true">
        <path
          d="M5 17L17 5M10.8 5H17v6.2"
          stroke={stroke}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 22 22" className="size-[19px]" fill="none" aria-hidden="true">
      <path
        d="M4.5 16.5c3.8 0 3.4-9.5 8.2-9.5h4.5M14.2 4.2l3.3 2.8-3.3 2.8"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShapeGlyph({
  shapeType,
  className = 'size-4',
  active = false
}: {
  shapeType: ToolbarShapeType
  className?: string
  active?: boolean
}): React.JSX.Element {
  const stroke = active ? '#38bdf8' : 'currentColor'
  const fill = active ? 'rgba(56, 189, 248, 0.14)' : 'none'
  switch (shapeType) {
    case 'rounded':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
          <rect
            x="3"
            y="3.5"
            width="14"
            height="13"
            rx="3.8"
            stroke={stroke}
            strokeWidth="1.7"
            fill={fill}
          />
        </svg>
      )
    case 'rect':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
          <rect
            x="3"
            y="3.5"
            width="14"
            height="13"
            rx="1"
            stroke={stroke}
            strokeWidth="1.7"
            fill={fill}
          />
        </svg>
      )
    case 'pill':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
          <rect
            x="2.5"
            y="5"
            width="15"
            height="10"
            rx="5"
            stroke={stroke}
            strokeWidth="1.7"
            fill={fill}
          />
        </svg>
      )
    case 'ellipse':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="6.8" stroke={stroke} strokeWidth="1.7" fill={fill} />
        </svg>
      )
    case 'diamond':
      return (
        <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
          <path
            d="M10 2.6 17.4 10 10 17.4 2.6 10 10 2.6Z"
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinejoin="round"
            fill={fill}
          />
        </svg>
      )
  }
}

function TextToolVector({ active }: { active: boolean }): React.JSX.Element {
  const stroke = active ? '#38bdf8' : 'currentColor'
  return (
    <svg viewBox="0 0 22 22" className="size-[19px]" fill="none" aria-hidden="true">
      <path
        d="M5 5.5V4.25h12V5.5M11 4.25v13.5M8.25 17.75h5.5"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EraserToolVector({ active }: { active: boolean }): React.JSX.Element {
  const stroke = active ? '#fb7185' : 'currentColor'
  return (
    <svg viewBox="0 0 22 22" className="size-[19px]" fill="none" aria-hidden="true">
      <path
        d="m13.2 4.3 4.5 4.5a1.6 1.6 0 0 1 0 2.26l-6.35 6.35a1.6 1.6 0 0 1-1.13.47H6.85a1.6 1.6 0 0 1-1.13-.47l-1.9-1.9a1.6 1.6 0 0 1 0-2.26L10.94 4.3a1.6 1.6 0 0 1 2.26 0ZM8.4 9.1l4.5 4.5M11.5 17.88h6.25"
        stroke={stroke}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={active ? 'rgba(251, 113, 133, 0.16)' : 'none'}
      />
    </svg>
  )
}

function MiniChevronUp({ open, active }: { open: boolean; active?: boolean }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 10 10"
      className={`size-2.5 transition-transform duration-150 ${open ? 'rotate-180' : ''} ${
        active ? 'text-sky-400' : 'text-zinc-400 group-hover/tool:text-zinc-200'
      }`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.1 6.3 5 3.4l2.9 2.9"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Tactile Object 1: AFFiNE tilted dark sheet with sculpted `T` & `H1` keycap tiles. */
function TactileTextCardArt({
  active,
  accentHex
}: {
  active: boolean
  accentHex: string
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 68 54"
      className="h-[52px] w-[66px] overflow-visible select-none"
      fill="none"
      aria-hidden="true"
    >
      {/* Tilted dark backing card peeking from bottom */}
      <g transform="rotate(4 34 34)">
        <rect
          x="10"
          y="6"
          width="48"
          height="52"
          rx="4"
          fill="#26262b"
          stroke={active ? '#38bdf8' : 'rgba(255,255,255,0.28)'}
          strokeWidth={active ? '1.4' : '1'}
        />
        <rect x="15" y="42" width="22" height="2" rx="1" fill="rgba(255,255,255,0.22)" />
        <rect x="39" y="42" width="11" height="2" rx="1" fill={accentHex} fillOpacity="0.65" />
      </g>

      {/* Left tilted mini pill-tag keycap */}
      <g transform="rotate(-9 17 24)">
        <rect
          x="6"
          y="15"
          width="19"
          height="18"
          rx="3.5"
          fill="#34343b"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="0.9"
        />
        <rect x="9.5" y="21" width="12" height="6" rx="3" fill={accentHex} fillOpacity="0.88" />
      </g>

      {/* Right tilted H1 keycap */}
      <g transform="rotate(9 51 24)">
        <rect
          x="41"
          y="14"
          width="21"
          height="19"
          rx="3.5"
          fill="#34343b"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="0.9"
        />
        <text
          x="51.5"
          y="27"
          textAnchor="middle"
          fill="#c4c4cc"
          fontSize="9.5"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          H1
        </text>
      </g>

      {/* Center hero sculpted T keycap */}
      <g transform="rotate(-2 34 26)">
        <rect x="21.5" y="15.5" width="23" height="22" rx="4" fill="rgba(0,0,0,0.45)" />
        <rect
          x="21"
          y="14"
          width="23"
          height="21.5"
          rx="4"
          fill="#3c3c44"
          stroke={active ? '#38bdf8' : 'rgba(255,255,255,0.2)'}
          strokeWidth="1"
        />
        <text
          x="32.5"
          y="29.5"
          textAnchor="middle"
          fill="#f4f4f5"
          fontSize="14.5"
          fontWeight="700"
          fontFamily="Georgia, ui-serif, serif"
        >
          T
        </text>
      </g>
    </svg>
  )
}

/** Tactile Object 2: AFFiNE overlapping Rounded Square + Circle + Triangle cluster. */
function TactileShapesClusterArt({
  colorHex,
  secondaryHex
}: {
  colorHex: string
  secondaryHex: string
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 70 54"
      className="h-[52px] w-[68px] overflow-visible select-none"
      fill="none"
      aria-hidden="true"
    >
      {/* Back Rounded Square */}
      <rect
        x="18"
        y="6"
        width="33"
        height="33"
        rx="6"
        fill={colorHex}
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="0.8"
      />
      {/* Subtle overlap shadow */}
      <circle cx="23.5" cy="39.5" r="15.5" fill="rgba(0,0,0,0.24)" />
      {/* Front-left Circle */}
      <circle cx="22" cy="40" r="15" fill={colorHex} stroke="rgba(0,0,0,0.16)" strokeWidth="0.8" />
      <circle cx="22" cy="40" r="14.2" fill={secondaryHex} fillOpacity="0.16" />
      {/* Shadow behind triangle */}
      <path d="M47.5 21.5 63.5 52H31.5L47.5 21.5Z" fill="rgba(0,0,0,0.24)" />
      {/* Front-right Crisp Triangle */}
      <path
        d="M49 21 64.5 52h-31L49 21Z"
        fill={colorHex}
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Tactile Object 4: Stacked tilted Sticky Note sheets with page curl. */
function TactileStickyStackArt({ color }: { color: ToolbarColor }): React.JSX.Element {
  const meta = TOOLBAR_COLOR_SWATCH[color]
  const isDarkInk = color !== 'zinc'
  const lineFill = isDarkInk ? 'rgba(24,24,27,0.32)' : 'rgba(244,244,245,0.35)'
  return (
    <svg
      viewBox="0 0 58 54"
      className="h-[52px] w-[56px] overflow-visible select-none"
      fill="none"
      aria-hidden="true"
    >
      {/* Back tilted sheet */}
      <g transform="rotate(-6 28 34)">
        <rect
          x="10"
          y="10"
          width="36"
          height="42"
          rx="4.5"
          fill="#3f3f46"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.9"
        />
      </g>
      {/* Front active sticky sheet */}
      <g transform="rotate(5 30 34)">
        <rect
          x="12"
          y="8"
          width="37"
          height="44"
          rx="5"
          fill={meta.hex}
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1"
        />
        <rect x="17" y="16" width="20" height="2.4" rx="1.2" fill={lineFill} />
        <rect x="17" y="22" width="25" height="2.1" rx="1.05" fill={lineFill} />
        <rect x="17" y="27.5" width="16" height="2.1" rx="1.05" fill={lineFill} />
        {/* Folded corner */}
        <path d="M41 8h8v8l-8-8Z" fill="rgba(0,0,0,0.18)" />
      </g>
    </svg>
  )
}

/** Tactile Object 5: AFFiNE multi-board miniature Space Frame priority stack. */
function TactileSpacesAgentsStackArt({ levelColor }: { levelColor: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 84 54"
      className="h-[48px] w-[62px] overflow-visible select-none"
      fill="none"
      aria-hidden="true"
    >
      {/* Back-left miniature workflow graph board */}
      <rect
        x="5"
        y="7"
        width="43"
        height="26"
        rx="4"
        fill="#1e1e24"
        stroke="rgba(255,255,255,0.26)"
        strokeWidth="0.9"
      />
      <path
        d="M14 17h8m5 0h7M24.5 19.5v5h7"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <rect x="8.5" y="15" width="6.5" height="4" rx="1" fill="#eab308" />
      <rect x="21.5" y="14.5" width="6" height="4.5" rx="1" fill="#4ade80" />
      <rect x="33.5" y="15" width="6.5" height="4" rx="1" fill="#a78bfa" />
      <rect x="31" y="22.5" width="6.5" height="4" rx="1" fill="#38bdf8" />

      {/* Back-right miniature sprint board */}
      <rect
        x="43"
        y="12"
        width="36"
        height="26"
        rx="4"
        fill="#1b1b20"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="0.9"
      />
      <rect x="46" y="16" width="11" height="16" rx="1.5" fill="#14532d" />
      <rect x="59" y="16" width="17" height="8" rx="1.5" fill="#155e75" />
      <rect x="59" y="26" width="17" height="6" rx="1.5" fill="#7f1d1d" />

      {/* Front hero 3-lane Space & Agent Kanban board */}
      <rect
        x="11"
        y="22"
        width="60"
        height="32"
        rx="4.5"
        fill="#18181c"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
      />
      {/* Priority band dot */}
      <circle cx="16.5" cy="26.5" r="2" fill={levelColor} />
      <rect x="21" y="25.5" width="14" height="2" rx="1" fill="rgba(255,255,255,0.38)" />

      {/* 3 Colorful lanes (Amber, Sky, Emerald) */}
      <rect x="14.5" y="30.5" width="16" height="21" rx="2" fill="#854d0e" fillOpacity="0.65" />
      <rect x="16.5" y="33" width="5.5" height="4" rx="0.8" fill="#fde047" />
      <rect x="23" y="33" width="5.5" height="4" rx="0.8" fill="#facc15" />
      <rect x="16.5" y="38.5" width="5.5" height="4" rx="0.8" fill="#fbbf24" />
      <rect x="23" y="38.5" width="5.5" height="4" rx="0.8" fill="#fb7185" />

      <rect x="33" y="30.5" width="16" height="21" rx="2" fill="#075985" fillOpacity="0.72" />
      <rect x="35" y="33" width="5.5" height="4" rx="0.8" fill="#7dd3fc" />
      <rect x="41.5" y="33" width="5.5" height="4" rx="0.8" fill="#38bdf8" />
      <rect x="35" y="38.5" width="5.5" height="4" rx="0.8" fill="#fbbf24" />

      <rect x="51.5" y="30.5" width="16" height="21" rx="2" fill="#14532d" fillOpacity="0.72" />
      <rect x="53.5" y="33" width="5.5" height="4" rx="0.8" fill="#86efac" />
      <rect x="60" y="33" width="5.5" height="4" rx="0.8" fill="#4ade80" />
      <rect x="53.5" y="38.5" width="5.5" height="4" rx="0.8" fill="#fcd34d" />
    </svg>
  )
}

/** Tactile Object 6: Peeking Spaceware white pixel-bot trio with emerald visor glow. */
function TactileAgentsCrewArt({ active }: { active: boolean }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 78 54"
      className="h-[49px] w-[70px] overflow-visible select-none"
      fill="none"
      aria-hidden="true"
    >
      {/* Subtle emerald ambient glow behind the bot squad */}
      <ellipse
        cx="39"
        cy="34"
        rx="30"
        ry="19"
        fill="#10b981"
        fillOpacity={active ? '0.28' : '0.16'}
      />

      {/* Left peeking wingman Spaceware bot */}
      <g transform="rotate(-8 20 38)">
        <rect
          x="6"
          y="20"
          width="24"
          height="26"
          rx="8"
          fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
          stroke={SPACEWARE_ISLAND_PALETTE.bodyStroke}
          strokeWidth="1.1"
        />
        <line
          x1="15"
          y1="28.5"
          x2="25"
          y2="28.5"
          stroke="#34d399"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <rect
          x="16"
          y="31"
          width="2.7"
          height="5.8"
          rx="1.35"
          fill={SPACEWARE_ISLAND_PALETTE.eyeFill}
        />
        <rect
          x="21"
          y="31"
          width="2.7"
          height="5.8"
          rx="1.35"
          fill={SPACEWARE_ISLAND_PALETTE.eyeFill}
        />
      </g>

      {/* Right peeking wingman Spaceware bot */}
      <g transform="rotate(8 58 38)">
        <rect
          x="48"
          y="20"
          width="24"
          height="26"
          rx="8"
          fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
          stroke={SPACEWARE_ISLAND_PALETTE.bodyStroke}
          strokeWidth="1.1"
        />
        <line
          x1="54"
          y1="28.5"
          x2="64"
          y2="28.5"
          stroke="#10b981"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <rect
          x="55"
          y="31"
          width="2.7"
          height="5.8"
          rx="1.35"
          fill={SPACEWARE_ISLAND_PALETTE.eyeFill}
        />
        <rect
          x="60"
          y="31"
          width="2.7"
          height="5.8"
          rx="1.35"
          fill={SPACEWARE_ISLAND_PALETTE.eyeFill}
        />
        <g transform="translate(73 25) rotate(-30)">
          <rect
            x="-3"
            y="-5"
            width="6"
            height="10.5"
            rx="3"
            fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
            stroke={SPACEWARE_ISLAND_PALETTE.bodyStroke}
            strokeWidth="1"
          />
        </g>
      </g>

      {/* Center hero Spaceware black-island pixel-bot */}
      <g>
        <rect x="22" y="14" width="34" height="36" rx="11" fill="rgba(0,0,0,0.42)" />
        <circle
          cx="18.5"
          cy="43"
          r="4.2"
          fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
          stroke={SPACEWARE_ISLAND_PALETTE.bodyStroke}
          strokeWidth="1.1"
        />
        <rect
          x="22"
          y="12"
          width="34"
          height="35"
          rx="11"
          fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
          stroke={active ? '#34d399' : SPACEWARE_ISLAND_PALETTE.bodyStrokeStrong}
          strokeWidth={active ? '1.6' : '1.2'}
        />
        {/* Signature emerald visor brow + twin vertical eyes */}
        <line
          x1="36.5"
          y1="23.5"
          x2="49.5"
          y2="24.2"
          stroke="#10b981"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <rect
          x="38"
          y="26.8"
          width="3.5"
          height="7.6"
          rx="1.75"
          fill={SPACEWARE_ISLAND_PALETTE.eyeFill}
        />
        <rect
          x="44.5"
          y="26.8"
          width="3.5"
          height="7.6"
          rx="1.75"
          fill={SPACEWARE_ISLAND_PALETTE.eyeFill}
        />
        {/* Waving Spaceware capsule hand */}
        <g transform="translate(58.5 19) rotate(-32)">
          <rect
            x="-3.6"
            y="-6.5"
            width="7.2"
            height="13"
            rx="3.6"
            fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
            stroke={SPACEWARE_ISLAND_PALETTE.bodyStroke}
            strokeWidth="1.1"
          />
        </g>
        {/* Crisp emerald work bar */}
        <rect x="31" y="48.5" width="22" height="3.2" rx="1.6" fill="#34d399" fillOpacity="0.92" />
      </g>
    </svg>
  )
}

/** Miniature 22x18 Spaceware pixel-bot icon for draggable role cards in the spawn tray. */
function DockMiniSpacewareBot({ isShell }: { isShell: boolean }): React.JSX.Element {
  return (
    <svg
      width="22"
      height="18"
      viewBox="0 0 112 88"
      fill="none"
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <rect
        x="22"
        y="10"
        width="64"
        height="62"
        rx="22"
        fill={isShell ? '#38bdf8' : '#34d399'}
        fillOpacity={isShell ? '0.16' : '0.22'}
      />
      <circle
        cx="16"
        cy="62"
        r="7.5"
        fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
        stroke={SPACEWARE_ISLAND_PALETTE.bodyStrokeStrong}
        strokeWidth="1.5"
      />
      <rect
        x="28"
        y="16"
        width="52"
        height="50"
        rx="16"
        fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
        stroke={SPACEWARE_ISLAND_PALETTE.bodyStrokeStrong}
        strokeWidth="1.5"
      />
      {!isShell ? (
        <line
          x1="55"
          y1="31.5"
          x2="73"
          y2="32.5"
          stroke="#34d399"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      ) : null}
      <rect
        x="57"
        y="35.5"
        width="5"
        height="11.5"
        rx="2.5"
        fill={SPACEWARE_ISLAND_PALETTE.eyeFill}
      />
      <rect
        x="67"
        y="35.5"
        width="5"
        height="11.5"
        rx="2.5"
        fill={SPACEWARE_ISLAND_PALETTE.eyeFill}
      />
      <g transform="translate(87 24) rotate(-36)">
        <rect
          x="-6.5"
          y="-11"
          width="13"
          height="21"
          rx="6.5"
          fill={SPACEWARE_ISLAND_PALETTE.bodyFill}
          stroke={SPACEWARE_ISLAND_PALETTE.bodyStrokeStrong}
          strokeWidth="1.5"
        />
      </g>
    </svg>
  )
}

/** Multi-select alignment & distribution crisp 14x14 icons. */
function MultiAlignGlyph({ kind }: { kind: ToolbarMultiAlign }): React.JSX.Element {
  switch (kind) {
    case 'left':
      return (
        <svg viewBox="0 0 14 14" className="size-3.5" fill="none" aria-hidden="true">
          <path d="M2.2 2v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="4.2" y="3.2" width="7.5" height="2.8" rx="0.8" fill="currentColor" />
          <rect x="4.2" y="8" width="5.2" height="2.8" rx="0.8" fill="currentColor" />
        </svg>
      )
    case 'center':
      return (
        <svg viewBox="0 0 14 14" className="size-3.5" fill="none" aria-hidden="true">
          <path d="M7 1.8v10.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="2.5" y="3.2" width="9" height="2.8" rx="0.8" fill="currentColor" />
          <rect x="4" y="8" width="6" height="2.8" rx="0.8" fill="currentColor" />
        </svg>
      )
    case 'right':
      return (
        <svg viewBox="0 0 14 14" className="size-3.5" fill="none" aria-hidden="true">
          <path d="M11.8 2v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="2.3" y="3.2" width="7.5" height="2.8" rx="0.8" fill="currentColor" />
          <rect x="4.6" y="8" width="5.2" height="2.8" rx="0.8" fill="currentColor" />
        </svg>
      )
    case 'top':
      return (
        <svg viewBox="0 0 14 14" className="size-3.5" fill="none" aria-hidden="true">
          <path d="M2 2.2h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="3.2" y="4.2" width="2.8" height="7.5" rx="0.8" fill="currentColor" />
          <rect x="8" y="4.2" width="2.8" height="5.2" rx="0.8" fill="currentColor" />
        </svg>
      )
    case 'middle':
      return (
        <svg viewBox="0 0 14 14" className="size-3.5" fill="none" aria-hidden="true">
          <path d="M1.8 7h10.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="3.2" y="2.5" width="2.8" height="9" rx="0.8" fill="currentColor" />
          <rect x="8" y="4" width="2.8" height="6" rx="0.8" fill="currentColor" />
        </svg>
      )
    case 'bottom':
      return (
        <svg viewBox="0 0 14 14" className="size-3.5" fill="none" aria-hidden="true">
          <path d="M2 11.8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="3.2" y="2.3" width="2.8" height="7.5" rx="0.8" fill="currentColor" />
          <rect x="8" y="4.6" width="2.8" height="5.2" rx="0.8" fill="currentColor" />
        </svg>
      )
  }
}

function MultiDistributeGlyph({ axis }: { axis: ToolbarMultiDistribute }): React.JSX.Element {
  if (axis === 'horizontal') {
    return (
      <svg viewBox="0 0 14 14" className="size-3.5" fill="none" aria-hidden="true">
        <path
          d="M2 2.2v9.6M12 2.2v9.6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <rect x="5.6" y="3.5" width="2.8" height="7" rx="0.8" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 14 14" className="size-3.5" fill="none" aria-hidden="true">
      <path
        d="M2.2 2h9.6M2.2 12h9.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect x="3.5" y="5.6" width="7" height="2.8" rx="0.8" fill="currentColor" />
    </svg>
  )
}

/** Floating AFFiNE tooltip pill with crisp keycap badge and bottom pointer caret. */
function AffineFloatingTooltip({
  label,
  shortcut,
  centerX
}: {
  label: string
  shortcut?: string
  centerX: number
}): React.JSX.Element {
  return (
    <div
      style={{ left: `${Math.round(centerX)}px` }}
      className="pointer-events-none absolute -top-11 z-50 -translate-x-1/2 whitespace-nowrap"
    >
      <div className="relative flex items-center gap-2 rounded-[10px] border border-white/[0.09] bg-[#323237] px-2.5 py-1.5 text-[12px] font-medium text-zinc-200 shadow-[0_10px_26px_rgba(0,0,0,0.55)]">
        <span>{label}</span>
        {shortcut ? (
          <kbd className="rounded-[5px] bg-white/[0.11] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold leading-none text-zinc-200">
            {shortcut}
          </kbd>
        ) : null}
        <span
          aria-hidden="true"
          className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-r border-b border-white/[0.09] bg-[#323237]"
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1. WhiteboardEdgelessDock
// ---------------------------------------------------------------------------

export type WhiteboardEdgelessDockProps = {
  toolMode?: ToolbarToolMode
  onChangeToolMode?: (mode: ToolbarToolMode) => void
  activeShapeType?: ToolbarShapeType
  onChangeShapeType?: (shapeType: ToolbarShapeType) => void
  activeShapeColor?: ToolbarColor
  onChangeShapeColor?: (color: ToolbarColor) => void
  activeFillStyle?: ToolbarFillStyle
  onChangeFillStyle?: (fillStyle: ToolbarFillStyle) => void
  activeArrowRouting?: ToolbarArrowRouting
  onChangeArrowRouting?: (routing: ToolbarArrowRouting) => void
  activeArrowDash?: 'solid' | 'dashed'
  onChangeArrowDash?: (dash: 'solid' | 'dashed') => void
  dockSpaceLevel?: SpaceLevel
  onChangeDockSpaceLevel?: (level: SpaceLevel) => void
  dockNoteColor?: ToolbarColor
  onChangeDockNoteColor?: (color: ToolbarColor) => void
  spawners?: readonly SpaceSpawner[]
  selectedHarness?: SpaceHarnessId
  onSelectHarness?: (harness: SpaceHarnessId) => void
  selectedModelId?: string
  onSelectModelId?: (modelId: string) => void
  modelOptions?: readonly ToolbarModelOption[]
  askBeforeSpawn?: boolean
  onToggleAskBeforeSpawn?: (next: boolean) => void
  askModelOnDrop?: boolean
  onToggleAskModelOnDrop?: (next: boolean) => void
  onStartDockItemDrag?: (
    kind: ToolbarDockItemKind,
    event: React.PointerEvent,
    options?: ToolbarDockDragOptions
  ) => void
  onStartSpawnDrag?: (spawnerId: string, event: React.PointerEvent) => void
  onStartAgentSpawnDrag?: (spawnerId: string, event: React.PointerEvent) => void
  onSpawnAgent?: (spawner: SpaceSpawner) => void
  isDraggingSpawn?: boolean
  isDraggingBot?: boolean
  isOverTrash?: boolean
  activeTextPreset?: ToolbarTextCardPresetId
  onSelectTextPreset?: (preset: ToolbarTextPresetSpec) => void
  hintText?: string | null
  className?: string
  /** Narrow canvas: the tool row scrolls sideways with a visible thin scrollbar (never clipped silently). */
  narrow?: boolean
}

export type WhiteboardToolbarProps = WhiteboardEdgelessDockProps

export const WhiteboardEdgelessDock = React.memo(function WhiteboardEdgelessDock({
  toolMode = 'select',
  onChangeToolMode,
  activeShapeType = 'rounded',
  onChangeShapeType,
  activeShapeColor = 'amber',
  onChangeShapeColor,
  activeFillStyle = 'soft',
  onChangeFillStyle,
  activeArrowRouting = 'curve',
  onChangeArrowRouting,
  activeArrowDash = 'solid',
  onChangeArrowDash,
  dockSpaceLevel = 'P1',
  onChangeDockSpaceLevel,
  dockNoteColor = 'amber',
  onChangeDockNoteColor,
  spawners = A01_TEAM_SPAWNERS,
  selectedHarness,
  onSelectHarness,
  selectedModelId,
  onSelectModelId,
  modelOptions,
  askBeforeSpawn,
  onToggleAskBeforeSpawn,
  askModelOnDrop,
  onToggleAskModelOnDrop,
  onStartDockItemDrag,
  onStartSpawnDrag,
  onStartAgentSpawnDrag,
  onSpawnAgent,
  isDraggingSpawn = false,
  isDraggingBot = false,
  isOverTrash = false,
  activeTextPreset = 'backed-label',
  onSelectTextPreset,
  hintText,
  className = '',
  narrow = false
}: WhiteboardEdgelessDockProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const pillRef = useRef<HTMLDivElement | null>(null)
  const spawnTrayRef = useRef<HTMLDivElement | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const wellDragCleanupRef = useRef<(() => void) | null>(null)
  const wellDraggedRef = useRef(false)

  const [openPopover, setOpenPopover] = useState<DockPopoverId | null>(null)
  const [selectedPresetId, setSelectedPresetId] =
    useState<ToolbarTextCardPresetId>(activeTextPreset)
  const [hoveredTooltip, setHoveredTooltip] = useState<HoverTooltipState | null>(null)
  const [spawnSearch, setSpawnSearch] = useState('')
  const [internalModelId, setInternalModelId] = useState<string>(DEFAULT_SPACE_MODEL_ID)
  const [internalHarness, setInternalHarness] = useState<SpaceHarnessId>('agy')
  const [internalAsk, setInternalAsk] = useState<boolean>(true)
  const [isLocalDraggingSpawn, setIsLocalDraggingSpawn] = useState(false)

  const triggerSpawnDrag = onStartSpawnDrag ?? onStartAgentSpawnDrag
  const effectiveModelId = selectedModelId ?? internalModelId
  const effectiveAsk = askBeforeSpawn ?? askModelOnDrop ?? internalAsk

  const matchedKnownModel = useMemo(
    () =>
      modelOptions?.find((m) => m.id === effectiveModelId) ??
      SPACE_HARNESS_MODELS.find((m) => m.id === effectiveModelId),
    [effectiveModelId, modelOptions]
  )

  const activeHarness: SpaceHarnessId =
    selectedHarness ?? matchedKnownModel?.harness ?? internalHarness

  const resolvedTrayModels = useMemo(() => {
    if (modelOptions && modelOptions.length > 0) {
      const byHarness = modelOptions.filter((m) => m.harness === activeHarness)
      return byHarness.length > 0 ? byHarness : modelOptions
    }
    return SPACE_HARNESS_MODELS.filter((m) => m.harness === activeHarness)
  }, [activeHarness, modelOptions])

  const unchainOptgroupModels = useMemo(() => {
    if (modelOptions && modelOptions.length > 0) {
      return []
    }
    if (activeHarness === 'unchain') {
      return []
    }
    return SPACE_HARNESS_MODELS.filter((m) => m.harness === 'unchain')
  }, [activeHarness, modelOptions])

  const selectedSelectValue = useMemo(() => {
    if (
      resolvedTrayModels.some((m) => m.id === effectiveModelId) ||
      unchainOptgroupModels.some((m) => m.id === effectiveModelId)
    ) {
      return effectiveModelId
    }
    return resolvedTrayModels[0]?.id ?? effectiveModelId
  }, [effectiveModelId, resolvedTrayModels, unchainOptgroupModels])

  const filteredSpawners = useMemo(() => {
    const q = spawnSearch.trim().toLowerCase()
    if (!q) {
      return spawners
    }
    return spawners.filter(
      (spawner) =>
        spawner.label.toLowerCase().includes(q) ||
        spawner.subtitle.toLowerCase().includes(q) ||
        spawner.badge.toLowerCase().includes(q) ||
        spawner.id.toLowerCase().includes(q)
    )
  }, [spawnSearch, spawners])

  const spawnerSections = useMemo(() => groupSpawners(filteredSpawners), [filteredSpawners])

  const currentTextPreset =
    TOOLBAR_TEXT_PRESETS.find((p) => p.id === selectedPresetId) ?? TOOLBAR_TEXT_PRESETS[0]!
  const activeShapeMeta = TOOLBAR_COLOR_SWATCH[activeShapeColor]

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
      dragCleanupRef.current = null
      wellDragCleanupRef.current?.()
      wellDragCleanupRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isDraggingSpawn) {
      setOpenPopover((cur) => (cur === 'agents-tray' ? null : cur))
      setHoveredTooltip(null)
    }
  }, [isDraggingSpawn])

  useEffect(() => {
    const onShortcutKeyDown = (event: KeyboardEvent): void => {
      if (isImeOwnedKeyboardEvent(event) || event.defaultPrevented || event.repeat) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      if (
        isTypingElement(event.target) ||
        (typeof document !== 'undefined' && isTypingElement(document.activeElement))
      ) {
        return
      }
      if (event.key === 'a' || event.key === 'A') {
        event.preventDefault()
        setHoveredTooltip(null)
        setOpenPopover((cur) => (cur === 'agents-tray' ? null : 'agents-tray'))
      }
    }
    window.addEventListener('keydown', onShortcutKeyDown)
    return () => window.removeEventListener('keydown', onShortcutKeyDown)
  }, [])

  useEffect(() => {
    if (!openPopover) {
      return
    }
    const onWindowPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpenPopover(null)
      }
    }
    const onWindowKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpenPopover(null)
      }
    }
    window.addEventListener('pointerdown', onWindowPointerDown)
    window.addEventListener('keydown', onWindowKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onWindowPointerDown)
      window.removeEventListener('keydown', onWindowKeyDown)
    }
  }, [openPopover])

  const showSlotTooltip = useCallback(
    (id: string, label: string, shortcut: string | undefined, element: HTMLElement): void => {
      const pill = pillRef.current
      if (!pill) {
        return
      }
      const pillRect = pill.getBoundingClientRect()
      const slotRect = element.getBoundingClientRect()
      const centerX = slotRect.left - pillRect.left + slotRect.width / 2
      setHoveredTooltip({ id, label, shortcut, centerX })
    },
    []
  )

  const clearSlotTooltip = useCallback((id: string): void => {
    setHoveredTooltip((cur) => (cur?.id === id ? null : cur))
  }, [])

  const togglePopover = useCallback((id: DockPopoverId): void => {
    setHoveredTooltip(null)
    setOpenPopover((cur) => (cur === id ? null : id))
  }, [])

  /**
   * Arms drag-to-canvas immediately on pointerdown while preserving `< 4px` tap-to-open-fan!
   * When the pointer moves `>= 4px`, closes any open popover so the canvas is unobstructed.
   */
  const startTactileDragOrTap = useCallback(
    (
      event: React.PointerEvent,
      onArmDrag: (ev: React.PointerEvent) => void,
      onTap: () => void
    ): void => {
      if (event.button !== 0) {
        return
      }
      event.stopPropagation()
      dragCleanupRef.current?.()
      onArmDrag(event)

      const originX = event.clientX
      const originY = event.clientY
      let moved = false

      const cleanup = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        if (dragCleanupRef.current === cleanup) {
          dragCleanupRef.current = null
        }
      }

      const onMove = (moveEvent: PointerEvent): void => {
        if (!moved && Math.hypot(moveEvent.clientX - originX, moveEvent.clientY - originY) >= 4) {
          moved = true
          setOpenPopover(null)
          setHoveredTooltip(null)
        }
      }

      const onUp = (): void => {
        cleanup()
        if (!moved) {
          onTap()
        }
      }

      const onCancel = (): void => {
        cleanup()
      }

      dragCleanupRef.current = cleanup
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
    },
    []
  )

  const handleSelectHarness = useCallback(
    (harness: SpaceHarnessId): void => {
      setInternalHarness(harness)
      onSelectHarness?.(harness)
      const pool =
        modelOptions && modelOptions.some((m) => m.harness === harness)
          ? modelOptions
          : SPACE_HARNESS_MODELS
      const firstModel = pool.find((m) => m.harness === harness)
      if (firstModel) {
        setInternalModelId(firstModel.id)
        onSelectModelId?.(firstModel.id)
      }
    },
    [modelOptions, onSelectHarness, onSelectModelId]
  )

  const handleSelectModel = useCallback(
    (modelId: string): void => {
      setInternalModelId(modelId)
      const known =
        modelOptions?.find((m) => m.id === modelId) ??
        SPACE_HARNESS_MODELS.find((m) => m.id === modelId)
      if (known?.harness) {
        setInternalHarness(known.harness)
      }
      onSelectModelId?.(modelId)
    },
    [modelOptions, onSelectModelId]
  )

  const handleToggleAsk = useCallback((): void => {
    const next = !effectiveAsk
    setInternalAsk(next)
    onToggleAskBeforeSpawn?.(next)
    onToggleAskModelOnDrop?.(next)
  }, [effectiveAsk, onToggleAskBeforeSpawn, onToggleAskModelOnDrop])

  const handleSpawnerCardPointerDown = useCallback(
    (spawner: SpaceSpawner, event: React.PointerEvent): void => {
      if (event.button !== 0) {
        return
      }
      event.stopPropagation()
      dragCleanupRef.current?.()

      const originX = event.clientX
      const originY = event.clientY
      let dragBegan = false

      const cleanup = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        setIsLocalDraggingSpawn(false)
        if (dragCleanupRef.current === cleanup) {
          dragCleanupRef.current = null
        }
      }

      const onMove = (moveEvent: PointerEvent): void => {
        if (
          !dragBegan &&
          Math.hypot(moveEvent.clientX - originX, moveEvent.clientY - originY) >= 4
        ) {
          dragBegan = true
          if (spawnTrayRef.current) {
            spawnTrayRef.current.style.pointerEvents = 'none'
            spawnTrayRef.current.style.opacity = '0'
          }
          setIsLocalDraggingSpawn(true)
          setOpenPopover(null)
          setHoveredTooltip(null)
        }
      }

      const onUp = (): void => {
        const wasTap = !dragBegan
        cleanup()
        if (wasTap && onSpawnAgent) {
          onSpawnAgent(spawner)
          setOpenPopover(null)
        }
      }

      const onCancel = (): void => {
        cleanup()
      }

      dragCleanupRef.current = cleanup
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)

      triggerSpawnDrag?.(spawner.id, event)
    },
    [onSpawnAgent, triggerSpawnDrag]
  )

  const handleAgentsWellPointerDown = useCallback(
    (event: React.PointerEvent): void => {
      if (event.button !== 0) {
        return
      }
      event.stopPropagation()
      wellDraggedRef.current = false
      wellDragCleanupRef.current?.()
      if (!triggerSpawnDrag) {
        return
      }

      const originX = event.clientX
      const originY = event.clientY
      const capturedDownEvent = {
        ...event,
        button: 0,
        clientX: originX,
        clientY: originY
      } as React.PointerEvent
      const defaultSpawnerId = spawners[0]?.id ?? 'terminal'

      const cleanup = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
        window.removeEventListener('pointercancel', onEnd)
        if (wellDragCleanupRef.current === cleanup) {
          wellDragCleanupRef.current = null
        }
      }

      const onMove = (moveEvent: PointerEvent): void => {
        if (Math.hypot(moveEvent.clientX - originX, moveEvent.clientY - originY) > 6) {
          wellDraggedRef.current = true
          cleanup()
          setOpenPopover(null)
          setHoveredTooltip(null)
          triggerSpawnDrag(defaultSpawnerId, capturedDownEvent)
          if (typeof PointerEvent !== 'undefined') {
            window.dispatchEvent(
              new PointerEvent('pointermove', {
                clientX: moveEvent.clientX,
                clientY: moveEvent.clientY,
                pointerId: moveEvent.pointerId,
                buttons: moveEvent.buttons
              })
            )
          }
        }
      }

      const onEnd = (): void => {
        cleanup()
      }

      wellDragCleanupRef.current = cleanup
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onEnd)
      window.addEventListener('pointercancel', onEnd)
    },
    [spawners, triggerSpawnDrag]
  )

  const isSelectFamily = toolMode === 'select' || toolMode === 'marquee'

  const modeBanner =
    openPopover !== null
      ? null
      : hintText
        ? hintText
        : toolMode === 'eraser'
          ? 'Eraser active — click or swipe across items to delete · Esc to exit'
          : toolMode === 'shape'
            ? `Drag on canvas to draw ${TOOLBAR_SHAPES.find((s) => s.id === activeShapeType)?.label ?? 'shape'} · Esc to exit`
            : toolMode === 'frame'
              ? `Drag on canvas to frame a ${LEVEL_STYLE[dockSpaceLevel].shortLabel} Space · Esc to exit`
              : toolMode === 'marquee'
                ? 'Drag a box on canvas to multi-select items · V for pointer'
                : null

  return (
    <div
      ref={rootRef}
      data-space-dock="true"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        if (isTypingElement(event.target)) {
          event.stopPropagation()
          return
        }
        event.preventDefault()
      }}
      className={`pointer-events-none flex max-w-full flex-col items-center gap-2 ${className}`}
    >
      {/* Active Agent Drag Trash Drop Zone */}
      {isDraggingBot ? (
        <div
          data-space-remove="true"
          className={`pointer-events-auto flex items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-2 text-xs font-semibold shadow-2xl backdrop-blur-xl transition-all ${
            isOverTrash
              ? 'scale-105 border-rose-400 bg-rose-950/95 text-rose-100 ring-2 ring-rose-500/50'
              : 'border-rose-500/60 bg-[#18181b]/95 text-rose-300'
          }`}
        >
          <Trash2 className="size-3.5 shrink-0" />
          <span>
            {isOverTrash ? 'Release to remove & close agent' : 'Drop agent here to remove & close'}
          </span>
        </div>
      ) : modeBanner ? (
        <div className="pointer-events-auto max-w-full truncate rounded-full border border-white/12 bg-[#1c1c1f]/95 px-3.5 py-1 text-[11px] font-medium text-zinc-200 shadow-lg backdrop-blur-xl">
          {modeBanner}
        </div>
      ) : null}

      {/* Left-Cluster Mini Sub-Menu: Pointer vs Box Marquee */}
      {openPopover === 'select-menu' ? (
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/12 bg-[#1c1c1f]/96 p-1.5 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={() => {
              onChangeToolMode?.('select')
              setOpenPopover(null)
            }}
            className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 font-medium transition ${
              toolMode === 'select'
                ? 'bg-sky-500/18 text-sky-300 ring-1 ring-sky-400/40'
                : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <CursorPointerVector active={toolMode === 'select'} />
            <span>Pointer Select</span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">V</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeToolMode?.('marquee')
              setOpenPopover(null)
            }}
            className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 font-medium transition ${
              toolMode === 'marquee'
                ? 'bg-sky-500/18 text-sky-300 ring-1 ring-sky-400/40'
                : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <MarqueeSelectVector active={toolMode === 'marquee'} />
            <span>Box Marquee</span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">M</kbd>
          </button>
        </div>
      ) : null}

      {/* Left-Cluster Mini Sub-Menu: Default Space Frame Priority */}
      {openPopover === 'frame-menu' ? (
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-2xl border border-white/12 bg-[#1c1c1f]/96 p-1.5 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl">
          <span className="px-2 text-[11px] font-medium text-zinc-400">Frame priority</span>
          {SPACE_LEVELS.map((lvl) => {
            const st = LEVEL_STYLE[lvl]
            const active = dockSpaceLevel === lvl
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  onChangeDockSpaceLevel?.(lvl)
                  onChangeToolMode?.('frame')
                  setOpenPopover(null)
                }}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? 'bg-white/14 text-white ring-1 ring-sky-400/50'
                    : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <span className={`size-2 rounded-full ${st.dot}`} />
                <span>{st.shortLabel}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* Left-Cluster Mini Sub-Menu: Connector Routing & Dash */}
      {openPopover === 'arrow-menu' ? (
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/12 bg-[#1c1c1f]/96 p-1.5 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl">
          {(
            [
              { id: 'curve', label: 'Curved' },
              { id: 'elbow', label: 'Elbow 90°' },
              { id: 'straight', label: 'Straight' }
            ] satisfies readonly { id: ToolbarArrowRouting; label: string }[]
          ).map((opt) => {
            const active = activeArrowRouting === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChangeArrowRouting?.(opt.id)
                  onChangeToolMode?.('arrow')
                  setOpenPopover(null)
                }}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? 'bg-sky-500/18 text-sky-300 ring-1 ring-sky-400/45'
                    : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <ConnectorCurveVector active={active} routing={opt.id} />
                <span>{opt.label}</span>
              </button>
            )
          })}
          <span className="h-5 w-px bg-white/10" />
          {(
            [
              { id: 'solid', label: 'Solid' },
              { id: 'dashed', label: 'Dashed' }
            ] as const
          ).map((strokeOpt) => {
            const active = activeArrowDash === strokeOpt.id
            return (
              <button
                key={strokeOpt.id}
                type="button"
                onClick={() => {
                  onChangeArrowDash?.(strokeOpt.id)
                  onChangeToolMode?.('arrow')
                }}
                className={`rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? 'bg-white/14 text-white'
                    : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200'
                }`}
              >
                {strokeOpt.label}
              </button>
            )
          })}
        </div>
      ) : null}

      {/* Left-Cluster Mini Sub-Menu: Quick Draw Shape Picker */}
      {openPopover === 'shape-menu' ? (
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/12 bg-[#1c1c1f]/96 p-1.5 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl">
          {TOOLBAR_SHAPES.map((shape) => {
            const active = activeShapeType === shape.id
            return (
              <button
                key={shape.id}
                type="button"
                onClick={() => {
                  onChangeShapeType?.(shape.id)
                  onChangeToolMode?.('shape')
                  setOpenPopover(null)
                }}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? 'bg-sky-500/18 text-sky-300 ring-1 ring-sky-400/45'
                    : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <ShapeGlyph shapeType={shape.id} active={active} />
                <span>{shape.shortLabel}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* Right-Well Fan 1: Text & Backed-Text Style Fan */}
      {openPopover === 'text-fan' ? (
        <div className="pointer-events-auto max-w-full rounded-2xl border border-white/14 bg-[#1c1c1f]/97 p-3 text-xs text-zinc-100 shadow-2xl backdrop-blur-xl">
          <div className="mb-2.5 flex items-center justify-between gap-4 px-0.5">
            <span className="text-[11px] font-semibold text-zinc-200">
              Drag any Text Card onto canvas · or click to type on canvas
            </span>
            <button
              type="button"
              aria-label="Close text styles"
              onClick={() => setOpenPopover(null)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex max-w-full items-stretch gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TOOLBAR_TEXT_PRESETS.map((preset) => {
              const isPicked = selectedPresetId === preset.id
              const effectiveColor = preset.id === 'backed-label' ? activeShapeColor : preset.color
              const colorMeta = TOOLBAR_COLOR_SWATCH[effectiveColor]
              const sampleBadgeClass =
                preset.fillStyle === 'solid'
                  ? colorMeta.solidPreviewClass
                  : preset.fillStyle === 'paper'
                    ? 'bg-[#101115] border-white/20 text-zinc-100 font-serif'
                    : preset.fillStyle === 'paper-light'
                      ? 'bg-[#faf9f6] border-stone-300 text-zinc-900 font-serif'
                      : preset.fillStyle === 'glass'
                        ? 'bg-zinc-900/90 border-sky-400/45 text-sky-100'
                        : preset.fillStyle === 'soft'
                          ? `${colorMeta.softPreviewClass} font-mono`
                          : 'border-transparent bg-transparent text-zinc-100 text-sm font-extrabold'

              return (
                <div
                  key={preset.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(ev) =>
                    startTactileDragOrTap(
                      ev,
                      (dragEv) =>
                        onStartDockItemDrag?.('text-card', dragEv, {
                          textCardPreset: preset.id,
                          fillStyle: preset.fillStyle,
                          borderStyle: preset.borderStyle,
                          color: effectiveColor,
                          fontFamily: preset.fontFamily,
                          fontSize: preset.fontSize,
                          bold: preset.bold,
                          defaultText: preset.sample
                        }),
                      () => {
                        setSelectedPresetId(preset.id)
                        onChangeFillStyle?.(preset.fillStyle)
                        onChangeShapeColor?.(effectiveColor)
                        onSelectTextPreset?.({ ...preset, color: effectiveColor })
                        onChangeToolMode?.('text')
                        setOpenPopover(null)
                      }
                    )
                  }
                  onKeyDown={(ev) => {
                    if (isImeOwnedKeyboardEvent(ev)) {
                      return
                    }
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      setSelectedPresetId(preset.id)
                      onChangeFillStyle?.(preset.fillStyle)
                      onSelectTextPreset?.({ ...preset, color: effectiveColor })
                      onChangeToolMode?.('text')
                      setOpenPopover(null)
                    }
                  }}
                  className={`flex w-[112px] shrink-0 cursor-grab flex-col justify-between gap-2 rounded-xl border bg-zinc-900/90 p-2.5 transition-all hover:-translate-y-1 active:cursor-grabbing ${
                    isPicked
                      ? 'border-sky-400/75 ring-1 ring-sky-400/35'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="flex h-9 items-center justify-center">
                    <span
                      className={`truncate rounded-lg border px-2 py-1 text-[11px] font-semibold ${sampleBadgeClass}`}
                    >
                      {preset.sample}
                    </span>
                  </div>
                  <div>
                    <div className="truncate text-[11px] font-semibold text-zinc-100">
                      {preset.label}
                    </div>
                    <div className="truncate text-[9.5px] text-zinc-400">{preset.subtitle}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Right-Well Fan 2: Shapes & Fill Fan */}
      {openPopover === 'shapes-fan' ? (
        <div
          data-dock-shapes-fan="true"
          className="pointer-events-auto max-w-full space-y-2 rounded-2xl border border-white/14 bg-[#1c1c1f] p-2.5 text-xs text-zinc-100 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 px-0.5">
            <span className="text-[11px] font-semibold text-zinc-200">
              Drag any Shape onto canvas · or click to draw
            </span>
            <button
              type="button"
              aria-label="Close shapes fan"
              onClick={() => setOpenPopover(null)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* 5 Draggable Shape Tiles */}
          <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TOOLBAR_SHAPES.map((shape) => {
              const active = activeShapeType === shape.id
              return (
                <div
                  key={shape.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(ev) =>
                    startTactileDragOrTap(
                      ev,
                      (dragEv) =>
                        onStartDockItemDrag?.('shape', dragEv, {
                          shapeType: shape.id,
                          color: activeShapeColor,
                          fillStyle: activeFillStyle
                        }),
                      () => {
                        onChangeShapeType?.(shape.id)
                        onChangeToolMode?.('shape')
                        setOpenPopover(null)
                      }
                    )
                  }
                  onKeyDown={(ev) => {
                    if (isImeOwnedKeyboardEvent(ev)) {
                      return
                    }
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      onChangeShapeType?.(shape.id)
                      onChangeToolMode?.('shape')
                      setOpenPopover(null)
                    }
                  }}
                  className={`flex w-[76px] shrink-0 cursor-grab flex-col items-center gap-1.5 rounded-xl border bg-zinc-900/95 px-2 py-2 transition-all hover:-translate-y-1 active:cursor-grabbing ${
                    active
                      ? 'border-sky-400 ring-1 ring-sky-400/35'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div style={{ color: activeShapeMeta.hex }}>
                    <ShapeGlyph shapeType={shape.id} className="size-5.5" />
                  </div>
                  <span className="truncate text-[10px] font-semibold text-zinc-200">
                    {shape.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Color Swatches + Fill Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
            <div className="flex items-center gap-1.5">
              {TOOLBAR_COLORS.map((c) => {
                const sw = TOOLBAR_COLOR_SWATCH[c]
                const active = activeShapeColor === c
                return (
                  <button
                    key={c}
                    type="button"
                    title={sw.label}
                    aria-label={`${sw.label} shape color`}
                    onClick={() => onChangeShapeColor?.(c)}
                    className={`size-3.5 rounded-full transition-transform hover:scale-115 ${sw.dotClass} ${
                      active
                        ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1c1c1f]'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  />
                )
              })}
            </div>

            <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
              {(
                [
                  { id: 'none', label: 'None' },
                  { id: 'soft', label: 'Soft' },
                  { id: 'solid', label: 'Solid' },
                  { id: 'paper', label: 'Paper' },
                  { id: 'paper-light', label: 'Light' },
                  { id: 'glass', label: 'Glass' }
                ] satisfies readonly { id: ToolbarFillStyle; label: string }[]
              ).map((f) => {
                const active = activeFillStyle === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onChangeFillStyle?.(f.id)}
                    className={`rounded-lg px-1.5 py-0.5 text-[10px] font-semibold transition ${
                      active
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                    }`}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Right-Well Fan 3: 8-Color Draggable Sticky Note Paper Fan */}
      {openPopover === 'notes-fan' ? (
        <div className="pointer-events-auto max-w-full rounded-2xl border border-white/14 bg-[#1c1c1f]/97 p-3 text-xs text-zinc-100 shadow-2xl backdrop-blur-xl">
          <div className="mb-2.5 flex items-center justify-between gap-4 px-0.5">
            <span className="text-[11px] font-semibold text-zinc-200">
              Drag any Sticky Note onto canvas · or click to pin color
            </span>
            <button
              type="button"
              aria-label="Close sticky notes fan"
              onClick={() => setOpenPopover(null)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex max-w-full items-end gap-2 overflow-x-auto px-1 pt-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TOOLBAR_COLORS.map((c, idx) => {
              const sw = TOOLBAR_COLOR_SWATCH[c]
              const active = dockNoteColor === c
              const tiltClass = idx % 2 === 0 ? '-rotate-2' : 'rotate-2'
              return (
                <div
                  key={c}
                  role="button"
                  tabIndex={0}
                  title={`Drag ${sw.label} sticky note onto canvas`}
                  onPointerDown={(ev) =>
                    startTactileDragOrTap(
                      ev,
                      (dragEv) => onStartDockItemDrag?.('note', dragEv, { color: c }),
                      () => onChangeDockNoteColor?.(c)
                    )
                  }
                  onKeyDown={(ev) => {
                    if (isImeOwnedKeyboardEvent(ev)) {
                      return
                    }
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      onChangeDockNoteColor?.(c)
                    }
                  }}
                  className={`relative flex h-16 w-14 shrink-0 cursor-grab flex-col justify-between rounded-lg border p-2 shadow-lg transition-all duration-150 ${tiltClass} hover:-translate-y-1.5 hover:rotate-0 active:cursor-grabbing ${sw.noteCardClass} ${
                    active ? 'scale-105 ring-2 ring-white' : 'opacity-92 hover:opacity-100'
                  }`}
                >
                  <div className="space-y-1 pt-0.5">
                    <div className="h-1 w-8 rounded-full bg-current/35" />
                    <div className="h-1 w-6 rounded-full bg-current/25" />
                    <div className="h-1 w-4 rounded-full bg-current/20" />
                  </div>
                  <span className="truncate text-[8.5px] font-bold tracking-wider uppercase opacity-80">
                    {sw.label}
                  </span>
                  <span className="pointer-events-none absolute right-0 bottom-0 size-2.5 rounded-tl-xs bg-black/18" />
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Right-Well Fan 4: Draggable Space Frame Priority Fan */}
      {openPopover === 'spaces-fan' ? (
        <div className="scrollbar-sleek pointer-events-auto max-h-[70vh] w-[440px] max-w-full overflow-y-auto rounded-2xl border border-white/14 bg-[#1c1c1f]/97 p-3 text-xs text-zinc-100 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
            <span className="text-[11px] font-semibold text-zinc-200">
              Space Frame · Drag priority frame onto canvas (or click to pin)
            </span>
            <button
              type="button"
              aria-label="Close Space Frame priority fan"
              onClick={() => setOpenPopover(null)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2 max-[520px]:grid-cols-3">
            {SPACE_LEVELS.map((lvl) => {
              const st = LEVEL_STYLE[lvl]
              const active = dockSpaceLevel === lvl
              return (
                <div
                  key={lvl}
                  role="button"
                  tabIndex={0}
                  title={`Drag ${st.label} Space onto canvas`}
                  onPointerDown={(ev) =>
                    startTactileDragOrTap(
                      ev,
                      (dragEv) => onStartDockItemDrag?.('space', dragEv, { spaceLevel: lvl }),
                      () => {
                        onChangeDockSpaceLevel?.(lvl)
                        setOpenPopover(null)
                      }
                    )
                  }
                  onKeyDown={(ev) => {
                    if (isImeOwnedKeyboardEvent(ev)) {
                      return
                    }
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      onChangeDockSpaceLevel?.(lvl)
                      setOpenPopover(null)
                    }
                  }}
                  className={`flex cursor-grab flex-col overflow-hidden rounded-xl border bg-zinc-900/95 shadow-md transition-all hover:-translate-y-1 active:cursor-grabbing ${
                    active
                      ? 'border-sky-400 ring-1 ring-sky-400/40'
                      : 'border-white/12 hover:border-white/30'
                  }`}
                >
                  <div className={`h-1.5 w-full ${st.band}`} />
                  <div className="flex flex-col gap-1 p-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[10.5px] font-bold text-zinc-100">
                        {st.shortLabel}
                      </span>
                      <span className={`size-2 shrink-0 rounded-full ${st.dot}`} />
                    </div>
                    <div className="h-1 w-10 rounded-full bg-white/30" />
                    <div className="h-1 w-6 rounded-full bg-white/15" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Right-Well Tray 5: Floating Drag-to-Spawn Agents Tray (12px above bottom-middle dock) */}
      {openPopover === 'agents-tray' ? (
        <div
          ref={spawnTrayRef}
          role="dialog"
          aria-label="Spawn Agent · Drag to Space"
          data-dock-spawn-tray="true"
          className={`mb-1 flex max-h-[340px] w-[600px] max-w-[calc(100vw-32px)] flex-col rounded-2xl border border-white/14 bg-zinc-950/96 p-3 text-xs text-zinc-100 shadow-[0_24px_60px_rgba(0,0,0,0.75)] backdrop-blur-xl transition-opacity duration-100 ${
            isDraggingSpawn || isLocalDraggingSpawn
              ? 'pointer-events-none opacity-0'
              : 'pointer-events-auto opacity-100'
          }`}
        >
          {/* Top Header Bar: Title + Filter + Harness Pills + Ask Toggle + Model Select */}
          <div className="flex shrink-0 flex-col gap-2 border-b border-white/[0.08] pb-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
                <span className="truncate text-[10.5px] font-bold tracking-[0.08em] text-zinc-200 uppercase">
                  SPAWN AGENT · DRAG TO SPACE
                </span>
                <span className="shrink-0 rounded-full bg-white/[0.07] px-1.5 py-0.2 font-mono text-[9.5px] font-semibold text-zinc-400 tabular-nums">
                  {filteredSpawners.length}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  type="search"
                  data-dock-spawn-filter="true"
                  aria-label="Filter roles"
                  value={spawnSearch}
                  onChange={(ev) => setSpawnSearch(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Escape' && spawnSearch) {
                      ev.stopPropagation()
                      setSpawnSearch('')
                    }
                  }}
                  placeholder="Filter roles..."
                  className="h-6 w-[168px] rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-emerald-400/50 max-[520px]:w-[118px]"
                />
                <button
                  type="button"
                  aria-label="Close spawn agent tray"
                  onClick={() => setOpenPopover(null)}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {/* Harness Pills: AGY · Claude · Grok · Unchain */}
                <div
                  data-dock-harness-group="true"
                  role="group"
                  aria-label="Agent harness"
                  className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-zinc-900/95 p-0.5"
                >
                  {DOCK_HARNESS_PILLS.map((pill) => {
                    const isSelected = activeHarness === pill.id
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        data-dock-harness-pill={pill.id}
                        aria-pressed={isSelected}
                        onClick={() => handleSelectHarness(pill.id)}
                        className={`cursor-pointer rounded-md px-2 py-0.5 text-[10.5px] font-semibold transition-colors ${
                          isSelected
                            ? 'bg-zinc-100 text-zinc-950 shadow-xs'
                            : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                        }`}
                      >
                        {pill.label}
                      </button>
                    )
                  })}
                </div>

                {/* Ask before spawn toggle pill */}
                <button
                  type="button"
                  data-dock-ask-toggle="true"
                  aria-pressed={effectiveAsk}
                  onClick={handleToggleAsk}
                  title="Ask which harness & model to use when dropping an agent onto a Space"
                  className={`cursor-pointer rounded-lg border px-2 py-0.5 text-[10.5px] font-semibold transition-colors ${
                    effectiveAsk
                      ? 'border-emerald-400/45 bg-emerald-500/18 text-emerald-300'
                      : 'border-white/[0.08] bg-zinc-900/80 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  Ask
                </button>
              </div>

              {/* Compact Model Dropdown */}
              <select
                data-dock-model-select="true"
                aria-label="Default agent model"
                value={selectedSelectValue}
                onChange={(ev) => handleSelectModel(ev.target.value)}
                className="h-6 min-w-[164px] max-w-[236px] flex-1 cursor-pointer rounded-lg border border-white/10 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-200 outline-none focus:border-emerald-400/50"
              >
                {resolvedTrayModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
                {unchainOptgroupModels.length > 0 ? (
                  <optgroup label="Unchain">
                    {unchainOptgroupModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </div>
          </div>

          {/* Grouped 3-Column Compact Draggable Role Grid */}
          {filteredSpawners.length > 0 ? (
            <div
              data-dock-spawner-grid="true"
              className="scrollbar-sleek mt-2.5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5"
            >
              {spawnerSections.map((section) => (
                <div key={section.group} data-dock-spawner-group={section.group}>
                  <div className="flex items-center gap-1.5 px-0.5">
                    <span className="text-[9.5px] font-bold tracking-[0.1em] text-zinc-400 uppercase">
                      {section.label}
                    </span>
                    <span className="rounded-full bg-white/[0.06] px-1.5 py-0.2 font-mono text-[8.5px] font-semibold text-zinc-500 tabular-nums">
                      {section.spawners.length}
                    </span>
                    <span className="h-px flex-1 bg-white/[0.08]" />
                  </div>
                  <div
                    data-dock-spawner-group-grid={section.group}
                    className="mt-1 grid grid-cols-3 gap-1.5 max-[560px]:grid-cols-2"
                  >
                    {section.spawners.map((spawner) => {
                      const isShell = spawner.id === 'terminal' || spawner.command === null
                      const cmdPreview = buildSpawnerCommand(spawner, effectiveModelId) ?? 'shell'
                      return (
                        <div
                          key={spawner.id}
                          role="button"
                          tabIndex={0}
                          data-dock-spawner-card={spawner.id}
                          data-drag-spawn={spawner.id}
                          title={`Drag onto any Space or canvas to launch ${spawner.label} (${cmdPreview})`}
                          onPointerDown={(ev) => handleSpawnerCardPointerDown(spawner, ev)}
                          onKeyDown={(ev) => {
                            if (isImeOwnedKeyboardEvent(ev)) {
                              return
                            }
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault()
                              if (onSpawnAgent) {
                                onSpawnAgent(spawner)
                                setOpenPopover(null)
                              }
                            }
                          }}
                          className="group/card relative flex cursor-grab items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 text-left transition-all duration-150 select-none hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-white/[0.06] hover:shadow-[0_8px_20px_rgba(0,0,0,0.45)] active:scale-[0.98] active:cursor-grabbing"
                        >
                          <DockMiniSpacewareBot isShell={isShell} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate text-[11.5px] font-semibold text-zinc-100">
                                {spawner.label}
                              </span>
                              <span className="shrink-0 rounded border border-white/10 bg-zinc-900/90 px-1 py-0.2 font-mono text-[8.5px] font-bold text-zinc-400 transition-colors group-hover/card:border-emerald-400/35 group-hover/card:text-emerald-300">
                                {spawner.badge}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-[9.5px] text-zinc-400 group-hover/card:text-zinc-300">
                              {spawner.subtitle}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2.5 rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-[11px] text-zinc-500">
              No matching agent role for &ldquo;{spawnSearch}&rdquo;.
            </div>
          )}
        </div>
      ) : null}

      {/* Main 62px AFFiNE Edgeless Matte Dark Pill Bar */}
      <div
        ref={pillRef}
        className="pointer-events-auto relative max-w-full rounded-[20px] border border-white/10 bg-[#1c1c1f]/96 shadow-[0_18px_46px_rgba(0,0,0,0.62),0_1px_0_rgba(255,255,255,0.05)_inset] backdrop-blur-xl"
      >
        {/* Floating AFFiNE Tooltip Pill with Keycap Badge (hidden whenever a popover is open) */}
        {hoveredTooltip && openPopover === null ? (
          <AffineFloatingTooltip
            label={hoveredTooltip.label}
            shortcut={hoveredTooltip.shortcut}
            centerX={hoveredTooltip.centerX}
          />
        ) : null}

        <div
          className={`flex h-[62px] max-w-full items-center overflow-x-auto overflow-y-hidden rounded-[19px] px-2.5 ${
            narrow
              ? 'op-dock-scroll [scrollbar-width:thin] pb-1'
              : '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          }`}
        >
          {/* Left Mode Cluster (Zero text labels — crisp vector icons + mini ^ chevrons) */}
          <div className="flex shrink-0 items-center gap-1 pr-2.5">
            {/* 1. Select (V) / Marquee (M) */}
            <div
              onMouseEnter={(ev) =>
                showSlotTooltip(
                  'select',
                  toolMode === 'marquee' ? 'Marquee' : 'Select',
                  toolMode === 'marquee' ? 'M' : 'V',
                  ev.currentTarget
                )
              }
              onMouseLeave={() => clearSlotTooltip('select')}
              className="group/tool relative flex items-center"
            >
              <button
                type="button"
                aria-label="Select tool (V)"
                aria-pressed={isSelectFamily}
                onClick={() => {
                  setOpenPopover(null)
                  onChangeToolMode?.('select')
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-[11px] pr-1.5 transition-colors ${
                  isSelectFamily
                    ? 'text-sky-400 hover:bg-white/[0.08]'
                    : 'text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100'
                }`}
              >
                {toolMode === 'marquee' ? (
                  <MarqueeSelectVector active={isSelectFamily} />
                ) : (
                  <CursorPointerVector active={isSelectFamily} />
                )}
              </button>
              {/* Options show only for the tool in use: one less control per idle tool. */}
              {isSelectFamily || openPopover === 'select-menu' ? (
                <button
                  type="button"
                  aria-label="Select mode options"
                  aria-expanded={openPopover === 'select-menu'}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    togglePopover('select-menu')
                  }}
                  className="absolute top-1.5 right-0.5 flex size-4 items-center justify-center rounded hover:bg-white/12"
                >
                  <MiniChevronUp open={openPopover === 'select-menu'} active={isSelectFamily} />
                </button>
              ) : null}
            </div>

            {/* 2. Frame / Space (F) */}
            <div
              onMouseEnter={(ev) => showSlotTooltip('frame', 'Frame', 'F', ev.currentTarget)}
              onMouseLeave={() => clearSlotTooltip('frame')}
              className="group/tool relative flex items-center"
            >
              <button
                type="button"
                aria-label="Frame Space tool (F)"
                aria-pressed={toolMode === 'frame'}
                onClick={() => {
                  setOpenPopover(null)
                  onChangeToolMode?.(toolMode === 'frame' ? 'select' : 'frame')
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-[11px] pr-1.5 transition-colors ${
                  toolMode === 'frame'
                    ? 'bg-sky-500/12 text-sky-400'
                    : 'text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100'
                }`}
              >
                <FrameGridVector active={toolMode === 'frame'} />
              </button>
              {/* Options show only for the tool in use: one less control per idle tool. */}
              {toolMode === 'frame' || openPopover === 'frame-menu' ? (
                <button
                  type="button"
                  aria-label="Frame Space priority options"
                  aria-expanded={openPopover === 'frame-menu'}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    togglePopover('frame-menu')
                  }}
                  className="absolute top-1.5 right-0.5 flex size-4 items-center justify-center rounded hover:bg-white/12"
                >
                  <MiniChevronUp
                    open={openPopover === 'frame-menu'}
                    active={toolMode === 'frame'}
                  />
                </button>
              ) : null}
            </div>

            {/* 3. Connector (C) */}
            <div
              onMouseEnter={(ev) => showSlotTooltip('arrow', 'Connector', 'C', ev.currentTarget)}
              onMouseLeave={() => clearSlotTooltip('arrow')}
              className="group/tool relative flex items-center"
            >
              <button
                type="button"
                aria-label="Connector tool (C)"
                aria-pressed={toolMode === 'arrow'}
                onClick={() => {
                  setOpenPopover(null)
                  onChangeToolMode?.(toolMode === 'arrow' ? 'select' : 'arrow')
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-[11px] pr-1.5 transition-colors ${
                  toolMode === 'arrow'
                    ? 'bg-sky-500/12 text-sky-400'
                    : 'text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100'
                }`}
              >
                <ConnectorCurveVector active={toolMode === 'arrow'} routing={activeArrowRouting} />
              </button>
              {/* Options show only for the tool in use: one less control per idle tool. */}
              {toolMode === 'arrow' || openPopover === 'arrow-menu' ? (
                <button
                  type="button"
                  aria-label="Connector routing options"
                  aria-expanded={openPopover === 'arrow-menu'}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    togglePopover('arrow-menu')
                  }}
                  className="absolute top-1.5 right-0.5 flex size-4 items-center justify-center rounded hover:bg-white/12"
                >
                  <MiniChevronUp
                    open={openPopover === 'arrow-menu'}
                    active={toolMode === 'arrow'}
                  />
                </button>
              ) : null}
            </div>

            {/* 4. Draw Shape (R) */}
            <div
              onMouseEnter={(ev) => showSlotTooltip('shape', 'Shape', 'R', ev.currentTarget)}
              onMouseLeave={() => clearSlotTooltip('shape')}
              className="group/tool relative flex items-center"
            >
              <button
                type="button"
                aria-label="Draw Shape tool (R)"
                aria-pressed={toolMode === 'shape'}
                onClick={() => {
                  setOpenPopover(null)
                  onChangeToolMode?.(toolMode === 'shape' ? 'select' : 'shape')
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-[11px] pr-1.5 transition-colors ${
                  toolMode === 'shape'
                    ? 'bg-sky-500/12 text-sky-400'
                    : 'text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100'
                }`}
              >
                <ShapeGlyph
                  shapeType={activeShapeType}
                  className="size-[18px]"
                  active={toolMode === 'shape'}
                />
              </button>
              {/* Options show only for the tool in use: one less control per idle tool. */}
              {toolMode === 'shape' || openPopover === 'shape-menu' ? (
                <button
                  type="button"
                  aria-label="Draw shape options"
                  aria-expanded={openPopover === 'shape-menu'}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    togglePopover('shape-menu')
                  }}
                  className="absolute top-1.5 right-0.5 flex size-4 items-center justify-center rounded hover:bg-white/12"
                >
                  <MiniChevronUp
                    open={openPopover === 'shape-menu'}
                    active={toolMode === 'shape'}
                  />
                </button>
              ) : null}
            </div>

            {/* 5. Text Tool (T) */}
            <div
              onMouseEnter={(ev) => showSlotTooltip('text-mode', 'Text', 'T', ev.currentTarget)}
              onMouseLeave={() => clearSlotTooltip('text-mode')}
              className="group/tool relative flex items-center"
            >
              <button
                type="button"
                aria-label="Text tool (T)"
                aria-pressed={toolMode === 'text'}
                onClick={() => {
                  setOpenPopover(null)
                  onChangeToolMode?.(toolMode === 'text' ? 'select' : 'text')
                }}
                className={`flex h-10 w-9 items-center justify-center rounded-[11px] transition-colors ${
                  toolMode === 'text'
                    ? 'bg-sky-500/12 text-sky-400'
                    : 'text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100'
                }`}
              >
                <TextToolVector active={toolMode === 'text'} />
              </button>
            </div>

            {/* 6. Eraser Tool (E) */}
            <div
              onMouseEnter={(ev) => showSlotTooltip('eraser-mode', 'Eraser', 'E', ev.currentTarget)}
              onMouseLeave={() => clearSlotTooltip('eraser-mode')}
              className="group/tool relative flex items-center"
            >
              <button
                type="button"
                aria-label="Eraser tool (E)"
                aria-pressed={toolMode === 'eraser'}
                onClick={() => {
                  setOpenPopover(null)
                  onChangeToolMode?.(toolMode === 'eraser' ? 'select' : 'eraser')
                }}
                className={`flex h-10 w-9 items-center justify-center rounded-[11px] transition-colors ${
                  toolMode === 'eraser'
                    ? 'bg-rose-500/14 text-rose-400'
                    : 'text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100'
                }`}
              >
                <EraserToolVector active={toolMode === 'eraser'} />
              </button>
            </div>
          </div>

          {/* Full-Height 1px Vertical Divider */}
          <div className="h-[46px] w-px shrink-0 bg-white/10" />

          {/* Right Tactile Drag-and-Drop Well (Bottom-clipped physical objects lifting on hover) */}
          <div className="flex h-full shrink-0 items-stretch gap-1 pl-2">
            {/* Slot 1: Tilted Dark T / H1 Text & Backed-Text Card */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Text and Backed-Text Card (drag to drop or click for presets)"
              aria-expanded={openPopover === 'text-fan'}
              onMouseEnter={(ev) =>
                showSlotTooltip('text-well', 'Text / H1 Card', 'T', ev.currentTarget)
              }
              onMouseLeave={() => clearSlotTooltip('text-well')}
              onPointerDown={(ev) =>
                startTactileDragOrTap(
                  ev,
                  (dragEv) =>
                    onStartDockItemDrag?.('text-card', dragEv, {
                      textCardPreset: currentTextPreset.id,
                      fillStyle: currentTextPreset.fillStyle,
                      borderStyle: currentTextPreset.borderStyle,
                      color:
                        currentTextPreset.id === 'backed-label'
                          ? activeShapeColor
                          : currentTextPreset.color,
                      fontFamily: currentTextPreset.fontFamily,
                      fontSize: currentTextPreset.fontSize,
                      bold: currentTextPreset.bold,
                      defaultText: currentTextPreset.sample
                    }),
                  () => togglePopover('text-fan')
                )
              }
              onKeyDown={(ev) => {
                if (isImeOwnedKeyboardEvent(ev)) {
                  return
                }
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  togglePopover('text-fan')
                }
              }}
              className="group/well relative flex h-full w-[66px] cursor-grab items-end justify-center overflow-hidden px-0.5 outline-none active:cursor-grabbing"
            >
              <div
                className={`translate-y-2 transition-transform duration-200 ease-out group-hover/well:translate-y-0.5 ${
                  toolMode === 'text' || openPopover === 'text-fan' ? 'translate-y-0.5' : ''
                }`}
              >
                <TactileTextCardArt
                  active={toolMode === 'text' || openPopover === 'text-fan'}
                  accentHex={activeShapeMeta.hex}
                />
              </div>
            </div>

            {/* Slot 2: Overlapping Geometric Shapes Cluster */}
            <div
              role="button"
              tabIndex={0}
              data-dock-shapes-well="true"
              aria-label="Shapes cluster (drag to drop active shape or click for Shapes & Fill fan)"
              aria-expanded={openPopover === 'shapes-fan'}
              onMouseEnter={(ev) => showSlotTooltip('shapes-well', 'Shapes', 'R', ev.currentTarget)}
              onMouseLeave={() => clearSlotTooltip('shapes-well')}
              onPointerDown={(ev) =>
                startTactileDragOrTap(
                  ev,
                  (dragEv) =>
                    onStartDockItemDrag?.('shape', dragEv, {
                      shapeType: activeShapeType,
                      color: activeShapeColor,
                      fillStyle: activeFillStyle
                    }),
                  () => togglePopover('shapes-fan')
                )
              }
              onKeyDown={(ev) => {
                if (isImeOwnedKeyboardEvent(ev)) {
                  return
                }
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  togglePopover('shapes-fan')
                }
              }}
              className="group/well relative flex h-full w-[68px] cursor-grab items-end justify-center overflow-hidden px-0.5 outline-none active:cursor-grabbing"
            >
              <div
                className={`translate-y-2 transition-transform duration-200 ease-out group-hover/well:translate-y-0.5 ${
                  openPopover === 'shapes-fan' ? 'translate-y-0.5' : ''
                }`}
              >
                <TactileShapesClusterArt
                  colorHex={activeShapeMeta.hex}
                  secondaryHex={activeShapeMeta.secondaryHex}
                />
              </div>
            </div>

            {/* Well 4: Tilted Sticky Note Stack */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Sticky Note stack (drag to drop note or click for 8 colors)"
              aria-expanded={openPopover === 'notes-fan'}
              onMouseEnter={(ev) =>
                showSlotTooltip('notes-well', 'Sticky Note', 'N', ev.currentTarget)
              }
              onMouseLeave={() => clearSlotTooltip('notes-well')}
              onPointerDown={(ev) =>
                startTactileDragOrTap(
                  ev,
                  (dragEv) => onStartDockItemDrag?.('note', dragEv, { color: dockNoteColor }),
                  () => togglePopover('notes-fan')
                )
              }
              onKeyDown={(ev) => {
                if (isImeOwnedKeyboardEvent(ev)) {
                  return
                }
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  togglePopover('notes-fan')
                }
              }}
              className="group/well relative flex h-full w-[58px] cursor-grab items-end justify-center overflow-hidden px-0.5 outline-none active:cursor-grabbing max-[560px]:w-[50px]"
            >
              <div
                className={`translate-y-2 transition-transform duration-200 ease-out group-hover/well:translate-y-0.5 ${
                  openPopover === 'notes-fan' ? 'translate-y-0.5' : ''
                }`}
              >
                <TactileStickyStackArt color={dockNoteColor} />
              </div>
            </div>

            {/* Well 5: Draggable Space Frame Priority Stack */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Space Frame stack (drag to drop Space or click to choose priority)"
              aria-expanded={openPopover === 'spaces-fan'}
              onMouseEnter={(ev) =>
                showSlotTooltip('spaces-well', 'Space Frame', 'S', ev.currentTarget)
              }
              onMouseLeave={() => clearSlotTooltip('spaces-well')}
              onPointerDown={(ev) =>
                startTactileDragOrTap(
                  ev,
                  (dragEv) =>
                    onStartDockItemDrag?.('space', dragEv, { spaceLevel: dockSpaceLevel }),
                  () => togglePopover('spaces-fan')
                )
              }
              onKeyDown={(ev) => {
                if (isImeOwnedKeyboardEvent(ev)) {
                  return
                }
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  togglePopover('spaces-fan')
                }
              }}
              className="group/well relative flex h-full w-[68px] cursor-grab items-end justify-center overflow-hidden px-0.5 outline-none active:cursor-grabbing max-[560px]:w-[58px]"
            >
              <div
                className={`translate-y-2 transition-transform duration-200 ease-out group-hover/well:translate-y-0.5 ${
                  openPopover === 'spaces-fan' ? 'translate-y-0.5' : ''
                }`}
              >
                <TactileSpacesAgentsStackArt levelColor={LEVEL_STYLE[dockSpaceLevel].color} />
              </div>
              <span className="pointer-events-none absolute top-1.5 right-1 rounded-full border border-white/15 bg-zinc-900/95 px-1.5 py-0.2 text-[8.5px] font-bold tracking-tight text-sky-300 shadow max-[620px]:hidden">
                {LEVEL_STYLE[dockSpaceLevel].shortLabel}
              </span>
            </div>

            {/* Subtle 1px separator before Spaceware Agents Well */}
            <div className="my-2.5 w-px shrink-0 bg-white/[0.08]" />

            {/* Well 6: Signature Spaceware Agents Well (click/A for tray · drag >6px for instant spawn) */}
            <div
              role="button"
              tabIndex={0}
              data-dock-agents-well="true"
              data-dock-agent-item="true"
              data-drag-spawn={spawners[0]?.id ?? 'terminal'}
              aria-haspopup="dialog"
              aria-label="Spawn Agents (click to open grouped tray or drag onto a Space)"
              aria-expanded={openPopover === 'agents-tray'}
              onMouseEnter={(ev) =>
                showSlotTooltip('agents-well', 'Spawn Agents', 'A', ev.currentTarget)
              }
              onMouseLeave={() => clearSlotTooltip('agents-well')}
              onPointerDown={handleAgentsWellPointerDown}
              onClick={(ev) => {
                ev.stopPropagation()
                if (wellDraggedRef.current) {
                  wellDraggedRef.current = false
                  return
                }
                togglePopover('agents-tray')
              }}
              onKeyDown={(ev) => {
                if (isImeOwnedKeyboardEvent(ev)) {
                  return
                }
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  togglePopover('agents-tray')
                }
              }}
              className="group/well relative flex h-full w-[74px] cursor-grab items-end justify-center overflow-hidden px-0.5 outline-none active:cursor-grabbing max-[560px]:w-[62px]"
            >
              <div
                className={`translate-y-2 transition-transform duration-200 ease-out group-hover/well:translate-y-0.5 ${
                  openPopover === 'agents-tray' ? 'translate-y-0.5' : ''
                }`}
              >
                <TactileAgentsCrewArt active={openPopover === 'agents-tray'} />
              </div>
              <span
                className={`pointer-events-none absolute top-1.5 right-1 rounded-full border px-1.5 py-0.2 text-[8.5px] font-bold tracking-tight shadow transition-colors max-[620px]:hidden ${
                  openPopover === 'agents-tray'
                    ? 'border-emerald-400/60 bg-emerald-950/95 text-emerald-200'
                    : 'border-emerald-400/35 bg-zinc-900/95 text-emerald-300 group-hover/well:border-emerald-400/55'
                }`}
              >
                Agents
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

export const WhiteboardToolbar = WhiteboardEdgelessDock

// ---------------------------------------------------------------------------
// 2. WhiteboardItemInspector (AFFiNE Floating Selection Toolbar)
// ---------------------------------------------------------------------------

export type WhiteboardItemInspectorProps = {
  kind: WhiteboardInspectorKind
  shapeType?: ToolbarShapeType
  fillStyle?: ToolbarFillStyle
  borderStyle?: ToolbarBorderStyle
  color?: ToolbarColor
  fontSize?: number
  fontFamily?: ToolbarFontFamily
  bold?: boolean
  textAlign?: ToolbarTextAlign
  locked?: boolean
  isEditing?: boolean
  onChangeShapeType?: (shapeType: ToolbarShapeType) => void
  onConvertToShape?: (shapeType?: ToolbarShapeType) => void
  onChangeFillStyle?: (fillStyle: ToolbarFillStyle) => void
  onChangeBorderStyle?: (borderStyle: ToolbarBorderStyle) => void
  onChangeColor?: (color: ToolbarColor) => void
  onChangeFontSize?: (fontSize: number) => void
  onChangeFontFamily?: (fontFamily: ToolbarFontFamily) => void
  onToggleBold?: (bold: boolean) => void
  onChangeTextAlign?: (align: ToolbarTextAlign) => void
  onBringToFront?: () => void
  onSendToBack?: () => void
  onToggleLock?: (locked: boolean) => void
  onEditText?: () => void
  onDuplicate?: () => void
  onStartConnectDrag?: (event: React.PointerEvent) => void
  onConnect?: () => void
  onDelete?: () => void
  style?: React.CSSProperties
  className?: string
}

export const WhiteboardItemInspector = React.memo(function WhiteboardItemInspector({
  kind,
  shapeType = 'rounded',
  fillStyle,
  borderStyle = 'solid',
  color = 'amber',
  fontSize,
  fontFamily = 'sans',
  bold = false,
  textAlign = 'left',
  locked = false,
  isEditing = false,
  onChangeShapeType,
  onConvertToShape,
  onChangeFillStyle,
  onChangeBorderStyle,
  onChangeColor,
  onChangeFontSize,
  onChangeFontFamily,
  onToggleBold,
  onChangeTextAlign,
  onBringToFront,
  onSendToBack,
  onToggleLock,
  onEditText,
  onDuplicate,
  onStartConnectDrag,
  onConnect,
  onDelete,
  style,
  className = ''
}: WhiteboardItemInspectorProps): React.JSX.Element {
  const resolvedFill: ToolbarFillStyle = fillStyle ?? (kind === 'text' ? 'none' : 'soft')
  const resolvedFontSize = fontSize ?? (kind === 'text' ? 26 : 16)

  // Locked Guardrail: shows ONLY `Locked 🔒 · Unlock` until unlocked
  if (locked) {
    return (
      <div
        data-whiteboard-inspector="locked"
        style={style}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        className={`pointer-events-auto flex items-center gap-2 rounded-2xl border border-amber-400/35 bg-zinc-950/96 px-3 py-1.5 text-xs text-zinc-100 shadow-2xl backdrop-blur-xl whitespace-nowrap ${className}`}
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
          <Lock className="size-3.5" />
          <span>Locked</span>
        </span>
        <span className="h-3.5 w-px bg-white/15" />
        <button
          type="button"
          title="Unlock item to move or edit"
          onClick={() => onToggleLock?.(false)}
          className="flex items-center gap-1 rounded-lg bg-amber-400/18 px-2 py-1 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-400/30 hover:text-white"
        >
          <Unlock className="size-3.5" />
          <span>Unlock</span>
        </button>
      </div>
    )
  }

  return (
    <div
      data-whiteboard-inspector={kind}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.preventDefault()}
      onDoubleClick={(event) => event.stopPropagation()}
      className={`pointer-events-auto flex max-w-full flex-col gap-1.5 rounded-2xl border border-white/15 bg-zinc-950/96 px-2.5 py-1.5 text-xs text-zinc-100 shadow-2xl backdrop-blur-xl ${className}`}
    >
      {/* Row 1: Shape / Box-Bg / Fill + Border + 8 Color Swatches */}
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {kind === 'text' ? (
          <>
            <span className="px-1 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
              Box Bg
            </span>
            <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
              {(
                [
                  { id: 'none', label: 'None' },
                  { id: 'soft', label: 'Soft' },
                  { id: 'solid', label: 'Solid' },
                  { id: 'paper', label: 'Paper' },
                  { id: 'paper-light', label: 'Light' },
                  { id: 'glass', label: 'Glass' }
                ] satisfies readonly { id: ToolbarFillStyle; label: string }[]
              ).map((opt) => {
                const active = resolvedFill === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeFillStyle?.(opt.id)}
                    className={`rounded-lg px-2 py-0.5 text-[10.5px] font-semibold transition ${
                      active
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              title="Convert text into a resizable fixed-box Shape"
              onClick={() => {
                if (onConvertToShape) {
                  onConvertToShape('rounded')
                  return
                }
                onChangeShapeType?.('rounded')
              }}
              className="rounded-lg border border-sky-400/35 bg-sky-500/12 px-2 py-0.5 text-[10.5px] font-semibold text-sky-300 transition hover:bg-sky-500/24 hover:text-sky-100"
            >
              → Shape
            </button>
          </>
        ) : null}

        {kind === 'shape' ? (
          <>
            <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
              {TOOLBAR_SHAPES.map((s) => {
                const active = shapeType === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    title={s.label}
                    aria-label={s.label}
                    onClick={() => onChangeShapeType?.(s.id)}
                    className={`flex size-6 items-center justify-center rounded-lg transition ${
                      active
                        ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/40'
                        : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100'
                    }`}
                  >
                    <ShapeGlyph shapeType={s.id} className="size-3.5" active={active} />
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
              {(
                [
                  { id: 'none', label: 'None' },
                  { id: 'soft', label: 'Soft' },
                  { id: 'solid', label: 'Solid' },
                  { id: 'paper', label: 'Paper' },
                  { id: 'paper-light', label: 'Light' },
                  { id: 'glass', label: 'Glass' }
                ] satisfies readonly { id: ToolbarFillStyle; label: string }[]
              ).map((opt) => {
                const active = resolvedFill === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeFillStyle?.(opt.id)}
                    className={`rounded-lg px-1.5 py-0.5 text-[10px] font-semibold transition ${
                      active
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
              {(
                [
                  { id: 'solid', label: 'Solid' },
                  { id: 'dashed', label: 'Dashed' },
                  { id: 'none', label: 'None' }
                ] satisfies readonly { id: ToolbarBorderStyle; label: string }[]
              ).map((b) => {
                const active = borderStyle === b.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    title={`Border: ${b.label}`}
                    onClick={() => onChangeBorderStyle?.(b.id)}
                    className={`rounded-lg px-1.5 py-0.5 text-[10px] font-semibold transition ${
                      active
                        ? 'bg-white/16 text-white'
                        : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                    }`}
                  >
                    {b.label}
                  </button>
                )
              })}
            </div>
          </>
        ) : null}

        {kind === 'note' ? (
          <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
            {(
              [
                { id: 'soft', label: 'Soft' },
                { id: 'solid', label: 'Solid' },
                { id: 'paper', label: 'Paper' },
                { id: 'paper-light', label: 'Light' },
                { id: 'glass', label: 'Glass' }
              ] satisfies readonly { id: ToolbarFillStyle; label: string }[]
            ).map((opt) => {
              const active = resolvedFill === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeFillStyle?.(opt.id)}
                  className={`rounded-lg px-2 py-0.5 text-[10.5px] font-semibold transition ${
                    active
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        ) : null}

        <span className="h-4 w-px shrink-0 bg-white/12" />

        {/* 8 Color Swatches */}
        <div className="flex items-center gap-1.5 px-0.5">
          {TOOLBAR_COLORS.map((c) => {
            const sw = TOOLBAR_COLOR_SWATCH[c]
            const active = color === c
            return (
              <button
                key={c}
                type="button"
                title={sw.label}
                aria-label={sw.label}
                onClick={() => onChangeColor?.(c)}
                className={`size-3.5 shrink-0 rounded-full transition-transform hover:scale-120 ${sw.dotClass} ${
                  active
                    ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-950'
                    : 'opacity-80 hover:opacity-100'
                }`}
              />
            )
          })}
        </div>
      </div>

      {/* Row 2: Typography Presets + Font/Bold/Align + Z-Order / Lock / Edit / Duplicate / Connect / Delete */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-t border-white/[0.08] pt-1 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Size Presets S / M / L / XL + A- / A+ */}
        <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
          {FONT_SIZE_PRESETS.map((preset) => {
            const active = Math.abs(resolvedFontSize - preset.size) <= 1
            return (
              <button
                key={preset.label}
                type="button"
                title={`Font size ${preset.size}px`}
                onClick={() => onChangeFontSize?.(preset.size)}
                className={`rounded-lg px-1.5 py-0.5 text-[10px] font-bold transition ${
                  active
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                }`}
              >
                {preset.label}
              </button>
            )
          })}
          <button
            type="button"
            title="Decrease font size"
            onClick={() => onChangeFontSize?.(Math.max(12, resolvedFontSize - 2))}
            className="rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            A−
          </button>
          <button
            type="button"
            title="Increase font size"
            onClick={() => onChangeFontSize?.(Math.min(160, resolvedFontSize + 2))}
            className="rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            A+
          </button>
        </div>

        {/* Font Family + Bold + Text Alignment */}
        <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
          {(
            [
              { id: 'sans', label: 'Sans', cls: 'font-sans' },
              { id: 'serif', label: 'Serif', cls: 'font-serif' },
              { id: 'mono', label: 'Mono', cls: 'font-mono' }
            ] satisfies readonly { id: ToolbarFontFamily; label: string; cls: string }[]
          ).map((f) => {
            const active = fontFamily === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onChangeFontFamily?.(f.id)}
                className={`rounded-lg px-1.5 py-0.5 text-[10px] font-semibold transition ${f.cls} ${
                  active
                    ? 'bg-white/16 text-white'
                    : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                }`}
              >
                {f.label}
              </button>
            )
          })}
          <button
            type="button"
            title="Bold (⌘B)"
            aria-pressed={bold}
            onClick={() => onToggleBold?.(!bold)}
            className={`flex size-6 items-center justify-center rounded-lg transition ${
              bold
                ? 'bg-sky-500/20 text-sky-300'
                : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100'
            }`}
          >
            <Bold className="size-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
          {(
            [
              { id: 'left', label: 'Align Left', Icon: AlignLeft },
              { id: 'center', label: 'Align Center', Icon: AlignCenter },
              { id: 'right', label: 'Align Right', Icon: AlignRight }
            ] as const
          ).map((al) => {
            const active = textAlign === al.id
            const IconComp = al.Icon
            return (
              <button
                key={al.id}
                type="button"
                title={al.label}
                aria-label={al.label}
                onClick={() => onChangeTextAlign?.(al.id)}
                className={`flex size-6 items-center justify-center rounded-lg transition ${
                  active
                    ? 'bg-white/16 text-white'
                    : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100'
                }`}
              >
                <IconComp className="size-3.5" />
              </button>
            )
          })}
        </div>

        <span className="h-4 w-px shrink-0 bg-white/12" />

        {/* Component Management Actions */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Bring to Front (])"
            aria-label="Bring to Front"
            onClick={() => onBringToFront?.()}
            className="flex size-6 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <BringToFront className="size-3.5" />
          </button>
          <button
            type="button"
            title="Send to Back ([)"
            aria-label="Send to Back"
            onClick={() => onSendToBack?.()}
            className="flex size-6 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <SendToBack className="size-3.5" />
          </button>
          <button
            type="button"
            title="Lock item"
            aria-label="Lock item"
            onClick={() => onToggleLock?.(true)}
            className="flex size-6 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-amber-300"
          >
            <Lock className="size-3.5" />
          </button>
          <button
            type="button"
            title="Edit text (✎)"
            aria-label="Edit text"
            onClick={() => onEditText?.()}
            className={`flex size-6 items-center justify-center rounded-lg transition ${
              isEditing
                ? 'bg-sky-500/20 text-sky-300'
                : 'text-zinc-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title="Duplicate (⌘D)"
            aria-label="Duplicate item"
            onClick={() => onDuplicate?.()}
            className="flex size-6 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            title="Drag or click to connect arrow (↗)"
            aria-label="Connect arrow"
            onPointerDown={(event) => {
              if (onStartConnectDrag) {
                onStartConnectDrag(event)
              }
            }}
            onClick={() => onConnect?.()}
            className="flex size-6 items-center justify-center rounded-lg bg-sky-500/14 text-sky-300 transition hover:bg-sky-500/28 hover:text-sky-100"
          >
            <ArrowUpRight className="size-3.5" />
          </button>
          <button
            type="button"
            title="Delete (⌫)"
            aria-label="Delete item"
            onClick={() => onDelete?.()}
            className="flex size-6 items-center justify-center rounded-lg text-rose-300 transition hover:bg-rose-500/25 hover:text-rose-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// 3. WhiteboardMultiSelectBar (Floating bar when selectedCount >= 2)
// ---------------------------------------------------------------------------

export type WhiteboardMultiSelectBarProps = {
  selectedCount: number
  activeColor?: ToolbarColor
  activeFillStyle?: ToolbarFillStyle
  allLocked?: boolean
  onAlign?: (alignment: ToolbarMultiAlign) => void
  onDistribute?: (axis: ToolbarMultiDistribute) => void
  onBatchColor?: (color: ToolbarColor) => void
  onBatchFillStyle?: (fillStyle: ToolbarFillStyle) => void
  onBringToFront?: () => void
  onSendToBack?: () => void
  onDuplicate?: () => void
  onToggleLock?: (locked: boolean) => void
  onDelete?: () => void
  onClearSelection?: () => void
  style?: React.CSSProperties
  className?: string
}

const MULTI_ALIGN_OPTIONS: readonly { id: ToolbarMultiAlign; label: string }[] = [
  { id: 'left', label: 'Align Left' },
  { id: 'center', label: 'Align Center Horizontally' },
  { id: 'right', label: 'Align Right' },
  { id: 'top', label: 'Align Top' },
  { id: 'middle', label: 'Align Middle Vertically' },
  { id: 'bottom', label: 'Align Bottom' }
]

export const WhiteboardMultiSelectBar = React.memo(function WhiteboardMultiSelectBar({
  selectedCount,
  activeColor,
  activeFillStyle,
  allLocked = false,
  onAlign,
  onDistribute,
  onBatchColor,
  onBatchFillStyle,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onToggleLock,
  onDelete,
  onClearSelection,
  style,
  className = ''
}: WhiteboardMultiSelectBarProps): React.JSX.Element | null {
  if (selectedCount < 2) {
    return null
  }

  return (
    <div
      data-whiteboard-multiselect="true"
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.preventDefault()}
      onDoubleClick={(event) => event.stopPropagation()}
      className={`pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-white/15 bg-[#0c0d10] px-2.5 py-1.5 text-xs text-zinc-100 shadow-2xl whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {/* Count Badge */}
      <span className="rounded-lg bg-sky-500/18 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-300 ring-1 ring-sky-400/35">
        {selectedCount} selected
      </span>

      <span className="h-3.5 w-px shrink-0 bg-white/12" />

      {/* Align Left / Center / Right / Top / Middle / Bottom */}
      <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
        {MULTI_ALIGN_OPTIONS.map((al) => (
          <button
            key={al.id}
            type="button"
            title={al.label}
            aria-label={al.label}
            onClick={() => onAlign?.(al.id)}
            className="flex size-5.5 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/12 hover:text-white"
          >
            <MultiAlignGlyph kind={al.id} />
          </button>
        ))}

        {/* Distribute H / V when selectedCount >= 3 */}
        {selectedCount >= 3 ? (
          <>
            <span className="mx-0.5 h-3.5 w-px bg-white/12" />
            <button
              type="button"
              title="Distribute Horizontally"
              aria-label="Distribute Horizontally"
              onClick={() => onDistribute?.('horizontal')}
              className="flex size-5.5 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/12 hover:text-white"
            >
              <MultiDistributeGlyph axis="horizontal" />
            </button>
            <button
              type="button"
              title="Distribute Vertically"
              aria-label="Distribute Vertically"
              onClick={() => onDistribute?.('vertical')}
              className="flex size-5.5 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/12 hover:text-white"
            >
              <MultiDistributeGlyph axis="vertical" />
            </button>
          </>
        ) : null}
      </div>

      <span className="h-3.5 w-px shrink-0 bg-white/12" />

      {/* Batch 8 Color Dots */}
      <div className="flex items-center gap-1">
        {TOOLBAR_COLORS.map((c) => {
          const sw = TOOLBAR_COLOR_SWATCH[c]
          const active = activeColor === c
          return (
            <button
              key={c}
              type="button"
              title={`Set color: ${sw.label}`}
              aria-label={`Batch color ${sw.label}`}
              onClick={() => onBatchColor?.(c)}
              className={`size-3 shrink-0 rounded-full transition-transform hover:scale-120 ${sw.dotClass} ${
                active
                  ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-950'
                  : 'opacity-80 hover:opacity-100'
              }`}
            />
          )
        })}
      </div>

      {/* Batch Fill: Soft / Solid / Paper / Glass */}
      <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-0.5">
        {(
          [
            { id: 'soft', label: 'Soft' },
            { id: 'solid', label: 'Solid' },
            { id: 'paper', label: 'Paper' },
            { id: 'paper-light', label: 'Light' },
            { id: 'glass', label: 'Glass' }
          ] satisfies readonly { id: ToolbarFillStyle; label: string }[]
        ).map((f) => {
          const active = activeFillStyle === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onBatchFillStyle?.(f.id)}
              className={`rounded-lg px-1.5 py-0.5 text-[10px] font-semibold transition ${
                active
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <span className="h-3.5 w-px shrink-0 bg-white/12" />

      {/* Bring Front / Send Back / Duplicate / Lock / Delete */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title="Bring to Front"
          aria-label="Bring selection to Front"
          onClick={() => onBringToFront?.()}
          className="flex size-5.5 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          <BringToFront className="size-3.5" />
        </button>
        <button
          type="button"
          title="Send to Back"
          aria-label="Send selection to Back"
          onClick={() => onSendToBack?.()}
          className="flex size-5.5 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          <SendToBack className="size-3.5" />
        </button>
        <button
          type="button"
          title="Duplicate selected items (⌘D)"
          aria-label="Duplicate selected items"
          onClick={() => onDuplicate?.()}
          className="flex size-5.5 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          <Copy className="size-3.5" />
        </button>
        <button
          type="button"
          title={allLocked ? 'Unlock selected items' : 'Lock selected items'}
          aria-label={allLocked ? 'Unlock selected items' : 'Lock selected items'}
          aria-pressed={allLocked}
          onClick={() => onToggleLock?.(!allLocked)}
          className={`flex size-5.5 items-center justify-center rounded-lg transition ${
            allLocked
              ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40'
              : 'text-zinc-300 hover:bg-white/10 hover:text-amber-300'
          }`}
        >
          {allLocked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
        </button>
        <button
          type="button"
          title="Delete selected items (⌫)"
          aria-label="Delete selected items"
          onClick={() => onDelete?.()}
          className="flex size-5.5 items-center justify-center rounded-lg text-rose-300 transition hover:bg-rose-500/25 hover:text-rose-100"
        >
          <Trash2 className="size-3.5" />
        </button>
        {onClearSelection ? (
          <button
            type="button"
            title="Clear selection (Esc)"
            aria-label="Clear selection"
            onClick={onClearSelection}
            className="flex size-5.5 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// 4. WhiteboardHistoryControls (Compact Undo / Redo pill next to zoom bar)
// ---------------------------------------------------------------------------

export type WhiteboardHistoryControlsProps = {
  canUndo: boolean
  canRedo: boolean
  onUndo?: () => void
  onRedo?: () => void
  className?: string
}

export const WhiteboardHistoryControls = React.memo(function WhiteboardHistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  className = ''
}: WhiteboardHistoryControlsProps): React.JSX.Element {
  return (
    <div
      data-whiteboard-history="true"
      onPointerDown={(event) => event.stopPropagation()}
      className={`pointer-events-auto flex items-center gap-0.5 rounded-2xl border border-border/60 bg-card/95 p-1 text-xs shadow-lg backdrop-blur-md ${className}`}
    >
      <button
        type="button"
        disabled={!canUndo}
        title="Undo (⌘Z)"
        aria-label="Undo (⌘Z)"
        onClick={() => {
          if (canUndo) {
            onUndo?.()
          }
        }}
        className={`flex size-7 items-center justify-center rounded-xl transition ${
          canUndo
            ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
            : 'cursor-not-allowed text-muted-foreground/35'
        }`}
      >
        <Undo2 className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={!canRedo}
        title="Redo (⇧⌘Z)"
        aria-label="Redo (⇧⌘Z)"
        onClick={() => {
          if (canRedo) {
            onRedo?.()
          }
        }}
        className={`flex size-7 items-center justify-center rounded-xl transition ${
          canRedo
            ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
            : 'cursor-not-allowed text-muted-foreground/35'
        }`}
      >
        <Redo2 className="size-3.5" />
      </button>
    </div>
  )
})
