import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(SCRIPT_DIR, "..");
const MANIFEST_REL = join("plugins", "xlabs-spaces", "plugin.json");
const BUNDLE_REL = join("plugins", "xlabs-spaces", "bundle");

export function loadManifest(root = DEFAULT_ROOT) {
  const localPath = join(root, MANIFEST_REL);
  const manifestPath = existsSync(localPath) ? localPath : join(DEFAULT_ROOT, MANIFEST_REL);
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function resolveSeamFile(root, seam) {
  if (existsSync(join(root, seam.file))) return seam.file;
  if (seam.altFile && existsSync(join(root, seam.altFile))) return seam.altFile;
  return seam.file;
}

function isDirPopulated(dirPath) {
  if (!existsSync(dirPath)) return false;
  try {
    return statSync(dirPath).isDirectory() && readdirSync(dirPath).length > 0;
  } catch {
    return false;
  }
}

function isFilePresent(filePath) {
  if (!existsSync(filePath)) return false;
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function pluginStatus(root = DEFAULT_ROOT) {
  const manifest = loadManifest(root);
  const missing = [];
  let ownedPresent = 0;
  const ownedTotal = manifest.ownedDirs.length + manifest.ownedFiles.length;

  for (const dir of manifest.ownedDirs) {
    if (isDirPopulated(join(root, dir))) {
      ownedPresent += 1;
    } else {
      missing.push(dir);
    }
  }

  for (const file of manifest.ownedFiles) {
    if (isFilePresent(join(root, file))) {
      ownedPresent += 1;
    } else {
      missing.push(file);
    }
  }

  let seamsPresent = 0;
  const seamsTotal = manifest.seams.length;
  for (const seam of manifest.seams) {
    const relFile = resolveSeamFile(root, seam);
    const absFile = join(root, relFile);
    const content = isFilePresent(absFile) ? readFileSync(absFile, "utf8") : null;
    const applied =
      content !== null &&
      (seam.markerMode === "absent" ? !content.includes(seam.marker) : content.includes(seam.marker));
    if (applied) {
      seamsPresent += 1;
    } else {
      missing.push(seam.file);
    }
  }

  const deletedFiles = manifest.deletedFiles ?? [];
  let deletedAbsent = 0;
  for (const file of deletedFiles) {
    if (!isFilePresent(join(root, file))) {
      deletedAbsent += 1;
    } else {
      missing.push(file);
    }
  }

  const bundleDir = join(root, BUNDLE_REL);
  const bundleReady = isFilePresent(join(bundleDir, ".snapshot.json"));
  const ok = ownedPresent === ownedTotal && seamsPresent === seamsTotal && deletedAbsent === deletedFiles.length;

  return {
    ok,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    ownedPresent,
    ownedTotal,
    seamsPresent,
    seamsTotal,
    filesPresent: ownedPresent,
    hooksApplied: seamsPresent,
    deletedAbsent,
    deletedTotal: deletedFiles.length,
    bundleReady,
    missing,
  };
}

function copyTreeFiles(srcDir, dstDir) {
  let copied = 0;
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    const dstPath = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copied += copyTreeFiles(srcPath, dstPath);
    } else if (entry.isFile()) {
      const srcBytes = readFileSync(srcPath);
      if (!isFilePresent(dstPath) || !readFileSync(dstPath).equals(srcBytes)) {
        mkdirSync(dirname(dstPath), { recursive: true });
        writeFileSync(dstPath, srcBytes);
        copied += 1;
      }
    }
  }
  return copied;
}

function collectTreeFiles(baseDir, relDir, out = {}) {
  const absDir = join(baseDir, relDir);
  if (!existsSync(absDir)) return out;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const childRel = join(relDir, entry.name);
    const childAbs = join(baseDir, childRel);
    if (entry.isDirectory()) {
      collectTreeFiles(baseDir, childRel, out);
    } else if (entry.isFile()) {
      out[childRel] = readFileSync(childAbs, "utf8");
    }
  }
  return out;
}

