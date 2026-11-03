// WS-0 (TASK_16 wave 2): small canvas parts moved verbatim from space-canvas.tsx.
// Quick-connect ports, image-drop helpers, reduced-motion + glide hooks, title editor, clamped toolbar.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isImeOwnedKeyboardEvent } from '../core/ime-guard'
import { BENCH_KEY, CARDINAL_PORTS, type View } from '../core/space'
import { GLIDE_MS, type Box, type BoxRect } from './canvas-ctx'

/** 4-side AFFiNE-style magnetic quick-connect port dots around Cards, Text, and Space tiles. */
export function QuickConnectPorts({
  visible,
  hoverClass,
  onStartArrow
}: {
  visible: boolean
  hoverClass: string
  onStartArrow: (event: React.PointerEvent) => void
}): React.JSX.Element {
  return (
    <>
      {CARDINAL_PORTS.map((port) => {
        const posClass =
          port.side === 'top'
            ? 'left-1/2 -top-2 -translate-x-1/2'
            : port.side === 'right'
              ? '-right-2 top-1/2 -translate-y-1/2'
              : port.side === 'bottom'
                ? 'left-1/2 -bottom-2 -translate-x-1/2'
                : '-left-2 top-1/2 -translate-y-1/2'
        return (
          // A drag grip (pointer only), like the resize corners: not a button, not a tab stop.
          // Keyboard users connect with the Connector tool (C).
          <span
            key={port.side}
            aria-hidden="true"
            data-quick-port={port.side}
            title={`Drag to connect arrow (${port.side})`}
            onPointerDown={onStartArrow}
            className={`pointer-events-auto absolute z-30 flex size-3.5 cursor-crosshair items-center justify-center rounded-full border border-sky-300 bg-zinc-950 shadow-md transition-all hover:scale-150 hover:bg-sky-400 ${posClass} ${
              visible ? 'opacity-95' : `opacity-0 ${hoverClass}`
            }`}
          >
            <span className="size-1.5 rounded-full bg-sky-400" />
          </span>
        )
      })}
    </>
  )
}

export function firstImageFile(transfer: DataTransfer | null): File | null {
  const file = transfer?.files?.[0]
  return file && file.type.startsWith('image/') ? file : null
}

/** During dragover the file list is hidden; the item kinds and MIME types are not. */
export function hasImageFile(transfer: DataTransfer | null): boolean {
  if (!transfer) {
    return false
  }
  return Array.from(transfer.items ?? []).some(
    (item) => item.kind === 'file' && item.type.startsWith('image/')
  )
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window === 'undefined'
      ? false
      : Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = (): void => setReduced(query.matches)
    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])
  return reduced
}

export function useGlide(
  rootRef: React.RefObject<HTMLDivElement | null>,
  placements: Record<string, string>
): void {
  const previousRef = useRef<Map<string, Box>>(new Map())
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const next = new Map<string, Box>()
    for (const element of root.querySelectorAll<HTMLElement>('[data-space-card]')) {
      const id = element.dataset.spaceCard
      const spaceKey = element.dataset.spaceIn || BENCH_KEY
      if (!id) {
        continue
      }
      const rect = element.getBoundingClientRect()
      const previous = previousRef.current.get(id)
      next.set(id, { left: rect.left, top: rect.top, spaceKey })
      if (!reduced && previous && previous.spaceKey !== spaceKey && element.animate) {
        const dx = previous.left - rect.left
        const dy = previous.top - rect.top
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          element.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: GLIDE_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
          )
        }
      }
    }
    previousRef.current = next
  }, [placements, rootRef])
}

export function TitleText({
  value,
  placeholder,
  fontSize = 16,
  isLightBg = false,
  onSave
}: {
  value: string
  placeholder: string
  fontSize?: number
  isLightBg?: boolean
  onSave: (value: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) {
      setDraft(value)
    }
  }, [editing, value])

  if (!editing) {
    return (
      <span
        data-title-edit="true"
        onDoubleClick={(event) => {
          event.stopPropagation()
          setDraft(value)
          setEditing(true)
        }}
        title="Double-click to rename Space"
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.24 }}
        className={`min-w-0 flex-1 cursor-text line-clamp-2 break-words font-semibold tracking-tight ${
          isLightBg ? 'text-slate-900' : 'text-foreground'
        }`}
      >
        {value || (
          <span className={`font-normal ${isLightBg ? 'text-slate-500' : 'text-muted-foreground'}`}>
            {placeholder}
          </span>
        )}
      </span>
    )
  }

  const commit = (): void => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== value) {
      onSave(trimmed)
    }
  }

  return (
    <input
      autoFocus
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (isImeOwnedKeyboardEvent(event)) {
          return
        }
        if (event.key === 'Enter') {
          commit()
        }
        if (event.key === 'Escape') {
          setEditing(false)
        }
      }}
      style={{ fontSize: `${fontSize}px` }}
      className="min-w-0 flex-1 rounded-lg border border-primary/50 bg-background px-2 py-0.5 font-semibold text-foreground outline-none"
    />
  )
}

export function ClampedFloatingToolbar({
  anchorRect,
  view,
  containerRef,
  children
}: {
  anchorRect: BoxRect
  view: View
  containerRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 540, h: 68 })

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) {
      return
    }
    const measure = (): void => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w > 0 && h > 0) {
        setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
      }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])

  const rootW = containerRef.current?.clientWidth || 1184
  const rootH = containerRef.current?.clientHeight || 860
  const screenCenterX = anchorRect.x * view.scale + view.x + (anchorRect.w * view.scale) / 2
  const screenTop = anchorRect.y * view.scale + view.y
  const screenBottom = (anchorRect.y + anchorRect.h) * view.scale + view.y

  const halfW = size.w / 2
  const minLeft = Math.min(rootW / 2, 12 + halfW)
  const maxLeft = Math.max(minLeft, rootW - 12 - halfW)
  const clampedLeft = Math.round(Math.max(minLeft, Math.min(maxLeft, screenCenterX)))

  const placeBelow = screenTop < size.h + 24
  const clampedTop = placeBelow
    ? Math.round(Math.min(Math.max(24, rootH - size.h - 90), Math.max(12, screenBottom + 14)))
    : Math.round(Math.max(12 + size.h, screenTop - 14))

  return (
    <div
      ref={wrapRef}
      style={{
        left: clampedLeft,
        top: clampedTop,
        transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
      }}
      className="pointer-events-none absolute z-30 flex max-w-[calc(100%-24px)] justify-center"
    >
      {children}
    </div>
  )
}
