import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

// Isolated real-browser UI contract, NOT a backend/database E2E or RBAC proof.
// Uses the real page, API schema parser, responsive results, dialog and history.
// All API responses and screenshots are synthetic; external HTTP is blocked.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(rootDir, "scripts/fixtures/general-search-card-no-ui.jsx").replaceAll("\\", "/");
const artifacts = path.join(rootDir, "artifacts/general-search-card-no-browser");
const importedCard = "SOURCE-CARD-NOT-COLLECTION";
const latestCard = "4181XXXXXXXX3188";
const previousCard = "4181XXXXXXXX2002";
const longCard = "0000123456789".repeat(16);
const sourceFile = "Synthetic saved source.xlsx";
const counts = { search: 0, history: 0 };
const historyPages = [];
const unexpectedRequests = [];
const pageErrors = [];
let browser;
let page;
let origin;
let scenario = "normal";
let role = "admin";

function rows() {
  return [latestCard, null, { invalid: true }, "4181XXXXXXXX0999"].map((card, index) => ({
    "Customer Name": `Synthetic Customer ${index + 1}`,
    "Account No": `SOURCE-ACCOUNT-${index + 1}`,
    "Card No": importedCard,
    "Source File": sourceFile,
    _collectionStatus: {
      state: index === 3 ? "historical" : "recorded",
      recordCount: index === 0 ? 11 : 1,
      latestAccountNumber: `COLLECTION-ACCOUNT-${index + 1}`,
      latestCardNumber: scenario === "long" && index === 0 ? longCard : card,
      latestAmount: "125.00", latestPaymentDate: "2026-09-18",
      latestCreatedAt: "2026-09-18T04:00:00.000Z",
      latestStaffNickname: "Synthetic Staff", latestCreatedByLogin: "fixture.staff",
      sourceImportName: sourceFile, sourceFilename: sourceFile,
      purgedAt: index === 3 ? "2026-09-19T04:00:00.000Z" : null,
      purgedBy: index === 3 ? "fixture.admin" : null,
      matchBasis: "source_row", historyKey: `synthetic-history-${index}`,
    },
  }));
}

function historyResponse(pageNumber) {
  const values = pageNumber === 1
    ? [scenario === "malformed" ? { invalid: true } : scenario === "long" ? longCard : latestCard,
      previousCard, null, null, undefined, "", "   ", "00000123", "4181XXXXXXXX7007", "4181XXXXXXXX8008"]
    : ["4181XXXXXXXX9009"];
  return {
    items: values.map((card, index) => ({
      id: `synthetic-${pageNumber}-${index}`, kind: "collection", isHistorical: index === 1,
      cardNumber: card, paymentDate: "2026-09-18", createdAt: "2026-09-18T04:00:00.000Z",
      amount: "125.00", classificationSource: "automatic", automaticClassification: "cp",
      effectiveStatus: index === 1 ? "historical" : "cp", settlementDate: null,
      staffNickname: `Synthetic History Staff ${index + 1}`, createdByLogin: "fixture.staff",
      sourceImportName: role === "user" ? null : sourceFile,
      sourceFilename: role === "user" ? null : sourceFile,
      purgedAt: index === 1 ? "2026-09-19T04:00:00.000Z" : null,
      purgedBy: index === 1 ? "fixture.admin" : null,
    })),
    summary: { recordCount: 11, activeRecordCount: 10, historicalRecordCount: 1,
      poolContributionCount: 0, collectionAmount: "1375.00", poolAmount: "0.00",
      totalCoveredAmount: "1375.00", effectiveStatus: "cp" },
    page: pageNumber, pageSize: 10, total: 11, totalPages: 2,
    hasNextPage: pageNumber === 1, hasPreviousPage: pageNumber === 2,
  };
}

const server = await createServer({
  configFile: false, envFile: false, envDir: false,
  root: path.join(rootDir, "client"),
  define: { __SQR_CLIENT_RELEASE_SHA__: JSON.stringify("") },
  resolve: { alias: { "@": path.join(rootDir, "client/src"), "@shared": path.join(rootDir, "shared") } },
  server: { host: "127.0.0.1", port: 0, strictPort: true, fs: { allow: [rootDir] } },
  logLevel: "error",
  plugins: [react(), {
    name: "isolated-general-search-card-document",
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (new URL(request.url, "http://fixture.invalid").pathname !== "/") return next();
        try {
          const html = await vite.transformIndexHtml(request.url, `<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SQR synthetic General Search Card No</title></head><body><div id="root"></div><script type="module" src="/@fs/${fixturePath}"></script></body></html>`);
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(html);
        } catch (error) { next(error); }
      });
    },
  }],
});

