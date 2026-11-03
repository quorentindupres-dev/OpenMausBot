import { A01_ROLE_IDS, AGENT_ROLE_ACCESSORIES, type AgentRoleId } from '../generated/a01-roles'
import { clampNum } from './whiteboard-kit'

export const SPACE_NODE_DRAG_MIME = 'application/x-xlabs-space-node+json'
export const MAX_CANVAS_NODES = 200

export const SPACE_COMPUTER_TARGETS = [
  {
    id: 'local-ax',
    label: 'This Mac (AX)',
    shortBadge: 'Local AX',
    description: 'Runs locally on this Mac with Accessibility & native terminal speed'
  },
  {
    id: 'mac2-lume-isolated',
    label: '2nd Mac — Isolated Lume VM',
    shortBadge: '2nd Mac VM',
    description: 'Isolated macOS Lume VM on 2nd Mac for clean browser/GUI sandboxing'
  },
  {
    id: 'mac2-shared',
    label: '2nd Mac — Shared',
    shortBadge: '2nd Mac · Shared',
    description: 'Shared host environment on 2nd Mac'
  },
  {
    id: 'cua-cloud',
    label: 'Cua Cloud / Daytona',
    shortBadge: 'Cua Cloud',
    description: 'Remote cloud desktop / Daytona container'
  }
] as const

export type SpaceComputerTarget = (typeof SPACE_COMPUTER_TARGETS)[number]['id']

export function isSpaceComputerTarget(value: unknown): value is SpaceComputerTarget {
  return SPACE_COMPUTER_TARGETS.some((t) => t.id === value)
}

export function computerTargetMeta(
  target: SpaceComputerTarget
): (typeof SPACE_COMPUTER_TARGETS)[number] {
  return SPACE_COMPUTER_TARGETS.find((t) => t.id === target) ?? SPACE_COMPUTER_TARGETS[0]
}

export function nextComputerTarget(current: SpaceComputerTarget): SpaceComputerTarget {
  const idx = SPACE_COMPUTER_TARGETS.findIndex((t) => t.id === current)
  const nextIdx = idx < 0 ? 0 : (idx + 1) % SPACE_COMPUTER_TARGETS.length
  return SPACE_COMPUTER_TARGETS[nextIdx]!.id
}

export type A01SpawnMode = 'temporary-worker' | 'long-term-employee'

export const A01_SPAWN_MODES: readonly {
  id: A01SpawnMode
  badge: string
  label: string
  subtitle: string
}[] = [
  {
    id: 'temporary-worker',
    badge: '⚡',
    label: '⚡ Temporary Worker',
    subtitle: 'Ephemeral C01 job log only — zero long-term fleet memory'
  },
  {
    id: 'long-term-employee',
    badge: '🧠',
    label: '🧠 Long-Term Employee',
    subtitle: 'Loads A01/<ROLE>/ rules + fleet.db Hindsight memory'
  }
]

export type SpaceNodeLiveStatus = 'idle' | 'working' | 'waiting' | 'done'

export type SpaceSessionKind = 'openmanus-thread' | 'orca-terminal' | 'orca-agent'

export type C02ProjectLiveRef = {
  label: string
  url?: string
  path?: string
}

export type C02ProjectReadiness = 'green' | 'orange' | 'red'

export type C02ProjectSummary = {
  slug: string
  title: string
  readiness: C02ProjectReadiness
  readinessScore?: number
  productsCount: number
  channels: readonly string[]
  liveRefs: readonly C02ProjectLiveRef[]
}

export type DraggableSessionSummary = {
  sessionId: string
  sessionKind: SpaceSessionKind
  title: string
  roleId?: AgentRoleId
  agentName?: string
  status: SpaceNodeLiveStatus
  workingLine?: string
  projectSlug?: string
  computer: SpaceComputerTarget
  pinned?: boolean
}

export type BaseCanvasNode = {
  id: string
  x: number
  y: number
  w: number
  h: number
  zIndex?: number
  locked?: boolean
  hidden?: boolean
  groupId?: string
  createdAt: number
}

