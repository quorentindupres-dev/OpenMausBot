// WS-A (TASK_16 wave 2): the ONE shortcut table of the Spaces canvas. The key effect (use-canvas-keys.ts)
// looks a keydown up here; the `?` help (overlays/ShortcutHelp.tsx) and the WS-E context menu read the
// same rows for their labels. Idea from Penpot's keyboard map (data/workspace/shortcuts.cljs: one map of
// id -> command + fn) and its shortcuts panel; re-implemented, no Penpot code.
//
// Row = id · label · group · scope · keys (chords: event.key and/or physical event.code + modifiers)
//       · display · when (enabled) · run (true = preventDefault).
// A matched row always ends the lookup, even when `when` is false (same as the old if-chain's `return`).
// Rows are tried in table order. Other workstreams: export a `CanvasCommand[]` from your own file and
// ask WS-A to add it to extraRows() below, or register rows at runtime (`registerCanvasCommands`) when
// `run` needs your component's state. Overlapping keys in one scope are refused (P3-11 test).
import type { CanvasCtx } from '../canvas-ctx'
import type { SelectionActions } from '../selection/use-selection-actions'
import type { SpaceStickyNote } from '../../core/space'
import type { NudgeDirection } from '../../penpot-mpl/nudge-burst'
import type { NudgeControl } from './use-nudge'
import { WHITEBOARD_LAYER_COMMANDS } from '../overlays/layers-commands'
import { CONTEXT_MENU_COMMANDS } from '../overlays/ContextMenus'
import { CLIPBOARD_COMMANDS } from '../selection/clipboard-commands'

/** true / false = must be (not) held; 'any' = either. `mod` = ⌘ or Ctrl. */
export type ModReq = boolean | 'any'
export type KeyChord = {
  /** event.key, compared lower-case (letters follow the layout, like the old chain). */
  key?: string
  /** Physical event.code (Shift+digits type '@' / '"' / 'é' depending on the layout). */
  code?: string
  mod: ModReq
  shift: ModReq
  alt: ModReq
}
export type CommandScope = 'canvas' | 'help'
export type CommandGroup = 'Tools' | 'Edit' | 'Arrange' | 'View' | 'Help'

export type CommandEnv = {
  ctx: CanvasCtx
  sel: SelectionActions
  nudge: NudgeControl
  help: { open: () => void; close: () => void }
}

export type CanvasCommand = {
  id: string
  label: string
  group: CommandGroup
  scope: CommandScope
  keys: readonly KeyChord[]
  /** What the help and the menus show, e.g. '⇧1'. */
  display: string
  when?: (env: CommandEnv, event: KeyboardEvent) => boolean
  /** True = the key was used (preventDefault). */
  run: (env: CommandEnv, event: KeyboardEvent) => boolean | void
}

const chord = (c: Partial<KeyChord> & ({ key: string } | { code: string })): KeyChord => ({
  mod: false,
  shift: 'any',
  alt: false,
  ...c
})
const modChord = (key: string, extra: Partial<KeyChord> = {}): KeyChord => ({
  key,
  mod: true,
  shift: 'any',
  alt: 'any',
  ...extra
})
const anyMods = (key: string): KeyChord => ({ key, mod: 'any', shift: 'any', alt: 'any' })

const editingOff = ({ ctx }: CommandEnv): boolean => !ctx.editingStickyId
const hasSelection = (env: CommandEnv): boolean =>
  env.ctx.effectiveSelectedIds.length > 0 && editingOff(env)
const tool =
  (mode: Parameters<NonNullable<CanvasCtx['onChangeToolMode']>>[0]) =>
  ({ ctx }: CommandEnv): void => {
    ctx.onChangeToolMode?.(mode)
  }
const nudge =
  (direction: NudgeDirection) =>
  ({ nudge: n }: CommandEnv, event: KeyboardEvent): boolean =>
    n.press(direction, event.shiftKey)

