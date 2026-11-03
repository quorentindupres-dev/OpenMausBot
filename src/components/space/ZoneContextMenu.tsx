import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquarePlus, Pencil, Undo2 } from "lucide-react";
import type { Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { BotAvatar } from "../Avatar";
import type { SpaceGoal } from "../../../shared/space";

export type ZoneMenuTarget = { x: number; y: number; goal: SpaceGoal; bot?: Bot };

const ITEM = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12.5px] text-ink hover:bg-control focus-visible:bg-control outline-none";
const WIDTH = 240;

export function ZoneContextMenu({ target, zoneBots, allBots, onNewThread, onEdit, onBench, onClose }: {
  target: ZoneMenuTarget;
  zoneBots: Bot[];
  allBots: Bot[];
  onNewThread(bot: Bot): void;
  onEdit(): void;
  onBench(bot: Bot): void;
  onClose(): void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);
  const [top, setTop] = useState(Math.max(8, target.y));
  const left = Math.max(8, Math.min(target.x, window.innerWidth - WIDTH - 8));

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: MouseEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("mousedown", outside); window.removeEventListener("keydown", escape); };
  }, [onClose]);
  useEffect(() => {
    const el = menu.current;
    if (el) setTop((current) => Math.max(8, Math.min(current, window.innerHeight - el.offsetHeight - 8)));
  }, [picking]);

  const others = allBots.filter((bot) => !zoneBots.some((member) => member.id === bot.id));
  const botItem = (bot: Bot) => (
    <button key={bot.id} type="button" role="menuitem" className={ITEM} onClick={() => onNewThread(bot)}>
      <span aria-hidden="true"><BotAvatar bot={bot} size={18} motion="none" motionKey={0} animated={false} /></span>
      <span className="min-w-0 flex-1 truncate">{bot.name}</span>
    </button>
  );

  return createPortal(
    <div ref={menu} role="menu" aria-label={t("quest.menu.aria", { goal: target.goal.title })} data-quest-menu
      className="fixed z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-hairline/60 bg-panel p-1.5 shadow-xl" style={{ left, top, width: WIDTH }}>
      {target.bot && !picking ? (
        <>
          <button type="button" role="menuitem" className={ITEM} onClick={() => onNewThread(target.bot!)}><MessageSquarePlus size={14} />{t("quest.menu.newThreadWith", { name: target.bot.name })}</button>
          <button type="button" role="menuitem" className={ITEM} onClick={() => setPicking(true)}><MessageSquarePlus size={14} />{t("quest.menu.newThreadOther")}</button>
          <button type="button" role="menuitem" className={ITEM} onClick={() => onBench(target.bot!)}><Undo2 size={14} />{t("quest.menu.toBench")}</button>
        </>
      ) : (
        <>
          <div className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">{t("quest.menu.newThreadHere")}</div>
          {zoneBots.map(botItem)}
          {zoneBots.length > 0 && others.length > 0 && <div className="my-1 border-t border-hairline/40" />}
          {(picking || zoneBots.length === 0) ? others.map(botItem) : others.length > 0 && (
            <button type="button" role="menuitem" className={ITEM} onClick={() => setPicking(true)}>{t("quest.menu.otherBot")}</button>
          )}
        </>
      )}
      <div className="my-1 border-t border-hairline/40" />
      <button type="button" role="menuitem" className={ITEM} onClick={onEdit}><Pencil size={14} />{t("quest.menu.editGoal")}</button>
    </div>,
    document.body,
  );
}
