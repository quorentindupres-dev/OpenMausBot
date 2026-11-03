import {
  A01_GROUPS,
  A01_ROLE_IDS,
  AGENT_ROLE_ACCESSORIES,
  type AgentRoleId
} from '../generated/a01-roles'
import { MAX_CANVAS_NODES, normalizeCanvasNode, type SpaceCanvasNode } from './canvas-nodes'
import { CARTOON_TOOL_ICONS, type CartoonToolIconKey } from './space-tool-icons'
import {
  STICKY_COLORS,
  WHITEBOARD_ARROW_ROUTINGS,
  WHITEBOARD_BORDER_STYLES,
  WHITEBOARD_FILL_STYLES,
  WHITEBOARD_FONT_FAMILIES,
  WHITEBOARD_FONT_WEIGHTS,
  WHITEBOARD_SHAPES,
  WHITEBOARD_TEXT_ALIGNS,
  type StickyColor,
  type WhiteboardArrowRouting,
  type WhiteboardBorderStyle,
  type WhiteboardFillStyle,
  type WhiteboardFontFamily,
  type WhiteboardFontWeight,
  type WhiteboardShapeType,
  type WhiteboardTextAlign
} from './whiteboard-kit'

export { CARTOON_TOOL_ICONS, type CartoonToolIconKey }

export const SPACE_LEVELS = ['P1', 'P2', 'P3', 'general', 'side'] as const
export type SpaceLevel = (typeof SPACE_LEVELS)[number]
export const MAX_OUTCOMES = 5
export const MAX_ROADMAP = 12
export const MAX_GOALS = 200
export const MAX_TASKS = 60
export const MAX_ASKS = 30
export const MAX_LOG = 500
export const MAX_REMOVED_ASK_IDS = 200
export const NOTE_KINDS = ['note', 'outcome', 'handoff', 'ask'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]
export type GoalStatus = 'active' | 'done' | 'parked'
export const BENCH_KEY = 'bench'
export const TAB_BAND_SPACES = 'spaces'
export const SPACE_LOCAL_STORAGE_KEY = 'xlabs.space-canvas.v1'

export type Point = { x: number; y: number }
export type View = { x: number; y: number; scale: number }
export type SpaceLayout = { x: number; y: number; w: number; h: number }
export type SpaceTile = SpaceLayout & { key: string }

export type SpaceOutcome = {
  id?: string
  text: string
  done: boolean
  createdAt?: string
}

export type SpaceTask = {
  id: string
  text: string
  botId?: string
  w93Slug?: string
  done: boolean
  createdAt: number
}

export type SpaceAsk = {
  id: string
  botId: string
  botName?: string
  agentName?: string
  terminalHandle?: string
  goalId?: string
  forBotId?: string
  text: string
  at: number
  status: 'open' | 'yes' | 'no'
  taskId?: string
}

export type SpaceFocusRequest = {
  spaceId?: string
  tabId?: string
  terminalHandle?: string
  agentName?: string
  role?: string
  requestedAt: number
}

export type SpaceGoal = {
  id: string
  title: string
  titleSize?: number
  bgColor?: string
  emoji?: string
  goal: string
  level: SpaceLevel
  outcomes: SpaceOutcome[]
  roadmap: string[]
  tasks: SpaceTask[]
  asks: SpaceAsk[]
  status: GoalStatus
  sortOrder: number
  kanbanCard?: string
  w93Slug?: string
  jobPath?: string
  layout?: SpaceLayout
  createdAt: number
  updatedAt: number
}

export type SpaceLogEntry = {
  id: string
  goalId: string
  botId?: string
  botName?: string
  at: number
  kind: NoteKind
  text: string
  signature: string
}

export const SPACE_EMOJI_CATEGORIES: readonly {
  id: string
  label: string
  emojis: readonly string[]
}[] = [
  {
    id: 'cartoon',
    label: '🎨 Cartoon Tools',
    emojis: [
      CARTOON_TOOL_ICONS.orca,
      CARTOON_TOOL_ICONS.copilot,
      CARTOON_TOOL_ICONS.alert,
      CARTOON_TOOL_ICONS.kanban,
      CARTOON_TOOL_ICONS.imageFactory,
      CARTOON_TOOL_ICONS.miniVault,
      CARTOON_TOOL_ICONS.pocketbase,
      CARTOON_TOOL_ICONS.dockStudio,
      CARTOON_TOOL_ICONS.toolSpace,
      CARTOON_TOOL_ICONS.toolNote,
      CARTOON_TOOL_ICONS.toolText,
      CARTOON_TOOL_ICONS.toolArrow
    ]
  },
  {
    id: 'popular',
    label: '★ Popular',
    emojis: [
      '🎯',
      '🚀',
      '🔥',
      '⚡',
      '🧪',
      '📦',
      '💰',
      '🛒',
      '📣',
      '🎬',
      '🤖',
      '🛡️',
      '🧠',
      '💎',
      '📈',
      '🤝',
      '🛠️',
      '✨',
      '🏆',
      '👑',
      '🧬',
      '💊',
      '📬',
      '🎨'
    ]
  },
  {
    id: 'business',
    label: '💼 Business',
    emojis: [
      '💵',
      '💳',
      '🏦',
      '📊',
      '📉',
      '🧾',
      '🏷️',
      '🛍️',
      '🎁',
      '🚚',
      '✈️',
      '🏭',
      '🏢',
      '⚖️',
      '🔐',
      '🔑',
      '🧲',
      '📡',
      '🪙',
      '💹',
      '💼',
      '🗂️',
      '📋',
      '📞'
    ]
  },
  {
    id: 'science',
    label: '🧪 Lab & Bio',
    emojis: [
      '🧪',
      '🧬',
      '💊',
      '🩺',
      '🔬',
      '🧫',
      '🩸',
      '🫀',
      '🧠',
      '🦴',
      '🌿',
      '🍃',
      '💧',
      '❄️',
      '☀️',
      '🌡️',
      '🧘',
      '🏋️',
      '🏃',
      '🥗',
      '🍵',
      '🫧',
      '⚗️',
      '🔭'
    ]
  },
  {
    id: 'tech',
    label: '🤖 Tech',
    emojis: [
      '🤖',
      '💻',
      '🖥️',
      '⌨️',
      '🖱️',
      '📱',
      '🛰️',
      '🔋',
      '🔌',
      '💾',
      '📷',
      '🎥',
      '🎙️',
      '🎧',
      '🕹️',
      '🎮',
      '👾',
      '🧩',
      '⚙️',
      '🔧',
      '🔨',
      '🪛',
      '🌐',
      '🔗'
    ]
  },
  {
    id: 'status',
    label: '🚦 Status',
    emojis: [
      '🟢',
      '🟠',
      '🔴',
      '🟡',
      '🔵',
      '🟣',
      '⚪',
      '✅',
      '❌',
      '⚠️',
      '🚨',
      '🛑',
      '⏳',
      '⏰',
      '🔔',
      '📌',
      '📍',
      '🚩',
      '🏁',
      '🔒',
      '🔓',
      '💡',
      '❓',
      '❗'
    ]
  },
  {
    id: 'vibe',
    label: '😎 Vibe',
    emojis: [
      '😎',
      '🤩',
      '🫡',
      '🙌',
      '👏',
      '💪',
      '🦁',
      '🦅',
      '🦈',
      '🐺',
      '🐉',
      '🦄',
      '🌟',
      '💥',
      '🎉',
      '🪩',
      '☕',
      '🍕',
      '🥩',
      '🥊',
      '🏎️',
      '🛸',
      '🌍',
      '🧭'
    ]
  }
]

