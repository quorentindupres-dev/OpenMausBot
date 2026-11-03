import type { SpaceAsk, SpaceGoal, View } from './space'
import { doesAskMatchAgent } from './space-layout'

export const ASK_PIN_SIZE = 22
export const ASK_PIN_GAP = 4
export const ASK_PINS_PER_TILE = 5
export const ASK_EDGE_INSET = 18
export const ASK_EDGE_MERGE_PX = 30

export type AskBox = { x: number; y: number; w: number; h: number }

export type OpenAskRef = {
  ask: SpaceAsk
  tileKey: string
  n: number
}

export type AskPin = {
  askId: string
  botId: string
  tileKey: string
  n: number
  x: number
  y: number
  more: number
  askIds: string[]
  visible: boolean
}

export type AskEdge = {
  x: number
  y: number
  angle: number
  count: number
  askIds: string[]
}

export type AskPinLayout = { pins: AskPin[]; edges: AskEdge[] }

export function openAsksForAgent(
  goal: SpaceGoal | null,
  agent: { id: string; unifiedTabId?: string; name?: string }
): SpaceAsk[] {
  if (!goal) {
    return []
  }
  return goal.asks.filter(
    (ask) =>
      ask.status === 'open' &&
      (doesAskMatchAgent(ask, agent, true, 0) || (!ask.botId && !ask.forBotId))
  )
}

export function collectOpenAsks(
  goals: readonly Pick<SpaceGoal, 'id' | 'asks'>[],
  hasTile: (tileKey: string) => boolean,
  tileOfBot: (botId: string) => string | undefined = () => undefined
): OpenAskRef[] {
  const out: Omit<OpenAskRef, 'n'>[] = []
  const seen = new Set<string>()
  for (const goal of goals) {
    for (const ask of goal.asks) {
      if (ask.status !== 'open' || seen.has(ask.id)) {
        continue
      }
      const byBot = tileOfBot(ask.botId)
      const tileKey = hasTile(goal.id) ? goal.id : byBot && hasTile(byBot) ? byBot : undefined
      if (!tileKey) {
        continue
      }
      seen.add(ask.id)
      out.push({ ask, tileKey })
    }
  }
  out.sort((a, b) => a.ask.at - b.ask.at || (a.ask.id < b.ask.id ? -1 : 1))
  return out.map((ref, i) => ({ ...ref, n: i + 1 }))
}

function stackOrigin(box: AskBox, view: View): { x: number; y: number } {
  return {
    x: (box.x + box.w) * view.scale + view.x + ASK_PIN_SIZE / 2 + 6,
    y: box.y * view.scale + view.y + ASK_PIN_SIZE / 2 + 10
  }
}

export function edgePoint(
  tx: number,
  ty: number,
  width: number,
  height: number,
  inset = ASK_EDGE_INSET
): { x: number; y: number; angle: number } {
  const cx = width / 2
  const cy = height / 2
  const dx = tx - cx
  const dy = ty - cy
  const hx = Math.max(1, cx - inset)
  const hy = Math.max(1, cy - inset)
  const t = Math.min(
    dx === 0 ? Infinity : hx / Math.abs(dx),
    dy === 0 ? Infinity : hy / Math.abs(dy)
  )
  const k = Number.isFinite(t) ? t : 0
  return { x: cx + dx * k, y: cy + dy * k, angle: (Math.atan2(dy, dx) * 180) / Math.PI }
}

