import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { waitForAuthenticatedWorkspace } from "../two-factor-browser.mjs";

const source = await readFile(new URL("../two-factor-browser.mjs", import.meta.url), "utf8");
const expectedWait = (state) => ({ state, timeout: 15_000 });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("authenticated readiness gates navigation until the workspace is visible and Login has left", async () => {
  const workspaceReady = deferred();
  const loginHidden = deferred();
  const hiddenWaitStarted = deferred();
  const events = [];
  const page = {
    locator(selector) {
      assert.equal(selector, ".sqr-workspace");
      return {
        async waitFor(options) {
          assert.deepEqual(options, expectedWait("visible"));
          events.push("wait for workspace");
          await workspaceReady.promise;
          events.push("workspace visible");
        },
      };
    },
    getByTestId(testId) {
      assert.equal(testId, "input-username");
      return {
        async waitFor(options) {
          assert.deepEqual(options, expectedWait("hidden"));
          events.push("wait for Login to leave");
          hiddenWaitStarted.resolve();
          await loginHidden.promise;
          events.push("Login hidden");
        },
      };
    },
    async goto() { events.push("navigate to Settings"); },
    evaluate() { assert.fail("Readiness must not mutate browser or authentication state"); },
    context() { assert.fail("Readiness must not inject cookies or storage state"); },
    route() { assert.fail("Readiness must not mock application responses"); },
  };
  const navigateAfterReadiness = (async () => {
    await waitForAuthenticatedWorkspace(page);
    await page.goto();
  })();

  assert.deepEqual(events, ["wait for workspace"]);
  workspaceReady.resolve();
  await hiddenWaitStarted.promise;
  assert.deepEqual(events, ["wait for workspace", "workspace visible", "wait for Login to leave"]);
  loginHidden.resolve();
  await navigateAfterReadiness;
  assert.deepEqual(events, [
    "wait for workspace", "workspace visible", "wait for Login to leave", "Login hidden", "navigate to Settings",
  ]);
});

for (const failingWait of ["workspace", "Login"]) {
  test(`authenticated readiness propagates a ${failingWait} timeout without retry or navigation`, async () => {
    const failure = Object.assign(new Error("Synthetic readiness timeout"), { name: "TimeoutError" });
    const events = [];
    const page = {
      locator(selector) {
        assert.equal(selector, ".sqr-workspace");
        return {
          async waitFor(options) {
            assert.deepEqual(options, expectedWait("visible"));
            events.push("workspace");
            if (failingWait === "workspace") throw failure;
          },
        };
      },
      getByTestId(testId) {
        assert.equal(testId, "input-username");
        return {
          async waitFor(options) {
            assert.deepEqual(options, expectedWait("hidden"));
            events.push("Login");
            throw failure;
          },
        };
      },
      async goto() { assert.fail("A failed readiness check must not navigate"); },
    };
    await assert.rejects(async () => {
      await waitForAuthenticatedWorkspace(page);
      await page.goto();
    }, (error) => error === failure);
    assert.deepEqual(events, failingWait === "workspace" ? ["workspace"] : ["workspace", "Login"]);
  });
}

test("all actual successful login paths wait for the authenticated workspace, excluding a pending 2FA challenge", () => {
  const passwordLogin = source.match(/async function passwordLogin\(target\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(passwordLogin, "Password login helper remains identifiable");
  assert.match(passwordLogin, /if \(!body\.twoFactorRequired\) \{\s*(?:markPhase\([^\n]*\);\s*)?await waitForAuthenticatedWorkspace\(target\);\s*\}/);
  assert.equal((passwordLogin.match(/waitForAuthenticatedWorkspace\(/g) || []).length, 1);

  assert.match(source, /assert\.equal\(\(await verified\)\.status\(\), 200,[^\n]*\);\s*(?:markPhase\([^\n]*\);\s*)?await waitForAuthenticatedWorkspace\(loginPage\);/);
  assert.match(source, /assert\.equal\(\(await finalVerified\)\.status\(\), 200,[^\n]*\);\s*(?:markPhase\([^\n]*\);\s*)?await waitForAuthenticatedWorkspace\(finalPage\);/);
});

test("personal Security navigation waits for the authenticated shell before and after loading the protected route", () => {
  const settings = source.match(/async function settings\(target\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(settings, "Settings helper remains identifiable");
  assert.match(settings, /await waitForAuthenticatedWorkspace\(target\);[\s\S]*await target\.goto\(`\$\{baseUrl\}\/security`\);[\s\S]*await waitForAuthenticatedWorkspace\(target\);[\s\S]*getByTestId\("two-factor-settings"\)/);
  assert.doesNotMatch(settings, /\/settings|Security.*click/);
});