export const SPACE_EMOJI_PALETTE: readonly string[] = SPACE_EMOJI_CATEGORIES.flatMap(
  (c) => c.emojis
)

export function isImageEmoji(value?: string): boolean {
  if (!value) {
    return false
  }
  const trimmed = value.trim()
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('/')
  )
}

export type SpaceBgPreset = {
  id: string
  label: string
  bg: string
  swatch: string
  isLight: boolean
}

export const SPACE_BG_PRESETS: readonly SpaceBgPreset[] = [
  { id: 'default', label: 'Dark Glass (Default)', bg: '', swatch: '#18181b', isLight: false },
  {
    id: 'alabaster',
    label: 'Alabaster Light (Only Light)',
    bg: 'rgba(248, 250, 252, 0.94)',
    swatch: '#f8fafc',
    isLight: true
  },
  {
    id: 'warm-cream',
    label: 'Warm Graphite',
    bg: 'rgba(28, 22, 17, 0.92)',
    swatch: '#1c1611',
    isLight: false
  },
  {
    id: 'ice-mist',
    label: 'Slate Mist',
    bg: 'rgba(16, 24, 32, 0.92)',
    swatch: '#101820',
    isLight: false
  },
  {
    id: 'soft-mint',
    label: 'Deep Teal',
    bg: 'rgba(10, 26, 22, 0.92)',
    swatch: '#0a1a16',
    isLight: false
  },
  {
    id: 'lavender-mist',
    label: 'Midnight Violet',
    bg: 'rgba(22, 18, 34, 0.92)',
    swatch: '#161222',
    isLight: false
  },
  {
    id: 'rose-blush',
    label: 'Oxblood Glass',
    bg: 'rgba(32, 14, 18, 0.92)',
    swatch: '#200e12',
    isLight: false
  },
  {
    id: 'peach-sand',
    label: 'Ember Sand',
    bg: 'rgba(32, 23, 14, 0.92)',
    swatch: '#20170e',
    isLight: false
  },
  {
    id: 'soft-silver',
    label: 'Gunmetal',
    bg: 'rgba(22, 24, 28, 0.92)',
    swatch: '#16181c',
    isLight: false
  },
  {
    id: 'sky-tint',
    label: 'Sky Wash (Dark)',
    bg: 'rgba(14, 116, 144, 0.24)',
    swatch: '#0e7490',
    isLight: false
  },
  {
    id: 'emerald-tint',
    label: 'Forest Wash (Dark)',
    bg: 'rgba(6, 95, 70, 0.26)',
    swatch: '#065f46',
    isLight: false
  },
  {
    id: 'violet-tint',
    label: 'Violet Wash (Dark)',
    bg: 'rgba(91, 33, 182, 0.24)',
    swatch: '#5b21b6',
    isLight: false
  }
]

export function resolveSpaceBgStyle(bgColor?: string): {
  backgroundColor?: string
  isLight: boolean
} {
  if (!bgColor || !bgColor.trim() || bgColor === 'default') {
    return { isLight: false }
  }
  const preset = SPACE_BG_PRESETS.find((p) => p.id === bgColor || p.bg === bgColor)
  if (preset) {
    return {
      ...(preset.bg ? { backgroundColor: preset.bg } : {}),
      isLight: preset.isLight
    }
  }
  const trimmed = bgColor.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    const r = Number.parseInt(trimmed.slice(1, 3), 16)
    const g = Number.parseInt(trimmed.slice(3, 5), 16)
    const b = Number.parseInt(trimmed.slice(5, 7), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return {
      backgroundColor: `rgba(${r}, ${g}, ${b}, 0.93)`,
      isLight: luminance > 0.58
    }
  }
  return { backgroundColor: trimmed, isLight: false }
}

export function defaultSpaceEmoji(
  title: string,
  level: SpaceLevel = 'general',
  explicitEmoji?: string
): string {
  if (explicitEmoji && explicitEmoji.trim()) {
    return explicitEmoji.trim()
  }
  const lower = (title || '').toLowerCase()
  if (/supplier|peptide|lab|manufactur|chem|source/.test(lower)) {
    return '🧪'
  }
  if (/fulfill|3pl|ship|logistic|warehouse|deliv/.test(lower)) {
    return '📦'
  }
  if (/ad|meta|facebook|creative|hook|campaign|marketing/.test(lower)) {
    return '📣'
  }
  if (/video|ugc|reel|tiktok|wan|storyboard/.test(lower)) {
    return '🎬'
  }
  if (/sale|deal|whatsapp|imessage|close|revenue|money|checkout/.test(lower)) {
    return '💰'
  }
  if (/profile|warm|phone|vmos|cloak|account/.test(lower)) {
    return '🛡️'
  }
  if (/code|build|orca|app|bug|agent|bot/.test(lower)) {
    return '🤖'
  }
  if (/shop|store|funnel|trust|offer|ecom/.test(lower)) {
    return '🛒'
  }
  switch (level) {
    case 'P1':
      return '🔥'
    case 'P2':
      return '🚀'
    case 'P3':
      return '⚡'
    case 'side':
      return '✨'
    default:
      return '🎯'
  }
}

export { STICKY_COLORS, type StickyColor }

export const STICKY_COLOR_STYLE: Record<
  StickyColor,
  {
    label: string
    bg: string
    border: string
    text: string
    headerBg: string
    dot: string
    stroke: string
  }
