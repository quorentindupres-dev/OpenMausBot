// WS-0 (TASK_16 wave 2): one Space tile's derived values and its two-deck header (emoji / level
// pickers, title, badges), moved verbatim from the tiles.map body in space-canvas.tsx. Owner: none.
import type { CanvasCtx } from '../canvas-ctx'
import type { SpaceTile } from '../../core/space'
import {
  BENCH_KEY,
  CARD_WIDTH,
  GAP,
  LEVEL_STYLE,
  SPACE_EMOJI_CATEGORIES,
  SPACE_LEVELS,
  TEAM_PADDING,
  defaultSpaceEmoji,
  isImageEmoji,
  resolveSpaceBgStyle
} from '../../core/space'
import { SpaceEmojiGraphic, readCustomEmojiFile } from '../../space-emoji'
import { TitleText } from '../canvas-parts'
import { isImeOwnedKeyboardEvent } from '../../core/ime-guard'
import { isOverTile } from '../../space-drag'

/** Per-tile values the tile body and the header both read (was the top of the tiles.map callback). */
export function tileLocals(ctx: CanvasCtx, tile: SpaceTile) {
  const {
    agentsBySpace,
    arrowSnapTargetId,
    drag,
    emojiCategoryTab,
    goalsById,
    inspectedAgentId,
    selectedGoalId,
    tileOffset,
    tileSizeOverride
  } = ctx
  const goal = goalsById.get(tile.key)
  const members = agentsBySpace.get(tile.key) ?? []
  const waitingCount = members.filter((a) => a.attention).length
  const sizeOvr = tileSizeOverride[tile.key]
  const effectiveW = sizeOvr?.w ?? tile.w
  const effectiveH = sizeOvr?.h ?? tile.h
  const columns = Math.max(
    1,
    Math.min(8, Math.floor((effectiveW - TEAM_PADDING * 2 + GAP) / (CARD_WIDTH + GAP)))
  )
  const over = isOverTile(drag, tile.key)
  const isArrowTarget = arrowSnapTargetId === tile.key
  const offset = tileOffset[tile.key]
  const isBench = tile.key === BENCH_KEY
  const style = goal ? LEVEL_STYLE[goal.level] : null
  const isSide = goal?.level === 'side'
  const openTasks = goal ? goal.tasks.filter((task) => !task.done) : []
  const openAsks = goal ? goal.asks.filter((ask) => ask.status === 'open') : []
  const doneOutcomes = goal ? goal.outcomes.filter((item) => item.done).length : 0
  const nextOutcome =
    goal && goal.outcomes.length > 0
      ? (goal.outcomes.find((o) => !o.done) ?? goal.outcomes.at(-1))
      : undefined
  const isSelected = Boolean(goal && selectedGoalId === goal.id)
  const hasInspectedMember = Boolean(
    inspectedAgentId && members.some((m) => m.id === inspectedAgentId)
  )
  const displayEmoji = goal
    ? goal.emoji || defaultSpaceEmoji(goal.title, goal.level, goal.emoji)
    : '🧰'
  const bgStyle = resolveSpaceBgStyle(goal?.bgColor)
  const isLightBg = bgStyle.isLight
  const titleFontSize = goal?.titleSize ?? 16
  const activeEmojiCat =
    SPACE_EMOJI_CATEGORIES.find((c) => c.id === emojiCategoryTab) ?? SPACE_EMOJI_CATEGORIES[0]!
  return {
    goal,
    members,
    waitingCount,
    sizeOvr,
    effectiveW,
    effectiveH,
    columns,
    over,
    isArrowTarget,
    offset,
    isBench,
    style,
    isSide,
    openTasks,
    openAsks,
    doneOutcomes,
    nextOutcome,
    isSelected,
    hasInspectedMember,
    displayEmoji,
    bgStyle,
    isLightBg,
    titleFontSize,
    activeEmojiCat
  }
}

/** U-37: Space titles stay >= 11 px on screen (like the Bench header), but never wider than the tile.
 *  Why: at Fit 55 % a 16 px title was ~9 px, and ~6 px with a smaller titleSize. */
export const TILE_TITLE_MIN_SCREEN_PX = 11
export function tileTitleFont(base: number, scale: number, tileW: number, chars: number): number {
  const wanted = Math.max(base, TILE_TITLE_MIN_SCREEN_PX / Math.max(scale, 0.05))
  // The title shares its row with the icon (~44 px) and padding (~32 px).
  const room = Math.max(0, tileW - 76)
  const cap = room / (Math.max(chars, 6) * 0.55)
  return Math.round(Math.max(base, Math.min(wanted, cap)))
}

