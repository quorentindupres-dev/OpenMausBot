import React, { useState } from 'react'
import { isImeOwnedKeyboardEvent } from '../core/ime-guard'
import type { BullseyeTheme } from '../core/theme'

export function PinNameTag({
  name,
  p,
  onCommit,
  editing,
  setEditing,
  variant = 'pill'
}: {
  name: string
  p: BullseyeTheme
  onCommit: (name: string) => void
  editing: boolean
  setEditing: (editing: boolean) => void
  variant?: 'pill' | 'header'
}): React.JSX.Element {
  const [draft, setDraft] = useState(name)
  if (editing) {
    const done = (save: boolean): void => {
      setEditing(false)
      if (save && draft.trim() && draft.trim() !== name) {
        onCommit(draft.trim())
      }
    }
    return (
      <input
        autoFocus
        aria-label="Name tag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (isImeOwnedKeyboardEvent(e)) {
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            done(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(name)
            done(false)
          }
        }}
        style={{ background: p.well, color: p.ink, borderColor: p.accentBorder }}
        className={
          variant === 'header'
            ? 'min-w-0 flex-1 rounded-md border px-1.5 py-px text-[12px] font-semibold outline-none'
            : 'w-[60px] rounded-full border px-1.5 py-px text-center text-[10px] font-semibold outline-none'
        }
      />
    )
  }
  return (
    <span
      data-pin-name-tag
      title={name}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setDraft(name)
        setEditing(true)
      }}
      style={variant === 'header' ? { color: p.ink } : { background: p.well, color: p.body }}
      className={
        variant === 'header'
          ? 'block min-w-0 flex-1 cursor-text truncate text-left text-[12px] font-semibold'
          : 'block max-w-[60px] cursor-text truncate rounded-full px-1.5 py-px text-center text-[10px] font-semibold'
      }
    >
      {name}
    </span>
  )
}
