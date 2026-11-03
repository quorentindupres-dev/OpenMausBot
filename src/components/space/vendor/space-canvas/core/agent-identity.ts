import {
  A01_GROUPS,
  A01_ROLE_IDS,
  AGENT_ACCESSORY_SVG,
  AGENT_LOOK_KINDS,
  AGENT_ROLE_ACCESSORIES,
  type A01GroupId,
  type A01GroupMeta,
  type AgentAccessory,
  type AgentLayer,
  type AgentRoleAccessory,
  type AgentRoleId
} from '../generated/a01-roles'

export {
  A01_GROUPS,
  A01_ROLE_IDS,
  AGENT_ACCESSORY_SVG,
  AGENT_LOOK_KINDS,
  AGENT_ROLE_ACCESSORIES,
  type A01GroupId,
  type A01GroupMeta,
  type AgentAccessory,
  type AgentLayer,
  type AgentRoleAccessory,
  type AgentRoleId
}

const NON_AGENT_KINDS = new Set(['browser', 'editor', 'file', 'markdown', 'diff', 'preview'])
const NON_AGENT_ID_RE = /^(?:browser|editor|file|markdown|diff|preview):/i
const MARKDOWN_FILE_RE = /(?:^|[\\/])[^\\/]+\.(?:md|mdx|markdown)$/i

export type AgentSessionLike = {
  id?: string
  unifiedTabId?: string
  kind?: string
  name?: string
  label?: string
  agent?: string | null
}

export function isAgentSession(item: AgentSessionLike | null | undefined): boolean {
  if (!item) {
    return false
  }
  const kind = item.kind?.trim().toLowerCase()
  if (
    !kind ||
    NON_AGENT_KINDS.has(kind) ||
    NON_AGENT_ID_RE.test(item.id?.trim() ?? '') ||
    NON_AGENT_ID_RE.test(item.unifiedTabId?.trim() ?? '')
  ) {
    return false
  }
  if (kind === 'agent') {
    return true
  }
  if (kind !== 'terminal') {
    return false
  }
  const title = (item.name ?? item.label ?? '').trim()
  return Boolean(item.agent) || title.includes(' · ') || !MARKDOWN_FILE_RE.test(title)
}

export function isAgentContentType(contentType: string | null | undefined): boolean {
  return contentType === 'terminal' || contentType === 'agent-session'
}

export const AGENT_ROLE_IDS = A01_ROLE_IDS

function normalizeRoleText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const ROLE_BY_ALIAS: ReadonlyMap<string, AgentRoleId> = (() => {
  const map = new Map<string, AgentRoleId>()
  for (const id of AGENT_ROLE_IDS) {
    const entry = AGENT_ROLE_ACCESSORIES[id]
    for (const alias of [...entry.aliases, entry.a01, ...entry.a01Also, id]) {
      const key = normalizeRoleText(alias)
      if (key && !map.has(key)) {
        map.set(key, id)
      }
    }
  }
  return map
})()

const ROLE_SEGMENT_RE = /\s+[·•|]\s+/

function roleFromText(raw: string | null | undefined): AgentRoleId | null {
  if (!raw?.trim()) {
    return null
  }
  const whole = ROLE_BY_ALIAS.get(normalizeRoleText(raw))
  if (whole) {
    return whole
  }
  const segments = raw
    .split(ROLE_SEGMENT_RE)
    .map((part) => part.trim())
    .filter(Boolean)
  if (segments.length >= 2) {
    const two = ROLE_BY_ALIAS.get(normalizeRoleText(`${segments[0]} ${segments[1]}`))
    if (two) {
      return two
    }
  }
  return segments[0] ? (ROLE_BY_ALIAS.get(normalizeRoleText(segments[0])) ?? null) : null
}

export function resolveAgentRole(input: {
  name?: string | null
  role?: string | null
  spawnerId?: string | null
}): AgentRoleId {
  return (
    roleFromText(input.role) ?? roleFromText(input.spawnerId) ?? roleFromText(input.name) ?? 'agent'
  )
}

export function isEaOrMediaBuyerAgent(
  agent: { name?: string | null; role?: string | null } | null | undefined
): boolean {
  if (!agent) {
    return false
  }
  const role = resolveAgentRole({ name: agent.name, role: agent.role })
  return role === 'ea' || role === 'media-buyer'
}

export function agentRoleAccessory(role: AgentRoleId): AgentRoleAccessory {
  return AGENT_ROLE_ACCESSORIES[role] ?? AGENT_ROLE_ACCESSORIES.agent
}
