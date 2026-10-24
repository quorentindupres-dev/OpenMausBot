import { CARD_HEIGHT, CARD_WIDTH, GAP, TEAM_PADDING, type Point } from "@/lib/team-canvas";
import { SPACE_LEVELS, type SpaceGoal, type SpaceLayout } from "../../../shared/space";

export const BENCH_KEY = "bench";
export const TILE_HEADER = 64;
export const TILE_SUMMARY = 46;
const EMPTY_HEIGHT = 84;
const SPACING = 56;

export type SpaceTile = SpaceLayout & { key: string };

/** A tile fits its cards: one column up to three bots, then two. */
export function tileSize(bots: number, side = false): { w: number; h: number } {
  const columns = bots > 3 ? 2 : 1;
  const rows = Math.ceil(bots / columns);
  const cards = rows ? rows * (CARD_HEIGHT + GAP) - GAP : EMPTY_HEIGHT;
  return {
    w: columns * CARD_WIDTH + (columns - 1) * GAP + TEAM_PADDING * 2,
    h: TILE_HEADER + (side ? 0 : TILE_SUMMARY) + cards + TEAM_PADDING,
  };
}

/** Saved places win; the rest go in one row per level, side quests in a column to the right, the bench below. */
export function layoutSpaces(goals: readonly SpaceGoal[], botCount: (key: string) => number, bench?: SpaceLayout): SpaceTile[] {
  const tiles: SpaceTile[] = [];
  let y = 40;
  let right = 40;
  for (const level of SPACE_LEVELS.filter((candidate) => candidate !== "side")) {
    const row = goals.filter((goal) => goal.level === level);
    if (!row.length) continue;
    let x = 40;
    let tallest = 0;
    for (const goal of row) {
      const size = tileSize(botCount(goal.id));
      tiles.push({ key: goal.id, x: goal.layout?.x ?? x, y: goal.layout?.y ?? y, ...size });
      x += size.w + SPACING;
      tallest = Math.max(tallest, size.h);
    }
    right = Math.max(right, x);
    y += tallest + SPACING;
  }
  let sideY = 40;
  for (const goal of goals.filter((candidate) => candidate.level === "side")) {
    const size = tileSize(botCount(goal.id), true);
    tiles.push({ key: goal.id, x: goal.layout?.x ?? right, y: goal.layout?.y ?? sideY, ...size });
    sideY += size.h + SPACING;
  }
  const benchSize = tileSize(botCount(BENCH_KEY), true);
  tiles.push({ key: BENCH_KEY, x: bench?.x ?? 40, y: bench?.y ?? Math.max(y, 40), ...benchSize });
  return tiles;
}

export function toCanvas(point: Point, view: { x: number; y: number; scale: number }): Point {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}
