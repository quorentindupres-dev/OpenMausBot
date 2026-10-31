import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { A01_BINDING_MODES, type A01BindingMode, type BotA01Binding } from "../../shared/space.ts";
import { listC02Projects } from "./c02-bridge.ts";
import { SpaceInputError } from "./errors.ts";

const DEFAULT_TEAM_ROOT = "/Users/g/External-Vault/A01__team";
const DEFAULT_TEAM_BIN = "/Users/g/.local/bin/team";
const DEFAULT_TTL_MS = 10_000;
const BOT_ID_RE = /^[\w-]{1,80}$/;
const STEWARD_ROLES = new Set(["EA", "COO", "LEARN__team", "LEARN__code", "media-buyer"]);

export interface A01BridgeOptions {
  teamRoot?: string;
  teamDbPath?: string;
  fleetDbPath?: string;
  teamBin?: string;
  vaultRoot?: string;
  ttlMs?: number;
  now?: () => number;
}

export interface A01LookMeta {
  key: string;
  label: string;
  accessory: string;
  layer: string;
  accent: string;
  archetype: string;
  tagline: string;
  badge: string;
  scale?: number;
  marker?: string;
}

export interface A01RoleListItem {
  id: string;
  name: string;
  group: string;
  look: string;
  lookMeta: A01LookMeta;
  kind: "main" | "mini";
  defaultTier: "steward" | "specialist" | "worker";
  parentRole: string;
  openmausId: string;
  mission: string;
  northStar: string;
  formulaCount: number;
  ruleCount: number;
  workflowCount: number;
  dbRefs: string[];
}

export interface A01Summary {
  available: boolean;
  total: number;
  mainCount: number;
  miniCount: number;
}

export interface A01FormulaItem {
  id: string;
  roleId: string;
  name: string;
  category: string;
  expression: string;
  inputs: string[];
  thresholds: Record<string, unknown>;
  whenToUse: string;
  sourceFile: string;
}

export interface A01RuleItem {
  id: string;
  roleId: string;
  severity: "hard_ban" | "must" | "prefer";
  rule: string;
  verifyCmdOrCheck: string;
  sourceFile: string;
}

export interface A01WorkflowItem {
  workflowSlug: string;
  title: string;
  goal: string;
  sourceFile: string;
}

export interface A01DbRefItem {
  dbId: string;
  tableOrCli: string;
  access: string;
  purpose: string;
}

export interface A01HindsightBrief {
  fleetDb: string;
  available: boolean;
  counts: { episodes: number; lessons: number; decisions: number; mistakes: number };
  episodes: Array<Record<string, unknown>>;
  lessons: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  mistakes: Array<Record<string, unknown>>;
  text: string;
}

export interface A01RoleCardBundle {
  role: string;
  name: string;
  kind: "main" | "mini";
  group: string;
  look: string;
  lookMeta: A01LookMeta;
  defaultTier: "steward" | "specialist" | "worker";
  parentRole: string;
  mode: A01BindingMode;
  memoryPolicy: "ephemeral_c01_only" | "hindsight_fleet_db";
  memoryWriteTarget: string;
  fleetDbWriteAllowed: boolean;
  project: string | null;
  mission: string;
  northStar: string;
  systemSummary: string;
  agentsSummary: string;
  systemMd: string;
  agentsMd: string;
  formulas: A01FormulaItem[];
  rules: A01RuleItem[];
  workflows: A01WorkflowItem[];
  dbRefs: A01DbRefItem[];
  hindsightBrief: A01HindsightBrief | null;
}

export interface A01BindReceipt {
  ok: true;
  agentId: string;
  role: string;
  tier: string;
  mode: A01BindingMode;
  project: string | null;
  host: string;
  memoryPolicy: "ephemeral_c01_only" | "hindsight_fleet_db";
  memoryWriteTarget: string;
  fleetDbPersisted: boolean;
  boundAt: string;
}

