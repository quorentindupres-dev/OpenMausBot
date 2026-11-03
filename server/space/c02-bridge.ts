import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { SpaceInputError } from "./errors.ts";

const DEFAULT_VAULT_ROOT = "/Users/g/External-Vault";
const DEFAULT_TTL_MS = 10_000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;
const STOP_WORDS = new Set(["the", "a", "an", "of", "for", "and", "or", "to", "in", "on", "my", "our", "is", "where", "what", "find"]);

export type C02ReadinessStatus = "green" | "amber" | "red";

export interface C02BridgeOptions {
  vaultRoot?: string;
  ttlMs?: number;
}

export interface C02ProjectCounts {
  products: number;
  acquisitionChannels: number;
  folders: number;
  refs: number;
  campaignNotes: number;
}

export interface C02ProjectSummaryItem {
  slug: string;
  title: string;
  kind: string;
  status: string;
  size: string | null;
  folderPath: string | null;
  siteUrl: string | null;
  workspaceRoots: string[];
  aliases: string[];
  readinessStatus: C02ReadinessStatus;
  readinessBadge: "🟢" | "🟠" | "🔴";
  readinessScore: string;
  whenToUse: string;
  hasDb: boolean;
  counts: C02ProjectCounts;
}

export interface C02ReadinessPillar {
  pillarNum: number;
  pillar: string;
  home: string;
  required: boolean;
  status: string;
  missingFields: string;
}

export interface C02BusinessProfile {
  profileId: string;
  kind: string;
  businessModel: string | null;
  oneLineThesis: string | null;
  positioningPromise: string | null;
  voiceRules: Record<string, unknown>;
  complianceFrame: Record<string, unknown>;
  creativeSystem: Record<string, unknown>;
  offers: Array<Record<string, unknown>>;
  retentionBackend: Record<string, unknown>;
  workspaceRoots: string[];
}

export interface C02ProductRow {
  sku: string;
  name: string;
  category: string | null;
  format: string;
  problemSolved: string | null;
  mechanismSpec: string | null;
  listPrice: number | null;
  listPriceText: string | null;
  unitCost: number | null;
  folderPath: string | null;
  offers: Array<Record<string, unknown>>;
  state: string;
}

export interface C02AvatarRow {
  avatarId: string;
  label: string;
  who: string;
  bleedingNeckPain: string | null;
  beliefs: string[];
  objections: string[];
  inGroupTerms: string[];
  w09Ref: string | null;
}

export interface C02AcquisitionChannelRow {
  channelId: string;
  channel: string;
  howWeGetClients: string;
  entryFormats: string[];
  winningAngles: string[];
  maxCacLimit: number | null;
  breakevenMultiple: number | null;
  adAccountRef: string | null;
  pageRef: string | null;
  state: string;
}

export interface C02FunnelRow {
  funnelId: string;
  name: string;
  stepsFlow: string;
  entryUrl: string | null;
  storeRepo: string | null;
  trustMechanisms: string[];
  state: string;
}

export interface C02UnitEconomics {
  currency: string;
  targetAov: number | null;
  landedUnitCost: number | null;
  shippingCost: number | null;
  feePct: number | null;
  marginPct: number | null;
  maxCacLimit: number | null;
  paybackRule: string | null;
  paymentStack: string[];
}

export interface C02Operations {
  fulfillmentModel: string | null;
  supplierInfo: string | null;
  shippingRegions: string | null;
  slaDays: string | null;
  qaGate: string | null;
  supportChannel: string | null;
}

export interface C02FolderRow {
  path: string;
  what: string;
  whenToUse: string;
  writer: string;
}

export interface C02FactRow {
  key: string;
  value: string;
  asOf: string;
  source: string;
  isStale: boolean;
}

export interface C02RefRow {
  ref: string;
  role: string;
  why: string;
  state: string;
}

export interface C02CampaignNoteRow {
  campaignRef: string;
  verdict: string;
  hypothesis: string;
  angle: string | null;
  lesson: string | null;
  decidedOn: string | null;
  job: string | null;
}

export interface C02ProjectDetail {
  slug: string;
  title: string;
  kind: string;
  status: string;
  siteUrl: string | null;
  folderPath: string | null;
  hasDb: boolean;
  readiness: {
    status: C02ReadinessStatus;
    badge: "🟢" | "🟠" | "🔴";
    score: string;
    pillars: C02ReadinessPillar[];
    missingSummary: string[];
  };
  businessProfile: C02BusinessProfile | null;
  products: C02ProductRow[];
  avatars: C02AvatarRow[];
  acquisitionChannels: C02AcquisitionChannelRow[];
  funnels: C02FunnelRow[];
  unitEconomics: C02UnitEconomics | null;
  operations: C02Operations | null;
  facts: C02FactRow[];
  folders: C02FolderRow[];
  refs: C02RefRow[];
  campaignNotes: C02CampaignNoteRow[];
}

