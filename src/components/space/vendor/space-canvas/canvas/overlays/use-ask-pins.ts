// WS-D (TASK_16 wave 2): open agent asks on the canvas: pin layout, next / prev, glide, ⌘F jump.
// Read only on agent data: it reads goal.asks and never writes them. The answer happens in the agent's
// own panel (onSelectAgent). Owner: WS-D.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  collectOpenAsks,
  layoutAskPins,
  stepAsk,
  viewToShowBox,
  type AskBox,
  type AskPinLayout,
  type OpenAskRef
} from '../../core/ask-pins'
import type { CanvasCtx } from '../canvas-ctx'
import { registerCanvasCommands, type CanvasCommand, type KeyChord } from '../keyboard/commands'

/** The three keys this module runs. `mod` = ⌘ on macOS, Ctrl elsewhere. */
export const ASK_KEYS = {
  jump: { key: 'f', mod: true, shift: false, alt: false },
  next: { key: 'n', mod: false, shift: false, alt: false },
  prev: { key: 'n', mod: false, shift: true, alt: false }
} as const satisfies Record<string, KeyChord>

type AskKeyActions = {
  jump: () => void
  next: () => void
  prev: () => void
  hasAsks: () => boolean
}

/**
 * Rows for WS-A's one shortcut table (registered at runtime: `run` needs this hook's state), so the
 * `?` help lists them and the P3-11 conflict check sees them.
 */
export function askCommandRows(
  actions: AskKeyActions,
  claim: (event: KeyboardEvent) => boolean
): CanvasCommand[] {
  return [
    {
      id: 'ask.jump-to',
      label: 'Jump to agent or Space by name',
      group: 'View',
      scope: 'canvas',
      keys: [ASK_KEYS.jump],
      display: '⌘F',
      run: (_env, event) => {
        const mine = claim(event)
        if (mine) {
          actions.jump()
        }
        return mine
      }
    },
    {
      id: 'ask.next',
      label: 'Next open ask',
      group: 'View',
      scope: 'canvas',
      keys: [ASK_KEYS.next],
      display: 'N',
      when: () => actions.hasAsks(),
      run: (_env, event) => {
        const mine = claim(event)
        if (mine) {
          actions.next()
        }
        return mine
      }
    },
    {
      id: 'ask.prev',
      label: 'Previous open ask',
      group: 'View',
      scope: 'canvas',
      keys: [ASK_KEYS.prev],
      display: '⇧N',
      when: () => actions.hasAsks(),
      run: (_env, event) => {
        const mine = claim(event)
        if (mine) {
          actions.prev()
        }
        return mine
      }
    }
  ]
}

export type AskPinsApi = {
  asks: OpenAskRef[]
  /** False until the canvas has a size (first layout); nothing is drawn before that. */
  measured: boolean
  layout: AskPinLayout
  activeAskId: string | null
  goToAsk: (askId: string) => void
  nextAsk: () => void
  prevAsk: () => void
  /** Glide to the tile an agent sits on and select it (⌘F result). */
  goToAgent: (agentId: string) => void
  /** Glide to a Space tile (⌘F result). Nothing else changes. */
  goToTile: (tileKey: string) => void
  jumpOpen: boolean
  setJumpOpen: (open: boolean) => void
  tileOfAgent: ReadonlyMap<string, string>
}

const EMPTY_SIZE = { width: 0, height: 0 }

function useViewportSize(rootRef: React.RefObject<HTMLDivElement | null>): {
  width: number
  height: number
} {
  const [size, setSize] = useState(EMPTY_SIZE)
  useEffect(() => {
    const el = rootRef.current
    if (!el) {
      return
    }
    const read = (): void => {
      const width = el.clientWidth
      const height = el.clientHeight
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : width > 0
            ? { width, height }
            : EMPTY_SIZE
      )
    }
    read()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read)
      return () => window.removeEventListener('resize', read)
    }
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootRef])
  return size
}

/** True when `id` (agent id or its unified tab id) is the agent whose panel is already open. */
export function isInspectedAgent(
  agents: CanvasCtx['agents'],
  inspectedAgentId: string | null,
  id: string
): boolean {
  if (!inspectedAgentId) {
    return false
  }
  if (inspectedAgentId === id) {
    return true
  }
  const open = agents.find((a) => a.id === inspectedAgentId || a.unifiedTabId === inspectedAgentId)
  return Boolean(open && (open.id === id || open.unifiedTabId === id))
}

