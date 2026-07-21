// Cross-platform, dependency-free launcher for the compiled hackathon demo.
// Force deterministic mock mode so judging never depends on credentials or quota.
process.env.EXTRACTION_MODE = "mock";
process.env.OPENAI_API_KEY = "";
process.env.APP_MODE = "demo";
process.env.DATA_ENCRYPTION_KEY = "";
process.env.CUSTODY_HMAC_KEY = "";
process.env.AUTH_MODE = "";
process.env.AUTH_PROXY_SECRET = "";

await import("../server/index.mjs");
