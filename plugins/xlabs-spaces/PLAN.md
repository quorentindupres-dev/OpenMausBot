# Plan: upstream-clean tree, xlabs-spaces as plugin

## Outcome
🎯 Outcome: working tree == upstream base except plugin-owned paths; all user
mods live in `plugins/xlabs-spaces` (manifest + bundle) and are applied by
`scripts/xlabs-plugin.mjs` · Path: capture 17 unaccounted files → restore
non-owned to base → round-trip verify · Proof: checks in §Check plan

- **Priority:** P0
- **Expected time:** 2 h
- **Completion proof:** commands in §Check plan (a)–(d)
- **Consequence / bet:** missed → user mods stay tangled in upstream code and
  the next upstream pull conflicts everywhere

## Current state (verified 2026-11-03)
- `origin` = fork `quorentindupres-dev/OpenMausBot`,
  `upstream` = `milind-soni/OpenMausBot`
- Merge-base `0213b7435`; `HEAD` is 97 files / +19366 lines over it
  (`git diff --stat upstream/main...HEAD`, triple-dot = vs merge-base)
- After `git fetch upstream`, `upstream/main` (`f4fe7cb06`) is 231 commits
  ahead of the merge-base. A literal `git diff upstream/main` therefore shows
  ~1739 files of pure upstream advancement, unrelated to this fork. All
  “clean” checks below use the triple-dot form, which isolates fork changes.
  Rebasing onto the new tip is out of scope: 8 of 15 seam anchors no longer
  match the new tip (`server/index.ts` alone moved 504+/546−) and needs its
  own upstream-sync loop (see HANDOFF.md).
- Plugin already covers: 3 owned dirs + 6 owned files (58 files in
  `bundle/.owned.json`), 15 seams (`bundle/.seams.json`),
  `scripts/xlabs-plugin.mjs` (`status|snapshot|apply`), tests in
  `scripts/xlabs-plugin.test.ts`
- 17 files changed vs merge-base are in neither list (see Steps step 2)
- Working tree has one uncommitted owned change:
  `scripts/setup-agent-mac.sh` (LAN-only Lume, `tailscale serve reset`)

## Goal state
- Every file **not** owned by the plugin matches the merge-base upstream
  content exactly
- Every user modification lives under `plugins/xlabs-spaces/`
  (`plugin.json` manifest + `bundle/`) plus `scripts/xlabs-plugin.mjs/.test.ts`
  and is re-applied by `node scripts/xlabs-plugin.mjs apply`
- `plugins/xlabs-spaces/PLAN.md` (this file) and `HANDOFF.md` are plugin docs

## Steps
1. Backup branch `backup/pre-plugin-reset-20261103` at current `HEAD`
   (`git branch`, do not switch). Done before any edit.
2. Classify the 17 unaccounted files vs merge-base:
   - Owned (new files, move into bundle via `ownedFiles`):
     `docs/xlabs/README.md`, `server/drivers/agents-space-tools.test.ts`,
     `server/routes/space.test.ts`
   - Seams (edited upstream files, add `plugin.json` seams + snapshot):
     `server/drivers/agents-catalog-profile.ts`,
     `server/drivers/agents-catalog-goldens/profiles.json`,
     `server/drivers/agents-catalog-goldens/bridged.profiles.json`,
     `src/components/TeamCanvas.tsx`, `src/components/app/AppMessage.tsx`,
     `package.json` (plugin scripts), `electron-builder.yml` (fork owner),
     `server/drivers/antigravity.ts`, `server/drivers/antigravity.test.ts`,
     `src/components/EnginesSettings.tsx`,
     `src/components/EnginesSettings.test.ts`,
     `src/components/AppSettingsRows.tsx`,
     `src/components/BrowserSettingsRows.tsx`
   - Deleted upstream file (plugin deletes on apply, restores on remove):
     `src/components/BrowserSettingsRows.test.ts`
   - Fix existing `src/locales/en.json` seam: patch only added 2 of ~124
     quest keys; expand it to the full inserted block so patch-apply on a
     fresh upstream file loses nothing
3. Extend `scripts/xlabs-plugin.mjs`: add `remove` command (delete owned,
   reverse seam patches, restore deleted files), `deletedFiles` support in
   `status`/`snapshot`/`apply`, keep `status|snapshot|apply` compatible
4. Run `node scripts/xlabs-plugin.mjs snapshot` to refresh
   `bundle/.owned.json`, `bundle/.seams.json`, `bundle/.snapshot.json`
   (captures the uncommitted `setup-agent-mac.sh` change too), then
   `apply` and confirm idempotent
5. Update hardcoded counts in `scripts/xlabs-plugin.test.ts` to the new
   manifest (owned/seam totals) — no assertion weakened
6. Commit on `main` (`refactor: upstream-clean tree, xlabs-spaces as plugin`)
   including this plan; push to `origin`. Never force-push, never rewrite
   history. Push failure → leave commit local, report exact error

## Check plan (exact commands)
```bash
# (a) fork diff excluding plugin-owned paths is empty (triple-dot, see above)
git diff upstream/main...HEAD --stat -- . ':(exclude)plugins' ':(exclude)scripts/xlabs-plugin.mjs' ':(exclude)scripts/xlabs-plugin.test.ts'
#   plus scripted classification: every remaining path is owned/seam/deleted
# (b) round-trip: remove -> tree clean vs merge-base, apply -> status ok
node scripts/xlabs-plugin.mjs remove --json
git status --porcelain
node scripts/xlabs-plugin.mjs apply --json
node scripts/xlabs-plugin.mjs status --json   # ok: true
# (c) plugin tests
npx vitest run scripts/xlabs-plugin.test.ts
# (d) fast typecheck (skip if > 5 min, say so)
npm run typecheck
```

## Risks
- Seam patches written against the merge-base may not match a future
  upstream tip; `apply` falls back to the bundle snapshot (known trade-off,
  already the tool's design)
- `remove` reversing patches assumes patches are additive; snapshot fallback
  files (`en.json`, goldens) need exact reverse text — verified by the
  round-trip in (b) restoring byte-identical merge-base content
- Goldens (`agents-catalog-goldens/*.json`) are generated manifests; treating
  them as seams keeps catalog tests green with and without the plugin
