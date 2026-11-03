import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import type { Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { BotAvatar } from "../Avatar";

const ITEM = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12.5px] text-ink hover:bg-control focus-visible:bg-control outline-none";
const WIDTH = 240;

export function PointMenu({ x, y, label, onClose, children }: { x: number; y: number; label: string; onClose(): void; children: ReactNode }) {
  const menu = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(Math.max(8, y));
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>("button, input")?.focus();
    const el = menu.current;
    if (el) setTop((current) => Math.max(8, Math.min(current, window.innerHeight - el.offsetHeight - 8)));
    const outside = (event: MouseEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("mousedown", outside); window.removeEventListener("keydown", escape); };
  }, [onClose]);
  return createPortal(
    <div ref={menu} role="menu" aria-label={label} data-quest-menu className="fixed z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-hairline/60 bg-panel p-1.5 shadow-xl"
      style={{ left: Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8)), top, width: WIDTH }}>
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ onClick, children }: { onClick(): void; children: ReactNode }) {
  return <button type="button" role="menuitem" className={ITEM} onClick={onClick}>{children}</button>;
}

export function AddAgentMenu({ x, y, title, bots, onPick, onCreate, onClose }: {
  x: number; y: number; title: string; bots: Bot[];
  onPick(bot: Bot): void; onCreate(name: string): void; onClose(): void;
}) {
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) onCreate(name.trim()); };
  return <PointMenu x={x} y={y} label={t("quest.canvas.addAgent", { title })} onClose={onClose}>
    <form onSubmit={submit} className="flex gap-1 p-1">
      <input aria-label={t("quest.part.newAgentName")} placeholder={t("quest.part.newAgentName")} value={name} maxLength={100} onChange={(event) => setName(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-hairline/60 bg-app px-2 py-1 text-[12px] outline-none focus:border-accent/60" />
      <button type="submit" className="flex items-center gap-1 rounded-md px-2 text-[12px] font-medium hover:bg-control"><Plus size={12} />{t("quest.part.newAgent")}</button>
    </form>
    {bots.length > 0 && <div className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">{t("quest.canvas.existing")}</div>}
    {bots.map((bot) => <MenuItem key={bot.id} onClick={() => onPick(bot)}>
      <span aria-hidden="true"><BotAvatar bot={bot} size={18} motion="none" motionKey={0} animated={false} /></span>
      <span className="min-w-0 flex-1 truncate">{bot.name}</span>
    </MenuItem>)}
  </PointMenu>;
}