/** U-37: the Bench is a place: solid amber header, readable label + big count at any zoom.
 *  Why: a 5 px dashed label read as dead space. The font is counter-scaled (~13 px on screen), but never
 *  wider than the tile: when zoomed far out the long form ("N unassigned") gives way to "Bench N". */
export const BENCH_LABEL_PX = 13
const BENCH_SHORT_BELOW_SCALE = 0.5
const BENCH_CHAR_W = 0.62 // average glyph width / font size, semi-bold
export function benchHeaderFont(
  count: number,
  scale: number,
  tileW: number
): { px: number; short: boolean; chars: number } {
  const short = scale < BENCH_SHORT_BELOW_SCALE
  const tail = short ? '' : count === 1 ? ' new' : ' unassigned'
  // "Bench" + count (1.4x) + tail, plus the chip's own padding and gaps (~3 em).
  const chars = 5 + String(count).length * 1.4 + tail.length + 3
  const wanted = Math.max(BENCH_LABEL_PX, BENCH_LABEL_PX / Math.max(scale, 0.05))
  const fits = Math.max(8, (tileW - 24) / (chars * BENCH_CHAR_W))
  return { px: Math.round(Math.min(wanted, fits)), short, chars }
}
export function BenchHeader({
  count,
  scale,
  tileW
}: {
  count: number
  scale: number
  tileW: number
}): React.JSX.Element {
  const { px, short } = benchHeaderFont(count, scale, tileW)
  return (
    <span
      style={{ fontSize: px, lineHeight: 1.1, maxWidth: Math.max(80, tileW - 24) }}
      className="op-bench-header inline-flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg bg-amber-500 px-2.5 py-1 font-semibold text-zinc-950"
    >
      <span>Bench</span>
      <span
        style={{ fontSize: Math.round(px * 1.4) }}
        className="op-bench-count font-bold tabular-nums"
      >
        {count}
      </span>
      {short ? null : (
        <span className="font-medium opacity-80">{count === 1 ? 'new' : 'unassigned'}</span>
      )}
    </span>
  )
}

export type TileLocals = ReturnType<typeof tileLocals>

