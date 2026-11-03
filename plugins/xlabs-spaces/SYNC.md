# SYNC — keeping `xlabs-spaces` on top of upstream

Goal: `main` is a **mirror of upstream** (fast-forward only, never diverges).
Everything we add lives in `plugins/xlabs-spaces/` and is applied to a build
branch. A new upstream release costs one command and one review, not a merge
war.

Verified state, 2026-11-03:

| Fact | Value |
|---|---|
| `origin` | `quorentindupres-dev/OpenMausBot` (fork) |
| `upstream` | `milind-soni/OpenMausBot`, tip `96493483c` |
| Fork commits on `main` | 15 (2 plugin + merges + earlier features) |
| Upstream commits we are behind | 232 |
| Plugin owned paths | 12 (3 dirs + 9 files → 61 files in `bundle/.owned.json`) |
| Seams | 25 patches over 25 files (3 sibling-repo aliases were removed by vendoring) |
| Deleted upstream files | 0 (the experimental settings **row** is patched out; the component and its test stay) |
| `plugin status` | ok — 12/12 owned, 25/25 seams, 0/0 deleted |
| Plugin tests | 3/3 pass |
| Seams that apply cleanly on today's upstream tip | 25 / 25 |
| Seams needing re-anchor | 0 |
| Seams that only exist because of the sibling repo | 3 (`tsconfig.json`, `vite.config.ts`, `src/styles.css`) |

"Still applies" = every `find` string of that seam exists verbatim in
`git show upstream/main:<file>`.

## Branch model

Three refs, three jobs:

```
upstream/main ──fast-forward──► main     mirror, no local commits, ever
                                   │
plugin (orphan, no upstream history) │   source of truth: plugins/xlabs-spaces/**,
   │                                 │   scripts/xlabs-plugin.{mjs,test.ts}
   └──────── restore ───────────────►│
                                   apply ──► xlabs   upstream + plugin + applied layer
                                                   │
                                                   └── build / run / release
```

- `main` never gets our commits. `git push origin main` only fast-forwards.
- **`plugin` is an orphan branch** holding only the layer: `plugins/xlabs-spaces/`
  and `scripts/xlabs-plugin.*`. No upstream history, so it is cloneable on its
  own and cannot be lost when `main` is reset to upstream.
- `xlabs` is a **disposable build branch**, rebuilt every sync:
  `git switch -C xlabs upstream/main`, restore the tree from `plugin`, `apply`,
  gates, one commit, force-push **only `xlabs`**.
- `backup/pre-plugin-reset-20261103` stays as the safety copy until Phase 3
  passes twice.

**Critical ordering (this is what `sync` gets wrong if written naively):** a
branch started at `upstream/main` has **no** `plugins/` directory and **no**
`scripts/xlabs-plugin.mjs` (upstream has zero files under `plugins/`). Running
`apply` there restores 0 owned files and the layer deletes itself. `sync` must
do this order, and fail loudly if step 1 restores nothing:

```bash
git switch -C xlabs upstream/main
git restore --source=plugin -- plugins/xlabs-spaces scripts/xlabs-plugin.mjs scripts/xlabs-plugin.test.ts
test -f plugins/xlabs-spaces/plugin.json && test -f plugins/xlabs-spaces/bundle/.owned.json || exit 9
node scripts/xlabs-plugin.mjs apply --repair
```

Why not keep applying on `main`: every upstream merge touches the same lines our
seams touch, so `main` diverges and the diff stops being "upstream + our
plugin". A throwaway build branch keeps the diff honest and reviewable.

## Seam v2 (the fix for drift)

Current seams are exact-text find/replace against one upstream snapshot. When
upstream edits the surrounding block, the seam silently stops matching and the
fallback is "copy the whole file from the bundle", which is how a fork turns
into a hard fork.

v2 replaces `find`/`replace` with **steps**, each step an **anchor**, an
**action**, and an **expectation**. A seam is a list of steps because 14 of the
25 today carry 2–6 patches (largest: `server/index.ts` with 6,
`src/components/TeamMapPage.tsx` with 5):

