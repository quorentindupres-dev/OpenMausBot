// WS-E (TASK_16 wave 2): the ⌘C / ⌘V rows for WS-A's key table (keyboard/commands.ts). Same ids, keys
// and display as the table's `edit.copy` / `edit.paste` today; WS-A swaps these in (CORE_COMMANDS rows
// replaced, not added: the P3-11 conflict test refuses two rows on one key). Behaviour: use-clipboard.ts.
import type { CanvasCommand } from '../keyboard/commands'
import {
  copyWhiteboardSelection,
  pointerCanvasPoint,
  requestWhiteboardPaste
} from './use-clipboard'

export const CLIPBOARD_COMMANDS: readonly CanvasCommand[] = [
  {
    id: 'edit.copy',
    label: 'Copy',
    group: 'Edit',
    scope: 'canvas',
    keys: [{ key: 'c', mod: true, shift: 'any', alt: 'any' }],
    display: '⌘C',
    when: ({ ctx }) =>
      ctx.effectiveSelectedIds.length > 0 &&
      !ctx.editingStickyId &&
      !window.getSelection()?.toString(),
    run: ({ ctx }) => copyWhiteboardSelection(ctx)
  },
  {
    id: 'edit.paste',
    label: 'Paste',
    group: 'Edit',
    scope: 'canvas',
    keys: [{ key: 'v', mod: true, shift: 'any', alt: 'any' }],
    display: '⌘V',
    when: ({ ctx }) => !ctx.editingStickyId && Boolean(ctx.onBatchAddWhiteboard),
    run: ({ ctx }) => {
      requestWhiteboardPaste(ctx, pointerCanvasPoint(ctx))
      return true
    }
  }
]
