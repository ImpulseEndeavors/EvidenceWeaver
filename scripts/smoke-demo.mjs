import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseEntries = [
  ".env.example", ".gitattributes", ".gitignore", "DECISIONS.md", "JUDGES.md", "README.md", "SAFETY.md", "TASKS.md",
  "dist", "index.html", "package.json", "pnpm-lock.yaml", "scripts", "server", "src", "tests",
  "tsconfig.app.json", "tsconfig.json", "vite.config.ts",
];

async function availablePort() {
  const probe = createServer();
  await new Promise((resolveListen, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolveListen); });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose, reject) => probe.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function copyCleanProject(destination) {
  for (const entry of releaseEntries) await cp(join(projectRoot, entry), join(destination, entry), { recursive: true });
  await mkdir(join(destination, "data"), { recursive: true });
  await cp(join(projectRoot, "data", ".gitkeep"), join(destination, "data", ".gitkeep"));
}

async function waitForServer(child, stderr) {
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Clean demo did not start. ${stderr.value}`)), 10_000);
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Clean demo exited before startup (${code}). ${stderr.value}`)); });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (chunk.includes("EvidenceWeaver API listening")) { clearTimeout(timeout); resolveReady(); }
    });
  });
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
  ]);
}

async function request(baseUrl, path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  assert.ok(response.ok, `${options?.method || "GET"} ${path} failed (${response.status}): ${payload.error || "unknown error"}`);
  return payload;
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "evidenceweaver-clean-smoke-"));
const cleanProject = join(temporaryRoot, "EvidenceWeaver");
let child;
try {
  await mkdir(cleanProject, { recursive: true });
  await copyCleanProject(cleanProject);
  for (const forbidden of [".env", "node_modules", ".pnpm-store", ".git", "data/store.json", "data/custody.ndjson"]) {
    await assert.rejects(() => access(join(cleanProject, forbidden)), undefined, `${forbidden} must not be present in the clean copy`);
  }

  const port = await availablePort();
  const stderr = { value: "" };
  child = spawn(process.execPath, ["scripts/start-demo.mjs"], {
    cwd: cleanProject,
    env: { ...process.env, PORT: String(port), EVIDENCEWEAVER_DATA_DIR: join(cleanProject, "data"), OPENAI_API_KEY: "", DATA_ENCRYPTION_KEY: "", CUSTODY_HMAC_KEY: "", AUTH_PROXY_SECRET: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr.value += chunk; });
  await waitForServer(child, stderr);

  const baseUrl = `http://127.0.0.1:${port}`;
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>EvidenceWeaver<\/title>/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(assets.length >= 2, "Compiled client asset references are missing.");
  let compiledJavaScript = "";
  for (const asset of assets) {
    const assetResponse = await fetch(`${baseUrl}${asset}`);
    assert.equal(assetResponse.status, 200, `${asset} was not served.`);
    if (asset.endsWith(".js")) compiledJavaScript += await assetResponse.text();
  }
  for (const caseTitle of ["Operation Glass Harbor", "Operation Paper Comet", "Operation Cedar Echo"]) {
    assert.ok(compiledJavaScript.includes(caseTitle), `${caseTitle} is missing from the compiled demonstration.`);
  }

  const config = await request(baseUrl, "/api/config");
  assert.equal(config.extractionMode, "mock");
  assert.equal(config.hasApiKey, false);
  assert.equal(config.security.appMode, "demo");

  const created = await request(baseUrl, "/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Clean-copy smoke case" }) });
  const workspace = await request(baseUrl, `/api/cases/${created.case.id}/evidence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Smoke evidence", rawText: "Synthetic clean-machine smoke evidence.", sourceType: "pasted_text" }) });
  assert.equal(workspace.evidence.length, 1);
  const custody = await request(baseUrl, `/api/cases/${created.case.id}/custody`);
  assert.equal(custody.allEvidenceIntact, true);
  assert.equal(custody.verification.valid, true);
  assert.deepEqual(custody.events.map((event) => event.action), ["case.created", "evidence.acquired"]);
  const manifest = await request(baseUrl, `/api/cases/${created.case.id}/manifest`);
  assert.match(manifest.manifestHash, /^[a-f0-9]{64}$/);

  process.stdout.write(`PASS: clean zero-install copy served ${assets.length} compiled assets with all three synthetic cases.\n`);
  process.stdout.write("PASS: API preserved a custody-verified case and exported its integrity manifest.\n");
  process.stdout.write(`PASS: excluded secrets, Git metadata, dependencies, caches, and prior runtime data.\n`);
} finally {
  if (child) await stop(child);
  await rm(temporaryRoot, { recursive: true, force: true });
}
