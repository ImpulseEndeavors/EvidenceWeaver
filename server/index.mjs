import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { buildBrief } from "./brief.mjs";
import { computeCrossCaseMatches } from "./cross-case.mjs";
import { buildCustodyManifest, buildCustodyOverview, createCustodyLedger, decodeCustodyKey } from "./custody.mjs";
import { createMockExtraction } from "./mock.mjs";
import { createOpenAIExtraction } from "./openai.mjs";
import { buildInvestigatorQuestions } from "./questions.mjs";
import { assertTrustedOrigin, authorize, loadSecurityConfiguration, newRequestId, permissionFor, publicSecurityStatus, RateLimiter, resolveActor, securityHeaders } from "./security.mjs";
import { createStore, decodeEncryptionKey } from "./storage.mjs";
import { assertValidExtraction } from "./validation.mjs";

const root = resolve(import.meta.dirname, "..");
const dataDirectory = process.env.EVIDENCEWEAVER_DATA_DIR ? resolve(process.env.EVIDENCEWEAVER_DATA_DIR) : join(root, "data");
const entityTypes = new Set(["person", "alias", "organization", "phone", "email", "social_account", "messaging_account", "crypto_wallet", "bank_account", "crypto_exchange", "website", "domain", "ip_address", "physical_location", "company", "currency", "other"]);
const eventTypes = new Set(["initial_contact", "platform_change", "relationship_development", "investment_introduction", "account_creation", "money_request", "transfer", "reported_profit", "withdrawal_attempt", "withdrawal_blocked", "fee_demand", "threat", "communication", "other"]);

async function loadLocalEnvironment() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  const content = await readFile(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

await loadLocalEnvironment();
const security = loadSecurityConfiguration();
const encryptionKey = decodeEncryptionKey(process.env.DATA_ENCRYPTION_KEY);
const custodyKey = decodeCustodyKey(process.env.CUSTODY_HMAC_KEY);
const storeRepository = createStore({ dataDirectory, encryptionKey, keyId: process.env.DATA_ENCRYPTION_KEY_ID || "environment" });
const custodyLedger = createCustodyLedger({ dataDirectory, hmacKey: custodyKey });
const limiter = new RateLimiter();
const port = Number(process.env.PORT || 8787);
await Promise.all([storeRepository.initialize(), custodyLedger.initialize()]);

const loadStore = () => storeRepository.load();
async function persist(store, actor, event) {
  const verification = await custodyLedger.verify();
  if (!verification.valid) throw httpError("Custody ledger integrity verification failed. Mutation refused.", 409);
  await storeRepository.save(store);
  await custodyLedger.append(event, actor);
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 5_000_000) throw httpError("Request is larger than the 5 MB prototype limit.", 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw httpError("Request body must contain valid JSON."); }
}

function httpError(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; return error; }

function workspace(store, caseId) { return store.cases.find((item) => item.case.id === caseId); }
function updated(item) { item.case.updatedAt = new Date().toISOString(); return item; }

function assertEvidenceIntegrity(item) {
  for (const source of item.evidence) {
    const actualHash = createHash("sha256").update(source.rawText).digest("hex");
    if (actualHash !== source.contentHash) throw httpError(`Evidence integrity check failed for source ${source.id}. Mutation refused.`, 409);
  }
}

function createWorkspace(input) {
  const now = new Date().toISOString();
  const id = `case-${randomUUID()}`;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  return {
    case: { id, title: title.slice(0, 160) || "Untitled investigation", description: description.slice(0, 2_000), status: "open", createdAt: now, updatedAt: now, synthetic: Boolean(input?.synthetic) },
    evidence: [], entities: [], events: [], relationships: [], indicators: [], coercionSignals: [], questions: [],
  };
}

