import {
  BENCH_KEY,
  EMPTY_SPACE,
  SPACE_LEVELS,
  SPACE_LOCAL_STORAGE_KEY,
  normalizeSpaceState,
  type Point,
  type SpaceAgent,
  type SpaceAsk,
  type SpaceFocusRequest,
  type SpaceGoal,
  type SpaceLayout,
  type SpaceState,
  type SpaceTile,
  type View
} from './space'

export const CARD_WIDTH = 148
export const CARD_HEIGHT = 112
export const GAP = 14
export const TEAM_PADDING = 20
export const TILE_HEADER = 76
export const TILE_SUMMARY = 40
const EMPTY_HEIGHT = 96
const SPACING = 48

export function tileSize(agentCount: number, side = false): { w: number; h: number } {
  const columns = agentCount > 4 ? 3 : 2
  const rows = Math.ceil(agentCount / columns)
  const cardsHeight = rows > 0 ? rows * (CARD_HEIGHT + GAP) - GAP : EMPTY_HEIGHT
  return {
    w: columns * CARD_WIDTH + (columns - 1) * GAP + TEAM_PADDING * 2,
    h: TILE_HEADER + (side ? 0 : TILE_SUMMARY) + cardsHeight + TEAM_PADDING
  }
}

export type TileResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'e' | 's'
export const TILE_MIN_W = 260
export const TILE_MAX_W = 2600
export const TILE_MIN_H = 160
export const TILE_MAX_H = 2200

export function resizeTileLayout(
  origin: SpaceLayout,
  handle: TileResizeHandle,
  dx: number,
  dy: number
): SpaceLayout {
  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, Math.round(value)))
  const west = handle === 'nw' || handle === 'sw'
  const east = handle === 'ne' || handle === 'se' || handle === 'e'
  const north = handle === 'nw' || handle === 'ne'
  const south = handle === 'sw' || handle === 'se' || handle === 's'
  const w = west
    ? clamp(origin.w - dx, TILE_MIN_W, TILE_MAX_W)
    : east
      ? clamp(origin.w + dx, TILE_MIN_W, TILE_MAX_W)
      : origin.w
  const h = north
    ? clamp(origin.h - dy, TILE_MIN_H, TILE_MAX_H)
    : south
      ? clamp(origin.h + dy, TILE_MIN_H, TILE_MAX_H)
      : origin.h
  return {
    x: west ? Math.round(origin.x + origin.w - w) : origin.x,
    y: north ? Math.round(origin.y + origin.h - h) : origin.y,
    w,
    h
  }
}

export function minTileHeightForWidth(agentCount: number, width: number, side = false): number {
  if (agentCount <= 0) {
    return side ? 92 : 160
  }
  const columns = Math.max(
    1,
    Math.min(8, Math.floor((width - TEAM_PADDING * 2 + GAP) / (CARD_WIDTH + GAP)))
  )
  const rows = Math.ceil(agentCount / columns)
  const cardsHeight = rows * (CARD_HEIGHT + GAP) - GAP
  return TILE_HEADER + (side ? 0 : TILE_SUMMARY) + cardsHeight + TEAM_PADDING
}

export function extraPresenceHeightForAgent(
  agent: Pick<SpaceAgent, 'splitInfo' | 'subagents'>
): number {
  const hasSplit = Boolean(agent.splitInfo && agent.splitInfo.paneCount >= 2)
  const subCount = agent.subagents?.length ?? 0
  if (!hasSplit && subCount === 0) {
    return 0
  }
  let extra = 8
  if (hasSplit) {
    extra += agent.splitInfo?.direction === 'vertical' ? 76 : 58
  }
  if (subCount > 0) {
    extra += 34 + Math.min(subCount, 3) * 24 + (subCount > 3 ? 18 : 0)
  }
  return extra
}

export function extraPresenceHeightForMembers(
  members: readonly Pick<SpaceAgent, 'splitInfo' | 'subagents'>[],
  width: number
): number {
  if (members.length === 0) {
    return 0
  }
  const columns = Math.max(
    1,
    Math.min(8, Math.floor((width - TEAM_PADDING * 2 + GAP) / (CARD_WIDTH + GAP)))
  )
  let totalExtra = 0
  for (let i = 0; i < members.length; i += columns) {
    let rowMax = 0
    const end = Math.min(members.length, i + columns)
    for (let j = i; j < end; j += 1) {
      const m = members[j]
      if (m) {
        rowMax = Math.max(rowMax, extraPresenceHeightForAgent(m))
      }
    }
    totalExtra += rowMax
  }
  return totalExtra
}

