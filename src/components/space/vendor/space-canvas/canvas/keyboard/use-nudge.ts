// WS-A (TASK_16 wave 2): arrow-key nudge of the selected notes / shapes / text, else the selected Space
// tile. 1 px, Shift = 10 px. A burst (keys pressed close together) = ONE undo entry through the
// onWhiteboardTransaction seam; writes are batched to one per animation frame (absolute positions from
// the burst's start, so a dropped frame never loses a step). Burst rules: penpot-mpl/nudge-burst.ts.
// Agent data: only sticky x/y and the tile `layout` are written (goal tiles may move, never anything else).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { SpaceCanvasNode } from '../../core/canvas-nodes'
import type { CanvasCtx } from '../canvas-ctx'
import type { SpaceLayout, SpaceStickyNote } from '../../core/space'
import {
  createNudgeBurst,
  nudgeVector,
  type NudgeBurst,
  type NudgeDirection
} from '../../penpot-mpl/nudge-burst'
import { movedTileLayout } from '../gestures/use-tile-gestures'

/** Our burst end: 500 ms after the last key-up (Penpot 250 ms), or 1 s with no press (held key). */
export const NUDGE_KEY_UP_GRACE_MS = 500

/** Open bursts by canvas (rootRef): the toolbar Undo / Redo close the burst before stepping history. */
const burstsByCanvas = new WeakMap<object, NudgeControl>()

/** Flush and close the canvas's open nudge burst (no-op when none). */
export function endNudgeBurst(rootRef: object): void {
  burstsByCanvas.get(rootRef)?.end()
}

export type NudgeControl = {
  /** One arrow press. False = nothing to nudge (the key is left to the page). */
  press: (direction: NudgeDirection, shift: boolean) => boolean
  keyUp: () => void
  /** Flush and close the open burst (any other command, blur, unmount). */
  end: () => void
}

type Burst = {
  signature: string
  stickies: Map<string, { x: number; y: number }>
  nodes: Map<string, { x: number; y: number }>
  tile: { key: string; layout: SpaceLayout } | null
  total: { x: number; y: number }
  raf: number | null
  /** A press since the last write (the end-of-burst flush skips a write that changes nothing). */
  dirty: boolean
  endTxn: (() => void) | null
}

type Targets = {
  signature: string
  stickies: SpaceStickyNote[]
  nodes: SpaceCanvasNode[]
  tile: { key: string; layout: SpaceLayout } | null
}

function targetsOf(ctx: CanvasCtx): Targets | null {
  if (ctx.editingStickyId) {
    return null
  }
  const stickies = ctx.effectiveSelectedIds
    .map((id) => ctx.stickiesById.get(id))
    .filter((s): s is SpaceStickyNote => Boolean(s) && !s?.locked)
  const nodes = ctx.effectiveSelectedNodeIds
    .map((id) => ctx.nodesById.get(id))
    .filter((n): n is SpaceCanvasNode => Boolean(n) && !n?.locked)
  if (ctx.effectiveSelectedIds.length > 0 || ctx.effectiveSelectedNodeIds.length > 0) {
    return stickies.length > 0 || nodes.length > 0
      ? {
          signature: `s:${stickies.map((s) => s.id).join(',')}|n:${nodes.map((n) => n.id).join(',')}`,
          stickies,
          nodes,
          tile: null
        }
      : null
  }
  const tile = ctx.selectedGoalId ? ctx.tiles.find((t) => t.key === ctx.selectedGoalId) : undefined
  if (!tile) {
    return null
  }
  return {
    signature: `t:${tile.key}`,
    stickies: [],
    nodes: [],
    tile: { key: tile.key, layout: { x: tile.x, y: tile.y, w: tile.w, h: tile.h } }
  }
}

const finiteOr = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback)

export function useNudge(ctx: CanvasCtx): NudgeControl {
  const ctxRef = useRef(ctx)
  useLayoutEffect(() => {
    ctxRef.current = ctx
  })
  const burstRef = useRef<Burst | null>(null)
  const pendingRef = useRef<Targets | null>(null)

  const control = useMemo(() => {
    const flush = (): void => {
      const b = burstRef.current
      if (!b) {
        return
      }
      b.raf = null
      if (!b.dirty) {
        return
      }
      b.dirty = false
      const { onBatchUpdateStickyNotes, onUpdateStickyNote, onUpdateNode, onMoveTile } =
        ctxRef.current
      const { x: dx, y: dy } = b.total
      if (b.stickies.size > 0) {
        const patches: Record<string, Partial<SpaceStickyNote>> = {}
        for (const [id, base] of b.stickies) {
          patches[id] = {
            x: Math.round(finiteOr(base.x + dx, base.x)),
            y: Math.round(finiteOr(base.y + dy, base.y))
          }
        }
        const ids = Object.keys(patches)
        if (onBatchUpdateStickyNotes) {
          onBatchUpdateStickyNotes(patches)
        } else {
          for (const id of ids) {
            const p = patches[id]
            if (p) {
              onUpdateStickyNote?.(id, p)
            }
          }
        }
      }
      if (b.nodes.size > 0) {
        for (const [id, base] of b.nodes) {
          onUpdateNode?.(id, {
            x: Math.round(finiteOr(base.x + dx, base.x)),
            y: Math.round(finiteOr(base.y + dy, base.y))
          })
        }
      }
      if (b.tile) {
        onMoveTile(b.tile.key, movedTileLayout(b.tile.layout, dx, dy))
      }
    }

    const burst: NudgeBurst = createNudgeBurst({
      keyUpMs: NUDGE_KEY_UP_GRACE_MS,
      onStart: () => {
        const t = pendingRef.current
        if (!t) {
          return
        }
        burstRef.current = {
          signature: t.signature,
          stickies: new Map(t.stickies.map((s) => [s.id, { x: s.x, y: s.y }])),
          nodes: new Map(t.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
          tile: t.tile,
          total: { x: 0, y: 0 },
          raf: null,
          dirty: false,
          endTxn: ctxRef.current.onWhiteboardTransaction?.() ?? null
        }
      },
      onEnd: () => {
        const b = burstRef.current
        if (!b) {
          return
        }
        if (b.raf !== null && typeof window !== 'undefined') {
          window.cancelAnimationFrame(b.raf)
        }
        flush()
        burstRef.current = null
        b.endTxn?.()
      }
    })

    const press = (direction: NudgeDirection, shift: boolean): boolean => {
      const targets = targetsOf(ctxRef.current)
      if (!targets) {
        burst.end()
        return false
      }
      if (burstRef.current && burstRef.current.signature !== targets.signature) {
        burst.end()
      }
      pendingRef.current = targets
      burst.press()
      const b = burstRef.current as Burst | null
      if (!b) {
        return false
      }
      const v = nudgeVector(direction, shift)
      b.total = { x: b.total.x + v.x, y: b.total.y + v.y }
      b.dirty = true
      if (b.raf === null) {
        b.raf = window.requestAnimationFrame(flush)
      }
      return true
    }
    return { press, keyUp: () => burst.keyUp(), end: () => burst.end() }
  }, [])

  const { rootRef } = ctx
  useEffect(() => {
    burstsByCanvas.set(rootRef, control)
    return () => {
      control.end()
      burstsByCanvas.delete(rootRef)
    }
  }, [control, rootRef])
  return control
}
