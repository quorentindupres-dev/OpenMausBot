import React from 'react'
import { Pin } from 'lucide-react'
import { isPinnable, isPinned, type PinKind } from '../core/pinned-sessions'
import { useSpaceCanvasHost } from '../host-adapter'
import { pinSession, unpinSession, usePinnedState } from './pinned-store'

export type PinButtonProps = {
  tabId: string
  worktreeId?: string
  name: string
  size?: number
  kind?: PinKind
  className?: string
}

export function PinButton({
  tabId,
  worktreeId,
  name,
  size = 14,
  kind = 'agent',
  className = ''
}: PinButtonProps): React.JSX.Element | null {
  const host = useSpaceCanvasHost()
  const pinned = isPinned(usePinnedState(), tabId)
  if (!isPinnable(kind)) {
    return null
  }
  return (
    <button
      type="button"
      data-pin-button={tabId}
      data-pinned={pinned ? 'true' : 'false'}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
      title={pinned ? 'Unpin session' : 'Pin session as a floating square'}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation()
        }
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (pinned) {
          unpinSession(tabId)
          host.onPinSession?.(tabId, false)
        } else {
          const wt = worktreeId ?? host.activeWorktreeId ?? ''
          if (pinSession({ tabId, worktreeId: wt, name, kind })) {
            host.onPinSession?.(tabId, true)
          }
        }
      }}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded p-0.5 text-current transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 ${className}`}
    >
      <Pin size={size} fill={pinned ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  )
}
