// Vendored & merged lightweight whiteboard geometry for Cards, Shapes, Arrows, and Text.
// Zero external dependencies; designed for React + CSS translate3d/scale + SVG overlays.
//
// Attribution & Licenses (MIT):
// - quickdrawjs/quickdraw (packages/core/src/{geometry,shapes,editor}.js) — MIT License
// - Toeverything / AFFiNE (@blocksuite/affine-gfx-connector & @blocksuite/affine-gfx-text) — MIT License

export type WhiteboardPoint = { x: number; y: number }
export type WhiteboardRect = { x: number; y: number; w: number; h: number }
export type CardinalSide = 'top' | 'right' | 'bottom' | 'left'

export const STICKY_COLORS = [
  'amber',
  'emerald',
  'sky',
  'rose',
  'violet',
  'indigo',
  'paper',
  'zinc'
] as const
export type StickyColor = (typeof STICKY_COLORS)[number]

export const WHITEBOARD_SHAPES = ['rounded', 'rect', 'pill', 'ellipse', 'diamond'] as const
export type WhiteboardShapeType = (typeof WHITEBOARD_SHAPES)[number]

export const WHITEBOARD_FILL_STYLES = [
  'none',
  'soft',
  'solid',
  'glass',
  'paper',
  'paper-light'
] as const
export type WhiteboardFillStyle = (typeof WHITEBOARD_FILL_STYLES)[number]

export const WHITEBOARD_BORDER_STYLES = ['none', 'solid', 'dashed'] as const
export type WhiteboardBorderStyle = (typeof WHITEBOARD_BORDER_STYLES)[number]

export const WHITEBOARD_TEXT_ALIGNS = ['left', 'center', 'right'] as const
export type WhiteboardTextAlign = (typeof WHITEBOARD_TEXT_ALIGNS)[number]

export const WHITEBOARD_FONT_FAMILIES = ['sans', 'serif', 'mono'] as const
export type WhiteboardFontFamily = (typeof WHITEBOARD_FONT_FAMILIES)[number]

export const WHITEBOARD_FONT_WEIGHTS = ['normal', 'semibold', 'bold'] as const
export type WhiteboardFontWeight = (typeof WHITEBOARD_FONT_WEIGHTS)[number]

export const WHITEBOARD_ARROW_ROUTINGS = ['curve', 'elbow', 'straight'] as const
export type WhiteboardArrowRouting = (typeof WHITEBOARD_ARROW_ROUTINGS)[number]

export type WhiteboardSurfaceStyle = {
  fillStyle: WhiteboardFillStyle
  borderStyle: WhiteboardBorderStyle
  backgroundColor: string
  borderColor: string
  textColor: string
  placeholderColor: string
  accentHex: string
  backdropBlur: boolean
  isLight: boolean
}

const SURFACE_PALETTE: Record<
  StickyColor,
  readonly [string, string, string, string, string, string, string, boolean]
> = {
  amber: ['251, 191, 36', '#fbbf24', '#fffbeb', '#fef3c7', '#f59e0b', '#fbbf24', '#18181b', true],
  emerald: ['52, 211, 153', '#34d399', '#ecfdf5', '#d1fae5', '#10b981', '#34d399', '#09090b', true],
  sky: ['56, 189, 248', '#38bdf8', '#f0f9ff', '#e0f2fe', '#0ea5e9', '#38bdf8', '#09090b', true],
  rose: ['251, 113, 133', '#fb7185', '#fff1f2', '#ffe4e6', '#9f1239', '#fb7185', '#ffffff', false],
  violet: [
    '167, 139, 250',
    '#a78bfa',
    '#f5f3ff',
    '#ede9fe',
    '#6d28d9',
    '#a78bfa',
    '#ffffff',
    false
  ],
  indigo: [
    '129, 140, 248',
    '#818cf8',
    '#eef2ff',
    '#e0e7ff',
    '#4338ca',
    '#818cf8',
    '#ffffff',
    false
  ],
  paper: ['250, 249, 246', '#faf9f6', '#faf9f6', '#faf9f6', '#faf9f6', '#d6d3cb', '#141413', true],
  zinc: ['161, 161, 170', '#a1a1aa', '#f4f4f5', '#f4f4f5', '#27272a', '#71717a', '#fafafa', false]
}

