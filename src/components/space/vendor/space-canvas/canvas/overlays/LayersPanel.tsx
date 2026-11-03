// WS-C (TASK_16 wave 2): the whiteboard layers panel. A left drawer that lists Spaces (read only), notes /
// shapes / text (top of the paint order first, groups folded under a header) and arrows, with eye, lock,
// rename (double-click) and drag reorder (= zIndex). Idea from Penpot's layers sidebar
// (ui/workspace/sidebar/layers.cljs, layer_item.cljs) and our G_app-Data TreeTable `layers` mode;
// re-implemented, no Penpot or G_app-Data code.
// Opens and closes only from ⌥L (listed in the `?` help; Esc inside it closes too). No close button and
// nothing rendered while closed: no always-visible chrome. Per row: eye + lock buttons only.
// Agent data rule: Space rows have no control (no eye, no lock, no group, no drag); every write goes
// through layers-actions.ts / onUpdateArrow and patches stickies or arrows only.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, Group, Lock, Unlock } from 'lucide-react'
import type { CanvasCtx } from '../canvas-ctx'
import { isImeOwnedKeyboardEvent } from '../../core/ime-guard'
import { registerCanvasCommands } from '../keyboard/commands'
import { paintOrder, reorderPatches } from '../../core/whiteboard-groups'
import { toggleHidden, toggleLock } from './layers-actions'
import { LAYER_ROW_PX, LAYER_VIRTUAL_AFTER, buildLayerRows, type LayerRow } from './layers-rows'
import { WHITEBOARD_LAYER_COMMANDS } from './layers-commands'
import { setLayersPanelOpen, useLayersPanelOpen } from './layers-store'

// The rows are registered once per window, however many canvases are mounted.
let registered = 0
let unregisterRows: (() => void) | null = null

function useLayerCommands(): void {
  useEffect(() => {
    registered += 1
    if (registered === 1) {
      unregisterRows = registerCanvasCommands(WHITEBOARD_LAYER_COMMANDS).unregister
    }
    return () => {
      registered -= 1
      if (registered === 0) {
        unregisterRows?.()
        unregisterRows = null
      }
    }
  }, [])
}

export function LayersPanel({ ctx }: { ctx: CanvasCtx }): React.JSX.Element | null {
  useLayerCommands()
  const open = useLayersPanelOpen()
  return open ? <LayersPanelBody ctx={ctx} /> : null
}

type DropHint = { key: string; place: 'above' | 'below' } | null

