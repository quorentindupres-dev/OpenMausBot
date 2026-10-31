# Agent Computer Pool & Cua.ai Hypervisor Guide

Operational guide for running isolated agent computers in OpenMausBot across your local Mac, a dedicated 2nd Apple Silicon Mac (`lume` VM pool + direct host), Cua.ai Cloud Spaces, Daytona, and Orgo.ai.

## 1. Architecture Overview

```text
OpenMausBot Primary Mac (Gs-MacBook-Pro · 192.168.1.108 · online)
  └── AgentComputerPool (server/agent-computers/pool.ts)
        ├── #1 mac2-lume-vm   ──▶ 2nd Mac Cua Lume Hypervisor (ssh -fNL 7777:127.0.0.1:7777 old-mac · 2–4 VMs, $0/hr)
        ├── #2 local-cua-ax   ──▶ This Mac Embedded Cua Driver (background AX tree, $0/hr, ~4ms socket)
        ├── #3 mac2-shared    ──▶ 2nd Mac Direct Host (Private LAN SSH old-mac 192.168.1.133, bare-metal GPU/Xcode)
        ├── #4 cua-cloud      ──▶ Cua.ai Cloud Spaces (macOS / Linux / Windows GUI desktops, CUA_API_KEY)
        ├── #5 daytona        ──▶ Daytona Cloud Sandboxes (~300ms Linux CLI/headless burst, DAYTONA_API_KEY)
        └── #6 orgo           ──▶ Orgo.ai Cloud Computers (persistent Ubuntu GUI + /computers API, ORGO_API_KEY)
```

Every provider sits behind `ComputerProviderAdapter` (`server/agent-computers/types.ts`) with seven uniform operations:
- `checkAvailability` — live readiness, active slot count, OS support, and next-step diagnostics (`missing_api_key`, `host_offline`, `capacity_full`).
- `provisionOrLease` — clones, wakes, or attaches an isolated computer according to `temporary` vs `long-term` mode.
- `execCommand` — executes shell commands in a clean environment (`env -i` without host daemon secrets).
- `mcpEndpoint` — returns the live `--mcp-config` descriptor (`cua-driver mcp`, streamable HTTP, or REST bridge).
- `screenshotPreview` — returns a base64 PNG/JPEG preview plus any Tailscale/cloud VNC stream URL.
- `pauseOrStop` — stops compute cleanly (snapshotting `long-term` Lume VMs when configured).
- `destroyLease` — stops and wipes ephemeral sandboxes/VMs idempotently.

---

## 2. Provider Comparison

| Rank | Provider ID | OS Support | Isolation | Max Concurrency | Cold Start / Action Latency | Cost | Cursor Conflict | Best Use Case |
|---:|---|---|---|---|---|---|---|---|
| **1** | `mac2-lume-vm` | macOS, Linux | Full VM per agent (Apple `Virtualization.framework`) | **2–4 VMs** _(max 2 macOS + 2 Linux)_ | ~4.5s APFS clone · ~18ms LAN | **$0.00/hr** | No | Primary isolated GUI/browser/code desktop per agent |
| **2** | `local-cua-ax` | Host OS (macOS) | Shared host via PID-targeted AX tree | 1–4 background apps | 0s warm · ~4ms socket | **$0.00/hr** | No _(AX path)_ | Quick tasks on local apps already open on your main Mac |
| **3** | `mac2-shared` | macOS | Bare-metal host OS | 1 GUI agent + shell jobs | 0s warm · ~15ms LAN | **$0.00/hr** | Yes _(1 host cursor)_ | Heavy Metal GPU renders, local Xcode builds, shared folders |
| **4** | `cua-cloud` | macOS, Linux, Windows | Cloud VM per agent | 50+ Spaces | ~6s wake · ~85ms WAN | ~$0.15–$0.45/hr | No | Overflow macOS/Linux GUI capacity or Windows-only apps |
| **5** | `daytona` | Linux | Cloud container sandbox | 100+ sandboxes | **~300ms** · ~45ms API | **~$0.05/vCPU-hr** | No | High-parallelism Linux CLI, code builds, headless scraping |
| **6** | `orgo` | Linux (Ubuntu) | Cloud GUI VM per agent | 50+ VMs | ~2.5s boot · ~70ms API | ~$0.12/hr | No | Persistent Ubuntu GUI desktops via `/computers` REST API |

