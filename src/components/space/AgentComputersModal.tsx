import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Cpu, Eye, Laptop, Pause, Play, RefreshCw, Server, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  AGENT_COMPUTER_PROVIDER_CATALOG,
  type AgentComputerProviderId,
  type ComputerLease,
  type ProviderStatusWithCatalog,
} from "../../../shared/agent-computers";
import {
  fetchSpaceComputers,
  patchSpaceComputersConfig,
  previewSpaceComputer,
  releaseSpaceComputer,
  type SpaceComputerPreview,
  type SpaceComputersSnapshot,
} from "./space-api";

export const MAC2_SETUP_COMMAND = "./scripts/setup-agent-mac.sh --install --init-vm-pool";

const FIELD = "w-full rounded-lg border border-hairline/60 bg-app px-3 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent/60";
const LABEL = "mb-1 block text-[11px] font-medium text-ink-secondary";

function availabilityBadge(state: string | undefined, available: boolean | undefined): {
  dot: string;
  label: string;
  pill: string;
} {
  if (available || state === "ready") {
    return {
      dot: "🟢",
      label: "Ready",
      pill: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    };
  }
  if (state === "host_offline" || state === "capacity_full" || state === "degraded") {
    return {
      dot: "🟠",
      label: state.replace(/_/g, " "),
      pill: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    };
  }
  return {
    dot: "⚪",
    label: (state ?? "not configured").replace(/_/g, " "),
    pill: "border-zinc-600/60 bg-zinc-800/70 text-zinc-300",
  };
}

