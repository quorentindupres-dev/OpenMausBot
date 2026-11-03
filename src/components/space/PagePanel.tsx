import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, PanelsTopLeft } from "lucide-react";
import type { Bot, Message } from "@/state/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { AppDocument, AppPayload } from "../../../shared/app";
import { AppDocumentError, fetchAppDocument } from "../app/app-api";
import { AppFrame, type AppFrameHandle } from "../app/AppFrame";
import { TAB_PANEL_FOCUS, tabPanelProps } from "../computer-panel-tabs";
import { setPanelPageId } from "./space-ui-state";

type PageRow = { message: Message; app: AppPayload };

export function pageRows(messages: readonly Message[] | undefined): PageRow[] {
  return (messages ?? []).flatMap((message) => {
    const app = message.app as AppPayload | undefined;
    return message.kind === "app" && app && typeof app.doc === "string" && app.doc && typeof app.title === "string" ? [{ message, app }] : [];
  });
}

type Loaded = { key: string; doc?: AppDocument; error?: string };

export function PagePanel({ bot }: { bot: Bot }) {
  const rows = useMemo(() => pageRows(bot.messages), [bot.messages]);
  const [picked, setPicked] = useState<string | null>(null);
  const at = picked ? rows.findIndex((row) => row.message.id === picked) : -1;
  const index = at >= 0 ? at : rows.length - 1;
  const row = rows[index];
  const threadId = bot.threadId;
  const rowId = row?.message.id;
  const key = row ? `${row.message.id}:${row.app.doc}:${row.app.rev ?? 0}` : "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const frame = useRef<AppFrameHandle | null>(null);

  useEffect(() => { setPicked(null); }, [threadId]);
  useEffect(() => {
    if (!rowId) return;
    setPanelPageId(rowId);
    return () => setPanelPageId(null);
  }, [rowId]);
  useEffect(() => {
    if (!key || !rowId) return;
    const controller = new AbortController();
    void fetchAppDocument(threadId, rowId, controller.signal).then(
      (doc) => { if (!controller.signal.aborted) setLoaded({ key, doc }); },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({ key, error: error instanceof AppDocumentError && !error.failure.offline ? error.failure.error : t("app.strip.offline") });
      },
    );
    return () => controller.abort();
  }, [key, rowId, threadId]);

  const current = loaded?.key === key ? loaded : null;
  const step = (by: number) => {
    const next = rows[index + by];
    if (next) setPicked(next.message.id === rows[rows.length - 1]?.message.id ? null : next.message.id);
  };

  return (
    <div {...tabPanelProps("page")} data-page-panel className={cn("flex min-h-0 flex-1 flex-col", TAB_PANEL_FOCUS)}>
      {row ? (
        <>
          <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-1">
            <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink" title={row.app.title}><bdi dir="auto">{row.app.title}</bdi></div>
            <span className="text-[11px] text-ink-secondary">{t("quest.page.count", { n: index + 1, total: rows.length })}</span>
            <button type="button" aria-label={t("quest.page.older")} disabled={index === 0} onClick={() => step(-1)} className="rounded p-1 text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button type="button" aria-label={t("quest.page.newer")} disabled={index === rows.length - 1} onClick={() => step(1)} className="rounded p-1 text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
          <div className="relative min-h-0 flex-1 border-t border-hairline/40 bg-app">
            {current?.doc ? (
              <AppFrame key={key} doc={current.doc} botId={bot.id} threadId={threadId} title={row.app.title} height={600} handle={frame}
                onHeight={() => {}} onProblem={() => {}} onTeardownRequested={() => {}} fill />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-ink-secondary" role="status">
                {current?.error ?? t("app.loading")}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <PanelsTopLeft size={22} className="text-ink-secondary" aria-hidden="true" />
          <div className="text-[14px] font-medium text-ink">{t("quest.page.emptyTitle")}</div>
          <p className="text-[12px] leading-5 text-ink-secondary">{t("quest.page.emptyBody", { name: bot.name })}</p>
        </div>
      )}
    </div>
  );
}
