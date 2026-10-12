import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

test("transparent favicon exports retain approved original Q source provenance at tab-sized resolutions", () => {
  const root = new URL("../../../", import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL("assets/brand/favicon-status-provenance.json", root), "utf8"));
  assert.equal(provenance.sources.length, 1);
  assert.equal(provenance.sources[0].sha256, "07e5e47d3a1851200301dc22b49764b6bb174b48843bc2462700ba3c0dc5ea5e");
  const original = readFileSync(new URL(provenance.sources[0].file, root));
  assert.equal(createHash("sha256").update(original).digest("hex"), provenance.sources[0].sha256);
  assert.equal(provenance.components.length, 6, "The source consists of Q ring/tail plus four decorative shapes");
  for (const entry of provenance.files) {
    const bytes = readFileSync(new URL(entry.file, root));
    assert.equal(bytes.length, entry.bytes, entry.file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, entry.file);
    if (entry.file.endsWith(".png")) {
      assert.equal(bytes.subarray(1, 4).toString(), "PNG");
      const size = Number(/(?:v2-|offline-)(\d+)\.png$/.exec(entry.file)?.[1]);
      assert.equal(bytes.readUInt32BE(16), size);
      assert.equal(bytes.readUInt32BE(20), size);
    }
  }
  assert.equal(provenance.files.length, 8);
  assert.deepEqual(readFileSync(new URL("client/src/assets/favicon-status/offline-32.png", root)),
    readFileSync(new URL("client/public/brand/favicon-offline-v2-32.png", root)));
});

test("transparent online ICO contains the same supplied-Q PNG frames as the active size exports", () => {
  const root = new URL("../../../client/public/brand/", import.meta.url);
  const ico = readFileSync(new URL("favicon-online-v2.ico", root));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 4);
  let end = 6 + 4 * 16;
  for (const [index, size] of [16, 32, 48, 64].entries()) {
    const directory = 6 + index * 16;
    assert.equal(ico[directory], size);
    assert.equal(ico[directory + 1], size);
    assert.equal(ico.readUInt16LE(directory + 6), 32);
    const bytes = ico.readUInt32LE(directory + 8), offset = ico.readUInt32LE(directory + 12);
    assert.equal(offset, end);
    const png = ico.subarray(offset, offset + bytes);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    if (size < 64) assert.deepEqual(png, readFileSync(new URL(`favicon-online-v2-${size}.png`, root)));
    end = offset + bytes;
  }
  assert.equal(end, ico.length);
});
