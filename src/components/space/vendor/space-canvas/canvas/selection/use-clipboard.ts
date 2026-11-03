import { useEffect, useRef } from 'react'
import { MAX_STICKIES, type Point, type SpaceStickyNote } from '../../core/space'
import {
  buildClipboardPayload,
  clipRefusalMessage,
  parseClipboardPayload,
  planPaste,
  textToPayload,
  WHITEBOARD_CLIP_MIME,
  WHITEBOARD_CLIP_WEB_MIME,
  type ClipParse
} from '../../core/whiteboard-clipboard'
import type { CanvasCtx } from '../canvas-ctx'
import { isTypingTarget } from '../keyboard/typing-target'

export function useClipboardBuffer(): {
  copiedStickiesRef: React.MutableRefObject<SpaceStickyNote[]>
  pasteCountRef: React.MutableRefObject<number>
} {
  const copiedStickiesRef = useRef<SpaceStickyNote[]>([])
  const pasteCountRef = useRef(0)
  return { copiedStickiesRef, pasteCountRef }
}

export type ClipboardCtx = Pick<
  CanvasCtx,
  | 'space'
  | 'stickies'
  | 'arrows'
  | 'effectiveSelectedIds'
  | 'editingStickyId'
  | 'onNotify'
  | 'onBatchAddWhiteboard'
  | 'setSelectedStickyIds'
  | 'setSelectedArrowId'
>

let memory: { text: string; json: string } | null = null
let pasteCount = 0
let pointer: { x: number; y: number } | null = null
let pending: { ctx: ClipboardCtx; at: Point | null; timer: ReturnType<typeof setTimeout> } | null =
  null

export function resetWhiteboardClipboard(): void {
  memory = null
  pasteCount = 0
  pointer = null
  if (pending) {
    clearTimeout(pending.timer)
  }
  pending = null
}

export function whiteboardClipboardMemory(): { text: string; json: string } | null {
  return memory
}

function writeViaCopyEvent(text: string, json: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false
  }
  let wrote = false
  const onCopy = (event: ClipboardEvent): void => {
    if (!event.clipboardData) {
      return
    }
    event.clipboardData.setData('text/plain', text)
    event.clipboardData.setData(WHITEBOARD_CLIP_MIME, json)
    event.preventDefault()
    event.stopImmediatePropagation()
    wrote = true
  }
  document.addEventListener('copy', onCopy, true)
  try {
    document.execCommand('copy')
  } catch {
    // ok: older DOM implementations throw on execCommand('copy')
    wrote = false
  } finally {
    document.removeEventListener('copy', onCopy, true)
  }
  return wrote
}

async function writeViaClipboardApi(text: string, json: string): Promise<void> {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
  const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
  if (clip?.write && Item) {
    try {
      await clip.write([
        new Item({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          [WHITEBOARD_CLIP_WEB_MIME]: new Blob([json], { type: WHITEBOARD_CLIP_MIME })
        })
      ])
      return
    } catch {
      // ok: custom web MIME rejected or permission denied; fall back to writeText
      // Fallback below
    }
  }
  try {
    await clip?.writeText?.(text)
  } catch {
    // ok: clipboard write blocked in headless/jsdom; in-memory buffer still works
    // In-memory buffer handles same-window paste
  }
}

export function copyWhiteboardSelection(
  ctx: ClipboardCtx,
  ids: readonly string[] = ctx.effectiveSelectedIds
): boolean {
  const goalIds = new Set(ctx.space.goals.map((g) => g.id))
  const built = buildClipboardPayload(ctx.stickies, ctx.arrows, ids, goalIds)
  if (!built.ok) {
    if (built.reason !== 'empty') {
      ctx.onNotify?.(clipRefusalMessage(built.reason))
    }
    return built.reason !== 'empty'
  }
  memory = { text: built.text, json: built.json }
  pasteCount = 0
  if (!writeViaCopyEvent(built.text, built.json)) {
    void writeViaClipboardApi(built.text, built.json)
  }
  return true
}