export function AgentComputersModal({
  onClose,
  targetLabel,
  currentProvider,
  onSelectProvider,
  onChanged,
}: {
  onClose(): void;
  /** Optional label when switching a specific agent/node's computer. */
  targetLabel?: string;
  currentProvider?: string;
  onSelectProvider?: (provider: AgentComputerProviderId) => void | Promise<void>;
  onChanged?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<SpaceComputersSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [busyLeaseId, setBusyLeaseId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ leaseId: string; data: SpaceComputerPreview } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Mac #2 editable fields
  const [tailscaleHost, setTailscaleHost] = useState("");
  const [sshUser, setSshUser] = useState("");
  const [lumePort, setLumePort] = useState("7777");
  const [maxConcurrentVms, setMaxConcurrentVms] = useState("3");
  const [macosBaseImage, setMacosBaseImage] = useState("xlabs-macos-base");
  const [burstEnabled, setBurstEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await fetchSpaceComputers();
      setSnapshot(snap);
      if (snap?.mac2) {
        setTailscaleHost(snap.mac2.tailscaleHost ?? "");
        setSshUser(snap.mac2.sshUser ?? "");
        setLumePort(String(snap.mac2.lumePort ?? 7777));
        setMaxConcurrentVms(String(snap.mac2.maxConcurrentVms ?? 3));
        setMacosBaseImage(snap.mac2.macosBaseImage ?? "xlabs-macos-base");
      }
      if (snap?.burstPolicy) {
        setBurstEnabled(snap.burstPolicy.enabled !== false);
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const providers: ProviderStatusWithCatalog[] =
    snapshot?.providers && snapshot.providers.length > 0
      ? snapshot.providers
      : AGENT_COMPUTER_PROVIDER_CATALOG.map((catalog) => ({
          catalog,
          status: {
            provider: catalog.id,
            available: catalog.id === "local-cua-ax",
            state: catalog.id === "local-cua-ax" ? "ready" : "missing_credentials",
            reasonCode: catalog.id === "local-cua-ax" ? "ok" : "missing_credentials",
            message: catalog.recommendedFor,
            nextStep: null,
            activeLeases: 0,
            maxCapacity: catalog.concurrency.max,
            supportedOs: [...catalog.supportedOs],
            checkedAt: 0,
          },
        }));

  const leases: ComputerLease[] = snapshot?.leases ?? [];

  const handleSaveConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingConfig(true);
    setError(null);
    setNotice(null);
    try {
      const parsedPort = Number.parseInt(lumePort, 10);
      const parsedMaxVms = Number.parseInt(maxConcurrentVms, 10);
      const mac2Patch: Record<string, unknown> = {
        enabled: true,
        ...(tailscaleHost.trim() ? { tailscaleHost: tailscaleHost.trim() } : {}),
        ...(sshUser.trim() ? { sshUser: sshUser.trim() } : {}),
        ...(Number.isFinite(parsedPort) ? { lumePort: parsedPort } : {}),
        ...(Number.isFinite(parsedMaxVms) ? { maxConcurrentVms: parsedMaxVms } : {}),
        ...(macosBaseImage.trim() ? { macosBaseImage: macosBaseImage.trim() } : {}),
      };
      await patchSpaceComputersConfig({
        mac2: mac2Patch,
        burstPolicy: { enabled: burstEnabled },
      });
      setNotice("Saved 2nd Mac & Cloud Burst configuration.");
      await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard?.writeText(MAC2_SETUP_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRelease = async (leaseId: string, action: "close" | "pause" | "destroy") => {
    setBusyLeaseId(leaseId);
    setError(null);
    try {
      await releaseSpaceComputer(leaseId, action);
      await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyLeaseId(null);
    }
  };

  const handlePreview = async (leaseId: string) => {
    setBusyLeaseId(leaseId);
    setError(null);
    try {
      const res = await previewSpaceComputer(leaseId);
      if (res?.preview) setPreview({ leaseId, data: res.preview });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyLeaseId(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-agent-computers-modal
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agent Computers & 2nd Mac Pool"
        className="flex max-h-[92vh] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-hairline/50 bg-panel text-ink shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-hairline/40 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Server size={18} className="text-sky-400" />
            <div>
              <h2 className="text-[15px] font-semibold">
                {targetLabel ? `Switch Computer · ${targetLabel}` : "Agent Computers & 2nd Mac VM Pool"}
              </h2>
              <p className="text-[11.5px] text-ink-secondary">
                Isolated macOS Lume VMs on your 2nd Mac ($0/hr), local AX background driver, and elastic cloud burst
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Refresh computers"
              className="rounded-lg p-1.5 text-ink-secondary hover:bg-control hover:text-ink"
            >
              <RefreshCw size={15} className={cn(loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink-secondary hover:bg-control hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {error && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2 text-[12px] text-danger">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-[12px] text-emerald-300">
              {notice}
            </div>
          )}

          {/* 1. All 6 Providers Grid */}
          <section>
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-secondary">
                Computer Providers ({providers.length})
              </h3>
              <span className="text-[11px] text-ink-tertiary">
                Priority #1: 2nd Apple Silicon Mac Lume VM ($0/hr isolated desktop)
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {providers.map(({ catalog, status }) => {
                const badge = availabilityBadge(status.state, status.available);
                const isSelected = currentProvider === catalog.id;
                return (
                  <div
                    key={catalog.id}
                    data-computer-provider={catalog.id}
                    className={cn(
                      "flex flex-col justify-between gap-2 rounded-xl border p-3 transition-colors",
                      isSelected
                        ? "border-sky-400/70 bg-sky-500/10"
                        : "border-hairline/50 bg-app/70 hover:border-hairline",
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Laptop size={14} className="shrink-0 text-sky-400" />
                          <span className="text-[13px] font-semibold">{catalog.name}</span>
                        </div>
                        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", badge.pill)}>
                          {badge.dot} {badge.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-snug text-ink-secondary">{catalog.recommendedFor}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline/30 pt-2 text-[11px] text-ink-secondary">
                      <span>
                        <strong>{catalog.pricing.label}</strong> · {catalog.latencyMs.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10.5px]">
                          Leases: {status.activeLeases}/{status.maxCapacity}
                        </span>
                        {onSelectProvider && (
                          <button
                            type="button"
                            data-assign-computer={catalog.id}
                            onClick={() => void Promise.resolve(onSelectProvider(catalog.id)).then(() => onClose())}
                            className={cn(
                              "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                              isSelected
                                ? "bg-sky-500 text-white"
                                : "border border-sky-400/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25",
                            )}
                          >
                            {isSelected ? "Current" : "Use Computer"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 2. 2nd Mac Reset & Tailscale Provisioning Config */}
          <section className="rounded-xl border border-hairline/50 bg-app/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-semibold">2nd Mac Agent Host Setup (Tailscale + Cua Lume)</h3>
                <p className="text-[11.5px] text-ink-secondary">
                  Run the 1-line setup script on your reset 2nd Mac, then enter its Tailscale hostname or IP below.
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-hairline/60 bg-panel px-2.5 py-1 font-mono text-[11px]">
                <code className="select-all text-sky-300">{MAC2_SETUP_COMMAND}</code>
                <button
                  type="button"
                  data-copy-mac2-setup
                  onClick={() => void handleCopyCommand()}
                  className="inline-flex items-center gap-1 rounded bg-control px-2 py-0.5 font-sans text-[11px] font-medium text-ink hover:bg-raised-hover"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <form onSubmit={(e) => void handleSaveConfig(e)} className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className={LABEL}>2nd Mac Tailscale Hostname / IP</span>
                <input
                  data-mac2-host-input
                  className={FIELD}
                  value={tailscaleHost}
                  onChange={(e) => setTailscaleHost(e.target.value)}
                  placeholder="mac2.tailnet.ts.net or 100.64.0.2"
                />
              </label>
              <label className="block">
                <span className={LABEL}>SSH User</span>
                <input
                  data-mac2-ssh-user-input
                  className={FIELD}
                  value={sshUser}
                  onChange={(e) => setSshUser(e.target.value)}
                  placeholder="gregorio"
                />
              </label>
              <label className="block">
                <span className={LABEL}>Lume Daemon Port</span>
                <input
                  data-mac2-port-input
                  type="number"
                  min={1024}
                  max={65535}
                  className={FIELD}
                  value={lumePort}
                  onChange={(e) => setLumePort(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={LABEL}>Max Concurrent VMs (1–8)</span>
                <input
                  data-mac2-max-vms-input
                  type="number"
                  min={1}
                  max={8}
                  className={FIELD}
                  value={maxConcurrentVms}
                  onChange={(e) => setMaxConcurrentVms(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={LABEL}>Base macOS Golden VM</span>
                <input
                  className={FIELD}
                  value={macosBaseImage}
                  onChange={(e) => setMacosBaseImage(e.target.value)}
                  placeholder="xlabs-macos-base"
                />
              </label>
              <div className="flex items-end justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-[12px] text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={burstEnabled}
                    onChange={(e) => setBurstEnabled(e.target.checked)}
                    className="accent-accent"
                  />
                  Auto Cloud Burst when full
                </label>
                <button
                  type="submit"
                  data-save-mac2-config
                  disabled={savingConfig}
                  className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {savingConfig ? "Saving…" : "Save Host"}
                </button>
              </div>
            </form>
          </section>

          {/* 3. Active VM & Computer Leases */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-secondary">
              Active Computer Leases ({leases.length})
            </h3>
            {leases.length === 0 ? (
              <p className="rounded-xl border border-dashed border-hairline/50 px-4 py-3 text-[12px] text-ink-secondary">
                No active computer leases right now. Spawn or bind an A01 agent with a computer target to allocate a dedicated VM or AX session.
              </p>
            ) : (
              <div className="space-y-2">
                {leases.map((lease) => (
                  <div
                    key={lease.leaseId}
                    data-computer-lease={lease.leaseId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline/50 bg-app/70 px-3.5 py-2.5 text-[12px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Cpu size={14} className="text-indigo-400" />
                        <span className="font-semibold">{lease.instanceName}</span>
                        <span className="rounded bg-control px-1.5 py-0.5 font-mono text-[10.5px]">{lease.provider}</span>
                        <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10.5px] text-indigo-300">
                          {lease.mode === "long-term" ? "🧠 long-term" : "⚡ temporary"}
                        </span>
                        <span className="text-ink-secondary">
                          Agent: <strong>{lease.agentId}</strong>
                          {lease.project ? ` · C02: ${lease.project}` : ""}
                          {lease.guestIp ? ` · IP: ${lease.guestIp}` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyLeaseId === lease.leaseId}
                        onClick={() => void handlePreview(lease.leaseId)}
                        className="inline-flex items-center gap-1 rounded-md border border-hairline/60 bg-panel px-2 py-1 text-[11px] hover:bg-control"
                      >
                        <Eye size={12} /> Preview
                      </button>
                      {lease.mode === "long-term" && lease.state === "running" && (
                        <button
                          type="button"
                          disabled={busyLeaseId === lease.leaseId}
                          onClick={() => void handleRelease(lease.leaseId, "pause")}
                          className="inline-flex items-center gap-1 rounded-md border border-hairline/60 bg-panel px-2 py-1 text-[11px] hover:bg-control"
                        >
                          <Pause size={12} /> Pause
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyLeaseId === lease.leaseId}
                        onClick={() => void handleRelease(lease.leaseId, "close")}
                        className="inline-flex items-center gap-1 rounded-md border border-hairline/60 bg-panel px-2 py-1 text-[11px] hover:bg-control"
                      >
                        <Play size={12} /> Release
                      </button>
                      <button
                        type="button"
                        disabled={busyLeaseId === lease.leaseId}
                        onClick={() => void handleRelease(lease.leaseId, "destroy")}
                        className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[11px] text-danger hover:bg-danger/20"
                      >
                        <Trash2 size={12} /> Destroy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {preview && (
            <section className="rounded-xl border border-hairline/50 bg-app p-3">
              <div className="mb-2 flex items-center justify-between text-[12px]">
                <span className="font-semibold">Desktop Preview · {preview.leaseId}</span>
                <button type="button" onClick={() => setPreview(null)} className="text-ink-secondary hover:text-ink">
                  Close preview
                </button>
              </div>
              {typeof preview.data.dataBase64 === "string" && preview.data.dataBase64 ? (
                <img
                  src={`data:${preview.data.mimeType || "image/png"};base64,${preview.data.dataBase64}`}
                  alt="Agent computer preview"
                  className="max-h-72 rounded-lg border border-hairline/40 object-contain"
                />
              ) : (
                <pre className="overflow-x-auto text-[11px] text-ink-secondary">
                  {JSON.stringify(preview.data, null, 2)}
                </pre>
              )}
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