async function startSearch(width, theme, userRole = "admin", nextScenario = "normal") {
  scenario = nextScenario;
  role = userRole;
  await page.setViewportSize({ width, height: 960 });
  await page.goto(`${origin}/?${new URLSearchParams({ theme, role })}`, { waitUntil: "networkidle" });
  await page.getByTestId("input-search").fill("Synthetic");
  await page.getByTestId("input-search").press("Enter");
  await page.getByTestId("button-view-3").waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");
}

async function noHorizontalOverflow(locator, name) {
  assert.equal(await locator.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true,
    `${name} must not overflow horizontally at ${page.viewportSize().width}px.`);
}

async function checkDetail(index, expected, screenshotName) {
  const before = { ...counts };
  await page.getByTestId(`button-view-${index}`).click();
  const dialog = page.getByTestId("general-search-record-dialog");
  const collection = dialog.locator("aside");
  await dialog.waitFor({ state: "visible" });
  const card = collection.locator("dt", { hasText: /^Card No$/ }).locator("+ dd");
  assert.equal(await card.innerText(), expected);
  assert.ok((await collection.innerText()).includes(`COLLECTION-ACCOUNT-${index + 1}`));
  assert.ok(!(await collection.innerText()).includes(importedCard), "Collection card must not fall back to the unrelated imported card.");
  assert.equal(await card.evaluate((element) => getComputedStyle(element).userSelect !== "none"), true);
  assert.equal(await collection.getByText("Fail Saved", { exact: true }).count(), role === "user" ? 0 : 1);
  await noHorizontalOverflow(dialog, "Record dialog");
  await noHorizontalOverflow(collection, "Collection status");
  assert.deepEqual(counts, before, "Opening detail must not issue card/history requests.");
  if (screenshotName) await page.screenshot({ path: path.join(artifacts, screenshotName), animations: "disabled" });
  return { dialog, collection };
}

async function checkHistory(dialog, screenshotName) {
  const before = { ...counts };
  const history = dialog.getByTestId("general-search-collection-history");
  await history.getByRole("button", { name: "Lihat sejarah", exact: true }).click();
  await history.locator("li").nth(9).waitFor({ state: "visible" });
  const cards = history.locator("li dt", { hasText: /^Card No$/ }).locator("+ dd");
  assert.deepEqual(await cards.allInnerTexts(), [scenario === "long" ? longCard : latestCard, previousCard,
    "Tidak dinyatakan", "Tidak dinyatakan", "Tidak dinyatakan", "Tidak dinyatakan", "Tidak dinyatakan",
    "00000123", "4181XXXXXXXX7007", "4181XXXXXXXX8008"]);
  assert.equal(counts.history, before.history + 1);
  assert.equal(counts.search, before.search);
  assert.equal(await history.getByText("Fail Saved", { exact: true }).count(), role === "user" ? 0 : 10);
  await noHorizontalOverflow(history, "Collection history");
  await noHorizontalOverflow(history.locator("li").first(), "History entry with Card No");
  await history.locator("li").first().scrollIntoViewIfNeeded();
  if (screenshotName) await page.screenshot({ path: path.join(artifacts, screenshotName), animations: "disabled" });
  await history.getByRole("button", { name: "Muatkan halaman sejarah 2", exact: true }).click();
  await history.getByText("4181XXXXXXXX9009", { exact: true }).waitFor();
  assert.equal(await history.locator("li").count(), 1, "Pagination must replace the first page, not collapse or append cards.");
  assert.equal(counts.history, before.history + 2);
  assert.equal(counts.search, before.search);
  await history.getByRole("button", { name: "Tutup sejarah", exact: true }).click();
  await history.getByRole("button", { name: "Lihat sejarah", exact: true }).click();
  await history.getByText("4181XXXXXXXX9009", { exact: true }).waitFor();
  assert.equal(counts.history, before.history + 2, "Reopening cached history must not request card data again.");
}

