import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { buildSystemPrompt } from "../system-prompt.ts";
import { EMPTY_SPACE, normalizeGoal, type SpaceState } from "../../shared/space.ts";
import {
  clearA01Cache,
  getA01RoleCard,
  getA01Summary,
  listA01Roles,
  runA01LookupTool,
  searchA01,
  validateAndBindA01Role,
} from "./a01-bridge.ts";
import {
  clearC02Cache,
  detectC02Project,
  getC02ProjectDetail,
  listC02Projects,
  runC02LookupTool,
} from "./c02-bridge.ts";
import { SpaceInputError } from "./errors.ts";
import { spacePromptText, xlabsParts } from "./prompt.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  clearA01Cache();
  clearC02Cache();
});

function freshTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("A01 & C02 SQLite bridges and prompt assembly", () => {
  it("lists all 18 main S3 roles and 15 mini S2 agents with look metadata", () => {
    const summary = getA01Summary();
    expect(summary).toEqual({
      available: true,
      total: 33,
      mainCount: 18,
      miniCount: 15,
    });
    const roles = listA01Roles();
    expect(roles).toHaveLength(33);
    const ea = roles.find((r) => r.id === "EA");
    expect(ea).toBeDefined();
    expect(ea?.kind).toBe("main");
    expect(ea?.lookMeta.accent).toMatch(/^#/);
    expect(ea?.lookMeta.badge).toBe("AI employee");

    const mini = roles.find((r) => r.kind === "mini");
    expect(mini).toBeDefined();
    expect(mini?.lookMeta.badge).toBe("Mini bot");
  });

  it("enforces fail-closed A01 role validation and fences temporary vs long-term fleet.db bindings", () => {
    const dir = freshTempDir("omb-a01-bind-");
    const isolatedFleetDb = join(dir, "fleet.db");

    expect(() =>
      validateAndBindA01Role(
        { botId: "bot-bad", role: "GHOST_UNREGISTERED_ROLE", mode: "temporary" },
        { fleetDbPath: isolatedFleetDb },
      ),
    ).toThrow(SpaceInputError);

    // Temporary binding NEVER writes to fleet.db
    const tempBound = validateAndBindA01Role(
      { botId: "bot-temp-scout", role: "CREATIVE__scout", mode: "temporary", projectSlug: "surge" },
      { fleetDbPath: isolatedFleetDb },
    );
    expect(tempBound.receipt.memoryPolicy).toBe("ephemeral_c01_only");
    expect(tempBound.receipt.fleetDbPersisted).toBe(false);
    expect(existsSync(isolatedFleetDb)).toBe(false);

    // Long-term binding persists into fleet.db bindings via `team bind`
    const longBound = validateAndBindA01Role(
      { botId: "bot-lt-ea", role: "EA", mode: "long-term", projectSlug: "surge" },
      { fleetDbPath: isolatedFleetDb },
    );
    expect(longBound.receipt.memoryPolicy).toBe("hindsight_fleet_db");
    expect(longBound.receipt.fleetDbPersisted).toBe(true);
    expect(existsSync(isolatedFleetDb)).toBe(true);

    const db = new DatabaseSync(isolatedFleetDb, { readOnly: true });
    try {
      const row = db
        .prepare("SELECT agent, session_id, project, mode, host FROM bindings WHERE session_id = ?")
        .get("bot-lt-ea") as Record<string, unknown> | undefined;
      expect(row).toMatchObject({
        agent: "EA",
        session_id: "bot-lt-ea",
        project: "surge",
        mode: "long-term",
        host: "openmanus",
      });
    } finally {
      db.close();
    }

    const ltCard = getA01RoleCard("EA", "long-term", "surge", { fleetDbPath: isolatedFleetDb });
    expect(ltCard?.fleetDbWriteAllowed).toBe(true);
    expect(ltCard?.hindsightBrief?.available).toBe(true);
  });

  it("queries C02 projects, first-principles Surge detail, and multi-tier detect()", () => {
    const projects = listC02Projects();
    expect(projects.length).toBeGreaterThanOrEqual(9);
    const surgeSummary = projects.find((p) => p.slug === "surge");
    expect(surgeSummary).toMatchObject({
      slug: "surge",
      readinessStatus: "green",
      readinessScore: "7/7",
      hasDb: true,
    });

    const surge = getC02ProjectDetail("surge");
    expect(surge).not.toBeNull();
    expect(surge?.businessProfile?.oneLineThesis).toBeTruthy();
    expect(surge?.products.length).toBeGreaterThan(0);
    expect(surge?.acquisitionChannels.length).toBeGreaterThan(0);
    expect(surge?.funnels.length).toBeGreaterThan(0);
    expect(surge?.unitEconomics).not.toBeNull();

    expect(detectC02Project("C01__work_board/surge__vsl")).toMatchObject({
      slug: "surge",
      matched: true,
    });
    expect(detectC02Project((surgeSummary?.siteUrl ?? "https://example.com") + "/products/kit")).toMatchObject({
      slug: "surge",
      matched: true,
    });
    expect(detectC02Project("A01__team/EA")).toMatchObject({
      slug: "x-labs",
      matched: true,
    });
  });

  it("executes a01_lookup and c02_project_lookup in-memory/SQLite and serves cached xlabsParts in <2ms", () => {
    const fts = searchA01("bottleneck", 5);
    expect(fts.count).toBeGreaterThan(0);

    expect(runA01LookupTool({ action: "formula", role: "media-buyer" }).text).toContain("A01 formulas");
    expect(runA01LookupTool({ action: "rules", role: "EA" }).text).toContain("A01 rules for EA");
    expect(runA01LookupTool({ action: "card", role: "EA" }).text).toContain("[A01 Standing Role — EA");

    expect(runC02LookupTool({ action: "list" }).text).toContain("surge");
    expect(runC02LookupTool({ action: "products", slug: "surge" }).text).toContain("products");
    expect(runC02LookupTool({ action: "acquisition", slug: "surge" }).text).toContain("channels");
    expect(runC02LookupTool({ action: "readiness", slug: "surge" }).text).toContain("7/7");
    expect(runC02LookupTool({ action: "detect", query: "C01__work_board/surge__vsl" }).text).toContain("surge");

    const boundState: SpaceState = {
      ...EMPTY_SPACE,
      goals: [
        normalizeGoal({
          id: "g-surge",
          title: "Scale Surge VSL",
          level: "P1",
          jobPath: "C01__work_board/surge__vsl",
        }),
      ],
      placements: { "bot-mb": "g-surge" },
      botBindings: {
        "bot-mb": {
          role: "media-buyer",
          mode: "temporary",
          boundAt: 1,
        },
      },
    };
    const bots = [{ id: "bot-mb", name: "Media Buyer" }];

    // Prime cache once, then measure warm synchronous prompt assembly
    const warmFirst = xlabsParts({ botId: "bot-mb", bots, pages: true }, boundState);
    const t0 = performance.now();
    const parts = xlabsParts({ botId: "bot-mb", bots, pages: true }, boundState);
    const elapsedMs = performance.now() - t0;

    expect(elapsedMs).toBeLessThan(2);
    expect(parts).toEqual(warmFirst);

    const spaceText = parts.find((p) => p.id === "space")?.text ?? "";
    expect(spaceText).toContain("[A01 Standing Role — media-buyer");
    expect(spaceText).toContain("Memory Policy (TEMPORARY): Write session logs ONLY to C01__work_board/<job>/memory/log.jsonl");
    expect(spaceText).toContain("[C02 Business Context — surge");
    expect(spaceText).toContain("Active SKUs");
    expect(spaceText).toContain("How We Get Clients");
    expect(spaceText).toContain("Unit Economics");
    expect(spaceText).toContain("a01_lookup");
    expect(spaceText).toContain("c02_project_lookup");

    const built = buildSystemPrompt("persona", "", parts);
    expect(built.volatile).toContain("[A01 Standing Role — media-buyer");
    expect(built.volatile).toContain("[C02 Business Context — surge");
    expect(built.stable).not.toContain("[A01 Standing Role — media-buyer");

    // Gracefully degrades when isolated test dir has no Vault databases
    const emptyVault = freshTempDir("omb-empty-vault-");
    const degraded = spacePromptText(boundState, bots, "bot-mb", undefined, false, {
      a01: { teamRoot: join(emptyVault, "A01__team"), ttlMs: 0 },
      c02: { vaultRoot: emptyVault, ttlMs: 0 },
    });
    expect(degraded).toContain('Space "Scale Surge VSL"');
    expect(degraded).not.toContain("[A01 Standing Role");
    expect(degraded).not.toContain("[C02 Business Context");
  });
});
