import { existsSync } from "node:fs";
import { mkdir, readdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readEnvironmentFile } from "./env.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

function backupName(date) {
  return `demo-reset-${date.toISOString().replaceAll(":", "-").replaceAll(".", "-")}`;
}

async function moveWithRetry(source, destination) {
  for (let attempt = 0; ; attempt += 1) {
    try { await rename(source, destination); return; }
    catch (error) {
      if (!["EACCES", "EBUSY", "EPERM"].includes(error.code) || attempt >= 5) throw error;
      await delay(25 * 2 ** attempt);
    }
  }
}

export async function resetDemoData({
  dataDirectory = resolve(process.env.EVIDENCEWEAVER_DATA_DIR || join(projectRoot, "data")),
  appMode = process.env.APP_MODE || "demo",
  confirmed = false,
  now = new Date(),
} = {}) {
  const target = resolve(dataDirectory);
  if (appMode === "production") throw new Error("Demo reset refused because APP_MODE=production.");
  if (existsSync(join(target, "store.encrypted.json"))) throw new Error("Demo reset refused because encrypted production storage is present.");

  await mkdir(target, { recursive: true });
  const entries = await readdir(target, { withFileTypes: true });
  const runtimeFiles = entries
    .filter((entry) => entry.isFile() && (
      entry.name === "store.json"
      || entry.name === "custody.ndjson"
      || /^store(?:\.encrypted)?\.json\..+\.tmp$/.test(entry.name)
    ))
    .map((entry) => entry.name);

  if (!runtimeFiles.length) return { changed: false, dataDirectory: target, files: [], backupDirectory: null };
  if (!confirmed) return { changed: false, confirmationRequired: true, dataDirectory: target, files: runtimeFiles, backupDirectory: null };

  const backupDirectory = join(target, "backups", backupName(now));
  await mkdir(backupDirectory, { recursive: true });
  for (const filename of runtimeFiles) await moveWithRetry(join(target, filename), join(backupDirectory, filename));
  return { changed: true, dataDirectory: target, files: runtimeFiles, backupDirectory };
}

async function main() {
  const fileEnvironment = await readEnvironmentFile(join(projectRoot, ".env"));
  const result = await resetDemoData({
    appMode: process.env.APP_MODE || fileEnvironment.APP_MODE || "demo",
    confirmed: process.argv.includes("--yes"),
  });
  if (result.confirmationRequired) {
    process.stdout.write(`Demo reset will archive ${result.files.join(", ")} from ${result.dataDirectory}.\n`);
    process.stdout.write("Stop EvidenceWeaver, then rerun with explicit confirmation:\n  node scripts/reset-demo.mjs --yes\n");
    process.exitCode = 2;
    return;
  }
  if (!result.changed) {
    process.stdout.write("The demo data directory is already pristine. Launch EvidenceWeaver to seed all three synthetic cases.\n");
    return;
  }
  process.stdout.write(`Demo reset complete. Previous runtime data was archived to:\n${result.backupDirectory}\n`);
  process.stdout.write("Run node scripts/start-demo.mjs to launch a pristine three-case demonstration.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
