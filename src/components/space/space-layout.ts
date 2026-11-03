import { CARD_HEIGHT, CARD_WIDTH, GAP, TEAM_PADDING, type Point } from "@/lib/team-canvas";
import { SPACE_LEVELS, type SpaceGoal, type SpaceLayout } from "../../../shared/space";

export const BENCH_KEY = "bench";
export const TILE_HEADER = 64;
export const TILE_SUMMARY = 46;
const EMPTY_HEIGHT = 84;
const SPACING = 56;

export type SpaceTile = SpaceLayout & { key: string };
export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export function tileColumns(width: number): number {
  return Math.max(1, Math.floor((width - TEAM_PADDING * 2 + GAP) / (CARD_WIDTH + GAP)));
}

export function minTileHeight(bots: number, columns: number, side = false): number {
  const rows = Math.ceil(bots / Math.max(1, columns));
  const cards = rows ? rows * (CARD_HEIGHT + GAP) - GAP : EMPTY_HEIGHT;
  return TILE_HEADER + (side ? 0 : TILE_SUMMARY) + cards + TEAM_PADDING;
}

/** A tile fits its cards: one column up to three bots, then two. */
export function tileSize(bots: number, side = false): { w: number; h: number } {
  const columns = bots > 3 ? 2 : 1;
  return {
    w: columns * CARD_WIDTH + (columns - 1) * GAP + TEAM_PADDING * 2,
    h: minTileHeight(bots, columns, side),
  };
}

/** Respects a Space's saved width and height while keeping it big enough for its bot cards. */
export function goalTileSize(goal: Pick<SpaceGoal, "level" | "layout">, bots: number): { w: number; h: number } {
  const side = goal.level === "side";
  const base = tileSize(bots, side);
  const minW = CARD_WIDTH + TEAM_PADDING * 2;
  const w = goal.layout ? Math.max(minW, goal.layout.w) : base.w;
  const h = goal.layout ? Math.max(minTileHeight(bots, tileColumns(w), side), goal.layout.h) : base.h;
  return { w, h };
}

/** The bench keeps the Map's chief → members hierarchy: chiefs on the left, arrow, members stacked on the right. */
export function benchSize(chiefs: number, members: number): { w: number; h: number } {
  const total = chiefs + members;
  if (!total) return tileSize(0, true);
  const hierarchy = chiefs > 0 && members > 0;
  const rows = hierarchy ? Math.max(chiefs, members) : total;
  return {
    w: CARD_WIDTH * (hierarchy ? 2 : 1) + TEAM_PADDING * 2 + (hierarchy ? 40 : 0),
    h: TILE_HEADER + TEAM_PADDING + rows * (CARD_HEIGHT + GAP) - GAP,
  };
}

export function resizeTile(origin: SpaceLayout, corner: ResizeCorner, dx: number, dy: number, bots: number, side = false): SpaceLayout {
  const minW = CARD_WIDTH + TEAM_PADDING * 2;
  const rawW = corner.includes("e") ? origin.w + dx : origin.w - dx;
  const w = Math.min(4000, Math.max(minW, Math.round(rawW)));
  const minH = minTileHeight(bots, tileColumns(w), side);
  const rawH = corner.includes("s") ? origin.h + dy : origin.h - dy;
  const h = Math.min(8000, Math.max(minH, Math.round(rawH)));
  const x = corner.includes("w") ? Math.round(origin.x + (origin.w - w)) : origin.x;
  const y = corner.includes("n") ? Math.round(origin.y + (origin.h - h)) : origin.y;
  return { x, y, w, h };
}

/** Saved places and sizes win; the rest go in one row per level, side quests in a column to the right, the bench below. */
export function layoutSpaces(
  goals: readonly SpaceGoal[],
  botCount: (key: string) => number,
  bench?: SpaceLayout,
  benchBots?: { chiefs: number; members: number },
): SpaceTile[] {
  const tiles: SpaceTile[] = [];
  let y = 40;
  let right = 40;
  for (const level of SPACE_LEVELS.filter((candidate) => candidate !== "side")) {
    const row = goals.filter((goal) => goal.level === level);
    if (!row.length) continue;
    let x = 40;
    let tallest = 0;
    for (const goal of row) {
      const size = goalTileSize(goal, botCount(goal.id));
      tiles.push({ key: goal.id, x: goal.layout?.x ?? x, y: goal.layout?.y ?? y, ...size });
      x += size.w + SPACING;
      tallest = Math.max(tallest, size.h);
    }
    right = Math.max(right, x);
    y += tallest + SPACING;
  }
  let sideY = 40;
  for (const goal of goals.filter((candidate) => candidate.level === "side")) {
    const size = goalTileSize(goal, botCount(goal.id));
    tiles.push({ key: goal.id, x: goal.layout?.x ?? right, y: goal.layout?.y ?? sideY, ...size });
    sideY += size.h + SPACING;
  }
  const bSize = benchBots ? benchSize(benchBots.chiefs, benchBots.members) : benchSize(0, botCount(BENCH_KEY));
  tiles.push({ key: BENCH_KEY, x: bench?.x ?? 40, y: bench?.y ?? Math.max(y, 40), ...bSize });
  return tiles;
}

export function toCanvas(point: Point, view: { x: number; y: number; scale: number }): Point {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}
