// WS-D (TASK_16 wave 2): numbered pins for every open agent ask, beside the tile they belong to.
// Screen space (outside the zoomed layer) so a pin keeps its size at any zoom, like Penpot's comment
// bubbles. Read only: a click glides to the tile and selects the asking agent (onSelectAgent); the
// answer happens in that agent's panel. AskLayer is the one mount for pins + edge arrows + navigator
// + ⌘F jump. Owner: WS-D.
import { ZOOM_TWEEN_MS } from '../../core/space'
import { ASK_PIN_SIZE, type AskPin } from '../../core/ask-pins'
import { SPACEWARE_ISLAND_PALETTE } from '../../sprites/space-sprite'
import type { CanvasCtx } from '../canvas-ctx'
import { AskEdgeIndicators } from './AskEdgeIndicators'
import { AskNavigator } from './AskNavigator'
import { JumpTo } from './JumpTo'
import { useAskPins } from './use-ask-pins'

/** The needs-you colour (same red as a sprite that waits on you). */
export const ASK_NEEDS_YOU = SPACEWARE_ISLAND_PALETTE.attentionHalo

export function AskPins({
  pins,
  textOf,
  activeAskId,
  tweening,
  reducedMotion,
  onPick
}: {
  pins: readonly AskPin[]
  textOf: (askId: string) => string
  activeAskId: string | null
  tweening: boolean
  reducedMotion: boolean
  onPick: (askId: string) => void
}): React.JSX.Element | null {
  const shown = pins.filter((pin) => pin.visible)
  if (shown.length === 0) {
    return null
  }
  const half = ASK_PIN_SIZE / 2
  return (
    <div data-ask-pins="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {shown.map((pin) => {
        const label = textOf(pin.askId)
        const active = pin.askId === activeAskId
        return (
          <button
            key={pin.askId}
            type="button"
            data-ask-pin={pin.askId}
            data-ask-tile={pin.tileKey}
            aria-label={`Ask ${pin.n}: ${label}. Go to the agent`}
            title={`${label}${pin.more > 0 ? ` (+${pin.more} more on this Space)` : ''}\nClick: go to the agent (answer in its panel)`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onPick(pin.askId)
            }}
            style={{
              width: ASK_PIN_SIZE,
              height: ASK_PIN_SIZE,
              transform: `translate3d(${pin.x - half}px, ${pin.y - half}px, 0)`,
              backgroundColor: ASK_NEEDS_YOU,
              transition:
                tweening && !reducedMotion
                  ? `transform ${ZOOM_TWEEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
                  : undefined
            }}
            className={`pointer-events-auto absolute left-0 top-0 flex cursor-pointer items-center justify-center rounded-full rounded-bl-none border-2 border-white text-[10px] font-bold leading-none text-white shadow-[0_4px_12px_rgba(0,0,0,0.45)] hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:hover:scale-100 ${
              active ? 'ring-2 ring-white/80' : ''
            }`}
          >
            {pin.n}
            {pin.more > 0 ? (
              <span
                data-ask-pin-more={pin.more}
                className="absolute -right-2 -top-2 rounded-full bg-zinc-950 px-1 text-[9px] text-white ring-1 ring-white/40"
              >
                +{pin.more}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** One mount for everything WS-D draws on the canvas. */
export function AskLayer({ ctx }: { ctx: CanvasCtx }): React.JSX.Element | null {
  const api = useAskPins(ctx)
  const { asks, measured, layout, activeAskId, goToAsk, jumpOpen, setJumpOpen } = api
  const textById = new Map(
    asks.map((ref) => [
      ref.ask.id,
      `${ref.ask.botName || ref.ask.agentName || 'Agent'}: ${ref.ask.text}`
    ])
  )
  const textOf = (askId: string): string => textById.get(askId) ?? ''
  if (!measured || (asks.length === 0 && !jumpOpen)) {
    return null
  }
  return (
    <>
      <AskPins
        pins={layout.pins}
        textOf={textOf}
        activeAskId={activeAskId}
        tweening={ctx.zoomTweening}
        reducedMotion={ctx.reducedMotion}
        onPick={goToAsk}
      />
      <AskEdgeIndicators edges={layout.edges} textOf={textOf} onPick={goToAsk} />
      <AskNavigator ctx={ctx} api={api} />
      {jumpOpen ? <JumpTo ctx={ctx} api={api} onClose={() => setJumpOpen(false)} /> : null}
    </>
  )
}
