import { useEffect, useState } from "react";
import { FolderKanban, Laptop, Users } from "lucide-react";
import type { BotCreationDraft } from "@/lib/bot-creation-draft";
import { cn } from "@/lib/cn";
import {
  AGENT_COMPUTER_PROVIDER_CATALOG,
  type AgentComputerProviderId,
} from "../../../shared/agent-computers";
import type { A01BindingMode } from "../../../shared/space";
import {
  bindBotA01Role,
  fetchA01Roles,
  fetchC02Projects,
  type A01RoleListItem,
  type C02ProjectSummaryItem,
} from "./space-api";

export interface PendingA01NewBotSelection {
  role: string;
  mode: A01BindingMode;
  projectSlug?: string;
  computerProvider?: AgentComputerProviderId;
}

const pendingDraftBindings = new WeakMap<BotCreationDraft, PendingA01NewBotSelection>();

export function setPendingA01DraftBinding(
  draft: BotCreationDraft,
  selection: PendingA01NewBotSelection | null,
): void {
  if (!selection || !selection.role.trim()) {
    pendingDraftBindings.delete(draft);
    return;
  }
  pendingDraftBindings.set(draft, selection);
}

export function getPendingA01DraftBinding(draft: BotCreationDraft): PendingA01NewBotSelection | undefined {
  return pendingDraftBindings.get(draft);
}

/**
 * Called by `NewBotDialog` right after `createConfiguredBot(draft)` succeeds.
 * Strictly a 0-ms no-op unless the user explicitly selected an A01 registered role in `A01NewBotSection`.
 */
export async function bindCreatedBotA01IfSelected(draft: BotCreationDraft, botId: string): Promise<void> {
  const pending = pendingDraftBindings.get(draft);
  if (!pending || !pending.role.trim()) return;
  await bindBotA01Role(botId, {
    role: pending.role,
    mode: pending.mode,
    ...(pending.projectSlug?.trim() ? { projectSlug: pending.projectSlug.trim() } : {}),
    ...(pending.computerProvider ? { computerProvider: pending.computerProvider } : {}),
  });
  pendingDraftBindings.delete(draft);
}

const SELECT_CLS =
  "mt-1 w-full rounded-lg border border-hairline/50 bg-inset px-3 py-2 text-[13px] text-ink outline-none focus:border-accent/60";

export function A01NewBotSection({ draft }: { draft: BotCreationDraft }) {
  const [roles, setRoles] = useState<A01RoleListItem[]>([]);
  const [projects, setProjects] = useState<C02ProjectSummaryItem[]>([]);
  const [role, setRole] = useState<string>(() => pendingDraftBindings.get(draft)?.role ?? "");
  const [mode, setMode] = useState<A01BindingMode>(() => pendingDraftBindings.get(draft)?.mode ?? "long-term");
  const [projectSlug, setProjectSlug] = useState<string>(() => pendingDraftBindings.get(draft)?.projectSlug ?? "");
  const [computerProvider, setComputerProvider] = useState<AgentComputerProviderId>(
    () => pendingDraftBindings.get(draft)?.computerProvider ?? "mac2-lume-vm",
  );
  const [lastAutoName, setLastAutoName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void fetchA01Roles()
      .then((res) => {
        if (!cancelled && Array.isArray(res?.roles)) setRoles(res.roles);
      })
      .catch(() => {});
    void fetchC02Projects()
      .then((res) => {
        if (!cancelled && Array.isArray(res?.projects)) setProjects(res.projects);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const syncPending = (
    nextRole: string,
    nextMode: A01BindingMode,
    nextProject: string,
    nextComputer: AgentComputerProviderId,
  ) => {
    if (!nextRole) {
      setPendingA01DraftBinding(draft, null);
      return;
    }
    setPendingA01DraftBinding(draft, {
      role: nextRole,
      mode: nextMode,
      ...(nextProject ? { projectSlug: nextProject } : {}),
      computerProvider: nextComputer,
    });
  };

  const handleRoleChange = (nextRole: string) => {
    setRole(nextRole);
    const found = roles.find((item) => item.id === nextRole);
    const nextMode: A01BindingMode = found?.kind === "mini" ? "temporary" : mode;
    if (found?.kind === "mini") setMode("temporary");
    syncPending(nextRole, nextMode, projectSlug, computerProvider);
    if (found) {
      const currentName = draft.bot.name.trim();
      if (!currentName || currentName === lastAutoName) {
        draft.patch({
          name: found.name,
          title: found.lookMeta.label || found.name,
          description: found.mission || found.lookMeta.tagline,
        });
        setLastAutoName(found.name);
      }
    }
  };

  const mainRoles = roles.filter((r) => r.kind === "main");
  const miniRoles = roles.filter((r) => r.kind === "mini");

  return (
    <div
      data-a01-new-bot-section
      className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-3.5 text-[13px]"
    >
      <label className="block text-ink-secondary">
        <span className="flex items-center gap-1.5 font-medium text-ink">
          <Users size={14} className="text-indigo-400" />
          A01 Standing Fleet Registration (team.db)
        </span>
        <select
          data-a01-role-select
          className={SELECT_CLS}
          value={role}
          onChange={(e) => handleRoleChange(e.target.value)}
        >
          <option value="">None — Custom standalone bot</option>
          {mainRoles.length > 0 && (
            <optgroup label={`S3 Main Employees (${mainRoles.length})`}>
              {mainRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.id})
                </option>
              ))}
            </optgroup>
          )}
          {miniRoles.length > 0 && (
            <optgroup label={`S2 Mini-Agents (${miniRoles.length})`}>
              {miniRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.id})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {role && (
        <div className="mt-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            {(["temporary", "long-term"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                data-a01-mode-btn={candidate}
                onClick={() => {
                  setMode(candidate);
                  syncPending(role, candidate, projectSlug, computerProvider);
                }}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors",
                  mode === candidate
                    ? "border-indigo-400 bg-indigo-500/20 text-ink"
                    : "border-hairline/50 bg-inset text-ink-secondary hover:text-ink",
                )}
              >
                {candidate === "long-term" ? "🧠 Long-Term Employee" : "⚡ Temporary Worker"}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-[12px] text-ink-secondary">
              <span className="flex items-center gap-1">
                <FolderKanban size={12} className="text-emerald-400" /> C02 Project
              </span>
              <select
                data-a01-project-select
                className={SELECT_CLS}
                value={projectSlug}
                onChange={(e) => {
                  setProjectSlug(e.target.value);
                  syncPending(role, mode, e.target.value, computerProvider);
                }}
              >
                <option value="">Unbound</option>
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.readinessBadge} {p.title} ({p.readinessScore})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[12px] text-ink-secondary">
              <span className="flex items-center gap-1">
                <Laptop size={12} className="text-sky-400" /> Agent Computer
              </span>
              <select
                data-a01-computer-select
                className={SELECT_CLS}
                value={computerProvider}
                onChange={(e) => {
                  const next = e.target.value as AgentComputerProviderId;
                  setComputerProvider(next);
                  syncPending(role, mode, projectSlug, next);
                }}
              >
                {AGENT_COMPUTER_PROVIDER_CATALOG.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.shortLabel}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
