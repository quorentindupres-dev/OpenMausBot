# X-Labs fork: Spaces map and Page panel

This fork adds, on top of upstream OpenMausBot:

- **Spaces map**: the Team map's **Spaces** mode is a canvas like the Map
  (dotted, pan by dragging empty map, zoom with ⌘/Ctrl + scroll or +/−). Each
  Space is a tile in the department-tile style, colored by its **level** (top
  band, border, label chip): **P1** red (`danger`), **P2** orange (`warning`),
  **P3** yellow, **General** gray, **Side quest** darker gray, dashed. Bots sit
  inside as the same bot cards as the Map; bots with no Space sit in the
  **Bench** tile.
  - **Shelf** on the left (collapsible): one block per level (P1, P2, P3,
    General, Side quest) — drag one onto the map and a Space of that level
    appears there with its name ready to type; every agent with where it is
    ("in Website", "on the bench"), with a search box past 8 agents — drag one
    onto a Space to place it. The shelf is also a drop zone for the bench.
  - All dragging is pointer-based (no HTML5 drag and drop): past 4 px a ghost
    follows the cursor in screen space, the hovered tile lights up, the ghost
    says where it will land ("Move to …", "send it to the bench"), and letting
    go drops on whatever is under the cursor, at any zoom. A press that does not
    move stays a click.
  - Drag a card to another tile, or onto empty map or the shelf (bench). Drag a
    tile by its header to move it; its place (`layout`) and the bench's
    (`bench`) are saved in `space.json`.
  - When a bot's Space changes (a drag, or another update seen by the 3 s poll)
    its card glides from the old tile to the new one (~400 ms).
  - **Space** in the header, double-click empty map, or right-click it → **New
    Space here** / **New side quest here** opens the editor (level picker with
    the five levels).
  - The person icon on a tile adds an agent: pick a bot, or type a name to
    create one there. Click a tile's header to open the Space in a side drawer
    with the fixed parts:

  | Part | Who writes | What |
  |---|---|---|
  | Goal | the person | one line |
  | Outcomes | the person; a bot may tick one with a signed note | checklist, up to 5 |
  | Roadmap | the person (or the Kanban import) | ordered steps, read only to bots |
  | Agents | the person | drag a bot in, or **New agent** (creates a bot, places it) |
  | Tasks | the person | each one assigned to one agent, ticked when done |
  | Asks | bots | "I can pick up X. Plan: …" → **Yes** (becomes an assigned task) or **No** |
  | Threads | the person | the Space's threads: **Open**, **Close** (archives it), **New thread** |
  | Notes | bots | the last 3 signed notes |

- **Signed notes tools** for bots: `space_status` and `space_note` (kinds note,
  outcome, handoff, ask). Every note is signed
  `— <bot name> (<bot id>) · <Space> · <ISO time>` from the caller's own
  capability, so a bot can sign only as itself.
- **Transparent board**: every bot's prompt lists every Space and who is in it,
  and the bench.
- **C01 mirror** (optional): one folder per bot in a job folder.
- **Ask Chief to scan**: a thread with the Chief of Staff that lists open tasks
  and asks it to file Asks.
- **Import from Kanban** (optional, read only): Spaces from goal cards.
- **Page panel**: a **Page** tab in the bot's side panel while the open thread
  has a page (`show_html`): the newest page at full height, arrows for older
  ones; its chat row shows a "Shown in the Page panel" pill instead of running
  the page twice.

## The prompt

Every direct turn and the "what the model sees" preview get a volatile
**Your Space** part once the board has a Space: the Space, goal, outcomes with
ticks and numbers, roadmap, my tasks, the Space's other tasks and owner,
teammates and their linked threads, the last 5 signed notes, then one line per
other Space (who is where) and the bench. The thread's Space wins over the
bot's placement. A bot on the bench gets the board only. With the agents tools
mounted it also says how to use `space_note`.

**Explain with pages** adds a stable **Visual first** part to direct turns with
the agents tools: explain with a `show_html` page, verdict first, numbered
sections, a diagram, plain words, not too short. Room turns get neither part.

## Turn it on

