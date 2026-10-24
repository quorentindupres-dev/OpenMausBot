import { describe, expect, it } from "vitest";

import { normalizeGoal } from "../../../shared/space";
import { BENCH_KEY, benchSize, goalTileSize, layoutSpaces, resizeTile, tileSize, toCanvas } from "./space-layout";

describe("the Spaces map layout", () => {
  it("sizes a tile to its cards, respects saved sizes, and sizes the bench with chief → members hierarchy", () => {
    expect(tileSize(0)).toEqual({ w: 276, h: 214 });
    expect(tileSize(3).w).toBe(276);
    expect(tileSize(4).w).toBe(528);
    expect(tileSize(1, true).h).toBeLessThan(tileSize(1).h);
    expect(goalTileSize(normalizeGoal({ id: "g", title: "G", level: "P1", layout: { x: 0, y: 0, w: 600, h: 480 } }), 1)).toEqual({ w: 600, h: 480 });
    expect(benchSize(1, 3)).toEqual({ w: 552, h: 494 });
    expect(resizeTile({ x: 100, y: 80, w: 276, h: 214 }, "se", 200, 120, 0)).toEqual({ x: 100, y: 80, w: 476, h: 334 });
  });

  it("keeps saved places and lays the rest out by priority, side quests to the right and the bench below", () => {
    const goals = [
      normalizeGoal({ id: "a", title: "A", level: "P1" }),
      normalizeGoal({ id: "b", title: "B", level: "P2", layout: { x: 900, y: 900, w: 276, h: 214 } }),
      normalizeGoal({ id: "s", title: "S", level: "side" }),
    ];
    const tiles = new Map(layoutSpaces(goals, () => 0).map((tile) => [tile.key, tile]));
    expect(tiles.get("a")).toMatchObject({ x: 40, y: 40 });
    expect(tiles.get("b")).toMatchObject({ x: 900, y: 900 });
    expect(tiles.get("s")!.x).toBeGreaterThan(tiles.get("a")!.x);
    expect(tiles.get(BENCH_KEY)!.y).toBeGreaterThan(tiles.get("a")!.y);
    expect(layoutSpaces([], () => 0, { x: 5, y: 6, w: 276, h: 194 })[0]).toMatchObject({ key: BENCH_KEY, x: 5, y: 6 });
  });

  it("turns a point on screen into canvas units", () => {
    expect(toCanvas({ x: 140, y: 90 }, { x: 40, y: 10, scale: 0.5 })).toEqual({ x: 200, y: 160 });
  });
});