export function resolveWhiteboardSurfaceStyle(options: {
  kind?: 'note' | 'text' | 'shape'
  color?: StickyColor
  fillStyle?: WhiteboardFillStyle
  borderStyle?: WhiteboardBorderStyle
}): WhiteboardSurfaceStyle {
  const kind = options.kind === 'text' || options.kind === 'shape' ? options.kind : 'note'
  const color = options.color && STICKY_COLORS.includes(options.color) ? options.color : 'amber'
  const fillStyle: WhiteboardFillStyle =
    options.fillStyle && WHITEBOARD_FILL_STYLES.includes(options.fillStyle)
      ? options.fillStyle
      : kind === 'text'
        ? 'none'
        : 'soft'
  const borderStyle: WhiteboardBorderStyle =
    options.borderStyle && WHITEBOARD_BORDER_STYLES.includes(options.borderStyle)
      ? options.borderStyle
      : kind === 'text' && fillStyle === 'none'
        ? 'none'
        : 'solid'
  const [rgb, accentHex, softText, noneText, solidBg, solidBorder, solidText, solidLight] =
    SURFACE_PALETTE[color]
  const hasBorder = borderStyle !== 'none'
  switch (fillStyle) {
    case 'paper':
      return {
        fillStyle,
        borderStyle,
        backgroundColor: 'rgba(16, 17, 21, 0.94)',
        borderColor: hasBorder ? 'rgba(255, 255, 255, 0.16)' : 'transparent',
        textColor: '#f4f4f5',
        placeholderColor: 'rgba(244, 244, 245, 0.45)',
        accentHex,
        backdropBlur: true,
        isLight: false
      }
    case 'paper-light':
      return {
        fillStyle,
        borderStyle,
        backgroundColor: '#faf9f6',
        borderColor: hasBorder ? '#d6d3cb' : 'transparent',
        textColor: '#141413',
        placeholderColor: 'rgba(20, 20, 19, 0.45)',
        accentHex,
        backdropBlur: false,
        isLight: true
      }
    case 'solid':
      return {
        fillStyle,
        borderStyle,
        backgroundColor: solidBg,
        borderColor: hasBorder ? solidBorder : 'transparent',
        textColor: solidText,
        placeholderColor: solidLight ? 'rgba(24, 24, 27, 0.5)' : 'rgba(255, 255, 255, 0.55)',
        accentHex,
        backdropBlur: false,
        isLight: solidLight
      }
    case 'glass':
      return {
        fillStyle,
        borderStyle,
        backgroundColor: 'rgba(24, 24, 27, 0.86)',
        borderColor: hasBorder ? `rgba(${rgb}, 0.42)` : 'transparent',
        textColor: softText,
        placeholderColor: 'rgba(244, 244, 245, 0.45)',
        accentHex,
        backdropBlur: true,
        isLight: false
      }
    case 'none':
      return {
        fillStyle,
        borderStyle,
        backgroundColor: 'transparent',
        borderColor: hasBorder ? `rgba(${rgb}, 0.65)` : 'transparent',
        textColor: noneText,
        placeholderColor: 'rgba(244, 244, 245, 0.42)',
        accentHex,
        backdropBlur: false,
        isLight: false
      }
    case 'soft':
      return {
        fillStyle,
        borderStyle,
        backgroundColor: `rgba(${rgb}, 0.18)`,
        borderColor: hasBorder ? `rgba(${rgb}, 0.55)` : 'transparent',
        textColor: softText,
        placeholderColor: 'rgba(244, 244, 245, 0.45)',
        accentHex,
        backdropBlur: true,
        isLight: false
      }
  }
}

export const CARDINAL_PORTS: readonly {
  side: CardinalSide
  rx: number
  ry: number
  nx: number
  ny: number
}[] = [
  { side: 'top', rx: 0.5, ry: 0, nx: 0, ny: -1 },
  { side: 'right', rx: 1, ry: 0.5, nx: 1, ny: 0 },
  { side: 'bottom', rx: 0.5, ry: 1, nx: 0, ny: 1 },
  { side: 'left', rx: 0, ry: 0.5, nx: -1, ny: 0 }
]

export function clampNum(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val
}

