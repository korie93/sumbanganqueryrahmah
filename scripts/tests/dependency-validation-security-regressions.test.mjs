import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import test from "node:test";
import { z } from "zod";

const require = createRequire(import.meta.url);
const addressParser = require("nodemailer/lib/addressparser");
const execFileAsync = promisify(execFile);

test("constrained Zod collections reject oversized input before visiting elements", () => {
  let visits = 0;
  const element = z.string().superRefine(() => { visits += 1; });
  const cases = [
    [z.array(element).max(2), ["one", "two", "three"]],
    [z.set(element).max(2), new Set(["one", "two", "three"])],
    [z.map(z.string(), element).check(z.maxSize(2)), new Map([["a", "one"], ["b", "two"], ["c", "three"]])],
  ];
  for (const [schema, value] of cases) {
    visits = 0;
    const result = schema.safeParse(value);
    assert.equal(result.success, false);
    assert.equal(visits, 0, "Size rejection must precede per-element validation.");
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, "too_big");
  }
  assert.deepEqual(z.array(element).max(2).parse(["one", "two"]), ["one", "two"]);
  assert.equal(visits, 2);
});

test("Nodemailer keeps display-name delimiters inside the intended mailbox", () => {
  assert.deepEqual(addressParser('Team: "A; B" <recipient@example.test>;'), [
    { name: "Team", group: [{ address: "recipient@example.test", name: "A; B" }] },
  ]);
  assert.deepEqual(addressParser('"local>part"@example.test'), [
    { address: '"local>part"@example.test', name: "" },
  ]);
  assert.deepEqual(addressParser('recipient@example.test (outer (nested) hidden@example.test)'), [
    { address: "recipient@example.test", name: "outer (nested) hidden@example.test" },
  ]);
});

test("Express body parsing survives trailing bytes on a small compressed body", { timeout: 10_000 }, async () => {
  // Isolate a potential uncaught decompression exception in a bounded child.
  // The synthetic body is a few dozen bytes, delivered only to loopback.
  const script = `
    import assert from "node:assert/strict";
    import express from "express";
    import { gzipSync } from "node:zlib";
    const app = express();
    app.use(express.json({ limit: "1kb" }));
    app.post("/fixture", (req, res) => res.json(req.body));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ rejected: true }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const url = "http://127.0.0.1:" + server.address().port + "/fixture";
    try {
      const body = Buffer.concat([gzipSync(Buffer.from('{"ok":true}')), Buffer.from([255])]);
      const invalid = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" }, body });
      assert.ok([200, 400].includes(invalid.status));
      await invalid.arrayBuffer();
      const valid = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"ok":true}' });
      assert.equal(valid.status, 200);
      assert.deepEqual(await valid.json(), { ok: true });
      await new Promise(resolve => setTimeout(resolve, 30));
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  `;
  const { stderr } = await execFileAsync(process.execPath, ["--max-old-space-size=128", "--input-type=module", "--eval", script], {
    timeout: 5_000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  assert.equal(stderr, "");
});
