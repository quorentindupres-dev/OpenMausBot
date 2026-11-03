// WS-A (TASK_16 wave 2): the `?` keyboard-shortcut help, generated from the one command table
// (keyboard/commands.ts). Idea from Penpot's shortcuts panel (ui/workspace/sidebar/shortcuts.cljs:
// grouped list + search); re-implemented, no Penpot code. Opens only from `?`; Esc or a click outside
// closes it. No button and no click handler: it adds nothing to the always-visible UI.
import { useEffect, useMemo, useRef, useState } from 'react'
import { HOLD_HINTS, allCanvasCommands, type CommandGroup } from '../keyboard/commands'
import { setShortcutHelpOpen, useShortcutHelpOpen } from '../keyboard/help-store'

const GROUP_ORDER: readonly CommandGroup[] = ['Tools', 'Edit', 'Arrange', 'View', 'Help']

export type HelpRow = { id: string; label: string; display: string; group: CommandGroup }

/** The rows the help lists: canvas-scope commands + hold hints, filtered by a free-text query. */
export function shortcutHelpRows(query: string, owner?: unknown): HelpRow[] {
  const rows: HelpRow[] = [
    ...allCanvasCommands(owner)
      .filter((c) => c.scope === 'canvas')
      .map((c) => ({ id: c.id, label: c.label, display: c.display, group: c.group })),
    ...HOLD_HINTS.map((h) => ({ id: `hold.${h.display}`, ...h }))
  ]
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((r) => {
    const hay = `${r.label} ${r.display} ${r.id} ${r.group}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

export function ShortcutHelp({ owner }: { owner?: unknown }): React.JSX.Element | null {
  const open = useShortcutHelpOpen()
  return open ? <ShortcutHelpPanel owner={owner} /> : null
}

function ShortcutHelpPanel({ owner }: { owner?: unknown }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const panelRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const rows = useMemo(() => shortcutHelpRows(query, owner), [owner, query])

  useEffect(() => {
    inputRef.current?.focus()
    const onPointerDown = (event: PointerEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setShortcutHelpOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Keyboard shortcuts"
      data-space-shortcut-help="true"
      data-orca-plus-scroll-lock="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute right-3 bottom-16 z-40 flex max-h-[70%] w-80 flex-col rounded-2xl border border-border/60 bg-card/95 p-2 text-xs shadow-lg backdrop-blur-md"
    >
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Search shortcuts"
        aria-label="Search shortcuts"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setShortcutHelpOpen(false)
          }
        }}
        className="mb-2 rounded-xl border border-border/60 bg-background px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
      />
      <div className="scrollbar-sleek min-h-0 overflow-y-auto" data-space-scroll="true">
        {rows.length === 0 ? (
          <p className="px-1 py-2 text-muted-foreground">No shortcut matches.</p>
        ) : (
          GROUP_ORDER.map((group) => {
            const inGroup = rows.filter((r) => r.group === group)
            if (inGroup.length === 0) {
              return null
            }
            return (
              <section key={group} className="mb-1.5">
                <h3 className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </h3>
                <ul>
                  {inGroup.map((r) => (
                    <li
                      key={r.id}
                      data-shortcut-id={r.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-foreground"
                    >
                      <span>{r.label}</span>
                      <kbd className="rounded-md border border-border/60 bg-background px-1.5 font-mono text-[11px] text-muted-foreground">
                        {r.display}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
