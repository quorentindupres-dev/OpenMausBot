import type React from 'react'

export type KeyboardEventLike = {
  isComposing?: boolean
  keyCode?: number
  key?: string
  metaKey?: boolean
  ctrlKey?: boolean
  nativeEvent?: {
    isComposing?: boolean
    keyCode?: number
  }
}

/**
 * Returns true when an active IME composition owns the keystroke (e.g. Japanese/Chinese/Korean
 * candidate confirmation via Enter/Escape, or keyCode 229). Host apps should never intercept
 * IME-owned keys as canvas shortcuts.
 */
export function isImeOwnedKeyboardEvent(
  event: KeyboardEventLike | React.KeyboardEvent | KeyboardEvent
): boolean {
  const like = event as KeyboardEventLike
  if (like.isComposing || like.nativeEvent?.isComposing) {
    return true
  }
  if (like.keyCode === 229 || like.nativeEvent?.keyCode === 229) {
    return true
  }
  return like.key === 'Process'
}

export function isMacLikePlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return true
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '')
}
