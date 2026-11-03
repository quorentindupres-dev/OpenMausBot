import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, ExternalLink, Minimize2, PinOff } from 'lucide-react'
import { passedDragThreshold, passedResizeThreshold } from '../penpot-mpl/drag-threshold'
import { HANDLERS, type Handler } from '../penpot-mpl/resize-handles'
import { openAsksForAgent } from '../core/ask-pins'
import { isImeOwnedKeyboardEvent } from '../core/ime-guard'
import { clampWindow, type Box, type PinnedSession, type Pt } from '../core/pinned-sessions'
import type { SpaceAgent, SpaceAsk, SpaceGoal } from '../core/space'
import { getBullseyeTheme } from '../core/theme'
import { useSpaceCanvasHost } from '../host-adapter'
import { MiniSpacewareSprite } from '../sprites/space-sprite'
import { spriteRoleOf } from '../sprites/space-sprite-accessory'
import { CLICK_SLOP_PX, isDoubleClick, pinStatus, pressedOnTag, type Release } from './pin-click'
import { PinMenu, pinMenuItems, usePinMenu } from './pin-menu'
import { PinNameTag } from './pin-name-tag'
import { resizeWindowByHandle } from './pinned-geometry'
import { consumePinFocus, currentViewport } from './pinned-store'

const HEADER_H = 36

function handleStyle(h: Handler): React.CSSProperties {
  const S = 8
  const C = 14
  const side: Record<Handler, React.CSSProperties> = {
    top: { left: C, right: C, top: -S / 2, height: S, cursor: 'ns-resize' },
    bottom: { left: C, right: C, bottom: -S / 2, height: S, cursor: 'ns-resize' },
    left: { top: C, bottom: C, left: -S / 2, width: S, cursor: 'ew-resize' },
    right: { top: C, bottom: C, right: -S / 2, width: S, cursor: 'ew-resize' },
    'top-left': { top: -S / 2, left: -S / 2, width: C, height: C, cursor: 'nwse-resize' },
    'bottom-right': { bottom: -S / 2, right: -S / 2, width: C, height: C, cursor: 'nwse-resize' },
    'top-right': { top: -S / 2, right: -S / 2, width: C, height: C, cursor: 'nesw-resize' },
    'bottom-left': { bottom: -S / 2, left: -S / 2, width: C, height: C, cursor: 'nesw-resize' }
  }
  return side[h]
}

type Gesture =
  | { kind: 'move'; id: number; from: Pt; start: Box; last: Box | null; onTag: boolean; at: number }
  | {
      kind: 'resize'
      id: number
      handler: Handler
      from: Pt
      start: Box
      last: Box | null
      started: boolean
    }

