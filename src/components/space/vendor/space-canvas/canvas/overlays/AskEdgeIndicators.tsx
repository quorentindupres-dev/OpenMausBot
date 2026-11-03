// WS-D (TASK_16 wave 2): small arrows on the canvas border that point at asks outside the view, with
// a count when several sit the same way. Click = go to the oldest of them (glide + select its agent).
// Read only on agent data. Owner: WS-D.
import type { AskEdge } from '../../core/ask-pins'
import { ASK_NEEDS_YOU } from './AskPins'

export function AskEdgeIndicators({
  edges,
  textOf,
  onPick
}: {
  edges: readonly AskEdge[]
  textOf: (askId: string) => string
  onPick: (askId: string) => void
}): React.JSX.Element | null {
  if (edges.length === 0) {
    return null
  }
  return (
    <div
      data-ask-edges="true"
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
    >
      {edges.map((edge) => {
        const first = edge.askIds[0]!
        const label =
          edge.count > 1 ? `${edge.count} asks off screen` : `Ask off screen: ${textOf(first)}`
        return (
          <button
            key={edge.askIds.join('|')}
            type="button"
            data-ask-edge={edge.count}
            data-ask-edge-angle={Math.round(edge.angle)}
            aria-label={`${label}. Go to the oldest`}
            title={`${label}\nClick: go there`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onPick(first)
            }}
            style={{ transform: `translate3d(${edge.x - 14}px, ${edge.y - 14}px, 0)` }}
            className="pointer-events-auto absolute left-0 top-0 flex size-7 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              aria-hidden="true"
              style={{ transform: `rotate(${edge.angle}deg)` }}
              className="absolute inset-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            >
              <path d="M28 14 L20 8 V20 Z" fill={ASK_NEEDS_YOU} />
              <circle cx="14" cy="14" r="8.5" fill={ASK_NEEDS_YOU} stroke="#fff" strokeWidth="2" />
            </svg>
            <span className="relative text-[10px] font-bold leading-none text-white">
              {edge.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