export function snapAxisDelta(dx: number, dy: number): { dx: number; dy: number } {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy }
}

export function snapPointAngle15Deg(
  origin: WhiteboardPoint,
  target: WhiteboardPoint
): WhiteboardPoint {
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  const step = Math.PI / 12
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  const len = Math.hypot(dx, dy)
  return {
    x: Math.round(origin.x + Math.cos(angle) * len),
    y: Math.round(origin.y + Math.sin(angle) * len)
  }
}

export function getCardinalPortPoints(
  box: WhiteboardRect
): { side: CardinalSide; x: number; y: number; nx: number; ny: number }[] {
  return CARDINAL_PORTS.map((p) => ({
    side: p.side,
    x: Math.round(box.x + box.w * p.rx),
    y: Math.round(box.y + box.h * p.ry),
    nx: p.nx,
    ny: p.ny
  }))
}

export function resolveSmartBoxAnchor(
  box: WhiteboardRect,
  toward: WhiteboardPoint
): { point: WhiteboardPoint; nx: number; ny: number; side: CardinalSide } {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    return { point: { x: Math.round(cx), y: Math.round(box.y) }, nx: 0, ny: -1, side: 'top' }
  }
  const hw = Math.max(1, box.w / 2)
  const hh = Math.max(1, box.h / 2)
  const scaleX = Math.abs(dx) > 0.001 ? hw / Math.abs(dx) : Number.POSITIVE_INFINITY
  const scaleY = Math.abs(dy) > 0.001 ? hh / Math.abs(dy) : Number.POSITIVE_INFINITY
  if (scaleX <= scaleY) {
    const right = dx >= 0
    return {
      point: {
        x: Math.round(cx + (right ? hw : -hw)),
        y: Math.round(clampNum(cy + dy * scaleX, box.y + 10, box.y + box.h - 10))
      },
      nx: right ? 1 : -1,
      ny: 0,
      side: right ? 'right' : 'left'
    }
  }
  const bottom = dy >= 0
  return {
    point: {
      x: Math.round(clampNum(cx + dx * scaleY, box.x + 10, box.x + box.w - 10)),
      y: Math.round(cy + (bottom ? hh : -hh))
    },
    nx: 0,
    ny: bottom ? 1 : -1,
    side: bottom ? 'bottom' : 'top'
  }
}

export function computeSignedBendFromPoint(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  pointer: WhiteboardPoint,
  snapZeroThreshold = 7
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const rawBend =
    (pointer.x - (start.x + end.x) / 2) * nx + (pointer.y - (start.y + end.y) / 2) * ny
  return Math.abs(rawBend) < snapZeroThreshold ? 0 : Math.round(clampNum(rawBend, -1200, 1200))
}

