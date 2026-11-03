// WS-E (TASK_16 wave 2): the canvas context menu's state (a tiny external store, like layers-store.ts)
// and its rows (pure: which rows each target shows, with labels from the ONE key table).
// The menu itself and the right-click wiring live in ContextMenus.tsx.
import type { Point } from '../../core/space'
import { allCanvasCommands, type CanvasCommand } from '../keyboard/commands'

// ── Open / closed state (tiny external store, like layers-store.ts) ────────────────────────────────

export type ContextMenuTarget =
  { kind: 'selection' } | { kind: 'arrow'; id: string } | { kind: 'goal'; id: string }
export type ContextMenuState = {
  /** Client px of the click (the menu's top-left). */
  client: Point
  /** Canvas point of the click (Paste lands there). */
  at: Point
  target: ContextMenuTarget
  /** Where focus goes back on Esc / close. */
  returnFocus: HTMLElement | null
}

let menu: ContextMenuState | null = null
const listeners = new Set<() => void>()
function emit(): void {
  for (const fn of listeners) {
    fn()
  }
}
export function openCanvasContextMenu(next: ContextMenuState): void {
  menu = next
  emit()
}
export function closeCanvasContextMenu(): void {
  if (menu) {
    menu = null
    emit()
  }
}
export function canvasContextMenuState(): ContextMenuState | null {
  return menu
}
export function subscribeCanvasContextMenu(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// ── Rows ───────────────────────────────────────────────────────────────────────────────────────────

export type ContextMenuItemId =
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'front'
  | 'back'
  | 'group'
  | 'ungroup'
  | 'hide'
  | 'lock'
  | 'zoom'
  | 'open'
export type ContextMenuItem = {
  id: ContextMenuItemId
  label: string
  /** Display of the key-table row ('' when the action has no key). */
  shortcut: string
  disabled?: boolean
  /** Draw a divider above this row. */
  divider?: boolean
}

/** Key-table row behind each menu row (labels stay in step with the `?` help). */
const COMMAND_OF: Partial<Record<ContextMenuItemId, string>> = {
  copy: 'edit.copy',
  paste: 'edit.paste',
  duplicate: 'edit.duplicate',
  delete: 'edit.delete',
  front: 'arrange.front',
  back: 'arrange.back',
  group: 'arrange.group',
  ungroup: 'arrange.ungroup',
  hide: 'edit.hide',
  lock: 'edit.lock',
  zoom: 'view.fitSelection'
}

export function shortcutFor(
  id: ContextMenuItemId,
  rows: readonly CanvasCommand[] = allCanvasCommands()
): string {
  const cmd = COMMAND_OF[id]
  return (cmd && rows.find((r) => r.id === cmd)?.display) || ''
}

/** The rows a target shows. Pure: the menu test checks each selection type here. */
export function contextMenuItems(
  target: ContextMenuTarget,
  state: {
    canGroup: boolean
    canUngroup: boolean
    hideLabel: 'Hide' | 'Show'
    lockLabel: 'Lock' | 'Unlock'
    allLocked: boolean
    canPaste: boolean
  },
  rows: readonly CanvasCommand[] = allCanvasCommands()
): ContextMenuItem[] {
  const item = (
    id: ContextMenuItemId,
    label: string,
    extra: Partial<ContextMenuItem> = {}
  ): ContextMenuItem => ({ id, label, shortcut: shortcutFor(id, rows), ...extra })
  if (target.kind === 'goal') {
    // Agent data rule: a Space tile gets only rows that read it (nothing copies, hides or deletes it).
    return [item('zoom', 'Zoom to Space'), item('open', 'Open Space')]
  }
  if (target.kind === 'arrow') {
    return [item('paste', 'Paste here', { disabled: !state.canPaste }), item('delete', 'Delete')]
  }
  return [
    item('copy', 'Copy'),
    item('paste', 'Paste here', { disabled: !state.canPaste }),
    item('duplicate', 'Duplicate', { disabled: state.allLocked }),
    item('delete', 'Delete', { disabled: state.allLocked }),
    item('front', 'Bring to front', { divider: true, disabled: state.allLocked }),
    item('back', 'Send to back', { disabled: state.allLocked }),
    item('group', 'Group', { divider: true, disabled: !state.canGroup }),
    item('ungroup', 'Ungroup', { disabled: !state.canUngroup }),
    item('hide', state.hideLabel),
    item('lock', state.lockLabel),
    item('zoom', 'Zoom to selection', { divider: true })
  ]
}
