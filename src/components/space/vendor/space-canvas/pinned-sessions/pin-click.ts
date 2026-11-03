import { passedDragThreshold } from '../penpot-mpl/drag-threshold'
import type { Pt } from '../core/pinned-sessions'
import type { SpaceAgent } from '../core/space'

export const DOUBLE_CLICK_MS = 400
export const CLICK_SLOP_PX = 4
export const CLICK_MAX_MS = 800

export type Release = { t: number; pt: Pt; onTag: boolean }

export function isDoubleClick(prev: Release | null, now: Release): boolean {
  return (
    prev !== null &&
    now.t - prev.t <= DOUBLE_CLICK_MS &&
    !passedDragThreshold(prev.pt, now.pt, CLICK_SLOP_PX)
  )
}

export function pressedOnTag(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest?.('[data-pin-name-tag], input'))
}

export type PinStatus = 'needs-you' | 'working' | 'idle'

export function pinStatus(agent: Pick<SpaceAgent, 'attention' | 'busy'> | null): PinStatus {
  if (agent?.attention) {
    return 'needs-you'
  }
  return agent?.busy ? 'working' : 'idle'
}

const PIN_STYLE_ID = 'xlabs-space-canvas-pin-style'
const PIN_STYLE = `
.orca-pin-glide { transition: opacity 180ms ease, transform 180ms ease; }
.orca-pin-leaving { opacity: 0 !important; transform: scale(0.92) !important; pointer-events: none !important; }
`

export function ensurePinStyle(): void {
  if (typeof document === 'undefined') {
    return
  }
  let el = document.getElementById(PIN_STYLE_ID)
  if (!el) {
    el = document.createElement('style')
    el.id = PIN_STYLE_ID
    document.head.appendChild(el)
  }
  if (el.textContent !== PIN_STYLE) {
    el.textContent = PIN_STYLE
  }
}