export type SessionCanvasNode = BaseCanvasNode & {
  kind: 'session'
  sessionId: string
  sessionKind: SpaceSessionKind
  title: string
  roleId?: AgentRoleId
  agentName?: string
  status: SpaceNodeLiveStatus
  workingLine?: string
  projectSlug?: string
  computer: SpaceComputerTarget
  pinned?: boolean
}

export type AgentCanvasNode = BaseCanvasNode & {
  kind: 'agent'
  roleId: AgentRoleId
  title: string
  spawnMode: A01SpawnMode
  projectSlug?: string
  computer: SpaceComputerTarget
  status: SpaceNodeLiveStatus
  workingLine?: string
  sessionId?: string
  modelId?: string
}

export type ProjectCanvasNode = BaseCanvasNode & {
  kind: 'project'
  projectSlug: string
  title: string
  readiness: C02ProjectReadiness
  readinessScore?: number
  productsCount: number
  channels: string[]
  liveRefs: C02ProjectLiveRef[]
}

export type SpaceCanvasNode = SessionCanvasNode | AgentCanvasNode | ProjectCanvasNode

export type SpaceNodeDropPayload =
  | { kind: 'session'; session: DraggableSessionSummary }
  | { kind: 'a01-role'; roleId: AgentRoleId }
  | { kind: 'project'; project: C02ProjectSummary }

export const SESSION_NODE_DEFAULT_SIZE = { w: 320, h: 176 } as const
export const AGENT_NODE_DEFAULT_SIZE = { w: 312, h: 184 } as const
export const PROJECT_NODE_DEFAULT_SIZE = { w: 324, h: 196 } as const

export const CANVAS_NODE_MIN_W = 240
export const CANVAS_NODE_MAX_W = 920
export const CANVAS_NODE_MIN_H = 140
export const CANVAS_NODE_MAX_H = 720

export function clampCanvasNodeBox(box: { x: number; y: number; w: number; h: number }): {
  x: number
  y: number
  w: number
  h: number
} {
  return {
    x: Math.round(clampNum(box.x, -100_000, 100_000)),
    y: Math.round(clampNum(box.y, -100_000, 100_000)),
    w: Math.round(clampNum(box.w, CANVAS_NODE_MIN_W, CANVAS_NODE_MAX_W)),
    h: Math.round(clampNum(box.h, CANVAS_NODE_MIN_H, CANVAS_NODE_MAX_H))
  }
}

export function serializeNodeDropPayload(payload: SpaceNodeDropPayload): string {
  return JSON.stringify(payload)
}