/** The table. Order = lookup order (kept from the old if-chain; new rows sit where they cannot shadow). */
export const CORE_COMMANDS: readonly CanvasCommand[] = [
  {
    id: 'help.close',
    label: 'Close shortcut help',
    group: 'Help',
    scope: 'help',
    keys: [anyMods('escape')],
    display: 'Esc',
    run: ({ help }) => {
      help.close()
      return true
    }
  },
  {
    id: 'view.fitSelection',
    label: 'Zoom to selection',
    group: 'View',
    scope: 'canvas',
    keys: [chord({ code: 'Digit2', shift: true })],
    display: '⇧2',
    run: ({ sel }) => sel.fitToSelection()
  },
  {
    id: 'view.fitAll',
    label: 'Fit all Spaces',
    group: 'View',
    scope: 'canvas',
    keys: [chord({ code: 'Digit1', shift: true })],
    display: '⇧1',
    run: ({ sel }) => {
      sel.fitAllSpaces()
      return true
    }
  },
  {
    id: 'view.zoom100',
    label: 'Zoom to 100 %',
    group: 'View',
    scope: 'canvas',
    keys: [chord({ code: 'Digit0', shift: true })],
    display: '⇧0',
    run: ({ sel }) => {
      sel.zoomTo100()
      return true
    }
  },
  {
    id: 'edit.undo',
    label: 'Undo',
    group: 'Edit',
    scope: 'canvas',
    keys: [modChord('z', { shift: false })],
    display: '⌘Z',
    run: ({ ctx }) => {
      ctx.onUndo?.()
      return true
    }
  },
  {
    id: 'edit.redo',
    label: 'Redo',
    group: 'Edit',
    scope: 'canvas',
    keys: [modChord('z', { shift: true }), modChord('y')],
    display: '⇧⌘Z',
    run: ({ ctx }) => {
      ctx.onRedo?.()
      return true
    }
  },
  {
    id: 'edit.duplicate',
    label: 'Duplicate (again = repeat the last move)',
    group: 'Edit',
    scope: 'canvas',
    keys: [modChord('d')],
    display: '⌘D',
    run: (env) => {
      if (hasSelection(env)) {
        env.sel.duplicateSelected()
        return true
      }
      // Agent data rule: a Space tile is never copied by a whiteboard action.
      if (env.ctx.selectedGoalId && editingOff(env)) {
        env.ctx.onNotify?.('Spaces are not duplicated. ⌘D copies notes, shapes and text.')
        return true
      }
      return false
    }
  },
  // ⌘C / ⌘V: WS-E's two-format system clipboard + one-batch paste (same ids, keys, labels).
  ...CLIPBOARD_COMMANDS,
  {
    id: 'edit.lock',
    label: 'Lock / unlock',
    group: 'Edit',
    scope: 'canvas',
    // ⇧⌘L (Figma / Penpot): plain ⌘L is Orca's global "toggle right sidebar".
    keys: [modChord('l', { shift: true })],
    display: '⇧⌘L',
    when: hasSelection,
    run: ({ ctx }) => {
      const ids = ctx.effectiveSelectedIds
      const nextLocked = ids.some((id) => !ctx.stickiesById.get(id)?.locked)
      if (ids.length === 1) {
        ctx.onUpdateStickyNote?.(ids[0]!, { locked: nextLocked })
      } else {
        const patches: Record<string, Partial<SpaceStickyNote>> = {}
        for (const id of ids) {
          patches[id] = { locked: nextLocked }
        }
        ctx.onBatchUpdateStickyNotes?.(patches)
      }
      return true
    }
  },
  {
    id: 'edit.bold',
    label: 'Bold text',
    group: 'Edit',
    scope: 'canvas',
    keys: [modChord('b')],
    display: '⌘B',
    when: ({ ctx }) =>
      Boolean(ctx.singleSelectedSticky && !ctx.singleSelectedSticky.locked && !ctx.editingStickyId),
    run: ({ ctx }) => {
      const s = ctx.singleSelectedSticky
      if (!s) {
        return false
      }
      const defaultBold = s.kind === 'text' && (!s.fillStyle || s.fillStyle === 'none')
      const curBold = (s.fontWeight ?? (defaultBold ? 'bold' : 'normal')) === 'bold'
      ctx.onUpdateStickyNote?.(s.id, { fontWeight: curBold ? 'normal' : 'bold' })
      return true
    }
  },
  {
    id: 'tool.select',
    label: 'Select tool',
    group: 'Tools',
    scope: 'canvas',
    keys: [chord({ key: 'v' })],
    display: 'V',
    run: tool('select')
  },
  {
    id: 'tool.marquee',
    label: 'Marquee select',
    group: 'Tools',
    scope: 'canvas',
    keys: [chord({ key: 'm' })],
    display: 'M',
    run: tool('marquee')
  },
  {
    id: 'tool.frame',
    label: 'New Space (frame)',
    group: 'Tools',
    scope: 'canvas',
    keys: [chord({ key: 'f' })],
    display: 'F',
    run: tool('frame')
  },
  {
    id: 'tool.shape',
    label: 'Shape',
    group: 'Tools',
    scope: 'canvas',
    keys: [chord({ key: 'r' })],
    display: 'R',
    run: tool('shape')
  },
  {
    id: 'tool.text',
    label: 'Text',
    group: 'Tools',
    scope: 'canvas',
    keys: [chord({ key: 't' })],
    display: 'T',
    run: tool('text')
  },
  {
    id: 'tool.arrow',
    label: 'Arrow / connector',
    group: 'Tools',
    scope: 'canvas',
    // `A` belongs to the toolbar (agents tray, whiteboard-toolbar.tsx); it used to fire both actions.
    keys: [chord({ key: 'c' })],
    display: 'C',
    run: tool('arrow')
  },
  {
    id: 'tool.eraser',
    label: 'Eraser',
    group: 'Tools',
    scope: 'canvas',
    keys: [chord({ key: 'e' })],
    display: 'E',
    run: tool('eraser')
  },
  {
    id: 'arrange.front',
    label: 'Bring to front',
    group: 'Arrange',
    scope: 'canvas',
    keys: [chord({ key: ']' })],
    display: ']',
    when: hasSelection,
    run: ({ ctx, sel }) => {
      sel.bringIdsToFront(ctx.effectiveSelectedIds)
      return true
    }
  },
  {
    id: 'arrange.back',
    label: 'Send to back',
    group: 'Arrange',
    scope: 'canvas',
    keys: [chord({ key: '[' })],
    display: '[',
    when: hasSelection,
    run: ({ ctx, sel }) => {
      sel.sendIdsToBack(ctx.effectiveSelectedIds)
      return true
    }
  },
  {
    id: 'edit.inline',
    label: 'Edit text',
    group: 'Edit',
    scope: 'canvas',
    keys: [chord({ key: 'enter' })],
    display: '↵',
    when: ({ ctx }) =>
      Boolean(ctx.singleSelectedSticky && !ctx.singleSelectedSticky.locked && !ctx.editingStickyId),
    run: ({ ctx }) => {
      if (ctx.singleSelectedSticky) {
        ctx.setEditingStickyId(ctx.singleSelectedSticky.id)
      }
      return true
    }
  },
  {
    id: 'arrange.nudgeLeft',
    label: 'Nudge left (⇧ = 10 px)',
    group: 'Arrange',
    scope: 'canvas',
    keys: [chord({ key: 'arrowleft' })],
    display: '←',
    run: nudge('left')
  },
  {
    id: 'arrange.nudgeRight',
    label: 'Nudge right (⇧ = 10 px)',
    group: 'Arrange',
    scope: 'canvas',
    keys: [chord({ key: 'arrowright' })],
    display: '→',
    run: nudge('right')
  },
  {
    id: 'arrange.nudgeUp',
    label: 'Nudge up (⇧ = 10 px)',
    group: 'Arrange',
    scope: 'canvas',
    keys: [chord({ key: 'arrowup' })],
    display: '↑',
    run: nudge('up')
  },
  {
    id: 'arrange.nudgeDown',
    label: 'Nudge down (⇧ = 10 px)',
    group: 'Arrange',
    scope: 'canvas',
    keys: [chord({ key: 'arrowdown' })],
    display: '↓',
    run: nudge('down')
  },
  {
    id: 'view.zoomIn',
    label: 'Zoom in',
    group: 'View',
    scope: 'canvas',
    keys: [chord({ key: '+' }), chord({ key: '=' }), chord({ code: 'NumpadAdd' })],
    display: '+',
    run: ({ sel }) => {
      sel.zoomStep('in')
      return true
    }
  },
  {
    id: 'view.zoomOut',
    label: 'Zoom out',
    group: 'View',
    scope: 'canvas',
    keys: [chord({ key: '-' }), chord({ key: '_' }), chord({ code: 'NumpadSubtract' })],
    display: '−',
    run: ({ sel }) => {
      sel.zoomStep('out')
      return true
    }
  },
  {
    id: 'help.open',
    label: 'Keyboard shortcuts',
    group: 'Help',
    scope: 'canvas',
    keys: [chord({ key: '?' })],
    display: '?',
    run: ({ help }) => {
      help.open()
      return true
    }
  },
  {
    id: 'edit.delete',
    label: 'Delete',
    group: 'Edit',
    scope: 'canvas',
    keys: [anyMods('backspace'), anyMods('delete')],
    display: '⌫',
    when: editingOff,
    run: ({ sel }) => sel.deleteSelected()
  },
  {
    id: 'edit.deselect',
    label: 'Deselect, back to Select',
    group: 'Edit',
    scope: 'canvas',
    keys: [anyMods('escape')],
    display: 'Esc',
    run: ({ ctx }) => {
      ctx.setSelectedArrowId(null)
      ctx.setSelectedStickyIds([])
      ctx.setEditingStickyId(null)
      ctx.onChangeToolMode?.('select')
    }
  }
]

