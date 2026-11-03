// WS-0 (TASK_16 wave 2): canvas double-click / right-click → create menu (openCanvasCreate), moved
// verbatim from space-canvas.tsx (the root div's inline handlers). Owner: WS-E (selection menu lands here).
// WS-E: right-click on a note / shape / text, an arrow or a Space tile opens a small menu (Penpot's
// ui/workspace/context_menu.cljs idea, re-implemented, our actions). Empty canvas still opens the board's
// create menu, unchanged. Shortcut labels come from the ONE key table (keyboard/commands.ts). Space tiles
// get only safe rows (zoom, open): a whiteboard menu never edits agent data. Keyboard: the menu key or
// Shift+F10 opens it on the selection; the first row takes focus, arrows move, Esc closes and gives focus
// back. The menu renders only while open. It also mounts the clipboard listeners (use-clipboard.ts).
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { CanvasCtx, CanvasHandlers } from '../canvas-ctx'
import { toCanvas } from '../../core/space'
import { expandToGroups } from '../../core/whiteboard-groups'
import { fitSelection } from '../../core/viewport-fit'
import { registerCanvasCommands, type CanvasCommand } from '../keyboard/commands'
import {
  canvasContextMenuState,
  closeCanvasContextMenu,
  contextMenuItems,
  openCanvasContextMenu,
  subscribeCanvasContextMenu,
  type ContextMenuItemId,
  type ContextMenuTarget
} from './context-menu-items'
import { focusMenuOnOpen, handleMenuKey } from '../../menu-keys'
import {
  copyWhiteboardSelection,
  requestWhiteboardPaste,
  useWhiteboardClipboard
} from '../selection/use-clipboard'
import {
  groupSelection,
  toggleHidden,
  toggleLock,
  ungroupSelection,
  whiteboardActionState
} from './layers-actions'

// ── Opening ────────────────────────────────────────────────────────────────────────────────────────

const EXCLUDED =
  '[data-space-tile], [data-space-card], [data-space-sticky], [data-space-arrow], [data-space-dock], [data-whiteboard-inspector], [data-whiteboard-multiselect], [data-whiteboard-history]'

/** Shift+F10 / the menu key: open the menu on the current selection (or the selected Space). */
export const CONTEXT_MENU_COMMANDS: readonly CanvasCommand[] = [
  {
    id: 'edit.contextMenu',
    label: 'Open the context menu',
    group: 'Edit',
    scope: 'canvas',
    keys: [
      { key: 'contextmenu', mod: false, shift: 'any', alt: false },
      { key: 'f10', mod: false, shift: true, alt: false }
    ],
    display: '⇧F10',
    when: ({ ctx }) =>
      !ctx.editingStickyId &&
      (ctx.effectiveSelectedIds.length > 0 || Boolean(ctx.selectedArrowId || ctx.selectedGoalId)),
    run: ({ ctx }) => openMenuOnSelection(ctx)
  }
]

function openMenuOnSelection(ctx: CanvasCtx): boolean {
  const rect = ctx.rootRef.current?.getBoundingClientRect()
  if (!rect) {
    return false
  }
  const target: ContextMenuTarget =
    ctx.effectiveSelectedIds.length > 0
      ? { kind: 'selection' }
      : ctx.selectedArrowId
        ? { kind: 'arrow', id: ctx.selectedArrowId }
        : { kind: 'goal', id: ctx.selectedGoalId ?? '' }
  const anchorId =
    target.kind === 'selection'
      ? ctx.effectiveSelectedIds[0]
      : target.kind === 'goal'
        ? target.id
        : ''
  const box = anchorId ? ctx.boxMap.get(anchorId) : undefined
  const at = box
    ? { x: box.x + box.w / 2, y: box.y + box.h / 2 }
    : toCanvas({ x: 120, y: 120 }, ctx.view)
  openCanvasContextMenu({
    client: {
      x: rect.left + at.x * ctx.view.scale + ctx.view.x,
      y: rect.top + at.y * ctx.view.scale + ctx.view.y
    },
    at,
    target,
    returnFocus: document.activeElement as HTMLElement | null
  })
  return true
}

export function useCanvasContextMenus(ctx: CanvasCtx) {
  const { onContextCreate, rootRef, view } = ctx
  useWhiteboardClipboard(ctx)
  useEffect(() => registerCanvasCommands(CONTEXT_MENU_COMMANDS).unregister, [])
  useEffect(() => closeCanvasContextMenu, [])
  const openCanvasCreate = (clientX: number, clientY: number): void => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    onContextCreate(
      { x: clientX, y: clientY },
      toCanvas({ x: clientX - rect.left, y: clientY - rect.top }, view)
    )
  }

  const onCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (
      !(event.target as HTMLElement).closest(
        '[data-space-tile], [data-space-card], [data-space-sticky], [data-space-arrow], [data-space-dock], [data-whiteboard-inspector], [data-whiteboard-multiselect], [data-whiteboard-history], button, input, textarea'
      )
    ) {
      openCanvasCreate(event.clientX, event.clientY)
    }
  }

  /** WS-E: right-click on an item. True = a menu opened (the event is consumed). */
  const openItemMenu = (event: React.MouseEvent<HTMLDivElement>): boolean => {
    const el = event.target as HTMLElement
    if (el.closest('input, textarea, [contenteditable="true"]')) {
      return false
    }
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) {
      return false
    }
    const stickyId = el.closest('[data-space-sticky]')?.getAttribute('data-space-sticky')
    const arrowId = el.closest('[data-space-arrow]')?.getAttribute('data-space-arrow')
    const goalId = el.closest('[data-space-tile]')?.getAttribute('data-space-tile')
    let target: ContextMenuTarget | null = null
    if (stickyId && ctx.stickiesById.has(stickyId)) {
      if (!ctx.effectiveSelectedIds.includes(stickyId)) {
        ctx.setSelectedStickyIds(expandToGroups(ctx.stickies, [stickyId]))
        ctx.setSelectedArrowId(null)
      }
      target = { kind: 'selection' }
    } else if (arrowId) {
      ctx.setSelectedArrowId(arrowId)
      ctx.setSelectedStickyIds([])
      target = { kind: 'arrow', id: arrowId }
    } else if (goalId && ctx.space.goals.some((g) => g.id === goalId)) {
      target = { kind: 'goal', id: goalId }
    }
    if (!target) {
      return false
    }
    event.preventDefault()
    openCanvasContextMenu({
      client: { x: event.clientX, y: event.clientY },
      at: toCanvas({ x: event.clientX - rect.left, y: event.clientY - rect.top }, view),
      target,
      returnFocus: document.activeElement as HTMLElement | null
    })
    return true
  }

  const onCanvasContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!(event.target as HTMLElement).closest(EXCLUDED)) {
      event.preventDefault()
      openCanvasCreate(event.clientX, event.clientY)
      return
    }
    openItemMenu(event)
  }

  return { openCanvasCreate, onCanvasDoubleClick, onCanvasContextMenu }
}

