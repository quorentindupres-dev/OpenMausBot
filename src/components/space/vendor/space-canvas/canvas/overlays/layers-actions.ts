// WS-C (TASK_16 wave 2): group / ungroup / hide / lock on the Spaces whiteboard, bound to the canvas.
// The pure rules live in shared/orca-plus/whiteboard-groups.ts; this file applies their patches in ONE
// onBatchUpdateStickyNotes write inside onWhiteboardTransaction (= one undo entry) and keeps the canvas
// selection honest (a hidden sticky leaves the selection).
//
// Public API for WS-E's context menu and WS-B's box. Every action takes the CanvasCtx (or the subset
// below) and an optional id list (default: the current sticky selection) and returns a result:
//   groupSelection(ctx, ids?)    ⌘G   2+ stickies -> one new group
//   ungroupSelection(ctx, ids?)  ⇧⌘G  every group touched is dissolved
//   toggleHidden(ctx, ids?)      ⇧⌘H  any visible -> hide all, else show all
//   toggleLock(ctx, ids?)        ⌘L   any unlocked -> lock all, else unlock all
//   whiteboardActionState(ctx, ids?) -> { canGroup, canUngroup, hideLabel, lockLabel } for menu rows
// Agent data rule: goal ids (and any non-sticky id) are refused; asks, tasks, notes, placements and
// removedAskIds are never touched (only stickies are patched).
import type { CanvasCtx } from '../canvas-ctx'
import {
  groupIndex,
  groupStickies,
  toggleHiddenPatches,
  toggleLockPatches,
  ungroupStickies,
  type PatchResult,
  type WhiteboardRefusal
} from '../../core/whiteboard-groups'

export type WhiteboardActionCtx = Pick<
  CanvasCtx,
  | 'space'
  | 'stickies'
  | 'effectiveSelectedIds'
  | 'onBatchUpdateStickyNotes'
  | 'onWhiteboardTransaction'
  | 'setSelectedStickyIds'
  | 'setEditingStickyId'
>

export type WhiteboardActionResult =
  | { ok: true; changed: number; groupId?: string }
  | { ok: false; reason: WhiteboardRefusal; ids: string[] }

function goalCheck(ctx: WhiteboardActionCtx): (id: string) => boolean {
  const goalIds = new Set(ctx.space.goals.map((goal) => goal.id))
  return (id) => goalIds.has(id)
}

/** One write, one undo entry (the transaction also covers a board that records per write). */
function applyPatches(ctx: WhiteboardActionCtx, result: PatchResult): WhiteboardActionResult {
  if (!result.ok) {
    return result
  }
  const changed = Object.keys(result.patches).length
  if (changed > 0 && ctx.onBatchUpdateStickyNotes) {
    const write = (): void => ctx.onBatchUpdateStickyNotes?.(result.patches)
    if (ctx.onWhiteboardTransaction) {
      ctx.onWhiteboardTransaction(write)
    } else {
      write()
    }
  }
  return { ok: true, changed, ...(result.groupId ? { groupId: result.groupId } : {}) }
}

export function groupSelection(
  ctx: WhiteboardActionCtx,
  ids: readonly string[] = ctx.effectiveSelectedIds
): WhiteboardActionResult {
  return applyPatches(ctx, groupStickies(ctx.stickies, ids, goalCheck(ctx)))
}

export function ungroupSelection(
  ctx: WhiteboardActionCtx,
  ids: readonly string[] = ctx.effectiveSelectedIds
): WhiteboardActionResult {
  return applyPatches(ctx, ungroupStickies(ctx.stickies, ids, goalCheck(ctx)))
}

export function toggleHidden(
  ctx: WhiteboardActionCtx,
  ids: readonly string[] = ctx.effectiveSelectedIds
): WhiteboardActionResult {
  const result = toggleHiddenPatches(ctx.stickies, ids, goalCheck(ctx))
  const out = applyPatches(ctx, result)
  if (result.ok) {
    const nowHidden = new Set(
      Object.entries(result.patches)
        .filter(([, patch]) => patch.hidden === true)
        .map(([id]) => id)
    )
    if (nowHidden.size > 0) {
      ctx.setSelectedStickyIds((cur) => cur.filter((id) => !nowHidden.has(id)))
      ctx.setEditingStickyId((cur) => (cur && nowHidden.has(cur) ? null : cur))
    }
  }
  return out
}

export function toggleLock(
  ctx: WhiteboardActionCtx,
  ids: readonly string[] = ctx.effectiveSelectedIds
): WhiteboardActionResult {
  return applyPatches(ctx, toggleLockPatches(ctx.stickies, ids, goalCheck(ctx)))
}

/** What a menu shows for `ids` (enabled rows and the toggle labels). */
export function whiteboardActionState(
  ctx: Pick<WhiteboardActionCtx, 'stickies' | 'effectiveSelectedIds'>,
  ids: readonly string[] = ctx.effectiveSelectedIds
): {
  canGroup: boolean
  canUngroup: boolean
  hideLabel: 'Hide' | 'Show'
  lockLabel: 'Lock' | 'Unlock'
} {
  const byId = new Map(ctx.stickies.map((s) => [s.id, s]))
  const picked = ids.flatMap((id) => {
    const s = byId.get(id)
    return s ? [s] : []
  })
  const live = groupIndex(ctx.stickies)
  return {
    canGroup: picked.length >= 2 && picked.length === ids.length,
    canUngroup: picked.some((s) => s.groupId !== undefined && live.has(s.groupId)),
    hideLabel: picked.length > 0 && picked.every((s) => s.hidden) ? 'Show' : 'Hide',
    lockLabel: picked.length > 0 && picked.every((s) => s.locked) ? 'Unlock' : 'Lock'
  }
}