export interface A01SearchHit {
  roleId: string;
  docKind: string;
  itemId: string;
  title: string;
  body: string;
  sourceFile: string;
  rank: number;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function clearA01Cache(): void {
  cache.clear();
}

function resolvePaths(opts?: A01BridgeOptions) {
  const teamRoot = resolve(opts?.teamRoot ?? process.env.OMB_A01_ROOT ?? process.env.TEAM_ROOT ?? DEFAULT_TEAM_ROOT);
  const teamDbPath = resolve(opts?.teamDbPath ?? process.env.OMB_A01_DB ?? process.env.TEAM_DB ?? join(teamRoot, "team.db"));
  const fleetDbPath = resolve(
    opts?.fleetDbPath ?? process.env.OMB_FLEET_DB ?? process.env.TEAM_FLEET_DB ?? join(teamRoot, "memory", "fleet.db"),
  );
  const candidateBin = opts?.teamBin ?? process.env.OMB_TEAM_BIN ?? DEFAULT_TEAM_BIN;
  const fallbackBin = join(teamRoot, "_shared", "bin", "team");
  const teamBin = existsSync(candidateBin) ? candidateBin : fallbackBin;
  const vaultRoot = opts?.vaultRoot ? resolve(opts.vaultRoot) : dirname(teamRoot);
  return { teamRoot, teamDbPath, fleetDbPath, teamBin, vaultRoot };
}

function cached<T>(key: string, ttlMs: number, compute: () => T): T {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = compute();
  if (ttlMs > 0) {
    cache.set(key, { expiresAt: now + ttlMs, value });
  }
  return value;
}

function openRoDb(filePath: string): DatabaseSync | null {
  if (!existsSync(filePath)) return null;
  try {
    return new DatabaseSync(filePath, { readOnly: true });
  } catch {
    return null;
  }
}

function readTextSafe(filePath: string): string {
  if (!existsSync(filePath)) return "";
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface RawAgentLooksFile {
  kinds?: {
    main?: { badge?: string };
    mini?: { badge?: string; scale?: number; marker?: string };
  };
  roles?: Record<
    string,
    {
      a01?: string;
      a01_also?: string[];
      label?: string;
      accessory?: string;
      layer?: string;
      accent?: string;
      archetype?: string;
      tagline?: string;
    }
  >;
}

function loadLooksCatalog(teamRoot: string, ttlMs: number): RawAgentLooksFile {
  return cached(`a01:looks:${teamRoot}`, ttlMs, () => {
    const looksPath = join(teamRoot, "_shared", "looks", "agent-looks.json");
    return parseJsonSafe<RawAgentLooksFile>(readTextSafe(looksPath), {});
  });
}

function resolveLookMeta(
  catalog: RawAgentLooksFile,
  lookKey: string,
  roleId: string,
  kind: "main" | "mini",
  fallbackName: string,
): A01LookMeta {
  const roles = catalog.roles ?? {};
  let matchedKey = lookKey && roles[lookKey] ? lookKey : "";
  if (!matchedKey) {
    for (const [key, entry] of Object.entries(roles)) {
      if (entry.a01 === roleId || entry.a01_also?.includes(roleId)) {
        matchedKey = key;
        break;
      }
    }
  }
  const entry = (matchedKey ? roles[matchedKey] : undefined) ?? roles.agent ?? {};
  const kindCfg = kind === "mini" ? catalog.kinds?.mini : catalog.kinds?.main;
  return {
    key: matchedKey || lookKey || "agent",
    label: entry.label ?? fallbackName,
    accessory: entry.accessory ?? "antenna",
    layer: entry.layer ?? "head",
    accent: entry.accent ?? "#a1a1aa",
    archetype: entry.archetype ?? (kind === "mini" ? "Mini bot" : "Agent"),
    tagline: entry.tagline ?? "",
    badge: kindCfg?.badge ?? (kind === "mini" ? "Mini bot" : "AI employee"),
    ...(kind === "mini" && typeof catalog.kinds?.mini?.scale === "number" ? { scale: catalog.kinds.mini.scale } : {}),
    ...(kind === "mini" && typeof catalog.kinds?.mini?.marker === "string" ? { marker: catalog.kinds.mini.marker } : {}),
  };
}

export function listA01Roles(opts?: A01BridgeOptions): A01RoleListItem[] {
  const { teamRoot, teamDbPath } = resolvePaths(opts);
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  return cached(`a01:list:${teamDbPath}`, ttlMs, () => {
    const db = openRoDb(teamDbPath);
    if (!db) return [];
    const looks = loadLooksCatalog(teamRoot, ttlMs);
    try {
      const rows = db
        .prepare(
          "SELECT id, name, group_id, look, kind, default_tier, parent_role, openmaus_id, mission, north_star, formula_count, rule_count, workflow_count, db_refs_csv FROM role_card WHERE status = 'active' ORDER BY kind = 'main' DESC, id",
        )
        .all() as Array<Record<string, unknown>>;
      return rows.map((row) => {
        const id = String(row.id ?? "");
        const name = String(row.name ?? id);
        const look = String(row.look ?? "");
        const kind = row.kind === "mini" ? ("mini" as const) : ("main" as const);
        const tier =
          row.default_tier === "steward" || row.default_tier === "worker"
            ? row.default_tier
            : ("specialist" as const);
        const csv = String(row.db_refs_csv ?? "");
        return {
          id,
          name,
          group: String(row.group_id ?? ""),
          look,
          lookMeta: resolveLookMeta(looks, look, id, kind, name),
          kind,
          defaultTier: tier,
          parentRole: String(row.parent_role ?? ""),
          openmausId: String(row.openmaus_id ?? ""),
          mission: String(row.mission ?? ""),
          northStar: String(row.north_star ?? ""),
          formulaCount: Number(row.formula_count ?? 0),
          ruleCount: Number(row.rule_count ?? 0),
          workflowCount: Number(row.workflow_count ?? 0),
          dbRefs: csv ? csv.split(",").map((s) => s.trim()).filter(Boolean) : [],
        };
      });
    } catch {
      return [];
    } finally {
      db.close();
    }
  });
}

export function getA01Summary(opts?: A01BridgeOptions): A01Summary {
  const roles = listA01Roles(opts);
  const mainCount = roles.filter((r) => r.kind === "main").length;
  const miniCount = roles.filter((r) => r.kind === "mini").length;
  return {
    available: roles.length > 0,
    total: roles.length,
    mainCount,
    miniCount,
  };
}

function lookupRegisteredRoleRow(db: DatabaseSync, roleArg: string): Record<string, unknown> | null {
  const exact = db.prepare("SELECT * FROM role_card WHERE id = ?").get(roleArg) as Record<string, unknown> | undefined;
  if (exact) return exact;
  const insensitive = db.prepare("SELECT * FROM role_card WHERE lower(id) = lower(?)").get(roleArg) as
    | Record<string, unknown>
    | undefined;
  if (insensitive) return insensitive;
  const byOpenmausId = db
    .prepare("SELECT * FROM role_card WHERE openmaus_id != '' AND lower(openmaus_id) = lower(?)")
    .get(roleArg) as Record<string, unknown> | undefined;
  return byOpenmausId ?? null;
}

function queryHindsightBrief(fleetDbPath: string, roleId: string, projectSlug: string | null): A01HindsightBrief {
  const empty: A01HindsightBrief = {
    fleetDb: fleetDbPath,
    available: false,
    counts: { episodes: 0, lessons: 0, decisions: 0, mistakes: 0 },
    episodes: [],
    lessons: [],
    decisions: [],
    mistakes: [],
    text: "No fleet.db found yet.",
  };
  const db = openRoDb(fleetDbPath);
  if (!db) return empty;
  try {
    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((r) => r.name),
    );
    const episodes = tables.has("episodes")
      ? ((projectSlug
          ? db
              .prepare(
                "SELECT id, agent, project, ts, kind, title, outcome FROM episodes WHERE agent = ? AND project = ? ORDER BY ts DESC, id DESC LIMIT 6",
              )
              .all(roleId, projectSlug)
          : db
              .prepare("SELECT id, agent, project, ts, kind, title, outcome FROM episodes WHERE agent = ? ORDER BY ts DESC, id DESC LIMIT 6")
              .all(roleId)) as Array<Record<string, unknown>>)
      : [];
    const lessons = tables.has("lessons")
      ? ((projectSlug
          ? db
              .prepare(
                "SELECT id, agent, scope, topic, rule, confidence, status, project FROM lessons WHERE status != 'vetoed' AND (scope = 'general' OR project = ? OR agent = ?) ORDER BY confidence DESC, id DESC LIMIT 8",
              )
              .all(projectSlug, roleId)
          : db
              .prepare(
                "SELECT id, agent, scope, topic, rule, confidence, status, project FROM lessons WHERE status != 'vetoed' AND (scope = 'general' OR agent = ?) ORDER BY confidence DESC, id DESC LIMIT 8",
              )
              .all(roleId)) as Array<Record<string, unknown>>)
      : [];
    const decisions = tables.has("decisions")
      ? ((projectSlug
          ? db
              .prepare(
                "SELECT id, agent, ts, project, question, choice, outcome FROM decisions WHERE agent = ? AND project = ? ORDER BY ts DESC, id DESC LIMIT 6",
              )
              .all(roleId, projectSlug)
          : db
              .prepare(
                "SELECT id, agent, ts, project, question, choice, outcome FROM decisions WHERE agent = ? ORDER BY ts DESC, id DESC LIMIT 6",
              )
              .all(roleId)) as Array<Record<string, unknown>>)
      : [];
    const mistakes = tables.has("mistakes")
      ? ((projectSlug
          ? db
              .prepare(
                "SELECT id, agent, ts, project, what, lesson, status FROM mistakes WHERE agent = ? AND project = ? ORDER BY CASE WHEN status='open' THEN 0 ELSE 1 END, id DESC LIMIT 6",
              )
              .all(roleId, projectSlug)
          : db
              .prepare(
                "SELECT id, agent, ts, project, what, lesson, status FROM mistakes WHERE agent = ? ORDER BY CASE WHEN status='open' THEN 0 ELSE 1 END, id DESC LIMIT 6",
              )
              .all(roleId)) as Array<Record<string, unknown>>)
      : [];

    const lines = [
      `Hindsight brief for ${roleId}${projectSlug ? ` (project: ${projectSlug})` : ""}: lessons=${lessons.length} · episodes=${episodes.length} · decisions=${decisions.length} · mistakes=${mistakes.length}`,
      ...lessons.slice(0, 4).map((l) => `- [lesson:${String(l.scope ?? "")}] ${String(l.topic ?? "")}: ${String(l.rule ?? "")}`),
      ...mistakes.slice(0, 3).map((m) => `- [mistake:${String(m.status ?? "")}] ${String(m.what ?? "")} -> ${String(m.lesson ?? "")}`),
    ];
    return {
      fleetDb: fleetDbPath,
      available: true,
      counts: {
        episodes: episodes.length,
        lessons: lessons.length,
        decisions: decisions.length,
        mistakes: mistakes.length,
      },
      episodes,
      lessons,
      decisions,
      mistakes,
      text: lines.join("\n"),
    };
  } catch {
    return empty;
  } finally {
    db.close();
  }
}

export function getA01RoleCard(
  role: string,
  mode: A01BindingMode = "temporary",
  projectSlug?: string | null,
  opts?: A01BridgeOptions,
): A01RoleCardBundle | null {
  const cleanRole = role.trim();
  if (!cleanRole) return null;
  if (!A01_BINDING_MODES.includes(mode)) {
    throw new SpaceInputError(400, `Invalid A01 mode '${mode}' (expected temporary | long-term)`);
  }
  const cleanProject = projectSlug?.trim() ? projectSlug.trim() : null;
  const { teamRoot, teamDbPath, fleetDbPath } = resolvePaths(opts);
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;

  return cached(`a01:card:${teamDbPath}:${fleetDbPath}:${cleanRole.toLowerCase()}:${mode}:${cleanProject ?? ""}`, ttlMs, () => {
    const db = openRoDb(teamDbPath);
    if (!db) return null;
    const looks = loadLooksCatalog(teamRoot, ttlMs);
    try {
      const rc = lookupRegisteredRoleRow(db, cleanRole);
      if (!rc) return null;

      const roleId = String(rc.id ?? cleanRole);
      const kind = rc.kind === "mini" ? ("mini" as const) : ("main" as const);
      const parentRole = String(rc.parent_role ?? "");
      const lookupRole = kind === "main" ? roleId : parentRole || roleId;

      const formulas = (
        db
          .prepare(
            "SELECT id, role_id, name, category, expression, inputs_json, thresholds_json, when_to_use, source_file FROM formula WHERE role_id = ? ORDER BY id",
          )
          .all(lookupRole) as Array<Record<string, unknown>>
      ).map((r) => ({
        id: String(r.id ?? ""),
        roleId: String(r.role_id ?? lookupRole),
        name: String(r.name ?? ""),
        category: String(r.category ?? ""),
        expression: String(r.expression ?? ""),
        inputs: parseJsonSafe<string[]>(r.inputs_json, []),
        thresholds: parseJsonSafe<Record<string, unknown>>(r.thresholds_json, {}),
        whenToUse: String(r.when_to_use ?? ""),
        sourceFile: String(r.source_file ?? ""),
      }));

      const rules: A01RuleItem[] = (
        db
          .prepare("SELECT id, role_id, severity, rule, verify_cmd_or_check, source_file FROM rule WHERE role_id = ? ORDER BY id")
          .all(lookupRole) as Array<Record<string, unknown>>
      ).map((r) => {
        const severity: A01RuleItem["severity"] =
          r.severity === "hard_ban" ? "hard_ban" : r.severity === "prefer" ? "prefer" : "must";
        return {
          id: String(r.id ?? ""),
          roleId: String(r.role_id ?? lookupRole),
          severity,
          rule: String(r.rule ?? ""),
          verifyCmdOrCheck: String(r.verify_cmd_or_check ?? ""),
          sourceFile: String(r.source_file ?? ""),
        };
      });

      const workflows = (
        db
          .prepare("SELECT workflow_slug, title, goal, source_file FROM workflow WHERE role_id = ? ORDER BY workflow_slug")
          .all(lookupRole) as Array<Record<string, unknown>>
      ).map((r) => ({
        workflowSlug: String(r.workflow_slug ?? ""),
        title: String(r.title ?? ""),
        goal: String(r.goal ?? ""),
        sourceFile: String(r.source_file ?? ""),
      }));

      const dbRefs = (
        db
          .prepare("SELECT db_id, table_or_cli, access, purpose FROM db_ref WHERE role_id = ? ORDER BY id")
          .all(lookupRole) as Array<Record<string, unknown>>
      ).map((r) => ({
        dbId: String(r.db_id ?? ""),
        tableOrCli: String(r.table_or_cli ?? ""),
        access: String(r.access ?? "read"),
        purpose: String(r.purpose ?? ""),
      }));

      const folderRel = String(rc.folder ?? roleId);
      const targetPath = join(teamRoot, folderRel);
      let systemMd = "";
      let agentsMd = "";
      if (kind === "main") {
        systemMd = readTextSafe(join(teamRoot, roleId, "SYSTEM.md"));
        agentsMd = readTextSafe(join(teamRoot, roleId, "AGENTS.md"));
      } else if (existsSync(targetPath)) {
        const soul = readTextSafe(join(targetPath, "SOUL.md"));
        if (soul) {
          systemMd = soul;
          agentsMd = readTextSafe(join(targetPath, "card.json"));
        } else {
          systemMd = readTextSafe(targetPath);
          agentsMd = String(rc.agents_summary ?? "");
        }
      }

      const name = String(rc.name ?? roleId);
      const look = String(rc.look ?? "");
      const defaultTier =
        rc.default_tier === "steward" || rc.default_tier === "worker"
          ? rc.default_tier
          : ("specialist" as const);

      return {
        role: roleId,
        name,
        kind,
        group: String(rc.group_id ?? ""),
        look,
        lookMeta: resolveLookMeta(looks, look, roleId, kind, name),
        defaultTier,
        parentRole,
        mode,
        memoryPolicy: mode === "temporary" ? "ephemeral_c01_only" : "hindsight_fleet_db",
        memoryWriteTarget: mode === "temporary" ? "C01__work_board/<job>/memory/log.jsonl" : fleetDbPath,
        fleetDbWriteAllowed: mode === "long-term",
        project: cleanProject,
        mission: String(rc.mission ?? ""),
        northStar: String(rc.north_star ?? ""),
        systemSummary: String(rc.system_summary ?? ""),
        agentsSummary: String(rc.agents_summary ?? ""),
        systemMd: systemMd || String(rc.system_summary ?? ""),
        agentsMd: agentsMd || String(rc.agents_summary ?? ""),
        formulas,
        rules,
        workflows,
        dbRefs,
        hindsightBrief: mode === "long-term" ? queryHindsightBrief(fleetDbPath, roleId, cleanProject) : null,
      };
    } finally {
      db.close();
    }
  });
}

export function requireA01RoleCard(
  role: string,
  mode: A01BindingMode = "temporary",
  projectSlug?: string | null,
  opts?: A01BridgeOptions,
): A01RoleCardBundle {
  const cleanRole = role.trim();
  if (!cleanRole) {
    throw new SpaceInputError(400, "A01 role is required");
  }
  const { teamDbPath } = resolvePaths(opts);
  if (!existsSync(teamDbPath)) {
    throw new SpaceInputError(400, `A01 fleet database not found at ${teamDbPath}`);
  }
  const card = getA01RoleCard(cleanRole, mode, projectSlug, opts);
  if (!card) {
    throw new SpaceInputError(400, `Role '${cleanRole}' is NOT registered in A01__team/team.db (fail-closed).`);
  }
  return card;
}

function writeLongTermFleetBindingFallback(input: {
  fleetDbPath: string;
  roleId: string;
  agentId: string;
  tier: string;
  project: string;
  ts: string;
}): void {
  mkdirSync(dirname(input.fleetDbPath), { recursive: true });
  const db = new DatabaseSync(input.fleetDbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bindings (
        agent      TEXT NOT NULL CHECK (length(agent) > 0),
        session_id TEXT NOT NULL CHECK (length(session_id) > 0),
        project    TEXT NOT NULL CHECK (length(project) > 0),
        bound_at   TEXT NOT NULL,
        agent_id   TEXT NOT NULL DEFAULT '',
        role       TEXT NOT NULL DEFAULT '',
        tier       TEXT NOT NULL DEFAULT 'specialist',
        mode       TEXT NOT NULL DEFAULT 'long-term',
        host       TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (agent, session_id)
      );
    `);
    db.prepare(
      `INSERT INTO bindings (agent, session_id, project, bound_at, agent_id, role, tier, mode, host, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'long-term', 'openmanus', ?)
       ON CONFLICT(agent, session_id) DO UPDATE SET
         project = excluded.project,
         agent_id = excluded.agent_id,
         role = excluded.role,
         tier = excluded.tier,
         mode = excluded.mode,
         host = excluded.host,
         updated_at = excluded.updated_at`,
    ).run(input.roleId, input.agentId, input.project, input.ts, input.agentId, input.roleId, input.tier, input.ts);
  } finally {
    db.close();
  }
}

/**
 * Enforces strict fail-closed A01 role registration:
 * - Rejects any unknown `role` not in `A01__team/team.db` (`SpaceInputError(400, ...)`).
 * - Calls `team bind` for `long-term` (writing to `fleet.db` `bindings`) and keeps `temporary` fenced out of `fleet.db`.
 */
export function validateAndBindA01Role(
  input: {
    botId: string;
    role: string;
    mode?: A01BindingMode;
    projectSlug?: string;
    computerProvider?: string;
    computerLeaseId?: string;
  },
  opts?: A01BridgeOptions,
): { binding: BotA01Binding; receipt: A01BindReceipt } {
  const botId = input.botId.trim();
  if (!BOT_ID_RE.test(botId)) {
    throw new SpaceInputError(400, "botId is not a valid id");
  }
  const mode: A01BindingMode = input.mode ?? "temporary";
  if (!A01_BINDING_MODES.includes(mode)) {
    throw new SpaceInputError(400, `Invalid A01 mode '${String(input.mode)}' (expected temporary | long-term)`);
  }
  const cleanProject = input.projectSlug?.trim() ? input.projectSlug.trim().toLowerCase() : undefined;
  const { teamRoot, teamDbPath, fleetDbPath, teamBin, vaultRoot } = resolvePaths(opts);

  if (cleanProject) {
    const knownProjects = listC02Projects({ vaultRoot });
    if (knownProjects.length > 0 && !knownProjects.some((p) => p.slug === cleanProject)) {
      throw new SpaceInputError(400, `Unknown C02 project '${cleanProject}'`);
    }
  }

  const card = requireA01RoleCard(input.role, mode, cleanProject ?? null, opts);
  const roleId = card.role;
  const tier = STEWARD_ROLES.has(roleId) ? "steward" : "specialist";
  const atMs = (opts?.now ?? Date.now)();
  const isoTs = new Date(atMs).toISOString();

  let fleetDbPersisted = false;
  if (existsSync(teamBin)) {
    const cliArgs = [
      "bind",
      "--agent-id",
      botId,
      "--role",
      roleId,
      "--mode",
      mode,
      ...(cleanProject ? ["--project", cleanProject] : []),
      "--host",
      "openmanus",
      "--json",
    ];
    try {
      const stdout = execFileSync(teamBin, cliArgs, {
        encoding: "utf8",
        timeout: 8_000,
        env: {
          ...process.env,
          TEAM_ROOT: teamRoot,
          TEAM_DB: teamDbPath,
          TEAM_FLEET_DB: fleetDbPath,
        },
      });
      const parsed = parseJsonSafe<Record<string, unknown>>(stdout, {});
      if (parsed.ok === false) {
        throw new SpaceInputError(400, String(parsed.message ?? `Failed to bind A01 role '${roleId}'`));
      }
      fleetDbPersisted = Boolean(parsed.fleet_db_persisted);
    } catch (error) {
      if (error instanceof SpaceInputError) throw error;
      throw new SpaceInputError(
        400,
        `team bind failed for role '${roleId}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (mode === "long-term") {
    writeLongTermFleetBindingFallback({
      fleetDbPath,
      roleId,
      agentId: botId,
      tier,
      project: cleanProject ?? "*",
      ts: isoTs,
    });
    fleetDbPersisted = true;
  }

  if (mode === "long-term") {
    clearA01Cache();
  }

  const binding: BotA01Binding = {
    role: roleId,
    mode,
    ...(cleanProject ? { projectSlug: cleanProject } : {}),
    ...(input.computerProvider?.trim() ? { computerProvider: input.computerProvider.trim() } : {}),
    ...(input.computerLeaseId?.trim() ? { computerLeaseId: input.computerLeaseId.trim() } : {}),
    boundAt: atMs,
  };

  const receipt: A01BindReceipt = {
    ok: true,
    agentId: botId,
    role: roleId,
    tier,
    mode,
    project: cleanProject ?? (mode === "long-term" ? "*" : null),
    host: "openmanus",
    memoryPolicy: mode === "temporary" ? "ephemeral_c01_only" : "hindsight_fleet_db",
    memoryWriteTarget: mode === "temporary" ? "C01__work_board/<job>/memory/log.jsonl" : fleetDbPath,
    fleetDbPersisted,
    boundAt: isoTs,
  };

  return { binding, receipt };
}

function buildFtsMatchExpr(rawQuery: string, joiner: " " | " OR "): string {
  const tokens = rawQuery.match(/[A-Za-z0-9_]+/g) ?? [];
  if (tokens.length === 0) return "";
  return tokens.map((t) => `"${t}"*`).join(joiner);
}

export function searchA01(
  query: string,
  limit = 20,
  opts?: A01BridgeOptions,
): { query: string; count: number; results: A01SearchHit[] } {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new SpaceInputError(400, "search query must not be empty");
  }
  const clampedLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 20));
  const { teamDbPath } = resolvePaths(opts);
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  return cached(`a01:search:${teamDbPath}:${cleanQuery.toLowerCase()}:${clampedLimit}`, ttlMs, () => {
    const db = openRoDb(teamDbPath);
    if (!db) return { query: cleanQuery, count: 0, results: [] };
    try {
      const andExpr = buildFtsMatchExpr(cleanQuery, " ");
      if (!andExpr) return { query: cleanQuery, count: 0, results: [] };
      const sql =
        "SELECT role_id, doc_kind, item_id, title, body, source_file, round(bm25(team_fts), 4) AS rank FROM team_fts WHERE team_fts MATCH ? ORDER BY bm25(team_fts) LIMIT ?";
      let rows = db.prepare(sql).all(andExpr, clampedLimit) as Array<Record<string, unknown>>;
      if (rows.length === 0 && andExpr.includes(" ")) {
        const orExpr = buildFtsMatchExpr(cleanQuery, " OR ");
        rows = db.prepare(sql).all(orExpr, clampedLimit) as Array<Record<string, unknown>>;
      }
      const results: A01SearchHit[] = rows.map((r) => ({
        roleId: String(r.role_id ?? ""),
        docKind: String(r.doc_kind ?? ""),
        itemId: String(r.item_id ?? ""),
        title: String(r.title ?? ""),
        body: String(r.body ?? ""),
        sourceFile: String(r.source_file ?? ""),
        rank: Number(r.rank ?? 0),
      }));
      return { query: cleanQuery, count: results.length, results };
    } catch {
      return { query: cleanQuery, count: 0, results: [] };
    } finally {
      db.close();
    }
  });
}

