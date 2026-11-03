import { FolderKanban } from "lucide-react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { ProjectTab } from "./project-scope";

/**
 * One tab per project across the top of the Spaces board. The tab is the
 * workspace: spaces created while it is active belong to that project.
 */
export function ProjectTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly ProjectTab[];
  active: string;
  onSelect: (id: string) => void;
}) {
  if (tabs.length <= 1) return null;
  return (
    <div
      role="tablist"
      aria-label={t("quest.tabs.aria")}
      data-project-tabs
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline/40 px-6 py-2"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-project-tab={tab.id}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors",
              selected
                ? "bg-control text-ink shadow-sm"
                : "text-ink-secondary hover:bg-control/60 hover:text-ink",
            )}
          >
            {tab.id === "all" ? (
              <FolderKanban size={13} aria-hidden="true" />
            ) : (
              <span
                aria-hidden="true"
                className={cn("size-1.5 rounded-full", selected ? "bg-accent" : "bg-ink-secondary/40")}
              />
            )}
            <span className="max-w-[180px] truncate">{tab.label}</span>
            <span className="rounded-full bg-hairline/40 px-1.5 text-[10.5px] tabular-nums text-ink-secondary">
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