try {
  await mkdir(artifacts, { recursive: true });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  const context = await browser.newContext({ serviceWorkers: "block" });
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpectedRequests.push(url.origin + url.pathname); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    assert.equal(route.request().method(), "GET", "This display-only fixture never mutates data.");
    if (url.pathname === "/api/search/global") {
      counts.search++;
      const results = rows();
      const pageSize = Number(url.searchParams.get("pageSize"));
      const pagination = { mode: "offset", page: 1, pageSize, limit: pageSize,
        offset: 0, total: results.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
      return route.fulfill({ json: { ...pagination, rows: results, results,
        columns: ["Customer Name", "Account No", "Card No", "Source File"], pagination } });
    }
    if (url.pathname === "/api/search/collection-history") {
      assert.equal(url.searchParams.get("key"), "synthetic-history-0");
      assert.equal(url.searchParams.get("pageSize"), "10");
      const pageNumber = Number(url.searchParams.get("page"));
      historyPages.push(pageNumber);
      counts.history++;
      return route.fulfill({ json: historyResponse(pageNumber) });
    }
    unexpectedRequests.push(url.pathname);
    return route.abort();
  });
  for (const width of [320, 390, 1280]) {
    for (const theme of ["light", "dark"]) {
      const historyBefore = counts.history;
      await startSearch(width, theme);
      assert.equal(counts.history, historyBefore, "Search must not eagerly fetch history per row.");
      assert.equal(await page.getByTestId(/^button-view-/).count(), 4, "Adding Card No must preserve result count.");
      const firstRow = width < 768 ? page.locator("article").first() : page.locator("tbody tr").first();
      assert.ok((await firstRow.innerText()).includes(latestCard), "Compact result displays its collection's Card No.");
      await noHorizontalOverflow(page.locator("html"), "Results document");
      await firstRow.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(artifacts, `results-${width}-${theme}.png`), animations: "disabled" });
      for (const [index, expected] of [[0, latestCard], [1, "Tidak dinyatakan"], [2, "Tidak dinyatakan"], [3, "4181XXXXXXXX0999"]]) {
        const { dialog } = await checkDetail(index, expected, `detail-${index}-${width}-${theme}.png`);
        if (index === 0) await checkHistory(dialog, `history-${width}-${theme}.png`);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
      }
      await startSearch(width, theme, "user", "long");
      await noHorizontalOverflow(page.locator("html"), "Long-card results document");
      const { dialog } = await checkDetail(0, longCard, `long-user-detail-${width}-${theme}.png`);
      assert.ok(!(await dialog.innerText()).includes(sourceFile), "Ordinary user's source-file visibility remains hidden.");
      await checkHistory(dialog, `long-user-history-${width}-${theme}.png`);
      await page.keyboard.press("Escape");
      console.log(`[general-search-card-no-browser] PASS ${width}px ${theme}: real results/detail/history, exact cards, safe missing values, long values, source visibility, lazy paginated requests`);
    }
  }
  assert.deepEqual(historyPages, Array.from({ length: 12 }, () => [1, 2]).flat());
  await startSearch(390, "light", "admin", "malformed");
  const { dialog } = await checkDetail(0, latestCard);
  const history = dialog.getByTestId("general-search-collection-history");
  const beforeInvalid = counts.history;
  await history.getByRole("button", { name: "Lihat sejarah", exact: true }).click();
  await history.getByRole("alert").waitFor({ state: "visible" });
  assert.ok((await history.innerText()).includes("Sejarah collection tidak dapat dimuatkan"),
    "Malformed history card must be rejected by the actual API schema, not rendered as an object.");
  assert.equal(await history.locator("li").count(), 0);
  assert.equal(counts.history, beforeInvalid + 1);
  await page.screenshot({ path: path.join(artifacts, "malformed-history-390-light.png"), animations: "disabled" });
  assert.deepEqual(unexpectedRequests, []);
  assert.deepEqual(pageErrors, []);
  console.log(`[general-search-card-no-browser] PASS all isolated UI contracts (synthetic mocked HTTP, not backend E2E); screenshots: ${artifacts}`);
} catch (error) {
  await page?.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