export interface C02DetectResult {
  target: string;
  slug: string;
  title: string;
  kind: string;
  matched: boolean;
  matchedBy: string;
  readinessStatus: C02ReadinessStatus;
  readinessScore: string;
  folderPath: string | null;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function clearC02Cache(): void {
  cache.clear();
}

function resolveVaultRoot(opts?: C02BridgeOptions): string {
  const raw = opts?.vaultRoot ?? process.env.OMB_VAULT_ROOT ?? process.env.PROJECT_VAULT ?? DEFAULT_VAULT_ROOT;
  return resolve(raw);
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

function badgeFor(status: string): "🟢" | "🟠" | "🔴" {
  if (status === "green") return "🟢";
  if (status === "amber") return "🟠";
  return "🔴";
}

function normalizeReadinessStatus(raw: unknown): C02ReadinessStatus {
  if (raw === "green" || raw === "amber" || raw === "red") return raw;
  return "red";
}

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function strOrNull(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function numOrNull(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function openRoDb(filePath: string): DatabaseSync | null {
  if (!existsSync(filePath)) return null;
  try {
    return new DatabaseSync(filePath, { readOnly: true });
  } catch {
    return null;
  }
}

function readProjectCounts(projectDbPath: string): C02ProjectCounts {
  const zero: C02ProjectCounts = { products: 0, acquisitionChannels: 0, folders: 0, refs: 0, campaignNotes: 0 };
  const db = openRoDb(projectDbPath);
  if (!db) return zero;
  try {
    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((r) => r.name),
    );
    const countOf = (table: string, where = "") => {
      if (!tables.has(table)) return 0;
      const row = db.prepare(`SELECT count(*) AS c FROM ${table}${where}`).get() as { c?: number } | undefined;
      return typeof row?.c === "number" ? row.c : 0;
    };
    return {
      products: countOf("product", " WHERE state != 'retired'"),
      acquisitionChannels: countOf("acquisition_channel", " WHERE state != 'retired'"),
      folders: countOf("folder"),
      refs: countOf("ref", " WHERE state = 'active'"),
      campaignNotes: countOf("campaign_note"),
    };
  } catch {
    return zero;
  } finally {
    db.close();
  }
}

export function listC02Projects(opts?: C02BridgeOptions): C02ProjectSummaryItem[] {
  const vaultRoot = resolveVaultRoot(opts);
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  return cached(`c02:list:${vaultRoot}`, ttlMs, () => {
    const c02Dir = join(vaultRoot, "C02__Project_database");
    const projectsDbPath = join(c02Dir, "projects.db");
    const db = openRoDb(projectsDbPath);
    if (db) {
      try {
        const rows = db
          .prepare(
            "SELECT slug, title, kind, state, size, folder_path, site_url, workspace_roots_json, aliases_json, readiness_status, readiness_score, when_to_use, is_db_made FROM project ORDER BY slug",
          )
          .all() as Array<Record<string, unknown>>;
        return rows.map((row) => {
          const slug = String(row.slug ?? "");
          const folderPath = strOrNull(row.folder_path);
          const absFolder = folderPath ? join(vaultRoot, folderPath) : null;
          const projectDbPath = absFolder ? join(absFolder, "project.db") : null;
          const hasDb = Boolean(projectDbPath && existsSync(projectDbPath));
          const readinessStatus = normalizeReadinessStatus(row.readiness_status);
          return {
            slug,
            title: String(row.title ?? slug),
            kind: String(row.kind ?? "brand"),
            status: String(row.state ?? "active"),
            size: strOrNull(row.size),
            folderPath,
            siteUrl: strOrNull(row.site_url),
            workspaceRoots: parseJsonSafe<string[]>(row.workspace_roots_json, []),
            aliases: parseJsonSafe<string[]>(row.aliases_json, []),
            readinessStatus,
            readinessBadge: badgeFor(readinessStatus),
            readinessScore: String(row.readiness_score ?? "0/7"),
            whenToUse: String(row.when_to_use ?? ""),
            hasDb,
            counts: hasDb && projectDbPath ? readProjectCounts(projectDbPath) : { products: 0, acquisitionChannels: 0, folders: 0, refs: 0, campaignNotes: 0 },
          };
        });
      } catch {
        // Fall through to projects.json fallback if schema differs
      } finally {
        db.close();
      }
    }

    const jsonPath = join(c02Dir, "projects.json");
    if (!existsSync(jsonPath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as { projects?: Array<Record<string, unknown>> };
      return (parsed.projects ?? [])
        .filter((item) => item && typeof item.id === "string")
        .map((item) => {
          const slug = String(item.id);
          const folderPath = strOrNull(item.folder);
          const projectDbPath = folderPath ? join(vaultRoot, folderPath, "project.db") : null;
          const hasDb = Boolean(projectDbPath && existsSync(projectDbPath));
          return {
            slug,
            title: String(item.title ?? slug),
            kind: String(item.kind ?? "brand"),
            status: String(item.status ?? "active"),
            size: strOrNull(item.size),
            folderPath,
            siteUrl: strOrNull(item.site),
            workspaceRoots: Array.isArray(item.workspace_roots) ? item.workspace_roots.map(String) : [],
            aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
            readinessStatus: "red" as const,
            readinessBadge: "🔴" as const,
            readinessScore: "0/7",
            whenToUse: String(item.when ?? ""),
            hasDb,
            counts: hasDb && projectDbPath ? readProjectCounts(projectDbPath) : { products: 0, acquisitionChannels: 0, folders: 0, refs: 0, campaignNotes: 0 },
          };
        });
    } catch {
      return [];
    }
  });
}

export function getC02ProjectDetail(slug: string, opts?: C02BridgeOptions): C02ProjectDetail | null {
  const cleanSlug = slug.trim().toLowerCase();
  if (!SLUG_RE.test(cleanSlug)) {
    throw new SpaceInputError(400, `'${slug}' is not a valid C02 project slug`);
  }
  const vaultRoot = resolveVaultRoot(opts);
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  return cached(`c02:detail:${vaultRoot}:${cleanSlug}`, ttlMs, () => {
    const summary = listC02Projects(opts).find((item) => item.slug === cleanSlug);
    if (!summary) return null;

    const emptyDetail: C02ProjectDetail = {
      slug: summary.slug,
      title: summary.title,
      kind: summary.kind,
      status: summary.status,
      siteUrl: summary.siteUrl,
      folderPath: summary.folderPath,
      hasDb: summary.hasDb,
      readiness: {
        status: summary.readinessStatus,
        badge: summary.readinessBadge,
        score: summary.readinessScore,
        pillars: [],
        missingSummary: [],
      },
      businessProfile: null,
      products: [],
      avatars: [],
      acquisitionChannels: [],
      funnels: [],
      unitEconomics: null,
      operations: null,
      facts: [],
      folders: [],
      refs: [],
      campaignNotes: [],
    };

    if (!summary.folderPath) return emptyDetail;
    const projectDbPath = join(vaultRoot, summary.folderPath, "project.db");
    const db = openRoDb(projectDbPath);
    if (!db) return emptyDetail;

    try {
      const tables = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all() as Array<{ name: string }>).map(
          (r) => r.name,
        ),
      );

      const pillars: C02ReadinessPillar[] = tables.has("project_readiness")
        ? (
            db
              .prepare("SELECT pillar_num, pillar, home, required, status, missing_fields FROM project_readiness ORDER BY pillar_num")
              .all() as Array<Record<string, unknown>>
          ).map((r) => ({
            pillarNum: Number(r.pillar_num ?? 0),
            pillar: String(r.pillar ?? ""),
            home: String(r.home ?? ""),
            required: Number(r.required ?? 0) === 1,
            status: String(r.status ?? "🔴"),
            missingFields: String(r.missing_fields ?? ""),
          }))
        : [];
      const missingSummary = pillars
        .filter((p) => p.required && p.status !== "🟢" && p.missingFields)
        .map((p) => `${p.pillar}: ${p.missingFields}`);

      let businessProfile: C02BusinessProfile | null = null;
      if (tables.has("business_profile")) {
        const bp = db.prepare("SELECT * FROM business_profile WHERE profile_id = 'primary'").get() as Record<string, unknown> | undefined;
        if (bp) {
          businessProfile = {
            profileId: String(bp.profile_id ?? "primary"),
            kind: String(bp.kind ?? summary.kind),
            businessModel: strOrNull(bp.business_model),
            oneLineThesis: strOrNull(bp.one_line_thesis),
            positioningPromise: strOrNull(bp.positioning_promise),
            voiceRules: parseJsonSafe<Record<string, unknown>>(bp.voice_json, {}),
            complianceFrame: parseJsonSafe<Record<string, unknown>>(bp.compliance_json, {}),
            creativeSystem: parseJsonSafe<Record<string, unknown>>(bp.creative_json, {}),
            offers: parseJsonSafe<Array<Record<string, unknown>>>(bp.offers_json, []),
            retentionBackend: parseJsonSafe<Record<string, unknown>>(bp.retention_json, {}),
            workspaceRoots: parseJsonSafe<string[]>(bp.workspace_roots_json, summary.workspaceRoots),
          };
        }
      }

      const products: C02ProductRow[] = tables.has("product")
        ? (db.prepare("SELECT * FROM product ORDER BY state = 'active' DESC, sku").all() as Array<Record<string, unknown>>).map((r) => ({
            sku: String(r.sku ?? ""),
            name: String(r.name ?? ""),
            category: strOrNull(r.category),
            format: String(r.format ?? ""),
            problemSolved: strOrNull(r.problem_solved),
            mechanismSpec: strOrNull(r.mechanism_spec),
            listPrice: numOrNull(r.list_price),
            listPriceText: strOrNull(r.list_price_text),
            unitCost: numOrNull(r.unit_cost),
            folderPath: strOrNull(r.folder_path),
            offers: parseJsonSafe<Array<Record<string, unknown>>>(r.offer_json, []),
            state: String(r.state ?? "active"),
          }))
        : [];

      const avatars: C02AvatarRow[] = tables.has("avatar")
        ? (db.prepare("SELECT * FROM avatar ORDER BY avatar_id").all() as Array<Record<string, unknown>>).map((r) => ({
            avatarId: String(r.avatar_id ?? ""),
            label: String(r.label ?? ""),
            who: String(r.who ?? ""),
            bleedingNeckPain: strOrNull(r.bleeding_neck_pain),
            beliefs: parseJsonSafe<string[]>(r.beliefs_json, []),
            objections: parseJsonSafe<string[]>(r.objections_json, []),
            inGroupTerms: parseJsonSafe<string[]>(r.in_group_json, []),
            w09Ref: strOrNull(r.w09_ref),
          }))
        : [];

      const acquisitionChannels: C02AcquisitionChannelRow[] = tables.has("acquisition_channel")
        ? (
            db.prepare("SELECT * FROM acquisition_channel ORDER BY state = 'active' DESC, channel_id").all() as Array<Record<string, unknown>>
          ).map((r) => ({
            channelId: String(r.channel_id ?? ""),
            channel: String(r.channel ?? ""),
            howWeGetClients: String(r.how_we_get_clients ?? ""),
            entryFormats: parseJsonSafe<string[]>(r.entry_formats_json, []),
            winningAngles: parseJsonSafe<string[]>(r.winning_angles_json, []),
            maxCacLimit: numOrNull(r.max_cac_limit),
            breakevenMultiple: numOrNull(r.breakeven_multiple),
            adAccountRef: strOrNull(r.ad_account_ref),
            pageRef: strOrNull(r.page_ref),
            state: String(r.state ?? "active"),
          }))
        : [];

      const funnels: C02FunnelRow[] = tables.has("funnel")
        ? (db.prepare("SELECT * FROM funnel ORDER BY state = 'active' DESC, funnel_id").all() as Array<Record<string, unknown>>).map((r) => ({
            funnelId: String(r.funnel_id ?? ""),
            name: String(r.name ?? ""),
            stepsFlow: String(r.steps_flow ?? ""),
            entryUrl: strOrNull(r.entry_url),
            storeRepo: strOrNull(r.store_repo),
            trustMechanisms: parseJsonSafe<string[]>(r.trust_json, []),
            state: String(r.state ?? "active"),
          }))
        : [];

      let unitEconomics: C02UnitEconomics | null = null;
      if (tables.has("unit_economics")) {
        const ue = db.prepare("SELECT * FROM unit_economics WHERE model_id = 'primary'").get() as Record<string, unknown> | undefined;
        if (ue) {
          unitEconomics = {
            currency: String(ue.currency ?? "USD"),
            targetAov: numOrNull(ue.target_aov),
            landedUnitCost: numOrNull(ue.landed_unit_cost),
            shippingCost: numOrNull(ue.shipping_cost),
            feePct: numOrNull(ue.fee_pct),
            marginPct: numOrNull(ue.margin_pct),
            maxCacLimit: numOrNull(ue.max_cac_limit),
            paybackRule: strOrNull(ue.payback_rule),
            paymentStack: parseJsonSafe<string[]>(ue.payment_stack_json, []),
          };
        }
      }

      let operations: C02Operations | null = null;
      if (tables.has("operations")) {
        const op = db.prepare("SELECT * FROM operations WHERE ops_id = 'primary'").get() as Record<string, unknown> | undefined;
        if (op) {
          operations = {
            fulfillmentModel: strOrNull(op.fulfillment_model),
            supplierInfo: strOrNull(op.supplier_info),
            shippingRegions: strOrNull(op.shipping_regions),
            slaDays: strOrNull(op.sla_days),
            qaGate: strOrNull(op.qa_gate),
            supportChannel: strOrNull(op.support_channel),
          };
        }
      }

      const facts: C02FactRow[] = tables.has("fact_card")
        ? (db.prepare("SELECT key, value, as_of, source, is_stale FROM fact_card ORDER BY key").all() as Array<Record<string, unknown>>).map((r) => ({
            key: String(r.key ?? ""),
            value: String(r.value ?? ""),
            asOf: String(r.as_of ?? ""),
            source: String(r.source ?? ""),
            isStale: Number(r.is_stale ?? 0) === 1,
          }))
        : [];

      const folders: C02FolderRow[] = tables.has("folder")
        ? (db.prepare("SELECT path, what, when_to_use, writer FROM folder ORDER BY path").all() as Array<Record<string, unknown>>).map((r) => ({
            path: String(r.path ?? ""),
            what: String(r.what ?? ""),
            whenToUse: String(r.when_to_use ?? ""),
            writer: String(r.writer ?? "any agent"),
          }))
        : [];

      const refs: C02RefRow[] = tables.has("ref")
        ? (db.prepare("SELECT ref, role, why, state FROM ref WHERE state = 'active' ORDER BY ref").all() as Array<Record<string, unknown>>).map((r) => ({
            ref: String(r.ref ?? ""),
            role: String(r.role ?? ""),
            why: String(r.why ?? ""),
            state: String(r.state ?? "active"),
          }))
        : [];

      const campaignNotes: C02CampaignNoteRow[] = tables.has("campaign_note")
        ? (
            db
              .prepare("SELECT campaign_ref, verdict, hypothesis, angle, lesson, decided_on, job FROM campaign_note ORDER BY coalesce(decided_on, substr(updated_at, 1, 10)) DESC, updated_at DESC LIMIT 10")
              .all() as Array<Record<string, unknown>>
          ).map((r) => ({
            campaignRef: String(r.campaign_ref ?? ""),
            verdict: String(r.verdict ?? "running"),
            hypothesis: String(r.hypothesis ?? ""),
            angle: strOrNull(r.angle),
            lesson: strOrNull(r.lesson),
            decidedOn: strOrNull(r.decided_on),
            job: strOrNull(r.job),
          }))
        : [];

      return {
        ...emptyDetail,
        hasDb: true,
        readiness: {
          status: summary.readinessStatus,
          badge: summary.readinessBadge,
          score: summary.readinessScore,
          pillars,
          missingSummary,
        },
        businessProfile,
        products,
        avatars,
        acquisitionChannels,
        funnels,
        unitEconomics,
        operations,
        facts,
        folders,
        refs,
        campaignNotes,
      };
    } finally {
      db.close();
    }
  });
}

function extractHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("://")) {
    try {
      const host = new URL(trimmed).hostname.toLowerCase();
      return host.startsWith("www.") ? host.slice(4) : host;
    } catch {
      return null;
    }
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(trimmed) && !trimmed.startsWith("/")) {
    const host = trimmed.split("/")[0]!.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  }
  return null;
}