export function parseNodeDropPayload(raw: string | null | undefined): SpaceNodeDropPayload | null {
  if (!raw || !raw.trim()) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    if (
      parsed.kind === 'a01-role' &&
      typeof parsed.roleId === 'string' &&
      A01_ROLE_IDS.includes(parsed.roleId as AgentRoleId)
    ) {
      return { kind: 'a01-role', roleId: parsed.roleId as AgentRoleId }
    }
    if (parsed.kind === 'session' && parsed.session && typeof parsed.session === 'object') {
      const s = parsed.session as Record<string, unknown>
      if (typeof s.sessionId === 'string' && s.sessionId.trim()) {
        return {
          kind: 'session',
          session: {
            sessionId: s.sessionId.trim(),
            sessionKind:
              s.sessionKind === 'orca-terminal' || s.sessionKind === 'orca-agent'
                ? s.sessionKind
                : 'openmanus-thread',
            title: typeof s.title === 'string' && s.title.trim() ? s.title.trim() : s.sessionId,
            ...(typeof s.roleId === 'string' && A01_ROLE_IDS.includes(s.roleId as AgentRoleId)
              ? { roleId: s.roleId as AgentRoleId }
              : {}),
            ...(typeof s.agentName === 'string' && s.agentName.trim()
              ? { agentName: s.agentName.trim() }
              : {}),
            status:
              s.status === 'working' || s.status === 'waiting' || s.status === 'done'
                ? s.status
                : 'idle',
            ...(typeof s.workingLine === 'string' && s.workingLine.trim()
              ? { workingLine: s.workingLine.trim() }
              : {}),
            ...(typeof s.projectSlug === 'string' && s.projectSlug.trim()
              ? { projectSlug: s.projectSlug.trim() }
              : {}),
            computer: isSpaceComputerTarget(s.computer) ? s.computer : 'local-ax',
            ...(typeof s.pinned === 'boolean' ? { pinned: s.pinned } : {})
          }
        }
      }
    }
    if (parsed.kind === 'project' && parsed.project && typeof parsed.project === 'object') {
      const p = parsed.project as Record<string, unknown>
      if (typeof p.slug === 'string' && p.slug.trim()) {
        return {
          kind: 'project',
          project: {
            slug: p.slug.trim(),
            title: typeof p.title === 'string' && p.title.trim() ? p.title.trim() : p.slug.trim(),
            readiness:
              p.readiness === 'green' || p.readiness === 'orange' || p.readiness === 'red'
                ? p.readiness
                : 'green',
            ...(typeof p.readinessScore === 'number' && Number.isFinite(p.readinessScore)
              ? { readinessScore: clampNum(Math.round(p.readinessScore), 0, 100) }
              : {}),
            productsCount:
              typeof p.productsCount === 'number' && Number.isFinite(p.productsCount)
                ? Math.max(0, Math.trunc(p.productsCount))
                : 0,
            channels: Array.isArray(p.channels)
              ? p.channels.filter((c): c is string => typeof c === 'string' && Boolean(c.trim()))
              : [],
            liveRefs: Array.isArray(p.liveRefs)
              ? p.liveRefs
                  .filter((r): r is Record<string, unknown> =>
                    Boolean(
                      r &&
                      typeof r === 'object' &&
                      typeof (r as { label?: unknown }).label === 'string'
                    )
                  )
                  .map((r) => ({
                    label: String(r.label).trim(),
                    ...(typeof r.url === 'string' && r.url.trim() ? { url: r.url.trim() } : {}),
                    ...(typeof r.path === 'string' && r.path.trim() ? { path: r.path.trim() } : {})
                  }))
              : []
          }
        }
      }
    }
    return null
  } catch {
    // ok: invalid external drag payload is ignored safely
    return null
  }
}

