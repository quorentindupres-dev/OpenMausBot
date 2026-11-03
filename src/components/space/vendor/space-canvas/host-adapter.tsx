import React, { createContext, useContext } from 'react'
import type { AgentRoleId } from './generated/a01-roles'
import type {
  A01SpawnMode,
  C02ProjectLiveRef,
  C02ProjectSummary,
  DraggableSessionSummary,
  SpaceComputerTarget,
  SpaceSessionKind
} from './core/canvas-nodes'
import type { PinnedSession } from './core/pinned-sessions'
import type { Point, SpaceAgent, SpaceAsk } from './core/space'

export type A01SpawnRequest = {
  nodeId: string
  roleId: AgentRoleId
  spawnMode: A01SpawnMode
  projectSlug: string
  computer: SpaceComputerTarget
  position: Point
  modelId?: string
  goalId?: string
}

export type PinnedSessionBodyRenderOpts = {
  dark: boolean
  chat: boolean
  onOpenFull: () => void
  onAnswerAsk?: (ask: SpaceAsk, answer: 'yes' | 'no') => void
}

/**
 * Host adapter contract injected into `<SpaceCanvas host={...} />` or `<SpaceCanvasHostProvider>`.
 * Keeps `@xlabs/space-canvas` 100% free of Electron, IPC globals, or host app stores.
 */
export type SpaceCanvasHostAdapter = {
  /** Live sessions/threads from OpenManus or Orca terminals/agents available to drag onto the canvas. */
  sessions?: readonly DraggableSessionSummary[]
  /** Available C02 projects (e.g. `precision-peptide`, `surge`, `x-labs`) for project cards & spawn selector. */
  projects?: readonly C02ProjectSummary[]
  /** Default / active C02 project slug of the current Space. */
  activeProjectSlug?: string
  /** Active host worktree or workspace identifier for pinned floating squares. */
  activeWorktreeId?: string
  /** Called when the user switches the Space's top-level C02 project badge. */
  onSelectSpaceProject?: (projectSlug: string) => void
  /** Open the chat thread (OpenManus) or terminal/agent tab (Orca) in full view. */
  onOpenSession?: (sessionId: string, sessionKind: SpaceSessionKind) => void
  /** Pin or unpin a session as a floating face square. */
  onPinSession?: (sessionId: string, pinned: boolean, summary?: DraggableSessionSummary) => void
  /** Switch the execution target computer (`local-ax`, `mac2-lume-isolated`, `mac2-shared`, `cua-cloud`) for a node. */
  onSwitchNodeComputer?: (nodeId: string, nextComputer: SpaceComputerTarget) => void
  /** Spawn a registered `A01` role dropped onto the canvas via the 2-second Spawn Card. */
  onSpawnA01Agent?: (req: A01SpawnRequest) => void | Promise<void>
  /** Semantic arrow hook: drawing a magnetic arrow from a C02 Project Card ──▶ Agent/Session Node binds the project. */
  onBindProjectToNode?: (nodeId: string, projectSlug: string) => void
  /** Semantic arrow hook: drawing a magnetic arrow from Agent/Session A ──▶ Agent/Session B wires a handoff link. */
  onConnectNodes?: (fromId: string, toId: string) => void
  /** Open a live link / file reference on a C02 Project context card. */
  onOpenProjectRef?: (projectSlug: string, ref: C02ProjectLiveRef) => void
  /** Answer an open agent ask (`yes` / `no`) from an Ask Pin or Pinned Window. */
  onAnswerAsk?: (goalId: string, askId: string, answer: 'yes' | 'no') => void
  /** Optional custom renderer for the body inside an expanded Pinned Floating Window. */
  renderPinnedSessionBody?: (
    pin: PinnedSession,
    agent: SpaceAgent | null,
    opts: PinnedSessionBodyRenderOpts
  ) => React.ReactNode
  /** Optional terminal tail fetcher for Pinned Window fallback preview. */
  getTerminalTail?: (tabId: string) => Promise<string>
  /** Optional host image picker returning a `data:image/...` or URL string for custom Space emojis. */
  onPickImageDataUrl?: () => Promise<string | null>
  /** Optional host toast/notification callback. */
  onNotify?: (message: string, tone?: 'info' | 'warn' | 'good') => void
  /** Optional host focus-task callback triggered from a Goal tile's focus button. */
  onFocusTask?: (slugOrId: string, title: string) => void
}

const DEFAULT_HOST_ADAPTER: SpaceCanvasHostAdapter = Object.freeze({})

const SpaceCanvasHostContext = createContext<SpaceCanvasHostAdapter>(DEFAULT_HOST_ADAPTER)

export function SpaceCanvasHostProvider({
  adapter,
  children
}: {
  adapter?: SpaceCanvasHostAdapter
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <SpaceCanvasHostContext.Provider value={adapter ?? DEFAULT_HOST_ADAPTER}>
      {children}
    </SpaceCanvasHostContext.Provider>
  )
}

export function useSpaceCanvasHost(): SpaceCanvasHostAdapter {
  return useContext(SpaceCanvasHostContext)
}
