// WS-D (TASK_16 wave 2): "N asks" chip, top right of the canvas. Click = next open ask, Shift+click =
// previous (keys N / Shift+N). It shows the white Spaceware sprite of the agent it goes to next, with
// its role accessory. One control, read only on agent data. Owner: WS-D.
import { stepAsk } from '../../core/ask-pins'
import { MiniSpacewareSprite } from '../../sprites/space-sprite'
import { spriteRoleOf } from '../../sprites/space-sprite-accessory'
import type { CanvasCtx } from '../canvas-ctx'
import type { AskPinsApi } from './use-ask-pins'

export function AskNavigator({
  ctx,
  api
}: {
  ctx: CanvasCtx
  api: AskPinsApi
}): React.JSX.Element | null {
  const { asks, activeAskId, nextAsk, prevAsk } = api
  if (asks.length === 0) {
    return null
  }
  const upcoming = stepAsk(asks, activeAskId, 1)!
  const at = activeAskId ? asks.findIndex((ref) => ref.ask.id === activeAskId) : -1
  const agent = ctx.agents.find(
    (a) => a.id === upcoming.ask.botId || a.unifiedTabId === upcoming.ask.botId
  )
  const who = upcoming.ask.botName || upcoming.ask.agentName || agent?.name || 'Agent'
  const count = `${asks.length} ${asks.length === 1 ? 'ask' : 'asks'}`
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-30">
      <button
        type="button"
        data-ask-navigator={asks.length}
        aria-label={`${count} waiting on you. Go to the next: ${who}`}
        title={`${count} waiting on you\nClick or N: next (${who}) · Shift+click or Shift+N: previous · ⌘F: jump by name`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          if (event.shiftKey) {
            prevAsk()
          } else {
            nextAsk()
          }
        }}
        className="pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-red-500/55 bg-zinc-950/90 py-1 pl-1.5 pr-2.5 text-xs font-semibold text-zinc-100 shadow-lg backdrop-blur-md hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <MiniSpacewareSprite attention awake role={spriteRoleOf(agent ?? { name: who })} />
        <span>{count}</span>
        {at >= 0 ? (
          <span className="font-mono text-[10px] text-zinc-400">
            {at + 1}/{asks.length}
          </span>
        ) : null}
        <span aria-hidden="true" className="text-zinc-400">
          ›
        </span>
      </button>
    </div>
  )
}
