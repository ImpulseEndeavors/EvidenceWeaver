# EvidenceWeaver architecture decisions

## ADR-001 — React client with a minimal Node server

The prototype uses React, TypeScript, and Vite for the interface, with a dependency-light Node HTTP server. The server keeps the OpenAI key out of browser code and serves the compiled app in production. This provides a one-command local demo without introducing a framework-specific deployment surface.

## ADR-002 — Local JSON persistence with an encrypted production profile

Demo workspaces are stored in `data/store.json`, which is ignored by Git. When `DATA_ENCRYPTION_KEY` is configured, the repository instead uses an authenticated AES-256-GCM container in `data/store.encrypted.json`; it refuses to silently mix plaintext and encrypted stores. Writes use a temporary file followed by rename so a partial write is not left behind. A deployed multi-user system should replace this adapter with transactional managed persistence while preserving the same repository boundary.

## ADR-003 — Proposed findings are separate from source evidence

Evidence text is immutable after intake. Extraction replaces only proposed entities, events, relationships, and indicators. Human review changes review status or corrected display fields; it never edits the source. Briefs are regenerated from non-rejected findings.

## ADR-004 — Deterministic mock mode is the default

The complete demonstration works without a network or API key. `EXTRACTION_MODE=openai` opts into the live pipeline. Both paths produce the same case model and pass the same citation-integrity validator, so the interface and demo script remain stable.

## ADR-005 — Staged live-model pipeline

The live path calls the Responses API separately for normalization, entities, events, relationships, indicators, and cautious coercion signals. Every call uses a strict JSON schema. Later analytical stages receive structured facts, not permission to create unrelated claims from raw evidence.

## ADR-006 — Fail closed on citation mismatch

A proposed extraction is persisted only if every finding has at least one exact excerpt found verbatim in a known source, with a correct character range. Unknown entities, invalid confidence values, fabricated excerpts, or broken relationship endpoints reject the proposed result while leaving evidence and prior findings intact.

## ADR-007 — Custom SVG relationship map

The graph is a small, clickable SVG rather than a graph-library dependency. At the synthetic-case scale this is readable, testable, and avoids adding a large dependency for layout behavior the prototype does not require.

## ADR-008 — Exact cross-case matches precede inferred suggestions

Wallets, domains, websites, bank accounts, company names, and communication identifiers are compared deterministically by type and normalized value. Shared-script and event-sequence similarities are shown separately with lower confidence and alternative explanations. Stable match IDs preserve review decisions, and cases are never merged automatically.

## ADR-009 — Coercion signals are a separate specialist-review channel

Possible coercion language is not stored as a factual event or scam indicator. A signal requires an exact excerpt, confidence, benign alternative explanation, and review priority. The UI never states that trafficking occurred or assigns victim status. This preserves the distinction between directly submitted language and a high-consequence interpretation.

## ADR-010 — Investigator questions are generated from structured evidence

Next questions are derived from non-rejected entities and events. Every question explains why it matters, the submitted fact that prompted it, what authorized information would answer it, and one or more citations. Questions can be answered or dismissed but never trigger external contact or data collection automatically.

## ADR-011 — Demo and production security profiles are explicit

The judge launcher always forces the safe, credential-free demo profile. Production mode fails startup unless it has an HTTPS public origin, encrypted workspace key, custody-authentication key, and trusted external OIDC-proxy boundary. This prevents a deployment from accidentally inheriting permissive demo behavior.

## ADR-012 — Authentication terminates at a trusted access proxy

EvidenceWeaver does not implement passwords or token validation itself. A deployment-owned OIDC proxy authenticates users, strips spoofable client headers, and supplies a private proxy secret plus stable user identity and role headers. The API independently applies viewer, analyst, and administrator permissions. This keeps the identity-provider choice outside the application while retaining fail-closed authorization.

## ADR-013 — Custody records are append-only and cryptographically linked

Every application mutation records its actor, action, purpose, case and source identifiers, request ID, timestamp, previous-record hash, and record hash in newline-delimited JSON. Production mode additionally authenticates each record with HMAC-SHA-256. Source SHA-256 fingerprints are recalculated before analytical mutations and when custody status or an export manifest is requested. A broken ledger refuses further mutations; exported manifests state that technical integrity records are not legal certification.

## ADR-014 — Deployment responsibilities remain visible

Provider configuration, TLS termination, network isolation, managed key rotation, database transactions, tenant isolation, retention and legal holds, monitoring, backup recovery, and independent security review depend on the selected host. The application exposes and documents the required boundaries without claiming those external controls are already operating.
