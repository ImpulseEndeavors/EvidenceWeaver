export const releaseEntries = [
  ".env.example",
  ".gitattributes",
  ".gitignore",
  "DECISIONS.md",
  "JUDGES.md",
  "README.md",
  "SAFETY.md",
  "TASKS.md",
  "dist",
  "index.html",
  "package.json",
  "pnpm-lock.yaml",
  "scripts",
  "server",
  "src",
  "tests",
  "tsconfig.app.json",
  "tsconfig.json",
  "vite.config.ts",
];

export const forbiddenReleasePaths = [
  ".env",
  ".git",
  ".agents",
  ".judge-smoke-data",
  ".pnpm-store",
  "node_modules",
  "data/store.json",
  "data/store.encrypted.json",
  "data/custody.ndjson",
  "data/backups",
];

export const credentialPatterns = [
  { label: "OpenAI API key", pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { label: "GitHub token", pattern: /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})/ },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { label: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/ },
];
