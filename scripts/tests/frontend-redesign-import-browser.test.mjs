import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "../lib/playwright-chrome.mjs";
import { buildRedesignImportPlan, buildRedesignViewerPerformancePlan, resolveRedesignImportChecksEnabled, validateRedesignImportEnvironment } from "../frontend-redesign-import-browser.mjs";

const source = readFileSync(new URL("../frontend-redesign-import-browser.mjs", import.meta.url), "utf8");
const runner = readFileSync(new URL("../test-frontend-redesign-isolated.mjs", import.meta.url), "utf8");
const tempParent = path.resolve(os.tmpdir());
const baseUrl = "http://127.0.0.1:54322";
const username = "collectioncardfixture123456abcdef";
const env = {
  SQR_REDESIGN_ISOLATED_CLUSTER: "1", SQR_REDESIGN_DATA_DIR: path.join(tempParent, "sqr-collection-card-no-Ab12Cd", "postgres"),
  PG_HOST: "127.0.0.1", PG_PORT: "54321", PG_USER: "sqr_fixture", PG_DATABASE: "sqr_collection_card_test",
  SEED_SUPERUSER_USERNAME: username, PUBLIC_APP_URL: baseUrl, HOST: "127.0.0.1", PORT: "54322",
};

test("Import opt-in accepts only explicit one and stays separate from role/Billing verification", () => {
  for (const value of [undefined, "", "0"]) assert.equal(resolveRedesignImportChecksEnabled({ SQR_REDESIGN_IMPORT_CHECKS: value }), false);
  assert.equal(resolveRedesignImportChecksEnabled({ SQR_REDESIGN_IMPORT_CHECKS: "1" }), true);
  for (const value of [true, 1, "yes", " 1", "2"]) assert.throws(() => resolveRedesignImportChecksEnabled({ SQR_REDESIGN_IMPORT_CHECKS: value }));
  assert.match(runner, /!importChecksEnabled \|\| \(!roleChecksEnabled && !billingFixtureEnabled\)/);
  assert.ok(runner.indexOf("Import checks run separately") < runner.indexOf("const fixtureRoot = await mkdtemp"));
});

test("Import mutation provenance rejects production URLs, existing data, mismatched account or port", () => {
  assert.equal(validateRedesignImportEnvironment(env, baseUrl, username, tempParent).dataDir, env.SQR_REDESIGN_DATA_DIR);
  for (const changed of [
    { PG_HOST: "prod.example" }, { PG_DATABASE: "sqr_db" }, { DATABASE_URL: "postgresql://localhost/existing" },
    { SQR_REDESIGN_ISOLATED_CLUSTER: "0" }, { SQR_REDESIGN_DATA_DIR: tempParent },
    { SEED_SUPERUSER_USERNAME: "existing-user" }, { HOST: "0.0.0.0" }, { PORT: env.PG_PORT },
    { PUBLIC_APP_URL: "https://sqr-system.com" },
  ]) assert.throws(() => validateRedesignImportEnvironment({ ...env, ...changed }, baseUrl, username, tempParent));
  for (const url of ["https://127.0.0.1:54322", "http://localhost:54322", "https://sqr-system.com", `${baseUrl}/path`]) {
    assert.throws(() => validateRedesignImportEnvironment({ ...env, PUBLIC_APP_URL: url }, url, username, tempParent));
  }
  assert.throws(() => validateRedesignImportEnvironment(env, baseUrl, "existing-user", tempParent));
});

test("Import plans preserve leading zero and unsafe-integer identifiers as strings for every case", () => {
  const plans = [390, 1440].flatMap((width) => ["light", "dark"].map((theme) => buildRedesignImportPlan(width, theme)));
  assert.equal(new Set(plans.map((plan) => plan.csv)).size, 4, "Distinct files avoid content-hash deduplication across cases");
  for (const plan of plans) {
    assert.equal(plan.rows.length, 2);
    assert.deepEqual(plan.expectedHeaders, ["Customer Name", "CARD NO", "ACCOUNT NUMBER"]);
    assert.equal(plan.expectedRows[0]["CARD NO"], "00009007199254740993");
    assert.equal(plan.expectedRows[1]["CARD NO"], "90071992547409931234");
    assert.equal(plan.expectedRows[1]["ACCOUNT NUMBER"], "000000000000000002");
    assert.ok(plan.csv.includes('"Internal note"'));
    assert.equal(plan.expectedRows.some((row) => Object.hasOwn(row, "Internal note")), false);
  }
  assert.throws(() => buildRedesignImportPlan(10000, "light"));
  assert.throws(() => buildRedesignImportPlan(390, "other"));
});

