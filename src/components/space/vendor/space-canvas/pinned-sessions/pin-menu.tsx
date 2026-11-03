import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getBullseyeTheme } from '../core/theme'
import { focusMenuOnOpen, handleMenuKey } from '../menu-keys'
import { clampMenuPoint } from '../menu-position'
import { currentViewport } from './pinned-store'

export type PinMenuItem =
  | '-'
  | {
      label: string
      onSelect: () => void
      tone?: 'danger'
      disabled?: boolean
      disabledReason?: string
    }

const MENU_W = 168
const ROW_H = 30

export function usePinMenu(): {
  at: { x: number; y: number } | null
  close: () => void
  handlers: {
    onContextMenu: (e: React.MouseEvent) => void
    onKeyDown: (e: React.KeyboardEvent) => void
  }
} {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  return {
    at,
    close: () => setAt(null),
    handlers: {
      onContextMenu: (e) => {
        e.preventDefault()
        e.stopPropagation()
        setAt({ x: Math.round(e.clientX), y: Math.round(e.clientY) })
      },
      onKeyDown: (e) => {
        if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
          e.preventDefault()
          e.stopPropagation()
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setAt({ x: Math.round(r.left + Math.min(24, r.width / 2)), y: Math.round(r.top + 24) })
        }
      }
    }
  }
}

export function PinMenu({
  at,
  items,
  label,
  dark,
  onClose,
  returnFocus
}: {
  at: { x: number; y: number } | null
  items: readonly PinMenuItem[]
  label: string
  dark: boolean
  onClose: () => void
  returnFocus?: () => HTMLElement | null
}): React.JSX.Element | null {
  const p = getBullseyeTheme(dark)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!at) {
      return undefined
    }
    const outside = (e: PointerEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [at, onClose])
  if (!at || typeof document === 'undefined') {
    return null
  }
  const rows = items.filter((i) => i !== '-').length
  const pos = clampMenuPoint(
    at,
    { w: MENU_W, h: rows * ROW_H + (items.length - rows) * 9 + 12 },
    currentViewport()
  )
  return createPortal(
    <div
      ref={(node) => {
        menuRef.current = node
        focusMenuOnOpen(node)
      }}
      role="menu"
      aria-label={label}
      data-pin-menu
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const menu = menuRef.current
        if (menu && handleMenuKey(e, menu, onClose, returnFocus?.() ?? null)) {
          return
        }
        e.stopPropagation()
      }}
      style={{
        left: pos.x,
        top: pos.y,
        width: MENU_W,
        background: p.card,
        borderColor: p.borderStrong,
        color: p.ink,
        boxShadow: p.elevation
      }}
      className="pointer-events-auto fixed z-[49] select-none rounded-xl border p-1 text-xs"
    >
      {items.map((item, i) =>
        item === '-' ? (
          <div
            key={`sep-${i}`}
            role="separator"
            style={{ background: p.border }}
            className="mx-1 my-1 h-px"
          />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            title={item.disabled ? item.disabledReason : undefined}
            data-pin-menu-item={item.label}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
            style={{ color: item.tone === 'danger' ? p.badText : p.ink }}
            className="flex h-[28px] w-full cursor-pointer items-center rounded-lg px-2.5 text-left font-semibold outline-none hover:brightness-95 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  )
}

export function pinMenuItems(a: {
  onOpenFull: () => void
  onRename: () => void
  onReset: () => void
  onUnpin: () => void
}): PinMenuItem[] {
  return [
    { label: 'Open full', onSelect: a.onOpenFull },
    { label: 'Rename', onSelect: a.onRename },
    { label: 'Reset position', onSelect: a.onReset },
    '-',
    { label: 'Unpin', onSelect: a.onUnpin, tone: 'danger' }
  ]
}
