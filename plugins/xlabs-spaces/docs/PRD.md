# PRD — Spaces visual layer + integrated A01 team

Status: shipped (v2.0.0) · Owner: X-Labs · Last verified: 2026-11-03

The one document to rebuild this feature from scratch on a clean upstream
OpenMausBot, or to port it to another host. It lists what the feature must do,
where each part lives, how it is wired, and the checklist that proves a rebuild
is complete.

## 1. Purpose

Upstream OpenMausBot gives you bots and a team map. It does not give you a
**board where outcomes own agents**. This layer adds:

1. **Spaces** — goal zones on the team map. A Space holds a goal, outcomes,
   roadmap, tasks, asks, notes and the agents working in it.
2. **Aware agents** — every bot sees its Space, its tasks, its teammates and the
   other Spaces in its prompt, and can sign a note back to the board.
3. **A real team integration** — a bot can be hired from the A01 team registry,
   bound to a registered role, given a C02 project and a computer, and stopped
   from binding if the role does not exist (fail closed).
4. **A visual page panel** — the bot's HTML pages open in a side panel instead of
   running twice in the chat.
5. **A canvas** — notes, arrows, nodes and a whiteboard, persisted per board.

Non-goals: replacing the Kanban system, becoming a project database, or storing
metrics. Metrics live in artifacts; the board carries ≤5 outcome lines.

## 2. Feature inventory

| ID | Feature | Primary files |
|---|---|---|
| F1 | Spaces board: 5 levels (P1, P2, P3, general, side), status, layout, bench | `shared/space.ts`, `server/space/store.ts`, `src/components/space/QuestBoard.tsx` |
| F2 | Space canvas: pan/zoom, drag tiles, drag agents, shelf, ghost, snap guides | `src/components/space/SpaceCanvas.tsx`, `space-drag.ts`, `space-layout.ts`, `@xlabs/space-canvas` |
| F3 | Space drawer: Goal, Outcomes (≤5), Roadmap (≤12), Agents, Tasks, Asks, Threads, Notes | `src/components/space/QuestBoard.tsx`, `src/components/space/PagePanel.tsx` (unrelated name, same board) |
| F4 | Agent placement: bot in Space / on bench, per-thread cards, open thread in side drawer | `server/space/store.ts`, `space-ui-state.ts` |
| F5 | Signed note tools: `space_status`, `space_note` (note / outcome / handoff / ask), signature = caller only | `server/drivers/agents-space-tools.ts` |
| F6 | Prompt parts: volatile **Your Space**, stable **Visual first**; bench-only for unplaced bots | `server/space/prompt.ts`, seam in `server/index.ts` |
| F7 | C01 mirror: one folder per bot, `card.md` + `notes.md` + `space.json` + `log.jsonl` | `server/space/mirror.ts` |
| F8 | Kanban import (read only) + Ask Chief to scan | `server/space/kanban.ts`, `prompt.ts` |
| F9 | Page panel: Page tab, newest page, arrows for older, "Shown in the Page panel" pill | `src/components/space/PagePanel.tsx`, seam in `ComputerPanel.tsx`, `computer-panel-view.ts`, `computer-panel-tabs.ts` |
| F10 | Canvas objects: notes (4-corner resize, 5 colors), arrows, nodes, whiteboard batch, pinned sessions | `shared/space.ts`, `@xlabs/space-canvas` |
| F11 | A01 bridge: list roles, role card (0600 brief), search, hire agent, bind temporary/long-term, unbind, fail-closed | `server/space/a01-bridge.ts`, `A01NewBotSection.tsx`, `HireA01AgentModal.tsx` |
| F12 | C02 bridge: list projects, detail, detect from path/URL, 7-pillar readiness | `server/space/c02-bridge.ts` |
| F13 | Agent computer pool: providers (`mac2-lume-vm`, `local-cua-ax`, `mac2-shared`, `cua-cloud`, `daytona`, `orgo`), SQLite leases, exec, preview | `server/agent-computers/*`, `shared/agent-computers.ts`, `AgentComputersModal.tsx` |
| F14 | Antigravity Argon 4 models + multi-account UI (inline child accounts) | `server/drivers/antigravity.ts`, `src/components/EnginesSettings.tsx` |
| F15 | Remove the experimental NewBrowserSettings row | seam in `AppSettingsRows.tsx` (import + render); the component stays for upstream tests |
| F16 | i18n keys for every label above | `src/locales/en.json` seam |
| F17 | Project tabs: one tab per project across the board, count per tab, `All projects` / `Unassigned`, persisted choice; a new Space created in a tab belongs to that project; a tab switch never deletes other projects' spaces | `src/components/space/ProjectTabs.tsx`, `project-scope.ts`, `QuestBoard.tsx`, scope-aware `diffWhiteboardSyncPlan` |

