// WS-C (TASK_16 wave 2): the rows of the whiteboard layers panel (LayersPanel.tsx), built from the board.
// Pure, so the tests and the render budget call it without React. Idea from Penpot's layers sidebar
// (ui/workspace/sidebar/layers.cljs) and our G_app-Data TreeTable `layers` mode; re-implemented.
import type { SpaceArrow, SpaceGoal, SpaceStickyNote } from '../../core/space'
import { groupIndex, paintOrder, stickyLayerLabel } from '../../core/whiteboard-groups'

export const LAYER_ROW_PX = 26
/** Above this many rows only the rows in view are rendered (plan: virtualise rows > 200). */
export const LAYER_VIRTUAL_AFTER = 200

export type LayerRow =
  | { kind: 'section'; key: string; label: string }
  | { kind: 'goal'; key: string; id: string; label: string }
  | {
      kind: 'group'
      key: string
      groupId: string
      memberIds: string[]
      label: string
      hidden: boolean
      locked: boolean
    }
  | {
      kind: 'sticky'
      key: string
      id: string
      label: string
      depth: 0 | 1
      hidden: boolean
      locked: boolean
      stickyKind: 'note' | 'text' | 'shape'
    }
  | { kind: 'arrow'; key: string; id: string; label: string; hidden: boolean }

function arrowLabel(arrow: SpaceArrow, names: ReadonlyMap<string, string>): string {
  if (arrow.name) {
    return arrow.name
  }
  if (arrow.label) {
    return arrow.label
  }
  const end = (id?: string): string => (id ? (names.get(id) ?? 'item') : 'point')
  return `${end(arrow.fromId)} → ${end(arrow.toId)}`
}

/** The panel rows, top to bottom. Pure (tests + the render-time budget). */
export function buildLayerRows(
  goals: readonly SpaceGoal[],
  stickies: readonly SpaceStickyNote[],
  arrows: readonly SpaceArrow[]
): LayerRow[] {
  const rows: LayerRow[] = []
  if (goals.length > 0) {
    rows.push({ kind: 'section', key: 's:goals', label: 'Spaces' })
    for (const goal of goals) {
      rows.push({ kind: 'goal', key: `g:${goal.id}`, id: goal.id, label: goal.title || 'Space' })
    }
  }
  const names = new Map<string, string>()
  for (const goal of goals) {
    names.set(goal.id, goal.title || 'Space')
  }
  if (stickies.length > 0) {
    rows.push({ kind: 'section', key: 's:notes', label: 'Notes' })
    const live = groupIndex(stickies)
    const byId = new Map(stickies.map((s) => [s.id, s]))
    const done = new Set<string>()
    const topFirst = paintOrder(stickies).toReversed()
    const stickyRow = (s: SpaceStickyNote, depth: 0 | 1): LayerRow => ({
      kind: 'sticky',
      key: `n:${s.id}`,
      id: s.id,
      label: stickyLayerLabel(s),
      depth,
      hidden: s.hidden === true,
      locked: s.locked === true,
      stickyKind: s.kind ?? 'note'
    })
    for (const s of topFirst) {
      names.set(s.id, stickyLayerLabel(s))
      if (done.has(s.id)) {
        continue
      }
      const members = s.groupId ? live.get(s.groupId) : undefined
      if (!members || !s.groupId) {
        rows.push(stickyRow(s, 0))
        continue
      }
      const memberNotes = topFirst.filter((m) => m.groupId === s.groupId)
      rows.push({
        kind: 'group',
        key: `grp:${s.groupId}`,
        groupId: s.groupId,
        memberIds: members,
        label: `Group · ${members.length}`,
        hidden: members.every((id) => byId.get(id)?.hidden),
        locked: members.every((id) => byId.get(id)?.locked)
      })
      for (const m of memberNotes) {
        done.add(m.id)
        rows.push(stickyRow(m, 1))
      }
    }
  }
  if (arrows.length > 0) {
    rows.push({ kind: 'section', key: 's:arrows', label: 'Arrows' })
    for (const a of arrows) {
      rows.push({
        kind: 'arrow',
        key: `a:${a.id}`,
        id: a.id,
        label: arrowLabel(a, names),
        hidden: a.hidden === true
      })
    }
  }
  return rows
}
