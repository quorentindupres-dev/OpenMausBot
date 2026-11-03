import { newSpaceId, type SpaceArrow, type SpaceStickyNote } from './space'

export type StickyPatches = Record<string, Partial<SpaceStickyNote>>
export type WhiteboardRefusal = 'empty' | 'goal' | 'unknown' | 'too-few'
export type PatchResult =
  | { ok: true; patches: StickyPatches; groupId?: string }
  | { ok: false; reason: WhiteboardRefusal; ids: string[] }

type IsGoal = (id: string) => boolean
const noGoal: IsGoal = () => false

export function groupIndex(stickies: readonly SpaceStickyNote[]): Map<string, string[]> {
  const all = new Map<string, string[]>()
  for (const s of stickies) {
    if (s.groupId) {
      const list = all.get(s.groupId)
      if (list) {
        list.push(s.id)
      } else {
        all.set(s.groupId, [s.id])
      }
    }
  }
  for (const [gid, ids] of all) {
    if (ids.length < 2) {
      all.delete(gid)
    }
  }
  return all
}

export function groupSelectionFor(
  stickies: readonly SpaceStickyNote[],
  id: string,
  index: ReadonlyMap<string, readonly string[]> = groupIndex(stickies)
): string[] {
  const sticky = stickies.find((s) => s.id === id)
  const members = sticky?.groupId ? index.get(sticky.groupId) : undefined
  if (!members) {
    return [id]
  }
  const hidden = new Set(stickies.filter((s) => s.hidden).map((s) => s.id))
  const visible = members.filter((m) => !hidden.has(m))
  return visible.length > 0 ? visible : [id]
}

export function expandToGroups(
  stickies: readonly SpaceStickyNote[],
  ids: readonly string[]
): string[] {
  const index = groupIndex(stickies)
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    for (const m of groupSelectionFor(stickies, id, index)) {
      if (!seen.has(m)) {
        seen.add(m)
        out.push(m)
      }
    }
  }
  return out
}

export function isWholeGroup(
  stickies: readonly SpaceStickyNote[],
  ids: readonly string[]
): boolean {
  if (ids.length < 2) {
    return false
  }
  const firstId = ids[0]
  const first = firstId ? stickies.find((s) => s.id === firstId) : undefined
  if (!first?.groupId) {
    return false
  }
  const members = groupSelectionFor(stickies, first.id)
  return members.length === ids.length && members.every((m) => ids.includes(m))
}

function checkIds(
  stickies: readonly SpaceStickyNote[],
  ids: readonly string[],
  isGoal: IsGoal
): { ok: true; ids: string[] } | { ok: false; reason: WhiteboardRefusal; ids: string[] } {
  const unique = [...new Set(ids)]
  if (unique.length === 0) {
    return { ok: false, reason: 'empty', ids: [] }
  }
  const known = new Set(stickies.map((s) => s.id))
  const goals = unique.filter((id) => isGoal(id))
  if (goals.length > 0) {
    return { ok: false, reason: 'goal', ids: goals }
  }
  const unknown = unique.filter((id) => !known.has(id))
  if (unknown.length > 0) {
    return { ok: false, reason: 'unknown', ids: unknown }
  }
  return { ok: true, ids: unique }
}

function orphanPatches(
  stickies: readonly SpaceStickyNote[],
  leaving: ReadonlySet<string>
): StickyPatches {
  const patches: StickyPatches = {}
  for (const members of groupIndex(stickies).values()) {
    const left = members.filter((m) => !leaving.has(m))
    const leftId = left[0]
    if (left.length === 1 && leftId && left.length < members.length) {
      patches[leftId] = { groupId: undefined }
    }
  }
  return patches
}

export function groupStickies(
  stickies: readonly SpaceStickyNote[],
  ids: readonly string[],
  isGoal: IsGoal = noGoal,
  makeId: () => string = () => newSpaceId('group')
): PatchResult {
  const check = checkIds(stickies, ids, isGoal)
  if (!check.ok) {
    return check
  }
  if (check.ids.length < 2) {
    return { ok: false, reason: 'too-few', ids: check.ids }
  }
  const groupId = makeId()
  const patches = orphanPatches(stickies, new Set(check.ids))
  for (const id of check.ids) {
    patches[id] = { groupId }
  }
  return { ok: true, patches, groupId }
}