function sanitizePatch(kind, patch) {
  const allowed = kind === "entities" ? ["displayedValue", "normalizedValue", "description", "type", "reviewStatus"]
    : kind === "events" ? ["description", "eventType", "dateTime", "approximateDate", "amount", "currency", "reviewStatus"]
      : ["indicators", "coercionSignals"].includes(kind) ? ["reviewStatus"] : [];
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw httpError("Finding update must be a JSON object.");
  const result = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
  for (const key of ["displayedValue", "normalizedValue", "description", "dateTime", "approximateDate", "currency"]) {
    if (key in result && result[key] !== null && typeof result[key] !== "string") throw httpError(`${key} must be a string or null.`);
  }
  if ("displayedValue" in result && !result.displayedValue.trim()) throw httpError("displayedValue cannot be empty.");
  if ("normalizedValue" in result && !result.normalizedValue.trim()) throw httpError("normalizedValue cannot be empty.");
  if ("amount" in result && result.amount !== null && (!Number.isFinite(result.amount) || result.amount < 0)) throw httpError("amount must be a non-negative number or null.");
  if ("type" in result && !entityTypes.has(result.type)) throw httpError("Invalid entity type.");
  if ("eventType" in result && !eventTypes.has(result.eventType)) throw httpError("Invalid event type.");
  if ("reviewStatus" in result) {
    const statuses = ["indicators", "coercionSignals"].includes(kind) ? new Set(["unreviewed", "confirmed", "rejected"]) : new Set(["unreviewed", "confirmed", "rejected", "edited"]);
    if (!statuses.has(result.reviewStatus)) throw httpError("Invalid review status.");
  }
  return result;
}

