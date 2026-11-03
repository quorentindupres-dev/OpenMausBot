// U-37: the canvas root's width, kept live (ResizeObserver, window resize as the fallback).
import { useEffect, useState } from 'react'

export function useCanvasWidth(rootRef: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = rootRef.current
    if (!el) {
      return
    }
    const read = (): void => setWidth(el.clientWidth)
    read()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(read)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [rootRef])
  return width
}
