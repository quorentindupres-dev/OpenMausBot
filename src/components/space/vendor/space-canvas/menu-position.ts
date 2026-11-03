export type MenuPoint = { x: number; y: number }

export function clampMenuPoint(
  point: MenuPoint,
  menu: { w: number; h: number },
  viewport: { w: number; h: number },
  margin = 8
): MenuPoint {
  let x = point.x
  let y = point.y
  if (x + menu.w > viewport.w - margin) {
    x = point.x - menu.w >= margin ? point.x - menu.w : viewport.w - menu.w - margin
  }
  if (y + menu.h > viewport.h - margin) {
    y = point.y - menu.h >= margin ? point.y - menu.h : viewport.h - menu.h - margin
  }
  x = Math.min(x, viewport.w - menu.w - margin)
  y = Math.min(y, viewport.h - menu.h - margin)
  return { x: Math.max(margin, x), y: Math.max(margin, y) }
}

export function canvasCenterPoint(canvas: HTMLElement | null): MenuPoint {
  if (!canvas) {
    return { x: 160, y: 120 }
  }
  const rect = canvas.getBoundingClientRect()
  const vx = Number(canvas.dataset.viewX ?? 0)
  const vy = Number(canvas.dataset.viewY ?? 0)
  const scale = Number(canvas.dataset.viewScale ?? 1) || 1
  return {
    x: Math.round((rect.width / 2 - vx) / scale),
    y: Math.round((rect.height / 2 - vy) / scale)
  }
}

export type SlotBox = { x: number; y: number; w: number; h: number }

export function canvasTileBoxes(canvas: HTMLElement | null): SlotBox[] {
  if (!canvas) {
    return []
  }
  return Array.from(
    canvas.querySelectorAll<HTMLElement>('[data-space-tile], [data-canvas-node]')
  ).map((el) => ({
    x: Number.parseFloat(el.style.left) || 0,
    y: Number.parseFloat(el.style.top) || 0,
    w: Number.parseFloat(el.style.width) || el.offsetWidth || 340,
    h: Number.parseFloat(el.style.minHeight) || el.offsetHeight || 220
  }))
}

export function nearestFreeSlot(
  center: MenuPoint,
  size: { w: number; h: number },
  occupied: readonly SlotBox[],
  opts: { gap?: number; step?: number; maxRings?: number } = {}
): MenuPoint {
  const gap = opts.gap ?? 24
  const step = opts.step ?? 40
  const maxRings = opts.maxRings ?? 80
  const x0 = center.x - size.w / 2
  const y0 = center.y - size.h / 2
  const free = (x: number, y: number): boolean =>
    occupied.every(
      (o) =>
        x + size.w + gap <= o.x ||
        x >= o.x + o.w + gap ||
        y + size.h + gap <= o.y ||
        y >= o.y + o.h + gap
    )
  for (let ring = 0; ring <= maxRings; ring++) {
    let best: MenuPoint | null = null
    let bestDist = Infinity
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) {
          continue
        }
        const x = x0 + i * step
        const y = y0 + j * step
        const d = Math.hypot(i, j)
        if (d < bestDist && free(x, y)) {
          best = { x, y }
          bestDist = d
        }
      }
    }
    if (best) {
      return { x: Math.round(best.x), y: Math.round(best.y) }
    }
  }
  return { x: Math.round(x0), y: Math.round(y0) }
}