export function queryA01Formulas(role?: string, query?: string, opts?: A01BridgeOptions): A01FormulaItem[] {
  const { teamDbPath } = resolvePaths(opts);
  const db = openRoDb(teamDbPath);
  if (!db) return [];
  try {
    let roleFilter: string | null = null;
    if (role?.trim()) {
      const rc = lookupRegisteredRoleRow(db, role.trim());
      if (!rc) {
        throw new SpaceInputError(400, `Role '${role.trim()}' is NOT registered in A01__team/team.db`);
      }
      roleFilter = rc.kind === "mini" ? String(rc.parent_role || rc.id) : String(rc.id);
    }
    const cleanQ = query?.trim().toLowerCase() ?? "";
    let sql =
      "SELECT id, role_id, name, category, expression, inputs_json, thresholds_json, when_to_use, source_file FROM formula WHERE 1=1";
    const params: string[] = [];
    if (roleFilter) {
      sql += " AND role_id = ?";
      params.push(roleFilter);
    }
    if (cleanQ) {
      const like = `%${cleanQ}%`;
      sql +=
        " AND (lower(id) LIKE ? OR lower(name) LIKE ? OR lower(category) LIKE ? OR lower(expression) LIKE ? OR lower(when_to_use) LIKE ?)";
      params.push(like, like, like, like, like);
    }
    sql += " ORDER BY role_id, id LIMIT 50";
    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id ?? ""),
      roleId: String(r.role_id ?? ""),
      name: String(r.name ?? ""),
      category: String(r.category ?? ""),
      expression: String(r.expression ?? ""),
      inputs: parseJsonSafe<string[]>(r.inputs_json, []),
      thresholds: parseJsonSafe<Record<string, unknown>>(r.thresholds_json, {}),
      whenToUse: String(r.when_to_use ?? ""),
      sourceFile: String(r.source_file ?? ""),
    }));
  } finally {
    db.close();
  }
}

