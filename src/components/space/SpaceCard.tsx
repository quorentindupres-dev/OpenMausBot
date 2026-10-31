import { useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { MoreHorizontal, Plus, X } from "lucide-react";
import type { Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { BotAvatar } from "../Avatar";
import type { SpaceGoal, SpaceLogEntry } from "../../../shared/space";
import type { SpaceThread } from "./space-api";
import { GoalAvatarPicker } from "./GoalAvatarPicker";
import { LevelChip } from "./LevelChip";
import { LEVEL_STYLE } from "./space-levels";

export function BotChip({ bot, onContextMenu }: { bot: Bot; onContextMenu?: (event: MouseEvent) => void }) {
  return (
    <div data-drag-bot={bot.id} onContextMenu={onContextMenu} data-space-bot={bot.id} title={bot.title || bot.name}
      className="flex cursor-grab touch-none select-none items-center gap-1.5 rounded-full border border-hairline/50 bg-card py-0.5 pl-0.5 pr-2.5 active:cursor-grabbing">
      <span className="relative" aria-hidden="true">
        <BotAvatar bot={bot} size={20} motion="none" motionKey={0} animated={false} />
        {bot.busy && <span className="absolute -right-0.5 -top-0.5 size-2 animate-pulse rounded-full bg-success ring-2 ring-card" />}
      </span>
      <span className="max-w-[8rem] truncate text-[12px] text-ink">{bot.name}</span>
      {bot.busy && <span className="sr-only">{t("quest.zone.working")}</span>}
    </div>
  );
}

const SMALL = "rounded-md px-2 py-0.5 text-[11.5px] font-medium hover:bg-control";

function Row({ label, children, testId }: { label: string; children: ReactNode; testId: string }) {
  return (
    <div data-space-part={testId} className="grid grid-cols-[64px_1fr] gap-2 border-t border-hairline/30 pt-1.5">
      <div className="pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className="min-w-0 space-y-1 text-[12px] text-ink">{children}</div>
    </div>
  );
}

export type SpaceCardActions = {
  menu(event: MouseEvent, bot?: Bot): void;
  edit(): void;
  setIcon?(icon: string | null): void;
  toggleOutcome(index: number): void;
  newAgent(name: string): void;
  addTask(text: string, botId?: string): void;
  patchTask(taskId: string, patch: { botId?: string | null; done?: boolean }): void;
  deleteTask(taskId: string): void;
  answerAsk(askId: string, answer: "yes" | "no"): void;
  openThread(thread: SpaceThread): void;
  closeThread(thread: SpaceThread): void;
};

export function SpaceCard({ goal, bots, allBots, threads, notes, actions, fill = false }: {
  goal: SpaceGoal;
  bots: Bot[];
  allBots: Bot[];
  threads: SpaceThread[];
  notes: SpaceLogEntry[];
  actions: SpaceCardActions;
  fill?: boolean;
}) {
  const [agentName, setAgentName] = useState<string | null>(null);
  const [taskText, setTaskText] = useState("");
  const [taskBot, setTaskBot] = useState("");
  const name = (id?: string) => allBots.find((bot) => bot.id === id)?.name ?? t("quest.task.unassigned");
  const openAsks = goal.asks.filter((ask) => ask.status === "open");
  const submitAgent = (event: FormEvent) => { event.preventDefault(); if (agentName?.trim()) actions.newAgent(agentName.trim()); setAgentName(null); };
  const submitTask = (event: FormEvent) => { event.preventDefault(); if (!taskText.trim()) return; actions.addTask(taskText.trim(), taskBot || undefined); setTaskText(""); };

  return (
    <section aria-label={t("quest.space.aria", { title: goal.title })} data-goal-zone={goal.id} data-level={goal.level}
      onContextMenu={(event) => { if ((event.target as HTMLElement).closest("input,select,textarea")) return; event.preventDefault(); actions.menu(event); }}
      className={cn("relative flex min-w-0 flex-col gap-1.5 overflow-y-auto rounded-2xl border bg-panel p-3", fill ? "h-full" : "aspect-square",
        LEVEL_STYLE[goal.level].border, goal.status !== "active" && "opacity-60")}>
      <div className="flex items-center gap-1.5">
        <GoalAvatarPicker goal={goal} onChange={(icon) => actions.setIcon?.(icon)} />
        <LevelChip level={goal.level} />
        {goal.status !== "active" && <span className="rounded bg-control px-1.5 py-0.5 text-[10.5px] text-ink-secondary">{t(goal.status === "done" ? "quest.status.done" : "quest.status.parked")}</span>}
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink" title={goal.title}><bdi dir="auto">{goal.title}</bdi></h3>
        <button type="button" aria-label={t("quest.space.more", { title: goal.title })} onClick={(event) => actions.menu(event)}
          className="shrink-0 rounded p-1 text-ink-secondary hover:bg-control hover:text-ink"><MoreHorizontal size={14} /></button>
      </div>
      <Row label={t("quest.part.goal")} testId="goal">
        {goal.goal ? <p dir="auto" className="truncate" title={goal.goal}>{goal.goal}</p> : <button type="button" className={cn(SMALL, "text-ink-secondary")} onClick={actions.edit}>{t("quest.part.setGoal")}</button>}
      </Row>
      <Row label={t("quest.part.outcomes")} testId="outcomes">
        {goal.outcomes.length === 0 && <button type="button" className={cn(SMALL, "text-ink-secondary")} onClick={actions.edit}>{t("quest.part.addOutcomes")}</button>}
        {goal.outcomes.map((outcome, index) => (
          <label key={index} className="flex items-start gap-1.5">
            <input type="checkbox" className="mt-0.5 accent-accent" checked={outcome.done} onChange={() => actions.toggleOutcome(index)} />
            <span dir="auto" className={cn(outcome.done && "text-ink-secondary line-through")}>{outcome.text}</span>
          </label>
        ))}
      </Row>
      {goal.roadmap.length > 0 && <Row label={t("quest.part.roadmap")} testId="roadmap">
        <ol className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-ink-secondary">
          {goal.roadmap.map((step, index) => <li key={index}><span className="font-medium text-ink">{index + 1}</span> {step}{index < goal.roadmap.length - 1 && " ▸"}</li>)}
        </ol>
      </Row>}
      <Row label={t("quest.part.agents")} testId="agents">
        <div className="flex flex-wrap gap-1">
          {bots.map((bot) => <BotChip key={bot.id} bot={bot} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); actions.menu(event, bot); }} />)}
          {agentName === null
            ? <button type="button" className={cn(SMALL, "flex items-center gap-1 text-ink-secondary")} onClick={() => setAgentName("")}><Plus size={12} />{t("quest.part.newAgent")}</button>
            : <form onSubmit={submitAgent} className="flex gap-1">
              <input autoFocus aria-label={t("quest.part.newAgentName")} placeholder={t("quest.part.newAgentName")} value={agentName} maxLength={100}
                onChange={(event) => setAgentName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setAgentName(null); }}
                className="w-28 rounded-md border border-hairline/60 bg-app px-2 py-0.5 text-[12px] outline-none focus:border-accent/60" />
              <button type="submit" className={SMALL}>{t("common.add")}</button>
            </form>}
        </div>
        {bots.length === 0 && <p className="text-[11.5px] text-ink-tertiary">{t("quest.zone.dropHint")}</p>}
      </Row>
      <Row label={t("quest.part.tasks")} testId="tasks">
        {goal.tasks.map((task) => (
          <div key={task.id} className="group flex items-center gap-1.5" data-space-task={task.id}>
            <input type="checkbox" className="accent-accent" checked={task.done} aria-label={t("quest.task.done", { task: task.text })} onChange={() => actions.patchTask(task.id, { done: !task.done })} />
            <span dir="auto" className={cn("min-w-0 flex-1 truncate", task.done && "text-ink-secondary line-through")} title={task.text}>{task.text}</span>
            <select aria-label={t("quest.task.owner", { task: task.text })} value={task.botId ?? ""} onChange={(event) => actions.patchTask(task.id, { botId: event.target.value || null })}
              className="max-w-[7rem] rounded border border-hairline/50 bg-app px-1 py-0.5 text-[11px] text-ink-secondary">
              <option value="">{t("quest.task.unassigned")}</option>
              {[...bots, ...allBots.filter((bot) => bot.id === task.botId && !bots.includes(bot))].map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
            </select>
            <button type="button" aria-label={t("quest.task.delete", { task: task.text })} onClick={() => actions.deleteTask(task.id)}
              className="rounded p-0.5 text-ink-tertiary opacity-0 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100"><X size={12} /></button>
          </div>
        ))}
        <form onSubmit={submitTask} className="flex gap-1">
          <input aria-label={t("quest.task.new")} placeholder={t("quest.task.new")} value={taskText} maxLength={200} onChange={(event) => setTaskText(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-hairline/60 bg-app px-2 py-0.5 text-[12px] outline-none focus:border-accent/60" />
          <select aria-label={t("quest.task.newOwner")} value={taskBot} onChange={(event) => setTaskBot(event.target.value)}
            className="max-w-[6.5rem] rounded border border-hairline/50 bg-app px-1 py-0.5 text-[11px] text-ink-secondary">
            <option value="">{t("quest.task.unassigned")}</option>
            {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </select>
          <button type="submit" className={SMALL}>{t("common.add")}</button>
        </form>
      </Row>
      {openAsks.length > 0 && <Row label={t("quest.part.asks")} testId="asks">
        {openAsks.map((ask) => (
          <div key={ask.id} className="flex items-start gap-1.5" data-space-ask={ask.id}>
            <p dir="auto" className="min-w-0 flex-1"><span className="font-medium">{name(ask.botId)}:</span> {ask.text}</p>
            <button type="button" className={cn(SMALL, "text-success")} onClick={() => actions.answerAsk(ask.id, "yes")}>{t("quest.ask.yes")}</button>
            <button type="button" className={cn(SMALL, "text-danger")} onClick={() => actions.answerAsk(ask.id, "no")}>{t("quest.ask.no")}</button>
          </div>
        ))}
      </Row>}
      <Row label={t("quest.part.threads")} testId="threads">
        {threads.map((thread) => (
          <div key={thread.threadId} className="flex items-center gap-1.5" data-space-thread={thread.threadId}>
            <span className="min-w-0 flex-1 truncate" title={thread.title}><span className="text-ink-secondary">{thread.bot.name} ·</span> {thread.title}</span>
            <button type="button" className={SMALL} onClick={() => actions.openThread(thread)}>{t("quest.thread.open")}</button>
            <button type="button" className={cn(SMALL, "text-ink-secondary")} onClick={() => actions.closeThread(thread)}>{t("quest.thread.close")}</button>
          </div>
        ))}
        <button type="button" className={cn(SMALL, "flex items-center gap-1 text-ink-secondary")} onClick={(event) => actions.menu(event)}><Plus size={12} />{t("quest.thread.new")}</button>
      </Row>
      {notes.length > 0 && <Row label={t("quest.part.notes")} testId="notes">
        {notes.map((note) => (
          <p key={note.id} dir="auto" className="text-[11.5px] leading-[15px]"><span className="text-ink-secondary">[{note.kind}]</span> {note.text} <span className="text-ink-tertiary">{note.signature}</span></p>
        ))}
      </Row>}
    </section>
  );
}
