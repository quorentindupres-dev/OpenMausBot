import React, { useCallback, useRef, useState } from 'react'
import {
  createProjectCanvasNode,
  createSessionCanvasNode,
  patchCanvasNode,
  removeCanvasNode,
  upsertCanvasNode,
  type SpaceCanvasNode
} from './core/canvas-nodes'
import {
  BENCH_KEY,
  DEFAULT_SPACE_MODEL_ID,
  MAX_ARROWS,
  MAX_STICKIES,
  emptyWhiteboardHistory,
  newSpaceId,
  normalizeArrow,
  normalizeGoal,
  normalizeStickyNote,
  recordWhiteboardHistory,
  stepWhiteboardHistory,
  toCanvas,
  type Point,
  type SpaceAgent,
  type SpaceGoal,
  type SpaceLayout,
  type SpaceState,
  type SpaceStickyNote,
  type StickyColor,
  type WhiteboardHistory
} from './core/space'
import { remapCopiedGroups } from './core/whiteboard-groups'
import { AGENT_ROLE_ACCESSORIES } from './generated/a01-roles'
import type { SpaceCanvasHostAdapter } from './host-adapter'
import type { PendingA01Spawn } from './nodes/A01SpawnPopover'
import { PinnedSessionsLayer } from './pinned-sessions'
import {
  SpaceCanvas,
  type EndWhiteboardTransaction,
  type WhiteboardBatchAdd,
  type WhiteboardBatchAddResult
} from './space-canvas'
import { useSpaceDrag, type DragItem, type DropTarget } from './space-drag'
import type { ToolbarToolMode } from './whiteboard-toolbar'

/**
 * Batteries-included stateful/controlled wrapper over `<SpaceCanvas />`.
 * Wires Undo/Redo (`WhiteboardHistory`), transactions, pointer drag-and-drop (`useSpaceDrag`),
 * Sticky/Shape/Text/Arrow CRUD, Session/Agent/Project node CRUD, and Pinned Floating Face Squares.
 */