export function layoutSpaces(
  goals: readonly SpaceGoal[],
  agentCount: (key: string) => number,
  bench?: SpaceLayout,
  extraHeightForKey?: (key: string, width: number) => number
): SpaceTile[] {
  const tiles: SpaceTile[] = []
  let y = 40
  let right = 40
  for (const level of SPACE_LEVELS.filter((candidate) => candidate !== 'side')) {
    const row = goals.filter((goal) => goal.level === level)
    if (row.length === 0) {
      continue
    }
    let x = 40
    let tallest = 0
    for (const goal of row) {
      const count = agentCount(goal.id)
      const size = tileSize(count)
      const w = goal.layout?.w && goal.layout.w >= 260 ? Math.round(goal.layout.w) : size.w
      const baseH = goal.layout?.h && goal.layout.h >= 160 ? Math.round(goal.layout.h) : size.h
      const extraH = extraHeightForKey ? Math.max(0, extraHeightForKey(goal.id, w)) : 0
      const h = Math.max(baseH, minTileHeightForWidth(count, w, false) + extraH)
      tiles.push({
        key: goal.id,
        x: goal.layout?.x ?? x,
        y: goal.layout?.y ?? y,
        w,
        h
      })
      x += w + SPACING
      tallest = Math.max(tallest, h)
    }
    right = Math.max(right, x)
    y += tallest + SPACING
  }
  let sideY = 40
  for (const goal of goals.filter((candidate) => candidate.level === 'side')) {
    const count = agentCount(goal.id)
    const size = tileSize(count, true)
    const w = goal.layout?.w && goal.layout.w >= 260 ? Math.round(goal.layout.w) : size.w
    const baseH = goal.layout?.h && goal.layout.h >= 140 ? Math.round(goal.layout.h) : size.h
    const extraH = extraHeightForKey ? Math.max(0, extraHeightForKey(goal.id, w)) : 0
    const h = Math.max(baseH, minTileHeightForWidth(count, w, true) + extraH)
    tiles.push({
      key: goal.id,
      x: goal.layout?.x ?? right,
      y: goal.layout?.y ?? sideY,
      w,
      h
    })
    sideY += h + SPACING
  }
  const benchCount = agentCount(BENCH_KEY)
  const benchSize = tileSize(benchCount, true)
  const benchMinW = benchCount === 0 ? 220 : 260
  const benchMinH = benchCount === 0 ? 84 : 140
  const benchW = bench?.w && bench.w >= benchMinW ? Math.round(bench.w) : benchSize.w
  const rawBenchH =
    bench?.h && bench.h >= benchMinH ? Math.round(bench.h) : benchCount === 0 ? 96 : benchSize.h
  const benchExtraH = extraHeightForKey ? Math.max(0, extraHeightForKey(BENCH_KEY, benchW)) : 0
  const benchH = Math.max(rawBenchH, minTileHeightForWidth(benchCount, benchW, true) + benchExtraH)
  tiles.push({
    key: BENCH_KEY,
    x: bench?.x ?? 40,
    y: bench?.y ?? Math.max(y, 40),
    w: benchW,
    h: benchH
  })
  return tiles
}

export function toCanvas(point: Point, view: View): Point {
  return {
    x: (point.x - view.x) / view.scale,
    y: (point.y - view.y) / view.scale
  }
}

export const ZOOM_STEP_IN_FACTOR = 1.28 * 1.5
export const ZOOM_STEP_OUT_FACTOR = 1.4 * 1.5
export const ZOOM_WHEEL_SENSITIVITY_IN = 0.0028 * 1.5
export const ZOOM_WHEEL_SENSITIVITY_OUT = 0.0044 * 1.5
export const ZOOM_TWEEN_MS = Math.round(135 / 1.5)

export function zoomAt(view: View, nextScale: number, focal: Point): View {
  const clamped = Math.max(0.18, Math.min(2, nextScale))
  return {
    scale: clamped,
    x: focal.x - ((focal.x - view.x) / view.scale) * clamped,
    y: focal.y - ((focal.y - view.y) / view.scale) * clamped
  }
}

export function fitSpaces(tiles: readonly SpaceTile[], width: number, height: number): View {
  if (tiles.length === 0 || width <= 0 || height <= 0) {
    return { x: 40, y: 40, scale: 1 }
  }
  const minX = Math.min(...tiles.map((t) => t.x))
  const minY = Math.min(...tiles.map((t) => t.y))
  const maxX = Math.max(...tiles.map((t) => t.x + t.w))
  const maxY = Math.max(...tiles.map((t) => t.y + t.h))
  const boxW = Math.max(200, maxX - minX)
  const boxH = Math.max(160, maxY - minY)
  const pad = 64
  const scale = Math.max(
    0.35,
    Math.min(1.15, Math.min((width - pad * 2) / boxW, (height - pad * 2) / boxH))
  )
  return {
    scale,
    x: Math.round((width - boxW * scale) / 2 - minX * scale),
    y: Math.round((height - boxH * scale) / 2 - minY * scale)
  }
}

