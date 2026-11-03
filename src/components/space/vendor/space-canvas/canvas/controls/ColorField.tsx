// WS-E (TASK_16 wave 2): fill colour + opacity for the floating item inspector. Idea from G_app-Data's
// library ColorPicker / NumericInput (themselves from Penpot's ui/workspace/colorpicker/* and
// ds/controls/numeric_input.cljs); re-implemented here because Orca cannot import G_app-Data. The colour
// maths are the MPL port in shared/orca-plus/penpot-mpl/colors.ts (imported, not copied).
// A note's colour is one of the board's named colours (SpaceStickyNote.color), so a picked or typed
// colour snaps to the nearest named one. Opacity is SpaceStickyNote.opacity (0–1), shown as 0–100 %.
// No buttons (inputs only): the native colour well is the picker. No x / y / w / h fields.
import { useEffect, useState } from 'react'
import { isImeOwnedKeyboardEvent } from '../../core/ime-guard'
import { STICKY_COLOR_STYLE, STICKY_COLORS, type StickyColor } from '../../core/space'
import { hexToRgb, parse, rgbToHsv } from '../../penpot-mpl/colors'

export function stickyColorHex(color: StickyColor): string {
  return parse(STICKY_COLOR_STYLE[color]?.stroke) ?? '#fbbf24'
}

/** Nearest named colour to any colour text ("#f43f5e", "f00", "rgb(0,200,255)"); null if unreadable.
 *  Distance in RGB plus a hue term, so a dark or light variant still lands on its own hue. */
export function nearestStickyColor(input: string): StickyColor | null {
  const hex = parse(input)
  if (!hex) {
    return null
  }
  const rgb = hexToRgb(hex)
  const [h, s] = rgbToHsv(rgb)
  let best: StickyColor | null = null
  let bestD = Number.POSITIVE_INFINITY
  for (const c of STICKY_COLORS) {
    const crgb = hexToRgb(stickyColorHex(c))
    const [ch, cs] = rgbToHsv(crgb)
    const rgbD = Math.hypot(rgb[0] - crgb[0], rgb[1] - crgb[1], rgb[2] - crgb[2])
    const hueGap = Math.min(Math.abs(h - ch), 360 - Math.abs(h - ch))
    // Hue only counts when both colours have colour in them (greys have no hue).
    const hueD = s > 0.25 && cs > 0.25 ? hueGap * 1.5 : 0
    const d = rgbD + hueD
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/** Typed opacity percent ("40" or "40%") → 0–1, clamped and rounded to whole percents; null if not a number. */
export function parseOpacityPercent(text: string): number | null {
  const t = text.trim().replace(/%$/, '').trim()
  if (!/^-?\d+(\.\d+)?$/.test(t)) {
    return null
  }
  const n = Number(t)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) / 100 : null
}

export const opacityPercent = (opacity: number | undefined): number =>
  Math.round((opacity ?? 1) * 100)

const stop = (event: React.SyntheticEvent): void => event.stopPropagation()

export function ColorField({
  color,
  opacity,
  onChangeColor,
  onChangeOpacity
}: {
  color: StickyColor
  opacity: number | undefined
  onChangeColor: (color: StickyColor) => void
  onChangeOpacity: (opacity: number) => void
}): React.JSX.Element {
  const hex = stickyColorHex(color)
  const [hexText, setHexText] = useState(hex)
  const [opText, setOpText] = useState(String(opacityPercent(opacity)))
  useEffect(() => setHexText(hex), [hex])
  useEffect(() => setOpText(String(opacityPercent(opacity))), [opacity])

  const commitHex = (text: string): void => {
    const next = nearestStickyColor(text)
    if (next && next !== color) {
      onChangeColor(next)
    } else {
      setHexText(hex)
    }
  }
  const commitOpacity = (value: number | null): void => {
    if (value === null) {
      setOpText(String(opacityPercent(opacity)))
      return
    }
    setOpText(String(Math.round(value * 100)))
    if (value !== (opacity ?? 1)) {
      onChangeOpacity(value)
    }
  }

  return (
    <div
      data-whiteboard-inspector="style"
      onPointerDown={stop}
      onDoubleClick={(event) => event.stopPropagation()}
      className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/15 bg-zinc-950/96 px-2.5 py-1 text-[11px] text-zinc-300 shadow-xl backdrop-blur-xl"
    >
      <label className="flex items-center gap-1.5">
        <span>Fill</span>
        <input
          type="color"
          aria-label="Fill colour"
          value={hex}
          onChange={(event) => {
            const next = nearestStickyColor(event.target.value)
            if (next && next !== color) {
              onChangeColor(next)
            }
          }}
          style={{ opacity: opacity ?? 1 }}
          className="size-5 cursor-pointer rounded border border-white/20 bg-transparent p-0"
        />
        <input
          type="text"
          aria-label="Fill colour hex"
          spellCheck={false}
          value={hexText}
          onChange={(event) => setHexText(event.target.value)}
          onBlur={(event) => commitHex(event.target.value)}
          onKeyDown={(event) => {
            if (isImeOwnedKeyboardEvent(event.nativeEvent)) {
              return
            }
            if (event.key === 'Enter') {
              commitHex(event.currentTarget.value)
            } else if (event.key === 'Escape') {
              setHexText(hex)
              event.currentTarget.blur()
            }
          }}
          className="w-[68px] rounded border border-white/15 bg-zinc-900 px-1 py-0.5 font-mono text-zinc-100 focus:border-sky-400 focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span>Opacity</span>
        <input
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-label="Opacity percent"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={opacityPercent(opacity)}
          value={opText}
          onChange={(event) => setOpText(event.target.value)}
          onBlur={(event) => commitOpacity(parseOpacityPercent(event.target.value))}
          onKeyDown={(event) => {
            if (isImeOwnedKeyboardEvent(event.nativeEvent)) {
              return
            }
            // NumericInput idea: ↑ / ↓ step 1, Shift = 10, Enter commits, Esc reverts.
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              const base = parseOpacityPercent(event.currentTarget.value) ?? opacity ?? 1
              const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1)
              commitOpacity(Math.max(0, Math.min(100, Math.round(base * 100) + step)) / 100)
            } else if (event.key === 'Enter') {
              commitOpacity(parseOpacityPercent(event.currentTarget.value))
            } else if (event.key === 'Escape') {
              setOpText(String(opacityPercent(opacity)))
              event.currentTarget.blur()
            }
          }}
          className="w-[42px] rounded border border-white/15 bg-zinc-900 px-1 py-0.5 text-right tabular-nums text-zinc-100 focus:border-sky-400 focus:outline-none"
        />
        <span>%</span>
      </label>
    </div>
  )
}
