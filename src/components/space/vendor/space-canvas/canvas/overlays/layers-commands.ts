// WS-C (TASK_16 wave 2): the shortcut rows of the layers / group / hide workstream. Per the plan, WS-A
// (owner of keyboard/commands.ts) adds this array to EXTRA_ROWS. Until then LayersPanel registers it at
// runtime (registerCanvasCommands); once the table holds the same ids that call is refused and does
// nothing, so the rows never run twice. Keys from Penpot's map (⌘G, ⇧⌘G, ⇧⌘H, ⌥L); no Penpot code.
import type { CanvasCommand, CommandEnv } from '../keyboard/commands'
import { groupSelection, toggleHidden, ungroupSelection } from './layers-actions'
import { isLayersPanelOpen, setLayersPanelOpen } from './layers-store'

const selected =
  (min: number) =>
  (env: CommandEnv): boolean =>
    env.ctx.effectiveSelectedIds.length >= min && !env.ctx.editingStickyId

export const WHITEBOARD_LAYER_COMMANDS: readonly CanvasCommand[] = [
  {
    id: 'arrange.group',
    label: 'Group',
    group: 'Arrange',
    scope: 'canvas',
    keys: [{ key: 'g', mod: true, shift: false, alt: 'any' }],
    display: '⌘G',
    when: selected(2),
    run: ({ ctx }) => groupSelection(ctx).ok
  },
  {
    id: 'arrange.ungroup',
    label: 'Ungroup',
    group: 'Arrange',
    scope: 'canvas',
    keys: [{ key: 'g', mod: true, shift: true, alt: 'any' }],
    display: '⇧⌘G',
    when: selected(1),
    run: ({ ctx }) => ungroupSelection(ctx).ok
  },
  {
    id: 'edit.hide',
    label: 'Hide / show',
    group: 'Edit',
    scope: 'canvas',
    keys: [{ key: 'h', mod: true, shift: true, alt: 'any' }],
    display: '⇧⌘H',
    when: selected(1),
    run: ({ ctx }) => toggleHidden(ctx).ok
  },
  {
    id: 'view.layers',
    label: 'Layers panel',
    group: 'View',
    scope: 'canvas',
    // Physical key: ⌥L types '¬' on a Mac keyboard.
    keys: [{ code: 'KeyL', mod: false, shift: false, alt: true }],
    display: '⌥L',
    run: () => {
      setLayersPanelOpen(!isLayersPanelOpen())
      return true
    }
  }
]
