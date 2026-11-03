import {
  STICKY_COLORS,
  WHITEBOARD_ARROW_ROUTINGS,
  WHITEBOARD_BORDER_STYLES,
  WHITEBOARD_FILL_STYLES,
  WHITEBOARD_FONT_FAMILIES,
  WHITEBOARD_FONT_WEIGHTS,
  WHITEBOARD_SHAPES,
  WHITEBOARD_TEXT_ALIGNS,
  type Point,
  type SpaceArrow,
  type SpaceStickyNote
} from './space'
import { remapCopiedGroups } from './whiteboard-groups'

export const WHITEBOARD_CLIP_MIME = 'application/x-xlabs-space-whiteboard+json'
export const WHITEBOARD_CLIP_WEB_MIME = `web ${WHITEBOARD_CLIP_MIME}`
export const CLIP_MAX_NOTE_CHARS = 10_000
export const CLIP_MAX_BYTES = 1024 * 1024
const AGENT_KEYS = ['goals', 'asks', 'placements', 'removedAskIds', 'agents'] as const

export type ClipSticky = Omit<
  SpaceStickyNote,
  'id' | 'createdAt' | 'hidden' | 'locked' | 'groupId'
> & { key: string; group?: string }

export type ClipArrow = Omit<SpaceArrow, 'id' | 'createdAt' | 'fromId' | 'toId' | 'hidden'> & {
  from?: string
  to?: string
}

export type WhiteboardClipPayload = { v: 1; stickies: ClipSticky[]; arrows: ClipArrow[] }

export type ClipRefusal = 'empty' | 'note-too-long' | 'too-big' | 'agent-data' | 'not-ours'
export type ClipBuild =
  | { ok: true; payload: WhiteboardClipPayload; json: string; text: string }
  | { ok: false; reason: ClipRefusal }

const REFUSAL_TEXT: Record<ClipRefusal, string> = {
  'note-too-long': `Refused: a note is longer than ${CLIP_MAX_NOTE_CHARS.toLocaleString('en-US')} characters.`,
  'too-big': 'Refused: the whiteboard copy is over 1 MB.',
  'agent-data': 'Not pasted: the clipboard holds Space or agent data.',
  'not-ours': 'Nothing to paste.',
  empty: 'Nothing to copy: select notes, shapes or text.'
}
export const clipRefusalMessage = (reason: ClipRefusal): string => REFUSAL_TEXT[reason]

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const str = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' ? v.slice(0, max) : undefined
const point = (v: unknown): Point | undefined => {
  const o = v as { x?: unknown; y?: unknown } | null
  const x = num(o?.x)
  const y = num(o?.y)
  return x !== undefined && y !== undefined ? { x, y } : undefined
}
const defined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

function clipSticky(src: Record<string, unknown>, key: string): ClipSticky {
  const opacity = num(src.opacity)
  return defined({
    key,
    group: str(src.group ?? src.groupId, 80),
    text: typeof src.text === 'string' ? src.text : '',
    color: oneOf(STICKY_COLORS, src.color) ?? 'amber',
    kind: oneOf(['note', 'text', 'shape'] as const, src.kind),
    shapeType: oneOf(WHITEBOARD_SHAPES, src.shapeType),
    fillStyle: oneOf(WHITEBOARD_FILL_STYLES, src.fillStyle),
    borderStyle: oneOf(WHITEBOARD_BORDER_STYLES, src.borderStyle),
    textAlign: oneOf(WHITEBOARD_TEXT_ALIGNS, src.textAlign),
    fontFamily: oneOf(WHITEBOARD_FONT_FAMILIES, src.fontFamily),
    fontWeight: oneOf(WHITEBOARD_FONT_WEIGHTS, src.fontWeight),
    fontSize: num(src.fontSize),
    autosize: typeof src.autosize === 'boolean' ? src.autosize : undefined,
    zIndex: num(src.zIndex),
    name: str(src.name),
    opacity: opacity === undefined ? undefined : Math.max(0, Math.min(1, opacity)),
    x: num(src.x) ?? 0,
    y: num(src.y) ?? 0,
    w: Math.max(1, num(src.w) ?? 160),
    h: Math.max(1, num(src.h) ?? 100)
  })
}

