import assert from "node:assert/strict";
import test from "node:test";
import { getPublicAuthRequestReference } from "./public-auth-request-reference";

const requestId = "api-12345678-1234-4321-abcd-123456789012";

test("public auth references read only dedicated server metadata in real API error shapes", () => {
  for (const error of [
    { status: 503, requestId },
    { status: 500, error: { requestId } },
    new Error(`503: ${JSON.stringify({ message: "Unavailable", requestId })}`),
    new Error(`500: ${JSON.stringify({ error: { message: "Unavailable", requestId } })}`),
  ]) assert.equal(getPublicAuthRequestReference(error), requestId);
  assert.equal(getPublicAuthRequestReference({ status: 503, requestId: ` ${requestId} ` }), requestId);
  assert.equal(getPublicAuthRequestReference({ status: 500, requestId, error: { requestId: "api-other-123" } }), requestId);
});

test("references never fall back to passwords, reset URLs, tokens or arbitrary diagnostics", () => {
  for (const error of [
    null, undefined, requestId, new Error(requestId),
    { status: 500, token: requestId, password: "FixturePassword1!" },
    new Error(`500: ${JSON.stringify({ token: requestId, message: "FixturePassword1!" })}`),
    new Error("503: The request failed. Reference: " + requestId),
    new Error('500: {"requestId":'),
    { status: 500, requestId: "https://example.invalid/reset-password?token=private" },
    { status: 500, requestId: "<script>alert(1)</script>" },
    { status: 500, requestId: "x\nrequest-id" },
    { status: 500, requestId: "a".repeat(129) },
    { status: 500, requestId: "ab" },
    { status: 500, requestId: { toString() { throw new Error("Do not coerce arbitrary data"); } } },
    new Error(`503: ${JSON.stringify({ requestId, oversized: "x".repeat(64_000) })}`),
  ]) assert.equal(getPublicAuthRequestReference(error), null);
});

test("reference extraction rejects inherited or accessor properties without invoking them", () => {
  const inherited = Object.create({ requestId });
  inherited.status = 500;
  assert.equal(getPublicAuthRequestReference(inherited), null);
  let accessed = false;
  const accessor = Object.defineProperty({ status: 500 }, "requestId", { get() { accessed = true; return requestId; } });
  assert.equal(getPublicAuthRequestReference(accessor), null);
  assert.equal(accessed, false);
});

test("references are limited to server errors and never add noise to rejected links or rate limits", () => {
  for (const status of [200, 400, 401, 403, 404, 408, 409, 410, 429, 499, 600, NaN]) {
    assert.equal(getPublicAuthRequestReference({ status, requestId }), null);
    assert.equal(getPublicAuthRequestReference(new Error(`${status}: ${JSON.stringify({ requestId })}`)), null);
  }
  assert.equal(getPublicAuthRequestReference({ requestId }), null);
  assert.equal(getPublicAuthRequestReference({ status: 599, requestId }), requestId);
});
