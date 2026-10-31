import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderKanban, Sparkles, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import {
  MAX_OUTCOMES,
  MAX_ROADMAP,
  SPACE_LEVELS,
  type GoalStatus,
  type SpaceGoal,
  type SpaceLevel,
} from "../../../shared/space";
import { LEVEL_STYLE } from "./space-levels";
import {
  createGoal,
  deleteGoal,
  detectC02Project,
  fetchC02Projects,
  updateGoal,
  type C02DetectResult,
  type C02ProjectSummaryItem,
} from "./space-api";

const FIELD = "w-full rounded-lg border border-hairline/60 bg-app px-3 py-2 text-[13px] text-ink outline-none focus:border-accent/60";
const LABEL = "mb-1 block text-[12px] font-medium text-ink-secondary";

export function GoalEditor({
  goal,
  level,
  at,
  initialProjects = [],
  defaultProjectSlug,
  onClose,
  onSaved,
}: {
  goal?: SpaceGoal;
  level?: SpaceLevel;
  at?: { x: number; y: number };
  initialProjects?: readonly C02ProjectSummaryItem[];
  defaultProjectSlug?: string;
  onClose(): void;
  onSaved(): void;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [goalLine, setGoalLine] = useState(goal?.goal ?? "");
  const [spaceLevel, setSpaceLevel] = useState<SpaceLevel>(goal?.level ?? level ?? "general");
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? "active");
  const [projectSlug, setProjectSlug] = useState<string>(goal?.projectSlug ?? defaultProjectSlug ?? "");
  const [manualProjectOverride, setManualProjectOverride] = useState<boolean>(Boolean(goal?.projectSlug));
  const [jobPath, setJobPath] = useState<string>(goal?.jobPath ?? "");
  const [detected, setDetected] = useState<C02DetectResult | null>(null);
  const [projects, setProjects] = useState<C02ProjectSummaryItem[]>([...initialProjects]);
  const [outcomes, setOutcomes] = useState(() =>
    Array.from({ length: MAX_OUTCOMES }, (_, index) => ({
      text: goal?.outcomes[index]?.text ?? "",
      done: goal?.outcomes[index]?.done ?? false,
    })),
  );
  const [roadmap, setRoadmap] = useState((goal?.roadmap ?? []).join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>("input")?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    if (initialProjects.length > 0) {
      setProjects([...initialProjects]);
      return;
    }
    let cancelled = false;
    void fetchC02Projects()
      .then((res) => {
        if (!cancelled && Array.isArray(res?.projects)) setProjects(res.projects);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialProjects]);

  useEffect(() => {
    const target = jobPath.trim();
    if (!target) {
      setDetected(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void detectC02Project(target)
        .then((res) => {
          if (cancelled || !res) return;
          if (res.matched && res.slug && res.slug !== "uncategorized") {
            setDetected(res);
            if (!manualProjectOverride) {
              setProjectSlug(res.slug);
            }
          } else {
            setDetected(null);
          }
        })
        .catch(() => {});
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [jobPath, manualProjectOverride]);

  const run = async (work: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      await work();
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  const save = () => {
    if (!title.trim() || saving) return;
    const trimmedProject = projectSlug.trim();
    const trimmedJobPath = jobPath.trim();
    const common = {
      title: title.trim(),
      goal: goalLine.trim(),
      level: spaceLevel,
      status,
      outcomes: outcomes
        .filter((outcome) => outcome.text.trim())
        .map((outcome) => ({ text: outcome.text.trim(), done: outcome.done })),
      roadmap: roadmap
        .split("\n")
        .map((step) => step.trim())
        .filter(Boolean)
        .slice(0, MAX_ROADMAP),
    };
    void run(() =>
      goal
        ? updateGoal(goal.id, {
            ...common,
            ...(trimmedJobPath !== (goal.jobPath ?? "") ? { jobPath: trimmedJobPath } : {}),
            ...(trimmedProject !== (goal.projectSlug ?? "")
              ? { projectSlug: trimmedProject || null }
              : {}),
          })
        : createGoal({
            ...common,
            ...(trimmedJobPath ? { jobPath: trimmedJobPath } : {}),
            ...(trimmedProject ? { projectSlug: trimmedProject } : {}),
            ...(at ? { layout: { x: at.x, y: at.y, w: 276, h: 194 } } : {}),
          }),
    );
  };

  const choice = <T extends string>(value: T, current: T, set: (next: T) => void, label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={value === current}
      onClick={() => set(value)}
      className={cn(
        "rounded-md px-2.5 py-1 text-[12px] font-medium",
        value === current ? "bg-panel text-ink shadow-sm" : "text-ink-secondary hover:text-ink",
      )}
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-editor-title"
        className="max-h-[90vh] w-full max-w-[500px] overflow-y-auto rounded-2xl border border-hairline/50 bg-panel p-5 text-ink shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !saving) {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="goal-editor-title" className="text-[15px] font-semibold">
            {goal ? t("quest.editor.editTitle") : t("quest.editor.newTitle")}
          </h2>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="rounded p-1 text-ink-secondary hover:bg-control hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label className="block">
            <span className={LABEL}>{t("quest.editor.name")}</span>
            <input
              className={FIELD}
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("quest.editor.namePlaceholder")}
            />
          </label>
          <label className="block">
            <span className={LABEL}>{t("quest.editor.goal")}</span>
            <input
              className={FIELD}
              value={goalLine}
              maxLength={240}
              onChange={(event) => setGoalLine(event.target.value)}
              placeholder={t("quest.editor.goalPlaceholder")}
            />
          </label>

          {/* C02 Project Selection + Live Workspace/Job Auto-Detect */}
          <div className="grid gap-2.5 rounded-xl border border-hairline/40 bg-app/50 p-3 sm:grid-cols-2">
            <label className="block">
              <span className={cn(LABEL, "flex items-center gap-1")}>
                <FolderKanban size={12} className="text-emerald-400" /> C02 Business Project
              </span>
              <select
                aria-label="C02 Business Project"
                data-goal-c02-select
                className={FIELD}
                value={projectSlug}
                onChange={(event) => {
                  setProjectSlug(event.target.value);
                  setManualProjectOverride(Boolean(event.target.value));
                }}
              >
                <option value="">None (Unbound)</option>
                {projects.map((proj) => (
                  <option key={proj.slug} value={proj.slug}>
                    {proj.readinessBadge} {proj.title} ({proj.readinessScore})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={LABEL}>Workspace / C01 Job Path</span>
              <input
                aria-label="Workspace or C01 Job Path"
                data-goal-job-path
                className={FIELD}
                value={jobPath}
                maxLength={400}
                onChange={(event) => {
                  setJobPath(event.target.value);
                  if (!event.target.value.trim() && !goal?.projectSlug) {
                    setDetected(null);
                  }
                }}
                placeholder="C01__work_board/surge__vsl"
              />
            </label>

            {detected && (
              <div
                data-goal-c02-detected
                className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 sm:col-span-2"
              >
                <span className="inline-flex items-center gap-1">
                  <Sparkles size={11} />
                  Auto-detected C02 project: <strong>{detected.title}</strong> ({detected.matchedBy})
                </span>
                {projectSlug !== detected.slug && (
                  <button
                    type="button"
                    onClick={() => {
                      setProjectSlug(detected.slug);
                      setManualProjectOverride(false);
                    }}
                    className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-semibold hover:bg-emerald-500/30"
                  >
                    Use {detected.slug}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <div role="group" aria-label={t("quest.editor.level")} className="flex flex-wrap items-center gap-0.5 rounded-lg bg-control p-0.5">
              {SPACE_LEVELS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={value === spaceLevel}
                  onClick={() => setSpaceLevel(value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium",
                    value === spaceLevel ? "bg-panel text-ink shadow-sm" : "text-ink-secondary hover:text-ink",
                  )}
                >
                  <span aria-hidden="true" className={cn("size-2 rounded-full", LEVEL_STYLE[value].dot)} />
                  {t(LEVEL_STYLE[value].label)}
                </button>
              ))}
            </div>
            <div role="group" aria-label={t("quest.editor.status")} className="flex items-center gap-0.5 rounded-lg bg-control p-0.5">
              {choice<GoalStatus>("active", status, setStatus, t("quest.status.active"))}
              {choice<GoalStatus>("parked", status, setStatus, t("quest.status.parked"))}
              {choice<GoalStatus>("done", status, setStatus, t("quest.status.done"))}
            </div>
          </div>
          <fieldset>
            <legend className={LABEL}>{t("quest.editor.outcomes")}</legend>
            <div className="space-y-2">
              {outcomes.map((outcome, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={outcome.done}
                    aria-label={t("quest.editor.outcomeDone", { n: index + 1 })}
                    onChange={(event) =>
                      setOutcomes((previous) =>
                        previous.map((item, atIndex) => (atIndex === index ? { ...item, done: event.target.checked } : item)),
                      )
                    }
                  />
                  <input
                    className={FIELD}
                    aria-label={t("quest.editor.outcome", { n: index + 1 })}
                    placeholder={t("quest.editor.outcomePlaceholder")}
                    value={outcome.text}
                    maxLength={160}
                    onChange={(event) =>
                      setOutcomes((previous) =>
                        previous.map((item, atIndex) => (atIndex === index ? { ...item, text: event.target.value } : item)),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className={LABEL}>{t("quest.editor.roadmap")}</span>
            <textarea
              className={cn(FIELD, "min-h-[84px] resize-y")}
              value={roadmap}
              onChange={(event) => setRoadmap(event.target.value)}
              placeholder={t("quest.editor.roadmapPlaceholder")}
            />
          </label>
          {error && (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {error}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            {goal ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void run(() => deleteGoal(goal.id))}
                className="rounded-lg px-3 py-2 text-[12px] font-medium text-danger hover:bg-danger/10"
              >
                {t("quest.editor.delete")}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-[12px] font-medium text-ink-secondary hover:bg-control">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={saving || !title.trim()} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50">
                {t("quest.editor.save")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
