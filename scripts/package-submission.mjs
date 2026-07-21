import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { credentialPatterns, forbiddenReleasePaths, releaseEntries } from "./release-manifest.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseRoot = join(projectRoot, ".release");
const packageDirectory = join(releaseRoot, "EvidenceWeaver");
const archivePath = join(releaseRoot, "EvidenceWeaver-hackathon-submission.zip");
const archiveChecksumPath = `${archivePath}.sha256.txt`;

function hash(content) { return createHash("sha256").update(content).digest("hex"); }
function slash(path) { return path.split(sep).join("/"); }

async function filesBelow(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}

async function sourceCommit() {
  try {
    const head = (await readFile(join(projectRoot, ".git", "HEAD"), "utf8")).trim();
    if (!head.startsWith("ref: ")) return head;
    return (await readFile(join(projectRoot, ".git", head.slice(5)), "utf8")).trim();
  } catch { return null; }
}

async function run(executable, args, options = {}) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${executable} exited with ${code}. ${stderr}`)));
  });
}

async function createArchive() {
  if (process.platform === "win32") {
    const literal = (value) => `'${value.replaceAll("'", "''")}'`;
    const command = `Compress-Archive -LiteralPath ${literal(packageDirectory)} -DestinationPath ${literal(archivePath)} -CompressionLevel Optimal -Force`;
    const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand]);
    return;
  }
  await run("zip", ["-rq", archivePath, "EvidenceWeaver"], { cwd: releaseRoot });
}

const resolvedReleaseRoot = resolve(releaseRoot);
if (!resolvedReleaseRoot.startsWith(`${resolve(projectRoot)}${sep}`)) throw new Error("Release output must remain inside the project.");
if (!existsSync(join(projectRoot, "dist", "index.html"))) throw new Error("Compiled dist/ is missing. Run pnpm run build first.");

await rm(resolvedReleaseRoot, { recursive: true, force: true });
await mkdir(packageDirectory, { recursive: true });
for (const entry of releaseEntries) await cp(join(projectRoot, entry), join(packageDirectory, entry), { recursive: true });
await mkdir(join(packageDirectory, "data"), { recursive: true });
await cp(join(projectRoot, "data", ".gitkeep"), join(packageDirectory, "data", ".gitkeep"));

for (const forbidden of forbiddenReleasePaths) {
  try { await access(join(packageDirectory, forbidden)); throw new Error(`Forbidden release path was copied: ${forbidden}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

const manifest = {
  name: "EvidenceWeaver",
  releaseType: "OpenAI hackathon judge submission",
  generatedAt: new Date().toISOString(),
  sourceCommit: await sourceCommit(),
  runtime: "Node.js 20.19 or newer; no dependency installation required",
  launch: "node scripts/start-demo.mjs",
  reset: "node scripts/reset-demo.mjs --yes",
  notices: [
    "All bundled cases and identifiers are fictional synthetic demonstration data.",
    "The judge launcher forces local deterministic mock mode and does not use an API key.",
    "See JUDGES.md for the recommended review path and SAFETY.md for limitations.",
  ],
};
await writeFile(join(packageDirectory, "SUBMISSION-MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const packageFiles = await filesBelow(packageDirectory);
for (const path of packageFiles) {
  const content = await readFile(path);
  const text = content.toString("utf8");
  for (const credential of credentialPatterns) {
    if (credential.pattern.test(text)) throw new Error(`Potential ${credential.label} found in ${slash(relative(packageDirectory, path))}.`);
  }
}

const checksumLines = [];
for (const path of packageFiles) {
  const name = slash(relative(packageDirectory, path));
  checksumLines.push(`${hash(await readFile(path))}  ${name}`);
}
await writeFile(join(packageDirectory, "SHA256SUMS.txt"), `${checksumLines.join("\n")}\n`, "utf8");

await createArchive();
const archive = await readFile(archivePath);
await writeFile(archiveChecksumPath, `${hash(archive)}  ${slash(relative(releaseRoot, archivePath))}\n`, "utf8");

const finalFiles = await filesBelow(packageDirectory);
await rm(packageDirectory, { recursive: true, force: true });
process.stdout.write(`Created ${archivePath}\n`);
process.stdout.write(`Files: ${finalFiles.length} | ZIP bytes: ${archive.length} | SHA-256: ${hash(archive)}\n`);
process.stdout.write(`Checksum: ${archiveChecksumPath}\n`);
