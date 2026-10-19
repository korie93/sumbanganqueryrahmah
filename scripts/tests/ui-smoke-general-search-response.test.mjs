import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const smokeSource = readFileSync(path.resolve("scripts/ui-smoke.mjs"), "utf8");
const helperStart = smokeSource.indexOf("const submitCollectionSmokeGeneralSearch = async");
const helperEnd = smokeSource.indexOf("const verifyCollectionSmokeGeneralSearch = async", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);

const baseUrl = "http://127.0.0.1:5000";
const fixtureAccount = "SYNTHETIC-ACCOUNT-001";

function responseFor({
  query = fixtureAccount,
  page = "1",
  origin = baseUrl,
  pathname = "/api/search/global",
  method = "GET",
  status = 200,
  payload = { rows: [{ "Account No": fixtureAccount, _collectionStatus: { state: "recorded" } }] },
  jsonError,
} = {}) {
  const url = new URL(pathname, origin);
  url.searchParams.set("q", query);
  if (page !== null) url.searchParams.set("page", page);
  return {
    url: () => url.toString(),
    request: () => ({ method: () => method }),
    status: () => status,
    async json() {
      if (jsonError) throw jsonError;
      return payload;
    },
  };
}

function createHarness(onClick = () => {}) {
  const steps = [];
  let predicate;
  let resolveResponse;
  let rejectResponse;
  const pendingResponse = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const emit = (response) => {
    if (!predicate(response)) return false;
    steps.push("response");
    resolveResponse(response);
    return true;
  };
  const page = {
    waitForResponse(actualPredicate, options) {
      assert.equal(options.timeout, 15_000);
      predicate = actualPredicate;
      steps.push("arm response");
      return pendingResponse;
    },
    getByTestId(id) {
      if (id === "input-search") {
        return { async fill(query) {
          assert.equal(query, fixtureAccount);
          steps.push("fill");
        } };
      }
      assert.equal(id, "button-search");
      return { async click() {
        steps.push("click");
        onClick(emit);
      } };
    },
  };
  const submit = vm.runInNewContext(
    `${smokeSource.slice(helperStart, helperEnd)}\nsubmitCollectionSmokeGeneralSearch;`,
    {
      URL,
      baseUrl,
      assert: (condition, message) => { if (!condition) throw new Error(message); },
      assertSmokeResponseStatus(response, expectedStatus, operation) {
        assert.equal(response.status(), expectedStatus,
          `${operation} returned unexpected status ${response.status()}; expected ${expectedStatus}.`);
      },
    },
    { filename: "scripts/ui-smoke.mjs" },
  );
  return { page, submit, steps, emit, rejectResponse };
}

test("General Search smoke arms the exact response before filling and clicking", async () => {
  const response = responseFor();
  const harness = createHarness((emit) => emit(response));
  const row = await harness.submit(harness.page, ` ${fixtureAccount} `, "recorded");
  assert.equal(row["Account No"], fixtureAccount);
  assert.deepEqual(harness.steps, ["arm response", "fill", "click", "response"]);
});

test("General Search smoke ignores unrelated origins, endpoints, queries, methods and pages", async () => {
  const harness = createHarness();
  let completed = false;
  const result = harness.submit(harness.page, fixtureAccount, "recorded").then((row) => {
    completed = true;
    return row;
  });
  await new Promise((resolve) => setImmediate(resolve));
  for (const changes of [
    { query: "OTHER-ACCOUNT" },
    { page: "2" },
    { page: null },
    { method: "POST" },
    { pathname: "/api/search/collection-history" },
    { origin: "https://unrelated.invalid" },
  ]) {
    assert.equal(harness.emit(responseFor(changes)), false);
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false, "A stale or unrelated result must not satisfy this search");
  assert.equal(harness.emit(responseFor()), true);
  assert.equal((await result)["Account No"], fixtureAccount);
  assert.equal(harness.steps.filter((step) => step === "click").length, 1);
});

