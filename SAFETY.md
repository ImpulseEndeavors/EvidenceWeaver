# Limitations and safety statement

EvidenceWeaver is an analyst-support prototype. It organizes submitted information and highlights possible patterns; it does not establish identity, criminal liability, platform ownership, intent, probable cause, or legal conclusions.

- All extracted facts and analytical indicators require qualified human review.
- A citation proves only that submitted text contains the excerpt. It does not prove the excerpt is true.
- Displayed balances, transaction references, wallet ownership, aliases, and company claims require independent verification through lawful, authoritative records.
- Similar names or accounts are not automatically treated as the same identity.
- An exact cross-case identifier match establishes only that the same submitted value appears in two cases; it does not establish common ownership, coordination, or attribution.
- Shared-script and behavioral matches are suggestions, receive lower confidence, require review, and never merge cases automatically.
- Potential coercion indicators do not establish trafficking, forced labor, or victim status. They include benign alternatives and require trained specialist review.
- Investigator questions describe lawful verification needs. They do not initiate contact, surveillance, account access, identity revelation, or data collection.
- Rejected findings are excluded from regenerated briefs; unreviewed findings remain visibly labeled.
- Raw evidence is stored locally. Demo mode uses a Git-ignored plaintext file; configured production mode uses AES-256-GCM authenticated encryption. Live mode sends evidence to the configured OpenAI API only when extraction is run.
- The tool does not contact law enforcement, financial institutions, exchanges, platforms, or third parties.
- The tool does not perform blockchain tracing, identity revelation, surveillance, hacking, reverse-image search, or autonomous enforcement recommendations.
- Both bundled scenarios and all names, organizations, domains, phone-like identifiers, and wallet-like identifiers are fictional demonstration data.

The repository includes deployment-neutral security foundations: fail-closed production configuration, a trusted OIDC-proxy authentication boundary, API-enforced viewer/analyst/admin roles, strict origin and security-header controls, request throttling, encrypted-at-rest workspace storage, source fingerprint verification, and an append-only hash-chained and HMAC-authenticated custody ledger. These features demonstrate intended production behavior; they do not by themselves make a deployment production-ready or legally certified.

A real deployment must still supply and validate the identity provider and proxy, TLS and network isolation, managed secret storage and rotation, transactional multi-user persistence, backups and disaster recovery, tenant isolation, retention and legal-hold policy, centralized monitoring and alerting, incident response, independent penetration testing, privacy and records review, and jurisdiction-specific chain-of-custody procedures. Custody exports provide integrity evidence, not a legal conclusion about admissibility.
