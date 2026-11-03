// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) KALEIDOS SUBSIDIARY SL
//
// Ported from penpot/common/src/app/common/colors.cljc@e20a0d7
//   (valid-hex-color?, parse-rgb, normalize-hex, rgb->hsv, hsv->rgb, hex->rgb, rgb->hex, expand-hex,
//    prepend-hash, parse), via G_app-Data ui/src/library/penpot-mpl/colors.js (same commit).
//
// Changes from the original (see PROVENANCE.md):
// - ClojureScript -> TypeScript; vectors -> tuples. HSV keeps Penpot's ranges: h 0-360, s 0-1, v 0-255.
// - hsv->rgb ROUNDS each channel instead of `int` truncation (exact hex round-trip).
// - rgb->hex clamps and rounds out-of-range channels instead of throwing.
// - parse drops the CSS colour-name table; expand-hex is folded into parse (1/2/3 digits, no '#' ok).

export type Rgb = [number, number, number]
export type Hsv = [number, number, number]

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/
const RGB_RE = /^(?:|rgb)\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\)$/

export function validHexColor(color: unknown): color is string {
  return typeof color === 'string' && HEX_RE.test(color)
}

export function parseRgb(color: string): Rgb | null {
  const m = color.match(RGB_RE)
  if (!m) {
    return null
  }
  const rgb = [1, 2, 3].map((i) => Number.parseInt(m[i] ?? '', 10)) as Rgb
  return rgb.every((c) => c <= 255) ? rgb : null
}

function normalizeHex(color: string): string {
  return (color.length === 4 ? color.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : color).toLowerCase()
}

export function rgbToHsv([red, green, blue]: Rgb): Hsv {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  if (min === max) {
    return [0, 0, max]
  }
  const delta = max - min
  let hue =
    red === max
      ? (green - blue) / delta
      : green === max
        ? 2 + (blue - red) / delta
        : 4 + (red - green) / delta
  hue *= 60
  if (hue < 0) {
    hue += 360
  }
  if (hue > 360) {
    hue -= 360
  }
  return [hue, delta / max, max]
}

export function hsvToRgb([h, s, brightness]: Hsv): Rgb {
  const v = brightness ?? 0
  if (s === 0) {
    const o = Math.round(v)
    return [o, o, o]
  }
  const sextant = Math.floor(h / 60)
  const remainder = h / 60 - sextant
  const val1 = Math.round(v * (1 - s))
  const val2 = Math.round(v * (1 - s * remainder))
  const val3 = Math.round(v * (1 - s * (1 - remainder)))
  const b = Math.round(v)
  switch (sextant) {
    case 1:
      return [val2, b, val1]
    case 2:
      return [val1, b, val3]
    case 3:
      return [val1, val2, b]
    case 4:
      return [val3, val1, b]
    case 5:
      return [b, val1, val2]
    default:
      return [b, val3, val1]
  }
}

export function hexToRgb(color: string): Rgb {
  const rgb = Number.parseInt(color.slice(1, 7), 16)
  if (!Number.isFinite(rgb)) {
    return [0, 0, 0]
  }
  return [rgb >> 16, (rgb >> 8) & 255, rgb & 255]
}

const channel = (n: number): number => Math.min(255, Math.max(0, Math.round(Number(n) || 0)))

export function rgbToHex([r, g, b]: Rgb): string {
  const rgb = (channel(r) << 16) | (channel(g) << 8) | channel(b)
  return `#${(0x1000000 | rgb).toString(16).slice(1)}`
}

export function expandHex(v: string): string {
  if (/^[0-9A-Fa-f]$/.test(v)) {
    return v.repeat(6)
  }
  if (/^[0-9A-Fa-f]{2}$/.test(v)) {
    return v.repeat(3)
  }
  if (/^[0-9A-Fa-f]{3}$/.test(v)) {
    return `${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`
  }
  return v
}

/** "#abc" / "abc" / "f" / "#aabbcc" / "rgb(1,2,3)" -> "#aabbcc", else null. */
export function parse(color: unknown): string | null {
  if (typeof color !== 'string') {
    return null
  }
  const t = color.trim()
  const bare = t.startsWith('#') ? t.slice(1) : t
  const hex = `#${expandHex(bare)}`
  if (validHexColor(hex)) {
    return normalizeHex(hex)
  }
  const rgb = parseRgb(t.replace(/\s+/g, ''))
  return rgb ? rgbToHex(rgb) : null
}