/** Rows that other workstreams export from their own files (WS-A adds the import here); their runtime
 *  registrations then no-op (same ids). WS-C: group / ungroup / hide / layers panel. WS-E: ⇧F10 / menu
 *  key. A function, read at lookup time: ContextMenus.tsx imports this module too (import cycle). */
const extraRows = (): readonly CanvasCommand[] => [
  ...WHITEBOARD_LAYER_COMMANDS,
  ...CONTEXT_MENU_COMMANDS
]

/** Shown in the help only: keys handled outside the table (Space hold in the key effect, A in the toolbar). */
export const HOLD_HINTS: readonly { label: string; display: string; group: CommandGroup }[] = [
  { label: 'Hold to pan (hand)', display: 'Space', group: 'View' },
  { label: 'Agents tray (toolbar)', display: 'A', group: 'Tools' }
]

// ── Matching ─────────────────────────────────────────────────────────────────────────────────────

const modOk = (req: ModReq, held: boolean): boolean => req === 'any' || req === held

export function chordMatches(c: KeyChord, event: KeyboardEvent): boolean {
  if (c.code !== undefined && event.code !== c.code) {
    return false
  }
  if (c.key !== undefined && (event.key ?? '').toLowerCase() !== c.key) {
    return false
  }
  return (
    modOk(c.mod, event.metaKey || event.ctrlKey) &&
    modOk(c.shift, event.shiftKey) &&
    modOk(c.alt, event.altKey)
  )
}