export function TileHeader({ ctx, t }: { ctx: CanvasCtx; t: TileLocals }): React.JSX.Element {
  const {
    customEmojiDraft,
    emojiCategoryTab,
    emojiFileInputRef,
    emojiPickerGoalId,
    levelPickerGoalId,
    onChangeGoalEmoji,
    onGoalMenu,
    onNotify,
    onOpenGoal,
    onRegisterCustomEmoji,
    onRenameGoal,
    onUpdateGoal,
    setCustomEmojiDraft,
    setEmojiCategoryTab,
    setEmojiPickerGoalId,
    setLevelPickerGoalId,
    space
  } = ctx
  const {
    goal,
    members,
    waitingCount,
    style,
    isSide,
    openTasks,
    displayEmoji,
    isLightBg,
    titleFontSize,
    activeEmojiCat
  } = t
  return (
    <header className="flex cursor-move flex-col gap-2 px-4 pt-3 pb-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {goal ? (
            <div className="relative shrink-0" data-emoji-picker="true">
              <button
                type="button"
                title="Click to choose or upload Space icon"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setCustomEmojiDraft(isImageEmoji(goal.emoji) ? '' : (goal.emoji ?? ''))
                  setEmojiPickerGoalId((cur) => (cur === goal.id ? null : goal.id))
                }}
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl border text-lg shadow-xs transition-transform hover:scale-105 hover:border-primary/60 ${
                  isLightBg
                    ? 'border-slate-300 bg-white text-slate-900'
                    : 'border-white/[0.12] bg-white/[0.06] text-zinc-200'
                }`}
              >
                <SpaceEmojiGraphic value={displayEmoji} className="size-6" />
              </button>
              {emojiPickerGoalId === goal.id ? (
                <div
                  data-space-panel="emoji-picker"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  className="absolute left-0 top-11 z-40 w-72 rounded-2xl border border-white/[0.14] bg-[#0b0c0f] p-3 text-xs text-zinc-100 shadow-2xl space-y-2"
                >
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    <span>Choose or Import Space Icon</span>
                    <button
                      type="button"
                      onClick={() => setEmojiPickerGoalId(null)}
                      className="rounded px-1 text-zinc-400 hover:text-zinc-100"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 border-b border-white/[0.1] pb-1.5">
                    {SPACE_EMOJI_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setEmojiCategoryTab(cat.id)}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-medium transition ${
                          emojiCategoryTab === cat.id
                            ? 'bg-primary text-primary-foreground'
                            : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                  {space.customEmojis && space.customEmojis.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.1] pb-1.5">
                      <span className="text-[10px] text-zinc-500 mr-1">Yours:</span>
                      {space.customEmojis.map((custom, idx) => (
                        <button
                          key={`c-${idx}`}
                          type="button"
                          onClick={() => {
                            onChangeGoalEmoji?.(goal.id, custom)
                            setEmojiPickerGoalId(null)
                          }}
                          className={`flex size-7 items-center justify-center rounded-lg text-base transition hover:bg-accent ${
                            displayEmoji === custom ? 'bg-primary/20 ring-1 ring-primary' : ''
                          }`}
                        >
                          <SpaceEmojiGraphic value={custom} className="size-5" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="scrollbar-sleek grid grid-cols-6 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                    {activeEmojiCat.emojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          onChangeGoalEmoji?.(goal.id, emoji)
                          setEmojiPickerGoalId(null)
                        }}
                        className={`flex size-9 items-center justify-center rounded-xl text-base transition hover:bg-accent ${
                          displayEmoji === emoji ? 'bg-primary/20 ring-1 ring-primary' : ''
                        }`}
                      >
                        <SpaceEmojiGraphic
                          value={emoji}
                          className="size-7 rounded-lg object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.1]">
                    <button
                      type="button"
                      onClick={() => emojiFileInputRef.current?.click()}
                      className="shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:bg-white/[0.12]"
                    >
                      📤 Import Image
                    </button>
                    <input
                      ref={emojiFileInputRef}
                      type="file"
                      accept="image/*,.svg,.png,.jpg,.jpeg,.webp,.gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) {
                          return
                        }
                        void readCustomEmojiFile(file)
                          .then((dataUrl) => {
                            onRegisterCustomEmoji?.(dataUrl)
                            onChangeGoalEmoji?.(goal.id, dataUrl)
                            setEmojiPickerGoalId(null)
                          })
                          .catch((error: unknown) => {
                            onNotify?.(
                              `Space icon not set: ${error instanceof Error ? error.message : 'unreadable image'}`
                            )
                          })
                        event.target.value = ''
                      }}
                    />
                    <input
                      value={customEmojiDraft}
                      onChange={(event) => setCustomEmojiDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (!isImeOwnedKeyboardEvent(event) && event.key === 'Enter') {
                          const trimmed = customEmojiDraft.trim()
                          if (trimmed) {
                            onRegisterCustomEmoji?.(trimmed)
                            onChangeGoalEmoji?.(goal.id, trimmed)
                            setEmojiPickerGoalId(null)
                          }
                        }
                      }}
                      placeholder="Any emoji…"
                      className="min-w-0 flex-1 rounded-lg border border-white/[0.12] bg-white/[0.06] px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-primary/60"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = customEmojiDraft.trim()
                        if (trimmed) {
                          onRegisterCustomEmoji?.(trimmed)
                          onChangeGoalEmoji?.(goal.id, trimmed)
                          setEmojiPickerGoalId(null)
                        }
                      }}
                      className="rounded-lg bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground"
                    >
                      Set
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {goal ? (
            <TitleText
              value={goal.title}
              fontSize={tileTitleFont(
                titleFontSize,
                ctx.view.scale,
                t.effectiveW,
                goal.title.length
              )}
              isLightBg={isLightBg}
              placeholder={isSide ? 'Untitled side quest' : 'Untitled Space'}
              onSave={(title) => onRenameGoal(goal.id, title)}
            />
          ) : (
            <BenchHeader count={members.length} scale={ctx.view.scale} tileW={t.effectiveW} />
          )}
        </div>
      </div>

      {/* Row 2 below title: Category badge ("General" / P1..P3) + Waiting + Agent Count + Color + Arrow + Open + Menu */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {style && goal ? (
            <div className="relative" data-level-picker={goal.id}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={levelPickerGoalId === goal.id}
                aria-label={`Priority: ${style.label}. Click to change`}
                title="Change priority"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setLevelPickerGoalId((cur) => (cur === goal.id ? null : goal.id))
                  setEmojiPickerGoalId(null)
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors duration-150 ${
                  isLightBg
                    ? 'bg-black/[0.06] text-slate-800 hover:bg-black/10'
                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] hover:text-zinc-100'
                }`}
              >
                <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
                {style.shortLabel}
                <span aria-hidden="true" className="text-[8px] opacity-50">
                  ▾
                </span>
              </button>
              {levelPickerGoalId === goal.id ? (
                <div
                  data-space-panel="level-picker"
                  role="menu"
                  aria-label="Space priority"
                  ref={(node) => {
                    // Focus the current level so arrows / Escape work right away.
                    if (node && !node.contains(document.activeElement)) {
                      const current =
                        node.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
                        node.querySelector<HTMLButtonElement>('button')
                      current?.focus()
                    }
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation()
                      setLevelPickerGoalId(null)
                      ;(
                        event.currentTarget.parentElement?.querySelector(
                          'button'
                        ) as HTMLButtonElement | null
                      )?.focus()
                      return
                    }
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault()
                      const items = Array.from(
                        event.currentTarget.querySelectorAll<HTMLButtonElement>(
                          '[role="menuitemradio"]'
                        )
                      )
                      const at = items.indexOf(document.activeElement as HTMLButtonElement)
                      const step = event.key === 'ArrowDown' ? 1 : -1
                      items[(at + step + items.length) % items.length]?.focus()
                    }
                  }}
                  className="absolute left-0 top-7 z-40 flex w-48 flex-col gap-0.5 rounded-2xl bg-[#0b0c0f]/95 p-1.5 text-xs text-zinc-200 shadow-[0_18px_45px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.08] backdrop-blur-md"
                >
                  {SPACE_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="menuitemradio"
                      aria-checked={goal.level === level}
                      data-level-option={level}
                      onClick={() => {
                        setLevelPickerGoalId(null)
                        if (level !== goal.level) {
                          onUpdateGoal?.(goal.id, { level })
                        }
                      }}
                      className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.08] ${
                        goal.level === level ? 'bg-white/[0.06] text-zinc-50' : ''
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2 rounded-full ${LEVEL_STYLE[level].dot}`}
                      />
                      <span className="flex-1">{LEVEL_STYLE[level].label}</span>
                      {goal.level === level ? (
                        <span aria-hidden="true" className="text-zinc-400">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : style ? (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isLightBg ? 'bg-black/[0.06] text-slate-800' : 'bg-white/[0.06] text-zinc-300'
              }`}
            >
              {style.shortLabel}
            </span>
          ) : null}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              isLightBg ? 'bg-black/10 text-slate-800' : 'bg-white/[0.06] text-zinc-400'
            }`}
          >
            {members.length} {members.length === 1 ? 'agent' : 'agents'}
          </span>
          {waitingCount > 0 ? (
            <span className="rounded-full bg-red-500/20 border border-red-500/50 px-2 py-0.5 text-[10px] font-semibold text-red-500 animate-pulse">
              🔴 {waitingCount} waiting
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {goal && ctx.host?.onFocusTask ? (
            <button
              type="button"
              title="Set this Space as your active focus task"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                const firstTask = openTasks[0]
                ctx.host?.onFocusTask?.(
                  firstTask?.w93Slug || goal.w93Slug || goal.id,
                  firstTask?.text || goal.title
                )
              }}
              className={`opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100 focus-within:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none rounded-lg border px-1.5 py-0.5 text-[11px] ${
                isLightBg
                  ? 'border-slate-300 bg-white/80 text-slate-700 hover:bg-white'
                  : 'border-transparent bg-white/[0.05] text-zinc-400 hover:bg-white/[0.1] hover:text-zinc-100'
              }`}
            >
              🎯
            </button>
          ) : null}
          {goal ? (
            <>
              {/* The goal row below already opens the Space; only side quests (no goal row) need this. */}
              {isSide ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenGoal(goal)
                  }}
                  className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${
                    isLightBg
                      ? 'border-slate-300 bg-white/80 text-slate-800 hover:bg-white'
                      : 'border-transparent bg-white/[0.05] text-zinc-400 hover:bg-white/[0.1] hover:text-zinc-100'
                  }`}
                >
                  Open ›
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Space options"
                onClick={(event) => {
                  event.stopPropagation()
                  // Keyboard (Enter/Space) clicks have detail 0 and no pointer position.
                  const rect = event.currentTarget.getBoundingClientRect()
                  onGoalMenu(
                    goal,
                    event.detail === 0
                      ? { x: rect.left, y: rect.bottom + 4 }
                      : { x: event.clientX, y: event.clientY }
                  )
                }}
                className={`rounded-lg px-1.5 py-0.5 text-xs transition ${
                  isLightBg
                    ? 'text-slate-700 hover:bg-black/10'
                    : 'text-zinc-400 hover:bg-white/[0.1] hover:text-zinc-100'
                }`}
              >
                •••
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}
