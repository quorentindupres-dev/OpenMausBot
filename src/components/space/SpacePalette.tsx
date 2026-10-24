import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import type { Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { BotAvatar } from "../Avatar";
import { SPACE_LEVELS, type SpaceState } from "../../../shared/space";
import { LEVEL_STYLE } from "./space-levels";

const SEARCH_FROM = 9;
const ITEM = "flex w-full cursor-grab touch-none select-none items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-control active:cursor-grabbing";

export function SpacePalette({ space, bots, benchHint }: { space: SpaceState; bots: Bot[]; benchHint: boolean }) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const where = (bot: Bot) => space.goals.find((goal) => goal.id === space.placements[bot.id]);
  const shown = query.trim() ? bots.filter((bot) => bot.name.toLowerCase().includes(query.trim().toLowerCase())) : bots;

  if (!open) {
    return <aside data-space-palette data-space-bench-drop className="flex w-11 shrink-0 flex-col items-center border-r border-hairline/40 bg-panel py-2">
      <button type="button" aria-label={t("quest.palette.open")} title={t("quest.palette.open")} onClick={() => setOpen(true)}
        className="rounded-lg p-2 text-ink-secondary hover:bg-control hover:text-ink"><PanelLeftOpen size={16} /></button>
    </aside>;
  }
  return <aside data-space-palette data-space-bench-drop aria-label={t("quest.palette.aria")}
    className={cn("flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-hairline/40 bg-panel p-3 transition-colors", benchHint && "bg-accent/10")}>
    <div className="flex items-center justify-between">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">{t("quest.palette.spaces")}</h2>
      <button type="button" aria-label={t("quest.palette.close")} title={t("quest.palette.close")} onClick={() => setOpen(false)}
        className="rounded p-1 text-ink-secondary hover:bg-control hover:text-ink"><PanelLeftClose size={15} /></button>
    </div>
    <div className="grid grid-cols-1 gap-1">
      {SPACE_LEVELS.map((level) => (
        <div key={level} data-drag-new={level} role="button" tabIndex={-1} title={t("quest.palette.dragSpace")}
          className={cn(ITEM, "border bg-card", LEVEL_STYLE[level].border)}>
          <span aria-hidden="true" className={cn("h-4 w-1.5 rounded-full", LEVEL_STYLE[level].band)} />
          <span className="font-medium">{t(LEVEL_STYLE[level].label)}</span>
        </div>
      ))}
    </div>
    <div className="flex items-center justify-between">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">{t("quest.palette.agents")}</h2>
      <span className="text-[11px] tabular-nums text-ink-tertiary">{bots.length}</span>
    </div>
    {bots.length >= SEARCH_FROM && <label className="flex items-center gap-1.5 rounded-md border border-hairline/60 bg-app px-2 py-1">
      <Search size={12} className="shrink-0 text-ink-tertiary" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("quest.palette.search")} aria-label={t("quest.palette.search")}
        className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
    </label>}
    <div className="flex flex-col gap-0.5">
      {shown.map((bot) => {
        const goal = where(bot);
        return <div key={bot.id} data-drag-bot={bot.id} data-palette-bot={bot.id} role="button" tabIndex={-1} title={t("quest.palette.dragAgent")} className={ITEM}>
          <span className="relative" aria-hidden="true">
            <BotAvatar bot={bot} size={24} motion="none" motionKey={0} animated={false} />
            {bot.busy && <span className="absolute -right-0.5 -top-0.5 size-2 animate-pulse rounded-full bg-success ring-2 ring-panel" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{bot.name}</span>
            <span className="block truncate text-[11px] text-ink-secondary">{goal ? t("quest.palette.in", { title: goal.title }) : t("quest.palette.onBench")}</span>
          </span>
        </div>;
      })}
    </div>
    <p className={cn("mt-auto rounded-lg border border-dashed px-2 py-2 text-center text-[11px]", benchHint ? "border-accent text-ink" : "border-hairline/70 text-ink-tertiary")}>{t("quest.palette.benchDrop")}</p>
  </aside>;
}
