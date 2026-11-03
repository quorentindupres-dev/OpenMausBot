// WS-A (TASK_16 wave 2): which live Space canvas gets the keys. Orca mounts one board per tab group
// (tab-bands.tsx), so two canvases can listen to the same window keydown. The last canvas the person
// pointed at or focused is active; with one canvas mounted it always wins. Module state = one renderer.
const live: HTMLElement[] = []
let active: HTMLElement | null = null

export function addLiveCanvas(root: HTMLElement): () => void {
  live.push(root)
  const activate = (): void => {
    active = root
  }
  root.addEventListener('pointerdown', activate, true)
  root.addEventListener('pointerenter', activate)
  root.addEventListener('focusin', activate)
  return () => {
    root.removeEventListener('pointerdown', activate, true)
    root.removeEventListener('pointerenter', activate)
    root.removeEventListener('focusin', activate)
    const i = live.indexOf(root)
    if (i !== -1) {
      live.splice(i, 1)
    }
    if (active === root) {
      active = null
    }
  }
}

const visible = (el: HTMLElement): boolean => el.isConnected && el.clientWidth > 0

/** True when `root` should handle this key: the only canvas, the active one, else the first visible. */
export function isKeyCanvas(root: HTMLElement | null): boolean {
  if (!root || live.length <= 1) {
    return true
  }
  if (active && live.includes(active) && visible(active)) {
    return active === root
  }
  return (live.find(visible) ?? live[0]) === root
}