export function normalizeCanvasNode(
  raw: unknown,
  makeId: (prefix?: string) => string
): SpaceCanvasNode | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const obj = raw as Record<string, unknown>
  const kind = obj.kind
  if (kind !== 'session' && kind !== 'agent' && kind !== 'project') {
    return null
  }
  const defaults =
    kind === 'session'
      ? SESSION_NODE_DEFAULT_SIZE
      : kind === 'agent'
        ? AGENT_NODE_DEFAULT_SIZE
        : PROJECT_NODE_DEFAULT_SIZE
  const box = clampCanvasNodeBox({
    x: typeof obj.x === 'number' && Number.isFinite(obj.x) ? obj.x : 120,
    y: typeof obj.y === 'number' && Number.isFinite(obj.y) ? obj.y : 120,
    w: typeof obj.w === 'number' && Number.isFinite(obj.w) ? obj.w : defaults.w,
    h: typeof obj.h === 'number' && Number.isFinite(obj.h) ? obj.h : defaults.h
  })
  const base: BaseCanvasNode = {
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : makeId(`node-${kind}`),
    ...box,
    ...(typeof obj.zIndex === 'number' && Number.isFinite(obj.zIndex)
      ? { zIndex: Math.round(clampNum(obj.zIndex, -50, 500)) }
      : {}),
    ...(typeof obj.locked === 'boolean' ? { locked: obj.locked } : {}),
    ...(typeof obj.hidden === 'boolean' ? { hidden: obj.hidden } : {}),
    ...(typeof obj.groupId === 'string' && obj.groupId.trim()
      ? { groupId: obj.groupId.trim().slice(0, 64) }
      : {}),
    createdAt:
      typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt) ? obj.createdAt : 0
  }

  if (kind === 'session') {
    const sessionId =
      typeof obj.sessionId === 'string' && obj.sessionId.trim() ? obj.sessionId.trim() : base.id
    const roleId =
      typeof obj.roleId === 'string' && A01_ROLE_IDS.includes(obj.roleId as AgentRoleId)
        ? (obj.roleId as AgentRoleId)
        : undefined
    return {
      ...base,
      kind: 'session',
      sessionId,
      sessionKind:
        obj.sessionKind === 'orca-terminal' || obj.sessionKind === 'orca-agent'
          ? obj.sessionKind
          : 'openmanus-thread',
      title:
        typeof obj.title === 'string' && obj.title.trim()
          ? obj.title.trim().slice(0, 140)
          : sessionId,
      ...(roleId ? { roleId } : {}),
      ...(typeof obj.agentName === 'string' && obj.agentName.trim()
        ? { agentName: obj.agentName.trim().slice(0, 80) }
        : {}),
      status:
        obj.status === 'working' || obj.status === 'waiting' || obj.status === 'done'
          ? obj.status
          : 'idle',
      ...(typeof obj.workingLine === 'string' && obj.workingLine.trim()
        ? { workingLine: obj.workingLine.trim().slice(0, 180) }
        : {}),
      ...(typeof obj.projectSlug === 'string' && obj.projectSlug.trim()
        ? { projectSlug: obj.projectSlug.trim().slice(0, 80) }
        : {}),
      computer: isSpaceComputerTarget(obj.computer) ? obj.computer : 'local-ax',
      ...(typeof obj.pinned === 'boolean' ? { pinned: obj.pinned } : {})
    }
  }

  if (kind === 'agent') {
    const roleId: AgentRoleId =
      typeof obj.roleId === 'string' && A01_ROLE_IDS.includes(obj.roleId as AgentRoleId)
        ? (obj.roleId as AgentRoleId)
        : 'worker'
    const roleMeta = AGENT_ROLE_ACCESSORIES[roleId]
    const requestedMode: A01SpawnMode =
      obj.spawnMode === 'long-term-employee' && roleMeta.longTermEmployeeCapable
        ? 'long-term-employee'
        : 'temporary-worker'
    return {
      ...base,
      kind: 'agent',
      roleId,
      title:
        typeof obj.title === 'string' && obj.title.trim()
          ? obj.title.trim().slice(0, 140)
          : roleMeta.label,
      spawnMode: requestedMode,
      ...(typeof obj.projectSlug === 'string' && obj.projectSlug.trim()
        ? { projectSlug: obj.projectSlug.trim().slice(0, 80) }
        : {}),
      computer: isSpaceComputerTarget(obj.computer) ? obj.computer : 'local-ax',
      status:
        obj.status === 'working' || obj.status === 'waiting' || obj.status === 'done'
          ? obj.status
          : 'idle',
      ...(typeof obj.workingLine === 'string' && obj.workingLine.trim()
        ? { workingLine: obj.workingLine.trim().slice(0, 180) }
        : {}),
      ...(typeof obj.sessionId === 'string' && obj.sessionId.trim()
        ? { sessionId: obj.sessionId.trim() }
        : {}),
      ...(typeof obj.modelId === 'string' && obj.modelId.trim()
        ? { modelId: obj.modelId.trim() }
        : {})
    }
  }

  const projectSlug =
    typeof obj.projectSlug === 'string' && obj.projectSlug.trim()
      ? obj.projectSlug.trim().slice(0, 80)
      : 'x-labs'
  return {
    ...base,
    kind: 'project',
    projectSlug,
    title:
      typeof obj.title === 'string' && obj.title.trim()
        ? obj.title.trim().slice(0, 140)
        : projectSlug,
    readiness:
      obj.readiness === 'green' || obj.readiness === 'orange' || obj.readiness === 'red'
        ? obj.readiness
        : 'green',
    ...(typeof obj.readinessScore === 'number' && Number.isFinite(obj.readinessScore)
      ? { readinessScore: clampNum(Math.round(obj.readinessScore), 0, 100) }
      : {}),
    productsCount:
      typeof obj.productsCount === 'number' && Number.isFinite(obj.productsCount)
        ? Math.max(0, Math.trunc(obj.productsCount))
        : 0,
    channels: Array.isArray(obj.channels)
      ? obj.channels
          .filter((c): c is string => typeof c === 'string' && Boolean(c.trim()))
          .map((c) => c.trim().slice(0, 64))
          .slice(0, 12)
      : [],
    liveRefs: Array.isArray(obj.liveRefs)
      ? obj.liveRefs
          .filter((r): r is Record<string, unknown> =>
            Boolean(
              r && typeof r === 'object' && typeof (r as { label?: unknown }).label === 'string'
            )
          )
          .map((r) => ({
            label: String(r.label).trim().slice(0, 64),
            ...(typeof r.url === 'string' && r.url.trim() ? { url: r.url.trim() } : {}),
            ...(typeof r.path === 'string' && r.path.trim() ? { path: r.path.trim() } : {})
          }))
          .slice(0, 12)
      : []
  }
}