function buildElbowPath(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  n0: { nx: number; ny: number },
  n1: { nx: number; ny: number },
  bend: number
): { mid: WhiteboardPoint; path: string } {
  const esc = 24
  let raw: WhiteboardPoint[]
  if (n0.ny === 0 && n1.ny === 0) {
    if (n0.nx === n1.nx) {
      const ox = n0.nx > 0 ? Math.max(start.x, end.x) + esc : Math.min(start.x, end.x) - esc
      raw = [start, { x: ox, y: start.y }, { x: ox, y: end.y }, end]
    } else if ((end.x - start.x) * n0.nx >= 0) {
      const span = Math.abs(end.x - start.x)
      const mx =
        span > 32 && Math.abs(bend) >= 1
          ? clampNum(
              Math.round((start.x + end.x) / 2 + bend),
              Math.min(start.x, end.x) + 16,
              Math.max(start.x, end.x) - 16
            )
          : Math.round((start.x + end.x) / 2)
      raw =
        start.y === end.y ? [start, end] : [start, { x: mx, y: start.y }, { x: mx, y: end.y }, end]
    } else {
      const sx0 = start.x + n0.nx * esc
      const sx1 = end.x + n1.nx * esc
      const my = Math.round((start.y + end.y) / 2 + bend)
      raw = [
        start,
        { x: sx0, y: start.y },
        { x: sx0, y: my },
        { x: sx1, y: my },
        { x: sx1, y: end.y },
        end
      ]
    }
  } else if (n0.nx === 0 && n1.nx === 0) {
    if (n0.ny === n1.ny) {
      const oy = n0.ny > 0 ? Math.max(start.y, end.y) + esc : Math.min(start.y, end.y) - esc
      raw = [start, { x: start.x, y: oy }, { x: end.x, y: oy }, end]
    } else if ((end.y - start.y) * n0.ny >= 0) {
      const span = Math.abs(end.y - start.y)
      const my =
        span > 32 && Math.abs(bend) >= 1
          ? clampNum(
              Math.round((start.y + end.y) / 2 + bend),
              Math.min(start.y, end.y) + 16,
              Math.max(start.y, end.y) - 16
            )
          : Math.round((start.y + end.y) / 2)
      raw =
        start.x === end.x ? [start, end] : [start, { x: start.x, y: my }, { x: end.x, y: my }, end]
    } else {
      const sy0 = start.y + n0.ny * esc
      const sy1 = end.y + n1.ny * esc
      const mx = Math.round((start.x + end.x) / 2 + bend)
      raw = [
        start,
        { x: start.x, y: sy0 },
        { x: mx, y: sy0 },
        { x: mx, y: sy1 },
        { x: end.x, y: sy1 },
        end
      ]
    }
  } else if (n0.ny === 0) {
    if ((end.x - start.x) * n0.nx >= 0 && (start.y - end.y) * n1.ny >= 0) {
      raw = [start, { x: end.x, y: start.y }, end]
    } else {
      const sx =
        (end.x - start.x) * n0.nx >= esc ? Math.round((start.x + end.x) / 2) : start.x + n0.nx * esc
      const sy =
        (start.y - end.y) * n1.ny >= esc ? Math.round((start.y + end.y) / 2) : end.y + n1.ny * esc
      raw = [start, { x: sx, y: start.y }, { x: sx, y: sy }, { x: end.x, y: sy }, end]
    }
  } else if ((end.y - start.y) * n0.ny >= 0 && (start.x - end.x) * n1.nx >= 0) {
    raw = [start, { x: start.x, y: end.y }, end]
  } else {
    const sy =
      (end.y - start.y) * n0.ny >= esc ? Math.round((start.y + end.y) / 2) : start.y + n0.ny * esc
    const sx =
      (start.x - end.x) * n1.nx >= esc ? Math.round((start.x + end.x) / 2) : end.x + n1.nx * esc
    raw = [start, { x: start.x, y: sy }, { x: sx, y: sy }, { x: sx, y: end.y }, end]
  }

  const pts: WhiteboardPoint[] = []
  for (const pt of raw) {
    const prev = pts.at(-1)
    if (prev && prev.x === pt.x && prev.y === pt.y) {
      continue
    }
    const prev2 = pts.at(-2)
    if (
      prev &&
      prev2 &&
      ((prev2.x === prev.x && prev.x === pt.x && (pt.y - prev.y) * (prev.y - prev2.y) >= 0) ||
        (prev2.y === prev.y && prev.y === pt.y && (pt.x - prev.x) * (prev.x - prev2.x) >= 0))
    ) {
      pts[pts.length - 1] = pt
      continue
    }
    pts.push(pt)
  }
  if (pts.length < 2) {
    return { mid: start, path: `M ${start.x} ${start.y} L ${end.x} ${end.y}` }
  }
  const pFirst = pts[0]!
  const pSecond = pts[1]!
  const pThird = pts[2]
  const segIdx =
    pts.length === 3 && pThird
      ? Math.hypot(pSecond.x - pFirst.x, pSecond.y - pFirst.y) >=
        Math.hypot(pThird.x - pSecond.x, pThird.y - pSecond.y)
        ? 0
        : 1
      : Math.floor((pts.length - 1) / 2)
  const segA = pts[segIdx]!
  const segB = pts[segIdx + 1]!
  const mid = {
    x: Math.round((segA.x + segB.x) / 2),
    y: Math.round((segA.y + segB.y) / 2)
  }
  const parts = [`M ${pFirst.x} ${pFirst.y}`]
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const r = Math.min(8, l1 / 2, l2 / 2)
    if (r < 1) {
      parts.push(`L ${p1.x} ${p1.y}`)
    } else {
      const ix = Math.round((p1.x - ((p1.x - p0.x) / l1) * r) * 10) / 10
      const iy = Math.round((p1.y - ((p1.y - p0.y) / l1) * r) * 10) / 10
      const ox = Math.round((p1.x + ((p2.x - p1.x) / l2) * r) * 10) / 10
      const oy = Math.round((p1.y + ((p2.y - p1.y) / l2) * r) * 10) / 10
      parts.push(`L ${ix} ${iy} Q ${p1.x} ${p1.y} ${ox} ${oy}`)
    }
  }
  const last = pts.at(-1)!
  parts.push(`L ${last.x} ${last.y}`)
  return { mid, path: parts.join(' ') }
}