// ── The menu ───────────────────────────────────────────────────────────────────────────────────────

const MENU_W = 220

/** Rendered by the canvas overlays (ItemInspector.tsx); nothing while closed. */
export function CanvasContextMenu({
  ctx,
  g
}: {
  ctx: CanvasCtx
  g: CanvasHandlers
}): React.JSX.Element | null {
  const state = useSyncExternalStore(
    subscribeCanvasContextMenu,
    canvasContextMenuState,
    canvasContextMenuState
  )
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!state) {
      return
    }
    const onDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        closeCanvasContextMenu()
      }
    }
    const onClose = (): void => closeCanvasContextMenu()
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('wheel', onClose, { passive: true })
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('wheel', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [state])

  if (!state) {
    return null
  }
  const ids = ctx.effectiveSelectedIds
  const actionState = whiteboardActionState(ctx, ids)
  const items = contextMenuItems(state.target, {
    ...actionState,
    allLocked: ids.length > 0 && ids.every((id) => ctx.stickiesById.get(id)?.locked),
    canPaste: Boolean(ctx.onBatchAddWhiteboard)
  })
  const close = (): void => {
    closeCanvasContextMenu()
    state.returnFocus?.focus?.()
  }
  const zoomTo = (id: string): void => {
    const el = ctx.rootRef.current
    const box = ctx.boxMap.get(id)
    const next = el && box ? fitSelection([box], el.clientWidth, el.clientHeight) : null
    if (next) {
      ctx.markZoomTween()
      ctx.setView(next)
    }
  }
  const run = (id: ContextMenuItemId): void => {
    const target = state.target
    close()
    switch (id) {
      case 'copy':
        copyWhiteboardSelection(ctx)
        return
      case 'paste':
        requestWhiteboardPaste(ctx, state.at)
        return
      case 'duplicate':
        g.duplicateSelected()
        return
      case 'delete':
        g.deleteSelected()
        return
      case 'front':
        g.bringIdsToFront(ids)
        return
      case 'back':
        g.sendIdsToBack(ids)
        return
      case 'group':
        groupSelection(ctx)
        return
      case 'ungroup':
        ungroupSelection(ctx)
        return
      case 'hide':
        toggleHidden(ctx)
        return
      case 'lock':
        toggleLock(ctx)
        return
      case 'zoom':
        if (target.kind === 'goal') {
          zoomTo(target.id)
        } else {
          g.fitToSelection()
        }
        return
      case 'open': {
        const goal = target.kind === 'goal' ? ctx.space.goals.find((x) => x.id === target.id) : null
        if (goal) {
          ctx.onOpenGoal(goal)
        }
      }
    }
  }
  const rect = ctx.rootRef.current?.getBoundingClientRect()
  const rootW = ctx.rootRef.current?.clientWidth || 1184
  const rootH = ctx.rootRef.current?.clientHeight || 860
  const estH = items.length * 30 + 12
  const left = Math.max(8, Math.min(rootW - MENU_W - 8, state.client.x - (rect?.left ?? 0)))
  const top = Math.max(8, Math.min(rootH - estH - 8, state.client.y - (rect?.top ?? 0)))
  return (
    <div
      ref={(el) => {
        menuRef.current = el
        focusMenuOnOpen(el)
      }}
      role="menu"
      aria-label="Item actions"
      data-whiteboard-context-menu={state.target.kind}
      onKeyDown={(event) => {
        if (menuRef.current) {
          handleMenuKey(event, menuRef.current, closeCanvasContextMenu, state.returnFocus)
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={{ left, top, width: MENU_W }}
      className="pointer-events-auto absolute z-50 rounded-lg border border-white/10 bg-zinc-900/95 p-1 text-[12px] text-zinc-100 shadow-xl backdrop-blur"
    >
      {items.map((it) => (
        <div key={it.id}>
          {it.divider ? <div role="separator" className="my-1 h-px bg-white/10" /> : null}
          <button
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => run(it.id)}
            className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-white/10 focus:bg-white/10 focus:outline-none disabled:opacity-40"
          >
            <span>{it.label}</span>
            {it.shortcut ? (
              <kbd className="font-sans text-[11px] text-zinc-400">{it.shortcut}</kbd>
            ) : null}
          </button>
        </div>
      ))}
    </div>
  )
}