test("an aborted request without a response cannot satisfy the General Search waiter", async () => {
  const harness = createHarness();
  const result = harness.submit(harness.page, fixtureAccount, "recorded");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.steps, ["arm response", "fill", "click"]);
  // Playwright waitForResponse does not emit a response for an aborted request.
  // Only a completed response for this exact query may satisfy the existing wait.
  harness.emit(responseFor());
  assert.equal((await result)._collectionStatus.state, "recorded");
  assert.deepEqual(harness.steps, ["arm response", "fill", "click", "response"]);
});

for (const status of [401, 403, 429, 500]) {
  test(`General Search smoke fails on HTTP ${status} without retrying or parsing the body`, async () => {
    const harness = createHarness((emit) => emit(responseFor({
      status,
      jsonError: new Error("Body must not be parsed for unsuccessful HTTP status"),
    })));
    await assert.rejects(harness.submit(harness.page, fixtureAccount, "recorded"),
      new RegExp(`unexpected status ${status}`));
    assert.equal(harness.steps.filter((step) => step === "click").length, 1);
  });
}

for (const payload of [
  null,
  { rows: {} },
  { rows: [] },
  { rows: [{ "Account No": "OTHER-ACCOUNT", _collectionStatus: { state: "recorded" } }] },
  { rows: [{ "Account No": fixtureAccount }] },
  { rows: [{ "Account No": fixtureAccount, _collectionStatus: { state: "not_recorded" } }] },
  { rows: [{ "Account No": fixtureAccount, _collectionStatus: { state: "unavailable" } }] },
]) {
  test(`General Search smoke rejects mismatched or missing fixture data: ${JSON.stringify(payload)}`, async () => {
    const harness = createHarness((emit) => emit(responseFor({ payload })));
    await assert.rejects(harness.submit(harness.page, fixtureAccount, "recorded"), (error) => {
      assert.match(error.message, /General Search/);
      assert.doesNotMatch(error.message, /SYNTHETIC-ACCOUNT|OTHER-ACCOUNT/);
      return true;
    });
  });
}

test("General Search smoke validates the no-Collection fixture independently", async () => {
  const harness = createHarness((emit) => emit(responseFor({
    payload: { rows: [{ "Account No": fixtureAccount, _collectionStatus: { state: "not_recorded" } }] },
  })));
  assert.equal((await harness.submit(harness.page, fixtureAccount, "not_recorded"))._collectionStatus.state,
    "not_recorded");
});

test("General Search JSON errors and timeouts remain failures without exposing payload details", async () => {
  const invalidJson = createHarness((emit) => emit(responseFor({
    jsonError: new Error("private response payload"),
  })));
  await assert.rejects(invalidJson.submit(invalidJson.page, fixtureAccount, "recorded"),
    /^Error: General Search returned an invalid JSON payload\.$/);

  const timeout = createHarness();
  const result = timeout.submit(timeout.page, fixtureAccount, "recorded");
  timeout.rejectResponse(new Error("Synthetic bounded response timeout"));
  await assert.rejects(result, /Synthetic bounded response timeout/);
  assert.equal(timeout.steps.filter((step) => step === "click").length, 1);
});

test("Collection smoke flows keep their visible status assertions after the correlated response", () => {
  assert.match(smokeSource,
    /await submitCollectionSmokeGeneralSearch\(page, values\.accountNumber, "recorded"\);\s+await page\.getByText\("Collection direkodkan", \{ exact: true \}\)\.first\(\)\.waitFor\(\{ timeout: 15_000 \}\)/);
  assert.match(smokeSource,
    /await submitCollectionSmokeGeneralSearch\(page, values\.noRecordAccountNumber, "not_recorded"\);\s+await page\.getByText\("Tiada rekod collection", \{ exact: true \}\)\.first\(\)\.waitFor\(\{ timeout: 15_000 \}\)/);
  assert.match(smokeSource,
    /await submitCollectionSmokeGeneralSearch\(page, accountNumber, "recorded"\);\s+await page\.getByText\("Collection direkodkan", \{ exact: true \}\)\.first\(\)\.waitFor\(\{ timeout: 15_000 \}\)/);
});
