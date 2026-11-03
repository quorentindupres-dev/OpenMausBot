export const SPACE_PANEL_ATTR = 'data-space-panel'
export const SPACE_SCROLL_ATTR = 'data-space-scroll'

const PANEL_SELECTOR = [
  `[${SPACE_PANEL_ATTR}]`,
  '[data-space-scroll-lock]',
  '[data-orca-plus-scroll-lock]',
  '[data-space-dock]',
  '[data-space-drawer]',
  '[data-space-spawn-popover]',
  '[data-whiteboard-inspector]',
  '[data-whiteboard-multiselect]',
  '[data-whiteboard-history]',
  '[data-agent-ui-panel]',
  '[data-space-palette]'
].join(', ')

const TEXT_ENTRY_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
const SCROLLABLE_OVERFLOW = /(auto|scroll|overlay)/
const LINE_PX = 16

export type WheelDecision = 'ignore' | 'block' | 'pan' | 'zoom'

export type WheelLike = {
  target: EventTarget | null
  deltaX: number
  deltaY: number
  deltaMode?: number
  ctrlKey?: boolean
  metaKey?: boolean
}

export type WheelContext = {
  root: Element
  overflowOf?: (el: Element) => { x: string; y: string }
}

type ScrollBox = Element & {
  scrollTop: number
  scrollLeft: number
  scrollHeight: number
  scrollWidth: number
  clientHeight: number
  clientWidth: number
}

function defaultOverflow(el: Element): { x: string; y: string } {
  const style = window.getComputedStyle(el)
  return { x: style.overflowX, y: style.overflowY }
}

function canScrollToward(
  el: ScrollBox,
  dx: number,
  dy: number,
  overflow: { x: string; y: string }
): boolean {
  if (dy !== 0 && SCROLLABLE_OVERFLOW.test(overflow.y) && el.scrollHeight > el.clientHeight) {
    const max = el.scrollHeight - el.clientHeight
    if ((dy > 0 && el.scrollTop < max - 0.5) || (dy < 0 && el.scrollTop > 0.5)) {
      return true
    }
  }
  if (dx !== 0 && SCROLLABLE_OVERFLOW.test(overflow.x) && el.scrollWidth > el.clientWidth) {
    const max = el.scrollWidth - el.clientWidth
    if ((dx > 0 && el.scrollLeft < max - 0.5) || (dx < 0 && el.scrollLeft > 0.5)) {
      return true
    }
  }
  return false
}

function isElement(value: unknown): value is Element {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Element).matches === 'function' &&
    'parentElement' in value
  )
}

export function decideWheel(event: WheelLike, ctx: WheelContext): WheelDecision {
  const zoom = Boolean(event.ctrlKey || event.metaKey)
  const target = event.target
  if (!isElement(target) || target === ctx.root || !ctx.root.contains(target)) {
    return zoom ? 'zoom' : 'pan'
  }
  const overflowOf = ctx.overflowOf ?? defaultOverflow
  const { dx, dy } = normalizeWheel(event)
  for (let el: Element | null = target; el && el !== ctx.root; el = el.parentElement) {
    if (el.matches(PANEL_SELECTOR)) {
      return zoom ? 'block' : 'ignore'
    }
    if (zoom) {
      continue
    }
    if (el.matches(TEXT_ENTRY_SELECTOR)) {
      return 'ignore'
    }
    const overflow = el.hasAttribute(SPACE_SCROLL_ATTR) ? { x: 'auto', y: 'auto' } : overflowOf(el)
    if (canScrollToward(el as ScrollBox, dx, dy, overflow)) {
      return 'ignore'
    }
  }
  return zoom ? 'zoom' : 'pan'
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function normalizeWheel(
  event: Pick<WheelLike, 'deltaX' | 'deltaY' | 'deltaMode'>,
  pageHeight = typeof window === 'undefined' ? 800 : window.innerHeight || 800
): { dx: number; dy: number } {
  const unit = event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? pageHeight : 1
  return { dx: finite(event.deltaX) * unit, dy: finite(event.deltaY) * unit }
}

export type WheelBatch = {
  dx: number
  dy: number
  factor: number
  focal: { x: number; y: number } | null
}

export type WheelBatcher = {
  pan: (dx: number, dy: number) => void
  zoom: (factor: number, focal: { x: number; y: number }) => void
  flush: () => void
  dispose: () => void
}

type FrameApi = {
  request: (cb: () => void) => number
  cancel: (id: number) => void
}

const defaultFrames: FrameApi = {
  request: (cb) => window.requestAnimationFrame(cb),
  cancel: (id) => window.cancelAnimationFrame(id)
}

export function createWheelBatcher(
  apply: (batch: WheelBatch) => void,
  frames: FrameApi = defaultFrames
): WheelBatcher {
  let pending: WheelBatch = { dx: 0, dy: 0, factor: 1, focal: null }
  let frame: number | null = null
  const flush = (): void => {
    frame = null
    const batch = pending
    pending = { dx: 0, dy: 0, factor: 1, focal: null }
    if (batch.dx === 0 && batch.dy === 0 && batch.factor === 1) {
      return
    }
    apply(batch)
  }
  const schedule = (): void => {
    if (frame === null) {
      frame = frames.request(flush)
    }
  }
  return {
    pan: (dx, dy) => {
      pending.dx += finite(dx)
      pending.dy += finite(dy)
      schedule()
    },
    zoom: (factor, focal) => {
      if (!Number.isFinite(factor) || factor <= 0) {
        return
      }
      pending.factor *= factor
      pending.focal = focal
      schedule()
    },
    flush: () => {
      if (frame !== null) {
        frames.cancel(frame)
      }
      flush()
    },
    dispose: () => {
      if (frame !== null) {
        frames.cancel(frame)
      }
      frame = null
      pending = { dx: 0, dy: 0, factor: 1, focal: null }
    }
  }
}
