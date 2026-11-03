// WS-A (TASK_16 wave 2): the ONE "is the person typing here?" test for canvas keys and the clipboard.
// Inputs, textareas, selects and any editable element: isContentEditable covers contenteditable="",
// "true" and "plaintext-only", inherited from a parent too (the attribute check is a fallback for DOMs
// that do not compute isContentEditable).
const FIELD_SELECTOR = 'input, textarea, select'
const EDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"])'

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') {
    return false
  }
  if (el.isContentEditable) {
    return true
  }
  return Boolean(el.closest(FIELD_SELECTOR) || el.closest(EDITABLE_SELECTOR))
}