export type KanbanCardImport = {
  card: string
  title: string
  state?: string
  roadmap: string[]
  tasks: string[]
}

export function cardsFromKanbanTree(tree: unknown): KanbanCardImport[] {
  const nodes =
    tree && typeof tree === 'object' && Array.isArray((tree as { nodes?: unknown }).nodes)
      ? ((tree as { nodes: Record<string, unknown>[] }).nodes ?? [])
      : []
  const cards: KanbanCardImport[] = []
  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      continue
    }
    const title = typeof node.title === 'string' ? node.title.trim() : ''
    if (!title) {
      continue
    }
    if (node.depth === 0 && node.kind === 'goal' && typeof node.id === 'string') {
      const state = typeof node.state === 'string' && node.state.trim() ? node.state.trim() : ''
      cards.push({ card: node.id, title, ...(state ? { state } : {}), roadmap: [], tasks: [] })
      continue
    }
    const current = cards.at(-1)
    if (!current || node.depth === 0) {
      continue
    }
    if (node.kind === 'task') {
      current.tasks.push(title)
    } else {
      const state = typeof node.state === 'string' && node.state.trim() ? node.state.trim() : ''
      current.roadmap.push(state ? `${title} (${state})` : title)
    }
  }
  return cards
}

export function resolveAgentGoalId(
  space: SpaceState,
  agent: { id: string; unifiedTabId?: string; name?: string },
  validGoalIds?: ReadonlySet<string>,
  liveOtherIds?: ReadonlySet<string>
): string | null {
  const check = (gid: string | undefined): string | null => {
    if (!gid) {
      return null
    }
    if (validGoalIds && !validGoalIds.has(gid)) {
      return null
    }
    return gid
  }
  const direct =
    check(space.placements[agent.id]) ??
    (agent.unifiedTabId ? check(space.placements[agent.unifiedTabId]) : null)
  if (direct) {
    return direct
  }
  if (agent.name && space.placementNames) {
    for (const [savedId, savedName] of Object.entries(space.placementNames)) {
      if (savedId !== agent.id && savedId !== agent.unifiedTabId && liveOtherIds?.has(savedId)) {
        continue
      }
      if (savedName === agent.name) {
        const matched = check(space.placements[savedId])
        if (matched) {
          return matched
        }
      }
    }
  }
  return null
}

export function purgeAgentPlacements(
  space: SpaceState,
  agent: { id: string; unifiedTabId?: string; name?: string },
  liveOtherIds?: ReadonlySet<string>
): SpaceState {
  const keysToPurge = new Set<string>([agent.id])
  if (agent.unifiedTabId) {
    keysToPurge.add(agent.unifiedTabId)
  }
  if (agent.name && space.placementNames) {
    for (const [savedId, savedName] of Object.entries(space.placementNames)) {
      if (savedId !== agent.id && savedId !== agent.unifiedTabId && liveOtherIds?.has(savedId)) {
        continue
      }
      if (savedName === agent.name) {
        keysToPurge.add(savedId)
      }
    }
  }
  const nextPlacements = { ...space.placements }
  const nextNames = { ...space.placementNames }
  const nextThreadGoals = { ...space.threadGoals }
  for (const key of keysToPurge) {
    delete nextPlacements[key]
    delete nextNames[key]
    delete nextThreadGoals[key]
  }
  return {
    ...space,
    placements: nextPlacements,
    placementNames: nextNames,
    threadGoals: nextThreadGoals
  }
}

export function isAssistantMessageAskingQuestion(
  text?: string | null,
  isToolOutput?: boolean
): boolean {
  if (isToolOutput || !text) {
    return false
  }
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }
  const tail = trimmed.slice(-700)
  if (tail.includes('?')) {
    return true
  }
  return /\b(needs input|decision needed|ask:|what'?s the call|what is the call|what'?s the outcome|do you want|would you like|should i|which option|let me know|waiting on you|waiting for your)\b/i.test(
    tail
  )
}

function extractRolePrefix(label: string | undefined): string {
  if (!label) {
    return ''
  }
  return (label.split('·')[0] ?? '').trim().toLowerCase()
}

