import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const aad = Buffer.from("EvidenceWeaver encrypted store v1", "utf8");

export function decodeEncryptionKey(encoded) {
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptStore(store, key, keyId = "environment") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(store), "utf8"), cipher.final()]);
  return { version: 1, algorithm: "aes-256-gcm", keyId, iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

export function decryptStore(container, key) {
  if (container?.version !== 1 || container.algorithm !== "aes-256-gcm") throw new Error("Unsupported encrypted store format.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(container.iv, "base64"));
  decipher.setAAD(aad); decipher.setAuthTag(Buffer.from(container.authTag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(container.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}

async function replaceWithRetry(temporary, destination) {
  for (let attempt = 0; ; attempt += 1) {
    try { await rename(temporary, destination); return; }
    catch (error) {
      if (!["EACCES", "EBUSY", "EPERM"].includes(error.code) || attempt >= 5) throw error;
      await delay(25 * 2 ** attempt);
    }
  }
}

export function createStore({ dataDirectory, encryptionKey, keyId }) {
  const plaintextPath = join(dataDirectory, "store.json");
  const encryptedPath = join(dataDirectory, "store.encrypted.json");
  const path = encryptionKey ? encryptedPath : plaintextPath;
  return {
    path,
    async initialize() { await mkdir(dataDirectory, { recursive: true }); },
    async load() {
      if (!existsSync(path)) {
        if (encryptionKey && existsSync(plaintextPath)) throw new Error("Encrypted storage is enabled but a plaintext store exists. Export or migrate it before production startup.");
        return { cases: [] };
      }
      const parsed = JSON.parse(await readFile(path, "utf8"));
      const store = encryptionKey ? decryptStore(parsed, encryptionKey) : parsed;
      if (!store || typeof store !== "object" || !Array.isArray(store.cases)) throw new Error("The local case store is invalid.");
      store.linkReviews ??= {};
      for (const item of store.cases) { item.coercionSignals ??= []; item.questions ??= []; }
      return store;
    },
    async save(store) {
      const payload = encryptionKey ? encryptStore(store, encryptionKey, keyId) : store;
      const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
      await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await replaceWithRetry(temporary, path);
    },
  };
}
