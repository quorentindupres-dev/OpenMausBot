import React, { useEffect, useRef, useState } from 'react'
import { passedDragThreshold } from '../penpot-mpl/drag-threshold'
import { SQUARE_H, SQUARE_W, type Box, type PinnedSession, type Pt } from '../core/pinned-sessions'
import type { SpaceAgent } from '../core/space'
import { getBullseyeTheme } from '../core/theme'
import { MiniSpacewareSprite, SPACEWARE_ISLAND_PALETTE } from '../sprites/space-sprite'
import { spriteRoleOf } from '../sprites/space-sprite-accessory'
import {
  CLICK_MAX_MS,
  CLICK_SLOP_PX,
  DOUBLE_CLICK_MS,
  isDoubleClick,
  pinStatus,
  pressedOnTag,
  type Release
} from './pin-click'
import { PinMenu, pinMenuItems, usePinMenu } from './pin-menu'
import { PinNameTag } from './pin-name-tag'
import { snapSquareMove } from './pinned-geometry'
import { currentViewport } from './pinned-store'

export const TAG_CLICK_MS = DOUBLE_CLICK_MS

export function PinnedSquare({
  pin,
  agent,
  dark,
  leaving,
  others,
  onMove,
  onOpen,
  onRename,
  onOpenFull,
  onReset,
  onUnpin,
  onEscape,
  buttonRef
}: {
  pin: PinnedSession
  agent: SpaceAgent | null
  dark: boolean
  leaving: boolean
  others: () => Box[]
  onMove: (to: Pt) => void
  onOpen: () => void
  onRename: (name: string) => void
  onOpenFull: () => void
  onReset: () => void
  onUnpin: () => void
  onEscape?: () => void
  buttonRef?: React.Ref<HTMLButtonElement>
}): React.JSX.Element {
  const p = getBullseyeTheme(dark)
  const [live, setLive] = useState<Pt | null>(null)
  const [editing, setEditingState] = useState(false)
  const tagTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setEditing = (on: boolean): void => {
    if (tagTimer.current) {
      clearTimeout(tagTimer.current)
      tagTimer.current = null
    }
    setEditingState(on)
  }
  useEffect(
    () => () => {
      if (tagTimer.current) {
        clearTimeout(tagTimer.current)
      }
    },
    []
  )
  const drag = useRef<{
    id: number
    from: Pt
    start: Pt
    moved: boolean
    at: number
    last: Pt | null
    onTag: boolean
  } | null>(null)
  const pos = live ?? pin.square
  const attention = Boolean(agent?.attention)
  const busy = Boolean(agent?.busy) && !attention
  const menu = usePinMenu()
  const faceRef = useRef<HTMLButtonElement | null>(null)
  const lastRelease = useRef<Release | null>(null)

  const clearTagTimer = (): void => {
    if (tagTimer.current) {
      clearTimeout(tagTimer.current)
      tagTimer.current = null
    }
  }

  const down = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || editing || e.ctrlKey) {
      return
    }
    clearTagTimer()
    drag.current = {
      id: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      start: pin.square,
      moved: false,
      at: Date.now(),
      last: null,
      onTag: pressedOnTag(e.target)
    }
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // ok: jsdom / detached nodes lack setPointerCapture
      // ignore
    }
  }

  const move = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) {
      return
    }
    if (e.buttons === 0 && e.pointerType === 'mouse') {
      drag.current = null
      setLive(null)
      return
    }
    const now = { x: e.clientX, y: e.clientY }
    if (!d.moved && !passedDragThreshold(d.from, now, CLICK_SLOP_PX)) {
      return
    }
    d.moved = true
    lastRelease.current = null
    const box: Box = { x: d.start.x, y: d.start.y, w: SQUARE_W, h: SQUARE_H }
    d.last = snapSquareMove(
      box,
      now.x - d.from.x,
      now.y - d.from.y,
      others(),
      currentViewport(),
      e.metaKey
    )
    setLive(d.last)
  }

  const up = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    drag.current = null
    if (!d) {
      return
    }
    if (d.moved) {
      if (d.last) {
        onMove(d.last)
      }
    } else if (Date.now() - d.at <= CLICK_MAX_MS) {
      if (d.onTag && !(e.target as HTMLElement).closest('input')) {
        const now: Release = { t: Date.now(), pt: { x: e.clientX, y: e.clientY }, onTag: true }
        if (isDoubleClick(lastRelease.current, now)) {
          lastRelease.current = null
          setEditing(true)
        } else {
          lastRelease.current = now
          tagTimer.current = setTimeout(() => {
            tagTimer.current = null
            lastRelease.current = null
            onOpen()
          }, TAG_CLICK_MS)
        }
      } else if (!d.onTag) {
        onOpen()
      }
    }
    setLive(null)
  }

  return (
    <div
      data-pinned-square={pin.tabId}
      data-attention={attention ? 'true' : 'false'}
      data-face={attention ? 'needs-you' : busy ? 'busy' : 'sleeping'}
      data-status={pinStatus(agent)}
      data-leaving={leaving ? 'true' : 'false'}
      onContextMenu={menu.handlers.onContextMenu}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        drag.current = null
        setLive(null)
      }}
      onKeyDown={(e) => {
        menu.handlers.onKeyDown(e)
        if (e.key === 'Escape') {
          onEscape?.()
        }
      }}
      onLostPointerCapture={() => {
        if (drag.current && !drag.current.moved) {
          drag.current = null
        }
      }}
      style={{
        left: pos.x,
        top: pos.y,
        width: SQUARE_W,
        height: SQUARE_H,
        background: p.card,
        borderColor: attention ? p.bad : p.border,
        zIndex: 1000,
        boxShadow: attention ? `0 0 0 2px ${p.badBorder}, ${p.elevation}` : p.elevation,
        touchAction: 'none'
      }}
      className={`orca-pin-glide pointer-events-auto fixed flex select-none flex-col items-center justify-between rounded-[16px] border px-1 pb-1.5 pt-2 ${
        leaving ? 'orca-pin-leaving' : ''
      } ${live ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      <button
        ref={(node) => {
          faceRef.current = node
          if (typeof buttonRef === 'function') {
            buttonRef(node)
          } else if (buttonRef) {
            ;(buttonRef as React.MutableRefObject<HTMLButtonElement | null>).current = node
          }
        }}
        type="button"
        data-pin-open={pin.tabId}
        aria-label={`${pin.name}, pinned session`}
        aria-expanded={false}
        onClick={(e) => {
          if (e.detail === 0) {
            onOpen()
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          } else if (e.key === 'F2') {
            e.preventDefault()
            setEditing(true)
          }
        }}
        className="flex h-[48px] w-full items-center justify-center rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
        style={{ ['--tw-ring-color' as string]: p.accent }}
      >
        <span
          data-pin-face-art
          style={
            dark
              ? undefined
              : {
                  filter: `drop-shadow(0 0 0.75px ${SPACEWARE_ISLAND_PALETTE.bodyStrokeStrong}) drop-shadow(0 0 0.5px rgba(0,0,0,0.45))`
                }
          }
          className="inline-block origin-center scale-[2]"
          aria-hidden="true"
        >
          <MiniSpacewareSprite
            busy={busy}
            attention={attention}
            awake={busy || attention}
            role={agent ? spriteRoleOf({ name: agent.name, role: agent.role }) : undefined}
          />
        </span>
      </button>
      <PinNameTag
        name={pin.name}
        p={p}
        onCommit={onRename}
        editing={editing}
        setEditing={setEditing}
      />
      <PinMenu
        at={menu.at}
        label={`${pin.name} pin menu`}
        dark={dark}
        onClose={menu.close}
        returnFocus={() => faceRef.current}
        items={pinMenuItems({
          onOpenFull,
          onRename: () => setEditing(true),
          onReset,
          onUnpin
        })}
      />
    </div>
  )
}
