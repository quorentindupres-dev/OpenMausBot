import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ROOT, loadManifest, pluginApply, pluginSnapshot, pluginStatus } from "./xlabs-plugin.mjs";

const scriptPath = fileURLToPath(new URL("./xlabs-plugin.mjs", import.meta.url));
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "omb-xlabs-plugin-"));
  tempDirs.push(dir);
  return dir;
}

function writeText(root: string, relPath: string, content: string): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

describe("xlabs-spaces portable plugin system", () => {
  it("reports ok: true with all owned files and seams present on the real repo root via status --json", () => {
    const status = pluginStatus(DEFAULT_ROOT);
    expect(status.ok).toBe(true);
    expect(status.id).toBe("xlabs-spaces");
    expect(status.version).toBe("2.0.0");
    expect(status.ownedPresent).toBe(status.ownedTotal);
    expect(status.ownedTotal).toBe(9);
    expect(status.seamsPresent).toBe(status.seamsTotal);
    expect(status.seamsTotal).toBe(15);
    expect(status.missing).toEqual([]);

    const cli = spawnSync(process.execPath, [scriptPath, "status", "--json"], {
      cwd: DEFAULT_ROOT,
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(cli.error).toBeUndefined();
    expect(cli.status, cli.stderr).toBe(0);
    const parsed = JSON.parse(cli.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.ownedPresent).toBe(9);
    expect(parsed.seamsPresent).toBe(15);
    expect(parsed.missing).toEqual([]);
  });

  it("snapshots owned files and seams, detects missing items when wiped, and restores ok: true idempotently on apply", () => {
    const root = createTempRoot();
    const manifest = loadManifest(DEFAULT_ROOT);

    writeText(root, "src/components/space/QuestBoard.tsx", "export function QuestBoard() { return null; }\n");
    writeText(root, "src/components/space/PagePanel.tsx", "export function PagePanel() { return null; }\n");
    writeText(root, "server/space/store.ts", "export const spaceStore = () => ({});\n");
    writeText(root, "server/agent-computers/pool.ts", "export const createComputerPool = () => ({});\n");
    writeText(root, "shared/space.ts", "export interface SpaceGoal { id: string }\n");
    writeText(root, "shared/agent-computers.ts", "export const AGENT_COMPUTER_PROVIDER_CATALOG = [];\n");
    writeText(root, "server/routes/space.ts", "export const spaceRoutes = async () => {};\n");
    writeText(root, "server/drivers/agents-space-tools.ts", "export const SPACE_TOOL_DEFINITIONS = [];\n");
    writeText(root, "scripts/setup-agent-mac.sh", "#!/usr/bin/env bash\necho ok\n");
    writeText(root, "docs/agent-computers-cua.md", "# Agent Computers\n");

    for (const seam of manifest.seams) {
      const patches = seam.patches ?? [];
      if (patches.length > 0) {
        const body = patches.map((p: { replace: string }) => p.replace).join("\n");
        writeText(root, seam.file, `${body}\n`);
      } else {
        writeText(root, seam.file, `// ${seam.marker}\n`);
      }
    }

    const snap = pluginSnapshot(root);
    expect(snap.ok).toBe(true);
    expect(snap.bundleReady).toBe(true);
    expect(snap.ownedPresent).toBe(9);
    expect(snap.seamsPresent).toBe(15);

    // Simulate an upstream git reset / pull that wipes owned dirs/files and strips seam markers
    for (const dir of manifest.ownedDirs) {
      rmSync(join(root, dir), { recursive: true, force: true });
    }
    for (const file of manifest.ownedFiles) {
      rmSync(join(root, file), { force: true });
    }
    for (const seam of manifest.seams) {
      const patches = seam.patches ?? [];
      if (patches.length > 0) {
        const upstreamBody = patches.map((p: { find: string }) => p.find).join("\n");
        writeText(root, seam.file, `${upstreamBody}\n`);
      } else {
        writeText(root, seam.file, "// upstream file without marker\n");
      }
    }

    const brokenStatus = pluginStatus(root);
    expect(brokenStatus.ok).toBe(false);
    expect(brokenStatus.ownedPresent).toBe(0);
    expect(brokenStatus.seamsPresent).toBe(0);
    expect(brokenStatus.missing.length).toBe(
      manifest.ownedDirs.length + manifest.ownedFiles.length + manifest.seams.length,
    );

    // First apply restores owned files and injects all seam hooks
    const applied = pluginApply(root);
    expect(applied.ok).toBe(true);
    expect(applied.ownedPresent).toBe(9);
    expect(applied.seamsPresent).toBe(15);
    expect(applied.missing).toEqual([]);
    expect(applied.restoredOwned).toBeGreaterThan(0);
    expect(applied.seamsApplied).toBe(15);
    expect(existsSync(join(root, "src/components/space/QuestBoard.tsx"))).toBe(true);
    expect(existsSync(join(root, "shared/space.ts"))).toBe(true);
    expect(existsSync(join(root, "shared/agent-computers.ts"))).toBe(true);
    expect(existsSync(join(root, "server/agent-computers/pool.ts"))).toBe(true);

    // Capture file contents after first apply
    const afterFirstApply = new Map<string, string>();
    for (const seam of manifest.seams) {
      afterFirstApply.set(seam.file, readFileSync(join(root, seam.file), "utf8"));
    }

    // Second apply is a strict no-op (idempotent)
    const secondApply = pluginApply(root);
    expect(secondApply.ok).toBe(true);
    expect(secondApply.restoredOwned).toBe(0);
    expect(secondApply.seamsApplied).toBe(0);
    for (const seam of manifest.seams) {
      expect(readFileSync(join(root, seam.file), "utf8")).toBe(afterFirstApply.get(seam.file));
    }
  });

  it("falls back to bundle snapshot when a mock seam file does not contain upstream patch anchors", () => {
    const root = createTempRoot();
    const manifest = loadManifest(DEFAULT_ROOT);

    writeText(root, "src/components/space/QuestBoard.tsx", "export const QuestBoard = 1;\n");
    writeText(root, "server/space/store.ts", "export const store = 1;\n");
    writeText(root, "server/agent-computers/pool.ts", "export const pool = 1;\n");
    writeText(root, "shared/space.ts", "export const space = 1;\n");
    writeText(root, "shared/agent-computers.ts", "export const computers = 1;\n");
    writeText(root, "server/routes/space.ts", "export const route = 1;\n");
    writeText(root, "server/drivers/agents-space-tools.ts", "export const tools = 1;\n");
    writeText(root, "scripts/setup-agent-mac.sh", "#!/usr/bin/env bash\n");
    writeText(root, "docs/agent-computers-cua.md", "# Docs\n");

    for (const seam of manifest.seams) {
      writeText(root, seam.file, `/* custom mock with ${seam.marker} */\n`);
    }

    const snapCli = spawnSync(process.execPath, [scriptPath, "snapshot", "--root", root, "--json"], {
      cwd: DEFAULT_ROOT,
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(snapCli.status, snapCli.stderr).toBe(0);

    // Overwrite seam files with stripped mock content that lacks patch.find anchors
    for (const seam of manifest.seams) {
      writeText(root, seam.file, "/* stripped mock */\n");
    }

    const applyCli = spawnSync(process.execPath, [scriptPath, "apply", "--root", root, "--json"], {
      cwd: DEFAULT_ROOT,
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(applyCli.status, applyCli.stderr).toBe(0);
    const result = JSON.parse(applyCli.stdout);
    expect(result.ok).toBe(true);
    expect(result.seamsPresent).toBe(15);
    expect(result.seamsApplied).toBe(15);
  });
});
