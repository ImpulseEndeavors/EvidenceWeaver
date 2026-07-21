import { createHash, createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? "null" : canonical(item)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function authenticate(hash, key) { return key ? createHmac("sha256", key).update(hash).digest("hex") : null; }

export function decodeCustodyKey(encoded) {
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64");
  if (key.length < 32) throw new Error("CUSTODY_HMAC_KEY must decode to at least 32 bytes.");
  return key;
}

export function verifyCustodyRecords(records, key = null) {
  const errors = [];
  let previousHash = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const { recordHash, authenticator, ...material } = record;
    if (record.sequence !== index + 1) errors.push(`Record ${index + 1} has an invalid sequence.`);
    if (record.previousHash !== previousHash) errors.push(`Record ${record.sequence ?? index + 1} breaks the hash chain.`);
    const calculated = digest(material);
    if (calculated !== recordHash) errors.push(`Record ${record.sequence ?? index + 1} has been altered.`);
    if (key && authenticate(recordHash, key) !== authenticator) errors.push(`Record ${record.sequence ?? index + 1} has an invalid authenticator.`);
    previousHash = recordHash;
  }
  return { valid: errors.length === 0, recordCount: records.length, headHash: previousHash, authenticated: Boolean(key), errors };
}

export function createCustodyLedger({ dataDirectory, hmacKey = null }) {
  const path = join(dataDirectory, "custody.ndjson");
  async function records() {
    if (!existsSync(path)) return [];
    const text = await readFile(path, "utf8");
    if (!text.trim()) return [];
    return text.trim().split(/\r?\n/).map((line, index) => {
      try { return JSON.parse(line); } catch { throw new Error(`Custody ledger record ${index + 1} is not valid JSON.`); }
    });
  }
  return {
    path,
    hmacKey,
    async initialize() { await mkdir(dataDirectory, { recursive: true }); },
    async verify() { return verifyCustodyRecords(await records(), hmacKey); },
    async list(caseId) { return (await records()).filter((record) => !caseId || record.caseId === caseId); },
    async append(event, actor) {
      const current = await records();
      const verification = verifyCustodyRecords(current, hmacKey);
      if (!verification.valid) { const error = new Error("Custody ledger integrity verification failed; mutation refused."); error.statusCode = 409; error.details = verification.errors; throw error; }
      const material = {
        version: 1,
        sequence: current.length + 1,
        timestamp: new Date().toISOString(),
        actor: { id: actor.id, displayName: actor.displayName, role: actor.role, authenticationMethod: actor.authenticationMethod },
        action: event.action,
        caseId: event.caseId ?? null,
        evidenceSourceId: event.evidenceSourceId ?? null,
        purpose: event.purpose,
        details: event.details ?? {},
        previousHash: verification.headHash,
      };
      const recordHash = digest(material);
      const record = { ...material, recordHash, authenticator: authenticate(recordHash, hmacKey) };
      const handle = await open(path, "a", 0o600);
      try { await handle.write(`${JSON.stringify(record)}\n`, null, "utf8"); await handle.sync(); } finally { await handle.close(); }
      return record;
    },
  };
}

export async function buildCustodyOverview(workspace, ledger) {
  const allRecords = await ledger.list();
  const verification = verifyCustodyRecords(allRecords, ledger.hmacKey);
  const events = allRecords.filter((record) => record.caseId === workspace.case.id);
  const evidence = workspace.evidence.map((source) => {
    const calculatedHash = createHash("sha256").update(source.rawText).digest("hex");
    return { id: source.id, title: source.title, sourceType: source.sourceType, createdAt: source.createdAt, byteLength: Buffer.byteLength(source.rawText, "utf8"), recordedHash: source.contentHash ?? null, calculatedHash, intact: source.contentHash === calculatedHash };
  });
  return { verification, events, evidence, allEvidenceIntact: evidence.every((source) => source.intact) };
}

export async function buildCustodyManifest(workspace, ledger) {
  const overview = await buildCustodyOverview(workspace, ledger);
  const material = {
    format: "EvidenceWeaver custody manifest",
    version: 1,
    generatedAt: new Date().toISOString(),
    case: { id: workspace.case.id, title: workspace.case.title, createdAt: workspace.case.createdAt, updatedAt: workspace.case.updatedAt },
    evidence: overview.evidence,
    custody: { verification: overview.verification, events: overview.events },
    disclaimer: "This manifest supports integrity review but is not, by itself, a legal certification of custody.",
  };
  return { ...material, manifestHash: digest(material) };
}
