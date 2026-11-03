// WS-0 (TASK_16 wave 2): Space tiles (tiles.map), moved verbatim from space-canvas.tsx.
// Owner: none. The two-deck header lives in TileHeader.tsx.
import type { CanvasCtx, CanvasHandlers } from '../canvas-ctx'
import { TileHeader, tileLocals } from './TileHeader'
import { CARD_WIDTH, GAP, TEAM_PADDING, tileSize } from '../../core/space'
import { QuickConnectPorts, firstImageFile, hasImageFile } from '../canvas-parts'
import { readCustomEmojiFile } from '../../space-emoji'
import { SpacewareSprite } from '../../sprites/space-sprite'

export function TileLayer({ ctx, g }: { ctx: CanvasCtx; g: CanvasHandlers }): React.JSX.Element {
  const {
    drag,
    imageDropGoalId,
    inspectedAgentId,
    onChangeAgentState,
    onChangeGoalEmoji,
    onMoveTile,
    onNotify,
    onOpenGoal,
    onRegisterCustomEmoji,
    onRemoveAgent,
    onSelectAgent,
    onStartDrag,
    setImageDropGoalId,
    tiles
  } = ctx
  const { startArrowDrag, startTileDrag, startTileResize } = g
  const draggingBotId = drag?.item.kind === 'bot' ? drag.item.botId : null
  return (
    <>
      {tiles.map((tile) => {
        const t = tileLocals(ctx, tile)
        const {
          goal,
          members,
          waitingCount,
          effectiveW,
          effectiveH,
          columns,
          over,
          isArrowTarget,
          offset,
          isBench,
          isSide,
          openTasks,
          openAsks,
          doneOutcomes,
          nextOutcome,
          isSelected,
          hasInspectedMember,
          bgStyle,
          isLightBg
        } = t

        return (
          <section
            key={tile.key}
            data-space-tile={tile.key}
            data-level={goal?.level}
            onPointerDown={startTileDrag(tile)}
            onDragOver={(event) => {
              // Drop an image file on a Space to make it the Space icon (OpenMausBot parity).
              if (!goal || !hasImageFile(event.dataTransfer)) {
                return
              }
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              if (imageDropGoalId !== goal.id) {
                setImageDropGoalId(goal.id)
              }
            }}
            onDragLeave={(event) => {
              if (
                imageDropGoalId === tile.key &&
                !event.currentTarget.contains(event.relatedTarget as Node | null)
              ) {
                setImageDropGoalId(null)
              }
            }}
            onDrop={(event) => {
              setImageDropGoalId(null)
              const file = goal ? firstImageFile(event.dataTransfer) : null
              if (!goal || !file) {
                return
              }
              event.preventDefault()
              event.stopPropagation()
              void readCustomEmojiFile(file)
                .then((dataUrl) => {
                  onRegisterCustomEmoji?.(dataUrl)
                  onChangeGoalEmoji?.(goal.id, dataUrl)
                })
                .catch((error: unknown) => {
                  onNotify?.(
                    `Space icon not set: ${error instanceof Error ? error.message : 'unreadable image'}`
                  )
                })
            }}
            style={{
              left: tile.x + (offset?.x ?? 0),
              top: tile.y + (offset?.y ?? 0),
              width: effectiveW,
              minHeight: effectiveH,
              ...(bgStyle.backgroundColor ? { backgroundColor: bgStyle.backgroundColor } : {})
            }}
            className={`pointer-events-auto group/tile absolute flex flex-col overflow-visible rounded-3xl border transition-[border-color,box-shadow,background-color] duration-200 motion-reduce:transition-none ${
              isBench
                ? waitingCount > 0
                  ? 'border-red-500/50 bg-[#0b0c0f]/80'
                  : members.length > 0
                    ? 'border-amber-500/60 bg-amber-500/[0.06]'
                    : 'border-amber-500/25 bg-[#0b0c0f]/70'
                : `${bgStyle.backgroundColor ? '' : 'bg-[#0b0c0f]/88 backdrop-blur-md'} shadow-[0_18px_45px_rgba(0,0,0,0.38)] ${
                    waitingCount > 0
                      ? 'border-red-500/55'
                      : isLightBg
                        ? 'border-slate-300/90'
                        : isSide
                          ? 'border-dashed border-white/[0.1]'
                          : 'border-white/[0.08]'
                  }`
            } ${
              isArrowTarget
                ? 'ring-2 ring-sky-400 shadow-[0_0_28px_rgba(56,189,248,0.45)]'
                : over || imageDropGoalId === tile.key
                  ? 'ring-2 ring-primary bg-primary/10'
                  : isSelected
                    ? 'ring-2 ring-foreground/40'
                    : hasInspectedMember
                      ? 'ring-2 ring-primary/45'
                      : ''
            }`}
          >
            {/* Two-deck Header:
                  Row 1: Space Icon + Full Title (always in view even when width is small) + quick Title Size A-/A+
                  Row 2: Category badge ("General" / P1..P3) + Waiting/Count pills + Bg Color + Arrow + Open + Menu */}
            <TileHeader ctx={ctx} t={t} />

            {goal && !isSide ? (
              <button
                type="button"
                onClick={() => onOpenGoal(goal)}
                className={`flex w-full flex-col gap-1 border-y px-4 py-1.5 text-left text-xs transition ${
                  isLightBg
                    ? 'border-slate-300/80 bg-black/[0.04] hover:bg-black/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.035] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className={`truncate ${isLightBg ? 'text-slate-600' : 'text-zinc-400'}`}>
                    {goal.goal || 'Click to set the goal, outcomes, and tasks…'}
                  </span>
                  <span
                    className={`flex shrink-0 items-center gap-1.5 text-[11px] ${
                      isLightBg ? 'text-slate-700' : 'text-zinc-400'
                    }`}
                  >
                    {goal.outcomes.length > 0 ? (
                      <span
                        className={`rounded px-1.5 py-0.2 font-medium ${
                          isLightBg ? 'bg-white/90 text-slate-900' : 'bg-white/[0.08] text-zinc-200'
                        }`}
                      >
                        Outcomes {doneOutcomes}/{goal.outcomes.length}
                      </span>
                    ) : null}
                    {openTasks.length > 0 ? (
                      <span
                        className={`rounded px-1.5 py-0.2 ${
                          isLightBg ? 'bg-white/90 text-slate-800' : 'bg-white/[0.08] text-zinc-300'
                        }`}
                      >
                        {openTasks.length} {openTasks.length === 1 ? 'task' : 'tasks'}
                      </span>
                    ) : null}
                    {openAsks.length > 0 ? (
                      <span className="rounded bg-red-500/20 px-1.5 py-0.2 font-semibold text-red-500">
                        {openAsks.length} {openAsks.length === 1 ? 'ask' : 'asks'}
                      </span>
                    ) : null}
                  </span>
                </div>
                {nextOutcome ? (
                  <div
                    className={`flex w-full items-center gap-1.5 text-[11px] ${
                      isLightBg ? 'text-slate-700' : 'text-zinc-400'
                    }`}
                  >
                    <span className="shrink-0 font-mono text-[10px] text-emerald-500">
                      {nextOutcome.done ? '✓' : '🎯'}
                    </span>
                    <span
                      className={`truncate ${
                        nextOutcome.done
                          ? 'line-through opacity-70'
                          : isLightBg
                            ? 'text-slate-900 font-medium'
                            : 'text-zinc-100'
                      }`}
                    >
                      {nextOutcome.text}
                    </span>
                  </div>
                ) : null}
              </button>
            ) : null}

            {isBench && members.length === 0 ? (
              <div className="px-4 pt-0.5 pb-3">
                <div className="flex h-8 items-center justify-center rounded-xl border border-dashed border-white/[0.12] px-3 text-[11px] text-zinc-500">
                  All open tabs are assigned to Spaces
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: TEAM_PADDING,
                  gap: GAP,
                  gridTemplateColumns: `repeat(${columns}, ${CARD_WIDTH}px)`
                }}
                className="grid flex-1 content-start justify-center"
              >
                {members.map((agent) => (
                  <SpacewareSprite
                    key={agent.id}
                    agent={agent}
                    tileKey={tile.key}
                    taskText={openTasks.find((task) => task.botId === agent.id)?.text}
                    hasOpenAsk={openAsks.some(
                      (ask) => ask.botId === agent.id || ask.forBotId === agent.id
                    )}
                    isDragging={draggingBotId === agent.id}
                    isSelected={inspectedAgentId === agent.id}
                    onSelect={() => onSelectAgent(agent.id)}
                    onStartDrag={onStartDrag({ kind: 'bot', botId: agent.id })}
                    onRemove={onRemoveAgent ? () => onRemoveAgent(agent.id) : undefined}
                    onChangeState={
                      onChangeAgentState ? (mode) => onChangeAgentState(agent.id, mode) : undefined
                    }
                  />
                ))}
                {members.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (goal) {
                        onOpenGoal(goal)
                      }
                    }}
                    style={{ gridColumn: `span ${columns}` }}
                    className={`flex h-20 items-center justify-center rounded-2xl border border-dashed px-3 text-xs transition ${
                      isLightBg
                        ? 'border-slate-400/70 text-slate-600 hover:border-slate-700 hover:text-slate-900'
                        : 'border-white/[0.14] text-zinc-500 hover:border-primary/40 hover:text-zinc-200'
                    }`}
                  >
                    Drag an A01 agent or Spaceware tab here
                  </button>
                ) : null}
              </div>
            )}

            {/* 4-side magnetic quick-connect arrow ports on Space tiles */}
            <QuickConnectPorts
              visible={isSelected}
              hoverClass="group-hover/tile:opacity-80"
              onStartArrow={(event) => startArrowDrag(event, tile.key)}
            />

            {/* Invisible grips on the other 3 corners (nw / ne / sw), OpenMausBot parity */}
            {(['nw', 'ne', 'sw'] as const).map((corner) => (
              <div
                key={corner}
                data-tile-resize="true"
                data-resize-corner={corner}
                title="Drag corner to resize Space"
                onPointerDown={startTileResize(tile, corner)}
                className={`absolute z-20 size-4 ${
                  corner === 'nw'
                    ? '-top-1 -left-1 cursor-nwse-resize'
                    : corner === 'ne'
                      ? '-top-1 -right-1 cursor-nesw-resize'
                      : '-bottom-1 -left-1 cursor-nesw-resize'
                }`}
              />
            ))}
            {/* Right edge, bottom edge, and large bottom-right corner resize handles for Space workspace */}
            <div
              data-tile-resize="true"
              title="Drag right edge to widen Space workspace"
              onPointerDown={startTileResize(tile, 'e')}
              className="absolute top-8 bottom-8 -right-1 w-2.5 cursor-ew-resize"
            />
            <div
              data-tile-resize="true"
              title="Drag bottom edge to make Space workspace taller"
              onPointerDown={startTileResize(tile, 's')}
              className="absolute right-8 -bottom-1 left-6 h-2.5 cursor-ns-resize"
            />
            <div
              data-tile-resize="true"
              title="Drag corner to resize Space workspace · Double-click to auto-fit"
              onPointerDown={startTileResize(tile, 'se')}
              onDoubleClick={(event) => {
                event.stopPropagation()
                const auto = tileSize(members.length, Boolean(isSide || isBench))
                onMoveTile(tile.key, { x: tile.x, y: tile.y, w: auto.w, h: auto.h })
              }}
              data-resize-corner="se"
              className={`absolute right-1 bottom-1 z-20 flex size-6 cursor-nwse-resize items-end justify-end p-1.5 opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100 motion-reduce:transition-none ${
                isLightBg
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-zinc-500 hover:text-zinc-100'
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M9 1L1 9M9 5L5 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </section>
        )
      })}
    </>
  )
}