test("Import proof uses actual upload, mapping, Save, Saved and Viewer without API mocks or parser substitution", () => {
  assert.match(source, /SHOW data_directory/);
  assert.match(source, /records\.rows\[0\]\.count, 59/);
  assert.ok(source.indexOf("await verifyFreshFixture") < source.indexOf("chromium.launch"));
  assert.doesNotMatch(source, /route\.fulfill|storageState:|recordHar|tracing\.start|DELETE FROM|INSERT INTO|UPDATE users|parseImportPreview/);
  assert.match(source, /getByTestId\("input-file"\)\.setInputFiles/);
  assert.match(source, /getByTestId\("button-save"\)\.click/);
  assert.match(source, /getByTestId\(`button-view-\$\{saved\.id\}`\)\.click/);
  assert.match(source, /multipart\\\/form-data/);
  assert.match(source, /assert\.deepEqual\(\[\.\.\.data\.headers\]\.sort\(\), \[\.\.\.plan\.expectedHeaders\]\.sort\(\)\)/);
  assert.match(source, /identifiersPreservedAsStrings: true/);
  assert.match(source, /runRedesignAccessibility\(page\)/);
  assert.match(source, /\/api\/activity\/logout/);
  assert.match(source, /manifest\.checks\.length, 4/);
});

test("Viewer performance fixtures are bounded and synthetic with exact string identifiers", () => {
  const light = buildRedesignViewerPerformancePlan("light");
  const dark = buildRedesignViewerPerformancePlan("dark");
  assert.notEqual(light.csv, dark.csv);
  for (const plan of [light, dark]) {
    assert.equal(plan.rows.length, 181);
    assert.equal(plan.csv.trim().split("\r\n").length, 182);
    assert.equal(new Set(plan.rows.map((row) => row[0])).size, 181);
    for (const row of plan.rows) {
      assert.equal(row.length, 3);
      assert.match(row[0], /^Synthetic Viewer Performance (light|dark) \d{3}$/);
      assert.match(row[1], /^0000900719925474\d{4}$/);
      assert.match(row[2], /^00000000000000\d{4}$/);
    }
  }
  assert.throws(() => buildRedesignViewerPerformancePlan("other"));
});

