import type { View } from './space'

export const FIT_MIN_SCALE = 0.18
export const FIT_MAX_SCALE = 2
export const FIT_PADDING_PX = 40

export type FitBox = { x: number; y: number; w: number; h: number }

export function fitSelection(
  boxes: readonly FitBox[],
  width: number,
  height: number,
  opts: { padding?: number; minScale?: number; maxScale?: number } = {}
): View | null {
  if (boxes.length === 0 || !(width > 0) || !(height > 0)) {
    return null
  }
  const pad = opts.padding ?? FIT_PADDING_PX
  const min = opts.minScale ?? FIT_MIN_SCALE
  const max = opts.maxScale ?? FIT_MAX_SCALE
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const b of boxes) {
    x1 = Math.min(x1, b.x, b.x + b.w)
    y1 = Math.min(y1, b.y, b.y + b.h)
    x2 = Math.max(x2, b.x, b.x + b.w)
    y2 = Math.max(y2, b.y, b.y + b.h)
  }
  const w = x2 - x1
  const h = y2 - y1
  const availW = Math.max(1, width - pad * 2)
  const availH = Math.max(1, height - pad * 2)
  const fit = Math.min(w > 0 ? availW / w : Infinity, h > 0 ? availH / h : Infinity)
  const scale = Math.max(min, Math.min(max, fit))
  return {
    scale,
    x: width / 2 - (x1 + w / 2) * scale,
    y: height / 2 - (y1 + h / 2) * scale
  }
}

export const READABLE_FIT_MIN_SCALE = 0.55
export const FIT_ALL_MIN_SCALE = 0.4
export type FitInsets = { top: number; right: number; bottom: number; left: number }
export type FitTile = FitBox & { hasMembers: boolean }
export type FitResult = View & { partial: boolean }

function unionOf(boxes: readonly FitBox[]): FitBox {
  const x1 = Math.min(...boxes.map((b) => b.x))
  const y1 = Math.min(...boxes.map((b) => b.y))
  const x2 = Math.max(...boxes.map((b) => b.x + b.w))
  const y2 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function fitFreeArea(
  tiles: readonly FitTile[],
  width: number,
  height: number,
  insets: FitInsets,
  opts: { padding?: number } = {}
): FitResult | null {
  const freeW = width - insets.left - insets.right
  const freeH = height - insets.top - insets.bottom
  if (tiles.length === 0 || !(freeW > 0) || !(freeH > 0)) {
    return null
  }
  const pad = opts.padding ?? 24
  const scaleFor = (box: FitBox): number =>
    Math.min(
      box.w > 0 ? (freeW - pad * 2) / box.w : Infinity,
      box.h > 0 ? (freeH - pad * 2) / box.h : Infinity
    )
  let box = unionOf(tiles)
  let scale = scaleFor(box)
  let partial = false
  if (scale >= FIT_ALL_MIN_SCALE) {
    scale = Math.min(1.15, scale)
  } else {
    const withMembers = tiles.filter((t) => t.hasMembers)
    box = unionOf(withMembers.length > 0 ? withMembers : tiles)
    scale = Math.max(READABLE_FIT_MIN_SCALE, Math.min(1, scaleFor(box)))
    partial = withMembers.length < tiles.length
  }
  const place = (start: number, size: number, free: number, inset: number): number =>
    size * scale > free - pad * 2
      ? inset + pad - start * scale
      : inset + free / 2 - (start + size / 2) * scale
  return {
    scale,
    x: Math.round(place(box.x, box.w, freeW, insets.left)),
    y: Math.round(place(box.y, box.h, freeH, insets.top)),
    partial
  }
}

export type OffscreenSide = 'left' | 'right' | 'top' | 'bottom'
export type OffscreenGroup = {
  side: OffscreenSide
  count: number
  target: { x: number; y: number }
}

export function offscreenGroups(
  boxes: readonly FitBox[],
  view: View,
  width: number,
  height: number
): OffscreenGroup[] {
  const groups = new Map<OffscreenSide, { count: number; best: FitBox; dist: number }>()
  for (const b of boxes) {
    const x1 = b.x * view.scale + view.x
    const y1 = b.y * view.scale + view.y
    const x2 = x1 + b.w * view.scale
    const y2 = y1 + b.h * view.scale
    const out: [OffscreenSide, number][] = [
      ['left', -x2],
      ['right', x1 - width],
      ['top', -y2],
      ['bottom', y1 - height]
    ]
    const [side, dist] = out.reduce((m, o) => (o[1] > m[1] ? o : m))
    if (dist <= 0) {
      continue
    }
    const cur = groups.get(side)
    if (!cur) {
      groups.set(side, { count: 1, best: b, dist })
    } else {
      cur.count += 1
      if (dist < cur.dist) {
        cur.best = b
        cur.dist = dist
      }
    }
  }
  return [...groups].map(([side, g]) => ({
    side,
    count: g.count,
    target: { x: g.best.x + g.best.w / 2, y: g.best.y + g.best.h / 2 }
  }))
}
