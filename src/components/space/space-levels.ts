import type { LocaleKey } from "@/locales";
import type { SpaceLevel } from "../../../shared/space";

/** Theme tokens where the theme has one (danger, warning); yellow and the grays read in light and dark themes. */
export const LEVEL_STYLE: Record<SpaceLevel, { label: LocaleKey; band: string; border: string; chip: string; dot: string }> = {
  P1: { label: "quest.level.P1", band: "bg-danger", border: "border-danger/55", chip: "bg-danger/15", dot: "bg-danger" },
  P2: { label: "quest.level.P2", band: "bg-warning", border: "border-warning/55", chip: "bg-warning/15", dot: "bg-warning" },
  P3: { label: "quest.level.P3", band: "bg-yellow-400", border: "border-yellow-500/55", chip: "bg-yellow-400/25", dot: "bg-yellow-400" },
  general: { label: "quest.level.general", band: "bg-ink-secondary/35", border: "border-hairline/60", chip: "bg-control", dot: "bg-ink-secondary/50" },
  side: { label: "quest.level.side", band: "bg-ink-secondary/70", border: "border-ink-secondary/45 border-dashed", chip: "bg-ink-secondary/20", dot: "bg-ink-secondary" },
};
