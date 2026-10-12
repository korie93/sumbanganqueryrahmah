import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

test("favicon status images are exact supplied ZIP bytes at tab-sized resolutions", () => {
  const root = new URL("../../../", import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL("assets/brand/favicon-status-provenance.json", root), "utf8"));
  for (const entry of provenance.files) {
    const bytes = readFileSync(new URL(entry.file, root));
    assert.equal(bytes.length, entry.bytes, entry.file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, entry.file);
    if (entry.file.endsWith(".png")) {
      assert.equal(bytes.subarray(1, 4).toString(), "PNG");
      const size = Number(/(?:v1-|offline-)(\d+)\.png$/.exec(entry.file)?.[1]);
      assert.equal(bytes.readUInt32BE(16), size);
      assert.equal(bytes.readUInt32BE(20), size);
    }
  }
  assert.equal(provenance.files.length, 8);
  assert.deepEqual(readFileSync(new URL("client/src/assets/favicon-status/offline-32.png", root)),
    readFileSync(new URL("client/public/brand/favicon-offline-v1-32.png", root)));
});
