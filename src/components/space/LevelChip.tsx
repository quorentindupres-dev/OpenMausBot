import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { SpaceLevel } from "../../../shared/space";
import { LEVEL_STYLE } from "./space-levels";

export function LevelChip({ level, className }: { level: SpaceLevel; className?: string }) {
  const style = LEVEL_STYLE[level];
  return <span data-level={level} className={cn("inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-ink", style.chip, className)}>
    <span aria-hidden="true" className={cn("size-1.5 rounded-full", style.dot)} />{t(style.label)}
  </span>;
}