## 3. Data model

`shared/space.ts` is the contract. Everything validates with zod.

```
SpaceState { goals: SpaceGoal[], tasks, asks, notes, canvas: {notes, arrows, nodes}, settings, bench, bots, threads }
SpaceGoal  { id, title ≤120, goal ≤240, icon?, level, outcomes ≤5 {text ≤160, done},
             roadmap ≤12, status active|done|parked, sortOrder, kanbanCard?, jobPath?,
             projectSlug?, defaultComputerProvider?, layout {x,y,w,h} }
CanvasNote { id, text ≤2000, color yellow|blue|green|pink|neutral, layout, createdAt, updatedAt }
CanvasArrow{ id, fromId, toId, anchors/points, label ≤240, color }
CanvasNode { id, kind, text, layout, ... }
```

Rules that must not regress:

- `MAX_OUTCOMES = 5`, `MAX_ROADMAP = 12`, coordinates bounded ±100 000.
- A task is assigned to exactly one bot or nobody.
- A note is signed `— <bot name> (<bot id>) · <Space> · <ISO time>` and a bot can
  only sign as itself (capability-derived identity, never a request field).
- `space.json` is written atomically (temp + rename), mode 0600.

## 4. API surface

Person (admin scope), `server/routes/space.ts`:

```
GET    /api/space                              board + last 100 notes + kanban flag
POST   /api/space/goals                        create Space
PATCH  /api/space/goals/:id                    edit any Space field
DELETE /api/space/goals/:id
POST   /api/space/goals/:id/tasks              {text, botId?}
PATCH  /api/space/goals/:id/tasks/:taskId      {text?, botId?, done?}
DELETE /api/space/goals/:id/tasks/:taskId
POST   /api/space/goals/:id/asks/:askId        {answer: yes|no}
POST   /api/space/goals/:id/log                signed note from "the person"
PUT    /api/space/placements                   {botId, goalId|null}
PUT    /api/space/threads/:threadId            {goalId|null}
PATCH  /api/space/settings                     {visualFirst} | {bench}
GET    /api/space/scan                         Chief scan message
POST   /api/space/import-kanban                404 when OMB_KANBAN_BIN unset
CRUD   /api/space/canvas-notes|arrows|nodes    canvas objects
POST   /api/space/canvas/batch                 whiteboard batch
PUT    /api/space/canvas/pinned-sessions
```

Bots (internal capability gate only):

```
GET  /api/internal/space/status
POST /api/internal/space/note  {text, kind, outcomeIndex?, spaceId?, forBotId?}
```

A01 / C02 / computers (registered-role and pool gates): `/api/space/a01/*`,
`/api/space/c02/*`, `/api/space/computers/*` — plus MCP tools
`a01_query_brain`, `c02_project_context`, `computer_status`.

## 5. Prompt integration

Two parts, injected through the `server/index.ts` seam:

- **Your Space** (volatile): the Space, goal, outcomes with ticks, roadmap, my
  tasks, the Space's other tasks and owner, teammates and their linked threads,
  last 5 signed notes, then one line per other Space and the bench. Thread's
  Space beats the bot's placement; a bench bot gets the board only.
- **Visual first** (stable, only when `visualFirst` and agents tools mounted):
  explain with a `show_html` page — verdict first, numbered sections, a diagram,
  plain words.

Room turns get neither part. Both are registered in `VOLATILE_SECTIONS` so the
prompt cache is not invalidated by board churn.

## 6. Wiring / seams (the honest inventory)

Owned outright (3 dirs + 9 files): `src/components/space/`, `server/space/`,
`server/agent-computers/`, `shared/space.ts`, `shared/agent-computers.ts`,
`server/routes/space.ts`, `server/drivers/agents-space-tools.ts`,
`scripts/setup-agent-mac.sh`, `docs/agent-computers-cua.md`, `docs/xlabs/README.md`,
the two space tests.