function clipArrow(src: Record<string, unknown>, from?: string, to?: string): ClipArrow {
  return defined({
    from,
    to,
    fromPoint: from ? undefined : point(src.fromPoint),
    toPoint: to ? undefined : point(src.toPoint),
    label: str(src.label, 500),
    color: oneOf(STICKY_COLORS, src.color),
    bend: num(src.bend),
    dash: oneOf(['solid', 'dashed'] as const, src.dash),
    routing: oneOf(WHITEBOARD_ARROW_ROUTINGS, src.routing),
    name: str(src.name)
  })
}

export function clipPlainText(stickies: readonly Pick<SpaceStickyNote, 'text'>[]): string {
  return stickies
    .map((s) => s.text.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export function buildClipboardPayload(
  stickies: readonly SpaceStickyNote[],
  arrows: readonly SpaceArrow[],
  ids: readonly string[],
  goalIds: ReadonlySet<string> = new Set()
): ClipBuild {
  const byId = new Map(stickies.map((s) => [s.id, s]))
  const picked: SpaceStickyNote[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const s = byId.get(id)
    if (!s || s.hidden || goalIds.has(id) || seen.has(id)) {
      continue
    }
    seen.add(id)
    picked.push(s)
  }
  if (picked.length === 0) {
    return { ok: false, reason: 'empty' }
  }
  if (picked.some((s) => s.text.length > CLIP_MAX_NOTE_CHARS)) {
    return { ok: false, reason: 'note-too-long' }
  }
  const keyOf = new Map(picked.map((s, i) => [s.id, `n${i}`]))
  const groupKey = new Map<string, string>()
  const clipStickies = picked.map((s) => {
    const group = s.groupId
      ? (groupKey.get(s.groupId) ?? groupKey.set(s.groupId, `g${groupKey.size}`).get(s.groupId))
      : undefined
    return clipSticky(
      { ...(s as unknown as Record<string, unknown>), groupId: undefined, group },
      keyOf.get(s.id) ?? ''
    )
  })
  const clipArrows: ClipArrow[] = []
  for (const a of arrows) {
    if (a.hidden || !(a.fromId || a.toId)) {
      continue
    }
    const ends = [a.fromId, a.toId].filter((e): e is string => Boolean(e))
    if (ends.some((e) => goalIds.has(e) || !keyOf.has(e))) {
      continue
    }
    clipArrows.push(
      clipArrow(
        a as unknown as Record<string, unknown>,
        a.fromId ? keyOf.get(a.fromId) : undefined,
        a.toId ? keyOf.get(a.toId) : undefined
      )
    )
  }
  const payload: WhiteboardClipPayload = { v: 1, stickies: clipStickies, arrows: clipArrows }
  const json = JSON.stringify(payload)
  if (byteLength(json) > CLIP_MAX_BYTES) {
    return { ok: false, reason: 'too-big' }
  }
  return { ok: true, payload, json, text: clipPlainText(picked) }
}

export type ClipParse =
  { ok: true; payload: WhiteboardClipPayload } | { ok: false; reason: ClipRefusal }

export function parseClipboardPayload(json: string | null | undefined): ClipParse {
  if (!json) {
    return { ok: false, reason: 'not-ours' }
  }
  if (byteLength(json) > CLIP_MAX_BYTES) {
    return { ok: false, reason: 'too-big' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    // ok: non-JSON clipboard text is rejected cleanly as 'not-ours'
    return { ok: false, reason: 'not-ours' }
  }
  const obj = raw as Record<string, unknown> | null
  if (!obj || typeof obj !== 'object' || obj.v !== 1 || !Array.isArray(obj.stickies)) {
    return { ok: false, reason: 'not-ours' }
  }
  if (AGENT_KEYS.some((k) => k in obj)) {
    return { ok: false, reason: 'agent-data' }
  }
  const stickies: ClipSticky[] = []
  const keys = new Set<string>()
  for (const item of obj.stickies as unknown[]) {
    const s = item as Record<string, unknown> | null
    if (!s || typeof s !== 'object') {
      continue
    }
    if (AGENT_KEYS.some((k) => k in s) || 'botId' in s || 'goalId' in s) {
      return { ok: false, reason: 'agent-data' }
    }
    if (typeof s.text === 'string' && s.text.length > CLIP_MAX_NOTE_CHARS) {
      return { ok: false, reason: 'note-too-long' }
    }
    const key = typeof s.key === 'string' && !keys.has(s.key) ? s.key : `n${stickies.length}`
    keys.add(key)
    stickies.push(clipSticky(s, key))
  }
  if (stickies.length === 0) {
    return { ok: false, reason: 'empty' }
  }
  const arrows: ClipArrow[] = []
  for (const item of Array.isArray(obj.arrows) ? (obj.arrows as unknown[]) : []) {
    const a = item as Record<string, unknown> | null
    if (!a || typeof a !== 'object') {
      continue
    }
    const from = typeof a.from === 'string' ? a.from : undefined
    const to = typeof a.to === 'string' ? a.to : undefined
    if (
      (a.from !== undefined && !(from && keys.has(from))) ||
      (a.to !== undefined && !(to && keys.has(to)))
    ) {
      continue
    }
    if (!from && !to) {
      continue
    }
    arrows.push(clipArrow(a, from, to))
  }
  return { ok: true, payload: { v: 1, stickies, arrows } }
}

export function textToPayload(text: string): ClipParse {
  const t = text.replace(/\r\n?/g, '\n').trim()
  if (!t) {
    return { ok: false, reason: 'not-ours' }
  }
  if (t.length > CLIP_MAX_NOTE_CHARS) {
    return { ok: false, reason: 'note-too-long' }
  }
  const lines = t.split('\n')
  const w = Math.min(560, Math.max(160, Math.max(...lines.map((l) => l.length)) * 8 + 32))
  const h = Math.min(600, Math.max(80, lines.length * 22 + 36))
  return {
    ok: true,
    payload: {
      v: 1,
      stickies: [{ key: 'n0', text: t, color: 'amber', kind: 'note', x: 0, y: 0, w, h }],
      arrows: []
    }
  }
}

export type ClipBatch = {
  stickies: (Omit<SpaceStickyNote, 'id' | 'createdAt'> & { id: string })[]
  arrows: Omit<SpaceArrow, 'id' | 'createdAt'>[]
}

export function planPaste(
  payload: WhiteboardClipPayload,
  opts: { at?: Point | null; offset?: Point; room: number; makeKey?: () => string }
): ClipBatch & { dropped: number } {
  let seq = 0
  const makeKey = opts.makeKey ?? (() => `clip-${Date.now().toString(36)}-${seq++}`)
  const room = Math.max(0, opts.room)
  const kept = payload.stickies.slice(0, room)
  const dropped = payload.stickies.length - kept.length
  const minX = kept.length > 0 ? Math.min(...kept.map((s) => s.x)) : 0
  const minY = kept.length > 0 ? Math.min(...kept.map((s) => s.y)) : 0
  const dx = kept.length === 0 ? 0 : opts.at ? opts.at.x - minX : (opts.offset?.x ?? 0)
  const dy = kept.length === 0 ? 0 : opts.at ? opts.at.y - minY : (opts.offset?.y ?? 0)
  const groupCount = new Map<string, number>()
  for (const s of kept) {
    if (s.group) {
      groupCount.set(s.group, (groupCount.get(s.group) ?? 0) + 1)
    }
  }
  const regrouped = remapCopiedGroups(
    kept.map((s) => ({
      groupId: s.group && (groupCount.get(s.group) ?? 0) >= 2 ? s.group : undefined
    }))
  )
  const keyMap = new Map<string, string>()
  const stickies = kept.map((s, i) => {
    const { key, group: _group, ...look } = s
    const id = makeKey()
    keyMap.set(key, id)
    const groupId = regrouped[i]?.groupId
    return { ...look, id, x: s.x + dx, y: s.y + dy, ...(groupId ? { groupId } : {}) }
  })
  const arrows: ClipBatch['arrows'] = []
  for (const a of payload.arrows) {
    const fromId = a.from ? keyMap.get(a.from) : undefined
    const toId = a.to ? keyMap.get(a.to) : undefined
    if ((a.from && !fromId) || (a.to && !toId)) {
      continue
    }
    const { from: _f, to: _t, ...rest } = a
    arrows.push(
      defined({
        ...rest,
        fromId,
        toId,
        fromPoint: a.fromPoint ? { x: a.fromPoint.x + dx, y: a.fromPoint.y + dy } : undefined,
        toPoint: a.toPoint ? { x: a.toPoint.x + dx, y: a.toPoint.y + dy } : undefined
      })
    )
  }
  return { stickies, arrows, dropped }
}
