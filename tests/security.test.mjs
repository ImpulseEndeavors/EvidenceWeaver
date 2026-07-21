import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCustodyLedger, verifyCustodyRecords } from "../server/custody.mjs";
import { authorize, loadSecurityConfiguration } from "../server/security.mjs";
import { decryptStore, encryptStore } from "../server/storage.mjs";

test("AES-GCM storage round-trips and rejects altered ciphertext", () => {
  const key = randomBytes(32);
  const original = { cases: [{ case: { id: "case-secure" }, evidence: [{ rawText: "preserved" }] }] };
  const encrypted = encryptStore(original, key, "test-key");
  assert.deepEqual(decryptStore(encrypted, key), original);
  const tampered = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` };
  assert.throws(() => decryptStore(tampered, key));
});

test("custody ledger detects mutation and authenticates records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evidenceweaver-custody-"));
  try {
    const key = randomBytes(32);
    const ledger = createCustodyLedger({ dataDirectory: directory, hmacKey: key });
    await ledger.initialize();
    const actor = { id: "analyst-1", displayName: "Test analyst", role: "analyst", authenticationMethod: "test" };
    await ledger.append({ action: "evidence.acquired", caseId: "case-1", evidenceSourceId: "src-1", purpose: "Preserve evidence", details: { contentHash: "abc" } }, actor);
    await ledger.append({ action: "finding.reviewed", caseId: "case-1", purpose: "Confirm finding", details: { findingId: "ent-1" } }, actor);
    const records = await ledger.list();
    assert.deepEqual(verifyCustodyRecords(records, key), { valid: true, recordCount: 2, headHash: records[1].recordHash, authenticated: true, errors: [] });

    const lines = (await readFile(ledger.path, "utf8")).trim().split(/\r?\n/);
    const altered = JSON.parse(lines[0]); altered.purpose = "Altered after the fact"; lines[0] = JSON.stringify(altered);
    await writeFile(ledger.path, `${lines.join("\n")}\n`, "utf8");
    assert.equal((await ledger.verify()).valid, false);
    await assert.rejects(() => ledger.append({ action: "custody.note", caseId: "case-1", purpose: "Should fail" }, actor), /integrity verification failed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("production mode fails closed without security services", () => {
  assert.throws(() => loadSecurityConfiguration({ APP_MODE: "production" }), /refused to start/);
  const key = randomBytes(32).toString("base64");
  const config = loadSecurityConfiguration({ APP_MODE: "production", AUTH_MODE: "external-oidc-proxy", AUTH_PROXY_SECRET: "a".repeat(32), PUBLIC_ORIGIN: "https://evidence.example", DATA_ENCRYPTION_KEY: key, CUSTODY_HMAC_KEY: key });
  assert.equal(config.appMode, "production");
  assert.equal(config.encryptedAtRest, true);
  assert.doesNotThrow(() => authorize({ role: "analyst" }, "investigate"));
  assert.throws(() => authorize({ role: "viewer" }, "investigate"), /permission/);
});
