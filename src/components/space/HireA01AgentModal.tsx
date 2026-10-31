import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FolderKanban, Laptop, Search, Sparkles, Users, X } from "lucide-react";
import {
  A01_ROLE_IDS,
  AGENT_ROLE_ACCESSORIES,
  MiniSpacewareSprite,
} from "@xlabs/space-canvas";
import { cn } from "@/lib/cn";
import {
  AGENT_COMPUTER_PROVIDER_CATALOG,
  type AgentComputerProviderId,
} from "../../../shared/agent-computers";
import type { A01BindingMode, SpaceGoal } from "../../../shared/space";
import {
  fetchA01RoleCard,
  fetchA01Roles,
  fetchC02Projects,
  hireA01Agent,
  type A01RoleCardBundle,
  type A01RoleListItem,
  type C02ProjectSummaryItem,
  type HireA01AgentResult,
} from "./space-api";
import { a01RoleToRoleId, roleIdToA01Role } from "./whiteboard-bridge";

const FIELD = "w-full rounded-lg border border-hairline/60 bg-app px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent/60";
const LABEL = "mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary";

function fallbackRolesFromCanvas(): A01RoleListItem[] {
  return A01_ROLE_IDS.filter((id) => id !== "agent").map((roleId) => {
    const meta = AGENT_ROLE_ACCESSORIES[roleId];
    const dbRole = roleIdToA01Role(roleId);
    return {
      id: dbRole,
      name: meta.label,
      group: meta.group,
      look: roleId,
      lookMeta: {
        key: roleId,
        label: meta.label,
        accessory: meta.accessory,
        layer: meta.layer,
        accent: meta.accent,
        archetype: meta.archetype,
        tagline: meta.tagline,
        badge: "AI employee",
      },
      kind: "main",
      defaultTier: roleId === "ea" || roleId === "coo" ? "steward" : "specialist",
      parentRole: "",
      openmausId: roleId,
      mission: meta.tagline,
      northStar: "",
      formulaCount: 0,
      ruleCount: 0,
      workflowCount: meta.workflowsCount,
      dbRefs: [],
    };
  });
}