> = {
  amber: {
    label: 'Amber',
    bg: 'bg-amber-400/15',
    border: 'border-amber-400/50',
    text: 'text-amber-50',
    headerBg: 'bg-amber-400/20',
    dot: 'bg-amber-400',
    stroke: '#fbbf24'
  },
  emerald: {
    label: 'Emerald',
    bg: 'bg-emerald-400/15',
    border: 'border-emerald-400/50',
    text: 'text-emerald-50',
    headerBg: 'bg-emerald-400/20',
    dot: 'bg-emerald-400',
    stroke: '#34d399'
  },
  sky: {
    label: 'Sky',
    bg: 'bg-sky-400/15',
    border: 'border-sky-400/50',
    text: 'text-sky-50',
    headerBg: 'bg-sky-400/20',
    dot: 'bg-sky-400',
    stroke: '#38bdf8'
  },
  rose: {
    label: 'Rose',
    bg: 'bg-rose-400/15',
    border: 'border-rose-400/50',
    text: 'text-rose-50',
    headerBg: 'bg-rose-400/20',
    dot: 'bg-rose-400',
    stroke: '#fb7185'
  },
  violet: {
    label: 'Violet',
    bg: 'bg-violet-400/15',
    border: 'border-violet-400/50',
    text: 'text-violet-50',
    headerBg: 'bg-violet-400/20',
    dot: 'bg-violet-400',
    stroke: '#a78bfa'
  },
  indigo: {
    label: 'Indigo',
    bg: 'bg-indigo-400/15',
    border: 'border-indigo-400/50',
    text: 'text-indigo-50',
    headerBg: 'bg-indigo-400/20',
    dot: 'bg-indigo-400',
    stroke: '#818cf8'
  },
  paper: {
    label: 'Paper',
    bg: 'bg-stone-100/15',
    border: 'border-stone-200/50',
    text: 'text-stone-50',
    headerBg: 'bg-stone-100/20',
    dot: 'bg-stone-100',
    stroke: '#faf9f6'
  },
  zinc: {
    label: 'Slate',
    bg: 'bg-zinc-800/85',
    border: 'border-zinc-500/50',
    text: 'text-zinc-100',
    headerBg: 'bg-zinc-700/60',
    dot: 'bg-zinc-400',
    stroke: '#a1a1aa'
  }
}

export const MAX_STICKIES = 250
export const MAX_ARROWS = 300

export type SpaceStickyNote = {
  id: string
  text: string
  color: StickyColor
  kind?: 'note' | 'text' | 'shape'
  shapeType?: WhiteboardShapeType
  fillStyle?: WhiteboardFillStyle
  borderStyle?: WhiteboardBorderStyle
  textAlign?: WhiteboardTextAlign
  fontFamily?: WhiteboardFontFamily
  fontWeight?: WhiteboardFontWeight
  fontSize?: number
  autosize?: boolean
  zIndex?: number
  locked?: boolean
  hidden?: boolean
  groupId?: string
  name?: string
  opacity?: number
  x: number
  y: number
  w: number
  h: number
  createdAt: number
}

export type SpaceArrow = {
  id: string
  fromId?: string
  toId?: string
  fromPoint?: Point
  toPoint?: Point
  label?: string
  color?: StickyColor
  bend?: number
  dash?: 'solid' | 'dashed'
  routing?: WhiteboardArrowRouting
  hidden?: boolean
  name?: string
  createdAt: number
}

export type KanbanGoalCandidate = {
  card: string
  title: string
  state?: string
  roadmap: string[]
  tasks: string[]
}

export type SpaceState = {
  rev: number
  /** Bound C02 project slug for the entire Space whiteboard (e.g. `precision-peptide`, `surge`, `x-labs`). */
  projectSlug?: string
  goals: SpaceGoal[]
  placements: Record<string, string>
  placementNames?: Record<string, string>
  agentRoles?: Record<string, string>
  threadGoals: Record<string, string>
  log: SpaceLogEntry[]
  visualFirst: boolean
  bench?: SpaceLayout
  stickies?: SpaceStickyNote[]
  arrows?: SpaceArrow[]
  /** First-class draggable Session, A01 Agent, and C02 Project context nodes on the whiteboard. */
  nodes?: SpaceCanvasNode[]
  customEmojis?: string[]
  focusRequest?: SpaceFocusRequest | null
  removedAskIds?: string[]
}

export type ManualAgentStateMode = 'auto' | 'idle' | 'working' | 'attention'

export type AgentStateOverrideEntry = {
  mode: 'idle' | 'working' | 'attention'
  snapshotSig: string
  at: number
}

export type AgentStateOverrideMap = Record<string, AgentStateOverrideEntry>

export type SpaceSubagentStatus = 'working' | 'waiting' | 'done'

export type SpaceSubagent = {
  id: string
  role: string
  status: SpaceSubagentStatus
  harness?: string
  updatedAt?: number
}

export type SpaceSplitPanePreview = {
  id: number
  title?: string
  active?: boolean
  busy?: boolean
}

export type SpaceSplitInfo = {
  paneCount: number
  direction: 'horizontal' | 'vertical'
  panes: SpaceSplitPanePreview[]
}

export type SpaceAgent = {
  id: string
  unifiedTabId?: string
  name: string
  role?: string
  agent: string | null
  kind: 'terminal' | 'browser' | 'editor' | 'agent'
  busy?: boolean
  attention?: boolean
  manualMode?: ManualAgentStateMode
  msgSig?: string
  liveBusy?: boolean
  liveAttention?: boolean
  snapshotSig?: string
  subagents?: SpaceSubagent[]
  splitInfo?: SpaceSplitInfo
  activity?: string
  askText?: string
}

export function buildAgentSnapshotSig({
  liveBusy,
  liveAttention,
  msgSig
}: {
  liveBusy?: boolean
  liveAttention?: boolean
  msgSig?: string | null
}): string {
  const busyBit = liveBusy ? '1' : '0'
  const attnBit = !liveBusy && liveAttention ? '1' : '0'
  return `${busyBit}|${attnBit}|${(msgSig ?? '').trim()}`
}

export function resolveEffectiveAgentState({
  tabId,
  liveBusy,
  liveAttention,
  msgSig,
  snapshotSig,
  overrides
}: {
  tabId: string
  liveBusy: boolean
  liveAttention: boolean
  msgSig?: string
  snapshotSig?: string
  overrides?: Readonly<AgentStateOverrideMap> | null
}): {
  busy: boolean
  attention: boolean
  manualMode: ManualAgentStateMode
} {
  const autoBusy = Boolean(liveBusy)
  const autoAttention = !autoBusy && Boolean(liveAttention)
  const override = tabId && overrides ? overrides[tabId] : undefined
  if (!override || !override.snapshotSig) {
    return { busy: autoBusy, attention: autoAttention, manualMode: 'auto' }
  }
  const currentSig =
    snapshotSig ??
    buildAgentSnapshotSig({
      liveBusy: autoBusy,
      liveAttention: autoAttention,
      msgSig
    })
  if (override.snapshotSig !== currentSig) {
    return { busy: autoBusy, attention: autoAttention, manualMode: 'auto' }
  }
  if (override.mode === 'working') {
    return { busy: true, attention: false, manualMode: 'working' }
  }
  if (override.mode === 'attention') {
    return { busy: false, attention: true, manualMode: 'attention' }
  }
  return { busy: false, attention: false, manualMode: 'idle' }
}

