// WS-0 (TASK_16 wave 2): the canvas key effect, moved from space-canvas.tsx. Owner: WS-A.
// WS-A: the if-chain is now ONE table (./commands.ts); this effect only guards, looks the key up and runs
// the row. Old keys behave exactly as before (P3-00 golden "keys ·" snapshots unchanged); new rows:
// Shift+0, + / −, arrows (nudge), `?` (help). Keys never fire while typing (inputs, textareas, selects,
// contenteditable, IME) and arrows leave focused menus / lists alone.
import type { CanvasCtx } from '../canvas-ctx'
import type { SelectionActions } from '../selection/use-selection-actions'
import { isImeOwnedKeyboardEvent } from '../../core/ime-guard'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { allCanvasCommands, findCommand, type CommandEnv } from './commands'
import { isShortcutHelpOpen, setShortcutHelpOpen } from './help-store'
import { useNudge } from './use-nudge'
import { isTypingTarget } from './typing-target'
import { addLiveCanvas, isKeyCanvas } from './active-canvas'

/** Widgets that own arrow keys themselves (Orca Plus menus, lists, sliders, tabs). */
const ARROW_OWNER_SELECTOR =
  '[role="menu"], [role="menubar"], [role="listbox"], [role="slider"], [role="tablist"], [role="grid"], [role="tree"]'

/** Modifier key-downs (Shift pressed mid-burst for 10 px steps) never end a nudge burst. */
const MODIFIER_KEYS = new Set(['Shift', 'Meta', 'Control', 'Alt', 'AltGraph', 'CapsLock'])

export function useCanvasKeys(ctx: CanvasCtx, sel: SelectionActions): void {
  const { rootRef, setSpaceHeld, spaceHeldRef } = ctx
  const nudge = useNudge(ctx)
  // Latest env without re-subscribing the window listeners on every render.
  const envRef = useRef<CommandEnv | null>(null)
  useLayoutEffect(() => {
    envRef.current = {
      ctx,
      sel,
      nudge,
      help: { open: () => setShortcutHelpOpen(true), close: () => setShortcutHelpOpen(false) }
    }
  })

  useEffect(() => {
    const root = rootRef.current
    const dropLive = root ? addLiveCanvas(root) : () => {}
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isKeyCanvas(rootRef.current)) {
        return
      }
      const isArrow = event.key?.startsWith('Arrow')
      if (!isArrow && !MODIFIER_KEYS.has(event.key)) {
        // Any other key (typing in a field, Space, a command) closes an open nudge burst first, so
        // nothing else ever folds into the nudge's undo entry.
        envRef.current?.nudge.end()
      }
      if (isImeOwnedKeyboardEvent(event)) {
        return
      }
      if (isTypingTarget(event.target)) {
        return
      }
      if (event.code === 'Space' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true
          setSpaceHeld(true)
        }
        event.preventDefault()
        return
      }
      const env = envRef.current
      if (!env) {
        return
      }
      // Table rows + this canvas's runtime rows (WS-D asks); skipped when the key was already used.
      const rows = allCanvasCommands(rootRef)
      const row =
        (isShortcutHelpOpen() ? findCommand(event, 'help', rows) : null) ??
        findCommand(event, 'canvas', rows)
      if (!row) {
        return
      }
      if (
        row.id.startsWith('arrange.nudge') &&
        (event.target as HTMLElement | null)?.closest?.(ARROW_OWNER_SELECTOR)
      ) {
        return
      }
      if (row.when && !row.when(env, event)) {
        return
      }
      if (row.run(env, event) === true) {
        event.preventDefault()
      }
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      envRef.current?.nudge.keyUp()
      if (event.code === 'Space' && spaceHeldRef.current) {
        spaceHeldRef.current = false
        setSpaceHeld(false)
      }
    }

    const onBlurWindow = (): void => {
      envRef.current?.nudge.end()
      if (spaceHeldRef.current) {
        spaceHeldRef.current = false
        setSpaceHeld(false)
      }
    }

    // Any pointer press (a drag, the toolbar Undo, a menu, the layers panel, the inspector) closes an
    // open nudge burst before its own write, so that write is a separate undo entry.
    const onPointerDownAnywhere = (): void => {
      envRef.current?.nudge.end()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlurWindow)
    window.addEventListener('pointerdown', onPointerDownAnywhere, true)
    return () => {
      dropLive()
      window.removeEventListener('pointerdown', onPointerDownAnywhere, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlurWindow)
    }
  }, [rootRef, setSpaceHeld, spaceHeldRef])
}