export function HireA01AgentModal({
  goals,
  initialProjects = [],
  defaultProjectSlug,
  defaultGoalId,
  onClose,
  onHired,
}: {
  goals: readonly SpaceGoal[];
  initialProjects?: readonly C02ProjectSummaryItem[];
  defaultProjectSlug?: string;
  defaultGoalId?: string;
  onClose(): void;
  onHired(result: HireA01AgentResult): void;
}) {
  const [roles, setRoles] = useState<A01RoleListItem[]>(fallbackRolesFromCanvas);
  const [projects, setProjects] = useState<C02ProjectSummaryItem[]>([...initialProjects]);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "main" | "mini">("all");
  const [selectedRole, setSelectedRole] = useState<string>("EA");
  const [mode, setMode] = useState<A01BindingMode>("long-term");
  const [projectSlug, setProjectSlug] = useState<string>(defaultProjectSlug || initialProjects[0]?.slug || "surge");
  const [computerProvider, setComputerProvider] = useState<AgentComputerProviderId>("mac2-lume-vm");
  const [goalId, setGoalId] = useState<string>(defaultGoalId ?? "");
  const [customName, setCustomName] = useState("");
  const [cardPreview, setCardPreview] = useState<A01RoleCardBundle | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchA01Roles()
      .then((res) => {
        if (!cancelled && Array.isArray(res?.roles) && res.roles.length > 0) {
          setRoles(res.roles);
          if (!res.roles.some((r) => r.id === selectedRole)) {
            setSelectedRole(res.roles[0]!.id);
          }
        }
      })
      .catch(() => {});
    if (initialProjects.length === 0) {
      void fetchC02Projects()
        .then((res) => {
          if (!cancelled && Array.isArray(res?.projects) && res.projects.length > 0) {
            setProjects(res.projects);
            setProjectSlug((prev) => prev || res.projects[0]!.slug);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [initialProjects.length, selectedRole]);

  const activeRoleItem = useMemo(
    () => roles.find((r) => r.id === selectedRole) ?? roles[0],
    [roles, selectedRole],
  );

  useEffect(() => {
    if (!activeRoleItem) return;
    let cancelled = false;
    void fetchA01RoleCard(activeRoleItem.id, mode, projectSlug || undefined)
      .then((res) => {
        if (!cancelled && res?.card) setCardPreview(res.card);
      })
      .catch(() => {
        if (!cancelled) setCardPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRoleItem, mode, projectSlug]);

  const filteredRoles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roles.filter((role) => {
      if (kindFilter !== "all" && role.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        role.id.toLowerCase().includes(q) ||
        role.name.toLowerCase().includes(q) ||
        role.mission.toLowerCase().includes(q) ||
        role.lookMeta.tagline.toLowerCase().includes(q)
      );
    });
  }, [kindFilter, query, roles]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeRoleItem || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const idx = goals.length;
      const result = await hireA01Agent({
        role: activeRoleItem.id,
        mode,
        ...(projectSlug ? { projectSlug } : {}),
        computerProvider,
        ...(customName.trim() ? { name: customName.trim() } : {}),
        fallbackTitle: activeRoleItem.name,
        fallbackTagline: activeRoleItem.mission || activeRoleItem.lookMeta.tagline,
        ...(goalId ? { goalId } : {}),
        layout: {
          x: 240 + ((idx * 36) % 240),
          y: 180 + ((idx * 28) % 180),
          w: 312,
          h: 184,
        },
      });
      onHired(result);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-hire-a01-modal
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hire Registered A01 Agent"
        className="flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-hairline/50 bg-panel text-ink shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !submitting) {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-hairline/40 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Users size={18} className="text-indigo-400" />
            <div>
              <h2 className="text-[15px] font-semibold">Hire Registered A01 Agent</h2>
              <p className="text-[11.5px] text-ink-secondary">
                Strictly backed by A01__team/team.db ({roles.filter((r) => r.kind === "main").length} S3 Employees ·{" "}
                {roles.filter((r) => r.kind === "mini").length} S2 Mini-Agents)
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-secondary hover:bg-control hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Left column: Registered A01 Role Roster */}
          <div className="flex w-full shrink-0 flex-col border-b border-hairline/40 p-3.5 sm:w-[310px] sm:border-b-0 sm:border-r">
            <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-hairline/60 bg-app px-2.5 py-1.5">
              <Search size={13} className="text-ink-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search A01 roles…"
                className="w-full bg-transparent text-[12px] outline-none placeholder:text-ink-tertiary"
              />
            </div>
            <div className="mb-2 flex gap-1">
              {(["all", "main", "mini"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium",
                    kindFilter === k ? "bg-indigo-500 text-white" : "bg-control text-ink-secondary hover:text-ink",
                  )}
                >
                  {k === "all" ? `All (${roles.length})` : k === "main" ? "S3 Employees" : "S2 Mini-Agents"}
                </button>
              ))}
            </div>
            <div className="max-h-56 flex-1 space-y-1 overflow-y-auto pr-1 sm:max-h-none">
              {filteredRoles.map((role) => {
                const spriteRole = a01RoleToRoleId(role.look || role.id, roles);
                const selected = role.id === activeRoleItem?.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    data-hire-role-option={role.id}
                    onClick={() => {
                      setSelectedRole(role.id);
                      if (role.kind === "mini") setMode("temporary");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition-colors",
                      selected
                        ? "border-indigo-400/70 bg-indigo-500/15"
                        : "border-hairline/40 bg-app/50 hover:border-hairline",
                    )}
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline/50 bg-panel">
                      <MiniSpacewareSprite role={spriteRole} awake size={24} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold">{role.name}</span>
                        <span className="shrink-0 rounded bg-control px-1 py-0.2 text-[9.5px] font-medium text-ink-secondary">
                          {role.kind === "main" ? "S3" : "S2"}
                        </span>
                      </div>
                      <p className="truncate text-[10.5px] text-ink-secondary">
                        {role.mission || role.lookMeta.tagline}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right column: Mode + C02 Project + Computer Target + Card Summary */}
          <div className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto p-4 sm:p-5">
            <div className="space-y-4">
              {activeRoleItem && (
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold">
                      {activeRoleItem.name} <span className="font-mono text-[11px] text-indigo-300">({activeRoleItem.id})</span>
                    </span>
                    <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10.5px] font-semibold text-indigo-200">
                      {cardPreview
                        ? `${cardPreview.formulas.length} formulas · ${cardPreview.rules.length} rules · ${cardPreview.workflows.length} workflows`
                        : `${activeRoleItem.formulaCount} formulas · ${activeRoleItem.ruleCount} rules`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-ink-secondary">
                    {cardPreview?.mission || activeRoleItem.mission || activeRoleItem.lookMeta.tagline}
                  </p>
                </div>
              )}

              <div>
                <div className={LABEL}>1 · Lifecycle Mode</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-hire-mode="temporary"
                    onClick={() => setMode("temporary")}
                    className={cn(
                      "rounded-xl border p-2.5 text-left transition-colors",
                      mode === "temporary"
                        ? "border-amber-400/70 bg-amber-500/15"
                        : "border-hairline/50 bg-app/60 hover:border-hairline",
                    )}
                  >
                    <div className="text-[12px] font-semibold">⚡ Temporary Worker</div>
                    <div className="mt-0.5 text-[10.5px] text-ink-secondary">
                      Ephemeral C01 job log only · fresh VM wiped on close
                    </div>
                  </button>
                  <button
                    type="button"
                    data-hire-mode="long-term"
                    disabled={activeRoleItem?.kind === "mini"}
                    onClick={() => setMode("long-term")}
                    className={cn(
                      "rounded-xl border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      mode === "long-term"
                        ? "border-violet-400/70 bg-violet-500/15"
                        : "border-hairline/50 bg-app/60 hover:border-hairline",
                    )}
                  >
                    <div className="text-[12px] font-semibold">🧠 Long-Term Employee</div>
                    <div className="mt-0.5 text-[10.5px] text-ink-secondary">
                      Binds fleet.db Hindsight memory + persistent named VM
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>
                    <FolderKanban size={12} className="text-emerald-400" /> 2 · Bound C02 Project
                  </span>
                  <select
                    data-hire-project-select
                    className={FIELD}
                    value={projectSlug}
                    onChange={(e) => setProjectSlug(e.target.value)}
                  >
                    <option value="">No project (unbound)</option>
                    {projects.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.readinessBadge} {p.title} ({p.readinessScore})
                      </option>
                    ))}
                    {projects.length === 0 && (
                      <>
                        <option value="surge">🟢 Surge (7/7)</option>
                        <option value="precision-peptide">🟠 Precision Peptide (6/7)</option>
                        <option value="x-labs">🟢 X-Labs (3/3)</option>
                      </>
                    )}
                  </select>
                </label>

                <label className="block">
                  <span className={LABEL}>
                    <Laptop size={12} className="text-sky-400" /> 3 · Agent Computer Target
                  </span>
                  <select
                    data-hire-computer-select
                    className={FIELD}
                    value={computerProvider}
                    onChange={(e) => setComputerProvider(e.target.value as AgentComputerProviderId)}
                  >
                    {AGENT_COMPUTER_PROVIDER_CATALOG.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.shortLabel} — {c.pricing.freeLocal ? "$0/hr" : c.pricing.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>4 · Place in Space (Optional)</span>
                  <select className={FIELD} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                    <option value="">Whiteboard Canvas + Bench</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        [{g.level}] {g.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={LABEL}>5 · Agent Display Name (Optional)</span>
                  <input
                    data-hire-agent-name
                    className={FIELD}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={activeRoleItem?.name || "Defaults to A01 role name"}
                  />
                </label>
              </div>

              {error && (
                <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
                  {error}
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-hairline/40 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3.5 py-2 text-[12px] font-medium text-ink-secondary hover:bg-control"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-confirm-hire-a01
                disabled={submitting || !activeRoleItem}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                <Sparkles size={14} />
                {submitting ? "Hiring & Binding…" : "Hire & Spawn on Whiteboard"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
