import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ROOT,
  loadManifest,
  pluginApply,
  pluginDoctor,
  pluginRemove,
  pluginSnapshot,
  pluginStatus,
  pluginVerifyDiff,
  threeWayMerge,
} from "./xlabs-plugin.mjs";

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
    expect(status.ownedTotal).toBe(12);
    expect(status.seamsPresent).toBe(status.seamsTotal);
    expect(status.seamsTotal).toBe(25);
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
    expect(parsed.ownedPresent).toBe(12);
    expect(parsed.seamsPresent).toBe(25);
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
    writeText(root, "docs/xlabs/README.md", "# X-Labs\n");
    writeText(root, "server/drivers/agents-space-tools.test.ts", "// space tools test\n");
    writeText(root, "server/routes/space.test.ts", "// space routes test\n");

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
    expect(snap.ownedPresent).toBe(12);
    expect(snap.seamsPresent).toBe(25);

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
    expect(applied.ownedPresent).toBe(12);
    expect(applied.seamsPresent).toBe(25);
    expect(applied.missing).toEqual([]);
    expect(applied.restoredOwned).toBeGreaterThan(0);
    expect(applied.seamsApplied).toBe(25);
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

    // Remove strips owned files, reverts seams, and restores deleted files
    const removed = pluginRemove(root);
    expect(removed.ok).toBe(true);
    expect(removed.ownedPresent).toBe(0);
    expect(existsSync(join(root, "src/components/space/QuestBoard.tsx"))).toBe(false);
    expect(pluginStatus(root).ok).toBe(false);

    // Apply after remove restores the full plugin again
    const reapplied = pluginApply(root);
    expect(reapplied.ok).toBe(true);
    expect(reapplied.missing).toEqual([]);
  });

  it("refuses to overwrite a file when neither the anchors nor a merge can apply the seam", () => {
    const root = createTempRoot();
    const manifest = loadManifest(DEFAULT_ROOT);

    for (const dir of manifest.ownedDirs) writeText(root, join(dir, "placeholder.ts"), "export const x = 1;\n");
    for (const file of manifest.ownedFiles) writeText(root, file, "// owned\n");

    for (const seam of manifest.seams) {
      writeText(
        root,
        seam.file,
        seam.markerMode === "absent" ? "/* custom mock without plugin */\n" : `/* custom mock with ${seam.marker} */\n`,
      );
    }

    const snapCli = spawnSync(process.execPath, [scriptPath, "snapshot", "--root", root, "--json"], {
      cwd: DEFAULT_ROOT,
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(snapCli.status, snapCli.stderr).toBe(0);

    // Upstream rewrote the file completely: no marker, no anchor, merge cannot help
    const stripped = new Map<string, string>();
    for (const seam of manifest.seams) {
      const body = seam.markerMode === "absent" ? `/* stripped mock with ${seam.marker} */` : "/* stripped mock */";
      stripped.set(seam.file, body);
      writeText(root, seam.file, body);
    }

    const applyCli = spawnSync(process.execPath, [scriptPath, "apply", "--root", root, "--repair", "--json"], {
      cwd: DEFAULT_ROOT,
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(applyCli.status).toBe(1);
    const result = JSON.parse(applyCli.stdout);
    expect(result.ok).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
    // No silent whole-file overwrite: every stripped file is still exactly as upstream left it
    for (const seam of manifest.seams) {
      expect(readFileSync(join(root, seam.file), "utf8")).toBe(stripped.get(seam.file));
    }
  });

  it("never reverts upstream: a conflicting seam is reported and the upstream file is kept", () => {
    const root = createTempRoot();
    const manifest = loadManifest(DEFAULT_ROOT);

    for (const dir of manifest.ownedDirs) writeText(root, join(dir, "placeholder.ts"), "export const x = 1;\n");
    for (const file of manifest.ownedFiles) writeText(root, file, "// owned\n");

    for (const seam of manifest.seams) {
      const patches = seam.patches ?? [];
      writeText(
        root,
        seam.file,
        patches.length > 0 ? patches.map((p: { replace: string }) => p.replace).join("\n") : `// ${seam.marker}`,
      );
    }

    expect(pluginSnapshot(root).ok).toBe(true);

    const target = manifest.seams.find((seam: { file: string }) => seam.file === "electron-builder.yml") as {
      file: string;
      patches: { find: string; replace: string }[];
    };
    const upstream = `${target.patches[0].find.replace("repo: OpenMausBot", "repo: OpenMausBotRenamed")}\nextra: true\n`;
    writeText(root, target.file, upstream);

    const cli = spawnSync(process.execPath, [scriptPath, "apply", "--root", root, "--repair", "--json"], {
      cwd: DEFAULT_ROOT,
      encoding: "utf8",
      timeout: 10_000,
    });
    const result = JSON.parse(cli.stdout);
    const conflict = result.failures.find((f: { file: string }) => f.file === target.file);
    expect(conflict?.state).toBe("merge-conflict");
    // The upstream file is untouched — no old snapshot silently replaces it
    expect(readFileSync(join(root, target.file), "utf8")).toBe(upstream);
  });

  it("3-way merge keeps our hunk and the upstream change when they do not overlap", () => {
    const base = "line1\nline2\nline3\nline4\nline5\n";
    const ours = "line1\nline2\nline3\nline4\nline5\nOURS: plugin line\n";
    const theirs = "UPSTREAM: new first line\nline1\nline2\nline3\nline4\nline5\n";
    const result = threeWayMerge(ours, base, theirs);
    expect(result.ok).toBe(true);
    expect(result.content).toContain("OURS: plugin line");
    expect(result.content).toContain("UPSTREAM: new first line");
    expect(result.content).not.toContain("<<<<<<<");
  });

  it("doctor reports every seam applied on the real repo root and exits 0", () => {
    const report = pluginDoctor(DEFAULT_ROOT);
    expect(report.ok).toBe(true);
    expect(report.counts.conflict).toBe(0);
    expect(report.counts.missingFile).toBe(0);
    expect(report.counts.applied).toBe(25);

    const cli = spawnSync(process.execPath, [scriptPath, "doctor", "--json"], {
      cwd: DEFAULT_ROOT,
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(cli.status, cli.stderr).toBe(0);
    expect(JSON.parse(cli.stdout).counts.conflict).toBe(0);
  });

  it("apply --repair reports a broken anchor, leaves that file untouched, and writes .repair.json", () => {
    const root = createTempRoot();
    const manifest = loadManifest(DEFAULT_ROOT);

    for (const dir of manifest.ownedDirs) writeText(root, join(dir, "placeholder.ts"), "export const x = 1;\n");
    for (const file of manifest.ownedFiles) writeText(root, file, "// owned\n");

    const target = manifest.seams.find((seam: { markerMode?: string; patches?: unknown[] }) =>
      seam.markerMode !== "absent" && (seam.patches ?? []).length > 0,
    ) as { file: string; marker: string; patches: { replace: string; find: string }[] };

    for (const seam of manifest.seams) {
      const patches = seam.patches ?? [];
      writeText(
        root,
        seam.file,
        patches.length > 0 ? patches.map((p: { replace: string }) => p.replace).join("\n") : `// ${seam.marker}`,
      );
    }

    expect(pluginSnapshot(root).ok).toBe(true);
    rmSync(join(root, "plugins/xlabs-spaces/bundle/.seams.json"), { force: true });

    const broken = `${target.marker}\n`;
    writeText(root, target.file, broken);

    const cli = spawnSync(process.execPath, [scriptPath, "apply", "--root", root, "--repair", "--json"], {
      cwd: DEFAULT_ROOT,
      encoding: "utf8",
      timeout: 10_000,
    });
    const result = JSON.parse(cli.stdout);
    expect(result.failures.map((f: { file: string }) => f.file)).toContain(target.file);
    expect(result.failures[0].missingPatches.length).toBeGreaterThan(0);
    expect(readFileSync(join(root, target.file), "utf8")).toBe(broken);
    expect(existsSync(join(root, "plugins/xlabs-spaces/bundle/.repair.json"))).toBe(true);
  });

  it("verify-diff flags a path outside the plugin allowlist and accepts an owned path", () => {
    const root = createTempRoot();
    const git = (...args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    expect(git("init", "-q", "-b", "main").status).toBe(0);
    git("config", "user.email", "test@example.test");
    git("config", "user.name", "test");
    writeText(root, "README.md", "base\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");

    writeText(root, "src/components/space/QuestBoard.tsx", "export const q = 1;\n");
    git("checkout", "-q", "-b", "xlabs");
    git("add", "-A");
    git("commit", "-q", "-m", "owned");

    const ownedOnly = pluginVerifyDiff(root, { base: "main", head: "xlabs" });
    expect(ownedOnly.ok).toBe(true);
    expect(ownedOnly.changed).toBe(1);

    writeText(root, "src/unrelated.ts", "export const nope = 1;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "outside");
    const withStray = pluginVerifyDiff(root, { base: "main", head: "xlabs" });
    expect(withStray.ok).toBe(false);
    expect(withStray.unexpected).toEqual(["src/unrelated.ts"]);
  });

});
