import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isAgentSession } from '../core/agent-identity'
import { openAsksForAgent } from '../core/ask-pins'
import { subscribeKeepOut } from '../core/keep-out'
import { SQUARE_H, SQUARE_W, type Box, type PinnedSession } from '../core/pinned-sessions'
import { resolveAgentGoalId, type SpaceAgent, type SpaceState } from '../core/space'
import { getBullseyeTheme } from '../core/theme'
import { useSpaceCanvasHost } from '../host-adapter'
import { ensurePinStyle } from './pin-click'
import { clearOfKeepOut, keepOutBoxes } from './pinned-geometry'
import { PinnedSquare } from './pinned-square'
import {
  currentViewport,
  dispatchPinned,
  getPinnedState,
  onPinnedToast,
  requestPinFocus,
  usePinnedState
} from './pinned-store'
import { PinnedWindow } from './pinned-window'

export const PIN_LAYER_Z = 49
const TOAST_MS = 2400

export type PinnedSessionsLayerProps = {
  agents: readonly SpaceAgent[]
  space?: SpaceState
  dark?: boolean
  onActivate?: (tabId: string) => void
  onRename?: (pin: PinnedSession, agent: SpaceAgent | null, name: string) => void
}

export function PinnedSessionsLayer({
  agents,
  space,
  dark = true,
  onActivate,
  onRename
}: PinnedSessionsLayerProps): React.JSX.Element | null {
  const host = useSpaceCanvasHost()
  const state = usePinnedState()
  const p = getBullseyeTheme(dark)
  const [toast, setToast] = useState<string | null>(null)
  const squareButtons = useRef(new Map<string, HTMLButtonElement | null>())

  useEffect(ensurePinStyle, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = onPinnedToast((text) => {
      setToast(text)
      clearTimeout(timer)
      timer = setTimeout(() => setToast(null), TOAST_MS)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [])

  useEffect(
    () =>
      subscribeKeepOut(() => {
        for (const pin of getPinnedState().pins) {
          const vp = currentViewport()
          if (pin.open) {
            dispatchPinned({
              type: 'setWindow',
              tabId: pin.tabId,
              box: clearOfKeepOut(pin.win),
              vp
            })
          } else {
            const cleared = clearOfKeepOut({
              x: pin.square.x,
              y: pin.square.y,
              w: SQUARE_W,
              h: SQUARE_H
            })
            dispatchPinned({
              type: 'moveSquare',
              tabId: pin.tabId,
              to: { x: cleared.x, y: cleared.y },
              vp
            })
          }
        }
      }),
    []
  )

  if (typeof document === 'undefined' || (state.pins.length === 0 && !toast)) {
    return null
  }

  const squareRects = (except: string): Box[] =>
    state.pins
      .filter((pin) => pin.tabId !== except && !pin.open)
      .map((pin) => ({ x: pin.square.x, y: pin.square.y, w: SQUARE_W, h: SQUARE_H }))

  const closeWindow = (pin: PinnedSession): void => {
    dispatchPinned({ type: 'close', tabId: pin.tabId })
    setTimeout(() => squareButtons.current.get(pin.tabId)?.focus(), 0)
  }

  const openFull = (pin: PinnedSession): void => {
    onActivate?.(pin.tabId)
    host.onOpenSession?.(pin.tabId, pin.kind === 'terminal' ? 'orca-terminal' : 'orca-agent')
    dispatchPinned({ type: 'close', tabId: pin.tabId })
  }

  const validGoals = space ? new Set(space.goals.map((g) => g.id)) : new Set<string>()

  return createPortal(
    <div
      data-pinned-sessions-layer
      style={{ pointerEvents: 'none', position: 'fixed', inset: 0, zIndex: PIN_LAYER_Z }}
    >
      {state.pins.map((pin) => {
        const agent = agents.find((a) => a.id === pin.tabId || a.unifiedTabId === pin.tabId) ?? null
        const bodyAgent: SpaceAgent | null =
          agent ??
          (pin.kind === 'agent' || pin.kind === 'terminal'
            ? { id: pin.tabId, name: pin.name, agent: null, kind: pin.kind }
            : null)
        const goalId = space && bodyAgent ? resolveAgentGoalId(space, bodyAgent, validGoals) : null
        const goal = goalId && space ? (space.goals.find((g) => g.id === goalId) ?? null) : null
        const canChat = bodyAgent !== null && isAgentSession(bodyAgent)
        const chat = pin.view === 'chat' ? true : pin.view === 'terminal' ? false : canChat
        const hasAskCard = Boolean(bodyAgent && openAsksForAgent(goal, bodyAgent).length > 0)
        const needsYouCard = Boolean(agent?.attention) && !hasAskCard

        return pin.open ? (
          <PinnedWindow
            key={pin.tabId}
            pin={pin}
            agent={agent}
            bodyAgent={bodyAgent}
            dark={dark}
            leaving={false}
            onSetBox={(box) =>
              dispatchPinned({
                type: 'setWindow',
                tabId: pin.tabId,
                box: clearOfKeepOut(box),
                vp: currentViewport()
              })
            }
            onCollapse={() => closeWindow(pin)}
            onOpenFull={() => openFull(pin)}
            onUnpin={() => {
              dispatchPinned({ type: 'unpin', tabId: pin.tabId })
              host.onPinSession?.(pin.tabId, false)
            }}
            onReset={() =>
              dispatchPinned({
                type: 'resetPosition',
                tabId: pin.tabId,
                vp: currentViewport(),
                keepOut: keepOutBoxes()
              })
            }
            onRaise={() => dispatchPinned({ type: 'raise', tabId: pin.tabId })}
            onRename={(name) => {
              dispatchPinned({ type: 'rename', tabId: pin.tabId, name })
              onRename?.(pin, agent, name)
            }}
            goal={goal}
            onAnswerAsk={
              goal && host.onAnswerAsk
                ? (ask, answer) => host.onAnswerAsk?.(goal.id, ask.id, answer)
                : undefined
            }
            chat={chat}
            canToggleView={bodyAgent !== null && (pin.kind === 'terminal' || pin.kind === 'agent')}
            onToggleView={() =>
              dispatchPinned({
                type: 'setView',
                tabId: pin.tabId,
                view: chat ? 'terminal' : 'chat'
              })
            }
            needsYouCard={needsYouCard}
          />
        ) : (
          <PinnedSquare
            key={pin.tabId}
            pin={pin}
            agent={agent}
            dark={dark}
            leaving={false}
            others={() => squareRects(pin.tabId)}
            onMove={(to) => {
              const cleared = clearOfKeepOut({ x: to.x, y: to.y, w: SQUARE_W, h: SQUARE_H })
              dispatchPinned({
                type: 'moveSquare',
                tabId: pin.tabId,
                to: { x: cleared.x, y: cleared.y },
                vp: currentViewport()
              })
            }}
            onOpen={() => {
              requestPinFocus(pin.tabId)
              dispatchPinned({
                type: 'open',
                tabId: pin.tabId,
                vp: currentViewport(),
                keepOut: keepOutBoxes()
              })
            }}
            onRename={(name) => {
              dispatchPinned({ type: 'rename', tabId: pin.tabId, name })
              onRename?.(pin, agent, name)
            }}
            onOpenFull={() => openFull(pin)}
            onReset={() =>
              dispatchPinned({
                type: 'resetPosition',
                tabId: pin.tabId,
                vp: currentViewport(),
                keepOut: keepOutBoxes()
              })
            }
            onUnpin={() => {
              dispatchPinned({ type: 'unpin', tabId: pin.tabId })
              host.onPinSession?.(pin.tabId, false)
            }}
            onEscape={() => {
              const top = state.pins.filter((q) => q.open).sort((x, y) => y.z - x.z)[0]
              if (top) {
                closeWindow(top)
              }
            }}
            buttonRef={(node) => {
              squareButtons.current.set(pin.tabId, node)
            }}
          />
        )
      })}
      {toast ? (
        <div
          role="status"
          data-pinned-toast
          data-tone="warning"
          aria-live="polite"
          style={{
            pointerEvents: 'none',
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: p.ink,
            color: p.card,
            boxShadow: p.elevation
          }}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
        >
          {toast}
        </div>
      ) : null}
    </div>,
    document.body
  )
}