async function api(request, response, url, actor, requestId) {
  const segments = url.pathname.split("/").filter(Boolean);
  if (request.method === "GET" && url.pathname === "/api/config") return json(response, 200, { extractionMode: process.env.EXTRACTION_MODE === "openai" ? "openai" : "mock", model: process.env.OPENAI_MODEL || "gpt-5.4-mini", hasApiKey: Boolean(process.env.OPENAI_API_KEY), security: publicSecurityStatus(security), actor: { displayName: actor.displayName, role: actor.role } });
  const store = await loadStore();
  if (request.method === "GET" && url.pathname === "/api/cases") return json(response, 200, store.cases);
  if (request.method === "POST" && url.pathname === "/api/cases") {
    const item = createWorkspace(await body(request)); store.cases.push(item);
    await persist(store, actor, { action: "case.created", caseId: item.case.id, purpose: "Create investigation workspace", details: { synthetic: Boolean(item.case.synthetic), requestId } });
    return json(response, 201, item);
  }
  if (segments[0] !== "api" || segments[1] !== "cases" || !segments[2]) return false;
  const caseId = segments[2];
  const item = workspace(store, caseId);
  if (!item) return json(response, 404, { error: "Case not found." });
  if (["POST", "PATCH"].includes(request.method) && segments[3] !== "custody") assertEvidenceIntegrity(item);
  if (request.method === "GET" && segments[3] === "custody" && segments.length === 4) return json(response, 200, await buildCustodyOverview(item, custodyLedger));
  if (request.method === "GET" && segments[3] === "manifest" && segments.length === 4) return json(response, 200, await buildCustodyManifest(item, custodyLedger));
  if (request.method === "POST" && segments[3] === "custody" && segments[4] === "events") {
    const input = await body(request);
    const purpose = typeof input.purpose === "string" ? input.purpose.trim().slice(0, 500) : "";
    if (!purpose) return json(response, 400, { error: "A custody-event purpose is required." });
    await custodyLedger.append({ action: input.action === "custody.transferred" ? "custody.transferred" : "custody.note", caseId, purpose, details: { recipient: typeof input.recipient === "string" ? input.recipient.trim().slice(0, 160) : undefined, location: typeof input.location === "string" ? input.location.trim().slice(0, 160) : undefined, requestId } }, actor);
    return json(response, 201, await buildCustodyOverview(item, custodyLedger));
  }
  if (request.method === "DELETE" && segments.length === 3) {
    const details = { evidenceCount: item.evidence.length, requestId };
    store.cases = store.cases.filter((entry) => entry.case.id !== caseId);
    await persist(store, actor, { action: "case.deleted", caseId, purpose: "Delete local investigation workspace", details });
    return json(response, 200, { ok: true });
  }
  if (request.method === "POST" && segments[3] === "evidence") {
    const input = await body(request);
    if (!input.rawText || typeof input.rawText !== "string") return json(response, 400, { error: "Evidence text is required." });
    const now = new Date().toISOString();
    const source = {
      id: `src-${randomUUID()}`, caseId, filename: input.filename || undefined,
      sourceType: input.sourceType === "text_file" ? "text_file" : "pasted_text", title: (typeof input.title === "string" ? input.title.trim() : "") || (typeof input.filename === "string" ? input.filename.slice(0, 255) : "") || "Pasted evidence",
      rawText: input.rawText, createdAt: now, contentHash: createHash("sha256").update(input.rawText).digest("hex"),
    };
    item.evidence.push(source);
    if (item.extraction) item.extraction.stale = true;
    delete item.brief;
    updated(item);
    await persist(store, actor, { action: "evidence.acquired", caseId, evidenceSourceId: source.id, purpose: "Preserve submitted source evidence", details: { contentHash: source.contentHash, byteLength: Buffer.byteLength(source.rawText, "utf8"), sourceType: source.sourceType, requestId } });
    return json(response, 201, item);
  }
  if (request.method === "GET" && segments[3] === "links") return json(response, 200, computeCrossCaseMatches(store, caseId));
  if (request.method === "PATCH" && segments[3] === "links" && segments[4]) {
    const match = computeCrossCaseMatches(store, caseId).find((entry) => entry.id === segments[4]);
    if (!match) return json(response, 404, { error: "Cross-case match not found." });
    const input = await body(request);
    if (!["unreviewed", "confirmed", "rejected"].includes(input.reviewStatus)) return json(response, 400, { error: "Invalid link review status." });
    store.linkReviews ??= {}; store.linkReviews[match.id] = input.reviewStatus;
    await persist(store, actor, { action: "cross_case_link.reviewed", caseId, purpose: "Record human review of a proposed cross-case link", details: { matchId: match.id, reviewStatus: input.reviewStatus, requestId } });
    return json(response, 200, computeCrossCaseMatches(store, caseId));
  }
  if (request.method === "POST" && segments[3] === "extract") {
    if (!item.evidence.length) return json(response, 400, { error: "Add evidence before running extraction." });
    const requested = await body(request);
    const mode = requested.mode === "openai" ? "openai" : requested.mode === "mock" ? "mock" : (process.env.EXTRACTION_MODE === "openai" ? "openai" : "mock");
    let proposed;
    let warnings = [];
    if (mode === "openai") {
      if (!process.env.OPENAI_API_KEY) return json(response, 400, { error: "OPENAI_API_KEY is required for live extraction. Use mock mode or configure the server environment." });
      const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
      proposed = await createOpenAIExtraction(item, { apiKey: process.env.OPENAI_API_KEY, model });
      warnings = proposed.warnings ?? [];
      item.extraction = { mode, model, completedAt: new Date().toISOString(), warnings };
    } else {
      if (!item.case.synthetic) return json(response, 400, { error: "Mock extraction is limited to the bundled synthetic demonstration case. Configure server-side OpenAI extraction for submitted cases." });
      proposed = createMockExtraction(item);
      item.extraction = { mode, completedAt: new Date().toISOString(), warnings: [] };
    }
    assertValidExtraction(item, proposed);
    item.entities = proposed.entities; item.events = proposed.events; item.relationships = proposed.relationships; item.indicators = proposed.indicators;
    item.coercionSignals = proposed.coercionSignals ?? []; item.questions = [];
    delete item.brief; updated(item);
    await persist(store, actor, { action: "extraction.completed", caseId, purpose: "Generate source-linked proposed findings", details: { mode, entityCount: item.entities.length, eventCount: item.events.length, relationshipCount: item.relationships.length, indicatorCount: item.indicators.length, requestId } });
    return json(response, 200, item);
  }
  if (request.method === "PATCH" && segments[3] === "findings" && segments[4] && segments[5]) {
    const kind = segments[4];
    if (!["entities", "events", "indicators", "coercionSignals"].includes(kind)) return json(response, 400, { error: "This finding type cannot be edited." });
    const finding = item[kind].find((entry) => entry.id === segments[5]);
    if (!finding) return json(response, 404, { error: "Finding not found." });
    const patch = sanitizePatch(kind, await body(request));
    Object.assign(finding, patch); delete item.brief; updated(item);
    await persist(store, actor, { action: "finding.reviewed", caseId, purpose: "Record a human decision about a proposed finding", details: { kind, findingId: finding.id, reviewStatus: finding.reviewStatus, fieldsChanged: Object.keys(patch), requestId } });
    return json(response, 200, item);
  }
  if (request.method === "POST" && segments[3] === "questions") {
    const priorStatuses = new Map(item.questions.map((question) => [question.id, question.status]));
    item.questions = buildInvestigatorQuestions(item).map((question) => ({ ...question, status: priorStatuses.get(question.id) ?? question.status }));
    updated(item);
    await persist(store, actor, { action: "questions.generated", caseId, purpose: "Generate evidence-led investigator questions", details: { questionCount: item.questions.length, requestId } });
    return json(response, 200, item);
  }
  if (request.method === "PATCH" && segments[3] === "questions" && segments[4]) {
    const question = item.questions.find((entry) => entry.id === segments[4]);
    if (!question) return json(response, 404, { error: "Investigator question not found." });
    const input = await body(request);
    if (!["proposed", "answered", "dismissed"].includes(input.status)) return json(response, 400, { error: "Invalid question status." });
    question.status = input.status; updated(item);
    await persist(store, actor, { action: "question.status_changed", caseId, purpose: "Record investigator-question disposition", details: { questionId: question.id, status: question.status, requestId } });
    return json(response, 200, item);
  }
  if (request.method === "POST" && segments[3] === "brief") {
    item.brief = buildBrief(item); updated(item);
    await persist(store, actor, { action: "brief.generated", caseId, purpose: "Generate an evidence-grounded case brief", details: { sectionCount: item.brief.sections.length, requestId } });
    return json(response, 200, item);
  }
  return false;
}

