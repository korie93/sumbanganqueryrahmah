import assert from "node:assert/strict";
import test from "node:test";
import { waitForProtectedContractContent } from "../lib/ui-protected-route-readiness.mjs";

test("protected readiness waits for the actual owned workspace route, not a generic main or heading", async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const page = { locator(selector) {
    calls.push(selector);
    return { first() { return { waitFor(options) { calls.push(options); return gate; } }; } };
  } };
  let ready = false;
  const pending = waitForProtectedContractContent(page).then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false, "Scanning must remain pending while the auth/tab gate is visible");
  assert.deepEqual(calls, [".sqr-workspace main#main-content", { state: "visible", timeout: 15_000 }]);
  release();
  await pending;
  assert.equal(ready, true);
});

test("missing protected content rejects rather than accepting blocked/unsupported/error gate markup", async () => {
  const failure = new Error("Protected workspace did not mount");
  const page = { locator(selector) {
    assert.equal(selector, ".sqr-workspace main#main-content");
    return { first() { return { waitFor: async ({ timeout }) => {
      assert.equal(timeout, 100);
      throw failure;
    } }; } };
  } };
  await assert.rejects(waitForProtectedContractContent(page, 100), (error) => error === failure);
});