export function resolveArrowPathAndHandles(
  arrow: {
    fromId?: string
    toId?: string
    fromPoint?: WhiteboardPoint
    toPoint?: WhiteboardPoint
    bend?: number
    routing?: WhiteboardArrowRouting
  },
  boxMap: ReadonlyMap<string, WhiteboardRect>,
  routingOverride?: WhiteboardArrowRouting
): {
  start: WhiteboardPoint
  end: WhiteboardPoint
  mid: WhiteboardPoint
  bendHandle: WhiteboardPoint
  path: string
} | null {
  const fromBox = arrow.fromId ? boxMap.get(arrow.fromId) : undefined
  const toBox = arrow.toId ? boxMap.get(arrow.toId) : undefined
  const fromCenter = fromBox
    ? { x: fromBox.x + fromBox.w / 2, y: fromBox.y + fromBox.h / 2 }
    : arrow.fromPoint
  const toCenter = toBox ? { x: toBox.x + toBox.w / 2, y: toBox.y + toBox.h / 2 } : arrow.toPoint
  if (!fromCenter || !toCenter) {
    return null
  }

  const startAnchor = fromBox ? resolveSmartBoxAnchor(fromBox, toCenter) : null
  const start = startAnchor ? startAnchor.point : fromCenter
  const endAnchor = toBox ? resolveSmartBoxAnchor(toBox, start) : null
  const end = endAnchor ? endAnchor.point : toCenter
  const refinedStartAnchor = fromBox ? resolveSmartBoxAnchor(fromBox, end) : null
  const finalStart = refinedStartAnchor ? refinedStartAnchor.point : start

  const dx = end.x - finalStart.x
  const dy = end.y - finalStart.y
  const dist = Math.hypot(dx, dy)
  const bend = typeof arrow.bend === 'number' && Number.isFinite(arrow.bend) ? arrow.bend : 0
  const routing: WhiteboardArrowRouting = routingOverride ?? arrow.routing ?? 'curve'
  const horizontal = Math.abs(dx) >= Math.abs(dy)

  if (routing === 'elbow') {
    const n0 = refinedStartAnchor ?? {
      nx: horizontal ? (dx >= 0 ? 1 : -1) : 0,
      ny: horizontal ? 0 : dy >= 0 ? 1 : -1
    }
    const n1 = endAnchor ?? {
      nx: horizontal ? (dx >= 0 ? -1 : 1) : 0,
      ny: horizontal ? 0 : dy >= 0 ? -1 : 1
    }
    const elbow = buildElbowPath(finalStart, end, n0, n1, bend)
    return { start: finalStart, end, mid: elbow.mid, bendHandle: elbow.mid, path: elbow.path }
  }

  if (Math.abs(bend) >= 1) {
    const len = dist || 1
    const cx = finalStart.x + dx / 2 + (-dy / len) * bend * 2
    const cy = finalStart.y + dy / 2 + (dx / len) * bend * 2
    const mid = {
      x: Math.round(0.25 * finalStart.x + 0.5 * cx + 0.25 * end.x),
      y: Math.round(0.25 * finalStart.y + 0.5 * cy + 0.25 * end.y)
    }
    return {
      start: finalStart,
      end,
      mid,
      bendHandle: mid,
      path: `M ${finalStart.x} ${finalStart.y} Q ${Math.round(cx)} ${Math.round(cy)} ${end.x} ${end.y}`
    }
  }

  if (routing === 'straight' || (!refinedStartAnchor && !endAnchor)) {
    const mid = {
      x: Math.round((finalStart.x + end.x) / 2),
      y: Math.round((finalStart.y + end.y) / 2)
    }
    return {
      start: finalStart,
      end,
      mid,
      bendHandle: mid,
      path: `M ${finalStart.x} ${finalStart.y} L ${end.x} ${end.y}`
    }
  }

  const pull = clampNum(dist * 0.42, 24, 180)
  const cx1 = refinedStartAnchor
    ? finalStart.x + refinedStartAnchor.nx * pull
    : horizontal
      ? finalStart.x + dx * 0.45
      : finalStart.x
  const cy1 = refinedStartAnchor
    ? finalStart.y + refinedStartAnchor.ny * pull
    : horizontal
      ? finalStart.y
      : finalStart.y + dy * 0.45
  const cx2 = endAnchor ? end.x + endAnchor.nx * pull : horizontal ? end.x - dx * 0.45 : end.x
  const cy2 = endAnchor ? end.y + endAnchor.ny * pull : horizontal ? end.y : end.y - dy * 0.45
  const mid = {
    x: Math.round((finalStart.x + 3 * cx1 + 3 * cx2 + end.x) / 8),
    y: Math.round((finalStart.y + 3 * cy1 + 3 * cy2 + end.y) / 8)
  }
  return {
    start: finalStart,
    end,
    mid,
    bendHandle: mid,
    path: `M ${finalStart.x} ${finalStart.y} C ${Math.round(cx1)} ${Math.round(cy1)}, ${Math.round(cx2)} ${Math.round(cy2)}, ${end.x} ${end.y}`
  }
}

