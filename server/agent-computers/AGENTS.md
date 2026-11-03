# Agent Computers (`server/agent-computers/`)

Unified computer-use pool routing OpenMausBot agents across local AX, the 2nd Apple Silicon Mac (`lume` VMs + direct host), Cua Cloud Spaces, Daytona, and Orgo.ai.

## Files & Ownership

- `../../shared/agent-computers.ts` — Zod wire contracts, VM slug builder, and static 6-provider comparison catalog.
- `settings.ts` — Only reader of `CUA_API_KEY`, `DAYTONA_API_KEY`, `ORGO_API_KEY`, and endpoint URL overrides from `process.env`.
- `errors.ts` — `AgentComputerError(code, message, next, status)` loud error contract.
- `types.ts` — `ComputerProviderAdapter` interface and injectable HTTP/SSH transports.
- `store.ts` — Atomic persistence (`0600`) for host settings, burst policy, and active leases in `<DATA_DIR>/agent-computers.json`.
- `pool.ts` — `AgentComputerPool`: availability fan-out, lifecycle (`temporary` vs `long-term`), and cloud burst routing.
- `providers/*.ts` — Concrete adapters (`local-cua-ax`, `mac2-shared`, `mac2-lume-vm`, `cua-cloud`, `daytona`, `orgo`).
- `pool.test.ts` — Unit tests covering health diagnostics, VM clone/wipe vs persistent stop, and cloud burst fallback.

## Invariants

1. **Secrets stay in memory:** Never read `.env` files, log API keys, or persist auth headers in `agent-computers.json`. Inject cloud keys at runtime via `keys run`.
2. **Lifecycle discipline:** `temporary` leases (`tmp-<agentId>`) destroy their VM on session close; `long-term` leases (`a01-<role>-<project>`) snapshot/stop cleanly when idle.
3. **Apple Silicon macOS VM cap:** Never schedule more than 2 concurrent macOS VMs on `mac2-lume-vm` (Apple `Virtualization.framework` SLA); Linux VMs may fill remaining slots.
4. **Air-gapped Mac #2 private LAN transport (`old-mac`):** Gregorio's 2nd Mac (`MacBook-Air`, `gregorio@192.168.1.133`) is **strictly private Wi-Fi LAN-only and never online** (`Router: null`, `IPv6: Off`, `DNS: 127.0.0.1`, Tailscale/VPN/iPhone-USB OFF). Reach it two ways over IPv4 (`ssh old-mac` ↔ `ssh macbook-pro` at `192.168.1.108`, `AddressFamily inet`) and bridge `lume serve` (`127.0.0.1:7777`) via SSH local port forward (`ssh -fNL 7777:127.0.0.1:7777 old-mac`) rather than `tailscale serve`. Never enable internet or Tailscale on `MacBook-Air` without Gregorio's explicit approval (`/Users/g/External-Vault/A01__team/_shared/private-mac-ssh.md`).
5. **Verify:** `pnpm exec vitest run server/agent-computers/pool.test.ts && pnpm typecheck && bash -n scripts/setup-agent-mac.sh`
