const ITEM = '[role^="menuitem"]'

function items(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(ITEM)).filter(
    (el) => !(el as HTMLButtonElement).disabled
  )
}

export function focusMenuOnOpen(menu: HTMLElement | null): void {
  if (!menu || menu.contains(document.activeElement)) {
    return
  }
  const list = items(menu)
  const current = list.find((el) => el.getAttribute('aria-checked') === 'true')
  ;(current ?? list[0])?.focus()
}

export function handleMenuKey(
  event: { key: string; preventDefault: () => void; stopPropagation: () => void },
  menu: HTMLElement,
  close: () => void,
  trigger: HTMLElement | null
): boolean {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    trigger?.focus()
    return true
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    return false
  }
  event.preventDefault()
  const list = items(menu)
  if (list.length === 0) {
    return true
  }
  const at = list.indexOf(document.activeElement as HTMLElement)
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? list.length - 1
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
  list[next]?.focus()
  return true
}
