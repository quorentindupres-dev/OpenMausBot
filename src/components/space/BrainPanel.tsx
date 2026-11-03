import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Brain, X } from "lucide-react";

interface BrainCounts {
  skills: number;
  workflows: number;
  thinking: number;
  thinking_db: number;
  formulas: number;
  rules: number;
}

interface BrainRole {
  id: string;
  name: string;
  kind: string;
  group: string;
  tier: string;
  mission: string;
  counts: BrainCounts;
}

interface BrainIndex {
  built_at: string;
  count: number;
  roles: BrainRole[];
}

interface BrainAgent {
  id: string;
  name: string;
  kind: string;
  group: string;
  tier: string;
  mission: string;
  north_star: string;
  framework: Record<string, unknown>;
  skills: Array<{ label?: string; what?: string; id?: string }>;
  workflows: Array<{ id?: string; label?: string; what?: string; data?: { stages?: Array<{ id?: string; gate?: string; steps?: unknown }> } | null }>;
  thinking: Array<{ label?: string; what?: string; kind?: string; data?: { question?: string; name?: string } | null }>;
  db: {
    thinking: Array<{ question?: string; kind?: string; model_slug?: string; source_file?: string }>;
    rules: Array<{ rule?: string; severity?: string; verify_cmd_or_check?: string }>;
    formulas: Array<{ name?: string; expression?: string; when_to_use?: string; category?: string }>;
    workflows: Array<{ workflow_slug?: string; title?: string; goal?: string }>;
    dbs: Array<Record<string, unknown>>;
  };
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
        {title}
        {count !== undefined && <span className="rounded-full bg-hairline/40 px-1.5 text-[10px] tabular-nums">{count}</span>}
      </h3>
      <div className="mt-2 space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-hairline/40 bg-panel/50 px-2.5 py-2">
      <div className="text-[12px] font-medium text-ink">{title}</div>
      {detail && <div className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">{detail}</div>}
    </div>
  );
}