/** Runtime row sets and the canvas they belong to (`owner`, e.g. its rootRef; undefined = every canvas). */
const runtimeRows = new Map<readonly CanvasCommand[], unknown>()

/** Every row: the table, the workstream rows, then the runtime rows of `owner` (and ownerless ones).
 *  With no owner given: the runtime rows of every canvas (deduped by id, for listings). */
export function allCanvasCommands(owner?: unknown): CanvasCommand[] {
  const runtime: CanvasCommand[] = []
  const seen = new Set<string>()
  for (const [rows, rowOwner] of runtimeRows) {
    if (owner !== undefined && rowOwner !== undefined && rowOwner !== owner) {
      continue
    }
    for (const r of rows) {
      if (!seen.has(r.id)) {
        seen.add(r.id)
        runtime.push(r)
      }
    }
  }
  return [...CORE_COMMANDS, ...extraRows(), ...runtime]
}

/** First row of `scope` whose chord matches, or null. */
export function findCommand(
  event: KeyboardEvent,
  scope: CommandScope,
  rows: readonly CanvasCommand[] = allCanvasCommands()
): CanvasCommand | null {
  // Someone earlier (an Orca global binding, a menu) already used this key: never run a second action.
  if (event.defaultPrevented) {
    return null
  }
  for (const row of rows) {
    if (row.scope === scope && row.keys.some((c) => chordMatches(c, event))) {
      return row
    }
  }
  return null
}