export function doesAskMatchAgent(
  ask: SpaceAsk,
  agent: { id: string; unifiedTabId?: string; name?: string },
  agentStayInSameGoal = false,
  goalAgentsCount = 0
): boolean {
  if (ask.status !== 'open') {
    return false
  }
  if (
    ask.botId === agent.id ||
    (agent.unifiedTabId && ask.botId === agent.unifiedTabId) ||
    ask.forBotId === agent.id
  ) {
    return true
  }
  const agentNameLower = (agent.name ?? '').trim().toLowerCase()
  if (agentNameLower) {
    const candidates = [ask.botName, ask.agentName, ask.botId]
      .filter((c): c is string => typeof c === 'string' && Boolean(c.trim()))
      .map((c) => c.trim().toLowerCase())
    if (candidates.includes(agentNameLower)) {
      return true
    }
    if (agentStayInSameGoal) {
      const agentRole = extractRolePrefix(agent.name)
      if (
        agentRole &&
        candidates.some((c) => extractRolePrefix(c) === agentRole || c === agentRole)
      ) {
        return true
      }
      if (goalAgentsCount === 1) {
        return true
      }
    }
  }
  return false
}

export function doesAgentHaveOpenAsk(
  space: SpaceState,
  agent: { id: string; unifiedTabId?: string; name?: string },
  agentGoalId: string | null,
  goalAgentsCount = 0
): boolean {
  for (const goal of space.goals) {
    const inThisGoal = Boolean(agentGoalId && goal.id === agentGoalId)
    for (const ask of goal.asks) {
      if (doesAskMatchAgent(ask, agent, inThisGoal, inThisGoal ? goalAgentsCount : 0)) {
        return true
      }
    }
  }
  return false
}

export function resolveFocusRequestTarget(
  space: SpaceState,
  agents: readonly { id: string; unifiedTabId?: string; name: string; attention?: boolean }[],
  req: SpaceFocusRequest
): { agentId: string | null; spaceId: string | null } {
  const validGoalIds = new Set(space.goals.map((g) => g.id))
  const resolvedSpaceId = req.spaceId && validGoalIds.has(req.spaceId) ? req.spaceId : null

  if (req.tabId) {
    const byId = agents.find((a) => a.id === req.tabId || a.unifiedTabId === req.tabId)
    if (byId) {
      return {
        agentId: byId.id,
        spaceId: resolvedSpaceId ?? resolveAgentGoalId(space, byId, validGoalIds)
      }
    }
  }

  if (req.agentName) {
    const targetLower = req.agentName.trim().toLowerCase()
    const byName = agents.find((a) => a.name.trim().toLowerCase() === targetLower)
    if (byName) {
      return {
        agentId: byName.id,
        spaceId: resolvedSpaceId ?? resolveAgentGoalId(space, byName, validGoalIds)
      }
    }
  }

  const targetRole = extractRolePrefix(req.role || req.agentName)
  if (resolvedSpaceId) {
    const inSpace = agents.filter(
      (a) => resolveAgentGoalId(space, a, validGoalIds) === resolvedSpaceId
    )
    if (targetRole) {
      const byRoleInSpace = inSpace.find((a) => extractRolePrefix(a.name) === targetRole)
      if (byRoleInSpace) {
        return { agentId: byRoleInSpace.id, spaceId: resolvedSpaceId }
      }
    }
    const waitingInSpace = inSpace.find((a) => a.attention) ?? inSpace[0]
    if (waitingInSpace) {
      return { agentId: waitingInSpace.id, spaceId: resolvedSpaceId }
    }
  }

  if (targetRole) {
    const byRoleAny = agents.find((a) => extractRolePrefix(a.name) === targetRole)
    if (byRoleAny) {
      return {
        agentId: byRoleAny.id,
        spaceId: resolvedSpaceId ?? resolveAgentGoalId(space, byRoleAny, validGoalIds)
      }
    }
  }

  return { agentId: null, spaceId: resolvedSpaceId }
}

export function readSpaceLocal(): SpaceState {
  try {
    if (typeof localStorage === 'undefined') {
      return EMPTY_SPACE
    }
    const raw = localStorage.getItem(SPACE_LOCAL_STORAGE_KEY)
    return raw ? normalizeSpaceState(JSON.parse(raw)) : EMPTY_SPACE
  } catch {
    // ok: localStorage unavailable or corrupted JSON safely falls back to EMPTY_SPACE
    return EMPTY_SPACE
  }
}

export function writeSpaceLocal(state: SpaceState): void {
  try {
    if (typeof localStorage === 'undefined') {
      return
    }
    localStorage.setItem(SPACE_LOCAL_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ok: ignore storage quota errors on local fallback
    return
  }
}