export const SPACE_SPAWNER_GROUPS = A01_GROUPS

export type SpaceSpawnerGroup = (typeof SPACE_SPAWNER_GROUPS)[number]['id']
export const DEFAULT_SPACE_SPAWNER_GROUP: SpaceSpawnerGroup = 'command'

export type SpaceSpawner = {
  id: string
  roleId?: AgentRoleId
  label: string
  badge: string
  subtitle: string
  command: string | null
  defaultLevel: SpaceLevel
  group?: SpaceSpawnerGroup
}

export const A01_TEAM_SPAWNERS: readonly SpaceSpawner[] = A01_ROLE_IDS.map((roleId) => {
  const meta = AGENT_ROLE_ACCESSORIES[roleId]
  return {
    id: roleId,
    roleId,
    label: meta.label,
    badge: meta.archetype,
    subtitle: meta.tagline || meta.a01,
    command: roleId === 'agent' ? null : `/Users/g/.local/a01/bin/omp -${roleId}`,
    defaultLevel: roleId === 'ea' || roleId === 'coo' ? 'P1' : 'P2',
    group: meta.group
  }
})

export function buildSpawnerCommand(spawner: SpaceSpawner, modelId?: string): string | null {
  if (!spawner.command) {
    return null
  }
  const model = modelId ? SPACE_HARNESS_MODELS.find((m) => m.id === modelId) : undefined
  return model?.args ? `${spawner.command} ${model.args}` : spawner.command
}

export function resolveSpawnerGroup(spawner: Pick<SpaceSpawner, 'group'>): SpaceSpawnerGroup {
  return spawner.group ?? DEFAULT_SPACE_SPAWNER_GROUP
}

export type SpaceSpawnerSection = {
  group: SpaceSpawnerGroup
  label: string
  spawners: SpaceSpawner[]
}

export function groupSpawners(spawners: readonly SpaceSpawner[]): SpaceSpawnerSection[] {
  return SPACE_SPAWNER_GROUPS.map((section) => ({
    group: section.id,
    label: section.label,
    spawners: spawners.filter((spawner) => resolveSpawnerGroup(spawner) === section.id)
  })).filter((section) => section.spawners.length > 0)
}

export type SpaceHarnessId = 'agy' | 'claude' | 'grok' | 'unchain'

export type SpaceModelOption = {
  id: string
  harness: SpaceHarnessId
  harnessLabel: string
  label: string
  badge: string
  args: string
}

export const SPACE_HARNESS_MODELS: readonly SpaceModelOption[] = [
  {
    id: 'agy:gemini-4-argon-high',
    harness: 'agy',
    harnessLabel: 'AGY',
    label: 'Gemini 4 Argon (High)',
    badge: 'AGY · G4 High',
    args: '--agy --model gemini-4-argon-high'
  },
  {
    id: 'agy:gemini-3.8-flash-high',
    harness: 'agy',
    harnessLabel: 'AGY',
    label: 'Gemini 3.8 Flash (High)',
    badge: 'AGY · Flash',
    args: '--agy --model gemini-3.8-flash-high'
  },
  {
    id: 'agy:claude-opus-4-6-thinking',
    harness: 'agy',
    harnessLabel: 'AGY',
    label: 'Claude Opus 4.6 (AGY)',
    badge: 'AGY · Opus 4.6',
    args: '--agy --model claude-opus-4-6-thinking'
  },
  {
    id: 'agy:claude-sonnet-4-6',
    harness: 'agy',
    harnessLabel: 'AGY',
    label: 'Claude Sonnet 4.6 (AGY)',
    badge: 'AGY · Sonnet 4.6',
    args: '--agy --model claude-sonnet-4-6'
  },
  {
    id: 'claude:opus',
    harness: 'claude',
    harnessLabel: 'Claude',
    label: 'Claude Opus (Native CLI)',
    badge: 'Claude · Opus',
    args: '--claude --model opus'
  },
  {
    id: 'claude:sonnet',
    harness: 'claude',
    harnessLabel: 'Claude',
    label: 'Claude Sonnet (Native CLI)',
    badge: 'Claude · Sonnet',
    args: '--claude --model sonnet'
  },
  {
    id: 'grok:grok-4.7',
    harness: 'grok',
    harnessLabel: 'Grok',
    label: 'Grok 4.7 (OMP)',
    badge: 'Grok · 4.7',
    args: '--grok --model grok-4.7'
  },
  {
    id: 'unchain:gemini-4',
    harness: 'unchain',
    harnessLabel: 'Unchain',
    label: 'Unchain Gemini 4',
    badge: 'Unchain · G4',
    args: '--gemini4'
  },
  {
    id: 'unchain:deepseek-4-1',
    harness: 'unchain',
    harnessLabel: 'Unchain',
    label: 'Unchain DeepSeek',
    badge: 'Unchain · DS',
    args: '--deepseek'
  }
]

export const DEFAULT_SPACE_MODEL_ID = 'agy:gemini-4-argon-high'

export const EMPTY_SPACE: SpaceState = {
  rev: 0,
  goals: [],
  placements: {},
  placementNames: {},
  threadGoals: {},
  log: [],
  visualFirst: false
}

export const LEVEL_WORDS: Record<SpaceLevel, string> = {
  P1: 'P1 (top priority)',
  P2: 'P2 (high priority)',
  P3: 'P3 (normal priority)',
  general: 'General',
  side: 'Side quest'
}

export const LEVEL_STYLE: Record<
  SpaceLevel,
  {
    label: string
    shortLabel: string
    color: string
    band: string
    border: string
    chip: string
    dot: string
  }
> = {
  P1: {
    label: 'P1 · Top priority',
    shortLabel: 'P1',
    color: '#ef4444',
    band: 'bg-red-500',
    border: 'border-red-500/55',
    chip: 'bg-red-500/15 text-red-400 border-red-500/30',
    dot: 'bg-red-500'
  },
  P2: {
    label: 'P2 · High priority',
    shortLabel: 'P2',
    color: '#f97316',
    band: 'bg-orange-500',
    border: 'border-orange-500/55',
    chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    dot: 'bg-orange-500'
  },
  P3: {
    label: 'P3 · Normal priority',
    shortLabel: 'P3',
    color: '#eab308',
    band: 'bg-yellow-400',
    border: 'border-yellow-500/55',
    chip: 'bg-yellow-400/20 text-yellow-300 border-yellow-500/30',
    dot: 'bg-yellow-400'
  },
  general: {
    label: 'General',
    shortLabel: 'General',
    color: '#9ca3af',
    band: 'bg-zinc-400/50',
    border: 'border-border/70',
    chip: 'bg-muted text-muted-foreground border-border/60',
    dot: 'bg-zinc-400'
  },
  side: {
    label: 'Side quest',
    shortLabel: 'Side quest',
    color: '#52525b',
    band: 'bg-zinc-600',
    border: 'border-zinc-500/55 border-dashed',
    chip: 'bg-zinc-700/40 text-zinc-300 border-zinc-500/40',
    dot: 'bg-zinc-500'
  }
}

