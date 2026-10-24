import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import express from "express";
import { createCorsMiddleware } from "../../server/http/cors";
import { createCsrfProtectionMiddleware } from "../../server/http/csrf";

const origin = "https://sqr.audit.invalid";
const csrf = "a".repeat(64); // Synthetic double-submit fixture, never a credential.

test("cookie mutations cannot reach a sink through absent, cross-site or lookalike provenance", async (t) => {
  const app = express();
  let mutations = 0;
  app.use(createCorsMiddleware([origin]));
  app.use(createCsrfProtectionMiddleware({ allowedOrigins: [origin] }));
  app.post("/api/audit-mutation", (_req, res) => {
    mutations += 1;
    res.json({ ok: true });
  });
  const server = http.createServer(app);
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/audit-mutation`;
  const denied: Array<Record<string, string>> = [
    {},
    { "Sec-Fetch-Site": "cross-site" },
    { Origin: "https://sqr.audit.invalid.outside.invalid" },
    { Origin: "https://outside.audit.invalid" },
    { Referer: "https://outside.audit.invalid/" },
    { "X-CSRF-Token": "b".repeat(64), "Sec-Fetch-Site": "cross-site" },
  ];
  for (const extra of denied) {
    const response = await fetch(url, {
      method: "POST", signal: AbortSignal.timeout(3_000), redirect: "error",
      headers: { Cookie: `sqr_auth=audit-dummy;sqr_csrf=${csrf}`, ...extra },
    });
    assert.equal(response.status, 403, JSON.stringify(extra));
    await response.arrayBuffer();
    assert.equal(mutations, 0);
  }
  const allowed = await fetch(url, {
    method: "POST", signal: AbortSignal.timeout(3_000), redirect: "error",
    headers: { Cookie: `sqr_auth=audit-dummy;sqr_csrf=${csrf}`, Origin: origin, "X-CSRF-Token": csrf },
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { ok: true });
  assert.equal(allowed.headers.get("access-control-allow-origin"), origin);
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
  assert.equal(mutations, 1);
});