/** The agent's own brain, in the app: process, mental models, skills, rules. */
export function BrainPanel({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState<BrainIndex | null>(null);
  const [roleId, setRoleId] = useState<string>("");
  const [agent, setAgent] = useState<BrainAgent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/space/brain")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`brain index: ${res.status}`))))
      .then((data: BrainIndex) => {
        if (cancelled) return;
        setError(null);
        setIndex(data);
        setRoleId((current) => current || data.roles[0]?.id || "");
      })
      .catch((cause: unknown) => !cancelled && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!roleId) return;
    let cancelled = false;
    setAgent(null);
    void fetch(`/api/space/brain/${encodeURIComponent(roleId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`brain ${roleId}: ${res.status}`))))
      .then((data: { agent: BrainAgent }) => {
        if (cancelled) return;
        setError(null);
        setAgent(data.agent);
      })
      .catch((cause: unknown) => !cancelled && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      cancelled = true;
    };
  }, [roleId]);

  // team.db compiles the same thinking files agent.json lists: show each model once.
  const models = useMemo(() => {
    const byKey = new Map<string, { title: string; detail: string }>();
    for (const model of agent?.db.thinking ?? []) {
      const title = model.question || model.model_slug || "model";
      byKey.set(title.trim().toLowerCase(), { title, detail: [model.kind, model.source_file].filter(Boolean).join(" · ") });
    }
    for (const model of agent?.thinking ?? []) {
      const title = model.data?.question || model.label || "thinking file";
      const key = title.trim().toLowerCase();
      if (byKey.has(key)) continue;
      byKey.set(key, { title, detail: [model.kind, model.what].filter(Boolean).join(" · ") });
    }
    return [...byKey.values()];
  }, [agent]);

  const groups = useMemo(() => {
    const map = new Map<string, BrainRole[]>();
    for (const role of index?.roles ?? []) {
      const list = map.get(role.group || "other") ?? [];
      list.push(role);
      map.set(role.group || "other", list);
    }
    return [...map.entries()];
  }, [index]);

  return (
    <aside
      aria-label="Agent brain"
      data-agent-brain
      className="absolute inset-y-0 right-0 z-40 flex w-[760px] max-w-full flex-col border-l border-hairline/50 bg-app/95 shadow-2xl backdrop-blur"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-hairline/40 px-4 py-3">
        <Brain size={15} className="text-violet-300" />
        <div className="text-[13px] font-semibold">Agent brain</div>
        <span className="text-[11px] text-ink-secondary">{index ? `${index.count} agents` : "loading…"}</span>
        <button type="button" aria-label="Close" onClick={onClose} className="ml-auto rounded p-1 text-ink-secondary hover:bg-control">
          <X size={16} />
        </button>
      </header>

      {error && <div className="border-b border-danger/20 bg-danger/10 px-4 py-2 text-[12px] text-danger">{error}</div>}

      <div className="flex min-h-0 flex-1">
        <nav className="w-[210px] shrink-0 overflow-y-auto border-r border-hairline/40 p-2">
          {groups.map(([group, roles]) => (
            <div key={group} className="mb-2">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{group}</div>
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setRoleId(role.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] ${
                    role.id === roleId ? "bg-control text-ink" : "text-ink-secondary hover:bg-control/60 hover:text-ink"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{role.name}</span>
                  {role.kind === "mini" && <span className="text-[9px] uppercase text-ink-secondary/70">mini</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {!agent ? (
            <div className="text-[12px] text-ink-secondary">Select an agent.</div>
          ) : (
            <>
              <div className="text-[15px] font-semibold">{agent.name}</div>
              <div className="text-[11px] text-ink-secondary">
                {agent.group || "—"} · {agent.kind} · {agent.tier || "—"}
              </div>
              {agent.mission && <p className="mt-2 text-[12px] leading-relaxed text-ink-secondary">{agent.mission}</p>}
              {agent.north_star && <p className="mt-1 text-[11px] italic text-ink-secondary">North star: {agent.north_star}</p>}

              <Section title="How it processes" count={agent.workflows.length}>
                {agent.workflows.map((flow) => (
                  <Row
                    key={flow.id ?? flow.label}
                    title={flow.label ?? flow.id ?? "workflow"}
                    detail={[
                      flow.what,
                      flow.data?.stages?.length ? `${flow.data.stages.length} stages: ${flow.data.stages.map((s) => s.id).filter(Boolean).join(" → ")}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
                {agent.workflows.length === 0 && <Row title="No workflows in the folder" />}
              </Section>

              <Section title="Mental models" count={models.length}>
                {models.map((model, i) => (
                  <Row key={`${model.title}-${i}`} title={model.title} detail={model.detail} />
                ))}
              </Section>

              <Section title="Skills" count={agent.skills.length}>
                {agent.skills.map((skill) => (
                  <Row key={skill.id ?? skill.label} title={skill.label ?? skill.id ?? "skill"} detail={skill.what} />
                ))}
                {agent.skills.length === 0 && <Row title="No skills pinned in agent.json" />}
              </Section>

              <Section title="Rules" count={agent.db.rules.length}>
                {agent.db.rules.map((rule, i) => (
                  <Row key={`${rule.rule}-${i}`} title={rule.rule ?? "rule"} detail={[rule.severity, rule.verify_cmd_or_check].filter(Boolean).join(" · ")} />
                ))}
              </Section>

              <Section title="Formulas" count={agent.db.formulas.length}>
                {agent.db.formulas.map((formula) => (
                  <Row key={formula.name} title={formula.name ?? "formula"} detail={[formula.expression, formula.when_to_use].filter(Boolean).join(" · ")} />
                ))}
              </Section>

              <Section title="Framework weights">
                {Object.entries(agent.framework ?? {})
                  .filter(([key]) => key === "weights")
                  .flatMap(([, value]) =>
                    Object.entries((value as Record<string, number>) ?? {}).map(([name, weight]) => (
                      <Row key={name} title={`${name} ${weight}`} />
                    )),
                  )}
                {agent.db.dbs.length > 0 && <Row title="Databases" detail={agent.db.dbs.map((db) => String(db.id ?? db.name ?? "")).filter(Boolean).join(" · ")} />}
              </Section>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