export function levelWords(level: SpaceLevel): string {
  return LEVEL_WORDS[level]
}

export function newSpaceId(prefix = 'sp'): string {
  return `${prefix}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 10)}`
}

export function signature(
  name: string,
  botId: string | undefined,
  space: string,
  at: number
): string {
  return `— ${name}${botId ? ` (${botId})` : ''} · ${space} · ${new Date(at).toISOString()}`
}

const OLD_PRIORITIES: Record<string, SpaceLevel> = { P0: 'P1', P1: 'P2', P2: 'P3' }

type LegacyGoal = Omit<Partial<SpaceGoal>, 'outcomes' | 'roadmap'> & {
  outcomes?: unknown
  roadmap?: unknown
  kind?: unknown
  priority?: unknown
  outcome?: unknown
  kpis?: { label?: unknown; current?: unknown; target?: unknown }[]
}

function isValidLayout(value: unknown): value is SpaceLayout {
  if (!value || typeof value !== 'object') {
    return false
  }
  const c = value as Record<string, unknown>
  return [c.x, c.y, c.w, c.h].every((v) => typeof v === 'number' && Number.isFinite(v))
}

function clampLayout(raw: SpaceLayout): SpaceLayout {
  return {
    x: Math.max(-100_000, Math.min(100_000, raw.x)),
    y: Math.max(-100_000, Math.min(100_000, raw.y)),
    w: Math.max(80, Math.min(4000, raw.w)),
    h: Math.max(60, Math.min(8000, raw.h))
  }
}

function levelOf(raw: LegacyGoal): SpaceLevel {
  if (SPACE_LEVELS.includes(raw.level as SpaceLevel)) {
    return raw.level as SpaceLevel
  }
  if (raw.kind === 'side') {
    return 'side'
  }
  if (typeof raw.priority === 'string' && Object.hasOwn(OLD_PRIORITIES, raw.priority)) {
    return OLD_PRIORITIES[raw.priority] ?? 'general'
  }
  return 'general'
}

export function normalizeGoal(raw: LegacyGoal): SpaceGoal {
  const kpis = Array.isArray(raw.kpis) ? raw.kpis : []
  const rawOutcomes: SpaceOutcome[] = Array.isArray(raw.outcomes)
    ? raw.outcomes
        .filter((i): i is { id?: unknown; text: string; done?: unknown; createdAt?: unknown } =>
          Boolean(
            i &&
            typeof i === 'object' &&
            typeof (i as { text?: unknown }).text === 'string' &&
            (i as { text: string }).text.trim()
          )
        )
        .map((i, idx) => ({
          id: typeof i.id === 'string' && i.id.trim() ? i.id.trim() : `outcome-${idx + 1}`,
          text: i.text.trim().slice(0, 160),
          done: Boolean(i.done),
          createdAt: typeof i.createdAt === 'string' && i.createdAt.trim() ? i.createdAt.trim() : ''
        }))
    : kpis
        .filter((k) => typeof k?.label === 'string' && k.label.trim())
        .map((k, idx) => {
          const tail = [k.current, k.target]
            .filter((p): p is string => typeof p === 'string' && Boolean(p.trim()))
            .map((p) => p.trim())
            .join(' / ')
          const label = String(k.label).trim()
          return {
            id: `outcome-${idx + 1}`,
            text: (tail ? `${label}: ${tail}` : label).slice(0, 160),
            done: false,
            createdAt: ''
          }
        })
  const outcomes = rawOutcomes.slice(0, MAX_OUTCOMES)
  const roadmap = outcomes.map((o) => o.text).slice(0, MAX_ROADMAP)
  const rawGoal =
    typeof raw.goal === 'string' ? raw.goal : typeof raw.outcome === 'string' ? raw.outcome : ''
  const titleSize =
    typeof raw.titleSize === 'number' && Number.isFinite(raw.titleSize)
      ? Math.max(12, Math.min(36, Math.round(raw.titleSize)))
      : undefined
  const bgColor =
    typeof raw.bgColor === 'string' && raw.bgColor.trim() && raw.bgColor.trim() !== 'default'
      ? raw.bgColor.trim().slice(0, 64)
      : undefined

  return {
    id: String(raw.id || newSpaceId('goal')),
    title: (typeof raw.title === 'string' ? raw.title : '').trim().slice(0, 120),
    ...(titleSize ? { titleSize } : {}),
    ...(bgColor ? { bgColor } : {}),
    ...(typeof raw.emoji === 'string' && raw.emoji.trim()
      ? { emoji: raw.emoji.trim().slice(0, 32_000) }
      : {}),
    goal: rawGoal.trim().slice(0, 240),
    level: levelOf(raw),
    outcomes,
    roadmap,
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    asks: Array.isArray(raw.asks) ? raw.asks : [],
    status: raw.status === 'done' || raw.status === 'parked' ? raw.status : 'active',
    sortOrder: typeof raw.sortOrder === 'number' ? Math.trunc(raw.sortOrder) : 0,
    ...(typeof raw.kanbanCard === 'string' && raw.kanbanCard.trim()
      ? { kanbanCard: raw.kanbanCard.trim().slice(0, 120) }
      : {}),
    ...(typeof raw.jobPath === 'string' && raw.jobPath.trim()
      ? { jobPath: raw.jobPath.trim().slice(0, 400) }
      : {}),
    ...(isValidLayout(raw.layout) ? { layout: clampLayout(raw.layout) } : {}),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
  }
}

function isValidPoint(val: unknown): val is Point {
  if (!val || typeof val !== 'object') {
    return false
  }
  const p = val as Record<string, unknown>
  return (
    typeof p.x === 'number' &&
    Number.isFinite(p.x) &&
    typeof p.y === 'number' &&
    Number.isFinite(p.y)
  )
}

export const MAX_LAYER_NAME = 120
export const MAX_GROUP_ID = 64

function cleanLayerName(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, MAX_LAYER_NAME) : undefined
}

function normalizeLayerFields(
  obj: Record<string, unknown>
): Pick<SpaceStickyNote, 'hidden' | 'groupId' | 'name' | 'opacity'> {
  const groupId =
    typeof obj.groupId === 'string' && obj.groupId.trim()
      ? obj.groupId.trim().slice(0, MAX_GROUP_ID)
      : undefined
  const name = cleanLayerName(obj.name)
  const opacity =
    typeof obj.opacity === 'number' && Number.isFinite(obj.opacity)
      ? Math.max(0, Math.min(1, obj.opacity))
      : undefined
  return {
    ...(typeof obj.hidden === 'boolean' ? { hidden: obj.hidden } : {}),
    ...(groupId ? { groupId } : {}),
    ...(name ? { name } : {}),
    ...(opacity !== undefined ? { opacity } : {})
  }
}