```json
{
  "file": "server/routes/table.ts",
  "id": "mount-space-routes",
  "steps": [
    {
      "id": "import",
      "anchor": { "kind": "line", "match": "^import \\{ ownMcpHttpRoutes \\} from \"./own-mcp-http.ts\";", "occurrence": 1 },
      "action": { "kind": "insertAfterLine", "with": "import { spaceRoutes } from \"./space.ts\";" },
      "skipIf": { "present": "import { spaceRoutes } from \"./space.ts\";" },
      "expect": { "count": 1 }
    },
    {
      "id": "routes",
      "anchor": { "kind": "line", "match": "^export const ROUTES: RouteHandler\\[\\] = \\[", "occurrence": 1 },
      "action": { "kind": "replaceLine", "with": "export const ROUTES: RouteHandler[] = [cloudSyncRoutes, ownMcpHttpRoutes, spaceRoutes];" },
      "skipIf": { "present": "spaceRoutes" },
      "expect": { "count": 1 }
    }
  ],
  "verify": { "contains": ["spaceRoutes"] },
  "markerMode": "present"
}
```

Allowed `action.kind`:

| kind | meaning |
|---|---|
| `insertAfterLine` | insert `with` after the anchored line |
| `insertBeforeLine` | insert `with` before the anchored line |
| `replaceLine` | replace the anchored line |
| `replaceBlock` | replace the anchor line + `lines` count (goldens / i18n blobs only) |
| `removeBlock` | delete a block between `start`/`end` anchors, or the anchor line + `lines` — **required for the two `markerMode: "absent"` seams** |
| `append` | append at EOF (rare) |

Rules:

1. One anchor = one line or one short regex. Never a 5-line verbatim block.
2. `expect.count` is mandatory; 0 matches = conflict, >1 = conflict.
3. `skipIf` replaces `idempotentIf`: `{present: "text"}` → skip if the file
   contains it; `{absent: "text"}` → skip if it does not. Absence seams need
   `skipIf.absent` (the marker is already gone).
4. `verify` must express **what must be true after apply**, for both kinds of
   seam: `contains: [..]` for present seams, `absent: [..]` for
   `markerMode: "absent"` seams. `status` and `doctor` evaluate the same object,
   so an absent seam is not reported "missing" on a clean upstream tree.
5. Every seam and every step has a stable `id`; the repair report, tests and CI
   address `seam.id/step.id`, never array indexes.

New commands:

```bash
node scripts/xlabs-plugin.mjs doctor            # per-seam: applied | ready | conflict, exit 1 on conflict
node scripts/xlabs-plugin.mjs doctor --json     # machine report, written to bundle/.doctor.json
node scripts/xlabs-plugin.mjs apply --repair    # apply what matches, write bundle/.repair.json, no partial writes
node scripts/xlabs-plugin.mjs sync --base upstream/main  # branch + apply + gates, leaves commit for review
node scripts/xlabs-plugin.mjs vendor            # refresh vendored canvas from the dev repo (pinned sha)
```

`--repair` never guesses silently: it writes the failing seam id, the nearest
3 candidate lines with line numbers, and the exact manual patch it would need.
A human or a worker fixes the anchor, then `snapshot` re-freezes.

## Vendoring the canvas (removes the sibling-repo dependency)

Today three seams exist only to reach `../G_app-Space-Canvas`:

- `tsconfig.json` → `@xlabs/space-canvas` path aliases
- `vite.config.ts` → alias + `fs.allow` + `dedupe`
- `src/styles.css` → `@source "../../G_app-Space-Canvas/src"`

A plugin that needs a sibling checkout one directory up is not portable, and
those three seams break the moment the build runs anywhere else.

Fix: `node scripts/xlabs-plugin.mjs vendor` copies `G_app-Space-Canvas/src`
into `src/components/space/vendor/space-canvas/` (tests excluded: the host runs
only `*.test.ts` and does not depend on testing-library) and records
`{ source, commit, files, sha256 }` in `src/components/space/vendor/.pin.json`.
Owned components import `./vendor/space-canvas`. The copy is atomic: build
beside the target, then swap, so a failed run never leaves a half tree. Run
`vendor` when the dev repo moves, then `snapshot`. Nothing at build time reads
the sibling checkout.

Result: 3 fewer seams, zero sibling-repo assumptions, plugin is self-contained.

## Where it stands (2026-11-03)

| Branch | What it is | Status |
|---|---|---|
| `main` | the fork's old tree, still ahead of upstream | 🟠 **not reset yet** — one gated command, see below |
| `plugin` | orphan ref, the layer only (25 seams, 175 owned files incl. the vendored canvas, 0 deleted) | 🟢 pushed |
| `xlabs` | `upstream/main` + the layer, one commit | 🟢 pushed, typecheck + tests + doctor green |

Proven on the real tip `96493483c`: `sync` restored 61 owned files, applied
**25/25 seams, 0 failures, 0 fallbacks**, committed `dea391aa1`, and
`verify-diff` saw 103 changed paths, **0 outside the allowlist**.