export type MagneticArrowSemanticEffect =
  | {
      kind: 'bind-project'
      projectNodeId: string
      targetNodeId: string
      projectSlug: string
      fromNode: ProjectCanvasNode
      toNode: SessionCanvasNode | AgentCanvasNode
    }
  | {
      kind: 'connect-nodes'
      fromId: string
      toId: string
      fromNode: SessionCanvasNode | AgentCanvasNode
      toNode: SessionCanvasNode | AgentCanvasNode
    }

/**
 * Pure semantic resolver when a magnetic arrow connects `fromId ──▶ toId`:
 * - `C02 Project Card ──▶ Agent / Session Node` => `bind-project` (`host.onBindProjectToNode`)
 * - `Agent/Session A ──▶ Agent/Session B` => `connect-nodes` (`host.onConnectNodes`)
 */
export function resolveArrowConnectionEffect(
  fromId: string | undefined,
  toId: string | undefined,
  nodesById: ReadonlyMap<string, SpaceCanvasNode>
): MagneticArrowSemanticEffect | null {
  if (!fromId || !toId || fromId === toId) {
    return null
  }
  const fromNode = nodesById.get(fromId)
  const toNode = nodesById.get(toId)
  if (!fromNode || !toNode) {
    return null
  }
  if (fromNode.kind === 'project' && (toNode.kind === 'session' || toNode.kind === 'agent')) {
    return {
      kind: 'bind-project',
      projectNodeId: fromNode.id,
      targetNodeId: toNode.id,
      projectSlug: fromNode.projectSlug,
      fromNode,
      toNode
    }
  }
  if (
    (fromNode.kind === 'session' || fromNode.kind === 'agent') &&
    (toNode.kind === 'session' || toNode.kind === 'agent')
  ) {
    return {
      kind: 'connect-nodes',
      fromId: fromNode.id,
      toId: toNode.id,
      fromNode,
      toNode
    }
  }
  return null
}

export function createSessionCanvasNode(
  session: DraggableSessionSummary,
  position: { x: number; y: number },
  makeId: (prefix?: string) => string,
  now = Date.now()
): SessionCanvasNode {
  const box = clampCanvasNodeBox({
    x: position.x,
    y: position.y,
    w: SESSION_NODE_DEFAULT_SIZE.w,
    h: SESSION_NODE_DEFAULT_SIZE.h
  })
  return {
    id: makeId('node-session'),
    kind: 'session',
    ...box,
    sessionId: session.sessionId,
    sessionKind: session.sessionKind,
    title: session.title,
    ...(session.roleId ? { roleId: session.roleId } : {}),
    ...(session.agentName ? { agentName: session.agentName } : {}),
    status: session.status,
    ...(session.workingLine ? { workingLine: session.workingLine } : {}),
    ...(session.projectSlug ? { projectSlug: session.projectSlug } : {}),
    computer: session.computer,
    ...(session.pinned !== undefined ? { pinned: session.pinned } : {}),
    createdAt: now
  }
}