async function serveStatic(response, pathname) {
  const dist = join(root, "dist");
  if (!existsSync(dist)) return false;
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const distRoot = resolve(dist);
  let file = resolve(distRoot, requested);
  const relativePath = relative(distRoot, file);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) return false;
  if (!existsSync(file)) {
    if (extname(requested)) return false;
    file = join(distRoot, "index.html");
  }
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" }[extname(file)] || "application/octet-stream";
  const cacheControl = pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  response.writeHead(200, { "Content-Type": `${mime}; charset=utf-8`, "Cache-Control": cacheControl }); response.end(await readFile(file)); return true;
}

let mutationQueue = Promise.resolve();
function serializeMutation(operation) {
  const next = mutationQueue.then(operation, operation);
  mutationQueue = next.catch(() => undefined);
  return next;
}

createServer(async (request, response) => {
  const requestId = newRequestId(request);
  for (const [name, value] of Object.entries(securityHeaders(security))) response.setHeader(name, value);
  response.setHeader("X-Request-ID", requestId);
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      limiter.consume(request, "api", 300);
      const actor = resolveActor(request, security);
      authorize(actor, permissionFor(request, url));
      assertTrustedOrigin(request, security);
      if (["POST", "PATCH", "DELETE"].includes(request.method)) limiter.consume(request, url.pathname.endsWith("/extract") ? "extraction" : "mutation", url.pathname.endsWith("/extract") ? 12 : 120);
      const operation = () => api(request, response, url, actor, requestId);
      const handled = ["POST", "PATCH", "DELETE"].includes(request.method) ? await serializeMutation(operation) : await operation();
      if (handled !== false) return;
      return json(response, 404, { error: "API endpoint not found." });
    }
    if (await serveStatic(response, url.pathname)) return;
    json(response, 404, { error: "Not found." });
  } catch (error) {
    json(response, error.statusCode || 500, { error: error.message || "Unexpected server error.", requestId, details: security.appMode === "demo" ? error.details : undefined });
  }
}).listen(port, security.host, () => {
  process.stdout.write(`EvidenceWeaver API listening on http://${security.host}:${port} (${security.appMode} mode)\n`);
});