function estimateTextLinePx(line: string, fontSize: number): number {
  let units = 0
  for (const ch of Array.from(line)) {
    const code = ch.codePointAt(0) ?? 0
    units += code > 0x1f000 ? 1.18 : ch === ' ' ? 0.34 : 0.6
  }
  return Math.ceil(units * fontSize)
}

export function computeShapeDimensions(
  text: string,
  fontSize: number,
  boxW: number,
  boxH: number,
  shapeType: WhiteboardShapeType = 'rounded'
): { w: number; h: number } {
  const w = clampNum(Math.round(boxW || 160), 64, 1600)
  const minH = clampNum(Math.round(boxH || 80), 44, 1600)
  if (!text) {
    return { w, h: minH }
  }
  const safeFont = clampNum(fontSize || 16, 12, 120)
  const lineHeight = safeFont * 1.32
  const usableW =
    shapeType === 'diamond'
      ? Math.max(32, Math.floor(w * 0.54) - 12)
      : shapeType === 'ellipse'
        ? Math.max(36, Math.floor(w * 0.72) - 16)
        : shapeType === 'pill'
          ? Math.max(36, w - 34)
          : Math.max(40, w - 24)
  let visualLines = 0
  for (const line of text.split('\n')) {
    visualLines += Math.max(1, Math.ceil(estimateTextLinePx(line, safeFont) / usableW))
  }
  const textH = visualLines * lineHeight
  const neededH =
    shapeType === 'diamond'
      ? Math.ceil(textH * 1.65 + 32)
      : shapeType === 'ellipse'
        ? Math.ceil(textH * 1.32 + 26)
        : shapeType === 'pill'
          ? Math.ceil(textH + 22)
          : Math.ceil(textH + 20)
  return { w, h: clampNum(Math.max(44, minH, neededH), 44, 2400) }
}

export function computeAutoTextDimensions(
  text: string,
  fontSize: number,
  currentW: number,
  autosize = true,
  maxAutoWOrHasBg: number | boolean = 920,
  hasBackgroundArg = false
): { w: number; h: number } {
  const maxAutoW = typeof maxAutoWOrHasBg === 'number' ? maxAutoWOrHasBg : 920
  const hasBackground = typeof maxAutoWOrHasBg === 'boolean' ? maxAutoWOrHasBg : hasBackgroundArg
  const safeFont = clampNum(fontSize, 12, 200)
  const lineHeight = safeFont * 1.24
  const padX = hasBackground ? 36 : 24
  const padY = hasBackground ? 28 : 22
  const rawLines = (text.length > 0 ? text : 'Write something…').split('\n')
  const w = autosize
    ? clampNum(
        Math.max(0, ...rawLines.map((l) => estimateTextLinePx(l, safeFont))) + padX + 12,
        Math.max(96, Math.round(safeFont * 2.2)),
        maxAutoW
      )
    : clampNum(currentW || 240, 90, 1600)
  const usableW = Math.max(40, w - padX)
  let visualLines = 0
  for (const line of rawLines) {
    visualLines += Math.max(1, Math.ceil(estimateTextLinePx(line, safeFont) / usableW))
  }
  return { w, h: Math.max(hasBackground ? 48 : 44, Math.ceil(visualLines * lineHeight + padY)) }
}

