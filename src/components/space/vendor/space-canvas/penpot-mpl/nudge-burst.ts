// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) KALEIDOS SUBSIDIARY SL
//
// Ported from penpot/frontend/src/app/main/data/workspace/transforms.cljs@e20a0d7
//   (nudge-selected-shapes: the nudge sizes, get-displacement, and the burst "stopper")
//
// Changes from the original (see PROVENANCE.md):
// - The rx stopper (switch-map of timer 1000 | key-up delayed 250) is two restartable timeouts.
// - The key-up delay is a parameter (Penpot 250 ms; the Spaces board passes 500 ms).
// - Every direction joins the same burst (Penpot filters the stream by the first direction).
// - onStart / onEnd callbacks instead of set-modifiers / apply-modifiers; no profile props.

export type NudgeDirection = 'left' | 'right' | 'up' | 'down'
export type NudgeVec = { x: number; y: number }

/** Penpot profile default `{:big 10 :small 1}`. */
export const NUDGE_SMALL = 1
export const NUDGE_BIG = 10
/** "We stop when there's been 1s without movement or after 250ms after a key-up". */
export const NUDGE_IDLE_MS = 1000
export const NUDGE_KEY_UP_MS = 250

/** get-displacement × scale (Shift = big step). */
export function nudgeVector(direction: NudgeDirection, shift: boolean): NudgeVec {
  const step = shift ? NUDGE_BIG : NUDGE_SMALL
  switch (direction) {
    case 'left':
      return { x: -step, y: 0 }
    case 'right':
      return { x: step, y: 0 }
    case 'up':
      return { x: 0, y: -step }
    case 'down':
      return { x: 0, y: step }
  }
}

export type NudgeBurstTimers = {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

export type NudgeBurstOptions = {
  idleMs?: number
  keyUpMs?: number
  /** First press of a burst (open the undo transaction). */
  onStart: () => void
  /** The burst stopped (flush, close the transaction). */
  onEnd: () => void
  timers?: NudgeBurstTimers
}

export type NudgeBurst = {
  /** A nudge key went down (repeats included). True when it started a new burst. */
  press: () => boolean
  /** Any key went up while a burst runs. */
  keyUp: () => void
  /** Stop now (another command, selection change, unmount). */
  end: () => void
  isActive: () => boolean
}

const DEFAULT_TIMERS: NudgeBurstTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
}

/** The stopper of nudge-selected-shapes: each press restarts it; it fires once per burst. */
export function createNudgeBurst(opts: NudgeBurstOptions): NudgeBurst {
  const idleMs = opts.idleMs ?? NUDGE_IDLE_MS
  const keyUpMs = opts.keyUpMs ?? NUDGE_KEY_UP_MS
  const timers = opts.timers ?? DEFAULT_TIMERS
  let active = false
  let handle: unknown = null

  const clearTimer = (): void => {
    if (handle !== null) {
      timers.clear(handle)
      handle = null
    }
  }
  const end = (): void => {
    clearTimer()
    if (!active) {
      return
    }
    active = false
    opts.onEnd()
  }
  const arm = (ms: number): void => {
    clearTimer()
    handle = timers.set(() => {
      handle = null
      end()
    }, ms)
  }
  return {
    press: () => {
      const started = !active
      if (started) {
        active = true
        opts.onStart()
      }
      arm(idleMs)
      return started
    },
    keyUp: () => {
      if (active) {
        arm(keyUpMs)
      }
    },
    end,
    isActive: () => active
  }
}