### The one gated step (needs a human yes)

`main` is still the old fork tree. Making it a pure upstream mirror is a
force-push and therefore the single irreversible action in this design:

```bash
git push origin backup/pre-plugin-reset-20261103   # already done, safety net
git branch -f main upstream/main
git push --force-with-lease origin main
```

Why it waits: until it runs, everything works on `xlabs`, and `main` still holds
the old tree. After it runs, `main` fast-forwards from upstream forever and the
layer lives only on `plugin`/`xlabs`.

### CI

`.github/workflows/*` only runs `schedule` on the **default branch**, so a
scheduled sync job has to wait for the `main` reset. Until then the daily trigger
is a local cron:

```cron
17 6 * * * cd /Users/g/Code/OpenMausBot && node scripts/xlabs-plugin.mjs sync --base upstream/main --json >> ~/Library/Logs/xlabs-sync.log 2>&1
```

## Sync loop (the only supported procedure)

```bash
git fetch upstream
node scripts/xlabs-plugin.mjs sync --base upstream/main
```

What `sync` does, in this exact order:

1. Restore the layer source: `git fetch origin plugin` (or use the local
   `plugin` branch). Abort if `plugins/xlabs-spaces/plugin.json` or
   `bundle/.owned.json` is missing.
2. `git switch -C xlabs upstream/main` (disposable branch, always rebuilt).
3. `git restore --source=plugin -- plugins/xlabs-spaces scripts/xlabs-plugin.mjs scripts/xlabs-plugin.test.ts`
   — **required**, because `upstream/main` has zero files under `plugins/` and
   no `xlabs-plugin.mjs`. Fail with exit 9 if the restore produced nothing.
4. `apply --repair` (owned files written from the bundle, seams applied, deleted
   files removed).
5. Gates: `doctor` → `npm run typecheck` → plugin + space tests → `npm run build`.
6. `verify-diff`: compare `git diff --name-only main..xlabs` against the
   manifest-derived allowlist (below). Any path outside it fails the sync.
7. Commit `chore(sync): xlabs-spaces on upstream <sha>` and print the diff stat.
8. Stop. A human/worker reviews and pushes `xlabs`; `main` is untouched.

### The diff gate (honest version)

`git diff --name-only main..xlabs` is **not** only `plugins/` — it is the layer
itself, which is 89 paths today. The allowlist is computed, not asserted:

```
owned      = paths in bundle/.owned.json          (61)
seamFiles  = unique seam files in plugin.json     (25)
deleted    = plugin.json deletedFiles             (0)
source     = plugins/xlabs-spaces/** , scripts/xlabs-plugin.mjs, scripts/xlabs-plugin.test.ts
allowed    = owned ∪ seamFiles ∪ deleted ∪ source
```

`verify-diff` prints `added / removed / changed` versus that set and exits 1 on
anything else. Today the measured diff is the computed allowlist (owned + seams + source), which
is the proof the gate is meaningful rather than vacuous.

If a gate fails, the branch is left in place with `bundle/.repair.json` and the
exact failing `seam.id/step.id`. Nothing is pushed.

## CI

`.github/workflows/plugin-sync.yml` (Phase 1):

- daily `schedule` + `workflow_dispatch`, and on `upstream` release via
  `repository_dispatch` from a cron poll of `milind-soni/OpenMausBot` tags
- runs `sync --base upstream/main` on a runner
- uploads `bundle/.doctor.json` + `.repair.json` as artifacts
- fails the job (and opens/updates one issue, never a new one per run) when a
  seam conflicts

This turns "upstream moved 232 commits" from a surprise into a daily red/green
signal.

## Portability rules for the plugin itself

1. No absolute paths, no `..` outside the repo, no sibling checkouts.
2. Everything the plugin needs ships in `plugins/xlabs-spaces/` (code, vendor,
   docs, tests).
3. Host integration is seams or owned files — never a fork-only package name,
   never a patched dependency in `node_modules`.
4. Every seam has a `verify.contains`, so `doctor` can prove the host still
   runs our wiring.
5. `remove` must always restore upstream byte-for-byte; the round-trip test is
   part of the gate.

## Long-term option (do not build now)

Upstream has open issues asking for a real plugin API (#3984 "Support plugins
that modify the interface", #532 "Make the project modular"). Once Phase 1–3 is
stable, the cheapest long-term sync is to contribute a tiny loader:
`plugins/*/plugin.json` → `registerRoutes()`, `promptParts()`, `uiSlots()`.
That would delete most of the 25 seams. Track it as a separate job; do not
block sync on it.
