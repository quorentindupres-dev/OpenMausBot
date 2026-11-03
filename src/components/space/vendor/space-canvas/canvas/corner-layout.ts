// U-37 (UX review): where the bottom corner pills live, and what the centre dock and Fit leave free.
// Why: undo/redo + zoom sat on the right end of the whiteboard toolbar and cut its note / shape tools.
// One column in the bottom-right corner, with the dock told to stop before it.
export const CORNER_W = 148
export const CORNER_GAP = 12
/** Free space the dock keeps on EACH side so it stays centred and never meets a corner cluster. */
export const DOCK_SIDE_RESERVE = CORNER_W + CORNER_GAP * 2
export const dockMaxWidth = `calc(100% - ${DOCK_SIDE_RESERVE * 2}px)`

/** Screen px the canvas overlays cover, used by Fit so tiles are centred in what is left. */
export const FIT_TOP_INSET = 56 // Copilot chip + ask pill row
export const FIT_BOTTOM_INSET = 104 // whiteboard toolbar + its tooltip row
export const FIT_SIDE_INSET = 16

/** Below this canvas width the toolbar (about 560 px compact) and the corner column cannot sit side by side. */
export const SIDE_BY_SIDE_MIN_CANVAS = 560 + DOCK_SIDE_RESERVE * 2
/** Corner `bottom` when stacked: clear of the toolbar row (about 72 px) and its tooltip. */
export const CORNER_STACKED_BOTTOM = 92

/** Narrow canvas: the zoom / undo column goes ABOVE the toolbar's right end, the toolbar keeps the width. */
export function cornerStacked(canvasWidth: number): boolean {
  return canvasWidth > 0 && canvasWidth < SIDE_BY_SIDE_MIN_CANVAS
}
export function dockMaxWidthFor(canvasWidth: number): string {
  return cornerStacked(canvasWidth) ? `calc(100% - ${CORNER_GAP * 2}px)` : dockMaxWidth
}
export function cornerBottomFor(canvasWidth: number): number {
  return cornerStacked(canvasWidth) ? CORNER_STACKED_BOTTOM : CORNER_GAP
}
