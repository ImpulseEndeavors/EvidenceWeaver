import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

async function startServer(environment = {}) {
  const dataDirectory = await mkdtemp(join(tmpdir(), "evidenceweaver-api-"));
  const port = 18_000 + (process.pid % 10_000);
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), EXTRACTION_MODE: "mock", EVIDENCEWEAVER_DATA_DIR: dataDirectory, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. ${stderr}`)), 10_000);
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Server exited before startup (${code}). ${stderr}`)); });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (chunk.includes("EvidenceWeaver API listening")) { clearTimeout(timeout); resolveReady(); }
    });
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    dataDirectory,
    async close() {
      child.kill();
      await Promise.race([new Promise((resolveExit) => child.once("exit", resolveExit)), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000))]);
      await rm(dataDirectory, { recursive: true, force: true });
    },
  };
}

test("API rejects malformed requests and preserves concurrent writes", async () => {
  const server = await startServer();
  try {
    const missing = await fetch(`${server.baseUrl}/api/not-a-route`);
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get("content-type") ?? "", /application\/json/);

    const malformed = await fetch(`${server.baseUrl}/api/cases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    assert.equal(malformed.status, 400);

    const creates = Array.from({ length: 12 }, (_, index) => fetch(`${server.baseUrl}/api/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Concurrent case ${index + 1}` }),
    }));
    const responses = await Promise.all(creates);
    assert.ok(responses.every((response) => response.status === 201));
    assert.match(responses[0].headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.ok(responses[0].headers.get("x-request-id"));

    const casesResponse = await fetch(`${server.baseUrl}/api/cases`);
    assert.equal(casesResponse.status, 200);
    const cases = await casesResponse.json();
    assert.equal(cases.length, creates.length);
    assert.equal(new Set(cases.map((item) => item.case.id)).size, creates.length);

    const syntheticResponse = await fetch(`${server.baseUrl}/api/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Stale extraction check", synthetic: true }),
    });
    const synthetic = await syntheticResponse.json();
    const addEvidence = (rawText) => fetch(`${server.baseUrl}/api/cases/${synthetic.case.id}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test source", rawText }),
    });
    await addEvidence("Initial synthetic evidence");
    const storePath = join(server.dataDirectory, "store.json");
    const persistedStore = JSON.parse(await readFile(storePath, "utf8"));
    const persistedCase = persistedStore.cases.find((item) => item.case.id === synthetic.case.id);
    persistedCase.extraction = { mode: "mock", completedAt: new Date().toISOString(), warnings: [] };
    persistedCase.brief = { generatedAt: new Date().toISOString(), disclaimer: "test", sections: [] };
    await writeFile(storePath, JSON.stringify(persistedStore), "utf8");

    const staleResponse = await addEvidence("New evidence added after extraction");
    assert.equal(staleResponse.status, 201);
    const stale = await staleResponse.json();
    assert.equal(stale.extraction.stale, true);
    assert.equal(stale.brief, undefined);

    const noteResponse = await fetch(`${server.baseUrl}/api/cases/${synthetic.case.id}/custody/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "Document test custody review" }),
    });
    assert.equal(noteResponse.status, 201);
    const custody = await noteResponse.json();
    assert.equal(custody.verification.valid, true);
    assert.equal(custody.allEvidenceIntact, true);
    assert.ok(custody.events.some((event) => event.action === "evidence.acquired"));
    assert.ok(custody.events.some((event) => event.action === "custody.note"));

    const manifestResponse = await fetch(`${server.baseUrl}/api/cases/${synthetic.case.id}/manifest`);
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.match(manifest.manifestHash, /^[a-f0-9]{64}$/);
    assert.equal(manifest.evidence.every((source) => source.intact), true);
  } finally {
    await server.close();
  }
});

test("production profile enforces proxy authentication, RBAC, origin checks, and encrypted persistence", async () => {
  const key = randomBytes(32).toString("base64");
  const proxySecret = "production-test-proxy-secret-value";
  const origin = "https://evidence.example";
  const server = await startServer({
    APP_MODE: "production",
    AUTH_MODE: "external-oidc-proxy",
    AUTH_PROXY_SECRET: proxySecret,
    PUBLIC_ORIGIN: origin,
    DATA_ENCRYPTION_KEY: key,
    CUSTODY_HMAC_KEY: key,
  });
  try {
    const unauthenticated = await fetch(`${server.baseUrl}/api/config`);
    assert.equal(unauthenticated.status, 401);
    assert.ok(unauthenticated.headers.get("strict-transport-security"));

    const actorHeaders = (role) => ({
      "x-evidenceweaver-proxy-secret": proxySecret,
      "x-evidenceweaver-user-id": `${role}-1`,
      "x-evidenceweaver-user-name": `Test ${role}`,
      "x-evidenceweaver-user-role": role,
    });
    const configResponse = await fetch(`${server.baseUrl}/api/config`, { headers: actorHeaders("viewer") });
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.security.productionReady, true);
    assert.equal(config.security.encryptedAtRest, true);

    const forbidden = await fetch(`${server.baseUrl}/api/cases`, {
      method: "POST",
      headers: { ...actorHeaders("viewer"), Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Viewer cannot create" }),
    });
    assert.equal(forbidden.status, 403);

    const missingOrigin = await fetch(`${server.baseUrl}/api/cases`, {
      method: "POST",
      headers: { ...actorHeaders("admin"), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Missing trusted origin" }),
    });
    assert.equal(missingOrigin.status, 403);

    const created = await fetch(`${server.baseUrl}/api/cases`, {
      method: "POST",
      headers: { ...actorHeaders("admin"), Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Encrypted production case" }),
    });
    assert.equal(created.status, 201);
    const encrypted = await readFile(join(server.dataDirectory, "store.encrypted.json"), "utf8");
    assert.doesNotMatch(encrypted, /Encrypted production case/);
    assert.match(encrypted, /"algorithm"\s*:\s*"aes-256-gcm"/);
  } finally {
    await server.close();
  }
});
