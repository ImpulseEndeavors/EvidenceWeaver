import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resetDemoData } from "../scripts/reset-demo.mjs";

test("demo reset archives plaintext runtime data and refuses production storage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evidenceweaver-reset-"));
  try {
    await writeFile(join(directory, "store.json"), "demo store", "utf8");
    await writeFile(join(directory, "custody.ndjson"), "demo ledger", "utf8");
    const preview = await resetDemoData({ dataDirectory: directory, confirmed: false });
    assert.equal(preview.confirmationRequired, true);
    assert.deepEqual(preview.files.sort(), ["custody.ndjson", "store.json"]);
    assert.equal(await readFile(join(directory, "store.json"), "utf8"), "demo store");

    const result = await resetDemoData({ dataDirectory: directory, confirmed: true, now: new Date("2026-07-21T20:00:00.000Z") });
    assert.equal(result.changed, true);
    assert.equal(await readFile(join(result.backupDirectory, "store.json"), "utf8"), "demo store");
    assert.equal(await readFile(join(result.backupDirectory, "custody.ndjson"), "utf8"), "demo ledger");

    await writeFile(join(directory, "store.encrypted.json"), "production", "utf8");
    await assert.rejects(() => resetDemoData({ dataDirectory: directory, confirmed: true }), /encrypted production storage/);
    await assert.rejects(() => resetDemoData({ dataDirectory: directory, appMode: "production", confirmed: true }), /APP_MODE=production/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