> **Apple Virtualization.framework 2-macOS-VM Rule:** Apple's macOS SLA enforces a hard kernel limit of **2 concurrent macOS guest VMs** per physical Apple Silicon Mac. Linux VMs (`xlabs-ubuntu-base`) do not count against that 2-VM cap. On a 32GB+ 2nd Mac, `AgentComputerPool` runs up to **2 macOS VMs + 2 Ubuntu VMs concurrently at $0/hr**, and bursts any 3rd concurrent macOS request to `cua-cloud`.

---

## 3. Secondary Mac Setup (Live Air-Gapped Private LAN vs Optional Tailscale)

### 3A. Live Production Mode: Air-Gapped Private Wi-Fi LAN (`MacBook-Air` — Never Online)

Gregorio's 2nd Mac (`MacBook-Air`, user `gregorio`) runs **strictly on private Wi-Fi LAN (`192.168.1.0/24`) with zero internet access**:

- **Primary Mac (`Gs-MacBook-Pro`, user `g`):** `192.168.1.108/24` (DHCP, online) -> `ssh old-mac` (or `ssh macbook-air` / `ssh mba`).
- **Secondary Mac (`MacBook-Air`, user `gregorio`):** `192.168.1.133/24` (Manual, **never online**) -> `ssh macbook-pro` (or `ssh mbp` / `ssh new-mac`).
- **Air-Gap Invariants on `MacBook-Air`:** `Router: (null)`, `IPv6: Off` (`networksetup -setv6off "Wi-Fi"`), `DNS: 127.0.0.1`, `*Tailscale` / `*Surfshark` / `*iPhone USB` disabled, and `AddressFamily inet` direct IPv4 in `~/.ssh/config` (never `.local` mDNS).
- **Lume API Bridge (`mac2-lume-vm` without Tailscale):** Forward `lume serve` (`127.0.0.1:7777` on `MacBook-Air`) over SSH from `Gs-MacBook-Pro`:
  ```bash
  ssh -fNL 7777:127.0.0.1:7777 old-mac
  curl -fsS http://127.0.0.1:7777/lume/vms
  ```
- **`<DATA_DIR>/agent-computers.json` block for Air-Gapped Private LAN:**
  ```json
  {
    "mac2": {
      "sshAlias": "old-mac",
      "host": "192.168.1.133",
      "lumeApiUrl": "http://127.0.0.1:7777",
      "macosBaseVm": "xlabs-macos-base",
      "linuxBaseVm": "xlabs-ubuntu-base",
      "maxMacosVms": 2,
      "maxTotalVms": 4
    }
  }
  ```
