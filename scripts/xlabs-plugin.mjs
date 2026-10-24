import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
    if (isFilePresent(absFile) && readFileSync(absFile, "utf8").includes(seam.marker)) {
      seamsPresent += 1;
    } else {
      missing.push(seam.file);
    }
  }

  const bundleDir = join(root, BUNDLE_REL);
  const bundleReady = isFilePresent(join(bundleDir, ".snapshot.json"));
  const ok = ownedPresent === ownedTotal && seamsPresent === seamsTotal;

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
  if (!content.includes(seam.marker)) return false;
  for (const patch of seam.patches ?? []) {
    const checkStr = patch.check ?? seam.marker;
    if (content.includes(patch.find) && !content.includes(checkStr)) return false;
  }
  return true;
}

export function pluginApply(root = DEFAULT_ROOT) {
  const manifest = loadManifest(root);
  const localBundle = join(root, BUNDLE_REL);
  const bundleDir = existsSync(localBundle) ? localBundle : join(DEFAULT_ROOT, BUNDLE_REL);
  const ownedBundleDir = join(bundleDir, "owned");
  const seamsBundleDir = join(bundleDir, "seams");

  let restoredOwned = 0;
  const ownedJsonPath = join(bundleDir, ".owned.json");
  if (isFilePresent(ownedJsonPath)) {
    const ownedSnapshot = JSON.parse(readFileSync(ownedJsonPath, "utf8"));
    for (const [relPath, content] of Object.entries(ownedSnapshot)) {
      const dstFile = join(root, relPath);
      if (!isFilePresent(dstFile) || readFileSync(dstFile, "utf8") !== content) {
        mkdirSync(dirname(dstFile), { recursive: true });
        writeFileSync(dstFile, String(content), "utf8");
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
    if (current !== null) {
      for (const patch of seam.patches ?? []) {
        const checkStr = patch.check ?? seam.marker;
        if (!next.includes(checkStr) && next.includes(patch.find)) {
          next = next.replace(patch.find, patch.replace);
        }
      }
    }

    if (!next.includes(seam.marker)) {
      const bundledSeamPath = join(seamsBundleDir, seam.file);
      if (isFilePresent(bundledSeamPath)) {
        next = readFileSync(bundledSeamPath, "utf8");
      } else if (typeof seamsSnapshot[seam.file] === "string") {
        next = seamsSnapshot[seam.file];
      }
    }

    if (next && next !== current && next.includes(seam.marker)) {
      mkdirSync(dirname(absFile), { recursive: true });
      writeFileSync(absFile, next, "utf8");
      seamsApplied += 1;
    }
  }

  return {
    ...pluginStatus(root),
    restoredOwned,
    seamsApplied,
  };
}

export function parseArgs(argv) {
  const command = argv[0] ?? "status";
  let json = false;
  let root = DEFAULT_ROOT;
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--root" && argv[i + 1]) {
      root = resolve(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--root=")) {
      root = resolve(arg.slice("--root=".length));
    }
  }
  return { command, json, root };
}

export function runCli(argv = process.argv.slice(2)) {
  const { command, json, root } = parseArgs(argv);
  if (command === "status") {
    const status = pluginStatus(root);
    if (json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(
        `[${status.id}@${status.version}] ok=${status.ok} owned=${status.ownedPresent}/${status.ownedTotal} seams=${status.seamsPresent}/${status.seamsTotal} bundle=${status.bundleReady}`,
      );
      if (status.missing.length > 0) {
        console.log(`Missing: ${status.missing.join(", ")}`);
      }
    }
    return status.ok ? 0 : 1;
  }

  if (command === "snapshot") {
    const status = pluginSnapshot(root);
    if (json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(
        `[${status.id}@${status.version}] snapshot saved · owned=${status.ownedPresent}/${status.ownedTotal} seams=${status.seamsPresent}/${status.seamsTotal}`,
      );
    }
    return status.ok ? 0 : 1;
  }

  if (command === "apply") {
    const result = pluginApply(root);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `[${result.id}@${result.version}] applied · restoredOwned=${result.restoredOwned} seamsApplied=${result.seamsApplied} ok=${result.ok}`,
      );
    }
    return result.ok ? 0 : 1;
  }

  console.error(`Unknown command: ${command}. Expected: status | snapshot | apply`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}
