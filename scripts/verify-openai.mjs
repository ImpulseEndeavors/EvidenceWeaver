import { readEnvironmentFile } from "./env.mjs";

const local = await readEnvironmentFile();
const apiKey = process.env.OPENAI_API_KEY || local.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || local.OPENAI_MODEL || "gpt-5.4-mini";

if (!apiKey) {
  process.stderr.write("No OPENAI_API_KEY was found. Run `npm run configure:openai` first.\n");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}.`);
    process.stdout.write(`OpenAI authentication succeeded. Model access confirmed for ${payload.id || model}.\n`);
  } catch (error) {
    process.stderr.write(`OpenAI verification failed: ${error.message}\n`); process.exitCode = 1;
  }
}