export function pluginSnapshot(root = DEFAULT_ROOT) {
  const manifest = loadManifest(root);
  const manifestDst = join(root, MANIFEST_REL);
  if (!existsSync(manifestDst)) {
    mkdirSync(dirname(manifestDst), { recursive: true });
    writeFileSync(manifestDst, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  const bundleDir = join(root, BUNDLE_REL);
  mkdirSync(bundleDir, { recursive: true });

  const ownedSnapshot = {};
  for (const dir of manifest.ownedDirs) {
    if (isDirPopulated(join(root, dir))) {
      collectTreeFiles(root, dir, ownedSnapshot);
    }
  }

  for (const file of manifest.ownedFiles) {
    const src = join(root, file);
    if (isFilePresent(src)) {
      ownedSnapshot[file] = readFileSync(src, "utf8");
    }
  }

  const seamsSnapshot = {};
  for (const seam of manifest.seams) {
    const relFile = resolveSeamFile(root, seam);
    const src = join(root, relFile);
    if (isFilePresent(src)) {
      seamsSnapshot[seam.file] = readFileSync(src, "utf8");
    }
  }

  const deletedPath = join(bundleDir, ".deleted.json");
  const fallbackDeletedPath = join(DEFAULT_ROOT, BUNDLE_REL, ".deleted.json");
  // The manifest is the only truth: a stale bundle snapshot must never claim a
  // file is deleted when plugin.json no longer lists it.
  let deletedSnapshot = {};
  if ((manifest.deletedFiles ?? []).length > 0) {
    for (const candidate of [deletedPath, fallbackDeletedPath]) {
      if (isFilePresent(candidate)) {
        try {
          deletedSnapshot = JSON.parse(readFileSync(candidate, "utf8"));
          break;
        } catch {
          deletedSnapshot = {};
        }
      }
    }
    for (const file of Object.keys(deletedSnapshot)) {
      if (!(manifest.deletedFiles ?? []).includes(file)) delete deletedSnapshot[file];
    }
  }
  writeFileSync(deletedPath, `${JSON.stringify(deletedSnapshot, null, 2)}\n`, "utf8");
  writeFileSync(join(bundleDir, ".owned.json"), `${JSON.stringify(ownedSnapshot, null, 2)}\n`, "utf8");
  writeFileSync(join(bundleDir, ".seams.json"), `${JSON.stringify(seamsSnapshot, null, 2)}\n`, "utf8");
  writeFileSync(
    join(bundleDir, ".snapshot.json"),
    `${JSON.stringify(
      {
        id: manifest.id,
        version: manifest.version,
        ownedDirs: manifest.ownedDirs,
        ownedFiles: manifest.ownedFiles,
        ownedFileCount: Object.keys(ownedSnapshot).length,
        deletedFiles: manifest.deletedFiles ?? [],
        seams: manifest.seams.map((seam) => seam.file),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return pluginStatus(root);
}

function isSeamApplied(content, seam) {
  if (seam.markerMode === "absent") {
    if (content.includes(seam.marker)) return false;
  } else if (!content.includes(seam.marker)) {
    return false;
  }
  // Marker alone is not proof: every replacement must be present, otherwise the
  // seam is half-applied (upstream moved the block) and must be re-anchored.
  for (const patch of seam.patches ?? []) {
    if (patch.replace && !content.includes(patch.replace)) return false;
  }
  return true;
}

/** Undo our own patches on a snapshot, recovering the upstream file it was built from. */
export function reverseSeam(content, seam) {
  let base = content;
  for (const patch of [...(seam.patches ?? [])].reverse()) {
    if (patch.replace && base.includes(patch.replace)) {
      base = base.replace(patch.replace, patch.find);
    }
  }
  return base;
}

/** git's 3-way merge: our hunks (base -> ours) rebased onto the new upstream (theirs). */
export function threeWayMerge(ours, base, theirs) {
  if (ours === base) return { ok: true, content: theirs, conflicts: 0 };
  const dir = mkdtempSync(join(tmpdir(), "xlabs-merge-"));
  try {
    const oursPath = join(dir, "ours");
    const basePath = join(dir, "base");
    const theirsPath = join(dir, "theirs");
    writeFileSync(oursPath, ours, "utf8");
    writeFileSync(basePath, base, "utf8");
    writeFileSync(theirsPath, theirs, "utf8");
    const res = spawnSync("git", ["merge-file", "-p", "--diff3", oursPath, basePath, theirsPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (res.error) return { ok: false, content: theirs, conflicts: 1, error: String(res.error) };
    const content = res.stdout ?? "";
    const conflicts = (content.match(/^<<<<<<< /gm) ?? []).length;
    if (res.status !== 0 || conflicts > 0) return { ok: false, content: theirs, conflicts };
    return { ok: true, content, conflicts: 0 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function seamSatisfied(content, seam) {
  return seam.markerMode === "absent" ? !content.includes(seam.marker) : content.includes(seam.marker);
}

export function pluginApply(root = DEFAULT_ROOT, options = {}) {
  const { repair = false } = options;
  const manifest = loadManifest(root);
  const localBundle = join(root, BUNDLE_REL);
  const bundleDir = existsSync(localBundle) ? localBundle : join(DEFAULT_ROOT, BUNDLE_REL);
  const ownedBundleDir = join(bundleDir, "owned");
  const seamsBundleDir = join(bundleDir, "seams");

  const writes = new Map();
  const chmods = [];
  const failures = [];
  const fallbacks = [];
  let restoredOwned = 0;

  const ownedJsonPath = join(bundleDir, ".owned.json");
  if (isFilePresent(ownedJsonPath)) {
    const ownedSnapshot = JSON.parse(readFileSync(ownedJsonPath, "utf8"));
    for (const [relPath, content] of Object.entries(ownedSnapshot)) {
      const dstFile = join(root, relPath);
      if (!isFilePresent(dstFile) || readFileSync(dstFile, "utf8") !== content) {
        writes.set(relPath, String(content));
        if (relPath.endsWith(".sh")) chmods.push(relPath);
        restoredOwned += 1;
      }
    }
  } else {
    for (const dir of manifest.ownedDirs) {
      const srcDir = join(ownedBundleDir, dir);
      if (isDirPopulated(srcDir)) {
        restoredOwned += copyTreeFiles(srcDir, join(root, dir));
      }
    }
    for (const file of manifest.ownedFiles) {
      const srcFile = join(ownedBundleDir, file);
      const dstFile = join(root, file);
      if (isFilePresent(srcFile)) {
        const srcBytes = readFileSync(srcFile);
        if (!isFilePresent(dstFile) || !readFileSync(dstFile).equals(srcBytes)) {
          mkdirSync(dirname(dstFile), { recursive: true });
          writeFileSync(dstFile, srcBytes);
          if (file.endsWith(".sh")) chmodSync(dstFile, 0o755);
          restoredOwned += 1;
        }
      }
    }
  }

  let seamsSnapshot = {};
  const seamsJsonPath = join(bundleDir, ".seams.json");
  if (isFilePresent(seamsJsonPath)) {
    try {
      seamsSnapshot = JSON.parse(readFileSync(seamsJsonPath, "utf8"));
    } catch {
      seamsSnapshot = {};
    }
  }

  let seamsApplied = 0;
  for (const seam of manifest.seams) {
    const relFile = resolveSeamFile(root, seam);
    const absFile = join(root, relFile);
    const current = isFilePresent(absFile) ? readFileSync(absFile, "utf8") : null;

    if (current !== null && isSeamApplied(current, seam)) {
      continue;
    }

    let next = current ?? "";
    const missing = [];
    if (current !== null) {
      for (const patch of seam.patches ?? []) {
        // An empty replace (a deletion seam) can never be "already applied";
        // includes("") is always true and used to skip the whole patch.
        if (patch.replace && next.includes(patch.replace)) continue;
        if (next.includes(patch.find)) {
          next = next.replace(patch.find, patch.replace);
        } else {
          missing.push(patch.find.split("\n")[0].slice(0, 100));
        }
      }
    } else {
      missing.push("<file missing>");
    }

    let usedFallback = false;
    let merged = false;
    let mergeConflicts = 0;
    if (missing.length > 0 || !seamSatisfied(next, seam)) {
      const bundledSeamPath = join(seamsBundleDir, seam.file);
      const snapshot = isFilePresent(bundledSeamPath)
        ? readFileSync(bundledSeamPath, "utf8")
        : seamsSnapshot[seam.file];
      if (typeof snapshot === "string" && seamSatisfied(snapshot, seam)) {
        if (missing.length > 0 && current !== null) {
          // Upstream moved the anchor: rebase our hunks onto the new file instead of
          // overwriting it with an old snapshot (which silently reverts upstream work).
          const base = reverseSeam(snapshot, seam);
          const result = threeWayMerge(snapshot, base, current);
          if (!result.ok) {
            failures.push({
              file: seam.file,
              marker: seam.marker,
              state: "merge-conflict",
              missingPatches: missing,
              conflicts: result.conflicts,
            });
            continue;
          }
          next = result.content;
          merged = true;
        } else {
          next = snapshot;
        }
        usedFallback = true;
      }
    }

    if (next && next !== current && seamSatisfied(next, seam)) {
      writes.set(relFile, next);
      seamsApplied += 1;
      if (usedFallback) {
        fallbacks.push({
          file: seam.file,
          marker: seam.marker,
          reason: missing.length > 0 ? "anchor-miss" : "marker-missing",
          merged,
          conflicts: mergeConflicts,
        });
      }
    } else {
      failures.push({
        file: seam.file,
        marker: seam.marker,
        state: current === null ? "missing-file" : "unapplied",
        missingPatches: missing,
      });
    }
  }

  let deletedRemoved = 0;
  const deletions = new Set();
  for (const file of manifest.deletedFiles ?? []) {
    if (isFilePresent(join(root, file))) {
      deletions.add(file);
      deletedRemoved += 1;
    }
  }

  // Commit the whole plan at once: a failed run never leaves a half-patched tree.
  for (const [relPath, content] of writes) {
    const dstFile = join(root, relPath);
    mkdirSync(dirname(dstFile), { recursive: true });
    writeFileSync(dstFile, content, "utf8");
  }
  for (const relPath of chmods) {
    chmodSync(join(root, relPath), 0o755);
  }
  for (const relPath of deletions) {
    rmSync(join(root, relPath), { force: true });
  }

  if (repair) {
    const report = {
      at: new Date().toISOString(),
      root,
      applied: seamsApplied,
      restoredOwned,
      failures,
      fallbacks,
    };
    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(join(bundleDir, ".repair.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return {
    ...pluginStatus(root),
    restoredOwned,
    seamsApplied,
    deletedRemoved,
    failures,
    fallbacks,
  };
}

export function pluginRemove(root = DEFAULT_ROOT) {
  const manifest = loadManifest(root);
  const localBundle = join(root, BUNDLE_REL);
  const bundleDir = existsSync(localBundle) ? localBundle : join(DEFAULT_ROOT, BUNDLE_REL);

  let removedOwned = 0;
  const ownedJsonPath = join(bundleDir, ".owned.json");
  const ownedPaths = new Set(manifest.ownedFiles);
  if (isFilePresent(ownedJsonPath)) {
    try {
      for (const relPath of Object.keys(JSON.parse(readFileSync(ownedJsonPath, "utf8")))) {
        ownedPaths.add(relPath);
      }
    } catch {
      // fall through to manifest-only removal
    }
  }
  for (const relPath of ownedPaths) {
    const absFile = join(root, relPath);
    if (isFilePresent(absFile)) {
      rmSync(absFile, { force: true });
      removedOwned += 1;
    }
  }
  for (const dir of manifest.ownedDirs) {
    const absDir = join(root, dir);
    if (existsSync(absDir)) {
      rmSync(absDir, { recursive: true, force: true });
    }
  }

  let seamsReverted = 0;
  for (const seam of manifest.seams) {
    const relFile = resolveSeamFile(root, seam);
    const absFile = join(root, relFile);
    if (!isFilePresent(absFile)) continue;
    const current = readFileSync(absFile, "utf8");
    let next = current;
    for (const patch of [...(seam.patches ?? [])].reverse()) {
      if (patch.replace && next.includes(patch.replace)) {
        next = next.replace(patch.replace, patch.find);
      }
    }
    if (next !== current) {
      writeFileSync(absFile, next, "utf8");
      seamsReverted += 1;
    }
  }

  let restoredDeleted = 0;
  const deletedCandidates = [join(bundleDir, ".deleted.json"), join(DEFAULT_ROOT, BUNDLE_REL, ".deleted.json")];
  let deletedSnapshot = null;
  for (const candidate of deletedCandidates) {
    if (isFilePresent(candidate)) {
      try {
        deletedSnapshot = JSON.parse(readFileSync(candidate, "utf8"));
        break;
      } catch {
        deletedSnapshot = null;
      }
    }
  }
  if (deletedSnapshot && (manifest.deletedFiles ?? []).length > 0) {
    for (const [relPath, content] of Object.entries(deletedSnapshot)) {
      if (!(manifest.deletedFiles ?? []).includes(relPath)) continue;
      const absFile = join(root, relPath);
      if (!isFilePresent(absFile) || readFileSync(absFile, "utf8") !== content) {
        mkdirSync(dirname(absFile), { recursive: true });
        writeFileSync(absFile, String(content), "utf8");
        restoredDeleted += 1;
      }
    }
  }

  const after = pluginStatus(root);
  let seamsClean = 0;
  for (const seam of manifest.seams) {
    const relFile = resolveSeamFile(root, seam);
    const absFile = join(root, relFile);
    if (!isFilePresent(absFile)) continue;
    const content = readFileSync(absFile, "utf8");
    if (seam.markerMode === "absent" ? content.includes(seam.marker) : !content.includes(seam.marker)) {
      seamsClean += 1;
    }
  }
  const removedOk =
    after.ownedPresent === 0 &&
    seamsClean === manifest.seams.length &&
    (manifest.deletedFiles ?? []).every((file) => isFilePresent(join(root, file)));

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    ok: removedOk,
    removedOwned,
    seamsReverted,
    restoredDeleted,
    seamsClean,
    seamsTotal: manifest.seams.length,
    ownedPresent: after.ownedPresent,
    ownedTotal: after.ownedTotal,
  };
}

export function pluginDoctor(root = DEFAULT_ROOT) {
  const manifest = loadManifest(root);
  const counts = { applied: 0, ready: 0, conflict: 0, missingFile: 0 };
  const seams = [];

  for (const seam of manifest.seams) {
    const relFile = resolveSeamFile(root, seam);
    const absFile = join(root, relFile);
    const patches = seam.patches ?? [];

    if (!isFilePresent(absFile)) {
      counts.missingFile += 1;
      seams.push({ file: seam.file, marker: seam.marker, state: "missing-file", patches: { total: patches.length, already: 0, ready: 0, missing: patches.length } });
      continue;
    }

    const content = readFileSync(absFile, "utf8");
    if (isSeamApplied(content, seam)) {
      counts.applied += 1;
      seams.push({ file: seam.file, marker: seam.marker, state: "applied", patches: { total: patches.length, already: 0, ready: 0, missing: 0 } });
      continue;
    }

    let already = 0;
    let ready = 0;
    let missing = 0;
    const missingSamples = [];
    for (const patch of patches) {
      if (content.includes(patch.replace)) {
        already += 1;
      } else if (content.includes(patch.find)) {
        ready += 1;
      } else {
        missing += 1;
        if (missingSamples.length < 2) missingSamples.push(patch.find.split("\n")[0].slice(0, 100));
      }
    }

    const state = missing === 0 ? "ready" : "conflict";
    if (state === "ready") counts.ready += 1;
    else counts.conflict += 1;
    seams.push({
      file: seam.file,
      marker: seam.marker,
      state,
      patches: { total: patches.length, already, ready, missing },
      missingSamples,
    });
  }

  const status = pluginStatus(root);
  const ok =
    counts.conflict === 0 &&
    counts.missingFile === 0 &&
    status.ownedPresent === status.ownedTotal &&
    status.deletedAbsent === status.deletedTotal;

  return {
    ok,
    base: "worktree",
    owned: { present: status.ownedPresent, total: status.ownedTotal },
    deleted: { absent: status.deletedAbsent, total: status.deletedTotal },
    counts,
    seams,
  };
}

export function pluginAllowlist(root = DEFAULT_ROOT) {
  const manifest = loadManifest(root);
  const allowed = new Set(["scripts/xlabs-plugin.mjs", "scripts/xlabs-plugin.test.ts"]);
  const bundleDir = existsSync(join(root, BUNDLE_REL)) ? join(root, BUNDLE_REL) : join(DEFAULT_ROOT, BUNDLE_REL);
  const ownedJsonPath = join(bundleDir, ".owned.json");
  if (isFilePresent(ownedJsonPath)) {
    try {
      for (const relPath of Object.keys(JSON.parse(readFileSync(ownedJsonPath, "utf8")))) allowed.add(relPath);
    } catch {
      // manifest paths below still apply
    }
  } else {
    for (const file of manifest.ownedFiles) allowed.add(file);
  }
  for (const seam of manifest.seams) allowed.add(resolveSeamFile(root, seam));
  for (const file of manifest.deletedFiles ?? []) allowed.add(file);
  return [...allowed].sort();
}

function git(root, ...args) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function pluginVerifyDiff(root = DEFAULT_ROOT, options = {}) {
  const { base = "main", head = "HEAD" } = options;
  const inside = git(root, "rev-parse", "--is-inside-work-tree");
  if (inside.status !== 0) {
    return { ok: false, base, head, error: "not a git work tree" };
  }
  const diff = git(root, "diff", "--name-only", `${base}..${head}`);
  if (diff.status !== 0) {
    return { ok: false, base, head, error: (diff.stderr || "git diff failed").trim() };
  }
  const changed = diff.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  const allowed = pluginAllowlist(root);
  const allowedSet = new Set(allowed);
  const unexpected = changed.filter((p) => !allowedSet.has(p) && !p.startsWith("plugins/xlabs-spaces/"));
  return {
    ok: unexpected.length === 0,
    base,
    head,
    changed: changed.length,
    allowed: allowed.length,
    unexpected,
  };
}

export function pluginSync(root = DEFAULT_ROOT, options = {}) {
  const {
    base = "upstream/main",
    pluginRef = "plugin",
    branch = "xlabs",
    commit = true,
    gates = false,
    force = false,
  } = options;
  const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

  const inside = git(root, "rev-parse", "--is-inside-work-tree");
  if (inside.status !== 0) return fail(2, "not a git work tree");

  if (!force) {
    const dirty = git(root, "status", "--porcelain");
    if (dirty.status !== 0) return fail(2, (dirty.stderr || "git status failed").trim());
    if (dirty.stdout.trim()) return fail(3, "work tree is dirty; commit or stash first (or pass --force)");
  }

  const baseCommit = git(root, "rev-parse", "--verify", `${base}^{commit}`);
  if (baseCommit.status !== 0) return fail(4, `base ref not found: ${base}`);

  git(root, "fetch", "origin", pluginRef);
  const pluginCommit = git(root, "rev-parse", "--verify", `${pluginRef}^{commit}`);
  if (pluginCommit.status !== 0) return fail(5, `plugin ref not found: ${pluginRef}`);

  const switched = git(root, "switch", "-C", branch, base);
  if (switched.status !== 0) return fail(6, (switched.stderr || "git switch failed").trim());

  const restore = git(
    root,
    "restore",
    "--source",
    pluginRef,
    "--",
    "plugins/xlabs-spaces",
    "scripts/xlabs-plugin.mjs",
    "scripts/xlabs-plugin.test.ts",
  );
  if (restore.status !== 0) return fail(7, (restore.stderr || "restore failed").trim());

  if (!existsSync(join(root, MANIFEST_REL)) || !existsSync(join(root, BUNDLE_REL, ".owned.json"))) {
    return fail(9, "plugin tree did not restore (no manifest or bundle on the plugin ref)");
  }

  const applied = pluginApply(root, { repair: true });
  const doctor = pluginDoctor(root);

  // Never commit a half-applied layer: a conflicting seam means a human must
  // re-anchor it, not that the branch should pretend to be green.
  if (!doctor.ok) {
    return fail(10, "seams conflict after apply; branch left uncommitted for repair", { applied, doctor });
  }

  let committed = null;
  if (commit) {
    const paths = pluginAllowlist(root).filter((p) => !p.startsWith("plugins/"));
    git(root, "add", "-A", "--", "plugins/xlabs-spaces", ...paths);
    git(root, "reset", "-q", "--", "plugins/xlabs-spaces/bundle/.repair.json", "plugins/xlabs-spaces/bundle/.doctor.json");
    const short = (baseCommit.stdout || "").trim().slice(0, 9);
    const message = `chore(sync): xlabs-spaces on ${base} (${short})`;
    const commitRes = git(root, "commit", "-q", "-m", message);
    if (commitRes.status !== 0) {
      return fail(8, (commitRes.stderr || commitRes.stdout || "git commit failed").trim(), { applied, doctor });
    }
    const sha = git(root, "rev-parse", "--short", "HEAD");
    committed = { message, sha: (sha.stdout || "").trim() };
  }

  const diff = commit ? pluginVerifyDiff(root, { base, head: branch }) : null;

  let gateResults = null;
  if (gates) {
    const commands = [
      ["npm", "run", "typecheck"],
      ["npx", "vitest", "run", "scripts/xlabs-plugin.test.ts"],
      ["npm", "run", "build"],
    ];
    gateResults = commands.map(([cmd, ...args]) => {
      const res = spawnSync(cmd, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      return {
        cmd: [cmd, ...args].join(" "),
        status: res.status,
        tail: `${res.stdout ?? ""}${res.stderr ?? ""}`.slice(-2000),
      };
    });
  }

  const ok =
    doctor.ok &&
    (diff === null || diff.ok) &&
    (gateResults === null || gateResults.every((g) => g.status === 0));

  return {
    ok,
    base,
    branch,
    pluginRef,
    committed,
    applied: {
      restoredOwned: applied.restoredOwned,
      seamsApplied: applied.seamsApplied,
      failures: applied.failures.length,
      fallbacks: applied.fallbacks.length,
    },
    doctor: { ok: doctor.ok, counts: doctor.counts },
    diff,
    gates: gateResults,
  };
}

export const VENDOR_REL = join("src", "components", "space", "vendor", "space-canvas");

/** Snapshot the canvas dev repo into the layer, so the plugin never needs a sibling checkout. */
export function pluginVendor(root = DEFAULT_ROOT, options = {}) {
  const source = options.source ?? resolve(root, "..", "G_app-Space-Canvas", "src");
  const dest = join(root, VENDOR_REL);
  if (!existsSync(source)) return { ok: false, error: `canvas source not found: ${source}` };

  // Vendored tests are dead cargo: the host globs only *.test.ts and its
  // testing-library import is not a host dependency. Ship code, not tests.
  const skip = (name) => /\.(test|spec)\.[^.]+$/.test(name) || name === "__tests__" || name === "tests";
  const temp = `${dest}.tmp-${process.pid}`;
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(temp, { recursive: true });
  try {
    cpSync(source, temp, { recursive: true, filter: (from) => !skip(from.split("/").pop() ?? "") });
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    return { ok: false, error: String(error) };
  }

  let files = 0;
  const hash = createHash("sha256");
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) {
        files += 1;
        hash.update(abs.slice(temp.length));
        hash.update(readFileSync(abs));
      }
    }
  };
  walk(temp);

  rmSync(dest, { recursive: true, force: true });
  renameSync(temp, dest);

  const commit = spawnSync("git", ["-C", dirname(source), "rev-parse", "HEAD"], { encoding: "utf8" });
  const pin = { source, commit: (commit.stdout ?? "").trim(), files, sha256: hash.digest("hex"), at: new Date().toISOString() };
  writeFileSync(join(dirname(dest), ".pin.json"), `${JSON.stringify(pin, null, 2)}\n`, "utf8");
  return { ok: true, ...pin, dest };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "status";
  const opts = {
    base: "upstream/main",
    head: "HEAD",
    pluginRef: "plugin",
    branch: "xlabs",
    repair: false,
    commit: true,
    gates: false,
    force: false,
  };
  let json = false;
  let root = DEFAULT_ROOT;
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => argv[++i];
    if (arg === "--json") json = true;
    else if (arg === "--repair") opts.repair = true;
    else if (arg === "--gates") opts.gates = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--no-commit") opts.commit = false;
    else if (arg === "--root") root = resolve(take());
    else if (arg.startsWith("--root=")) root = resolve(arg.slice("--root=".length));
    else if (arg === "--base") opts.base = take();
    else if (arg.startsWith("--base=")) opts.base = arg.slice("--base=".length);
    else if (arg === "--head") opts.head = take();
    else if (arg.startsWith("--head=")) opts.head = arg.slice("--head=".length);
    else if (arg === "--plugin") opts.pluginRef = take();
    else if (arg.startsWith("--plugin=")) opts.pluginRef = arg.slice("--plugin=".length);
    else if (arg === "--branch") opts.branch = take();
    else if (arg.startsWith("--branch=")) opts.branch = arg.slice("--branch=".length);
  }
  return { command, json, root, opts };
}

export function runCli(argv = process.argv.slice(2)) {
  const { command, json, root, opts } = parseArgs(argv);

  if (command === "status") {
    const status = pluginStatus(root);
    if (json) console.log(JSON.stringify(status, null, 2));
    else {
      console.log(
        `[${status.id}@${status.version}] ok=${status.ok} owned=${status.ownedPresent}/${status.ownedTotal} seams=${status.seamsPresent}/${status.seamsTotal} bundle=${status.bundleReady}`,
      );
      if (status.missing.length > 0) console.log(`Missing: ${status.missing.join(", ")}`);
    }
    return status.ok ? 0 : 1;
  }

  if (command === "snapshot") {
    const status = pluginSnapshot(root);
    if (json) console.log(JSON.stringify(status, null, 2));
    else {
      console.log(
        `[${status.id}@${status.version}] snapshot saved · owned=${status.ownedPresent}/${status.ownedTotal} seams=${status.seamsPresent}/${status.seamsTotal}`,
      );
    }
    return status.ok ? 0 : 1;
  }

  if (command === "apply") {
    const result = pluginApply(root, { repair: opts.repair });
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `[${result.id}@${result.version}] applied · restoredOwned=${result.restoredOwned} seamsApplied=${result.seamsApplied} failures=${result.failures.length} fallbacks=${result.fallbacks.length} ok=${result.ok}`,
      );
    }
    return result.ok ? 0 : 1;
  }

  if (command === "vendor") {
    const result = pluginVendor(root);
    if (json) console.log(JSON.stringify(result, null, 2));
    else if (result.ok) console.log(`[vendor] ${result.files} files · ${result.commit.slice(0, 9)} · ${result.dest}`);
    else console.log(`[vendor] FAILED ${result.error}`);
    return result.ok ? 0 : 1;
  }

  if (command === "doctor") {
    const report = pluginDoctor(root);
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      const c = report.counts;
      console.log(
        `[doctor] ok=${report.ok} applied=${c.applied} ready=${c.ready} conflict=${c.conflict} missing=${c.missingFile}`,
      );
      for (const seam of report.seams.filter((s2) => s2.state === "conflict" || s2.state === "missing-file")) {
        console.log(`  ${seam.state.padEnd(12)} ${seam.file}  (missing patches: ${seam.patches.missing})`);
      }
    }
    return report.ok ? 0 : 1;
  }

  if (command === "verify-diff") {
    const result = pluginVerifyDiff(root, { base: opts.base, head: opts.head });
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `[verify-diff] ok=${result.ok} ${result.base}..${result.head} changed=${result.changed} allowed=${result.allowed}`,
      );
      for (const file of result.unexpected ?? []) console.log(`  unexpected ${file}`);
      if (result.error) console.log(`  error: ${result.error}`);
    }
    return result.ok ? 0 : 1;
  }

  if (command === "sync") {
    const result = pluginSync(root, opts);
    if (json) console.log(JSON.stringify(result, null, 2));
    else if (result.ok) {
      console.log(
        `[sync] ok base=${result.base} branch=${result.branch} owned=${result.applied.restoredOwned} seams=${result.applied.seamsApplied} failures=${result.applied.failures} fallbacks=${result.applied.fallbacks} commit=${result.committed?.sha ?? "none"} diff=${result.diff?.changed ?? "n/a"}`,
      );
    } else {
      console.log(`[sync] FAILED code=${result.code ?? "?"} ${result.message ?? ""}`);
      if (result.applied) console.log(`  applied: ${JSON.stringify(result.applied)}`);
      if (result.doctor) console.log(`  doctor: ${JSON.stringify(result.doctor)}`);
      if (result.diff?.unexpected?.length) console.log(`  unexpected: ${result.diff.unexpected.join(", ")}`);
    }
    return result.ok ? 0 : 1;
  }

  if (command === "remove") {
    const result = pluginRemove(root);
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `[${result.id}@${result.version}] removed · removedOwned=${result.removedOwned} seamsReverted=${result.seamsReverted} restoredDeleted=${result.restoredDeleted} ok=${result.ok}`,
      );
    }
    return result.ok ? 0 : 1;
  }

  console.error(`Unknown command: ${command}. Expected: status | snapshot | apply | remove | doctor | verify-diff | sync | vendor`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}
