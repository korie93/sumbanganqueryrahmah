import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../../http/errors";
import { sendCollectionError } from "../collection/collection-route-handler-factories";
import { createJsonTestApp, startTestServer, stopTestServer } from "./http-test-utils";

test("Collection export 429 responses expose retry headers without exposing private metadata or changing bodies", async () => {
  const app = createJsonTestApp();
  app.get("/:kind", (req, res) => {
    res.setHeader("RateLimit-Reset", "10");
    const rateLimit = req.params.kind === "concurrent"
      ? { limit: 1, retryAfterMs: 1_000 }
      : { limit: 4, retryAfterMs: 39_999, resetAfterMs: 39_999 };
    sendCollectionError(res, new HttpError(429, "Export quota reached.", {
      details: { rateLimit, username: "private.staff" },
    }), "Unexpected failure");
  });
  const { baseUrl, server } = await startTestServer(app);
  try {
    for (const kind of ["window", "concurrent"]) {
      const response = await fetch(`${baseUrl}/${kind}`);
      assert.equal(response.status, 429);
      assert.deepEqual(await response.json(), { ok: false, message: "Export quota reached." });
      assert.equal(response.headers.get("retry-after"), kind === "window" ? "40" : "1");
      assert.equal(response.headers.get("ratelimit-limit"), kind === "window" ? "4" : "1");
      assert.equal(response.headers.get("ratelimit-remaining"), "0");
      assert.equal(response.headers.get("ratelimit-reset"), kind === "window" ? "40" : null);
    }
  } finally {
    await stopTestServer(server);
  }
});