export function clearOrphanGroups(stickies: SpaceStickyNote[]): SpaceStickyNote[] {
  const counts = new Map<string, number>()
  for (const s of stickies) {
    if (s.groupId) {
      counts.set(s.groupId, (counts.get(s.groupId) ?? 0) + 1)
    }
  }
  if (![...counts.values()].some((n) => n < 2)) {
    return stickies
  }
  return stickies.map((s) => {
    if (!s.groupId || (counts.get(s.groupId) ?? 0) >= 2) {
      return s
    }
    const { groupId: _orphan, ...rest } = s
    return rest
  })
}

export function normalizeStickyNote(raw: unknown): SpaceStickyNote | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const obj = raw as Record<string, unknown>
  const color: StickyColor = STICKY_COLORS.includes(obj.color as StickyColor)
    ? (obj.color as StickyColor)
    : 'amber'
  const kind: 'note' | 'text' | 'shape' | undefined =
    obj.kind === 'text' || obj.kind === 'note' || obj.kind === 'shape' ? obj.kind : undefined
  const shapeType: WhiteboardShapeType | undefined = WHITEBOARD_SHAPES.includes(
    obj.shapeType as WhiteboardShapeType
  )
    ? (obj.shapeType as WhiteboardShapeType)
    : undefined
  const fillStyle: WhiteboardFillStyle | undefined = WHITEBOARD_FILL_STYLES.includes(
    obj.fillStyle as WhiteboardFillStyle
  )
    ? (obj.fillStyle as WhiteboardFillStyle)
    : undefined
  const borderStyle: WhiteboardBorderStyle | undefined = WHITEBOARD_BORDER_STYLES.includes(
    obj.borderStyle as WhiteboardBorderStyle
  )
    ? (obj.borderStyle as WhiteboardBorderStyle)
    : undefined
  const textAlign: WhiteboardTextAlign | undefined = WHITEBOARD_TEXT_ALIGNS.includes(
    obj.textAlign as WhiteboardTextAlign
  )
    ? (obj.textAlign as WhiteboardTextAlign)
    : undefined
  const fontFamily: WhiteboardFontFamily | undefined = WHITEBOARD_FONT_FAMILIES.includes(
    obj.fontFamily as WhiteboardFontFamily
  )
    ? (obj.fontFamily as WhiteboardFontFamily)
    : undefined
  const fontWeight: WhiteboardFontWeight | undefined = WHITEBOARD_FONT_WEIGHTS.includes(
    obj.fontWeight as WhiteboardFontWeight
  )
    ? (obj.fontWeight as WhiteboardFontWeight)
    : undefined
  const fontSize =
    typeof obj.fontSize === 'number' && Number.isFinite(obj.fontSize)
      ? Math.max(12, Math.min(200, Math.round(obj.fontSize)))
      : undefined
  const autosize = typeof obj.autosize === 'boolean' ? obj.autosize : undefined
  const zIndex =
    typeof obj.zIndex === 'number' && Number.isFinite(obj.zIndex)
      ? Math.max(-50, Math.min(500, Math.round(obj.zIndex)))
      : undefined
  const locked = typeof obj.locked === 'boolean' ? obj.locked : undefined
  const layerFields = normalizeLayerFields(obj)
  const x = typeof obj.x === 'number' && Number.isFinite(obj.x) ? obj.x : 80
  const y = typeof obj.y === 'number' && Number.isFinite(obj.y) ? obj.y : 80
  const defaultW = kind === 'shape' ? 180 : 220
  const defaultH = kind === 'shape' ? 100 : 160
  const w =
    typeof obj.w === 'number' && Number.isFinite(obj.w)
      ? Math.max(48, Math.min(1600, obj.w))
      : defaultW
  const h =
    typeof obj.h === 'number' && Number.isFinite(obj.h)
      ? Math.max(36, Math.min(1600, obj.h))
      : defaultH
  return {
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : newSpaceId('sticky'),
    text: typeof obj.text === 'string' ? obj.text.slice(0, 2000) : '',
    color,
    ...(kind ? { kind } : {}),
    ...(shapeType ? { shapeType } : {}),
    ...(fillStyle ? { fillStyle } : {}),
    ...(borderStyle ? { borderStyle } : {}),
    ...(textAlign ? { textAlign } : {}),
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontWeight ? { fontWeight } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(typeof autosize === 'boolean' ? { autosize } : {}),
    ...(zIndex !== undefined ? { zIndex } : {}),
    ...(typeof locked === 'boolean' ? { locked } : {}),
    ...layerFields,
    x: Math.max(-100_000, Math.min(100_000, x)),
    y: Math.max(-100_000, Math.min(100_000, y)),
    w,
    h,
    createdAt:
      typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt) ? obj.createdAt : 0
  }
}

export function normalizeArrow(raw: unknown): SpaceArrow | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const obj = raw as Record<string, unknown>
  const fromId = typeof obj.fromId === 'string' && obj.fromId.trim() ? obj.fromId.trim() : undefined
  const toId = typeof obj.toId === 'string' && obj.toId.trim() ? obj.toId.trim() : undefined
  const fromPoint = isValidPoint(obj.fromPoint)
    ? { x: obj.fromPoint.x, y: obj.fromPoint.y }
    : undefined
  const toPoint = isValidPoint(obj.toPoint) ? { x: obj.toPoint.x, y: obj.toPoint.y } : undefined
  if (!fromId && !fromPoint && !toId && !toPoint) {
    return null
  }
  const color: StickyColor | undefined = STICKY_COLORS.includes(obj.color as StickyColor)
    ? (obj.color as StickyColor)
    : undefined
  const label =
    typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim().slice(0, 120) : undefined
  const bend =
    typeof obj.bend === 'number' && Number.isFinite(obj.bend) && Math.abs(obj.bend) >= 1
      ? Math.max(-1200, Math.min(1200, Math.round(obj.bend)))
      : undefined
  const dash: 'solid' | 'dashed' | undefined =
    obj.dash === 'dashed' ? 'dashed' : obj.dash === 'solid' ? 'solid' : undefined
  const routing: WhiteboardArrowRouting | undefined = WHITEBOARD_ARROW_ROUTINGS.includes(
    obj.routing as WhiteboardArrowRouting
  )
    ? (obj.routing as WhiteboardArrowRouting)
    : undefined
  return {
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : newSpaceId('arrow'),
    ...(fromId ? { fromId } : {}),
    ...(toId ? { toId } : {}),
    ...(fromPoint ? { fromPoint } : {}),
    ...(toPoint ? { toPoint } : {}),
    ...(label ? { label } : {}),
    ...(color ? { color } : {}),
    ...(bend !== undefined ? { bend } : {}),
    ...(dash ? { dash } : {}),
    ...(routing ? { routing } : {}),
    ...(typeof obj.hidden === 'boolean' ? { hidden: obj.hidden } : {}),
    ...(cleanLayerName(obj.name) ? { name: cleanLayerName(obj.name) } : {}),
    createdAt:
      typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt) ? obj.createdAt : 0
  }
}

function cleanMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && v.trim()) {
      out[k] = v.trim()
    }
  }
  return out
}

export function normalizeSpaceState(raw: unknown): SpaceState {
  if (!raw || typeof raw !== 'object') {
    return {
      ...EMPTY_SPACE,
      goals: [],
      placements: {},
      placementNames: {},
      threadGoals: {},
      log: []
    }
  }
  const obj = raw as Record<string, unknown>
  const goals = Array.isArray(obj.goals)
    ? obj.goals
        .filter((i): i is LegacyGoal => Boolean(i && typeof i === 'object'))
        .map(normalizeGoal)
    : []
  const log: SpaceLogEntry[] = Array.isArray(obj.log)
    ? obj.log
        .filter((e): e is Record<string, unknown> =>
          Boolean(e && typeof e === 'object' && typeof (e as { id?: unknown }).id === 'string')
        )
        .map((e) => ({
          id: String(e.id),
          goalId: typeof e.goalId === 'string' ? e.goalId : '',
          at: typeof e.at === 'number' ? e.at : 0,
          kind: NOTE_KINDS.includes(e.kind as NoteKind) ? (e.kind as NoteKind) : 'note',
          text: typeof e.text === 'string' ? e.text : '',
          signature: typeof e.signature === 'string' ? e.signature : '',
          ...(typeof e.botId === 'string' && e.botId ? { botId: e.botId } : {}),
          ...(typeof e.botName === 'string' && e.botName ? { botName: e.botName } : {})
        }))
        .slice(-MAX_LOG)
    : []
  const stickies = Array.isArray(obj.stickies)
    ? clearOrphanGroups(
        obj.stickies
          .map(normalizeStickyNote)
          .filter((s): s is SpaceStickyNote => s !== null)
          .slice(0, MAX_STICKIES)
      )
    : []
  const arrows = Array.isArray(obj.arrows)
    ? obj.arrows
        .map(normalizeArrow)
        .filter((a): a is SpaceArrow => a !== null)
        .slice(0, MAX_ARROWS)
    : []
  const nodes = Array.isArray(obj.nodes)
    ? obj.nodes
        .map((item) => normalizeCanvasNode(item, newSpaceId))
        .filter((n): n is SpaceCanvasNode => n !== null)
        .slice(0, MAX_CANVAS_NODES)
    : []
  const customEmojis = Array.isArray(obj.customEmojis)
    ? obj.customEmojis
        .filter((e): e is string => typeof e === 'string' && Boolean(e.trim()))
        .map((e) => e.trim().slice(0, 32_000))
        .slice(0, 48)
    : []
  const removedAskIds = Array.isArray(obj.removedAskIds)
    ? [
        ...new Set(
          obj.removedAskIds.filter((id): id is string => typeof id === 'string' && Boolean(id))
        )
      ].slice(-MAX_REMOVED_ASK_IDS)
    : []
  const rawFocus =
    obj.focusRequest && typeof obj.focusRequest === 'object'
      ? (obj.focusRequest as Record<string, unknown>)
      : null
  const focusRequest: SpaceFocusRequest | undefined =
    rawFocus && typeof rawFocus.requestedAt === 'number' && Number.isFinite(rawFocus.requestedAt)
      ? {
          requestedAt: rawFocus.requestedAt,
          ...(typeof rawFocus.spaceId === 'string' && rawFocus.spaceId.trim()
            ? { spaceId: rawFocus.spaceId.trim() }
            : {}),
          ...(typeof rawFocus.tabId === 'string' && rawFocus.tabId.trim()
            ? { tabId: rawFocus.tabId.trim() }
            : {}),
          ...(typeof rawFocus.terminalHandle === 'string' && rawFocus.terminalHandle.trim()
            ? { terminalHandle: rawFocus.terminalHandle.trim() }
            : {}),
          ...(typeof rawFocus.agentName === 'string' && rawFocus.agentName.trim()
            ? { agentName: rawFocus.agentName.trim() }
            : {}),
          ...(typeof rawFocus.role === 'string' && rawFocus.role.trim()
            ? { role: rawFocus.role.trim() }
            : {})
        }
      : undefined
  const projectSlug =
    typeof obj.projectSlug === 'string' && obj.projectSlug.trim()
      ? obj.projectSlug.trim().slice(0, 80)
      : undefined
  const agentRoles = cleanMap(obj.agentRoles)
  return {
    rev: typeof obj.rev === 'number' && Number.isFinite(obj.rev) ? Math.trunc(obj.rev) : 0,
    ...(projectSlug ? { projectSlug } : {}),
    goals,
    placements: cleanMap(obj.placements),
    placementNames: cleanMap(obj.placementNames),
    ...(Object.keys(agentRoles).length > 0 ? { agentRoles } : {}),
    threadGoals: cleanMap(obj.threadGoals),
    log,
    visualFirst: obj.visualFirst === true,
    ...(isValidLayout(obj.bench) ? { bench: clampLayout(obj.bench) } : {}),
    ...(stickies.length > 0 ? { stickies } : {}),
    ...(arrows.length > 0 ? { arrows } : {}),
    ...(nodes.length > 0 ? { nodes } : {}),
    ...(customEmojis.length > 0 ? { customEmojis } : {}),
    ...(focusRequest ? { focusRequest } : {}),
    ...(removedAskIds.length > 0 ? { removedAskIds } : {})
  }
}

export const WHITEBOARD_GOAL_FIELDS = [
  'layout',
  'title',
  'titleSize',
  'emoji',
  'bgColor',
  'level',
  'status',
  'goal'
] as const
type WhiteboardGoalField = (typeof WHITEBOARD_GOAL_FIELDS)[number]

export function isUndoableGoalPatch(patch: Partial<SpaceGoal>): boolean {
  return WHITEBOARD_GOAL_FIELDS.some((key) => Object.hasOwn(patch, key))
}

export type WhiteboardGoalSnapshot = Partial<Pick<SpaceGoal, WhiteboardGoalField>> & {
  id: string
  body: Omit<SpaceGoal, 'asks'>
}

export type WhiteboardSnapshot = {
  projectSlug?: string
  goals: WhiteboardGoalSnapshot[]
  bench?: SpaceLayout
  stickies?: SpaceStickyNote[]
  arrows?: SpaceArrow[]
  nodes?: SpaceCanvasNode[]
}

