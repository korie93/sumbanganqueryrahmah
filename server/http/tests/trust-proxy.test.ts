import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { applyTrustedProxies } from "../trust-proxy";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";

test("applyTrustedProxies ignores X-Forwarded-For when no trusted proxies are configured", async () => {
  const app = express();
  applyTrustedProxies(app, []);
  app.get("/ip", (req, res) => {
    res.json({ ip: req.ip, ips: req.ips });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/ip`, {
      headers: {
        "x-forwarded-for": "203.0.113.9",
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.notEqual(payload.ip, "203.0.113.9");
    assert.deepEqual(payload.ips, []);
  } finally {
    await stopTestServer(server);
  }
});

test("applyTrustedProxies trusts forwarded addresses only from configured proxies", async () => {
  const app = express();
  applyTrustedProxies(app, ["loopback"]);
  app.get("/ip", (req, res) => {
    res.json({ ip: req.ip, ips: req.ips });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/ip`, {
      headers: {
        "x-forwarded-for": "203.0.113.9",
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ip, "203.0.113.9");
    assert.deepEqual(payload.ips, ["203.0.113.9"]);
  } finally {
    await stopTestServer(server);
  }
});