- **One-Time Online Window for Pulling Base VM Images (Only With Gregorio's Explicit Approval):**
  ```bash
  # 1. Unlock internet temporarily on MacBook Air
  ssh old-mac 'networksetup -setdhcp "Wi-Fi" && networksetup -setv6automatic "Wi-Fi" && networksetup -setdnsservers "Wi-Fi" "Empty"'

  # 2. Run setup-agent-mac.sh / pull trycua base images ...

  # 3. IMMEDIATELY re-lock MacBook Air offline (LAN-only) & verify 0 WAN routes
  ssh old-mac 'networksetup -setv6off "Wi-Fi" && networksetup -setdnsservers "Wi-Fi" 127.0.0.1 && networksetup -setmanual "Wi-Fi" 192.168.1.133 255.255.255.0 ""'
  ssh old-mac 'hostname && ssh macbook-pro hostname && ! ping -c 1 -t 2 1.1.1.1 && ! ping6 -c 1 2606:4700:4700::1111'
  ```

### 3B. 1-Command Reset Secondary Mac Bootstrap (`setup-agent-mac.sh`)

When initially bootstrapping a freshly reset 2nd Apple Silicon Mac (during an approved online window or Tailscale mode):

### Step 1: Audit Current Readiness (Read-Only)

```bash
./scripts/setup-agent-mac.sh --check
```

### Step 2: Run the 1-Command Bootstrap

```bash
./scripts/setup-agent-mac.sh \
  --install \
  --init-vm-pool \
  --pair-url "https://<your-openmausbot-pair-url>"
```

What `setup-agent-mac.sh` configures idempotently:
1. **AC Sleep Guards (`pmset`):** Disables system sleep, disk sleep, standby, and autopoweroff on AC power (`sleep 0 disksleep 0 standby 0 autopoweroff 0 womp 1 autorestart 1`) while letting the display dim after 10 minutes (`displaysleep 10`).
2. **Tailscale-Restricted SSH:** Installs/verifies Tailscale and writes `/etc/ssh/sshd_config.d/90-xlabs-tailscale-only.conf` binding `sshd` strictly to `127.0.0.1` and the Mac's `100.x.y.z` Tailscale IP (`PasswordAuthentication no`).
3. **Cua `lume` + Checksummed `cua-driver`:** Installs `trycua/lume` and the SHA-256 verified universal `cua-driver` `0.28.2` binary (`~/.local/bin/cua-driver` / `/usr/local/bin/cua-driver`).
4. **Reboot-Persistent LaunchAgent (`com.xlabs.agent-mac-host`):** Runs `lume serve --port 7777` on `127.0.0.1:7777` with `KeepAlive: true` and bridges port `7777` onto your private Tailnet via `tailscale serve`.
5. **Golden Base Templates (`--init-vm-pool`):** Prepares `xlabs-macos-base` and `xlabs-ubuntu-base` in a clean stopped state so `lume clone` creates isolated agent VMs in seconds using zero-extra-space APFS copy-on-write clones.
6. **Dual-Mode OpenMausBot Pairing (`--pair-url`):** Pairs Mac #2 with `SharedComputers` (`mac2-shared`) and prints the exact `mac2` JSON block for `<DATA_DIR>/agent-computers.json` on your primary Mac.

---

## 4. Agent Lifecycle Modes (`temporary` vs `long-term`)

Every lease request specifies `mode`:

| Mode | Naming Pattern | Provisioning Behavior | On `pool.closeSession(leaseId)` |
|---|---|---|---|
| `temporary` | `tmp-<agentId>` | Deletes any stale `tmp-<agentId>`, clones fresh from golden base (`xlabs-macos-base` / `xlabs-ubuntu-base`), starts headless | Calls `destroyLease()` -> stops and deletes VM (`DELETE /lume/vms/tmp-<agentId>`), reclaiming disk immediately |
| `long-term` | `a01-<role>-<project>` | Reuses existing persistent VM if present (waking it cleanly), or clones once on first run | Calls `pauseOrStop()` -> stops VM (`POST /lume/vms/.../stop`) and updates `-snap` APFS clone so browser sessions, files, and tools persist at 0 CPU/RAM |

---

## 5. Cloud Burst & Secret Management

Never store API keys in `.env` files or in `<DATA_DIR>/agent-computers.json`. Inject cloud burst credentials at runtime from Bitwarden Secrets Manager via `keys run`:

```bash
keys run stable -- pnpm dev:server
```

Environment variables read exclusively by `server/agent-computers/settings.ts`:
- `CUA_API_KEY` — enables `cua-cloud` (macOS, Linux, Windows Spaces; optional `CUA_API_URL`).
- `DAYTONA_API_KEY` — enables `daytona` sub-second Linux burst sandboxes (optional `DAYTONA_API_URL`).
- `ORGO_API_KEY` — enables `orgo` persistent Ubuntu GUI VMs (optional `ORGO_API_URL`).

When a cloud key is absent, the pool never crashes: `checkAvailability` reports `state: "missing_credentials"`, `reasonCode: "missing_api_key"`, and an exact `nextStep` command.

---

## 6. Module Integration Quickstart (Wave 2 Wiring)

```ts
import { createDefaultAgentComputerPool } from "./agent-computers/index.ts";

const pool = createDefaultAgentComputerPool({ desktop: desktopComputer, sharedComputers });

// 1. Picker catalog + live health status
const providers = await pool.listProvidersWithStatus();

// 2. Lease an isolated computer (defaults to #1 mac2-lume-vm, bursts to cloud if full)
const lease = await pool.acquireComputer({
  agentId: "scout-01",
  mode: "temporary",
  os: "macos",
  needsGui: true,
});

// 3. Inject MCP server into bot --mcp-config (in-memory only, never persisted)
const mcp = await pool.getMcpEndpoint(lease.leaseId);

// 4. Close session (wipes temporary tmp-scout-01; stops & snapshots long-term a01-* VMs)
await pool.closeSession(lease.leaseId);
```