export function PinnedWindow({
  pin,
  agent,
  bodyAgent,
  dark,
  leaving,
  onSetBox,
  onCollapse,
  onOpenFull,
  onUnpin,
  onReset,
  onRaise,
  onRename,
  goal,
  onAnswerAsk,
  chat,
  canToggleView,
  onToggleView,
  needsYouCard,
  windowRef
}: {
  pin: PinnedSession
  agent: SpaceAgent | null
  bodyAgent: SpaceAgent | null
  dark: boolean
  leaving: boolean
  onSetBox: (box: Box) => void
  onCollapse: () => void
  onOpenFull: () => void
  onUnpin: () => void
  onReset: () => void
  onRaise: () => void
  onRename: (name: string) => void
  goal: SpaceGoal | null
  onAnswerAsk?: (ask: SpaceAsk, answer: 'yes' | 'no') => void
  chat: boolean
  canToggleView: boolean
  onToggleView: () => void
  needsYouCard: boolean
  windowRef?: React.Ref<HTMLDivElement>
}): React.JSX.Element {
  const host = useSpaceCanvasHost()
  const p = getBullseyeTheme(dark)
  const [live, setLive] = useState<Box | null>(null)
  const [editingName, setEditingName] = useState(false)
  const gesture = useRef<Gesture | null>(null)
  const menu = usePinMenu()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const box = live ?? pin.win
  const attention = Boolean(agent?.attention)
  const busy = Boolean(agent?.busy) && !attention
  const openAsks = bodyAgent ? openAsksForAgent(goal, bodyAgent) : []

  useEffect(() => {
    if (consumePinFocus(pin.tabId)) {
      rootRef.current?.focus({ preventScroll: true })
    }
  }, [pin.tabId])

  const begin = (kind: Gesture['kind'], e: React.PointerEvent, handler?: Handler): void => {
    if (e.button !== 0) {
      return
    }
    e.stopPropagation()
    onRaise()
    const base = {
      id: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      start: pin.win,
      last: null
    }
    gesture.current =
      kind === 'move'
        ? { kind, ...base, onTag: pressedOnTag(e.target), at: Date.now() }
        : { kind, handler: handler as Handler, started: false, ...base }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch {
      // ok: jsdom lacks setPointerCapture
      // ignore
    }
  }

  const step = (e: React.PointerEvent): void => {
    const g = gesture.current
    if (!g) {
      return
    }
    const vp = currentViewport()
    const at = { x: e.clientX, y: e.clientY }
    if (g.kind === 'move') {
      if (!g.last && !passedDragThreshold(g.from, at, CLICK_SLOP_PX)) {
        return
      }
      g.last = clampWindow(
        { ...g.start, x: g.start.x + at.x - g.from.x, y: g.start.y + at.y - g.from.y },
        vp
      )
    } else {
      g.started = g.started || passedResizeThreshold(g.from, at)
      if (!g.started) {
        return
      }
      g.last = resizeWindowByHandle(g.start, g.handler, g.from, at, vp, e.shiftKey)
    }
    setLive(g.last)
  }

  const lastRelease = useRef<Release | null>(null)
  const end = (e: React.PointerEvent): void => {
    const g = gesture.current
    gesture.current = null
    if (g?.last) {
      onSetBox(g.last)
    } else if (g?.kind === 'move') {
      const now: Release = { t: Date.now(), pt: { x: e.clientX, y: e.clientY }, onTag: g.onTag }
      if (isDoubleClick(lastRelease.current, now)) {
        lastRelease.current = null
        if (now.onTag && g.onTag) {
          setEditingName(true)
        } else {
          onCollapse()
        }
      } else {
        lastRelease.current = now
      }
    }
    setLive(null)
  }

  const headerBtn =
    'flex size-6 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-[var(--pin-hover)] focus-visible:ring-2'

  const customBody = host.renderPinnedSessionBody?.(pin, bodyAgent, {
    dark,
    chat,
    onOpenFull,
    onAnswerAsk
  })

  return (
    <div
      ref={(node) => {
        rootRef.current = node
        if (typeof windowRef === 'function') {
          windowRef(node)
        } else if (windowRef) {
          ;(windowRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        }
      }}
      role="dialog"
      aria-label={`${pin.name}, pinned session window`}
      tabIndex={-1}
      data-pinned-window={pin.tabId}
      data-attention={attention ? 'true' : 'false'}
      data-status={pinStatus(agent)}
      onPointerDown={onRaise}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-pinned-header]')) {
          menu.handlers.onKeyDown(e)
        }
        if (e.key === 'F2' && !(e.target as HTMLElement).closest('input, textarea')) {
          e.preventDefault()
          setEditingName(true)
        }
        const t = e.target as HTMLElement
        if (
          e.key === 'Escape' &&
          !e.defaultPrevented &&
          !isImeOwnedKeyboardEvent(e) &&
          !t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') &&
          !rootRef.current?.querySelector('[aria-expanded="true"]:not([data-inline-disclosure])')
        ) {
          e.stopPropagation()
          onCollapse()
        }
      }}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        background: p.card,
        color: p.body,
        borderColor: attention ? p.bad : p.borderStrong,
        boxShadow: p.elevation,
        zIndex: 10 + pin.z,
        ['--pin-hover' as string]: p.hover,
        transformOrigin: 'top left'
      }}
      className={`orca-pin-glide pointer-events-auto fixed flex flex-col overflow-visible rounded-[14px] border outline-none ${leaving ? 'orca-pin-leaving' : ''}`}
      data-leaving={leaving ? 'true' : 'false'}
    >
      <div
        data-pinned-header
        onContextMenu={menu.handlers.onContextMenu}
        onPointerDown={(e) => {
          const t = e.target as HTMLElement
          if (!t.closest('button') && !t.closest('input')) {
            begin('move', e)
          }
        }}
        onPointerMove={step}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ height: HEADER_H, background: p.well, borderColor: p.border, touchAction: 'none' }}
        className="flex shrink-0 cursor-grab select-none items-center gap-1.5 rounded-t-[13px] border-b px-2"
      >
        <button
          type="button"
          data-pin-face
          aria-label="Back to square"
          title="Back to square"
          onClick={onCollapse}
          className={headerBtn}
        >
          <MiniSpacewareSprite
            busy={busy}
            attention={attention}
            awake
            role={agent ? spriteRoleOf({ name: agent.name, role: agent.role }) : undefined}
          />
        </button>
        <PinNameTag
          name={pin.name}
          p={p}
          variant="header"
          onCommit={onRename}
          editing={editingName}
          setEditing={setEditingName}
        />
        {canToggleView ? (
          <button
            type="button"
            data-pin-view-toggle
            aria-label={chat ? 'Switch to Terminal view' : 'Switch to Chat view'}
            title={chat ? 'Chat view · switch to Terminal' : 'Terminal view · switch to Chat'}
            onClick={onToggleView}
            className={`${headerBtn} w-auto gap-1 px-1.5 text-[10px] font-semibold`}
          >
            <ArrowLeftRight size={12} aria-hidden="true" />
            <span>{chat ? 'Chat' : 'Terminal'}</span>
          </button>
        ) : null}
        <button
          type="button"
          data-pin-open-full
          aria-label="Open full"
          title="Open full"
          onClick={onOpenFull}
          className={headerBtn}
        >
          <ExternalLink size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-pin-collapse
          aria-label="Collapse to square"
          title="Collapse to square"
          onClick={onCollapse}
          className={headerBtn}
        >
          <Minimize2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-pin-unpin
          aria-label="Unpin"
          title="Unpin"
          onClick={onUnpin}
          className={headerBtn}
        >
          <PinOff size={14} aria-hidden="true" />
        </button>
      </div>
      {needsYouCard ? (
        <div
          data-pin-needs-you
          role="status"
          style={{ background: p.badSoft, borderColor: p.badBorder, color: p.badText }}
          className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-[12px] font-semibold"
        >
          <span className="min-w-0 flex-1 truncate">Needs you — Open full to answer</span>
          <button
            type="button"
            data-pin-needs-you-open
            onClick={onOpenFull}
            style={{ borderColor: p.badBorder }}
            className="shrink-0 cursor-pointer rounded-md border px-2 py-0.5 text-[11px]"
          >
            Open full
          </button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-[13px]">
        {customBody !== undefined ? (
          customBody
        ) : (
          <div className="flex flex-1 flex-col justify-between gap-3 p-3 text-xs">
            <div className="space-y-2">
              <div style={{ color: p.muted }} className="text-[11px]">
                {bodyAgent?.activity || 'Pinned live session'}
              </div>
              {openAsks.map((ask) => (
                <div
                  key={ask.id}
                  data-pin-ask-card={ask.id}
                  style={{ background: p.badSoft, borderColor: p.badBorder, color: p.badText }}
                  className="rounded-lg border p-2.5"
                >
                  <p className="mb-2 text-[12px] font-medium">{ask.text}</p>
                  {onAnswerAsk ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAnswerAsk(ask, 'yes')}
                        className="cursor-pointer rounded bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"
                      >
                        Yes · Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => onAnswerAsk(ask, 'no')}
                        className="cursor-pointer rounded bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-300"
                      >
                        No
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onOpenFull}
              style={{ borderColor: p.borderStrong, color: p.ink }}
              className="w-full cursor-pointer rounded-lg border py-1.5 text-center text-[11px] font-semibold hover:bg-white/5"
            >
              Open full session
            </button>
          </div>
        )}
      </div>
      <PinMenu
        at={menu.at}
        label={`${pin.name} pin menu`}
        dark={dark}
        onClose={menu.close}
        returnFocus={() => rootRef.current}
        items={pinMenuItems({
          onOpenFull,
          onRename: () => setEditingName(true),
          onReset,
          onUnpin
        })}
      />
      {HANDLERS.map((h) => (
        <div
          key={h}
          data-resize-handle={h}
          onPointerDown={(e) => begin('resize', e, h)}
          onPointerMove={step}
          onPointerUp={end}
          onPointerCancel={end}
          style={{ position: 'absolute', touchAction: 'none', ...handleStyle(h) }}
        />
      ))}
    </div>
  )
}