function LayersPanelBody({ ctx }: { ctx: CanvasCtx }): React.JSX.Element {
  const {
    arrows,
    onBatchUpdateStickyNotes,
    onUpdateArrow,
    onUpdateStickyNote,
    onWhiteboardTransaction,
    selectedArrowId,
    selectedStickyIdSet,
    setSelectedArrowId,
    setSelectedStickyIds,
    stickies,
    visibleGoals
  } = ctx
  const rows = useMemo(
    () => buildLayerRows(visibleGoals, stickies, arrows),
    [visibleGoals, stickies, arrows]
  )
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dropHint, setDropHint] = useState<DropHint>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(480)
  const dragIdsRef = useRef<string[] | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = listRef.current
    if (el && el.clientHeight > 0) {
      setViewH(el.clientHeight)
    }
  }, [])

  const virtual = rows.length > LAYER_VIRTUAL_AFTER
  const first = virtual ? Math.max(0, Math.floor(scrollTop / LAYER_ROW_PX) - 10) : 0
  const last = virtual
    ? Math.min(rows.length, Math.ceil((scrollTop + viewH) / LAYER_ROW_PX) + 10)
    : rows.length
  const shown = rows.slice(first, last)

  const stickyIdsOf = (row: LayerRow): string[] =>
    row.kind === 'group' ? row.memberIds : row.kind === 'sticky' ? [row.id] : []

  const select = (row: LayerRow, additive: boolean): void => {
    if (row.kind === 'arrow') {
      if (!row.hidden) {
        setSelectedStickyIds([])
        setSelectedArrowId(row.id)
      }
      return
    }
    if (row.kind !== 'group' && row.kind !== 'sticky') {
      return
    }
    // A hidden layer is listed but never selected (P3-37: never moved, copied or deleted by accident).
    const hidden = new Set(stickies.filter((s) => s.hidden).map((s) => s.id))
    const ids = stickyIdsOf(row).filter((id) => !hidden.has(id))
    if (ids.length === 0) {
      return
    }
    setSelectedArrowId(null)
    setSelectedStickyIds((cur) =>
      additive ? [...cur.filter((id) => !ids.includes(id)), ...ids] : ids
    )
  }

  const startRename = (row: LayerRow): void => {
    if (row.kind !== 'sticky' && row.kind !== 'arrow') {
      return
    }
    setRenaming(row.key)
    setDraft(row.label)
  }

  const commitRename = (row: LayerRow): void => {
    setRenaming(null)
    const name = draft.trim() || undefined
    if (row.kind === 'sticky') {
      if ((stickies.find((s) => s.id === row.id)?.name ?? undefined) !== name) {
        onUpdateStickyNote?.(row.id, { name })
      }
    } else if (row.kind === 'arrow') {
      if ((arrows.find((a) => a.id === row.id)?.name ?? undefined) !== name) {
        onUpdateArrow?.(row.id, { name })
      }
    }
  }

  const toggleEye = (row: LayerRow): void => {
    if (row.kind === 'arrow') {
      onUpdateArrow?.(row.id, { hidden: row.hidden ? undefined : true })
      if (!row.hidden && selectedArrowId === row.id) {
        setSelectedArrowId(null)
      }
      return
    }
    toggleHidden(ctx, stickyIdsOf(row))
  }

  const drop = (row: LayerRow, place: 'above' | 'below'): void => {
    const moving = dragIdsRef.current
    dragIdsRef.current = null
    setDropHint(null)
    const target = stickyIdsOf(row)
    if (!moving || target.length === 0) {
      return
    }
    // A group target: above its top member, or below its bottom member.
    const order = paintOrder(stickies).map((s) => s.id)
    const sorted = [...target].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    const targetId = (place === 'above' ? (sorted.at(-1) ?? sorted[0]) : sorted[0])!
    const result = reorderPatches(stickies, moving, targetId, place)
    if (result.ok && Object.keys(result.patches).length > 0) {
      const write = (): void => onBatchUpdateStickyNotes?.(result.patches)
      if (onWhiteboardTransaction) {
        onWhiteboardTransaction(write)
      } else {
        write()
      }
    }
  }

  const renderRow = (row: LayerRow): React.JSX.Element => {
    if (row.kind === 'section') {
      return (
        <div
          key={row.key}
          className="flex items-end px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          style={{ height: LAYER_ROW_PX }}
        >
          {row.label}
        </div>
      )
    }
    if (row.kind === 'goal') {
      return (
        <div
          key={row.key}
          role="treeitem"
          aria-readonly="true"
          data-whiteboard-layer-goal={row.id}
          title="Space (agent data: read only here)"
          className="flex items-center gap-1.5 truncate rounded-lg px-2 text-muted-foreground"
          style={{ height: LAYER_ROW_PX }}
        >
          <span className="truncate">{row.label}</span>
        </div>
      )
    }
    const isSelected =
      row.kind === 'arrow'
        ? selectedArrowId === row.id
        : stickyIdsOf(row).length > 0 && stickyIdsOf(row).every((id) => selectedStickyIdSet.has(id))
    const draggable = row.kind === 'sticky' || row.kind === 'group'
    const hint = dropHint?.key === row.key ? dropHint.place : null
    const locked = row.kind === 'arrow' ? false : row.locked
    return (
      <div
        key={row.key}
        role="treeitem"
        aria-selected={isSelected}
        data-whiteboard-layer={row.kind === 'group' ? `group:${row.groupId}` : row.id}
        draggable={draggable && renaming !== row.key}
        onDragStart={(event) => {
          dragIdsRef.current = stickyIdsOf(row)
          event.dataTransfer?.setData('text/plain', row.key)
        }}
        onDragOver={(event) => {
          if (!draggable || !dragIdsRef.current) {
            return
          }
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          const place = event.clientY - rect.top < rect.height / 2 ? 'above' : 'below'
          setDropHint((cur) =>
            cur?.key === row.key && cur.place === place ? cur : { key: row.key, place }
          )
        }}
        onDragLeave={() => setDropHint((cur) => (cur?.key === row.key ? null : cur))}
        onDrop={(event) => {
          event.preventDefault()
          drop(row, hint ?? 'above')
        }}
        onDragEnd={() => {
          dragIdsRef.current = null
          setDropHint(null)
        }}
        onClick={(event) => select(row, event.shiftKey)}
        onDoubleClick={() => startRename(row)}
        className={`group/layer flex items-center gap-1 rounded-lg pr-1 ${
          row.kind === 'sticky' && row.depth === 1 ? 'pl-6' : 'pl-2'
        } ${isSelected ? 'bg-sky-500/20 text-foreground' : 'text-foreground hover:bg-muted/60'} ${
          row.hidden ? 'opacity-50' : ''
        } ${hint === 'above' ? 'shadow-[inset_0_2px_0_#38bdf8]' : ''} ${
          hint === 'below' ? 'shadow-[inset_0_-2px_0_#38bdf8]' : ''
        }`}
        style={{ height: LAYER_ROW_PX }}
      >
        {row.kind === 'group' ? <Group className="size-3 shrink-0 text-muted-foreground" /> : null}
        {renaming === row.key ? (
          <input
            autoFocus
            value={draft}
            aria-label="Layer name"
            maxLength={120}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commitRename(row)}
            onKeyDown={(event) => {
              if (isImeOwnedKeyboardEvent(event)) {
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRename(row)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setRenaming(null)
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-border/60 bg-background px-1 text-xs outline-none focus:border-ring"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
        )}
        <button
          type="button"
          aria-label={row.hidden ? 'Show layer' : 'Hide layer'}
          title={row.hidden ? 'Show' : 'Hide'}
          onClick={(event) => {
            event.stopPropagation()
            toggleEye(row)
          }}
          className={`flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground ${
            row.hidden ? '' : 'opacity-0 group-hover/layer:opacity-100 focus-visible:opacity-100'
          }`}
        >
          {row.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
        </button>
        {row.kind === 'arrow' ? (
          <span className="size-5 shrink-0" />
        ) : (
          <button
            type="button"
            aria-label={locked ? 'Unlock layer' : 'Lock layer'}
            title={locked ? 'Unlock' : 'Lock'}
            onClick={(event) => {
              event.stopPropagation()
              toggleLock(ctx, stickyIdsOf(row))
            }}
            className={`flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground ${
              locked
                ? 'text-amber-300'
                : 'opacity-0 group-hover/layer:opacity-100 focus-visible:opacity-100'
            }`}
          >
            {locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-label="Layers"
      data-whiteboard-layers="true"
      data-orca-plus-scroll-lock="true"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !renaming) {
          event.preventDefault()
          setLayersPanelOpen(false)
        }
      }}
      className="absolute top-3 bottom-16 left-3 z-40 flex w-64 flex-col rounded-2xl border border-border/60 bg-card/95 p-1.5 text-xs shadow-lg backdrop-blur-md"
    >
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="font-semibold text-foreground">Layers</span>
        <kbd className="font-mono text-[10px] text-muted-foreground" title="⌥L or Esc closes">
          ⌥L
        </kbd>
      </div>
      <div
        ref={listRef}
        role="tree"
        data-space-scroll="true"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto"
      >
        {rows.length === 0 ? (
          <p className="px-2 py-2 text-muted-foreground">Nothing on this board yet.</p>
        ) : virtual ? (
          <div style={{ height: rows.length * LAYER_ROW_PX, position: 'relative' }}>
            <div style={{ position: 'absolute', top: first * LAYER_ROW_PX, left: 0, right: 0 }}>
              {shown.map(renderRow)}
            </div>
          </div>
        ) : (
          shown.map(renderRow)
        )}
      </div>
    </div>
  )
}
