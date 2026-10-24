import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, MoreHorizontal, Plus, UserPlus } from "lucide-react";
import { useStore, type Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { fitTeams, zoomAt, type Point, type View } from "@/lib/team-canvas";
import { BotCard } from "../TeamCanvas";
import type { SpaceGoal, SpaceLayout, SpaceState } from "../../../shared/space";
import { LevelChip } from "./LevelChip";
import type { Drag } from "./space-drag";
import { LEVEL_STYLE } from "./space-levels";
import { BENCH_KEY, layoutSpaces, toCanvas, type SpaceTile } from "./space-layout";

const GLIDE_MS = 400;
const iconButton = "flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";

type Gesture = { id: number; start: Point; view: View; moved: boolean } & ({ kind: "pan" } | { kind: "tile"; key: string; origin: SpaceTile });

export type SpaceCanvasActions = {
  moveTile(key: string, layout: SpaceLayout): void;
  open(goal: SpaceGoal): void;
  menu(event: ReactMouseEvent, goal: SpaceGoal, bot?: Bot): void;
  canvasMenu(screen: Point, at: Point): void;
  newSpaceAt(at: Point): void;
  addAgent(event: ReactMouseEvent, goal: SpaceGoal): void;
  rename(goal: SpaceGoal, title: string): void;
};

function useGlide(world: React.RefObject<HTMLDivElement | null>, scale: number, placements: Record<string, string>, loaded: boolean) {
  const last = useRef(new Map<string, { x: number; y: number; key: string }>());
  useLayoutEffect(() => {
    const root = world.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const seen = new Map<string, { x: number; y: number; key: string }>();
    for (const card of root.querySelectorAll<HTMLElement>("[data-space-card]")) {
      const id = card.dataset.spaceCard!, key = card.dataset.spaceIn!;
      const box = card.getBoundingClientRect();
      const here = { x: (box.left - origin.left) / scale, y: (box.top - origin.top) / scale, key };
      const before = last.current.get(id);
      if (loaded && before && before.key !== key && card.animate) {
        card.animate([{ transform: `translate(${before.x - here.x}px, ${before.y - here.y}px)` }, { transform: "translate(0, 0)" }],
          { duration: GLIDE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
      seen.set(id, here);
    }
    last.current = loaded ? seen : new Map();
  }, [world, scale, placements, loaded]);
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

export function SpaceCanvas({ space, bots, actions, drag, editingTitle, onTitleDone, toCanvasRef, bottomInset = 0 }: {
  space: SpaceState;
  bots: Bot[];
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
  const [moved, setMoved] = useState<{ key: string; x: number; y: number } | null>(null);
  const goalIds = useMemo(() => new Set(space.goals.map((goal) => goal.id)), [space.goals]);
  const keyOf = useCallback((bot: Bot) => goalIds.has(space.placements[bot.id] ?? "") ? space.placements[bot.id]! : BENCH_KEY, [goalIds, space.placements]);
  const members = useMemo(() => {
    const groups = new Map<string, Bot[]>();
    for (const bot of bots) groups.set(keyOf(bot), [...(groups.get(keyOf(bot)) ?? []), bot]);
    return groups;
  }, [bots, keyOf]);
  const tiles = useMemo(() => layoutSpaces(space.goals, (key) => members.get(key)?.length ?? 0, space.bench)
    .map((tile) => moved?.key === tile.key ? { ...tile, x: moved.x, y: moved.y } : tile), [space.goals, space.bench, members, moved]);
  const current = useRef({ view, tiles, bottomInset });
  current.current = { view, tiles, bottomInset };
  useGlide(world, view.scale, space.placements, space.goals.length > 0);

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
    if (element.closest("[data-drag-bot], [data-drag-new]")) return;
    const handle = element.closest<HTMLElement>("[data-tile-handle]")?.dataset.tileHandle;
    if (handle === undefined && element.closest("button, input, select, textarea, a, [data-space-key]")) return;
    const common = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, view, moved: false };
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
    if (active.kind === "tile") setMoved({ key: active.key, x: active.origin.x + dx / view.scale, y: active.origin.y + dy / view.scale });
  };
  const finish = (event?: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const active = gesture.current;
    if (!active || (event && active.id !== event.pointerId)) return;
    gesture.current = null;
    suppressClick.current = active.moved;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    if (viewport.current?.hasPointerCapture?.(active.id)) viewport.current.releasePointerCapture(active.id);
    if (cancelled) { setMoved(null); setView(active.view); return; }
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
  const emptyCanvas = (target: EventTarget) => !(target as HTMLElement).closest("[data-space-key], button, input");
  const hovered = drag?.target?.kind === "tile" ? drag.target.key : null;
  const draggedBot = drag?.item.kind === "bot" ? drag.item.botId : null;

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
        const fromHere = draggedBot !== null && inside.some((bot) => bot.id === draggedBot);
        const dropping = hovered === tile.key && (drag?.item.kind !== "bot" || !fromHere);
        const title = goal ? goal.title : t("quest.bench");
        const open = goal?.asks.filter((ask) => ask.status === "open").length ?? 0;
        return <section key={tile.key} data-space-key={tile.key} data-goal-zone={goal?.id} data-level={goal?.level} data-dropping={dropping || undefined}
          aria-label={goal ? t("quest.space.aria", { title }) : t("quest.bench")}
          onContextMenu={(event) => { if (!goal) return; event.preventDefault(); event.stopPropagation(); actions.menu(event, goal); }}
          className={cn("absolute overflow-hidden rounded-2xl border bg-panel/90 shadow-sm transition-shadow", style?.border ?? "border-dashed border-hairline/70",
            dropping && "ring-4 ring-accent/40", goal && goal.status !== "active" && "opacity-60")}
          style={{ left: tile.x, top: tile.y, width: tile.w, height: tile.h }}>
          {style && <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1.5", style.band)} />}
          <header className="flex h-16 items-center gap-2 px-5">
            {goal && editingTitle === goal.id
              ? <TitleInput goal={goal} onDone={(next) => { onTitleDone(); if (next && next !== goal.title) actions.rename(goal, next); }} />
              : <button data-tile-handle={tile.key} aria-label={goal ? t("quest.canvas.openSpace", { title }) : t("quest.canvas.moveBench")}
                className="flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md py-2 text-left active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-accent"
                onKeyDown={(event) => { if (goal && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); actions.open(goal); } }}>
                {goal && <LevelChip level={goal.level} />}
                <h2 className="truncate text-[13px] font-semibold tracking-tight">{title}</h2>
              </button>}
            <span className="text-[11px] tabular-nums text-ink-secondary">{inside.length}</span>
            {goal && <button className={iconButton} aria-label={t("quest.canvas.addAgent", { title })} title={t("quest.canvas.addAgentHint")} onClick={(event) => actions.addAgent(event, goal)}><UserPlus size={15} /></button>}
            {goal && <button className={iconButton} aria-label={t("quest.space.more", { title })} onClick={(event) => actions.menu(event, goal)}><MoreHorizontal size={17} /></button>}
          </header>
          {goal && goal.level !== "side" && <button className="mx-5 mb-2 block h-[38px] w-[calc(100%-40px)] rounded-md text-left text-[11.5px] leading-[16px] text-ink-secondary hover:bg-control/60" onClick={() => actions.open(goal)}>
            <span dir="auto" className="block truncate text-ink">{goal.goal || t("quest.part.setGoal")}</span>
            <span className="block truncate">{t("quest.canvas.summary", { done: goal.outcomes.filter((outcome) => outcome.done).length, outcomes: goal.outcomes.length, tasks: goal.tasks.filter((task) => !task.done).length, asks: open })}</span>
          </button>}
          <div className={cn("grid gap-4 px-5 pb-5", inside.length > 3 ? "grid-cols-2" : "grid-cols-1")}>
            {inside.map((bot) => <div key={bot.id} data-space-card={bot.id} data-space-in={tile.key} data-drag-bot={bot.id} className="relative cursor-grab touch-none active:cursor-grabbing"
              onContextMenu={(event) => { if (!goal) return; event.preventDefault(); event.stopPropagation(); actions.menu(event, goal, bot); }}>
              <BotCard bot={bot} selected={state.selectedId === bot.id && state.settingsOpen} moving={draggedBot === bot.id} connected={false} />
            </div>)}
            {inside.length === 0 && <p className={cn("flex h-[84px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-[12px]",
              dropping ? "border-accent/70 text-ink" : "border-hairline/70 text-ink-secondary")}>{goal ? t("quest.zone.dropHint") : t("quest.benchEmpty")}</p>}
          </div>
        </section>;
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