export function computeCardMinHeight(
  text: string,
  fontSize: number,
  cardW: number,
  baseH: number
): number {
  const safeFont = clampNum(fontSize, 12, 64)
  const charsPerLine = Math.max(6, Math.floor(Math.max(80, cardW - 28) / (safeFont * 0.56)))
  let visualLines = 0
  for (const line of (text || '').split('\n')) {
    visualLines += Math.max(1, Math.ceil(Array.from(line).length / charsPerLine))
  }
  return Math.max(96, baseH, Math.ceil(visualLines * safeFont * 1.55 + 68))
}

export function alignWhiteboardItems<
  T extends { id: string; x: number; y: number; w: number; h: number }
>(
  items: readonly T[],
  mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
): Record<string, { x: number; y: number }> {
  if (items.length === 0) {
    return {}
  }
  const minX = Math.min(...items.map((i) => i.x))
  const maxX = Math.max(...items.map((i) => i.x + i.w))
  const minY = Math.min(...items.map((i) => i.y))
  const maxY = Math.max(...items.map((i) => i.y + i.h))
  const out: Record<string, { x: number; y: number }> = {}
  for (const item of items) {
    switch (mode) {
      case 'left':
        out[item.id] = { x: Math.round(minX), y: Math.round(item.y) }
        break
      case 'center':
        out[item.id] = { x: Math.round((minX + maxX) / 2 - item.w / 2), y: Math.round(item.y) }
        break
      case 'right':
        out[item.id] = { x: Math.round(maxX - item.w), y: Math.round(item.y) }
        break
      case 'top':
        out[item.id] = { x: Math.round(item.x), y: Math.round(minY) }
        break
      case 'middle':
        out[item.id] = { x: Math.round(item.x), y: Math.round((minY + maxY) / 2 - item.h / 2) }
        break
      case 'bottom':
        out[item.id] = { x: Math.round(item.x), y: Math.round(maxY - item.h) }
        break
    }
  }
  return out
}

export function distributeWhiteboardItems<
  T extends { id: string; x: number; y: number; w: number; h: number }
>(items: readonly T[], axis: 'horizontal' | 'vertical'): Record<string, { x: number; y: number }> {
  if (items.length === 0) {
    return {}
  }
  const out: Record<string, { x: number; y: number }> = {}
  if (items.length < 3) {
    for (const item of items) {
      out[item.id] = { x: Math.round(item.x), y: Math.round(item.y) }
    }
    return out
  }
  const sorted = [...items].sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y))
  const first = sorted[0]!
  const last = sorted.at(-1)!
  if (axis === 'horizontal') {
    const totalSize = sorted.reduce((sum, i) => sum + i.w, 0)
    const gap = (last.x + last.w - first.x - totalSize) / (sorted.length - 1)
    let cursor = first.x
    for (const item of sorted) {
      out[item.id] = { x: Math.round(cursor), y: Math.round(item.y) }
      cursor += item.w + gap
    }
    return out
  }
  const totalSize = sorted.reduce((sum, i) => sum + i.h, 0)
  const gap = (last.y + last.h - first.y - totalSize) / (sorted.length - 1)
  let cursor = first.y
  for (const item of sorted) {
    out[item.id] = { x: Math.round(item.x), y: Math.round(cursor) }
    cursor += item.h + gap
  }
  return out
}

export function rectIntersectsBox(a: WhiteboardRect, b: WhiteboardRect): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
}

export function normalizeMarqueeRect(
  start: WhiteboardPoint,
  current: WhiteboardPoint
): WhiteboardRect {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    w: Math.abs(current.x - start.x),
    h: Math.abs(current.y - start.y)
  }
}