export function useAskPins(ctx: CanvasCtx): AskPinsApi {
  const { space, boxMap, agentsBySpace, view, setView, markZoomTween, rootRef, onSelectAgent } = ctx
  const { agents, inspectedAgentId } = ctx
  const viewport = useViewportSize(rootRef)
  const [activeAskId, setActiveAskId] = useState<string | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)

  const tileOfAgent = useMemo(() => {
    const map = new Map<string, string>()
    for (const [key, members] of agentsBySpace) {
      for (const agent of members) {
        map.set(agent.id, key)
        if (agent.unifiedTabId) {
          map.set(agent.unifiedTabId, key)
        }
      }
    }
    return map
  }, [agentsBySpace])

  const asks = useMemo(
    () =>
      collectOpenAsks(
        space.goals,
        (key) => boxMap.has(key),
        (botId) => tileOfAgent.get(botId)
      ),
    [boxMap, space.goals, tileOfAgent]
  )

  const boxOf = useCallback((key: string): AskBox | undefined => boxMap.get(key), [boxMap])
  const layout = useMemo(
    () =>
      viewport.width > 0 ? layoutAskPins(asks, boxOf, view, viewport) : { pins: [], edges: [] },
    [asks, boxOf, view, viewport]
  )

  const goToTile = useCallback(
    (tileKey: string): void => {
      const box = boxMap.get(tileKey)
      const el = rootRef.current
      if (!box || !el) {
        return
      }
      const size = { width: el.clientWidth, height: el.clientHeight }
      markZoomTween()
      setView((v) => viewToShowBox(box, v, size))
    },
    [boxMap, markZoomTween, rootRef, setView]
  )

  const goToAsk = useCallback(
    (askId: string): void => {
      const ref = asks.find((r) => r.ask.id === askId)
      if (!ref) {
        return
      }
      setActiveAskId(askId)
      goToTile(ref.tileKey)
      // onSelectAgent toggles in space-board: re-selecting the open agent would close its panel.
      if (!isInspectedAgent(agents, inspectedAgentId, ref.ask.botId)) {
        onSelectAgent(ref.ask.botId)
      }
    },
    [agents, asks, goToTile, inspectedAgentId, onSelectAgent]
  )

  const nextAsk = useCallback((): void => {
    const ref = stepAsk(asks, activeAskId, 1)
    if (ref) {
      goToAsk(ref.ask.id)
    }
  }, [activeAskId, asks, goToAsk])
  const prevAsk = useCallback((): void => {
    const ref = stepAsk(asks, activeAskId, -1)
    if (ref) {
      goToAsk(ref.ask.id)
    }
  }, [activeAskId, asks, goToAsk])

  const goToAgent = useCallback(
    (agentId: string): void => {
      const key = tileOfAgent.get(agentId)
      if (key) {
        goToTile(key)
      }
      if (!isInspectedAgent(agents, inspectedAgentId, agentId)) {
        onSelectAgent(agentId)
      }
    },
    [agents, goToTile, inspectedAgentId, onSelectAgent, tileOfAgent]
  )

  // Keys: rows in WS-A's table, run by its one key effect (canvas/keyboard/use-canvas-keys.ts: typing
  // guard, IME, burst end). claim() keeps one keypress to one visible canvas.
  const actionsRef = useRef<AskKeyActions>({
    jump: () => setJumpOpen(true),
    next: nextAsk,
    prev: prevAsk,
    hasAsks: () => asks.length > 0
  })
  actionsRef.current = {
    jump: () => setJumpOpen(true),
    next: nextAsk,
    prev: prevAsk,
    hasAsks: () => asks.length > 0
  }
  useEffect(() => {
    const claimed = new WeakSet<KeyboardEvent>()
    const onScreen = (): boolean => {
      const root = rootRef.current
      return Boolean(root && root.isConnected && root.clientWidth > 0)
    }
    const claim = (event: KeyboardEvent): boolean => {
      if (claimed.has(event) || !onScreen()) {
        return false
      }
      claimed.add(event)
      return true
    }
    const proxy: AskKeyActions = {
      jump: () => actionsRef.current.jump(),
      next: () => actionsRef.current.next(),
      prev: () => actionsRef.current.prev(),
      hasAsks: () => actionsRef.current.hasAsks()
    }
    // Owner = this canvas: two live boards each keep their own ⌘F / N / ⇧N (WS-A routes the key).
    const { unregister } = registerCanvasCommands(askCommandRows(proxy, claim), rootRef)
    return () => {
      unregister()
    }
  }, [rootRef])

  return {
    asks,
    measured: viewport.width > 0,
    layout,
    activeAskId,
    goToAsk,
    nextAsk,
    prevAsk,
    goToAgent,
    goToTile,
    jumpOpen,
    setJumpOpen,
    tileOfAgent
  }
}