export type WhiteboardHistory = {
  past: WhiteboardSnapshot[]
  future: WhiteboardSnapshot[]
  lastText: { id: string; at: number } | null
}

export const MAX_WHITEBOARD_HISTORY = 40
export const WHITEBOARD_TEXT_MERGE_MS = 1000

export function emptyWhiteboardHistory(): WhiteboardHistory {
  return { past: [], future: [], lastText: null }
}

export function pickWhiteboardFields(goal: SpaceGoal): WhiteboardGoalSnapshot {
  const { asks: _asks, ...body } = goal
  const picked: WhiteboardGoalSnapshot = { id: goal.id, body: structuredClone(body) }
  for (const key of WHITEBOARD_GOAL_FIELDS) {
    if (goal[key] !== undefined) {
      ;(picked as Record<string, unknown>)[key] = structuredClone(goal[key])
    }
  }
  return picked
}

export function captureWhiteboardSnapshot(state: SpaceState): WhiteboardSnapshot {
  return {
    ...(state.projectSlug ? { projectSlug: state.projectSlug } : {}),
    goals: state.goals.map(pickWhiteboardFields),
    ...(state.bench ? { bench: { ...state.bench } } : {}),
    ...(state.stickies ? { stickies: structuredClone(state.stickies) } : {}),
    ...(state.arrows ? { arrows: structuredClone(state.arrows) } : {}),
    ...(state.nodes ? { nodes: structuredClone(state.nodes) } : {})
  }
}

export function restoreWhiteboardSnapshot(
  current: SpaceState,
  snap: WhiteboardSnapshot
): SpaceState {
  const live = new Map(current.goals.map((goal) => [goal.id, goal]))
  const snapIds = new Set(snap.goals.map((goal) => goal.id))
  const placedGoalIds = new Set(Object.values(current.placements ?? {}))
  const goals: SpaceGoal[] = snap.goals.map((picked) => {
    const base: SpaceGoal = live.get(picked.id) ?? { ...structuredClone(picked.body), asks: [] }
    const next: SpaceGoal = { ...base }
    for (const key of WHITEBOARD_GOAL_FIELDS) {
      if (picked[key] === undefined) {
        delete next[key]
      } else {
        ;(next as Record<string, unknown>)[key] = structuredClone(picked[key])
      }
    }
    return next
  })
  for (const goal of current.goals) {
    if (snapIds.has(goal.id)) {
      continue
    }
    if (goal.asks.length > 0 || placedGoalIds.has(goal.id)) {
      goals.push(goal)
    }
  }
  const next: SpaceState = { ...current, goals }
  for (const key of ['projectSlug', 'bench', 'stickies', 'arrows', 'nodes'] as const) {
    if (snap[key] === undefined) {
      delete next[key]
    } else {
      ;(next as Record<string, unknown>)[key] = structuredClone(snap[key])
    }
  }
  return next
}

export function recordWhiteboardHistory(
  history: WhiteboardHistory,
  state: SpaceState,
  now: number,
  coalesceTextStickyId?: string
): WhiteboardHistory {
  let lastText: WhiteboardHistory['lastText'] = null
  if (coalesceTextStickyId) {
    const prev = history.lastText
    if (prev && prev.id === coalesceTextStickyId && now - prev.at < WHITEBOARD_TEXT_MERGE_MS) {
      return { ...history, lastText: { id: prev.id, at: now } }
    }
    lastText = { id: coalesceTextStickyId, at: now }
  }
  return {
    past: [...history.past.slice(-(MAX_WHITEBOARD_HISTORY - 1)), captureWhiteboardSnapshot(state)],
    future: [],
    lastText
  }
}

export function stepWhiteboardHistory(
  history: WhiteboardHistory,
  current: SpaceState,
  direction: 'undo' | 'redo'
): { history: WhiteboardHistory; space: SpaceState } | null {
  const from = direction === 'undo' ? history.past : history.future
  const to = direction === 'undo' ? history.future : history.past
  const target = from.at(-1)
  if (!target) {
    return null
  }
  const nextTo = [...to.slice(-(MAX_WHITEBOARD_HISTORY - 1)), captureWhiteboardSnapshot(current)]
  const nextFrom = from.slice(0, -1)
  return {
    history: {
      past: direction === 'undo' ? nextFrom : nextTo,
      future: direction === 'undo' ? nextTo : nextFrom,
      lastText: null
    },
    space: restoreWhiteboardSnapshot(current, target)
  }
}

export {
  CARD_WIDTH,
  CARD_HEIGHT,
  GAP,
  TEAM_PADDING,
  TILE_HEADER,
  TILE_SUMMARY,
  tileSize,
  minTileHeightForWidth,
  resizeTileLayout,
  type TileResizeHandle,
  extraPresenceHeightForAgent,
  extraPresenceHeightForMembers,
  layoutSpaces,
  toCanvas,
  zoomAt,
  ZOOM_STEP_IN_FACTOR,
  ZOOM_STEP_OUT_FACTOR,
  ZOOM_WHEEL_SENSITIVITY_IN,
  ZOOM_WHEEL_SENSITIVITY_OUT,
  ZOOM_TWEEN_MS,
  fitSpaces,
  type KanbanCardImport,
  cardsFromKanbanTree,
  resolveAgentGoalId,
  purgeAgentPlacements,
  isAssistantMessageAskingQuestion,
  doesAskMatchAgent,
  doesAgentHaveOpenAsk,
  resolveFocusRequestTarget,
  readSpaceLocal,
  writeSpaceLocal
} from './space-layout'

export {
  CARDINAL_PORTS,
  WHITEBOARD_SHAPES,
  WHITEBOARD_FILL_STYLES,
  WHITEBOARD_BORDER_STYLES,
  WHITEBOARD_TEXT_ALIGNS,
  WHITEBOARD_FONT_FAMILIES,
  WHITEBOARD_FONT_WEIGHTS,
  WHITEBOARD_ARROW_ROUTINGS,
  clampNum,
  snapAxisDelta,
  snapPointAngle15Deg,
  getCardinalPortPoints,
  resolveSmartBoxAnchor,
  computeSignedBendFromPoint,
  resolveArrowPathAndHandles,
  resolveWhiteboardSurfaceStyle,
  computeShapeDimensions,
  computeAutoTextDimensions,
  computeCardMinHeight,
  alignWhiteboardItems,
  distributeWhiteboardItems,
  rectIntersectsBox,
  normalizeMarqueeRect,
  type CardinalSide,
  type WhiteboardPoint,
  type WhiteboardRect,
  type WhiteboardShapeType,
  type WhiteboardFillStyle,
  type WhiteboardBorderStyle,
  type WhiteboardTextAlign,
  type WhiteboardFontFamily,
  type WhiteboardFontWeight,
  type WhiteboardArrowRouting,
  type WhiteboardSurfaceStyle
} from './whiteboard-kit'