export function SpaceWhiteboard({
  space,
  onChangeSpace,
  agents = [],
  host,
  dark = true,
  showProjectHeader = true,
  showPinnedLayer = true,
  onSelectAgent,
  onOpenGoal,
  className = 'relative flex h-full w-full flex-col overflow-hidden'
}: {
  space: SpaceState
  onChangeSpace: (updater: SpaceState | ((prev: SpaceState) => SpaceState)) => void
  agents?: readonly SpaceAgent[]
  host?: SpaceCanvasHostAdapter
  dark?: boolean
  showProjectHeader?: boolean
  showPinnedLayer?: boolean
  onSelectAgent?: (agentId: string) => void
  onOpenGoal?: (goal: SpaceGoal) => void
  className?: string
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const spaceRef = useRef(space)
  spaceRef.current = space

  const [history, setHistory] = useState<WhiteboardHistory>(emptyWhiteboardHistory)
  const historyRef = useRef(history)
  historyRef.current = history
  const [toolMode, setToolMode] = useState<ToolbarToolMode>('select')
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_SPACE_MODEL_ID)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [inspectedAgentId, setInspectedAgentId] = useState<string | null>(null)
  const [pendingEditStickyId, setPendingEditStickyId] = useState<string | null>(null)
  const [pendingSpawnRequest, setPendingSpawnRequest] = useState<PendingA01Spawn | null>(null)

  const txnDepthRef = useRef(0)
  const txnRecordedRef = useRef(false)

  const pushHistory = useCallback((coalesceStickyId?: string): void => {
    const inTxn = txnDepthRef.current > 0
    if (inTxn && txnRecordedRef.current) {
      return
    }
    if (inTxn) {
      txnRecordedRef.current = true
    }
    const nextHistory = recordWhiteboardHistory(
      historyRef.current,
      spaceRef.current,
      Date.now(),
      coalesceStickyId
    )
    historyRef.current = nextHistory
    setHistory(nextHistory)
  }, [])

  const mutate = useCallback(
    (fn: (prev: SpaceState) => SpaceState, opts?: { coalesceStickyId?: string }): void => {
      pushHistory(opts?.coalesceStickyId)
      const prev = spaceRef.current
      const computed = { ...fn(prev), rev: (prev.rev ?? 0) + 1 }
      spaceRef.current = computed
      onChangeSpace(computed)
    },
    [onChangeSpace, pushHistory]
  )

  const onWhiteboardTransaction = useCallback((fn?: () => void): EndWhiteboardTransaction => {
    txnDepthRef.current += 1
    let active = true
    const end = (): void => {
      if (!active) {
        return
      }
      active = false
      txnDepthRef.current = Math.max(0, txnDepthRef.current - 1)
      if (txnDepthRef.current === 0) {
        txnRecordedRef.current = false
      }
    }
    if (fn) {
      try {
        fn()
      } finally {
        end()
      }
    }
    return end
  }, [])

  const handleUndo = useCallback((): void => {
    const stepped = stepWhiteboardHistory(historyRef.current, spaceRef.current, 'undo')
    if (!stepped) {
      return
    }
    historyRef.current = stepped.history
    spaceRef.current = stepped.space
    setHistory(stepped.history)
    onChangeSpace(stepped.space)
  }, [onChangeSpace])

  const handleRedo = useCallback((): void => {
    const stepped = stepWhiteboardHistory(historyRef.current, spaceRef.current, 'redo')
    if (!stepped) {
      return
    }
    historyRef.current = stepped.history
    spaceRef.current = stepped.space
    setHistory(stepped.history)
    onChangeSpace(stepped.space)
  }, [onChangeSpace])

  const screenToCanvasPoint = useCallback((screenPt: Point): Point => {
    const canvasEl = containerRef.current?.querySelector<HTMLElement>('[data-space-canvas]')
    if (!canvasEl) {
      return { x: 180, y: 140 }
    }
    const rect = canvasEl.getBoundingClientRect()
    const vx = Number(canvasEl.getAttribute('data-view-x') ?? 0)
    const vy = Number(canvasEl.getAttribute('data-view-y') ?? 0)
    const vs = Number(canvasEl.getAttribute('data-view-scale') ?? 1)
    return toCanvas(
      { x: screenPt.x - rect.left, y: screenPt.y - rect.top },
      { x: vx, y: vy, scale: vs || 1 }
    )
  }, [])

  const handlePointerDrop = useCallback(
    (item: DragItem, over: DropTarget, point: Point): void => {
      if (!over) {
        return
      }
      if (item.kind === 'bot') {
        if (over.kind === 'tile') {
          mutate((s) => ({
            ...s,
            placements: { ...s.placements, [item.botId]: over.key }
          }))
        } else if (over.kind === 'bench' || over.kind === 'palette-remove') {
          mutate((s) => {
            const next = { ...s.placements }
            delete next[item.botId]
            return { ...s, placements: next }
          })
        }
        return
      }
      const canvasPt = screenToCanvasPoint(point)
      if (item.kind === 'space' && over.kind === 'canvas') {
        const created = normalizeGoal({
          id: newSpaceId('goal'),
          title: 'New Space',
          level: item.level,
          layout: {
            x: Math.round(canvasPt.x - 170),
            y: Math.round(canvasPt.y - 110),
            w: 360,
            h: 240
          },
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
        mutate((s) => ({ ...s, goals: [...s.goals, created] }))
        setSelectedGoalId(created.id)
        return
      }
      if (item.kind === 'session' && over.kind === 'canvas') {
        const node = createSessionCanvasNode(
          {
            ...item.session,
            projectSlug:
              item.session.projectSlug ?? spaceRef.current.projectSlug ?? host?.activeProjectSlug
          },
          { x: canvasPt.x - 160, y: canvasPt.y - 88 },
          newSpaceId
        )
        mutate((s) => ({ ...s, nodes: upsertCanvasNode(s.nodes, node) }))
        return
      }
      if (item.kind === 'project' && over.kind === 'canvas') {
        const node = createProjectCanvasNode(
          item.project,
          { x: canvasPt.x - 162, y: canvasPt.y - 98 },
          newSpaceId
        )
        mutate((s) => ({ ...s, nodes: upsertCanvasNode(s.nodes, node) }))
        return
      }
      if (item.kind === 'a01-role' && over.kind === 'canvas') {
        setPendingSpawnRequest({
          roleId: item.roleId,
          position: { x: Math.round(canvasPt.x - 156), y: Math.round(canvasPt.y - 92) }
        })
      }
    },
    [host?.activeProjectSlug, mutate, screenToCanvasPoint]
  )

  const { drag, ghostRef, startDrag } = useSpaceDrag(handlePointerDrop)

  const handleAddStickyNote = useCallback(
    (
      point?: Point,
      color: StickyColor = 'amber',
      kind: 'note' | 'text' | 'shape' = 'note',
      initialText = '',
      options?: Partial<SpaceStickyNote>
    ): string => {
      const id = newSpaceId('sticky')
      const sticky = normalizeStickyNote({
        id,
        text: initialText,
        color,
        kind,
        x: point?.x ?? 180,
        y: point?.y ?? 140,
        w: options?.w ?? (kind === 'shape' ? 180 : 220),
        h: options?.h ?? (kind === 'shape' ? 100 : 160),
        ...options,
        createdAt: Date.now()
      })
      if (sticky) {
        mutate((s) => ({
          ...s,
          stickies: [...(s.stickies ?? []), sticky].slice(0, MAX_STICKIES)
        }))
      }
      return id
    },
    [mutate]
  )

  const handleBatchAddWhiteboard = useCallback(
    (items: WhiteboardBatchAdd): WhiteboardBatchAddResult => {
      const stickyIds: string[] = []
      const arrowIds: string[] = []
      let droppedStickies = 0
      let droppedArrows = 0
      const keyMap = new Map<string, string>()

      mutate((s) => {
        const curStickies = [...(s.stickies ?? [])]
        const curArrows = [...(s.arrows ?? [])]
        for (const raw of items.stickies ?? []) {
          if (curStickies.length >= MAX_STICKIES) {
            droppedStickies += 1
            continue
          }
          const minted = newSpaceId('sticky')
          if (raw.id) {
            keyMap.set(raw.id, minted)
          }
          const built = normalizeStickyNote({ ...raw, id: minted, createdAt: Date.now() })
          if (built) {
            curStickies.push(built)
            stickyIds.push(minted)
          }
        }
        for (const raw of items.arrows ?? []) {
          if (curArrows.length >= MAX_ARROWS) {
            droppedArrows += 1
            continue
          }
          const minted = newSpaceId('arrow')
          const built = normalizeArrow({
            ...raw,
            id: minted,
            fromId: raw.fromId ? (keyMap.get(raw.fromId) ?? raw.fromId) : undefined,
            toId: raw.toId ? (keyMap.get(raw.toId) ?? raw.toId) : undefined,
            createdAt: Date.now()
          })
          if (built) {
            curArrows.push(built)
            arrowIds.push(minted)
          }
        }
        return { ...s, stickies: curStickies, arrows: curArrows }
      })
      return { stickyIds, arrowIds, droppedStickies, droppedArrows }
    },
    [mutate]
  )

  return (
    <div ref={containerRef} className={className}>
      <SpaceCanvas
        agents={agents}
        space={space}
        host={host}
        dark={dark}
        showProjectHeader={showProjectHeader}
        selectedGoalId={selectedGoalId}
        inspectedAgentId={inspectedAgentId}
        drag={drag}
        toolMode={toolMode}
        onChangeToolMode={setToolMode}
        selectedModelId={selectedModelId}
        onSelectModelId={setSelectedModelId}
        onStartDrag={startDrag}
        onSelectAgent={(id) => {
          setInspectedAgentId(id)
          onSelectAgent?.(id)
        }}
        onOpenGoal={(goal) => {
          setSelectedGoalId(goal.id)
          onOpenGoal?.(goal)
        }}
        onCreateSpaceAt={(level, pointOrLayout) => {
          const layout: SpaceLayout =
            pointOrLayout && 'w' in pointOrLayout
              ? pointOrLayout
              : {
                  x: Math.round((pointOrLayout?.x ?? 200) - 170),
                  y: Math.round((pointOrLayout?.y ?? 140) - 110),
                  w: 360,
                  h: 240
                }
          const goal = normalizeGoal({
            id: newSpaceId('goal'),
            title: 'New Space',
            level,
            layout,
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
          mutate((s) => ({ ...s, goals: [...s.goals, goal] }))
          setSelectedGoalId(goal.id)
          return goal
        }}
        onRenameGoal={(goalId, title) =>
          mutate((s) => ({
            ...s,
            goals: s.goals.map((g) =>
              g.id === goalId ? { ...g, title, updatedAt: Date.now() } : g
            )
          }))
        }
        onChangeGoalEmoji={(goalId, emoji) =>
          mutate((s) => ({
            ...s,
            goals: s.goals.map((g) =>
              g.id === goalId ? { ...g, emoji, updatedAt: Date.now() } : g
            )
          }))
        }
        onUpdateGoal={(goalId, patch) =>
          mutate((s) => ({
            ...s,
            goals: s.goals.map((g) =>
              g.id === goalId ? { ...g, ...patch, updatedAt: Date.now() } : g
            )
          }))
        }
        onRegisterCustomEmoji={(emoji) =>
          mutate((s) => ({
            ...s,
            customEmojis: [...new Set([emoji, ...(s.customEmojis ?? [])])].slice(0, 48)
          }))
        }
        onGoalMenu={(goal) => setSelectedGoalId(goal.id)}
        onContextCreate={(_screenPt, canvasPt) => {
          const id = handleAddStickyNote(canvasPt, 'amber', 'note', '')
          setPendingEditStickyId(id)
        }}
        onMoveTile={(key, layout) => {
          if (key === BENCH_KEY) {
            mutate((s) => ({ ...s, bench: layout }))
            return
          }
          mutate((s) => ({
            ...s,
            goals: s.goals.map((g) => (g.id === key ? { ...g, layout } : g))
          }))
        }}
        onAddStickyNote={handleAddStickyNote}
        onUpdateStickyNote={(id, patch) => {
          const isTextOnly = Object.keys(patch).every((k) => k === 'text')
          mutate(
            (s) => ({
              ...s,
              stickies: (s.stickies ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n))
            }),
            isTextOnly ? { coalesceStickyId: id } : undefined
          )
        }}
        onDeleteStickyNote={(id) =>
          mutate((s) => ({
            ...s,
            stickies: (s.stickies ?? []).filter((n) => n.id !== id),
            arrows: (s.arrows ?? []).filter((a) => a.fromId !== id && a.toId !== id)
          }))
        }
        onBatchUpdateStickyNotes={(patches) =>
          mutate((s) => ({
            ...s,
            stickies: (s.stickies ?? []).map((n) =>
              patches[n.id] ? { ...n, ...patches[n.id] } : n
            )
          }))
        }
        onBatchDeleteStickyNotes={(ids) => {
          const drop = new Set(ids)
          mutate((s) => ({
            ...s,
            stickies: (s.stickies ?? []).filter((n) => !drop.has(n.id)),
            arrows: (s.arrows ?? []).filter(
              (a) => !(a.fromId && drop.has(a.fromId)) && !(a.toId && drop.has(a.toId))
            )
          }))
        }}
        onDuplicateStickyNote={(id, delta = { x: 24, y: 24 }) => {
          const src = spaceRef.current.stickies?.find((n) => n.id === id)
          if (!src) {
            return null
          }
          const copyId = newSpaceId('sticky')
          const copy: SpaceStickyNote = {
            ...src,
            id: copyId,
            locked: false,
            x: Math.round(src.x + delta.x),
            y: Math.round(src.y + delta.y),
            createdAt: Date.now()
          }
          mutate((s) => ({
            ...s,
            stickies: [...(s.stickies ?? []), copy].slice(0, MAX_STICKIES)
          }))
          return copyId
        }}
        onBatchDuplicateStickyNotes={(ids, delta = { x: 24, y: 24 }) => {
          const srcList = (spaceRef.current.stickies ?? []).filter((n) => ids.includes(n.id))
          if (srcList.length === 0) {
            return []
          }
          const remapped = remapCopiedGroups(srcList, () => newSpaceId('grp'))
          const copies = remapped.map((item) => ({
            ...item,
            id: newSpaceId('sticky'),
            locked: false,
            x: Math.round(item.x + delta.x),
            y: Math.round(item.y + delta.y),
            createdAt: Date.now()
          }))
          mutate((s) => ({
            ...s,
            stickies: [...(s.stickies ?? []), ...copies].slice(0, MAX_STICKIES)
          }))
          return copies.map((c) => c.id)
        }}
        onAddArrow={(arrow) => {
          const built = normalizeArrow({
            ...arrow,
            id: newSpaceId('arrow'),
            createdAt: Date.now()
          })
          if (built) {
            mutate((s) => ({
              ...s,
              arrows: [...(s.arrows ?? []), built].slice(0, MAX_ARROWS)
            }))
          }
        }}
        onUpdateArrow={(id, patch) =>
          mutate((s) => ({
            ...s,
            arrows: (s.arrows ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a))
          }))
        }
        onDeleteArrow={(id) =>
          mutate((s) => ({
            ...s,
            arrows: (s.arrows ?? []).filter((a) => a.id !== id)
          }))
        }
        onAddNode={(node: SpaceCanvasNode) =>
          mutate((s) => ({ ...s, nodes: upsertCanvasNode(s.nodes, node) }))
        }
        onUpdateNode={(nodeId, patch) =>
          mutate((s) => ({ ...s, nodes: patchCanvasNode(s.nodes, nodeId, patch) }))
        }
        onDeleteNode={(nodeId) =>
          mutate((s) => ({
            ...s,
            nodes: removeCanvasNode(s.nodes, nodeId),
            arrows: (s.arrows ?? []).filter((a) => a.fromId !== nodeId && a.toId !== nodeId)
          }))
        }
        onSelectSpaceProject={(projectSlug) => mutate((s) => ({ ...s, projectSlug }))}
        pendingSpawnRequest={pendingSpawnRequest}
        onConsumePendingSpawnRequest={() => setPendingSpawnRequest(null)}
        onWhiteboardTransaction={onWhiteboardTransaction}
        onBatchAddWhiteboard={handleBatchAddWhiteboard}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        pendingEditStickyId={pendingEditStickyId}
        onConsumePendingEditSticky={() => setPendingEditStickyId(null)}
      />

      {drag && (
        <div
          ref={ghostRef}
          style={{
            transform: `translate3d(${drag.point.x + 14}px, ${drag.point.y + 14}px, 0)`
          }}
          className="pointer-events-none fixed top-0 left-0 z-50 rounded-xl border border-indigo-400/50 bg-zinc-900/95 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-xl"
        >
          {drag.item.kind === 'a01-role'
            ? `Spawn ${AGENT_ROLE_ACCESSORIES[drag.item.roleId].label}`
            : drag.item.kind === 'session'
              ? `Session · ${drag.item.session.title}`
              : drag.item.kind === 'project'
                ? `C02 · ${drag.item.project.title}`
                : drag.item.kind === 'space'
                  ? `New ${drag.item.level} Space`
                  : 'Move Agent'}
        </div>
      )}

      {showPinnedLayer && (
        <PinnedSessionsLayer
          agents={agents}
          space={space}
          dark={dark}
          onActivate={(tabId: string) => host?.onOpenSession?.(tabId, 'orca-agent')}
        />
      )}
    </div>
  )
}