test("Viewer perf changes only the owned fixture page setting and restores it in finally", () => {
  assert.match(source, /const originalPageSize = originalConfig\.viewerRowsPerPage/);
  assert.match(source, /key: "viewer_rows_per_page", value/);
  assert.match(source, /await setPageSize\(150\)/);
  assert.match(source, /finally \{\s*if \(watchRequests\) manifest\.performanceDiagnostics\.push\([^\n]+\);\s*if \(watchRequests\) page\.off\("request", watchRequests\);\s*await setPageSize\(originalPageSize\);/);
  assert.match(source, /location\.origin !== origin/);
  assert.match(source, /"X-CSRF-Token": decodeURIComponent\(csrf\)/);
  assert.ok(source.indexOf("await verifyFreshFixture") < source.indexOf("await verifyViewerPerformance"));
});

test("Viewer perf observes loaded data and DOM virtualization without modifying application behavior", () => {
  assert.match(source, /firstPage\.rows\.length, 150/);
  assert.match(source, /initial\.mountedRows <= 34 && initial\.mountedRows < 150/);
  assert.match(source, /initial\.positionedRows, initial\.mountedRows/);
  assert.match(source, /scroller\.scrollTop = scroller\.scrollHeight/);
  assert.match(source, /Offscreen first row is unmounted/);
  assert.match(source, /page\.waitForTimeout\(30_000\)/);
  assert.match(source, /secondPage\.rows\.length, 31/);
  assert.match(source, /requests\[startupRequests\]\.hasCursor, true/);
  assert.match(source, /requests\.length, startupRequests \+ 2/);
  assert.match(source, /const startupRequests = 2/);
  assert.match(source, /page\.waitForTimeout\(650\)/);
  assert.match(source, /idleDataRequests: 0, scrollDataRequests: 0/);
  assert.match(source, /page\.waitForTimeout\(10_500\)/);
  assert.match(source, /manifest\.performance\.length, 2/);
  assert.doesNotMatch(source, /route\.fulfill|addInitScript\([^\n]*low-spec|fetchData\(|setInterval\(|DEFAULT_VIEWER_ROWS_PER_PAGE/);
});

test("Viewer cursor-total defect stays explicit and separate from scoped performance proof", () => {
  assert.match(source, /verifyUnchangedViewerPaginationBaseline/);
  assert.match(source, /Known pagination metadata issue may be classified as pre-existing only while its backend is byte-identical to HEAD/);
  assert.match(source, /execFileSync\("git", \["show", `HEAD:\$\{relative\}`\]/);
  assert.match(source, /assert\.equal\(current, baseline/);
  assert.match(source, /new Set\(combinedRows\.map\(\(row\) => row\.id\)\)\.size, 181/);
  assert.match(source, /Both pages preserve every original string identifier and mapped value exactly/);
  assert.match(source, /secondPage\.total, 31, "Only the verified existing remaining-count defect is classified separately"/);
  assert.match(source, /VIEWER_CURSOR_TOTAL_COUNTS_REMAINING_ROWS/);
  assert.match(source, /pagination correctness is not claimed/);
  assert.match(source, /paginationMetadataCorrect: secondPage\.total === 181/);
  assert.match(source, /observedFooter: footerText/);
  assert.match(source, /getByRole\("navigation", \{ name: "Dataset pagination", exact: true \}\)/);
});

test("base HEAD Viewer hook independently reproduces the unchanged two-request startup debounce", { skip: process.env.SQR_REDESIGN_BASELINE_HOOK_PROBE !== "1" }, async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const hookPath = "client/src/pages/viewer/useViewerDataState.ts";
  const headHook = execFileSync("git", ["show", `HEAD:${hookPath}`], { cwd: root, encoding: "utf8", windowsHide: true });
  for (const relative of [hookPath, "client/src/pages/viewer/viewer-state-utils.ts", "client/src/pages/viewer/viewer-filter-state-utils.ts", "client/src/pages/viewer/page-utils.ts"]) {
    assert.equal(readFileSync(path.join(root, relative), "utf8").replaceAll("\r\n", "\n"),
      execFileSync("git", ["show", `HEAD:${relative}`], { cwd: root, encoding: "utf8", windowsHide: true }).replaceAll("\r\n", "\n"),
      `${relative} preserves the baseline data lifecycle`);
  }
  // This isolated hook unit test is intentionally separate from the real-app
  // perf proof. Only its API boundary is stubbed; React's scheduler, effects,
  // refs, state and the exact base-HEAD hook implementation execute unchanged.
  const bundle = await build({ write: false, bundle: true, platform: "browser", format: "iife", target: "es2022",
    define: { "process.env.NODE_ENV": '"production"' }, tsconfig: path.join(root, "tsconfig.json"),
    stdin: { contents: `import React, { useCallback } from "react"; import { createRoot } from "react-dom/client";
      import { useViewerDataState } from "baseline-viewer-hook";
      window.__viewerHookRequests = [];
      function Probe() { const onSelectionReset = useCallback(() => {}, []);
        useViewerDataState({ importId: "synthetic-baseline-import", rowsPerPage: 150, onSelectionReset }); return React.createElement("p", null, "Hook mounted"); }
      createRoot(document.getElementById("probe")).render(React.createElement(Probe));`, resolveDir: root, sourcefile: "viewer-baseline-probe.tsx", loader: "tsx" },
    plugins: [{ name: "isolated-viewer-baseline", setup(builder) {
      builder.onResolve({ filter: /^baseline-viewer-hook$/ }, () => ({ path: "baseline-viewer-hook", namespace: "baseline" }));
      builder.onLoad({ filter: /.*/, namespace: "baseline" }, () => ({ contents: headHook, loader: "ts", resolveDir: path.join(root, "client/src/pages/viewer") }));
      builder.onResolve({ filter: /^@\/lib\/api$/ }, () => ({ path: "synthetic-hook-api", namespace: "synthetic-api" }));
      builder.onLoad({ filter: /.*/, namespace: "synthetic-api" }, () => ({ contents: `export async function getImportData(_id, page, pageSize) {
        window.__viewerHookRequests.push({page,pageSize}); return {rows:[], headers:[], total:0, page, pageSize, nextCursor:null}; }`, loader: "js" }));
    } }],
  });
  const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", () => errors.push("Hook runtime error"));
    await page.route("**/*", (route) => route.request().url() === "http://127.0.0.1:54321/"
      ? route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><html><body><div id="probe"></div></body></html>' }) : route.abort());
    await page.goto("http://127.0.0.1:54321/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => window.__viewerHookRequests?.length === 1);
    await page.waitForTimeout(650);
    assert.deepEqual(await page.evaluate(() => window.__viewerHookRequests), [{ page: 1, pageSize: 150 }, { page: 1, pageSize: 150 }]);
    await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => window.__viewerHookRequests.length), 2, "The two baseline startup calls do not become polling");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
