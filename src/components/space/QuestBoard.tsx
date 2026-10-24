import { useCallback, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Download, Plus, ScanSearch, X } from "lucide-react";
import { useStore, type Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { Point } from "@/lib/team-canvas";
import { BotAvatar } from "../Avatar";
import { SPACE_LEVELS, type SpaceGoal, type SpaceLayout, type SpaceLevel } from "../../../shared/space";
import { GoalEditor } from "./GoalEditor";
import { LevelChip } from "./LevelChip";
import { AddAgentMenu, MenuItem, PointMenu } from "./PointMenu";
import { SpaceCanvas, type SpaceCanvasActions } from "./SpaceCanvas";
import { SpaceCard, type SpaceCardActions } from "./SpaceCard";
import { SpacePalette } from "./SpacePalette";
import { useSpaceDrag, type DragItem, type DropTarget } from "./space-drag";
import { BENCH_KEY, tileSize } from "./space-layout";
import { LEVEL_STYLE } from "./space-levels";
import { ZoneContextMenu, type ZoneMenuTarget } from "./ZoneContextMenu";
import {
  addTask, answerAsk, askChiefToScan, createGoal, deleteTask, importKanban, newAgentInSpace, newGoalThread, patchTask, placeBot, setBench, setVisualFirst,
  spaceThreads, updateGoal, useSpace, zoneBots, type BoardState,
} from "./space-api";
import { showQuestBoard, useQuestBoard } from "./space-ui-state";

export { useQuestBoard };

const NOTES_ON_CARD = 3;

export function QuestBoardToggle() {
  const on = useQuestBoard();
  const option = (value: boolean, label: string) => (
    <button type="button" aria-pressed={on === value} onClick={() => showQuestBoard(value)}
      className={cn("rounded-md px-2.5 py-1 text-[12px] font-medium", on === value ? "bg-panel text-ink shadow-sm" : "text-ink-secondary hover:text-ink")}>{label}</button>
  );
  return <div role="group" aria-label={t("quest.toggleAria")} className="flex items-center gap-0.5 rounded-lg bg-control p-0.5">
    {option(false, t("quest.toggle.map"))}{option(true, t("quest.toggle.board"))}
  </div>;
}

type Editing = { goal?: SpaceGoal; level?: SpaceLevel; at?: Point } | null;
type Menu =
  | ({ kind: "space" } & ZoneMenuTarget)
  | { kind: "canvas"; x: number; y: number; at: Point }
  | { kind: "agent"; x: number; y: number; goal: SpaceGoal }
  | { kind: "level"; x: number; y: number; goal: SpaceGoal };

function withPlacement(space: BoardState, botId: string, goalId: string | null): BoardState {
  const { [botId]: _previous, ...rest } = space.placements;
  return { ...space, placements: goalId ? { ...rest, [botId]: goalId } : rest };
}

const BUTTON = "flex items-center gap-1.5 rounded-lg border border-hairline/60 bg-panel px-3 py-1.5 text-[12px] font-medium hover:bg-control disabled:opacity-50";

export function QuestBoard({ bots }: { bots: Bot[] }) {
  const { dispatch } = useStore();
  const { space, error: loadError, refresh, setSpace } = useSpace();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const toCanvasRef = useRef<((client: Point) => Point) | null>(null);
  const chief = bots.find((bot) => bot.chiefOfStaff);
  const opened = space.goals.find((goal) => goal.id === openId);
  const closeMenu = useCallback(() => setMenu(null), []);

  const fail = (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause));
  const act = (work: Promise<unknown>) => { setError(null); void work.catch(fail).finally(() => void refresh()); };
  const place = (botId: string, goalId: string | null) => {
    if (!bots.some((bot) => bot.id === botId) || (space.placements[botId] ?? null) === goalId) return;
    setSpace(withPlacement(space, botId, goalId));
    act(placeBot(botId, goalId));
  };
  const dropped = (item: DragItem, target: DropTarget, at: Point) => {
    if (item.kind === "bot") {
      if (target?.kind === "tile") place(item.botId, target.key === BENCH_KEY ? null : target.key);
      else if (target) place(item.botId, null);
      return;
    }
    if (target?.kind !== "canvas" && target?.kind !== "tile") return;
    const point = toCanvasRef.current?.(at) ?? at;
    const size = tileSize(0, item.level === "side");
    setError(null);
    void createGoal({ title: t("quest.canvas.untitled"), level: item.level, layout: { x: point.x - size.w / 2, y: point.y - 32, ...size } })
      .then(({ goal }) => { setSpace({ ...space, goals: [...space.goals, goal] }); setEditingTitle(goal.id); })
      .catch(fail).finally(() => void refresh());
  };
  const { drag, begin } = useSpaceDrag(dropped);
  const openThread = (bot: Bot, goal: SpaceGoal) => {
    setMenu(null);
    setError(null);
    void newGoalThread(bot.id, goal).then((threadId) => dispatch({ type: "switchTask", botId: bot.id, threadId })).catch(fail);
  };
  const newAgent = (name: string, goal: SpaceGoal) => act(newAgentInSpace(name, goal.id).then((bot) => dispatch({ type: "botAdded", bot, preserveSelection: true })));
  const cardActions = (goal: SpaceGoal): SpaceCardActions => ({
    menu: (event: MouseEvent, bot?: Bot) => setMenu({ kind: "space", x: event.clientX, y: event.clientY, goal, ...(bot ? { bot } : {}) }),
    edit: () => setEditing({ goal }),
    toggleOutcome: (index) => act(updateGoal(goal.id, { outcomes: goal.outcomes.map((outcome, at) => at === index ? { ...outcome, done: !outcome.done } : outcome) })),
    newAgent: (name) => newAgent(name, goal),
    addTask: (text, botId) => act(addTask(goal.id, text, botId)),
    patchTask: (taskId, patch) => act(patchTask(goal.id, taskId, patch)),
    deleteTask: (taskId) => act(deleteTask(goal.id, taskId)),
    answerAsk: (askId, answer) => act(answerAsk(goal.id, askId, answer)),
    openThread: (thread) => dispatch({ type: "switchTask", botId: thread.bot.id, threadId: thread.threadId }),
    closeThread: (thread) => dispatch({ type: "updateTask", botId: thread.bot.id, threadId: thread.threadId, patch: { archivedAt: Date.now() } }),
  });
  const canvasActions: SpaceCanvasActions = {
    moveTile: (key: string, layout: SpaceLayout) => {
      if (key === BENCH_KEY) {
        setSpace({ ...space, bench: layout });
        act(setBench(layout));
        return;
      }
      setSpace({ ...space, goals: space.goals.map((goal) => goal.id === key ? { ...goal, layout } : goal) });
      act(updateGoal(key, { layout }));
    },
    open: (goal) => setOpenId(goal.id),
    menu: (event, goal, bot) => setMenu({ kind: "space", x: event.clientX, y: event.clientY, goal, ...(bot ? { bot } : {}) }),
    pickLevel: (event, goal) => setMenu({ kind: "level", x: event.clientX, y: event.clientY, goal }),
    canvasMenu: (screen, at) => setMenu({ kind: "canvas", ...screen, at }),
    newSpaceAt: (at) => setEditing({ level: "general", at }),
    addAgent: (event, goal) => setMenu({ kind: "agent", x: event.clientX, y: event.clientY, goal }),
    rename: (goal, title) => {
      setSpace({ ...space, goals: space.goals.map((candidate) => candidate.id === goal.id ? { ...candidate, title } : candidate) });
      act(updateGoal(goal.id, { title }));
    },
  };
  const shownError = error || loadError;
  const draggedBot = drag?.item.kind === "bot" ? bots.find((bot) => drag.item.kind === "bot" && bot.id === drag.item.botId) : undefined;
  const benchTarget = drag?.item.kind === "bot" && (drag.target?.kind === "bench" || drag.target?.kind === "canvas" || (drag.target?.kind === "tile" && drag.target.key === BENCH_KEY));
  const targetTitle = drag?.target?.kind === "tile" && drag.target.key !== BENCH_KEY ? space.goals.find((goal) => drag.target?.kind === "tile" && goal.id === drag.target.key)?.title : undefined;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-quest-board onPointerDown={(event) => { begin(event); }}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline/40 px-6 py-3">
        <button type="button" onClick={() => setEditing({ level: "general" })} className={BUTTON}><Plus size={14} />{t("quest.newQuest")}</button>
        <button type="button" disabled={!chief} title={chief ? undefined : t("quest.scanNoChief")} className={BUTTON} onClick={() => {
          if (!chief) return;
          setError(null);
          void askChiefToScan(chief).then((threadId) => dispatch({ type: "switchTask", botId: chief.id, threadId })).catch(fail);
        }}><ScanSearch size={14} />{t("quest.scan")}</button>
        {space.kanban && <button type="button" className={BUTTON} onClick={() => {
          setError(null);
          void importKanban().then((result) => setNotice(t("quest.importDone", { created: result.created, updated: result.updated }))).catch(fail).finally(() => void refresh());
        }}><Download size={14} />{t("quest.import")}</button>}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12px] text-ink-secondary" title={t("quest.visualFirstHint")}>
          <input type="checkbox" checked={space.visualFirst} onChange={(event) => {
            const on = event.target.checked;
            setSpace({ ...space, visualFirst: on });
            act(setVisualFirst(on));
          }} className="accent-accent" />
          {t("quest.visualFirst")}
        </label>
      </div>
      {(shownError || notice) && <div role={shownError ? "alert" : "status"} className={cn("flex shrink-0 items-center justify-between gap-3 border-b px-6 py-2 text-[12px]",
        shownError ? "border-danger/20 bg-danger/10 text-danger" : "border-hairline/40 bg-panel text-ink-secondary")}>
        {shownError || notice}
        <button type="button" aria-label={t("common.close")} className="rounded p-1 hover:bg-control" onClick={() => { setError(null); setNotice(null); }}><X size={14} /></button>
      </div>}
      <div className="relative flex min-h-0 flex-1">
        <SpacePalette space={space} bots={bots} benchHint={Boolean(benchTarget)} />
        <SpaceCanvas space={space} bots={bots} actions={canvasActions} drag={drag} editingTitle={editingTitle} onTitleDone={() => setEditingTitle(null)} toCanvasRef={toCanvasRef} />
        {opened && <aside aria-label={t("quest.space.aria", { title: opened.title })} data-space-drawer
          className="absolute inset-y-0 right-0 z-30 flex w-[400px] max-w-full flex-col gap-2 border-l border-hairline/50 bg-app/95 p-3 shadow-xl backdrop-blur">
          <div className="flex justify-end">
            <button type="button" aria-label={t("common.close")} onClick={() => setOpenId(null)} className="rounded p-1 text-ink-secondary hover:bg-control hover:text-ink"><X size={16} /></button>
          </div>
          <div className="min-h-0 flex-1">
            <SpaceCard fill goal={opened} bots={zoneBots(space, bots, opened.id)} allBots={bots} threads={spaceThreads(space, bots, opened.id)}
              notes={space.log.filter((entry) => entry.goalId === opened.id).slice(-NOTES_ON_CARD).reverse()} actions={cardActions(opened)} />
          </div>
        </aside>}
      </div>
      {drag && createPortal(
        <div data-space-ghost className="pointer-events-none fixed z-[60] rounded-xl border border-accent/50 bg-card px-3 py-2 text-[13px] shadow-xl" style={{ left: drag.point.x + 14, top: drag.point.y + 14 }}>
          {drag.item.kind === "space"
            ? <span className="flex items-center gap-2"><LevelChip level={drag.item.level} />{t("quest.canvas.untitled")}</span>
            : <span className="flex items-center gap-2">{draggedBot && <span aria-hidden="true"><BotAvatar bot={draggedBot} size={22} motion="none" motionKey={0} animated={false} /></span>}{draggedBot?.name}</span>}
          <p className="mt-0.5 text-[10.5px] text-ink-secondary">
            {drag.item.kind === "space" ? (drag.target?.kind === "canvas" || drag.target?.kind === "tile" ? t("quest.drag.dropSpace") : t("quest.drag.onMap"))
              : targetTitle ? t("quest.canvas.moveTo", { title: targetTitle }) : benchTarget ? t("quest.drag.toBench") : t("quest.drag.onMap")}
          </p>
        </div>,
        document.body,
      )}
      {menu?.kind === "space" && <ZoneContextMenu target={menu} zoneBots={zoneBots(space, bots, menu.goal.id)} allBots={bots}
        onNewThread={(bot) => openThread(bot, menu.goal)} onEdit={() => { setEditing({ goal: menu.goal }); setMenu(null); }}
        onBench={(bot) => { place(bot.id, null); setMenu(null); }} onClose={closeMenu} />}
      {menu?.kind === "canvas" && <PointMenu x={menu.x} y={menu.y} label={t("quest.canvas.menu")} onClose={closeMenu}>
        <MenuItem onClick={() => { setEditing({ level: "general", at: menu.at }); setMenu(null); }}><Plus size={14} />{t("quest.canvas.newHere")}</MenuItem>
        <MenuItem onClick={() => { setEditing({ level: "side", at: menu.at }); setMenu(null); }}><Plus size={14} />{t("quest.canvas.newSideHere")}</MenuItem>
      </PointMenu>}
      {menu?.kind === "agent" && <AddAgentMenu x={menu.x} y={menu.y} title={menu.goal.title} bots={bots.filter((bot) => space.placements[bot.id] !== menu.goal.id)}
        onPick={(bot) => { place(bot.id, menu.goal.id); setMenu(null); }} onCreate={(name) => { newAgent(name, menu.goal); setMenu(null); }} onClose={closeMenu} />}
      {menu?.kind === "level" && <PointMenu x={menu.x} y={menu.y} label={t("quest.editor.level")} onClose={closeMenu}>
        {SPACE_LEVELS.map((level) => (
          <MenuItem key={level} onClick={() => {
            setSpace({ ...space, goals: space.goals.map((candidate) => candidate.id === menu.goal.id ? { ...candidate, level } : candidate) });
            act(updateGoal(menu.goal.id, { level }));
            setMenu(null);
          }}>
            <span aria-hidden="true" className={cn("size-2.5 rounded-full", LEVEL_STYLE[level].dot)} />
            <span className="flex-1">{t(LEVEL_STYLE[level].label)}</span>
          </MenuItem>
        ))}
      </PointMenu>}
      {editing && <GoalEditor {...editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />}
    </div>
  );
}