export function queryA01Rules(role: string, opts?: A01BridgeOptions): { role: string; rules: A01RuleItem[] } {
  const cleanRole = role.trim();
  if (!cleanRole) throw new SpaceInputError(400, "role is required for rules lookup");
  const card = requireA01RoleCard(cleanRole, "temporary", null, opts);
  return { role: card.role, rules: card.rules };
}

function trimPromptSection(raw: string, maxChars: number): string {
  const cleaned = raw.trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Formats an A01 Standing Role Block for volatile system prompt assembly (`<1ms` on cached card). */
export function formatA01PromptBlock(card: A01RoleCardBundle, binding: BotA01Binding): string {
  const memoryLine =
    binding.mode === "temporary"
      ? "Memory Policy (TEMPORARY): Write session logs ONLY to C01__work_board/<job>/memory/log.jsonl. NEVER write to A01__team/memory/fleet.db."
      : `Memory Policy (LONG-TERM): Bound to Hindsight fleet.db (${card.memoryWriteTarget}). Recall & record durable cross-session lessons, episodes, decisions, and mistakes.`;

  const lines: string[] = [
    `[A01 Standing Role — ${card.role} (${card.name} · ${card.kind} · mode=${binding.mode})]`,
    `- ${memoryLine}`,
  ];
  if (card.mission) {
    lines.push(`- Mission: ${card.mission}`);
  }
  if (card.northStar) {
    lines.push(`- North Star: ${card.northStar}`);
  }
  if (card.systemMd) {
    lines.push(`Core SYSTEM.md:\n${trimPromptSection(card.systemMd, 2200)}`);
  }
  if (card.dbRefs.length > 0) {
    lines.push(
      `AGENTS.md DB Pointers:\n${card.dbRefs
        .slice(0, 8)
        .map((ref) => `- ${ref.dbId} (${ref.tableOrCli}) [${ref.access}]: ${ref.purpose}`)
        .join("\n")}`,
    );
  } else if (card.agentsSummary) {
    lines.push(`AGENTS.md Summary: ${trimPromptSection(card.agentsSummary, 500)}`);
  }
  if (card.formulas.length > 0) {
    lines.push(
      `Key Formulas:\n${card.formulas
        .slice(0, 5)
        .map((f) => `- ${f.id} (${f.name}): ${f.expression}${f.whenToUse ? ` — when: ${f.whenToUse}` : ""}`)
        .join("\n")}`,
    );
  }
  if (card.rules.length > 0) {
    lines.push(
      `Standing Rules:\n${card.rules
        .slice(0, 6)
        .map((r) => `- [${r.severity}] ${r.id}: ${r.rule}`)
        .join("\n")}`,
    );
  }
  if (card.workflows.length > 0) {
    lines.push(
      `Workflows:\n${card.workflows
        .slice(0, 5)
        .map((w) => `- ${w.workflowSlug}: ${w.title}${w.goal ? ` — ${w.goal}` : ""}`)
        .join("\n")}`,
    );
  }
  if (binding.mode === "long-term" && card.hindsightBrief) {
    lines.push(card.hindsightBrief.text);
  }
  return lines.join("\n");
}

export function runA01LookupTool(
  input: { action?: unknown; role?: unknown; query?: unknown },
  opts?: A01BridgeOptions,
): { text: string; data: unknown } {
  const action = typeof input.action === "string" ? input.action.trim() : "";
  const role = typeof input.role === "string" ? input.role.trim() : "";
  const query = typeof input.query === "string" ? input.query.trim() : "";

  if (action === "search") {
    const searchQuery = query || role;
    if (!searchQuery) throw new SpaceInputError(400, "a01_lookup action=search requires query");
    const res = searchA01(searchQuery, 15, opts);
    const lines = res.results.map(
      (hit) => `- [${hit.docKind}] ${hit.roleId} · ${hit.itemId} — ${hit.title}: ${hit.body.replace(/\s+/g, " ").slice(0, 150)}`,
    );
    return {
      text: res.results.length ? `A01 search "${res.query}" (${res.count} hits):\n${lines.join("\n")}` : `0 A01 results for "${res.query}".`,
      data: res,
    };
  }

  if (action === "formula") {
    const formulas = queryA01Formulas(role || undefined, query || undefined, opts);
    const lines = formulas.map(
      (f) => `- ${f.id} (${f.roleId} · ${f.category}): ${f.expression} — ${f.name}${f.whenToUse ? ` [when: ${f.whenToUse}]` : ""}`,
    );
    return {
      text: formulas.length ? `A01 formulas (${formulas.length}):\n${lines.join("\n")}` : "0 A01 formulas matched.",
      data: { count: formulas.length, formulas },
    };
  }

  if (action === "rules") {
    if (!role) throw new SpaceInputError(400, "a01_lookup action=rules requires role");
    const res = queryA01Rules(role, opts);
    const lines = res.rules.map(
      (r) => `- [${r.severity}] ${r.id}: ${r.rule}${r.verifyCmdOrCheck ? ` (verify: ${r.verifyCmdOrCheck})` : ""}`,
    );
    return {
      text: res.rules.length ? `A01 rules for ${res.role} (${res.rules.length}):\n${lines.join("\n")}` : `0 rules for ${res.role}.`,
      data: res,
    };
  }

  if (action === "card") {
    if (!role) throw new SpaceInputError(400, "a01_lookup action=card requires role");
    const card = requireA01RoleCard(role, "temporary", null, opts);
    const text = formatA01PromptBlock(card, { role: card.role, mode: "temporary", boundAt: 0 });
    return { text, data: card };
  }

  if (action === "workflows") {
    if (!role) throw new SpaceInputError(400, "a01_lookup action=workflows requires role");
    const card = requireA01RoleCard(role, "temporary", null, opts);
    const lines = card.workflows.map((w) => `- ${w.workflowSlug}: ${w.title}${w.goal ? ` — ${w.goal}` : ""}`);
    return {
      text: lines.length ? `A01 workflows for ${card.role} (${lines.length}):\n${lines.join("\n")}` : `0 workflows for ${card.role}.`,
      data: { role: card.role, workflows: card.workflows },
    };
  }

  throw new SpaceInputError(400, `unknown a01_lookup action '${action}'; expected search | formula | rules | card`);
}
