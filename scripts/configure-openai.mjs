import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const envPath = resolve(".env");

function maskedPrompt(label) {
  return new Promise((resolvePrompt, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
      reject(new Error("This command needs an interactive terminal so the key can be masked."));
      return;
    }
    let value = "";
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup(); reject(new Error("Configuration cancelled.")); return;
        }
        if (character === "\r" || character === "\n") {
          cleanup(); resolvePrompt(value); return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value) { value = value.slice(0, -1); process.stdout.write("\b \b"); }
          continue;
        }
        if (character >= " ") { value += character; process.stdout.write("*"); }
      }
    };
    process.stdin.on("data", onData);
  });
}

function replaceSetting(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
}

try {
  process.stdout.write("EvidenceWeaver OpenAI setup\nThe key will be stored only in the Git-ignored local .env file and will not be printed.\n\n");
  const key = (await maskedPrompt("Paste your OpenAI project API key: ")).trim();
  if (key.length < 20 || /\s/.test(key)) throw new Error("The value does not look like a valid API key.");
  let content = existsSync(envPath) ? await readFile(envPath, "utf8") : "# EvidenceWeaver local secrets - never commit this file.\n";
  content = replaceSetting(content, "EXTRACTION_MODE", "openai");
  content = replaceSetting(content, "OPENAI_API_KEY", key);
  content = replaceSetting(content, "OPENAI_MODEL", "gpt-5.4-mini");
  content = replaceSetting(content, "PORT", "8787");
  await writeFile(envPath, content, { encoding: "utf8", mode: 0o600 });
  process.stdout.write("\nConfiguration saved. Run `npm run verify:openai`, then restart `npm run dev`.\n");
} catch (error) {
  process.stderr.write(`${error.message}\n`); process.exitCode = 1;
}
