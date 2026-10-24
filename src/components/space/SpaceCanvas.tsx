import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowRight, Minus, MoreHorizontal, Plus, UserPlus, X } from "lucide-react";
import { useStore, type Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { CARD_WIDTH, fitTeams, zoomAt, type Point, type View } from "@/lib/team-canvas";
import { BotCard } from "../TeamCanvas";
import { CANVAS_NOTE_COLORS, type CanvasNoteColor, type CanvasNotePatch, type SpaceCanvasNote, type SpaceGoal, type SpaceLayout, type SpaceState } from "../../../shared/space";
import { GoalAvatarPicker, readImageFileAsDataUrl } from "./GoalAvatarPicker";
import { LevelChip } from "./LevelChip";
import { slotBot, spaceSlots, type KnownThread, type SpaceSlot } from "./space-api";
import type { Drag } from "./space-drag";
import { LEVEL_STYLE } from "./space-levels";
import { BENCH_KEY, layoutSpaces, resizeTile, tileColumns, toCanvas, type ResizeCorner, type SpaceTile } from "./space-layout";

const GLIDE_MS = 400;
const iconButton = "flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";

const NOTE_COLOR_STYLE: Record<CanvasNoteColor, { card: string; dot: string }> = {
  yellow: { card: "border-warning/40 bg-warning/15", dot: "bg-warning" },
  blue: { card: "border-accent/40 bg-accent/15", dot: "bg-accent" },
  green: { card: "border-success/40 bg-success/15", dot: "bg-success" },
  pink: { card: "border-danger/40 bg-danger/15", dot: "bg-danger" },
  neutral: { card: "border-hairline/70 bg-card", dot: "bg-ink-secondary" },
};

function resizeNoteLayout(origin: SpaceLayout, corner: ResizeCorner, dx: number, dy: number): SpaceLayout {
  const minW = 140;
  const minH = 100;
  const rawW = corner.includes("e") ? origin.w + dx : origin.w - dx;
  const w = Math.min(2000, Math.max(minW, Math.round(rawW)));
  const rawH = corner.includes("s") ? origin.h + dy : origin.h - dy;
  const h = Math.min(2000, Math.max(minH, Math.round(rawH)));
  const x = corner.includes("w") ? Math.round(origin.x + (origin.w - w)) : origin.x;
  const y = corner.includes("n") ? Math.round(origin.y + (origin.h - h)) : origin.y;
  return { x, y, w, h };
}

type Gesture = { id: number; start: Point; view: View; moved: boolean } & (
  | { kind: "pan" }
  | { kind: "tile"; key: string; origin: SpaceTile }
  | { kind: "resize"; key: string; corner: ResizeCorner; origin: SpaceTile; bots: number; side: boolean }
  | { kind: "note"; noteId: string; origin: SpaceLayout }
  | { kind: "note-resize"; noteId: string; corner: ResizeCorner; origin: SpaceLayout }
);

export type SpaceCanvasActions = {
  moveTile(key: string, layout: SpaceLayout): void;
  open(goal: SpaceGoal): void;
  openCard(slot: SpaceSlot, goal?: SpaceGoal): void;
  menu(event: ReactMouseEvent, goal: SpaceGoal, bot?: Bot, threadId?: string): void;
  pickLevel(event: ReactMouseEvent, goal: SpaceGoal): void;
  canvasMenu(screen: Point, at: Point): void;
  newSpaceAt(at: Point): void;
  addAgent(event: ReactMouseEvent, goal: SpaceGoal): void;
  rename(goal: SpaceGoal, title: string): void;
  setIcon?(goal: SpaceGoal, icon: string | null): void;
  patchNote?(id: string, patch: CanvasNotePatch): void;
  deleteNote?(id: string): void;
};

const NO_KNOWN: Readonly<Record<string, KnownThread>> = {};

function useGlide(
  world: React.RefObject<HTMLDivElement | null>,
  scale: number,
  placements: Record<string, string>,
  threadGoals: Record<string, string>,
  knownThreads: Readonly<Record<string, KnownThread>>,
  loaded: boolean,
) {
  const last = useRef(new Map<string, { x: number; y: number; key: string }>());
  useLayoutEffect(() => {
    const root = world.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const seen = new Map<string, { x: number; y: number; key: string }>();
    for (const card of root.querySelectorAll<HTMLElement>("[data-space-card]")) {
      const botId = card.dataset.spaceCard!, threadId = card.dataset.spaceThread, key = card.dataset.spaceIn!;
      if (key === BENCH_KEY) continue;
      const id = threadId ? `${botId}:${threadId}` : botId;
      const box = card.getBoundingClientRect();
      const here = { x: (box.left - origin.left) / scale, y: (box.top - origin.top) / scale, key };
      const before = last.current.get(id) ?? (threadId ? undefined : last.current.get(botId));
      if (loaded && before && before.key !== key && card.animate) {
        card.animate([{ transform: `translate(${before.x - here.x}px, ${before.y - here.y}px)` }, { transform: "translate(0, 0)" }],
          { duration: GLIDE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
      seen.set(id, here);
      if (!seen.has(botId)) seen.set(botId, here);
    }
    last.current = loaded ? seen : new Map();
  }, [world, scale, placements, threadGoals, knownThreads, loaded]);
}

function TitleInput({ goal, onDone }: { goal: SpaceGoal; onDone(title: string | null): void }) {
  const [value, setValue] = useState(goal.title);
  const finished = useRef(false);
  const done = (title: string | null) => { if (finished.current) return; finished.current = true; onDone(title); };
  return <input autoFocus aria-label={t("quest.canvas.title")} value={value} maxLength={120} onFocus={(event) => event.currentTarget.select()}
    onChange={(event) => setValue(event.target.value)} onBlur={() => done(value.trim() || null)}
    onKeyDown={(event) => { if (event.key === "Enter") done(value.trim() || null); if (event.key === "Escape") done(null); }}
    className="min-w-0 flex-1 rounded-md border border-accent/60 bg-app px-2 py-1 text-[13px] font-semibold outline-none" />;
}

function CanvasNoteCard({ note, layout, actions }: { note: SpaceCanvasNote; layout: SpaceLayout; actions: SpaceCanvasActions }) {
  const [text, setText] = useState(note.text);
  const debounceRef = useRef<number | null>(null);
  const lastSavedRef = useRef(note.text);
  useEffect(() => {
    setText(note.text);
    lastSavedRef.current = note.text;
  }, [note.text]);
  useEffect(() => () => { if (debounceRef.current !== null) window.clearTimeout(debounceRef.current); }, []);
  const flush = (nextText: string) => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (nextText !== lastSavedRef.current) {
      lastSavedRef.current = nextText;
      actions.patchNote?.(note.id, { text: nextText });
    }
  };
  const style = NOTE_COLOR_STYLE[note.color] ?? NOTE_COLOR_STYLE.yellow;
  return (
    <article
      data-canvas-note={note.id}
      data-note-color={note.color}
      aria-label={t("quest.note.aria")}
      style={{ left: layout.x, top: layout.y, width: layout.w, height: layout.h }}
      className={cn("absolute z-10 flex flex-col overflow-hidden rounded-xl border shadow-md backdrop-blur-sm", style.card)}
    >
      <div
        data-note-handle={note.id}
        className="flex h-7 shrink-0 cursor-grab items-center justify-between gap-1.5 border-b border-hairline/30 px-2.5 active:cursor-grabbing"
      >
        <div className="flex items-center gap-1">
          {CANVAS_NOTE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              data-note-color-pick={color}
              aria-label={t(`quest.note.color.${color}`)}
              onClick={(event) => { event.stopPropagation(); actions.patchNote?.(note.id, { color }); }}
              className={cn(
                "size-3 rounded-full transition-transform hover:scale-110",
                NOTE_COLOR_STYLE[color].dot,
                note.color === color && "ring-2 ring-ink/60",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          data-note-delete={note.id}
          aria-label={t("quest.note.delete")}
          onClick={(event) => { event.stopPropagation(); actions.deleteNote?.(note.id); }}
          className="rounded p-0.5 text-ink-secondary hover:bg-control hover:text-ink"
        >
          <X size={12} />
        </button>
      </div>
      <textarea
        data-note-text={note.id}
        aria-label={t("quest.note.textAria")}
        placeholder={t("quest.note.placeholder")}
        value={text}
        maxLength={2000}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => flush(next), 350);
        }}
        onBlur={(event) => flush(event.currentTarget.value)}
        className="min-h-0 flex-1 resize-none bg-transparent p-2.5 text-[12.5px] leading-[17px] text-ink outline-none placeholder:text-ink-tertiary"
      />
      <span data-note-resize={note.id} data-resize-corner="nw" className="absolute left-0 top-0 z-20 size-3 cursor-nwse-resize" />
      <span data-note-resize={note.id} data-resize-corner="ne" className="absolute right-0 top-0 z-20 size-3 cursor-nesw-resize" />
      <span data-note-resize={note.id} data-resize-corner="sw" className="absolute bottom-0 left-0 z-20 size-3 cursor-nesw-resize" />
      <span data-note-resize={note.id} data-resize-corner="se" className="absolute bottom-0 right-0 z-20 flex size-4 cursor-nwse-resize items-end justify-end p-0.5 text-ink-secondary/50 hover:text-ink">
        <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true"><path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </span>
    </article>
  );
}

export function SpaceCanvas({ space, bots, knownThreads = NO_KNOWN, activeChat = null, actions, drag, editingTitle, onTitleDone, toCanvasRef, bottomInset = 0 }: {
  space: SpaceState;
  bots: Bot[];
  knownThreads?: Readonly<Record<string, KnownThread>>;
  activeChat?: { botId: string; threadId?: string } | null;
  actions: SpaceCanvasActions;
  drag: Drag | null;
  editingTitle: string | null;
  onTitleDone(): void;
  toCanvasRef: MutableRefObject<((client: Point) => Point) | null>;
  bottomInset?: number;
}) {
  const { state } = useStore();
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [view, setView] = useState<View>({ x: 40, y: 40, scale: 1 });
  const [moved, setMoved] = useState<{ key: string; x: number; y: number; w: number; h: number } | null>(null);
  const [movedNote, setMovedNote] = useState<{ id: string; layout: SpaceLayout } | null>(null);
  const members = useMemo(() => {
    const groups = new Map<string, SpaceSlot[]>();
    for (const goal of space.goals) groups.set(goal.id, spaceSlots(space, bots, goal.id, knownThreads));
    groups.set(BENCH_KEY, bots.map((bot) => ({ id: `bench:${bot.id}`, bot })));
    return groups;
  }, [space, bots, knownThreads]);
  const benchBots = useMemo(() => {
    const list = members.get(BENCH_KEY) ?? [];
    return { chiefs: list.filter((slot) => slot.bot.chiefOfStaff).length, members: list.filter((slot) => !slot.bot.chiefOfStaff).length };
  }, [members]);
  const tiles = useMemo(() => layoutSpaces(space.goals, (key) => members.get(key)?.length ?? 0, space.bench, benchBots)
    .map((tile) => moved?.key === tile.key ? { ...tile, x: moved.x, y: moved.y, w: moved.w, h: moved.h } : tile), [space.goals, space.bench, members, benchBots, moved]);
  const current = useRef({ view, tiles, bottomInset });
  current.current = { view, tiles, bottomInset };
  useGlide(world, view.scale, space.placements, space.threadGoals, knownThreads, space.goals.length > 0);

  const local = (client: { clientX: number; clientY: number }): Point => {
    const bounds = viewport.current?.getBoundingClientRect();
    return { x: client.clientX - (bounds?.left ?? 0), y: client.clientY - (bounds?.top ?? 0) };
  };
  toCanvasRef.current = (client) => toCanvas(local({ clientX: client.x, clientY: client.y }), view);

  const fit = useCallback(() => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (bounds) setView(fitTeams(current.current.tiles.map((tile) => ({ key: tile.key, x: tile.x, y: tile.y, width: tile.w, height: tile.h })), bounds.width, Math.max(200, bounds.height - current.current.bottomInset)));
  }, []);
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !space.goals.length) return;
    fitted.current = true;
    fit();
  }, [fit, space.goals.length]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (gesture.current) return;
      const previous = current.current.view;
      const bounds = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const scale = Math.min(1.5, Math.max(0.3, previous.scale * Math.exp(-event.deltaY * 0.006)));
        setView(zoomAt(previous, scale, { x: event.clientX - bounds.left, y: event.clientY - bounds.top }));
      } else {
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
        setView({ ...previous, x: previous.x - event.deltaX * unit, y: previous.y - event.deltaY * unit });
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    const element = event.target as HTMLElement;
    if (element.closest("[data-drag-bot], [data-drag-new], [data-drag-note], [data-drag-new-note]")) return;
    const common = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, view, moved: false };
    const noteResize = element.closest<HTMLElement>("[data-note-resize]");
    if (noteResize?.dataset.noteResize) {
      const note = (space.canvasNotes ?? []).find((candidate) => candidate.id === noteResize.dataset.noteResize);
      if (!note) return;
      const corner = (noteResize.dataset.resizeCorner as ResizeCorner) || "se";
      gesture.current = { ...common, kind: "note-resize", noteId: note.id, corner, origin: note.layout };
      suppressClick.current = false;
      return;
    }
    const noteHandle = element.closest<HTMLElement>("[data-note-handle]")?.dataset.noteHandle;
    if (noteHandle) {
      if (element.closest("button")) return;
      const note = (space.canvasNotes ?? []).find((candidate) => candidate.id === noteHandle);
      if (!note) return;
      gesture.current = { ...common, kind: "note", noteId: note.id, origin: note.layout };
      suppressClick.current = false;
      return;
    }
    const resize = element.closest<HTMLElement>("[data-tile-resize]");
    if (resize?.dataset.tileResize) {
      const tile = tiles.find((candidate) => candidate.key === resize.dataset.tileResize);
      const goal = space.goals.find((candidate) => candidate.id === tile?.key);
      if (!tile || !goal) return;
      const corner = (resize.dataset.resizeCorner as ResizeCorner) || "se";
      gesture.current = { ...common, kind: "resize", key: tile.key, corner, origin: tile, bots: members.get(tile.key)?.length ?? 0, side: goal.level === "side" };
      suppressClick.current = false;
      return;
    }
    const handle = element.closest<HTMLElement>("[data-tile-handle]")?.dataset.tileHandle;
    if (handle === undefined && element.closest("button, input, select, textarea, a, [data-space-key], [data-canvas-note]")) return;
    const tile = handle === undefined ? undefined : tiles.find((candidate) => candidate.key === handle);
    gesture.current = tile ? { ...common, kind: "tile", key: tile.key, origin: tile } : { ...common, kind: "pan" };
    suppressClick.current = false;
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (event.buttons === 0) { finish(event, true); return; }
    const dx = event.clientX - active.start.x, dy = event.clientY - active.start.y;
    if (!active.moved && Math.hypot(dx, dy) < 4) return;
    active.moved = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (active.kind === "pan") setView({ ...active.view, x: active.view.x + dx, y: active.view.y + dy });
    if (active.kind === "tile") setMoved({ key: active.key, x: active.origin.x + dx / view.scale, y: active.origin.y + dy / view.scale, w: active.origin.w, h: active.origin.h });
    if (active.kind === "resize") setMoved({ key: active.key, ...resizeTile(active.origin, active.corner, dx / view.scale, dy / view.scale, active.bots, active.side) });
    if (active.kind === "note") setMovedNote({ id: active.noteId, layout: { ...active.origin, x: Math.round(active.origin.x + dx / view.scale), y: Math.round(active.origin.y + dy / view.scale) } });
    if (active.kind === "note-resize") setMovedNote({ id: active.noteId, layout: resizeNoteLayout(active.origin, active.corner, dx / view.scale, dy / view.scale) });
  };
  const finish = (event?: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const active = gesture.current;
    if (!active || (event && active.id !== event.pointerId)) return;
    gesture.current = null;
    suppressClick.current = active.moved;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    if (viewport.current?.hasPointerCapture?.(active.id)) viewport.current.releasePointerCapture(active.id);
    if (cancelled) { setMoved(null); setMovedNote(null); setView(active.view); return; }
    if (active.kind === "note-resize") {
      if (active.moved && event) {
        const dx = (event.clientX - active.start.x) / active.view.scale;
        const dy = (event.clientY - active.start.y) / active.view.scale;
        actions.patchNote?.(active.noteId, { layout: resizeNoteLayout(active.origin, active.corner, dx, dy) });
      }
      setMovedNote(null);
      return;
    }
    if (active.kind === "note") {
      if (active.moved && event) {
        const x = Math.round(active.origin.x + (event.clientX - active.start.x) / active.view.scale);
        const y = Math.round(active.origin.y + (event.clientY - active.start.y) / active.view.scale);
        actions.patchNote?.(active.noteId, { layout: { ...active.origin, x, y } });
      }
      setMovedNote(null);
      return;
    }
    if (active.kind === "resize") {
      if (active.moved && event) {
        const dx = (event.clientX - active.start.x) / active.view.scale;
        const dy = (event.clientY - active.start.y) / active.view.scale;
        actions.moveTile(active.key, resizeTile(active.origin, active.corner, dx, dy, active.bots, active.side));
      }
      setMoved(null);
      return;
    }
    if (active.kind !== "tile") return;
    if (!active.moved || !event) {
      const goal = space.goals.find((candidate) => candidate.id === active.key);
      if (goal && !active.moved) actions.open(goal);
      return;
    }
    const x = active.origin.x + (event.clientX - active.start.x) / active.view.scale;
    const y = active.origin.y + (event.clientY - active.start.y) / active.view.scale;
    actions.moveTile(active.key, { x, y, w: active.origin.w, h: active.origin.h });
    setMoved(null);
  };
  const zoom = (factor: number) => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (bounds) setView(zoomAt(view, Math.max(0.3, Math.min(1.5, view.scale * factor)), { x: bounds.width / 2, y: bounds.height / 2 }));
  };
  const emptyCanvas = (target: EventTarget) => !(target as HTMLElement).closest("[data-space-key], [data-canvas-note], button, input, textarea");
  const hovered = drag?.target?.kind === "tile" ? drag.target.key : null;

  return <div ref={viewport} role="region" aria-label={t("quest.canvas.region")} tabIndex={0} data-space-canvas
    className={cn("relative min-h-0 flex-1 touch-none select-none overflow-clip outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
      drag?.target?.kind === "canvas" && "bg-accent/[0.03]")}
    style={{ backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--color-ink-secondary) 18%, transparent) 1px, transparent 1px)", backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
    onPointerDown={start} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}
    onLostPointerCapture={() => { if (gesture.current) finish(undefined, true); }}
    onClickCapture={(event) => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }}
    onDoubleClick={(event) => { if (emptyCanvas(event.target)) actions.newSpaceAt(toCanvas(local(event), view)); }}
    onContextMenu={(event) => {
      if (!emptyCanvas(event.target)) return;
      event.preventDefault();
      actions.canvasMenu({ x: event.clientX, y: event.clientY }, toCanvas(local(event), view));
    }}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      const directions: Record<string, Point> = { ArrowLeft: { x: 60, y: 0 }, ArrowRight: { x: -60, y: 0 }, ArrowUp: { x: 0, y: 60 }, ArrowDown: { x: 0, y: -60 } };
      const delta = directions[event.key];
      if (delta) { event.preventDefault(); setView({ ...view, x: view.x + delta.x, y: view.y + delta.y }); }
      if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1.2); }
      if (event.key === "-") { event.preventDefault(); zoom(1 / 1.2); }
      if (event.key === "0") { event.preventDefault(); fit(); }
    }}>
    <div ref={world} data-canvas-world className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
      {tiles.map((tile) => {
        const goal = space.goals.find((candidate) => candidate.id === tile.key);
        const inside = members.get(tile.key) ?? [];
        const style = goal ? LEVEL_STYLE[goal.level] : null;
        const fromHere = drag?.item.kind === "bot" && (drag.item.fromGoalId ?? BENCH_KEY) === tile.key && Boolean(drag.item.fromGoalId || tile.key === BENCH_KEY);
        const dropping = hovered === tile.key && (drag?.item.kind !== "bot" || !fromHere);
        const title = goal ? goal.title : t("quest.bench");
        const open = goal?.asks.filter((ask) => ask.status === "open").length ?? 0;
        const chiefs = goal ? [] : inside.filter((slot) => slot.bot.chiefOfStaff);
        const others = goal ? inside : inside.filter((slot) => !slot.bot.chiefOfStaff);
        const hierarchy = chiefs.length > 0 && others.length > 0;
        const columns = Math.min(tileColumns(tile.w), Math.max(1, inside.length));
        const renderSlot = (slot: SpaceSlot) => {
          const isSelected = goal
            ? Boolean(activeChat && (slot.threadId ? activeChat.threadId === slot.threadId : activeChat.botId === slot.bot.id && !activeChat.threadId))
            : (!activeChat && state.selectedId === slot.bot.id && state.settingsOpen);
          const isMoving = Boolean(goal && drag?.item.kind === "bot" && drag.item.fromGoalId === goal.id && (
            drag.item.threadId ? drag.item.threadId === slot.threadId : drag.item.botId === slot.bot.id
          ));
          const cardSubtitle = goal ? (slot.title || goal.title) : undefined;
          const cardBot = goal ? slotBot(slot) : slot.bot;
          return <div key={slot.id} data-space-card={slot.bot.id} data-space-thread={slot.threadId} data-space-in={tile.key}
            data-drag-bot={slot.bot.id} data-drag-thread={slot.threadId} data-drag-from={goal?.id}
            className="relative cursor-grab touch-none active:cursor-grabbing"
            onContextMenu={(event) => { if (!goal) return; event.preventDefault(); event.stopPropagation(); actions.menu(event, goal, slot.bot, slot.threadId); }}>
            <BotCard bot={cardBot} subtitle={cardSubtitle} selected={isSelected} moving={isMoving} connected={false} onSelect={goal ? () => actions.openCard(slot, goal) : undefined} />
          </div>;
        };
        const handleTileDrop = (event: ReactDragEvent<HTMLElement>) => {
          if (!goal) return;
          const file = event.dataTransfer?.files?.[0];
          if (!file || !file.type.startsWith("image/")) return;
          event.preventDefault();
          event.stopPropagation();
          void readImageFileAsDataUrl(file).then((dataUrl) => {
            if (dataUrl) actions.setIcon?.(goal, dataUrl);
          });
        };
        return <section key={tile.key} data-space-key={tile.key} data-goal-zone={goal?.id} data-level={goal?.level} data-dropping={dropping || undefined}
          aria-label={goal ? t("quest.space.aria", { title }) : t("quest.bench")}
          onContextMenu={(event) => { if (!goal) return; event.preventDefault(); event.stopPropagation(); actions.menu(event, goal); }}
          onDragOver={(event) => {
            if (goal && event.dataTransfer?.files?.[0]?.type.startsWith("image/")) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onDrop={handleTileDrop}
          className={cn("absolute flex flex-col overflow-hidden rounded-2xl border bg-panel/90 shadow-sm transition-shadow", style?.border ?? "border-dashed border-hairline/70",
            dropping && "ring-4 ring-accent/40", goal && goal.status !== "active" && "opacity-60")}
          style={{ left: tile.x, top: tile.y, width: tile.w, height: tile.h }}>
          <header className="flex h-16 shrink-0 items-center gap-2 px-5">
            {goal && <GoalAvatarPicker goal={goal} onChange={(icon) => actions.setIcon?.(goal, icon)} />}
            {goal && <button type="button" data-level-picker={goal.id} aria-label={t("quest.editor.level")}
              onClick={(event) => { event.stopPropagation(); actions.pickLevel(event, goal); }}
              className="shrink-0 rounded focus-visible:outline-2 focus-visible:outline-accent">
              <LevelChip level={goal.level} className="cursor-pointer hover:brightness-95" />
            </button>}
            {goal && editingTitle === goal.id
              ? <TitleInput goal={goal} onDone={(next) => { onTitleDone(); if (next && next !== goal.title) actions.rename(goal, next); }} />
              : <button data-tile-handle={tile.key} aria-label={goal ? t("quest.canvas.openSpace", { title }) : t("quest.canvas.moveBench")}
                className="flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md py-2 text-left active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-accent"
                onKeyDown={(event) => { if (goal && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); actions.open(goal); } }}>
                <h2 className="truncate text-[13px] font-semibold tracking-tight">{title}</h2>
              </button>}
            <span className="text-[11px] tabular-nums text-ink-secondary">{inside.length}</span>
            {goal && <button className={iconButton} aria-label={t("quest.canvas.addAgent", { title })} title={t("quest.canvas.addAgentHint")} onClick={(event) => actions.addAgent(event, goal)}><UserPlus size={15} /></button>}
            {goal && <button className={iconButton} aria-label={t("quest.space.more", { title })} onClick={(event) => actions.menu(event, goal)}><MoreHorizontal size={17} /></button>}
          </header>
          {goal && goal.level !== "side" && <button className="mx-5 mb-2 block h-[38px] shrink-0 w-[calc(100%-40px)] rounded-md text-left text-[11.5px] leading-[16px] text-ink-secondary hover:bg-control/60" onClick={() => actions.open(goal)}>
            <span dir="auto" className="block truncate text-ink">{goal.goal || t("quest.part.setGoal")}</span>
            <span className="block truncate">{t("quest.canvas.summary", { done: goal.outcomes.filter((outcome) => outcome.done).length, outcomes: goal.outcomes.length, tasks: goal.tasks.filter((task) => !task.done).length, asks: open })}</span>
          </button>}
          {goal ? <div className={cn("grid flex-1 content-start gap-4 px-5 pb-5", inside.length === 0 && "flex")}
            style={inside.length > 0 ? { gridTemplateColumns: `repeat(${columns}, ${CARD_WIDTH}px)` } : undefined}>
            {inside.map(renderSlot)}
            {inside.length === 0 && <p className={cn("flex min-h-[84px] flex-1 items-center justify-center rounded-xl border border-dashed px-6 text-center text-[12px]",
              dropping ? "border-accent/70 text-ink" : "border-hairline/70 text-ink-secondary")}>{t("quest.zone.dropHint")}</p>}
          </div> : <div className="flex items-center px-5 pb-5">
            {chiefs.length > 0 && <div data-bench-lane="chiefs" className="flex flex-col gap-4">{chiefs.map(renderSlot)}</div>}
            {hierarchy && <div data-bench-hierarchy className="flex w-10 shrink-0 justify-center text-ink-secondary/35" aria-hidden="true"><ArrowRight size={22} strokeWidth={1} /></div>}
            {others.length > 0 && <div data-bench-lane="members" className="flex flex-col gap-4">{others.map(renderSlot)}</div>}
            {inside.length === 0 && <p className={cn("flex h-[84px] w-full items-center justify-center rounded-xl border border-dashed px-6 text-center text-[12px]",
              dropping ? "border-accent/70 text-ink" : "border-hairline/70 text-ink-secondary")}>{t("quest.benchEmpty")}</p>}
          </div>}
          {goal && <>
            <span data-tile-resize={tile.key} data-resize-corner="nw" className="absolute left-0 top-0 z-20 size-3.5 cursor-nwse-resize" />
            <span data-tile-resize={tile.key} data-resize-corner="ne" className="absolute right-0 top-0 z-20 size-3.5 cursor-nesw-resize" />
            <span data-tile-resize={tile.key} data-resize-corner="sw" className="absolute bottom-0 left-0 z-20 size-3.5 cursor-nesw-resize" />
            <span data-tile-resize={tile.key} data-resize-corner="se" className="absolute bottom-0 right-0 z-20 flex size-5 cursor-nwse-resize items-end justify-end p-1 text-ink-secondary/50 hover:text-ink">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </span>
          </>}
        </section>;
      })}
      {(space.canvasNotes ?? []).map((note) => {
        const layout = movedNote?.id === note.id ? movedNote.layout : note.layout;
        return <CanvasNoteCard key={note.id} note={note} layout={layout} actions={actions} />;
      })}
    </div>
    <div className="pointer-events-none absolute inset-x-5 bottom-5 flex items-end justify-between gap-3">
      <p className="min-w-0 rounded-lg bg-app/90 px-2 py-1.5 text-[11px] text-ink-secondary max-sm:hidden">{t("quest.canvas.hint")}</p>
      <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-xl border border-hairline/60 bg-panel p-1 shadow-sm">
        <button className={iconButton} aria-label={t("canvas.zoomOut")} onClick={() => zoom(1 / 1.2)}><Minus size={15} /></button>
        <button className="min-w-12 rounded-md px-1 py-2 text-[11px] tabular-nums text-ink-secondary hover:bg-control" aria-label={t("canvas.fit")} title={t("canvas.fitHint")} onClick={fit}>{Math.round(view.scale * 100)}%</button>
        <button className={iconButton} aria-label={t("canvas.zoomIn")} onClick={() => zoom(1.2)}><Plus size={15} /></button>
      </div>
    </div>
  </div>;
}