export function ungroupStickies(
  stickies: readonly SpaceStickyNote[],
  ids: readonly string[],
  isGoal: IsGoal = noGoal
): PatchResult {
  const check = checkIds(stickies, ids, isGoal)
  if (!check.ok) {
    return check
  }
  const picked = new Set(check.ids)
  const groups = new Set(
    stickies.filter((s) => picked.has(s.id) && s.groupId).map((s) => s.groupId as string)
  )
  const patches: StickyPatches = {}
  for (const s of stickies) {
    if (s.groupId && groups.has(s.groupId)) {
      patches[s.id] = { groupId: undefined }
    }
  }
  return { ok: true, patches }
}

export function toggleHiddenPatches(
  stickies: readonly SpaceStickyNote[],
  ids: readonly string[],
  isGoal: IsGoal = noGoal
): PatchResult {
  const check = checkIds(stickies, ids, isGoal)
  if (!check.ok) {
    return check
  }
  const byId = new Map(stickies.map((s) => [s.id, s]))
  const hide = check.ids.some((id) => !byId.get(id)?.hidden)
  const patches: StickyPatches = {}
  for (const id of check.ids) {
    patches[id] = { hidden: hide ? true : undefined }
  }
  return { ok: true, patches }
}

export function toggleLockPatches(
  stickies: readonly SpaceStickyNote[],
  ids: readonly string[],
  isGoal: IsGoal = noGoal
): PatchResult {
  const check = checkIds(stickies, ids, isGoal)
  if (!check.ok) {
    return check
  }
  const byId = new Map(stickies.map((s) => [s.id, s]))
  const lock = check.ids.some((id) => !byId.get(id)?.locked)
  const patches: StickyPatches = {}
  for (const id of check.ids) {
    patches[id] = { locked: lock }
  }
  return { ok: true, patches }
}

export function paintOrder(stickies: readonly SpaceStickyNote[]): SpaceStickyNote[] {
  return [...stickies].sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.createdAt - b.createdAt
  )
}

export function reorderPatches(
  stickies: readonly SpaceStickyNote[],
  moving: readonly string[],
  targetId: string,
  place: 'above' | 'below',
  isGoal: IsGoal = noGoal
): PatchResult {
  const check = checkIds(stickies, [...moving, targetId], isGoal)
  if (!check.ok) {
    return check
  }
  const movingSet = new Set(moving)
  if (movingSet.has(targetId)) {
    return { ok: true, patches: {} }
  }
  const order = paintOrder(stickies)
  const rest = order.filter((s) => !movingSet.has(s.id))
  const block = order.filter((s) => movingSet.has(s.id))
  const at = rest.findIndex((s) => s.id === targetId)
  const insertAt = place === 'above' ? at + 1 : at
  const next = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
  const patches: StickyPatches = {}
  next.forEach((s, i) => {
    if (s.zIndex !== i) {
      patches[s.id] = { zIndex: i }
    }
  })
  return { ok: true, patches }
}

export function hiddenIds(
  stickies: readonly Pick<SpaceStickyNote, 'id' | 'hidden'>[],
  extraHidden: readonly { id: string; hidden?: boolean }[] = []
): Set<string> {
  const set = new Set<string>()
  for (const s of stickies) {
    if (s.hidden) {
      set.add(s.id)
    }
  }
  for (const item of extraHidden) {
    if (item.hidden) {
      set.add(item.id)
    }
  }
  return set
}

export function isArrowHidden(arrow: SpaceArrow, hidden: ReadonlySet<string>): boolean {
  return (
    arrow.hidden === true ||
    (arrow.fromId !== undefined && hidden.has(arrow.fromId)) ||
    (arrow.toId !== undefined && hidden.has(arrow.toId))
  )
}

export function stickyLayerLabel(sticky: SpaceStickyNote): string {
  if (sticky.name) {
    return sticky.name
  }
  const line = sticky.text.trim().split('\n')[0]?.trim()
  if (line) {
    return line.length > 48 ? `${line.slice(0, 47)}…` : line
  }
  return sticky.kind === 'shape' ? 'Shape' : sticky.kind === 'text' ? 'Text' : 'Note'
}

export function remapCopiedGroups<T extends Pick<SpaceStickyNote, 'groupId'>>(
  copies: readonly T[],
  makeId: () => string = () => newSpaceId('group')
): T[] {
  const map = new Map<string, string>()
  return copies.map((c) => {
    if (!c.groupId) {
      return c
    }
    let next = map.get(c.groupId)
    if (!next) {
      next = makeId()
      map.set(c.groupId, next)
    }
    return { ...c, groupId: next }
  })
}
