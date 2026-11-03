// WS-0 (TASK_16 wave 2): SpaceCanvas derived data (stickies, goals, agents per Space, tiles, box map),
// moved verbatim from space-canvas.tsx. Owner: WS-A (with canvas-ctx.ts).

import { useEffect, useMemo, useRef } from 'react'
import type { SpaceCanvasNode } from '../core/canvas-nodes'
import {
  BENCH_KEY,
  computeAutoTextDimensions,
  computeCardMinHeight,
  computeShapeDimensions,
  extraPresenceHeightForMembers,
  layoutSpaces,
  resolveAgentGoalId,
  type SpaceAgent,
  type SpaceGoal,
  type SpaceState,
  type SpaceStickyNote
} from '../core/space'
import type { BoxRect } from './canvas-ctx'
import type { CanvasState } from './use-canvas-state'

export type CanvasModelInput = {
  agents: readonly SpaceAgent[]
  space: SpaceState
  pendingEditStickyId: string | null
  onConsumePendingEditSticky?: () => void
}

export function useCanvasModel(
  { agents, space, pendingEditStickyId, onConsumePendingEditSticky }: CanvasModelInput,
  {
    selectedStickyIds,
    setSelectedStickyIds,
    selectedNodeIds,
    setEditingStickyId,
    setSelectedArrowId,
    tileOffset,
    tileSizeOverride,
    stickyOffset,
    stickySizeOverride,
    nodeOffset,
    multiNodeDragDelta,
    nodeSizeOverride
  }: CanvasState
) {
  useEffect(() => {
    if (pendingEditStickyId) {
      setSelectedStickyIds([pendingEditStickyId])
      setEditingStickyId(pendingEditStickyId)
      setSelectedArrowId(null)
      onConsumePendingEditSticky?.()
    }
  }, [
    onConsumePendingEditSticky,
    pendingEditStickyId,
    setEditingStickyId,
    setSelectedArrowId,
    setSelectedStickyIds
  ])

  const stickies = useMemo(() => space.stickies ?? [], [space.stickies])
  const stickiesById = useMemo(
    () => new Map<string, SpaceStickyNote>(stickies.map((s) => [s.id, s])),
    [stickies]
  )
  const sortedStickies = useMemo(
    () =>
      [...stickies].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.createdAt - b.createdAt),
    [stickies]
  )
  // WS-C: a hidden sticky is never selected (so never moved, copied, deleted or nudged from the canvas).
  const effectiveSelectedIds = useMemo(
    () => selectedStickyIds.filter((id) => stickiesById.has(id) && !stickiesById.get(id)?.hidden),
    [selectedStickyIds, stickiesById]
  )
  const selectedStickyIdSet = useMemo(() => new Set(effectiveSelectedIds), [effectiveSelectedIds])
  const singleSelectedStickyId =
    effectiveSelectedIds.length === 1 ? (effectiveSelectedIds[0] ?? null) : null
  const singleSelectedSticky = singleSelectedStickyId
    ? (stickiesById.get(singleSelectedStickyId) ?? null)
    : null
  const arrows = useMemo(() => space.arrows ?? [], [space.arrows])

  const nodes = useMemo(() => space.nodes ?? [], [space.nodes])
  const nodesById = useMemo(
    () => new Map<string, SpaceCanvasNode>(nodes.map((n) => [n.id, n])),
    [nodes]
  )
  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.createdAt - b.createdAt),
    [nodes]
  )
  const effectiveSelectedNodeIds = useMemo(
    () => selectedNodeIds.filter((id) => nodesById.has(id) && !nodesById.get(id)?.hidden),
    [nodesById, selectedNodeIds]
  )
  const selectedNodeIdSet = useMemo(
    () => new Set(effectiveSelectedNodeIds),
    [effectiveSelectedNodeIds]
  )

  const visibleGoals = useMemo(
    () => space.goals.filter((goal) => goal.status !== 'done'),
    [space.goals]
  )
  const goalsById = useMemo(
    () => new Map<string, SpaceGoal>(visibleGoals.map((goal) => [goal.id, goal])),
    [visibleGoals]
  )
  const validGoalIds = useMemo(() => new Set<string>(goalsById.keys()), [goalsById])
  const liveAgentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const agent of agents) {
      ids.add(agent.id)
      if (agent.unifiedTabId) {
        ids.add(agent.unifiedTabId)
      }
    }
    return ids
  }, [agents])

  const agentsBySpace = useMemo(() => {
    const map = new Map<string, SpaceAgent[]>()
    for (const goal of visibleGoals) {
      map.set(goal.id, [])
    }
    map.set(BENCH_KEY, [])
    for (const agent of agents) {
      const key = resolveAgentGoalId(space, agent, validGoalIds, liveAgentIds) ?? BENCH_KEY
      map.get(key)?.push(agent)
    }
    return map
  }, [agents, liveAgentIds, space, validGoalIds, visibleGoals])

  const tiles = useMemo(
    () =>
      layoutSpaces(
        visibleGoals,
        (key) => agentsBySpace.get(key)?.length ?? 0,
        space.bench,
        (key, width) => extraPresenceHeightForMembers(agentsBySpace.get(key) ?? [], width)
      ),
    [agentsBySpace, space.bench, visibleGoals]
  )

  const boxMap = useMemo(() => {
    const map = new Map<string, BoxRect>()
    for (const tile of tiles) {
      const off = tileOffset[tile.key]
      const sz = tileSizeOverride[tile.key]
      map.set(tile.key, {
        x: tile.x + (off?.x ?? 0),
        y: tile.y + (off?.y ?? 0),
        w: sz?.w ?? tile.w,
        h: sz?.h ?? tile.h
      })
    }
    for (const sticky of stickies) {
      // WS-C: a hidden sticky has no box: not hit-tested, not snapped to, no arrow end, no marquee.
      if (sticky.hidden) {
        continue
      }
      const off = stickyOffset[sticky.id]
      const sz = stickySizeOverride[sticky.id]
      const kind = sticky.kind ?? 'note'
      if (kind === 'shape') {
        const shapeType = sticky.shapeType ?? 'rounded'
        const font = sz?.fontSize ?? sticky.fontSize ?? 16
        const defaultW = shapeType === 'ellipse' || shapeType === 'diamond' ? 150 : 196
        const defaultH = shapeType === 'ellipse' || shapeType === 'diamond' ? 150 : 96
        const dims = computeShapeDimensions(
          sticky.text,
          font,
          sz?.w ?? (sticky.w || defaultW),
          sz?.h ?? (sticky.h || defaultH),
          shapeType
        )
        map.set(sticky.id, {
          x: sticky.x + (off?.x ?? 0),
          y: sticky.y + (off?.y ?? 0),
          w: dims.w,
          h: dims.h
        })
      } else if (kind === 'text') {
        const hasBg = Boolean(sticky.fillStyle && sticky.fillStyle !== 'none')
        const font = sz?.fontSize ?? sticky.fontSize ?? (hasBg ? 18 : 36)
        const autoDims = computeAutoTextDimensions(
          sticky.text,
          font,
          sz?.w ?? sticky.w ?? 220,
          sticky.autosize !== false,
          920,
          hasBg
        )
        map.set(sticky.id, {
          x: sticky.x + (off?.x ?? 0),
          y: sticky.y + (off?.y ?? 0),
          w: sz?.w ?? autoDims.w,
          h: sz?.h ?? autoDims.h
        })
      } else {
        const font = sz?.fontSize ?? sticky.fontSize ?? 14
        const cardW = sz?.w ?? (sticky.w || 220)
        const baseH = sz?.h ?? (sticky.h || 140)
        map.set(sticky.id, {
          x: sticky.x + (off?.x ?? 0),
          y: sticky.y + (off?.y ?? 0),
          w: cardW,
          h: sz?.h ?? computeCardMinHeight(sticky.text, font, cardW, baseH)
        })
      }
    }
    for (const node of nodes) {
      if (node.hidden) {
        continue
      }
      const sizeOvr = nodeSizeOverride?.id === node.id ? nodeSizeOverride : null
      const singleOff = nodeOffset?.id === node.id ? nodeOffset : null
      const groupOff =
        selectedNodeIdSet.has(node.id) && multiNodeDragDelta ? multiNodeDragDelta : null
      map.set(node.id, {
        x: (sizeOvr ? sizeOvr.x : node.x) + (singleOff?.dx ?? 0) + (groupOff?.x ?? 0),
        y: (sizeOvr ? sizeOvr.y : node.y) + (singleOff?.dy ?? 0) + (groupOff?.y ?? 0),
        w: sizeOvr ? sizeOvr.w : node.w,
        h: sizeOvr ? sizeOvr.h : node.h
      })
    }
    return map
  }, [
    multiNodeDragDelta,
    nodeOffset,
    nodeSizeOverride,
    nodes,
    selectedNodeIdSet,
    stickies,
    stickyOffset,
    stickySizeOverride,
    tileOffset,
    tileSizeOverride,
    tiles
  ])

  const boxMapRef = useRef<ReadonlyMap<string, BoxRect>>(boxMap)
  boxMapRef.current = boxMap
  return useMemo(
    () => ({
      stickies,
      stickiesById,
      sortedStickies,
      effectiveSelectedIds,
      selectedStickyIdSet,
      singleSelectedStickyId,
      singleSelectedSticky,
      arrows,
      nodes,
      nodesById,
      sortedNodes,
      effectiveSelectedNodeIds,
      selectedNodeIdSet,
      visibleGoals,
      goalsById,
      validGoalIds,
      liveAgentIds,
      agentsBySpace,
      tiles,
      boxMap,
      boxMapRef
    }),
    [
      stickies,
      stickiesById,
      sortedStickies,
      effectiveSelectedIds,
      selectedStickyIdSet,
      singleSelectedStickyId,
      singleSelectedSticky,
      arrows,
      nodes,
      nodesById,
      sortedNodes,
      effectiveSelectedNodeIds,
      selectedNodeIdSet,
      visibleGoals,
      goalsById,
      validGoalIds,
      liveAgentIds,
      agentsBySpace,
      tiles,
      boxMap,
      boxMapRef
    ]
  )
}

export type CanvasModel = ReturnType<typeof useCanvasModel>
