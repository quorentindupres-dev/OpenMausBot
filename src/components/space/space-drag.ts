import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Point } from "@/lib/team-canvas";
import { SPACE_LEVELS, type SpaceLevel } from "../../../shared/space";

export type DragItem =
  | { kind: "bot"; botId: string; threadId?: string; fromGoalId?: string }
  | { kind: "space"; level: SpaceLevel }
  | { kind: "note" };
export type DropTarget = { kind: "tile"; key: string } | { kind: "bench" } | { kind: "canvas" } | null;

const THRESHOLD = 4;

/** The ghost is `pointer-events: none`, so the element under the cursor is the real target. */
export function dropTargetAt(x: number, y: number): DropTarget {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  if (element.closest("[data-space-bench-drop]")) return { kind: "bench" };
  const tile = element.closest<HTMLElement>("[data-space-key]");
  if (tile?.dataset.spaceKey) return { kind: "tile", key: tile.dataset.spaceKey };
  return element.closest("[data-space-canvas]") ? { kind: "canvas" } : null;
}

export function dragItemAt(target: EventTarget | null): DragItem | null {
  const element = target instanceof Element ? target : null;
  const source = element?.closest<HTMLElement>("[data-drag-bot], [data-drag-new], [data-drag-note], [data-drag-new-note]");
  if (!source) return null;
  if (source.dataset.dragBot) {
    return {
      kind: "bot",
      botId: source.dataset.dragBot,
      ...(source.dataset.dragThread ? { threadId: source.dataset.dragThread } : {}),
      ...(source.dataset.dragFrom ? { fromGoalId: source.dataset.dragFrom } : {}),
    };
  }
  if (source.dataset.dragNote || source.dataset.dragNewNote !== undefined) {
    return { kind: "note" };
  }
  const level = source.dataset.dragNew as SpaceLevel;
  return SPACE_LEVELS.includes(level) ? { kind: "space", level } : null;
}

export type Drag = { item: DragItem; point: Point; target: DropTarget };

/** Pointer-driven dragging for the Spaces map: past a few pixels a ghost follows the cursor, and letting go drops on
 * whatever is under it. A press that never moves stays a click. */
export function useSpaceDrag(onDrop: (item: DragItem, target: DropTarget, at: Point) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const begin = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || stop.current) return false;
    const item = dragItemAt(event.target);
    if (!item) return false;
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    const move = (next: PointerEvent) => {
      if (!moved && Math.hypot(next.clientX - start.x, next.clientY - start.y) < THRESHOLD) return;
      moved = true;
      next.preventDefault();
      setDrag({ item, point: { x: next.clientX, y: next.clientY }, target: dropTargetAt(next.clientX, next.clientY) });
    };
    const swallowClick = (click: MouseEvent) => { click.stopPropagation(); click.preventDefault(); };
    const end = (up: PointerEvent, cancelled: boolean) => {
      cleanup();
      setDrag(null);
      if (!moved) return;
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallowClick, { capture: true }), 0);
      if (!cancelled) drop.current(item, dropTargetAt(up.clientX, up.clientY), { x: up.clientX, y: up.clientY });
    };
    const up = (next: PointerEvent) => end(next, false);
    const cancel = (next: PointerEvent) => end(next, true);
    const escape = (key: KeyboardEvent) => { if (key.key === "Escape") { cleanup(); setDrag(null); } };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape);
      stop.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape);
    stop.current = cleanup;
    return true;
  }, []);

  return { drag, begin };
}