function normFs(raw: string): string {
  const expanded = raw.startsWith("~/") ? join(process.env.HOME ?? "/Users/g", raw.slice(2)) : raw;
  return expanded.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
}

function globToRegExp(globPattern: string): RegExp {
  const escaped = globPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`, "i");
}

function finishDetect(
  target: string,
  proj: Pick<C02ProjectSummaryItem, "slug" | "title" | "kind" | "readinessStatus" | "readinessScore" | "folderPath">,
  matched: boolean,
  matchedBy: string,
): C02DetectResult {
  return {
    target,
    slug: proj.slug,
    title: proj.title,
    kind: proj.kind,
    matched,
    matchedBy,
    readinessStatus: proj.readinessStatus,
    readinessScore: proj.readinessScore,
    folderPath: proj.folderPath,
  };
}

/** Auto-detects a C02 project from workspace directory, repo path, URL/domain, or C01 job folder. */
export function detectC02Project(targetPathOrUrl: string, opts?: C02BridgeOptions): C02DetectResult {
  const raw = targetPathOrUrl.trim();
  if (!raw) {
    throw new SpaceInputError(400, "target path, URL, or job name is required");
  }
  const vaultRoot = resolveVaultRoot(opts);
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  return cached(`c02:detect:${vaultRoot}:${raw}`, ttlMs, () => {
    const projects = listC02Projects(opts);
    const bySlug = new Map(projects.map((p) => [p.slug, p]));

    // Tier 1: Direct slug match or C02 folder match
    const lowerRaw = raw.toLowerCase();
    const direct = bySlug.get(lowerRaw);
    if (direct && direct.slug !== "uncategorized") {
      return finishDetect(raw, direct, true, "direct_slug");
    }

    const norm = normFs(raw);
    const normVault = normFs(vaultRoot);
    let relToVault: string | null = null;
    if (norm === normVault) {
      relToVault = "";
    } else if (norm.startsWith(`${normVault}/`)) {
      relToVault = norm.slice(normVault.length + 1);
    } else if (!raw.startsWith("/") && !raw.includes("://")) {
      relToVault = raw.replace(/^\/+/, "");
    }

    if (relToVault && relToVault.startsWith("C02__Project_database/")) {
      const parts = relToVault.split("/");
      const slugPart = parts[1]?.toLowerCase();
      if (slugPart && bySlug.has(slugPart)) {
        return finishDetect(raw, bySlug.get(slugPart)!, true, "c02_folder");
      }
    }

    // Tier 2: C01 / C03 job path or bare <slug>__<job>
    let jobName: string | null = null;
    if (relToVault && (relToVault.startsWith("C01__work_board/") || relToVault.startsWith("C03__Video_jobs/"))) {
      const parts = relToVault.split("/");
      if (parts.length >= 2 && parts[1]) {
        jobName = parts[1];
      }
    } else if (basename(norm).includes("__") && !raw.includes("://")) {
      jobName = basename(norm);
    }

    if (jobName) {
      const jobJsonPath = join(vaultRoot, "C01__work_board", jobName, "job.json");
      if (existsSync(jobJsonPath)) {
        try {
          const meta = JSON.parse(readFileSync(jobJsonPath, "utf8")) as { project?: unknown };
          if (typeof meta.project === "string" && bySlug.has(meta.project)) {
            return finishDetect(raw, bySlug.get(meta.project)!, true, "c01_job_json");
          }
        } catch {
          // ignore malformed job.json
        }
      }
      const prefix = jobName.split("__")[0]?.toLowerCase() ?? "";
      if (prefix && bySlug.has(prefix)) {
        return finishDetect(raw, bySlug.get(prefix)!, true, "job_prefix");
      }
    }

    // Tier 3: URL or domain match
    const host = extractHost(raw);
    if (host) {
      const domainHits: Array<{ kindRank: number; negLen: number; proj: C02ProjectSummaryItem; domain: string }> = [];
      for (const proj of projects) {
        const domains = [extractHost(proj.siteUrl), ...proj.workspaceRoots.map(extractHost)].filter(
          (d): d is string => Boolean(d),
        );
        for (const d of domains) {
          if (host === d || host.endsWith(`.${d}`)) {
            domainHits.push({ kindRank: proj.kind !== "internal" ? 0 : 1, negLen: -d.length, proj, domain: d });
          }
        }
      }
      if (domainHits.length > 0) {
        domainHits.sort((a, b) => a.kindRank - b.kindRank || a.negLen - b.negLen);
        const best = domainHits[0]!;
        return finishDetect(raw, best.proj, true, `domain:${best.domain}`);
      }
    }

    // Tier 4: Exact, parent-dir, or glob workspace_roots match
    const exactHits: Array<{ kindRank: number; negLen: number; proj: C02ProjectSummaryItem; root: string }> = [];
    const globHits: Array<{ kindRank: number; negLen: number; proj: C02ProjectSummaryItem; root: string }> = [];
    const absCandidate = raw.startsWith("/") || raw.startsWith("~/") ? norm : normFs(join(vaultRoot, raw));
    const absLow = absCandidate.toLowerCase();

    for (const proj of projects) {
      const kindRank = proj.kind !== "internal" ? 0 : 1;
      for (const w of proj.workspaceRoots) {
        if (extractHost(w)) continue;
        let wn = normFs(w);
        if (!wn.startsWith("/")) {
          wn = normFs(join(vaultRoot, wn));
        }
        const wnLow = wn.toLowerCase();
        if (wn.includes("*") || wn.includes("?")) {
          const rx = globToRegExp(wnLow);
          let cur = absLow;
          while (true) {
            if (rx.test(cur)) {
              globHits.push({ kindRank, negLen: -wn.length, proj, root: w });
              break;
            }
            const slash = cur.lastIndexOf("/");
            if (slash <= 0) break;
            cur = cur.slice(0, slash);
          }
        } else if (absLow === wnLow || absLow.startsWith(`${wnLow}/`)) {
          exactHits.push({ kindRank, negLen: -wn.length, proj, root: w });
        }
      }
    }

    if (exactHits.length > 0) {
      exactHits.sort((a, b) => a.kindRank - b.kindRank || a.negLen - b.negLen);
      const best = exactHits[0]!;
      return finishDetect(raw, best.proj, true, `workspace_root:${best.root}`);
    }
    if (globHits.length > 0) {
      globHits.sort((a, b) => a.kindRank - b.kindRank || a.negLen - b.negLen);
      const best = globHits[0]!;
      return finishDetect(raw, best.proj, true, `workspace_glob:${best.root}`);
    }

    // Tier 5: Vault internal zones (A00/A01/A06/A07/A08/A09) -> x-labs
    if (
      relToVault &&
      ["A00__", "A01__", "A06__", "A07__", "A08__", "A09__"].some((prefix) => relToVault.startsWith(prefix)) &&
      bySlug.has("x-labs")
    ) {
      return finishDetect(raw, bySlug.get("x-labs")!, true, "vault_internal_zone");
    }

    // Tier 6: Bare repo directory name or alias
    const baseLow = basename(norm).toLowerCase();
    for (const proj of projects) {
      for (const w of proj.workspaceRoots) {
        if (!w.includes("*") && !w.includes("?") && !extractHost(w)) {
          if (basename(normFs(w)).toLowerCase() === baseLow) {
            return finishDetect(raw, proj, true, `repo_basename:${w}`);
          }
        }
      }
      if (proj.aliases.some((alias) => alias.toLowerCase() === baseLow)) {
        return finishDetect(raw, proj, true, `alias:${baseLow}`);
      }
    }

    const fallback = bySlug.get("uncategorized") ?? {
      slug: "uncategorized",
      title: "Not tied to a project yet",
      kind: "catch-all",
      readinessStatus: "red" as const,
      readinessScore: "0/0",
      folderPath: null,
    };
    return finishDetect(raw, fallback, false, "none");
  });
}

function stemWord(word: string): string {
  for (const suffix of ["ings", "ing", "es", "s"]) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

function stemTokens(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((w) => !STOP_WORDS.has(w)).map(stemWord));
}

export function queryC02Where(slug: string, thing: string, opts?: C02BridgeOptions) {
  const cleanThing = thing.trim();
  if (!cleanThing) throw new SpaceInputError(400, "query is required for where lookup");
  const detail = getC02ProjectDetail(slug, opts);
  if (!detail) throw new SpaceInputError(404, `no C02 project '${slug}'`);
  const want = stemTokens(cleanThing);
  const scored = detail.folders.map((folder) => {
    const have = stemTokens(`${folder.path} ${folder.what} ${folder.whenToUse}`);
    let hits = 0;
    for (const token of want) {
      if (have.has(token)) hits += 1;
    }
    return { hits, folder };
  });
  scored.sort((a, b) => b.hits - a.hits || a.folder.path.localeCompare(b.folder.path));
  const matched = scored.filter((item) => item.hits > 0);
  const topHits = matched.length > 0 ? matched[0]!.hits : 0;
  const chosen = matched.length > 0 ? matched.filter((item) => item.hits === topHits).slice(0, 3) : scored.slice(0, 2);
  return {
    project: detail.slug,
    thing: cleanThing,
    match: matched.length > 0 ? ("found" as const) : ("closest" as const),
    folders: chosen.map(({ folder }) => ({
      path: `${folder.path}/`,
      vaultPath: detail.folderPath ? `${detail.folderPath}/${folder.path}/` : `${folder.path}/`,
      what: folder.what,
      whenToUse: folder.whenToUse,
    })),
    fallback: `data where "${cleanThing}"`,
  };
}

export function queryC02Readiness(slug?: string, opts?: C02BridgeOptions) {
  if (slug && slug.trim()) {
    const detail = getC02ProjectDetail(slug, opts);
    if (!detail) throw new SpaceInputError(404, `no C02 project '${slug}'`);
    return {
      summary: {
        total: 1,
        green: detail.readiness.status === "green" ? 1 : 0,
        amber: detail.readiness.status === "amber" ? 1 : 0,
        red: detail.readiness.status === "red" ? 1 : 0,
      },
      projects: [
        {
          slug: detail.slug,
          title: detail.title,
          kind: detail.kind,
          readinessStatus: detail.readiness.status,
          readinessBadge: detail.readiness.badge,
          readinessScore: detail.readiness.score,
          pillars: detail.readiness.pillars,
          missingSummary: detail.readiness.missingSummary,
        },
      ],
    };
  }

  const all = listC02Projects(opts);
  const details = all.map((p) => getC02ProjectDetail(p.slug, opts));
  return {
    summary: {
      total: all.length,
      green: all.filter((p) => p.readinessStatus === "green").length,
      amber: all.filter((p) => p.readinessStatus === "amber").length,
      red: all.filter((p) => p.readinessStatus === "red").length,
    },
    projects: all.map((p, idx) => {
      const det = details[idx];
      return {
        slug: p.slug,
        title: p.title,
        kind: p.kind,
        readinessStatus: p.readinessStatus,
        readinessBadge: p.readinessBadge,
        readinessScore: p.readinessScore,
        pillars: det?.readiness.pillars ?? [],
        missingSummary: det?.readiness.missingSummary ?? [],
      };
    }),
  };
}

function oneLine(text: string | null | undefined, max = 140): string {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

function moneyText(val: number | null | undefined): string {
  return typeof val === "number" && Number.isFinite(val) ? `$${val.toFixed(2)}` : "n/a";
}

/** Formats a compact C02 First-Principles Business Context block for volatile prompt injection. */
export function formatC02PromptBlock(detail: C02ProjectDetail): string {
  const lines: string[] = [
    `[C02 Business Context — ${detail.slug} (${detail.title})]`,
    `- Readiness: ${detail.readiness.badge} ${detail.readiness.score} (${detail.readiness.status})${detail.siteUrl ? ` · Site: ${detail.siteUrl}` : ""}`,
  ];
  if (detail.readiness.missingSummary.length > 0) {
    lines.push(`- Missing pillars: ${detail.readiness.missingSummary.slice(0, 3).join(" | ")}`);
  }
  const bp = detail.businessProfile;
  if (bp) {
    if (bp.oneLineThesis) {
      lines.push(`- Thesis (${bp.businessModel ?? detail.kind}): ${oneLine(bp.oneLineThesis, 180)}`);
    }
    if (bp.positioningPromise) {
      lines.push(`- Promise: ${oneLine(bp.positioningPromise, 160)}`);
    }
    const hardBans = Array.isArray(bp.complianceFrame.hard_banned_claims)
      ? bp.complianceFrame.hard_banned_claims.map(String)
      : [];
    if (hardBans.length > 0) {
      lines.push(`- Hard Compliance Bans: ${oneLine(hardBans.slice(0, 3).join("; "), 180)}`);
    }
  }
  const activeProducts = detail.products.filter((p) => p.state !== "retired");
  if (activeProducts.length > 0) {
    const skuSummary = activeProducts
      .slice(0, 5)
      .map((p) => `${p.sku} (${p.listPriceText ?? moneyText(p.listPrice)}${p.problemSolved ? ` — ${oneLine(p.problemSolved, 50)}` : ""})`)
      .join("; ");
    lines.push(`- Active SKUs (${activeProducts.length}): ${skuSummary}${activeProducts.length > 5 ? ` (+${activeProducts.length - 5} more)` : ""}`);
  }
  const activeChannels = detail.acquisitionChannels.filter((c) => c.state !== "retired");
  if (activeChannels.length > 0) {
    const chSummary = activeChannels
      .slice(0, 3)
      .map(
        (c) =>
          `${c.channel}: ${oneLine(c.howWeGetClients, 110)}${c.maxCacLimit !== null ? ` [max CAC ${moneyText(c.maxCacLimit)}]` : ""}`,
      )
      .join(" | ");
    lines.push(`- How We Get Clients (${activeChannels.length}): ${chSummary}`);
  }
  const activeFunnels = detail.funnels.filter((f) => f.state !== "retired");
  if (activeFunnels.length > 0) {
    const fnSummary = activeFunnels
      .slice(0, 2)
      .map((f) => `${f.name}: ${oneLine(f.stepsFlow, 120)}`)
      .join(" | ");
    lines.push(`- Funnel: ${fnSummary}`);
  }
  const econ = detail.unitEconomics;
  if (econ && (econ.targetAov !== null || econ.maxCacLimit !== null || econ.marginPct !== null || econ.paybackRule)) {
    const econBits = [
      econ.targetAov !== null ? `AOV=${moneyText(econ.targetAov)}` : null,
      econ.landedUnitCost !== null ? `landed=${moneyText(econ.landedUnitCost)}` : null,
      econ.shippingCost !== null ? `ship=${moneyText(econ.shippingCost)}` : null,
      econ.marginPct !== null ? `margin=${econ.marginPct}%` : null,
      econ.maxCacLimit !== null ? `maxCAC=${moneyText(econ.maxCacLimit)}` : null,
    ].filter(Boolean);
    lines.push(`- Unit Economics (${econ.currency}): ${econBits.join(" · ")}${econ.paybackRule ? ` — ${oneLine(econ.paybackRule, 100)}` : ""}`);
  }
  return lines.join("\n");
}

export function runC02LookupTool(
  input: { action?: unknown; slug?: unknown; query?: unknown },
  opts?: C02BridgeOptions,
): { text: string; data: unknown } {
  const action = typeof input.action === "string" ? input.action.trim() : "";
  const slug = typeof input.slug === "string" ? input.slug.trim() : "";
  const query = typeof input.query === "string" ? input.query.trim() : "";

  if (action === "list") {
    const projects = listC02Projects(opts);
    const lines = projects.map(
      (p) =>
        `${p.readinessBadge} ${p.slug} (${p.kind}, ${p.status}) — ${p.readinessScore} · ${p.counts.products} SKUs · ${p.counts.acquisitionChannels} channels · ${p.title}`,
    );
    return {
      text: projects.length ? `C02 Projects (${projects.length}):\n${lines.join("\n")}` : "No C02 projects found.",
      data: { projects },
    };
  }

  if (action === "detect") {
    const target = query || slug;
    if (!target) throw new SpaceInputError(400, "c02_project_lookup action=detect requires query (path, URL, or C01 job)");
    const detection = detectC02Project(target, opts);
    return {
      text: `${badgeFor(detection.readinessStatus)} ${detection.slug} (${detection.kind}, readiness ${detection.readinessScore}) ← matched_by=${detection.matchedBy}`,
      data: detection,
    };
  }

  if (action === "readiness") {
    const report = queryC02Readiness(slug || undefined, opts);
    const lines = [
      `C02 Readiness: 🟢 ${report.summary.green} · 🟠 ${report.summary.amber} · 🔴 ${report.summary.red} (of ${report.summary.total})`,
      ...report.projects.map(
        (p) =>
          `${p.readinessBadge} ${p.slug} ${p.readinessScore} (${p.kind}) — ${p.missingSummary.length ? `missing: ${p.missingSummary.join(" | ")}` : "complete"}`,
      ),
    ];
    return { text: lines.join("\n"), data: report };
  }

  if (!slug) {
    throw new SpaceInputError(400, `c02_project_lookup action=${action || "?"} requires slug`);
  }

  if (action === "where") {
    if (!query) throw new SpaceInputError(400, "c02_project_lookup action=where requires query");
    const res = queryC02Where(slug, query, opts);
    const lines = [
      `${res.project} · "${res.thing}" (${res.match}):`,
      ...res.folders.map((f) => `- ${f.vaultPath}: ${f.what} (when: ${f.whenToUse})`),
      `fallback: ${res.fallback}`,
    ];
    return { text: lines.join("\n"), data: res };
  }

  const detail = getC02ProjectDetail(slug, opts);
  if (!detail) throw new SpaceInputError(404, `no C02 project '${slug}'`);

  if (action === "card") {
    return { text: formatC02PromptBlock(detail), data: detail };
  }

  if (action === "products") {
    const offers = detail.businessProfile?.offers ?? [];
    const lines = [
      `project ${detail.slug} · products (${detail.products.length}) & offers (${offers.length})`,
      ...offers.map((o) => `- [offer] ${String(o.offer_id ?? "")}: ${String(o.name ?? "")} (${oneLine(String(o.tier_structure ?? ""), 90)})`),
      ...detail.products.map(
        (p) =>
          `- [${p.state}] ${p.sku} · ${p.name} (${p.format}) · ${p.listPriceText ?? moneyText(p.listPrice)}${p.problemSolved ? ` — ${oneLine(p.problemSolved, 80)}` : ""}`,
      ),
    ];
    return { text: lines.join("\n"), data: { project: detail.slug, offers, products: detail.products } };
  }

  if (action === "acquisition") {
    const lines = [
      `project ${detail.slug} · avatars (${detail.avatars.length}) & channels (${detail.acquisitionChannels.length})`,
      ...detail.avatars.map((a) => `- [avatar] ${a.avatarId} (${a.label}): ${oneLine(a.who, 100)}${a.bleedingNeckPain ? ` | pain: ${oneLine(a.bleedingNeckPain, 90)}` : ""}`),
      ...detail.acquisitionChannels.map(
        (c) =>
          `- [${c.state}] ${c.channelId} (${c.channel}): ${oneLine(c.howWeGetClients, 120)}${c.maxCacLimit !== null ? ` · max CAC ${moneyText(c.maxCacLimit)}` : ""}`,
      ),
    ];
    return {
      text: lines.join("\n"),
      data: { project: detail.slug, avatars: detail.avatars, channels: detail.acquisitionChannels },
    };
  }

  throw new SpaceInputError(
    400,
    `unknown c02_project_lookup action '${action}'; expected list | card | products | acquisition | readiness | where | detect`,
  );
}
