# EvidenceWeaver build checklist

Updated: 2026-07-21

## Core prototype

- [x] React/TypeScript application skeleton and tab navigation
- [x] Local JSON persistence and stable case/source IDs
- [x] Case creation, reopen, and delete actions
- [x] Synthetic fictional demonstration case with 100 messages
- [x] Pasted-text and `.txt` evidence intake
- [x] Exact raw-text preservation and SHA-256 content hash
- [x] Deterministic mock extraction for a reliable credential-free demo
- [x] Server-side OpenAI Responses API integration with strict JSON schemas
- [x] Staged normalization, entity, event, relationship, and indicator processing
- [x] Proposed-result validation with fail-safe error handling
- [x] Entity and event human-review controls
- [x] Persistent evidence panel with exact excerpts and character positions
- [x] Citation-to-source navigation and highlighting
- [x] Dated and undated event timeline
- [x] Clickable relationship graph with sourced edges
- [x] Cautious scam-stage analysis with alternatives and gaps
- [x] Evidence-grounded case brief, copy, and print controls
- [x] Rejected-finding exclusion and unreviewed labels in reports
- [x] Source-reference integrity tests
- [x] Visually verify the overview, evidence highlighting, graph, and generated report in a production browser build

## Stretch objectives A–D

- [x] Complete 12-stage relationship-investment pattern checklist
- [x] Mark unsupported stages “Not observed” with explicit missing-evidence context
- [x] Summarize relationship-investment, fake-platform, and advance-fee patterns without classification
- [x] Seed a second fully fictional, independently reviewable linked case
- [x] Seed a third superficially unrelated case with selective exact, script, and behavior-only links
- [x] Deterministic exact matching for wallets, domains, companies, accounts, and other identifiers
- [x] Clearly labeled shared-script and behavioral-similarity suggestions
- [x] Side-by-side cross-case evidence comparison and citation navigation
- [x] Persistent confirm/reject controls without automatic case merging
- [x] Separate coercion-signal model with exact language, confidence, alternatives, and priority
- [x] Cautious quota and communication-monitoring demonstration signals
- [x] Specialist-review interface with trafficking and victim-status disclaimers
- [x] Evidence-prioritized investigator question generation
- [x] Why-it-matters, prompted-by, information-needed, priority, evidence, and status fields
- [x] Automated tests for cross-case classification and question-source integrity
- [x] Browser verification of objectives A–D

## Security and evidence-custody foundation

- [x] Explicit judge-demo and fail-closed production profiles
- [x] Trusted OIDC-proxy identity boundary with viewer, analyst, and administrator RBAC
- [x] Mutation origin validation, API rate limiting, request IDs, CSP, and security headers
- [x] Optional AES-256-GCM authenticated encryption for workspace storage
- [x] Separate encryption-key identifier and no silent plaintext migration
- [x] SHA-256 evidence fingerprints recalculated before analytical mutations
- [x] Append-only hash-chained custody records for every application mutation
- [x] HMAC-SHA-256 custody-record authentication in production mode
- [x] Human-readable custody workspace with source and ledger verification
- [x] Manual custody note/transfer recording and verifiable manifest export
- [x] Automated tamper, authentication, RBAC, origin, and encrypted-persistence tests
- [x] Recoverable, production-refusing pristine-demo reset command
- [x] Isolated zero-install clean-copy smoke test with release-boundary checks
- [x] Allowlisted judge ZIP packaging with credential scan, manifest, and SHA-256 checksums

## Explicitly deferred

- [ ] OCR, image, PDF, email, and ZIP ingestion
- [ ] Live blockchain or external-infrastructure queries
- [ ] Deploy and validate the selected OIDC identity provider and trusted access proxy
- [ ] Managed transactional database, tenant isolation, backups, and disaster recovery
- [ ] Managed key storage and rotation, retention/legal holds, monitoring, and incident response
- [ ] Independent penetration test, privacy review, and jurisdiction-specific custody certification