export function pasteWhiteboardPayload(
  ctx: ClipboardCtx,
  parsed: ClipParse,
  at: Point | null = null
): boolean {
  if (!parsed.ok) {
    if (parsed.reason !== 'not-ours') {
      ctx.onNotify?.(clipRefusalMessage(parsed.reason))
    }
    return false
  }
  if (!ctx.onBatchAddWhiteboard) {
    ctx.onNotify?.('Paste is not available on this board.')
    return false
  }
  const room = MAX_STICKIES - (ctx.space.stickies?.length ?? 0)
  if (!at) {
    pasteCount += 1
  }
  const step = 28 * pasteCount
  const plan = planPaste(parsed.payload, { at, offset: { x: step, y: step }, room })
  if (plan.stickies.length === 0) {
    ctx.onNotify?.(`Not pasted: the board already holds ${MAX_STICKIES} notes.`)
    return false
  }
  const result = ctx.onBatchAddWhiteboard({ stickies: plan.stickies, arrows: plan.arrows })
  const dropped = plan.dropped + result.droppedStickies
  if (dropped > 0) {
    ctx.onNotify?.(
      `${dropped} note${dropped === 1 ? '' : 's'} not pasted: a board holds ${MAX_STICKIES}.`
    )
  }
  if (result.stickyIds.length > 0) {
    ctx.setSelectedStickyIds(result.stickyIds)
    ctx.setSelectedArrowId(null)
  }
  return result.stickyIds.length > 0
}

export function pasteFromClipboardData(
  ctx: ClipboardCtx,
  data: { json?: string | null; text?: string | null },
  at: Point | null = null
): boolean {
  if (data.json) {
    return pasteWhiteboardPayload(ctx, parseClipboardPayload(data.json), at)
  }
  const text = data.text ?? ''
  if (memory && text && text === memory.text) {
    return pasteWhiteboardPayload(ctx, parseClipboardPayload(memory.json), at)
  }
  return pasteWhiteboardPayload(ctx, textToPayload(text), at)
}

async function readClipboardFallback(): Promise<{ json: string | null; text: string | null }> {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
  let json: string | null = null
  let text: string | null = null
  try {
    for (const item of (await clip?.read?.()) ?? []) {
      if (item.types.includes(WHITEBOARD_CLIP_WEB_MIME)) {
        json = await (await item.getType(WHITEBOARD_CLIP_WEB_MIME)).text()
      }
    }
  } catch {
    // ok: clipboard.read unsupported or permission denied; try readText below
    json = null
  }
  if (typeof clip?.readText === 'function') {
    try {
      text = await clip.readText()
    } catch {
      // ok: clipboard.readText denied; fall back to in-memory buffer if present
      text = memory?.text ?? null
    }
  } else {
    text = memory?.text ?? null
  }
  return { json, text }
}

function finishPending(data: { json?: string | null; text?: string | null } | null): void {
  const job = pending
  if (!job) {
    return
  }
  clearTimeout(job.timer)
  pending = null
  if (data) {
    pasteFromClipboardData(job.ctx, data, job.at)
    return
  }
  void readClipboardFallback().then((read) => pasteFromClipboardData(job.ctx, read, job.at))
}

export function requestWhiteboardPaste(ctx: ClipboardCtx, at: Point | null = null): void {
  if (pending) {
    clearTimeout(pending.timer)
  }
  pending = { ctx, at, timer: setTimeout(() => finishPending(null), 50) }
  finishPending(null)
}

export function pointerCanvasPoint(ctx: Pick<CanvasCtx, 'clientToCanvasPoint'>): Point | null {
  return pointer ? ctx.clientToCanvasPoint(pointer.x, pointer.y) : null
}

export function useWhiteboardClipboard(ctx: CanvasCtx): void {
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const { rootRef } = ctx
  useEffect(() => {
    const root = rootRef.current
    const onMove = (event: PointerEvent): void => {
      pointer = { x: event.clientX, y: event.clientY }
    }
    const onLeave = (): void => {
      pointer = null
    }
    const onPaste = (event: ClipboardEvent): void => {
      const target = event.target as HTMLElement | null
      const onCanvas =
        target === document.body ||
        target === document.documentElement ||
        Boolean(root && target && root.contains(target))
      if (!onCanvas || isTypingTarget(target) || ctxRef.current.editingStickyId) {
        return
      }
      const data = event.clipboardData
      const json = data?.getData(WHITEBOARD_CLIP_MIME) || null
      const text = data?.getData('text/plain') || null
      if (!pending && !json && !text) {
        return
      }
      event.preventDefault()
      if (pending) {
        finishPending({ json, text })
      } else {
        pasteFromClipboardData(ctxRef.current, { json, text }, pointerCanvasPoint(ctxRef.current))
      }
    }
    root?.addEventListener('pointermove', onMove)
    root?.addEventListener('pointerleave', onLeave)
    document.addEventListener('paste', onPaste)
    return () => {
      root?.removeEventListener('pointermove', onMove)
      root?.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('paste', onPaste)
    }
  }, [rootRef])
}