Seams (25 files): route table, `server/index.ts` (6 patches: imports, env,
bind, prompt parts ×2, internal routes), volatile sections, agents catalog/call/
env/catalog-profile, catalog goldens ×2, `TeamMapPage`, `ComputerPanel`,
`computer-panel-view`, `computer-panel-tabs`, `en.json`, `tsconfig.json`,
`vite.config.ts`, `styles.css`, `NewBotDialog`, `TeamCanvas`, `AppMessage`,
`package.json`, `electron-builder.yml`, `antigravity.ts` + test,
`EnginesSettings.tsx` + test, `AppSettingsRows.tsx`.

Deleted: none. The settings **row** is removed by patch; the component and its
test stay so upstream tests keep passing.

## 7. Rebuild checklist (clean upstream → shipped layer)

### A. Data + domain
- [ ] `shared/space.ts` compiles: levels, limits, schemas, canvas objects,
      A01 binding modes.
- [ ] `server/space/store.ts`: 0600 atomic `space.json`, old-data reader
      (P0/P1/P2 → P1/P2/P3, `side`), event emitter.
- [ ] `server/space/bots.ts` binds the live bot list; no circular import.

### B. Server
- [ ] Routes mounted in `server/routes/table.ts`; internal routes in
      `server/index.ts`.
- [ ] `OMB_SPACE=1` only when a Space exists; catalog exposes the tools only
      then.
- [ ] `space_status` / `space_note` dispatch through `agents-call.ts`.
- [ ] C01 mirror writes only inside `OMB_SPACE_C01_DIR`; nothing deleted.
- [ ] Kanban import reads `node $OMB_KANBAN_BIN tree --limit 500`, never writes.

### C. Prompt
- [ ] Space part appears for direct turns and for the "what the model sees"
      preview.
- [ ] Bench bot sees the board only; thread Space wins over placement.
- [ ] `space` is in `VOLATILE_SECTIONS`.
- [ ] Visual-first is stable (not volatile) and only for direct turns.

### D. UI
- [ ] Spaces toggle replaces Map toggle on the Team map; composer hidden on the
      board.
- [ ] Tile: level chip cycles level, drag by header, corner resize, saved layout.
- [ ] Shelf: one Space block, agent list with search past 8, drop = spawn thread.
- [ ] Ghost follows the pointer past 4 px; a press without movement is a click.
- [ ] Cards glide (~400 ms) when a Space changes; poll every 3 s.
- [ ] Drawer shows all eight parts; Asks accept **Yes** → assigned task.
- [ ] Page tab appears only with a page; chat row shows the in-panel pill.
- [ ] Canvas notes drag/resize/recolor, arrows bind anchors, batch applies.

### E. A01 / C02 / computers
- [ ] Role list + role card compile a 0600 brief; unknown role returns 400
      (fail closed).
- [ ] Hire creates the bot, binds the role, places it, links its thread.
- [ ] C02 readiness renders 7 pillars; detect works from path and URL.
- [ ] Pool: lease → exec → preview → release; SQLite lease store; provider
      health.
- [ ] `scripts/setup-agent-mac.sh --dry-run|--check` exits 0.

### F. Gates before "done"
- [ ] `npm run typecheck` green.
- [ ] `npx vitest run scripts/xlabs-plugin.test.ts server/space/*.test.ts
      src/components/space/*.test.ts server/routes/space.test.ts
      server/agent-computers/*.test.ts` green.
- [ ] `npm run build` green.
- [ ] `node scripts/xlabs-plugin.mjs doctor` → 0 conflicts on the upstream tip.
- [ ] `remove` restores upstream byte-for-byte; `apply` is idempotent.

## 8. Portability notes (moving this to another host)

- The layer touches the host in 25 places. Anything that provides these four
  things can host it: a route table, a prompt-parts hook, a tool catalog, and a
  React shell with a side panel.
- `@xlabs/space-canvas` must ship inside the plugin (vendored), not from a
  sibling checkout.
- State is one file (`space.json`) + an optional mirror folder; no host database
  is required.
- The A01 bridge is the only vault-coupled part: it needs the team registry
  (`team.db`) and the role folders. Everything else runs standalone.

## 9. Open questions

1. Should the board carry KPI numbers, or keep them in artifacts? (Current:
   artifacts; board ≤5 outcomes.)
2. Should role binding be allowed without a built role? (Current: no, fail
   closed.)
3. Upstream plugin API (#3984/#532) would delete most seams — revisit after the
   sync loop is stable.
