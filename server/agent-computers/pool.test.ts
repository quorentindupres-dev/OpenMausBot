import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_COMPUTER_PROVIDER_CATALOG,
  buildAgentComputerName,
} from "../../shared/agent-computers.ts";
import { createDesktopComputer, DESKTOP_COMPUTER_GRANT } from "../desktop-computer.ts";
import { SharedComputers } from "../shared-computers.ts";
import {
  AgentComputerError,
  AgentComputerPool,
  AgentComputerStore,
  OrgoProvider,
  type AgentComputerRuntimeSettings,
  type FetchLike,
  type ShellCommandRunner,
} from "./index.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SETUP_SCRIPT = join(REPO_ROOT, "scripts", "setup-agent-mac.sh");

function emptySettings(overrides: Partial<AgentComputerRuntimeSettings> = {}): AgentComputerRuntimeSettings {
  return {
    cuaApiKey: null,
    cuaApiBaseUrl: "https://api.cua.ai/v1",
    daytonaApiKey: null,
    daytonaApiBaseUrl: "https://app.daytona.io/api",
    orgoApiKey: null,
    orgoApiBaseUrl: "https://www.orgo.ai/api",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface FakeLumeVm {
  name: string;
  os: "macos" | "linux";
  status: "running" | "stopped";
  ipAddress: string | null;
  vncUrl: string | null;
}

function createFakeLumeServer(initialVms: FakeLumeVm[] = []) {
  const vms = new Map<string, FakeLumeVm>(initialVms.map((vm) => [vm.name, { ...vm }]));
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  let ipCounter = 20;

  const handleRequest = (method: string, path: string, body: unknown): Response => {
    calls.push({ method, path, body });

    if (method === "GET" && path === "/lume/vms") {
      return jsonResponse([...vms.values()]);
    }

    if (method === "POST" && path === "/lume/vms/clone") {
      const payload = body as { name?: string; newName?: string };
      const source = payload.name ? vms.get(payload.name) : undefined;
      if (!source || !payload.newName) {
        return jsonResponse({ error: "base image missing" }, 404);
      }
      vms.set(payload.newName, {
        name: payload.newName,
        os: source.os,
        status: "stopped",
        ipAddress: null,
        vncUrl: null,
      });
      return jsonResponse({ ok: true }, 201);
    }

    const runMatch = path.match(/^\/lume\/vms\/([^/]+)\/run$/);
    if (method === "POST" && runMatch) {
      const name = decodeURIComponent(runMatch[1]!);
      const vm = vms.get(name);
      if (!vm) return jsonResponse({ error: "not found" }, 404);
      ipCounter += 1;
      vm.status = "running";
      vm.ipAddress = vm.ipAddress ?? `192.168.64.${ipCounter}`;
      vm.vncUrl = `vnc://127.0.0.1:${5900 + ipCounter}`;
      return jsonResponse({ ok: true });
    }

    const stopMatch = path.match(/^\/lume\/vms\/([^/]+)\/stop$/);
    if (method === "POST" && stopMatch) {
      const name = decodeURIComponent(stopMatch[1]!);
      const vm = vms.get(name);
      if (!vm) return jsonResponse({ error: "not found" }, 404);
      vm.status = "stopped";
      return jsonResponse({ ok: true });
    }

    const vmMatch = path.match(/^\/lume\/vms\/([^/]+)$/);
    if (vmMatch) {
      const name = decodeURIComponent(vmMatch[1]!);
      if (method === "GET") {
        const vm = vms.get(name);
        return vm ? jsonResponse(vm) : jsonResponse({ error: "not found" }, 404);
      }
      if (method === "PATCH") {
        const vm = vms.get(name);
        return vm ? jsonResponse(vm) : jsonResponse({ error: "not found" }, 404);
      }
      if (method === "DELETE") {
        const existed = vms.delete(name);
        return existed ? jsonResponse({ ok: true }) : jsonResponse({ error: "not found" }, 404);
      }
    }

    return jsonResponse({ error: `Unhandled route ${method} ${path}` }, 404);
  };

  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = (init?.method ?? "GET").toUpperCase();
    const rawBody = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    return handleRequest(method, url.pathname, rawBody);
  };

  return { vms, calls, handleRequest, fetchImpl };
}

describe("AgentComputerPool & Cua.ai providers", () => {
  let tempDir: string;
  let store: AgentComputerStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "omb-agent-computers-"));
    store = new AgentComputerStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("ranks mac2-lume-vm #1 in catalog and reports actionable missing_credentials / missing_api_key diagnostics", async () => {
    expect(AGENT_COMPUTER_PROVIDER_CATALOG[0]?.id).toBe("mac2-lume-vm");
    expect(AGENT_COMPUTER_PROVIDER_CATALOG.map((item) => item.id)).toEqual([
      "mac2-lume-vm",
      "local-cua-ax",
      "mac2-shared",
      "cua-cloud",
      "daytona",
      "orgo",
    ]);

    const ungrantedDesktop = createDesktopComputer({ platform: "darwin" });
    const pool = new AgentComputerPool({
      store,
      desktop: ungrantedDesktop,
      platform: "darwin",
      getSettings: () => emptySettings(),
      lumeReadyPollDelaysMs: [0],
    });

    const statuses = await pool.listProvidersWithStatus();
    expect(statuses).toHaveLength(6);

    const byId = new Map(statuses.map((entry) => [entry.catalog.id, entry.status]));

    expect(byId.get("mac2-lume-vm")).toMatchObject({
      available: false,
      state: "missing_credentials",
      reasonCode: "missing_credentials",
    });
    expect(byId.get("mac2-lume-vm")?.nextStep).toContain("setup-agent-mac.sh");

    expect(byId.get("local-cua-ax")).toMatchObject({
      available: false,
      state: "host_offline",
      reasonCode: "desktop_not_granted",
    });

    expect(byId.get("mac2-shared")).toMatchObject({
      available: false,
      state: "missing_credentials",
      reasonCode: "missing_credentials",
    });

    for (const cloudId of ["cua-cloud", "daytona", "orgo"] as const) {
      expect(byId.get(cloudId)).toMatchObject({
        available: false,
        state: "missing_credentials",
        reasonCode: "missing_api_key",
      });
      expect(byId.get(cloudId)?.nextStep).toContain("keys run");
    }
  });

  it("reports host_offline cleanly when Mac #2 Lume daemon is unreachable", async () => {
    store.updateMac2Config({ tailscaleHost: "mac2.tailnet.ts.net" });
    const pool = new AgentComputerPool({
      store,
      getSettings: () => emptySettings(),
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED 100.64.0.8:7777");
      },
    });

    const status = await pool.checkProvider("mac2-lume-vm");
    expect(status.available).toBe(false);
    expect(status.state).toBe("host_offline");
    expect(status.reasonCode).toBe("host_offline");
    expect(status.nextStep).toContain("com.xlabs.agent-mac-host");
  });

  it("clones and wipes Temporary VMs on session close, while Long-Term VMs persist and snapshot/stop cleanly", async () => {
    store.updateMac2Config({
      tailscaleHost: "mac2.tailnet.ts.net",
      sshUser: "gregorio",
      maxConcurrentVms: 4,
      snapshotOnLongTermStop: true,
    });

    const lume = createFakeLumeServer([
      {
        name: "xlabs-macos-base",
        os: "macos",
        status: "stopped",
        ipAddress: null,
        vncUrl: null,
      },
      {
        name: "xlabs-ubuntu-base",
        os: "linux",
        status: "stopped",
        ipAddress: null,
        vncUrl: null,
      },
    ]);

    const shellCalls: Array<{ cmd: string; args: readonly string[] }> = [];
    const runShell: ShellCommandRunner = async (cmd, args) => {
      shellCalls.push({ cmd, args });
      return { exitCode: 0, stdout: '{"data":"iVBORw0KGgoAAAANSUhEUg=="}\n', stderr: "" };
    };

    const pool = new AgentComputerPool({
      store,
      getSettings: () => emptySettings(),
      fetchImpl: lume.fetchImpl,
      runShell,
      lumeReadyPollDelaysMs: [0],
    });

    // 1. Temporary agent -> clones `tmp-scout-42`, runs command, then wipes VM on closeSession!
    const tempLease = await pool.acquireComputer({
      agentId: "scout-42",
      mode: "temporary",
      os: "macos",
    });
    expect(tempLease.provider).toBe("mac2-lume-vm");
    expect(tempLease.instanceName).toBe("tmp-scout-42");
    expect(tempLease.burstedFrom).toBeNull();
    expect(tempLease.vncPreviewUrl).toMatch(/^vnc:\/\/mac2\.tailnet\.ts\.net:/);
    expect(lume.vms.get("tmp-scout-42")?.status).toBe("running");

    const mcp = await pool.getMcpEndpoint(tempLease.leaseId);
    expect(mcp).toMatchObject({
      kind: "stdio",
      toolSurface: "cua-driver",
      command: "ssh",
    });
    expect(mcp?.args).toContain("gregorio@mac2.tailnet.ts.net");
    expect(mcp?.args?.slice(-2)).toEqual(["cua-driver", "mcp"]);

    const execOut = await pool.execCommand(tempLease.leaseId, { command: "sw_vers" });
    expect(execOut.ok).toBe(true);
    expect(shellCalls.length).toBe(1);

    const shot = await pool.screenshotPreview(tempLease.leaseId);
    expect(shot.base64Data).toBe("iVBORw0KGgoAAAANSUhEUg==");

    const closedTemp = await pool.closeSession(tempLease.leaseId);
    expect(closedTemp.state).toBe("destroyed");
    expect(lume.vms.has("tmp-scout-42")).toBe(false);

    // 2. Long-Term agent -> clones `a01-media-buyer-precision` once, snapshots & stops on close, wakes on re-lease!
    const persistentLease1 = await pool.acquireComputer({
      agentId: "buyer-agent-1",
      mode: "long-term",
      role: "media-buyer",
      project: "precision",
      os: "macos",
    });
    expect(persistentLease1.instanceName).toBe("a01-media-buyer-precision");
    expect(lume.vms.get("a01-media-buyer-precision")?.status).toBe("running");

    const stoppedPersistent = await pool.closeSession(persistentLease1.leaseId);
    expect(stoppedPersistent.state).toBe("stopped");
    expect(stoppedPersistent.snapshotName).toBe("a01-media-buyer-precision-snap");
    // Persistent VM remains on disk in stopped state (never deleted).
    expect(lume.vms.get("a01-media-buyer-precision")?.status).toBe("stopped");
    expect(lume.vms.has("a01-media-buyer-precision-snap")).toBe(true);

    const cloneCountBeforeWake = lume.calls.filter((c) => c.path === "/lume/vms/clone" && (c.body as { newName?: string })?.newName === "a01-media-buyer-precision").length;
    expect(cloneCountBeforeWake).toBe(1);

    // Re-acquiring wakes the existing persistent VM without cloning over its state!
    const persistentLease2 = await pool.acquireComputer({
      agentId: "buyer-agent-1",
      mode: "long-term",
      role: "media-buyer",
      project: "precision",
      os: "macos",
    });
    expect(persistentLease2.leaseId).toBe(persistentLease1.leaseId);
    expect(persistentLease2.state).toBe("running");
    expect(lume.vms.get("a01-media-buyer-precision")?.status).toBe("running");

    const cloneCountAfterWake = lume.calls.filter((c) => c.path === "/lume/vms/clone" && (c.body as { newName?: string })?.newName === "a01-media-buyer-precision").length;
    expect(cloneCountAfterWake).toBe(1);
  });

  it("supports ssh-tunnel transport to 127.0.0.1:7777 without exposing Lume on LAN", async () => {
    store.updateMac2Config({
      sshAlias: "mac2-tailscale",
      lumeTransport: "ssh-tunnel",
      maxConcurrentVms: 3,
    });

    const lume = createFakeLumeServer([
      { name: "xlabs-ubuntu-base", os: "linux", status: "stopped", ipAddress: null, vncUrl: null },
    ]);

    const runShell: ShellCommandRunner = async (_cmd, args) => {
      const remoteCmd = args[args.length - 1] ?? "";
      const methodMatch = remoteCmd.match(/-X\s+(GET|POST|PATCH|DELETE)/);
      const urlMatch = remoteCmd.match(/'(http:\/\/127\.0\.0\.1:7777[^']+)'/);
      const dataMatch = remoteCmd.match(/-d\s+'([^']+)'/);
      if (methodMatch && urlMatch) {
        const parsedUrl = new URL(urlMatch[1]!);
        const body = dataMatch ? JSON.parse(dataMatch[1]!) : null;
        const res = lume.handleRequest(methodMatch[1]!, parsedUrl.pathname, body);
        const text = await res.text();
        return {
          exitCode: 0,
          stdout: `${text}\n__HTTP_STATUS__:${res.status}`,
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "ok\n", stderr: "" };
    };

    const pool = new AgentComputerPool({
      store,
      getSettings: () => emptySettings(),
      runShell,
      lumeReadyPollDelaysMs: [0],
    });

    const lease = await pool.acquireComputer({
      agentId: "worker-ssh",
      mode: "temporary",
      os: "linux",
    });
    expect(lease.provider).toBe("mac2-lume-vm");
    expect(lease.instanceName).toBe("tmp-worker-ssh");
  });

  it("enforces Apple 2-macOS-VM limit and bursts overflow GUI/Linux workloads to cua-cloud and daytona", async () => {
    store.updateMac2Config({
      tailscaleHost: "mac2.tailnet.ts.net",
      maxConcurrentVms: 3,
      maxMacOsVms: 2,
    });

    const lume = createFakeLumeServer([
      { name: "xlabs-macos-base", os: "macos", status: "stopped", ipAddress: null, vncUrl: null },
      { name: "xlabs-ubuntu-base", os: "linux", status: "stopped", ipAddress: null, vncUrl: null },
    ]);

    const fetchImpl: FetchLike = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.hostname === "mac2.tailnet.ts.net") {
        return lume.fetchImpl(input, init);
      }
      if (url.hostname === "api.cua.ai") {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "GET" && url.pathname === "/v1/spaces") {
          return jsonResponse({ spaces: [] });
        }
        if (method === "POST" && url.pathname === "/v1/spaces") {
          const payload = JSON.parse(String(init?.body)) as { name: string };
          return jsonResponse({
            space: {
              id: `space_${payload.name}`,
              name: payload.name,
              status: "running",
              vncUrl: `https://stream.cua.ai/${payload.name}`,
            },
          });
        }
        if (method === "DELETE") {
          return jsonResponse({ ok: true });
        }
      }
      if (url.hostname === "app.daytona.io") {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "GET" && url.pathname === "/api/sandbox") {
          return jsonResponse([]);
        }
        if (method === "POST" && url.pathname === "/api/sandbox") {
          const payload = JSON.parse(String(init?.body)) as { name: string };
          return jsonResponse({
            id: `sbx_${payload.name}`,
            name: payload.name,
            state: "started",
          });
        }
        if (method === "POST" && url.pathname.endsWith("/toolbox/process/execute")) {
          return jsonResponse({ exitCode: 0, result: "daytona-linux-ok\n" });
        }
        if (method === "DELETE") {
          return jsonResponse({ ok: true });
        }
      }
      return jsonResponse({ error: `unexpected host ${url.hostname}` }, 500);
    };

    const pool = new AgentComputerPool({
      store,
      getSettings: () =>
        emptySettings({
          cuaApiKey: "cua_test_runtime_token_do_not_persist",
          daytonaApiKey: "dtn_test_runtime_token_do_not_persist",
        }),
      fetchImpl,
      lumeReadyPollDelaysMs: [0],
    });

    // Slots 1 & 2 (macOS) land on Mac #2 Lume at $0/hr.
    const mac1 = await pool.acquireComputer({ agentId: "mac-1", mode: "temporary", os: "macos" });
    const mac2 = await pool.acquireComputer({ agentId: "mac-2", mode: "temporary", os: "macos" });
    expect(mac1.provider).toBe("mac2-lume-vm");
    expect(mac2.provider).toBe("mac2-lume-vm");

    // 3rd macOS request hits Apple's 2-macOS-VM limit -> bursts automatically to `cua-cloud`!
    const mac3Burst = await pool.acquireComputer({
      agentId: "mac-3",
      mode: "temporary",
      os: "macos",
      needsGui: true,
    });
    expect(mac3Burst.provider).toBe("cua-cloud");
    expect(mac3Burst.burstedFrom).toBe("mac2-lume-vm");
    expect(mac3Burst.vncPreviewUrl).toBe("https://stream.cua.ai/tmp-mac-3");

    // Meanwhile Slot 3 on Mac #2 CAN still run a Linux VM (`xlabs-ubuntu-base`) at $0/hr!
    const linuxOnMac2 = await pool.acquireComputer({
      agentId: "linux-local",
      mode: "temporary",
      os: "linux",
      needsGui: true,
    });
    expect(linuxOnMac2.provider).toBe("mac2-lume-vm");
    expect(linuxOnMac2.burstedFrom).toBeNull();

    // Now Mac #2 is at 3/3 total VMs (`maxConcurrentVms: 3`). A headless Linux agent bursts to `daytona`!
    const headlessBurst = await pool.acquireComputer({
      agentId: "scraper-burst",
      mode: "temporary",
      os: "linux",
      needsGui: false,
    });
    expect(headlessBurst.provider).toBe("daytona");
    expect(headlessBurst.burstedFrom).toBe("mac2-lume-vm");

    const daytonaExec = await pool.execCommand(headlessBurst.leaseId, { command: "uname -a" });
    expect(daytonaExec.ok).toBe(true);
    expect(daytonaExec.stdout).toBe("daytona-linux-ok\n");

    // Verify runtime MCP auth headers exist in memory ONLY and NEVER touch disk (`0600` store file).
    const cuaMcp = await pool.getMcpEndpoint(mac3Burst.leaseId);
    expect(cuaMcp?.headers?.authorization).toBe("Bearer cua_test_runtime_token_do_not_persist");

    const persistedRaw = readFileSync(store.path(), "utf8");
    expect(persistedRaw).not.toContain("cua_test_runtime_token_do_not_persist");
    expect(persistedRaw).not.toContain("dtn_test_runtime_token_do_not_persist");
    const fileMode = statSync(store.path()).mode & 0o777;
    expect(fileMode).toBe(0o600);

    // Reloading store from disk preserves active leases cleanly.
    const reloadedStore = new AgentComputerStore(tempDir);
    expect(reloadedStore.listLeases()).toHaveLength(5);
  });

  it("supports local-cua-ax, mac2-shared (SharedComputers), and Orgo /computers REST endpoints", async () => {
    // 1. local-cua-ax via DesktopComputer grant
    const desktop = createDesktopComputer({ platform: "darwin" });
    desktop.receive({
      type: DESKTOP_COMPUTER_GRANT,
      connection: {
        mode: "embedded",
        status: "ready",
        socketPath: "/tmp/cua-test.sock",
        mcpCommand: "/Applications/CuaDriver.app/Contents/MacOS/cua-driver",
        mcpArgs: ["mcp", "--embedded", "--socket", "/tmp/cua-test.sock"],
        mcpEnv: { CUA_DRIVER_EMBEDDED: "1", CUA_DRIVER_HOST_BUNDLE_ID: "com.openmausbot.app" },
      },
    });

    // 2. mac2-shared via OpenMausBot SharedComputers
    const sharedComputers = new SharedComputers(() => true);
    const sharedId = "550e8400-e29b-41d4-a716-446655440000";
    const envId = "660e8400-e29b-41d4-a716-446655440001";
    const secret = "a".repeat(64);
    sharedComputers.register(
      {
        id: sharedId,
        name: "Gregorio Mac #2",
        environmentId: envId,
        folders: [],
        terminal: true,
        computer: true,
        platform: "darwin",
        commandTimeouts: true,
      },
      { session: "sess-1", person: "gregorio" },
      secret,
    );
    store.updateMac2Config({
      sharedComputerId: sharedId,
      sharedOwnerPerson: "gregorio",
    });

    // 3. Orgo REST mock
    const orgoClicks: unknown[] = [];
    const pngBytes = Uint8Array.from([137, 80, 78, 71]);
    const fetchImpl: FetchLike = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.hostname === "www.orgo.ai") {
        if (method === "GET" && url.pathname === "/api/computers") {
          return jsonResponse({ computers: [] });
        }
        if (method === "POST" && url.pathname === "/api/computers") {
          const payload = JSON.parse(String(init?.body)) as { name: string };
          return jsonResponse({ id: "comp_99", name: payload.name, status: "running", vnc_url: "https://orgo.ai/vnc/comp_99" });
        }
        if (method === "POST" && url.pathname === "/api/computers/comp_99/bash") {
          return jsonResponse({ exit_code: 0, output: "Ubuntu 24.04 LTS\n" });
        }
        if (method === "POST" && url.pathname === "/api/computers/comp_99/click") {
          orgoClicks.push(JSON.parse(String(init?.body)));
          return jsonResponse({ ok: true });
        }
        if (method === "GET" && url.pathname === "/api/computers/comp_99/screenshot") {
          return new Response(pngBytes, { status: 200, headers: { "content-type": "image/png" } });
        }
        if (method === "DELETE" && url.pathname === "/api/computers/comp_99") {
          return jsonResponse({ ok: true });
        }
      }
      return jsonResponse({ error: "not found" }, 404);
    };

    const pool = new AgentComputerPool({
      store,
      desktop,
      platform: "darwin",
      sharedComputers,
      getSettings: () => emptySettings({ orgoApiKey: "orgo_live_key_test" }),
      fetchImpl,
    });

    const localLease = await pool.acquireComputer({
      agentId: "local-helper",
      mode: "temporary",
      preferredProvider: "local-cua-ax",
      os: "macos",
    });
    const localMcp = await pool.getMcpEndpoint(localLease.leaseId);
    expect(localMcp).toEqual({
      kind: "stdio",
      toolSurface: "cua-driver",
      command: "/Applications/CuaDriver.app/Contents/MacOS/cua-driver",
      args: ["mcp", "--embedded", "--socket", "/tmp/cua-test.sock"],
      env: { CUA_DRIVER_EMBEDDED: "1", CUA_DRIVER_HOST_BUNDLE_ID: "com.openmausbot.app" },
    });

    const sharedStatus = await pool.checkProvider("mac2-shared");
    expect(sharedStatus.available).toBe(true);
    const sharedLease = await pool.acquireComputer({
      agentId: "xcode-runner",
      mode: "long-term",
      role: "builder",
      project: "omb",
      preferredProvider: "mac2-shared",
      os: "macos",
    });
    expect(sharedLease.provider).toBe("mac2-shared");
    // Second GUI request on single-cursor direct host reports capacity_full when burst disabled
    await expect(
      pool.acquireComputer({
        agentId: "second-gui",
        mode: "temporary",
        preferredProvider: "mac2-shared",
        os: "macos",
        allowCloudBurst: false,
      }),
    ).rejects.toBeInstanceOf(AgentComputerError);

    const orgoLease = await pool.acquireComputer({
      agentId: "ubuntu-operator",
      mode: "temporary",
      preferredProvider: "orgo",
      os: "linux",
    });
    expect(orgoLease.instanceId).toBe("comp_99");
    const bashRes = await pool.execCommand(orgoLease.leaseId, { command: "lsb_release -ds" });
    expect(bashRes.stdout).toBe("Ubuntu 24.04 LTS\n");

    const orgoShot = await pool.screenshotPreview(orgoLease.leaseId);
    expect(orgoShot.mimeType).toBe("image/png");
    expect(orgoShot.base64Data).toBe(Buffer.from(pngBytes).toString("base64"));

    const orgoAdapter = pool.getAdapter("orgo") as OrgoProvider;
    await orgoAdapter.click(
      orgoLease,
      { x: 420, y: 260, button: "left" },
      {
        settings: emptySettings({ orgoApiKey: "orgo_live_key_test" }),
        mac2Config: store.getMac2Config(),
        burstPolicy: store.getBurstPolicy(),
        activeLeases: [],
        fetchImpl,
        runShell: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        now: Date.now,
      },
    );
    expect(orgoClicks).toEqual([{ x: 420, y: 260, button: "left" }]);

    const destroyedOrgo = await pool.closeSession(orgoLease.leaseId);
    expect(destroyedOrgo.state).toBe("destroyed");
  });

  it("builds deterministic sanitized VM names for temporary and long-term modes", () => {
    expect(buildAgentComputerName({ mode: "temporary", agentId: "Scout_Agent #01" })).toBe(
      "tmp-scout-agent-01",
    );
    expect(
      buildAgentComputerName({
        mode: "long-term",
        agentId: "fallback-id",
        role: "Creative Scout",
        project: "Precision Peptides",
      }),
    ).toBe("a01-creative-scout-precision-peptides");
  });

  it("validates scripts/setup-agent-mac.sh syntax, --help, and --dry-run bootstrap", async () => {
    const syntax = await execFileAsync("/bin/bash", ["-n", SETUP_SCRIPT]);
    expect(syntax.stderr).toBe("");

    const help = await execFileAsync(SETUP_SCRIPT, ["--help"]);
    expect(help.stdout).toContain("--install");
    expect(help.stdout).toContain("--init-vm-pool");
    expect(help.stdout).toContain("--pair-url");

    const dryRun = await execFileAsync(SETUP_SCRIPT, [
      "--install",
      "--init-vm-pool",
      "--pair-url",
      "https://omb.tailnet.ts.net/pair/demo",
      "--dry-run",
    ]);
    expect(dryRun.stdout).toContain("pmset -c sleep 0");
    expect(dryRun.stdout).toContain("com.xlabs.agent-mac-host");
    expect(dryRun.stdout).toContain("xlabs-macos-base");
    expect(dryRun.stdout).toContain("xlabs-ubuntu-base");
  });
});
