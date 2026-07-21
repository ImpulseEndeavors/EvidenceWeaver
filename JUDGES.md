# EvidenceWeaver — judging guide

Thank you for reviewing EvidenceWeaver. The submitted build runs locally and does not require dependency installation, an OpenAI API key, or network access.

## Launch in under a minute

Requirement: Node.js 20.19 or newer.

From the extracted submission directory, run:

```bash
node scripts/start-demo.mjs
```

Open <http://127.0.0.1:8787> and select **Tutorial** in the top bar. Stop the server with `Ctrl+C` when finished.

The judge launcher always uses the deterministic mock pipeline and entirely fictional evidence. It does not read an API key or send evidence over the network. Case changes are stored only in the local Git-ignored `data/store.json`; an append-only integrity ledger is stored in `data/custody.ndjson`.

## Suggested five-minute review

1. Select **Tutorial** for the guided feature overview.
2. On **Case overview**, select **Run extraction**.
3. Open **Entities**, select a finding, and follow its citation to the exact source passage.
4. Review **Timeline**, **Relationship map**, and the cautious **Pattern analysis** stages.
5. Open **Coercion signals** to see uncertainty and benign alternatives kept separate from factual findings.
6. Generate **Next questions** and a source-linked **Case brief**.
7. Open **Linked cases** and compare the preloaded **Operation Paper Comet** and **Operation Cedar Echo** evidence. Cedar Echo deliberately looks unrelated on the surface while sharing selected infrastructure, scripts, and event patterns.
8. Open **Custody record** to verify source fingerprints and the hash-chained activity history, then export the evidence manifest.

All people, messages, organizations, domains, transactions, and wallet-like identifiers in the bundled demonstrations are synthetic.

The local judge profile is intentionally labeled as a demo. The same build also contains a fail-closed production profile demonstrating a trusted OIDC-proxy boundary, viewer/analyst/admin permissions, AES-256-GCM storage encryption, HMAC-authenticated custody records, strict origin enforcement, security headers, and rate limiting. External identity-provider and hosting controls are documented but not simulated for judging.

## Troubleshooting

- **`node` is not recognized:** install a current Node.js LTS release, reopen the terminal, and rerun the command.
- **Port 8787 is already in use:** stop the other local process or launch with another port:

  PowerShell:

  ```powershell
  $env:PORT="8790"
  node scripts/start-demo.mjs
  ```

  macOS/Linux:

  ```bash
  PORT=8790 node scripts/start-demo.mjs
  ```

  Then open `http://127.0.0.1:8790`.

- **Blank or missing page:** confirm the submitted archive contains `dist/index.html` and the `dist/assets/` directory.
- **Demo was already changed:** stop the server, archive the prior demo state, and relaunch a pristine copy:

  ```bash
  node scripts/reset-demo.mjs --yes
  node scripts/start-demo.mjs
  ```

  The reset is recoverable and reports the timestamped `data/backups/` location. It cannot reset production or encrypted storage.

## Developer and live-extraction setup

Development work uses pnpm and is not required for judging:

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

Live extraction for user-created evidence additionally requires a server-side OpenAI API key and available API credits. The deterministic judging experience intentionally has neither dependency.

Maintainers can run `node scripts/smoke-demo.mjs` to copy only release files into an isolated temporary directory, verify that no secrets, dependencies, Git metadata, caches, or prior runtime data crossed the boundary, launch with Node alone, and exercise the compiled client assets, API, evidence fingerprints, custody ledger, and manifest.
