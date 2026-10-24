import type { LocaleKey } from "@/locales";
import type { SpaceLevel } from "../../../shared/space";

/** Theme tokens where the theme has one (danger, warning); yellow and the grays read in light and dark themes. */
export const LEVEL_STYLE: Record<SpaceLevel, { label: LocaleKey; border: string; chip: string; dot: string }> = {
  P1: { label: "quest.level.P1", border: "border-danger/45", chip: "bg-danger/15", dot: "bg-danger" },
  P2: { label: "quest.level.P2", border: "border-warning/45", chip: "bg-warning/15", dot: "bg-warning" },
  P3: { label: "quest.level.P3", border: "border-yellow-500/45", chip: "bg-yellow-400/25", dot: "bg-yellow-400" },
  general: { label: "quest.level.general", border: "border-hairline/60", chip: "bg-control", dot: "bg-ink-secondary/50" },
  side: { label: "quest.level.side", border: "border-ink-secondary/45 border-dashed", chip: "bg-ink-secondary/20", dot: "bg-ink-secondary" },
};