export function layoutAskPins(
  asks: readonly OpenAskRef[],
  boxOf: (tileKey: string) => AskBox | undefined,
  view: View,
  viewport: { width: number; height: number }
): AskPinLayout {
  const pins: AskPin[] = []
  if (!Number.isFinite(view.x) || !Number.isFinite(view.y) || !Number.isFinite(view.scale)) {
    return { pins, edges: [] }
  }
  const stackIndex = new Map<string, number>()
  const lastPinOfTile = new Map<string, AskPin>()
  const step = ASK_PIN_SIZE + ASK_PIN_GAP
  const { width, height } = viewport
  const half = ASK_PIN_SIZE / 2
  for (const ref of asks) {
    const box = boxOf(ref.tileKey)
    if (!box) {
      continue
    }
    const k = stackIndex.get(ref.tileKey) ?? 0
    stackIndex.set(ref.tileKey, k + 1)
    if (k >= ASK_PINS_PER_TILE) {
      const last = lastPinOfTile.get(ref.tileKey)
      if (last) {
        last.more += 1
        last.askIds.push(ref.ask.id)
      }
      continue
    }
    const origin = stackOrigin(box, view)
    const x = origin.x
    const y = origin.y + k * step
    const pin: AskPin = {
      askId: ref.ask.id,
      botId: ref.ask.botId,
      tileKey: ref.tileKey,
      n: ref.n,
      x,
      y,
      more: 0,
      askIds: [ref.ask.id],
      visible: x + half >= 0 && x - half <= width && y + half >= 0 && y - half <= height
    }
    pins.push(pin)
    lastPinOfTile.set(ref.tileKey, pin)
  }

  const edges: AskEdge[] = []
  if (width > 0 && height > 0) {
    const raw = pins
      .filter((pin) => !pin.visible)
      .map((pin) => ({ ...edgePoint(pin.x, pin.y, width, height), pin }))
    const perimeter = (p: { x: number; y: number }): number => {
      const ix = Math.max(ASK_EDGE_INSET, Math.min(width - ASK_EDGE_INSET, p.x))
      const iy = Math.max(ASK_EDGE_INSET, Math.min(height - ASK_EDGE_INSET, p.y))
      const top = Math.abs(iy - ASK_EDGE_INSET) < 0.5
      const right = Math.abs(ix - (width - ASK_EDGE_INSET)) < 0.5
      const bottom = Math.abs(iy - (height - ASK_EDGE_INSET)) < 0.5
      if (top) {
        return ix
      }
      if (right) {
        return width + iy
      }
      if (bottom) {
        return width + height + (width - ix)
      }
      return 2 * width + height + (height - iy)
    }
    raw.sort((a, b) => perimeter(a) - perimeter(b) || a.pin.n - b.pin.n)
    for (const item of raw) {
      const prev = edges.at(-1)
      if (prev && Math.hypot(prev.x - item.x, prev.y - item.y) < ASK_EDGE_MERGE_PX) {
        prev.count += item.pin.askIds.length
        prev.askIds.push(...item.pin.askIds)
        continue
      }
      edges.push({
        x: item.x,
        y: item.y,
        angle: item.angle,
        count: item.pin.askIds.length,
        askIds: [...item.pin.askIds]
      })
    }
    if (edges.length > 1) {
      const first = edges[0]!
      const last = edges.at(-1)!
      if (Math.hypot(first.x - last.x, first.y - last.y) < ASK_EDGE_MERGE_PX) {
        first.count += last.count
        first.askIds.push(...last.askIds)
        edges.pop()
      }
    }
    const order = new Map(asks.map((ref) => [ref.ask.id, ref.n]))
    for (const edge of edges) {
      edge.askIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    }
  }
  return { pins, edges }
}

export function viewToShowBox(
  box: AskBox,
  view: View,
  viewport: { width: number; height: number },
  padding = 48
): View {
  const { width, height } = viewport
  if (!(width > 0) || !(height > 0)) {
    return view
  }
  const fit = Math.min(
    (width - padding * 2) / Math.max(1, box.w),
    (height - padding * 2) / Math.max(1, box.h)
  )
  const want = Math.max(view.scale, 1)
  const scale = Math.max(0.18, Math.min(want, fit, 2))
  return {
    scale,
    x: width / 2 - (box.x + box.w / 2) * scale,
    y: height / 2 - (box.y + box.h / 2) * scale
  }
}

export function stepAsk(
  asks: readonly OpenAskRef[],
  current: string | null,
  dir: 1 | -1
): OpenAskRef | null {
  if (asks.length === 0) {
    return null
  }
  const at = current ? asks.findIndex((ref) => ref.ask.id === current) : -1
  if (at < 0) {
    return dir === 1 ? asks[0]! : asks.at(-1)!
  }
  return asks[(at + dir + asks.length) % asks.length]!
}
