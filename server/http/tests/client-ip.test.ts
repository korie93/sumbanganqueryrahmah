import assert from "node:assert/strict";
import test from "node:test";
import {
  maskClientIpAddress,
  normalizeClientIpAddress,
  resolveRequestClientIp,
} from "../client-ip";

test("normalizeClientIpAddress canonicalizes valid socket addresses and rejects lists", () => {
  assert.equal(normalizeClientIpAddress("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeClientIpAddress("[2001:DB8::5]"), "2001:db8::5");
  assert.equal(normalizeClientIpAddress("fe80::1%eth0"), "fe80::1");
  assert.equal(normalizeClientIpAddress("203.0.113.9, 10.0.0.1"), null);
  assert.equal(normalizeClientIpAddress("not-an-ip"), null);
});

test("resolveRequestClientIp prefers Express req.ip and safely falls back to the socket", () => {
  assert.equal(
    resolveRequestClientIp({
      ip: "198.51.100.42",
      socket: { remoteAddress: "127.0.0.1" },
    } as never),
    "198.51.100.42",
  );
  assert.equal(
    resolveRequestClientIp({
      ip: "invalid",
      socket: { remoteAddress: "::ffff:127.0.0.1" },
    } as never),
    "127.0.0.1",
  );
});

test("maskClientIpAddress keeps audit context without exposing the full address", () => {
  assert.equal(maskClientIpAddress("203.0.113.99"), "203.0.113.x");
  assert.equal(maskClientIpAddress("2001:db8:1234:5678::99"), "2001:db8:1234:5678::/64");
  assert.equal(maskClientIpAddress("2001:db8::99"), "2001:db8:0:0::/64");
  assert.equal(maskClientIpAddress(null), null);
});
