# CHECKLIST — prove the layer is complete

Run from the repo root. Every line is a gate; a rebuild is done when all pass.

## 1. Layer is present and coherent

```bash
node scripts/xlabs-plugin.mjs status --json     # ok:true, owned 12/12, seams N/N
node scripts/xlabs-plugin.mjs doctor --json     # conflicts: 0
```

## 2. The host runs our wiring

```bash
npm run typecheck
npx vitest run scripts/xlabs-plugin.test.ts
npx vitest run server/space server/routes/space.test.ts server/agent-computers \
  src/components/space
npm run build
```

## 3. The layer is reversible

```bash
node scripts/xlabs-plugin.mjs remove --json
git status --porcelain                          # only untracked build output
node scripts/xlabs-plugin.mjs apply --json      # idempotent, ok:true
```

## 4. The layer is the only difference

```bash
node scripts/xlabs-plugin.mjs verify-diff --base main --head xlabs
```

## 5. Feature spot-checks (manual, 10 minutes)

- [ ] Spaces toggle on the Team map; create a Space, set P1, resize, reload →
      layout kept.
- [ ] Drag a bot into a Space → its thread card appears; drag again → second
      card; click a card → chat opens in the side drawer.
- [ ] Add an outcome, tick it from a bot note → board updates within 3 s.
- [ ] Ask from a bot appears in Asks; **Yes** turns it into an assigned task.
- [ ] Open a bot page → Page tab shows it once, chat row shows the pill.
- [ ] Canvas: add a note, resize from a corner, recolor, add an arrow, reload.
- [ ] Hire an A01 role → bot appears placed; a fake role id returns 400.
- [ ] C02 project readiness renders 7 pillars.
- [ ] Computer pool: lease → exec `echo ok` → preview → release.

## 6. Sync loop

```bash
node scripts/xlabs-plugin.mjs sync --base upstream/main
```
