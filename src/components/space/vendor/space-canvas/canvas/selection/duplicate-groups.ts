// WS-A (TASK_16 wave 2): ⌘D of grouped notes. The board's copies keep the source groupId; this gives
// the copies NEW groupIds (one per source group, via WS-C's remapCopiedGroups), so a duplicated group is
// a new group, never a member of the original. A group with only one copied member gets no group.
import type { SpaceStickyNote } from '../../core/space'
import { remapCopiedGroups } from '../../core/whiteboard-groups'

/** Patches for `created[i]` (the copy of `sources[i]`); empty when nothing was grouped. */
export function regroupCopyPatches(
  sources: readonly Pick<SpaceStickyNote, 'groupId'>[],
  created: readonly string[],
  makeId?: () => string
): Record<string, Partial<SpaceStickyNote>> {
  if (sources.length !== created.length) {
    return {}
  }
  const remapped = remapCopiedGroups(
    sources.map((st) => ({ groupId: st.groupId })),
    makeId
  )
  const counts = new Map<string, number>()
  for (const r of remapped) {
    if (r.groupId) {
      counts.set(r.groupId, (counts.get(r.groupId) ?? 0) + 1)
    }
  }
  const patches: Record<string, Partial<SpaceStickyNote>> = {}
  remapped.forEach((r, i) => {
    const createdId = created[i]
    if (sources[i]?.groupId && createdId) {
      patches[createdId] = {
        groupId: r.groupId && (counts.get(r.groupId) ?? 0) >= 2 ? r.groupId : undefined
      }
    }
  })
  return patches
}