// ── Conflicts (P3-11) ────────────────────────────────────────────────────────────────────────────

/** US-layout keys a physical code types (unshifted, shifted); enough to compare key vs code chords. */
const US_KEYS: Record<string, readonly [string, string]> = {
  Digit0: ['0', ')'],
  Digit1: ['1', '!'],
  Digit2: ['2', '@'],
  Digit3: ['3', '#'],
  Digit4: ['4', '$'],
  Digit5: ['5', '%'],
  Digit6: ['6', '^'],
  Digit7: ['7', '&'],
  Digit8: ['8', '*'],
  Digit9: ['9', '('],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  Slash: ['/', '?'],
  NumpadAdd: ['+', '+'],
  NumpadSubtract: ['-', '-']
}

const modsOverlap = (a: ModReq, b: ModReq): boolean => a === 'any' || b === 'any' || a === b

/** Can one keypress match both chords? */
export function chordsOverlap(a: KeyChord, b: KeyChord): boolean {
  if (!modsOverlap(a.mod, b.mod) || !modsOverlap(a.alt, b.alt) || !modsOverlap(a.shift, b.shift)) {
    return false
  }
  if (a.code !== undefined && b.code !== undefined) {
    return a.code === b.code
  }
  if (a.key !== undefined && b.key !== undefined) {
    return a.key === b.key
  }
  const [withCode, withKey] = a.code !== undefined ? [a, b] : [b, a]
  const typed = US_KEYS[withCode.code ?? '']
  if (!typed || withKey.key === undefined) {
    return false
  }
  // Shift states both chords accept; the code types the unshifted or the shifted key.
  return [false, true]
    .filter((s) => modOk(withCode.shift, s) && modOk(withKey.shift, s))
    .some((s) => typed[s ? 1 : 0] === withKey.key)
}

export type KeyConflict = { scope: CommandScope; a: string; b: string }

/** Pairs of different rows in one scope that one keypress could trigger both of. */
export function findKeyConflicts(rows: readonly CanvasCommand[]): KeyConflict[] {
  const out: KeyConflict[] = []
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!
      const b = rows[j]!
      if (a.scope !== b.scope || a.id === b.id) {
        continue
      }
      if (a.keys.some((ka) => b.keys.some((kb) => chordsOverlap(ka, kb)))) {
        out.push({ scope: a.scope, a: a.id, b: b.id })
      }
    }
  }
  return out
}

/**
 * Runtime rows (WS-D: ⌘F jump, next / prev ask) whose `run` needs component state. `owner` = the canvas
 * they act on (pass its rootRef): two live canvases may register the same ids, and the key effect only
 * looks at the rows of the canvas that handles the key. Rows already in the table (same objects) are a
 * silent no-op; a key taken in that scope or an id repeated for the same canvas is refused and logged.
 */
export function registerCanvasCommands(
  rows: readonly CanvasCommand[],
  owner?: unknown
): {
  unregister: () => void
  conflicts: KeyConflict[]
} {
  const table = new Set<CanvasCommand>([...CORE_COMMANDS, ...extraRows()])
  if (rows.every((r) => table.has(r))) {
    return {
      unregister: () => {},
      conflicts: rows.map((r) => ({ scope: r.scope, a: r.id, b: r.id }))
    }
  }
  const existing = owner === undefined ? allCanvasCommands() : allCanvasCommands(owner)
  const ids = new Set(existing.map((r) => r.id))
  const conflicts = findKeyConflicts([...existing, ...rows]).filter((c) =>
    rows.some((r) => r.id === c.a || r.id === c.b)
  )
  const dupIds = rows.filter((r) => ids.has(r.id))
  if (conflicts.length > 0 || dupIds.length > 0) {
    for (const r of dupIds) {
      conflicts.push({ scope: r.scope, a: r.id, b: r.id })
    }
    console.warn(
      `[orca-plus canvas keys] refused rows ${rows.map((r) => r.id).join(', ')}:`,
      conflicts.map((c) => `${c.a} vs ${c.b}`).join('; ')
    )
    return { unregister: () => {}, conflicts }
  }
  runtimeRows.set(rows, owner)
  return {
    unregister: () => {
      runtimeRows.delete(rows)
    },
    conflicts: []
  }
}