export function createAgentCanvasNode(
  params: {
    id?: string
    roleId: AgentRoleId
    spawnMode: A01SpawnMode
    projectSlug?: string
    computer: SpaceComputerTarget
    position: { x: number; y: number }
    modelId?: string
    title?: string
  },
  makeId: (prefix?: string) => string,
  now = Date.now()
): AgentCanvasNode {
  const roleMeta = AGENT_ROLE_ACCESSORIES[params.roleId]
  const box = clampCanvasNodeBox({
    x: params.position.x,
    y: params.position.y,
    w: AGENT_NODE_DEFAULT_SIZE.w,
    h: AGENT_NODE_DEFAULT_SIZE.h
  })
  const spawnMode: A01SpawnMode =
    params.spawnMode === 'long-term-employee' && roleMeta.longTermEmployeeCapable
      ? 'long-term-employee'
      : 'temporary-worker'
  return {
    id: params.id ?? makeId('node-agent'),
    kind: 'agent',
    ...box,
    roleId: params.roleId,
    title: params.title?.trim() || roleMeta.label,
    spawnMode,
    ...(params.projectSlug?.trim() ? { projectSlug: params.projectSlug.trim() } : {}),
    computer: params.computer,
    status: 'working',
    workingLine:
      spawnMode === 'long-term-employee'
        ? `Booting A01 ${roleMeta.label} + Hindsight memory…`
        : `Spawning temporary ${roleMeta.label} worker…`,
    ...(params.modelId ? { modelId: params.modelId } : {}),
    createdAt: now
  }
}

export function createProjectCanvasNode(
  project: C02ProjectSummary,
  position: { x: number; y: number },
  makeId: (prefix?: string) => string,
  now = Date.now()
): ProjectCanvasNode {
  const box = clampCanvasNodeBox({
    x: position.x,
    y: position.y,
    w: PROJECT_NODE_DEFAULT_SIZE.w,
    h: PROJECT_NODE_DEFAULT_SIZE.h
  })
  return {
    id: makeId('node-project'),
    kind: 'project',
    ...box,
    projectSlug: project.slug,
    title: project.title,
    readiness: project.readiness,
    ...(project.readinessScore !== undefined ? { readinessScore: project.readinessScore } : {}),
    productsCount: project.productsCount,
    channels: [...project.channels],
    liveRefs: project.liveRefs.map((ref) => ({ ...ref })),
    createdAt: now
  }
}

export function upsertCanvasNode(
  nodes: readonly SpaceCanvasNode[] | undefined,
  node: SpaceCanvasNode
): SpaceCanvasNode[] {
  const list = nodes ? [...nodes] : []
  const idx = list.findIndex((item) => item.id === node.id)
  if (idx >= 0) {
    list[idx] = node
    return list
  }
  return [...list, node].slice(0, MAX_CANVAS_NODES)
}

export function patchCanvasNode(
  nodes: readonly SpaceCanvasNode[] | undefined,
  nodeId: string,
  patch: Partial<SpaceCanvasNode>
): SpaceCanvasNode[] {
  if (!nodes || nodes.length === 0) {
    return []
  }
  return nodes.map((item) => {
    if (item.id !== nodeId) {
      return item
    }
    const merged = { ...item, ...patch, kind: item.kind } as SpaceCanvasNode
    const clamped = clampCanvasNodeBox(merged)
    return { ...merged, ...clamped }
  })
}

export function removeCanvasNode(
  nodes: readonly SpaceCanvasNode[] | undefined,
  nodeId: string
): SpaceCanvasNode[] {
  if (!nodes || nodes.length === 0) {
    return []
  }
  return nodes.filter((item) => item.id !== nodeId)
}
