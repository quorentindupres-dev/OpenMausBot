export type KeepOutRect = { left: number; top: number; right: number; bottom: number }

const zones = new Map<string, KeepOutRect>()
const listeners = new Set<() => void>()

export function setKeepOut(id: string, rect: KeepOutRect | null): void {
  const prev = zones.get(id)
  if (!rect) {
    if (zones.delete(id)) {
      listeners.forEach((cb) => cb())
    }
    return
  }
  if (
    prev &&
    prev.left === rect.left &&
    prev.top === rect.top &&
    prev.right === rect.right &&
    prev.bottom === rect.bottom
  ) {
    return
  }
  zones.set(id, { ...rect })
  listeners.forEach((cb) => cb())
}

export function getKeepOuts(): KeepOutRect[] {
  return [...zones.values()].map((r) => ({ ...r }))
}

export function subscribeKeepOut(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function overlapsKeepOut(rect: KeepOutRect, gap = 0): KeepOutRect | null {
  for (const z of zones.values()) {
    if (
      rect.left < z.right + gap &&
      rect.right > z.left - gap &&
      rect.top < z.bottom + gap &&
      rect.bottom > z.top - gap
    ) {
      return { ...z }
    }
  }
  return null
}

export function pushOutOfKeepOut(rect: KeepOutRect, gap = 8): KeepOutRect {
  let r = { ...rect }
  for (let i = 0; i < zones.size + 1; i++) {
    const z = overlapsKeepOut(r, 0)
    if (!z) {
      break
    }
    const w = r.right - r.left
    const h = r.bottom - r.top
    const moves = [
      { dx: z.left - gap - r.right, dy: 0 },
      { dx: 0, dy: z.top - gap - r.bottom },
      { dx: z.right + gap - r.left, dy: 0 },
      { dx: 0, dy: z.bottom + gap - r.top }
    ]
    const m = moves.reduce((a, b) =>
      Math.abs(a.dx) + Math.abs(a.dy) <= Math.abs(b.dx) + Math.abs(b.dy) ? a : b
    )
    r = {
      left: r.left + m.dx,
      top: r.top + m.dy,
      right: r.left + m.dx + w,
      bottom: r.top + m.dy + h
    }
  }
  return r
}