No config flag. The board is always there; the prompt part and the two tools
appear once the board has at least one Space (`OMB_SPACE=1` in the agents
tools' environment).

| Env (server process) | Effect |
|---|---|
| `OMB_SPACE_C01_DIR=/path/to/C01__work_board/<job>` | turns the mirror on |
| `OMB_KANBAN_BIN=$HOME/code/G_app-Manager/board/bin/kanban.js` | shows **Import from Kanban**; runs `node $OMB_KANBAN_BIN tree --limit 500` (read only) |

Mirror layout (written with `writeFileAtomic` after every change; a bot's folder
is never deleted; a bot gets one once it is placed, has a task or writes a note):

```text
<root>/space.json                  the board, plus every bot and its Space
<root>/log.jsonl                   every signed note ever written, oldest first
<root>/agents/<bot-slug>/card.md   name · id · role · Space · goal · outcomes · my tasks · now doing · updated
<root>/agents/<bot-slug>/notes.md  this bot's signed notes, newest first
```

Kanban mapping: a depth-0 `goal` card becomes a Space (`kanbanCard` = its id);
`task` cards under it become tasks; other cards (options, candidates) become
roadmap steps. Running it again only adds what is new.

## Data

`DATA_DIR/space.json` (mode 0600). Older data is read as a Space: P0, P1, P2
become P1, P2, P3, `kind: "side"` becomes the side level, a goal's `outcome`
becomes the goal line and its KPIs become outcomes. The prompt says the level
in words ("P1 (top priority)", "Side quest").

## HTTP routes

Person (admin scope), `server/routes/space.ts`:

| Method | Path | Body |
|---|---|---|
| GET | `/api/space` | — (last 100 notes, plus `kanban: true/false`) |
| POST | `/api/space/goals` | `{ title, goal?, level?, outcomes?, roadmap?, status?, layout? }` |
| PATCH / DELETE | `/api/space/goals/:id` | any Space field |
| POST | `/api/space/goals/:id/tasks` | `{ text, botId? }` |
| PATCH / DELETE | `/api/space/goals/:id/tasks/:taskId` | `{ text?, botId?: id \| null, done? }` |
| POST | `/api/space/goals/:id/asks/:askId` | `{ answer: "yes" \| "no" }` |
| POST | `/api/space/goals/:id/log` | `{ text, kind? }` (signed "the person") |
| PUT | `/api/space/placements` | `{ botId, goalId \| null }` |
| PUT | `/api/space/threads/:threadId` | `{ goalId \| null }` |
| PATCH | `/api/space/settings` | `{ visualFirst }` or `{ bench: {x, y, w, h} }` |
| GET | `/api/space/scan` | — (the Chief scan message) |
| POST | `/api/space/import-kanban` | — (404 while `OMB_KANBAN_BIN` is unset) |

Bots (inside the internal capability gate): `GET /api/internal/space/status`,
`POST /api/internal/space/note { text, kind, outcomeIndex?, spaceId?, forBotId? }`.

## Our files

- `shared/space.ts` — types, input schemas, signature, reading old data.
- `server/space/` — `store.ts`, `prompt.ts`, `mirror.ts`, `kanban.ts`, `bots.ts` (+ tests).
- `server/routes/space.ts` (+ test).
- `server/drivers/agents-space-tools.ts` (+ test).
- `src/components/space/` — `QuestBoard.tsx` (toolbar, drawer, menus, drag ghost), `SpaceCanvas.tsx`,
  `SpacePalette.tsx`, `space-drag.ts`, `space-levels.ts`, `LevelChip.tsx`, `space-layout.ts`, `SpaceCard.tsx`, `GoalEditor.tsx`, `ZoneContextMenu.tsx`, `PointMenu.tsx`,
  `PagePanel.tsx`, `space-api.ts`, `space-ui-state.ts` (+ tests).

## Upstream lines we touched (check these after `git merge upstream/main`)

Edits to files pinned by `scripts/testing/file-size-ratchet.test.ts` (and the
1000-line `agents-catalog.ts`) are inline: those line counts do not change.

| File | Line | What |
|---|---|---|
| `server/index.ts` | 386 | imports `xlabsParts`, `bindSpaceBots`, `spaceStore`, `createSpaceInternalRoutes`, appended to the `./names.ts` import |
| `server/index.ts` | 1943 | `OMB_SPACE` in the agents tools' env (on once the board has a Space) |
| `server/index.ts` | 2959 | `bindSpaceBots(() => store.bots)` after `new Store(…)` |
| `server/index.ts` | 3122 | preview prompt: `...xlabsParts({ botId, bots, pages: agentsMounted })` after `skills` |
| `server/index.ts` | 8829 | direct turn: `...xlabsParts({ botId, threadId, bots, pages: Boolean(integrations.agents) })` after `playbooks` |
| `server/index.ts` | 14116 | `createSpaceInternalRoutes({ from: internalSender, threadId })` in the internal routes' `dispatchRoutes` list |
| `server/system-prompt.ts` | 29 | `"space"` in `VOLATILE_SECTIONS` |
| `server/routes/table.ts` | 7, 26 | import `spaceRoutes`, add it to `ROUTES` |
| `server/drivers/agents-catalog.ts` | 7, 23, 37, 565, 974 | import; `space?` in `CatalogProfile`; `OMB_SPACE` read; `...SPACE_TOOL_DEFINITIONS`; filter off unless `space` |
| `server/drivers/agents-call.ts` | 14, 183 | import; `SPACE_TOOL_NAMES` dispatch |
| `server/drivers/agents-mcp-env.ts` | 6 | `"OMB_SPACE"` in `AGENTS_MCP_ENV` |
| `server/drivers/agents-catalog-wire.test.ts` | 53, 67, 92 | new profile `skills+shared+voice+escalations+x+space`, now `FULL`; its budget |
| `server/drivers/agents-bridge-wire.test.ts` | 64, 73, 100 | its bridged twin, `FULL`, budget |
| `server/drivers/agents-catalog-goldens/*.json` | — | regenerated with `UPDATE_AGENTS_CATALOG_GOLDENS=1` (only the new profile and the full list change) |
| `src/lib/computer-panel-view.ts` | 1, 3, 5, 7–9, 27 | `"page"` view, `hasPage` in the tab context, stored-view check |
| `src/components/computer-panel-tabs.ts` | 2, 13 | `PanelsTopLeft` icon, `page` tab |
| `src/components/ComputerPanel.tsx` | 11, 262–263, 1300 | import; `hasPage` from the open thread; `page` branch |
| `src/components/app/AppMessage.tsx` | 12, 94, 197 | import `usePanelPageId`; `inPanel`; pill instead of the frame |
| `src/components/TeamMapPage.tsx` | 19, 273, 363, 393, 406 | import; `useQuestBoard()`; `<QuestBoardToggle />`; board branch; hide `MapComposer` |
| `src/components/TeamCanvas.tsx` | 30 | `export` on `BotCard`, so Space tiles show the same bot cards |
| `electron-builder.yml` | 18 | `publish.owner: quorentindupres-dev`: the app's update feed is this fork's GitHub releases, never upstream's |
| `src/locales/en.json` | end | `computer.tab.page`, `quest.*` (other languages fall back to English) |
| `src/components/BrowserSettingsRows.tsx` | 57–99 (removed) | the experimental "New browser" switch (`NewBrowserSettings`) |
| `src/components/BrowserSettingsRows.test.ts` | deleted | it only tested that switch |
| `src/components/SettingsModal.tsx` | 28, 542 | its import and mount removed |
| `src/locales/{en,es,ja,pt-br}.json`, `source-hashes.json` | — | `settings.experimental.newBrowser*` removed |

The built-in browser's other code and `browserEngine.engine` are unchanged.
Not touched: `src/state/store.tsx`, `server/config.ts`, the ratchet tests.

## Not in this version

Resizing tiles (they size to their cards), live SSE frames (the board polls every
3 s), Kanban write-back (a Yes does not file a Kanban proposal), the room
prompt. The map is proven by render tests (happy-dom) and the HTTP API, not in
a real browser.

## Updates of the desktop app

The packaged app reads its update feed from `electron-builder.yml`'s `publish`
(baked into `app-update.yml`). It points at `quorentindupres-dev/OpenMausBot`,
so an installed build never pulls an upstream release. With no release there,
the hourly check finds nothing (a failed automatic check stays quiet). To ship an
update to yourself, publish a GitHub release on the fork with the `latest-mac.yml`
and zips that `pnpm package:mac` writes to `release/`. The server's "newer
version" notice (`server/update-check.ts`) still reads upstream's latest tag; it
only informs, it never installs.

## Run it locally

```sh
pnpm install
pnpm dev:server     # the server, from source (uses ~/.openmausbot)
pnpm dev            # the Vite renderer, in a second terminal
pnpm dev:desktop    # or the Electron desktop app
```

Add the env above to the `pnpm dev:server` shell to turn on the mirror and the
Kanban import. Verify without touching your data:
`node --experimental-strip-types scripts/control-omb.ts launch` (see
`docs/verification/README.md`).
