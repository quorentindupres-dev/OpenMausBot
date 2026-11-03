# Agent Loop Handoff — `xlabs-spaces@2.0.0` (`OpenMausBot`)

## Loop Status
- **State:** 🟢 Shipped (`v0.1.134` host + `xlabs-spaces@2.0.0` portable plugin)

## What Was Shipped
1. **Agent Computer Pool (`server/agent-computers/` + `shared/agent-computers.ts` + `scripts/setup-agent-mac.sh`)**:
   - Multi-provider desktop/VM computer pool (`mac2-lume-vm` Apple `Virtualization.framework` via Cua Lume on dedicated Apple Silicon host, `local-cua-ax` native macOS AX fallback, `mac2-shared`, `cua-cloud`, `daytona`, `orgo`).
   - SQLite lease store (`pool.db`), health probes, screenshot/action proxy routes, and bootstrap script `scripts/setup-agent-mac.sh` (`--dry-run` / `--check`).
2. **Registered `A01` Role & `C02` Project Bridges (`server/space/{a01-bridge,c02-bridge,computers-bridge}.ts`)**:
   - Enforces registered role membership (`temporary` vs `long-term` modes) with `0600` compiled runtime briefs and Hindsight memory scoping.
   - Reads structured 7-pillar project readiness from `C02` project blueprints and exposes `/api/space/{a01,c02,computers}/*` HTTP + MCP tools (`c02_project_context`, `a01_query_brain`, `computer_status`).
3. **Interactive Whiteboard & UI Modals (`src/components/space/` + `@xlabs/space-canvas`)**:
   - Embeds `SpaceWhiteboard` (`@xlabs/space-canvas`) inside `SpaceCanvas.tsx` (`Canvas` / `Grid` switch) with magnetic arrows binding `C02` Context Cards and Computer Tiles directly onto Spaces and Bots.
   - Adds `HireA01AgentModal.tsx`, `AgentComputersModal.tsx`, and `A01NewBotSection.tsx` inside `NewBotDialog.tsx`.
4. **Portable Plugin Snapshot (`plugins/xlabs-spaces/plugin.json` `v2.0.0`)**:
   - `ownedPresent: 9/9`, `seamsPresent: 15/15`, `bundleReady: true` so future upstream upgrades restore cleanly via `node scripts/xlabs-plugin.mjs apply`.

## Verification Gate
```bash
node scripts/xlabs-plugin.mjs status --json
npm run typecheck
npx vitest run scripts/xlabs-plugin.test.ts server/agent-computers/pool.test.ts server/space/bridges.test.ts server/space/store.test.ts server/routes/space.test.ts src/components/space/QuestBoard.test.ts src/components/space/SpaceCanvas.test.ts src/components/space/space-api.test.ts
npm run build
```

## Next Agent Loop Picks
1. **Secondary Mac Provisioning:** Run `./scripts/setup-agent-mac.sh` on the dedicated secondary Apple Silicon Mac after OS reset, pull the golden macOS VM image via `lume`, and verify live `mac2-lume-vm` lease allocation over Tailscale/LAN.
2. **Upstream Sync Loop:** On next upstream release, fetch `upstream/main`, merge, run `node scripts/xlabs-plugin.mjs apply`, and re-run the verification gate above.
