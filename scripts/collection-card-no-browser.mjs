import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

// Real built page + authenticated API + disposable PostgreSQL. No HTTP mocks,
// production endpoints, retained cookies, traces, or screenshots of credentials.
const cardA = "0000123412345678";
const cardB = "9999123412345678";
const longCard = "9007199254740993123";
export async function runCollectionCardNoBrowser({ baseUrl, username, password, limitedAccounts = [], artifactsDir, expectMissingCard = false }) {
  assert.equal(new URL(baseUrl).hostname, "127.0.0.1");
  const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  const externalRequests = [];
  const pageErrors = [];
  const checks = [];
  const page = await context.newPage();
  let phase = "unauthenticated access";
  let authenticated = false;
  page.setDefaultTimeout(15_000);
  page.on("pageerror", () => pageErrors.push("Browser runtime error"));
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl || ["blob:", "data:"].includes(url.protocol)) return route.continue();
    externalRequests.push(url.origin); return route.abort();
  });
  const mark = (label) => { checks.push(label); console.log(`[collection-card-no-browser] PASS ${label}`); };
  async function list(query) {
    const result = await page.evaluate(async (search) => {
      const response = await fetch(`/api/collection/list?${search}`, { credentials: "include" });
      return { status: response.status, body: await response.json() };
    }, new URLSearchParams(query).toString());
    assert.equal(result.status, 200, "Authenticated collection list API succeeds");
    assert.equal(result.body.ok, true);
    return result.body;
  }
  async function queryUi(search, total, screenshot) {
    phase = `UI search ${screenshot || "filter"}`;
    const response = page.waitForResponse((item) => {
      const url = new URL(item.url());
      return url.pathname === "/api/collection/list" && url.searchParams.get("search") === search.trim();
    });
    const input = page.locator("#collection-records-search");
    await input.fill(search);
    assert.equal(await input.inputValue(), search, "Search preserves full input as text");
    const result = await response;
    assert.equal(result.status(), 200, "Real UI search request succeeds");
    const payload = await result.json();
    assert.equal(payload.total, total, `Expected record count for ${screenshot || "synthetic search"}`);
    await page.getByText(new RegExp(`^Showing .* of ${total} records$`)).waitFor();
    if (total) {
      await page.locator("tbody tr[aria-label]").first().waitFor();
      const expectedCards = payload.records.map((record) => record.cardNumber || "-");
      await page.waitForFunction((cards) => {
        const cells = Array.from(document.querySelectorAll("tbody tr[aria-label]"), (row) => row.querySelectorAll("td")[4]?.textContent?.trim());
        return JSON.stringify(cells) === JSON.stringify(cards);
      }, expectedCards);
      assert.deepEqual(await page.locator("tbody tr[aria-label] td:nth-child(5)").allInnerTexts(), expectedCards,
        "Real table Card No cells exactly match the returned strings without rounding or clipping digits");
    }
    else await page.getByText("No collection records found.", { exact: true }).waitFor();
    if (screenshot) {
      if (total) await page.locator("tbody tr[aria-label]").first().scrollIntoViewIfNeeded();
      else await page.getByText("No collection records found.", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(artifactsDir, `${screenshot}.png`) });
    }
    return payload;
  }
  try {
    const unauthorized = await context.request.get(`${baseUrl}/api/collection/list?search=${cardA}`);
    assert.equal(unauthorized.status(), 401, "Unauthenticated full-card search is denied");
    mark("unauthenticated API denied");
    phase = "real password login";
    await page.goto(`${baseUrl}/login`);
    await page.getByTestId("input-username").fill(username);
    await page.getByTestId("input-password").fill(password);
    const login = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST");
    await page.getByTestId("input-password").press("Enter");
    assert.equal((await login).status(), 200, "Synthetic account logs in through actual UI");
    authenticated = true;
    phase = "initial collection records page";
    await page.goto(`${baseUrl}/collection/records`);
    await page.getByTestId("collection-records-page").waitFor();
    await page.locator("#collection-records-search").waitFor();
    await page.getByText(/^Showing .* of 59 records$/).waitFor();
    mark("real authenticated View Rekod Collection mounted with 59 synthetic records");
    const byIc = await queryUi("990101019999", 52, "ic-existing-record");
    assert.ok(byIc.records.some((record) => record.cardNumber === cardA));
    const byName = await queryUi("Synthetic Card Customer", 52, "name-existing-record");
    assert.ok(byName.records.some((record) => record.cardNumber === cardA));
    await queryUi("ACC-CARD-FIXTURE", 52, "account-existing-record");
    mark("same existing records found by IC, customer name and account; full card already displayed");
    const cardResult = await queryUi(cardA, expectMissingCard ? 0 : 51, expectMissingCard ? "baseline-card-missing" : "card-exact-results");
    if (expectMissingCard) {
      const direct = await list({ search: cardA });
      assert.equal(direct.total, 0);
      mark("EXPECTED BASELINE DEFECT: identical displayed Card No returns zero in real UI and API");
      return;
    }
    assert.equal(cardResult.records.length, 50);
    assert.ok(cardResult.records.every((record) => record.cardNumber === cardA && record.sourceImportId === "fixture-card-source-a"));
    assert.equal(Number(cardResult.totalAmount), 51);
    const next = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/collection/list" && Boolean(url.searchParams.get("cursor"));
    });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const second = await (await next).json();
    assert.equal(second.total, 51);
    assert.equal(second.records.length, 1);
    assert.equal(second.records[0].cardNumber, cardA);
    assert.ok(!new Set(cardResult.records.map((record) => record.id)).has(second.records[0].id));
    await page.getByText("Page 2 / 2", { exact: true }).waitFor();
    await page.getByRole("cell", { name: cardA, exact: true }).waitFor();
    await page.locator("tbody tr[aria-label]").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifactsDir, "card-pagination-second-page.png") });
    await page.getByRole("button", { name: "Prev", exact: true }).click();
    await page.getByText("Page 1 / 2", { exact: true }).waitFor();
    mark("full Card No pagination 50+1, totals and cached previous page remain correct");
    await queryUi("  0000 1234 1234 5678  ", 51, "card-spaced-input");
    const other = await queryUi(cardB, 1, "card-same-customer-other-source");
    assert.equal(other.records[0].sourceImportId, "fixture-card-source-b");
    assert.equal(other.records[0].cardNumber, cardB);
    mark("leading zeros and whitespace preserved; same IC/account and same last4 do not cross source-card matches");
    await queryUi(longCard, 1, "card-long-precision");
    assert.equal((await list({ search: longCard })).records[0].cardNumber, longCard);
    await queryUi("9007199254740993124", 0, "card-one-digit-wrong");
    mark("19-digit Card No survives UI/API exactly; adjacent identifier does not match");
    phase = "API filter and historical identity regressions";
    assert.equal((await list({ search: cardA, sourceImportIds: "fixture-card-source-b" })).total, 0);
    assert.equal((await list({ search: cardA, sourceImportIds: "fixture-card-source-a", agingBuckets: "D3", classifications: "cp", from: "2026-09-01", to: "2026-09-30" })).total, 51);
    assert.equal((await list({ search: cardA, from: "2026-08-01", to: "2026-08-31" })).total, 0);
    assert.equal((await list({ search: cardA, agingBuckets: "D4" })).total, 0);
    mark("search intersects Saved source, date, aging and classification filters in real API");
    assert.equal((await list({ search: cardA, classifications: "abort_cp" })).total, 0);
    for (const [search, total] of [["0199997777", 59], ["P10", 59], ["25.00", 1]]) {
      assert.equal((await list({ search })).total, total);
    }
    mark("phone, batch and payment amount search remain intact");
    for (const [search, expectedCard] of [["1111123412345678", "1111123412345678"],
      ["2222123412345678", "2222123412345678"], ["3333-1234-1234-5678", "3333-1234-1234-5678"]]) {
      const result = await list({ search });
      assert.equal(result.total, 1, "Historical and formatted Saved Card remain searchable");
      assert.equal(result.records[0].cardNumber, expectedCard);
    }
    assert.equal((await list({ search: "4444123412345678" })).total, 0, "Tampered governed Card hash fails closed");
    assert.equal((await list({ search: "5555123412345678" })).total, 0, "Changed source Account fails record obligation verification");
    for (const search of ["Synthetic Missing Customer", "Synthetic Tampered Customer", "Synthetic Changed Customer"]) {
      const result = await list({ search });
      assert.equal(result.total, 1, "Missing or unverified Card does not hide original record from name search");
      assert.equal(result.records[0].cardNumber ?? null, null);
    }
    mark("deleted source index historical links, stored spaces/hyphens, missing Card and hash/account tamper fail-closed coverage");
    phase = "clear search reset";
    const resetResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/collection/list" && !url.searchParams.has("search");
    });
    await page.locator("#collection-records-search").fill("");
    assert.equal((await (await resetResponse).json()).total, 59);
    await page.getByText(/^Showing .* of 59 records$/).waitFor();
    assert.equal(await page.locator("#collection-records-search").inputValue(), "");
    mark("clearing search resets first page and restores all scoped records");
    phase = "mobile Card No search";
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByRole("button", { name: /^Search & Filters/ }).click();
    const mobileInput = page.locator("#collection-records-search-mobile");
    const mobileResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/collection/list" && url.searchParams.get("search") === "9999 1234 1234 5678";
    });
    await mobileInput.fill("9999 1234 1234 5678");
    assert.equal((await (await mobileResponse).json()).total, 1);
    await page.keyboard.press("Escape");
    await page.locator("article").filter({ hasText: cardB }).waitFor();
    await page.locator("article").filter({ hasText: cardB }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: path.join(artifactsDir, "card-mobile-results.png") });
    mark("real mobile filters and exact full-card result with no page overflow");
    phase = "real logout access revocation";
    const logout = await page.evaluate(async () => {
      const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("sqr_csrf="))?.slice(9);
      return (await fetch("/api/activity/logout", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}) }, body: "{}" })).status;
    });
    assert.equal(logout, 200, "Actual logout succeeds");
    const afterLogout = await page.evaluate(async () => (await fetch("/api/collection/list?search=0000123412345678", { credentials: "include" })).status);
    assert.equal(afterLogout, 401, "Logged-out browser cannot search Card No");
    mark("real logout revokes authenticated full-card search access");
    for (const account of limitedAccounts) {
      phase = `real ${account.role} unauthorized Card No search`;
      const limitedContext = await browser.newContext({ serviceWorkers: "block" });
      try {
        const limitedPage = await limitedContext.newPage();
        await limitedPage.goto(`${baseUrl}/login`);
        await limitedPage.getByTestId("input-username").fill(account.username);
        await limitedPage.getByTestId("input-password").fill(account.password);
        const limitedLogin = limitedPage.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST");
        await limitedPage.getByTestId("input-password").press("Enter");
        assert.equal((await limitedLogin).status(), 200, "Limited fixture account logs in");
        const denied = await limitedPage.evaluate(async (card) => {
          const query = new URLSearchParams({ search: card, createdByLogin: "superuser", nickname: "Fixture Collector",
            cardSearchSourceLinks: JSON.stringify([{ sourceImportId: "fixture-card-source-a", sourceDataRowId: "fixture-card-row-a" }]) });
          const response = await fetch(`/api/collection/list?${query}`, { credentials: "include" });
          return { status: response.status, body: await response.json() };
        }, cardA);
        if (account.role === "admin") {
          // Explicitly requesting an unassigned nickname must be rejected.
          assert.equal(denied.status, 400);
        } else {
          assert.equal(denied.status, 200);
          assert.equal(denied.body.total, 0);
          assert.deepEqual(denied.body.records, []);
        }
        const scoped = await limitedPage.evaluate(async (card) => {
          const response = await fetch(`/api/collection/list?${new URLSearchParams({ search: card })}`, { credentials: "include" });
          return { status: response.status, body: await response.json() };
        }, cardA);
        assert.equal(scoped.status, 200);
        assert.equal(scoped.body.total, 0);
        assert.deepEqual(scoped.body.records, []);
        mark(`authenticated ${account.role} cannot find an out-of-scope known Card No or inject source/owner scope`);
      } finally { await limitedContext.close(); }
    }
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    console.error(`[collection-card-no-browser] Failed safe phase: ${phase}`);
    if (authenticated) await page.screenshot({ path: path.join(artifactsDir, "failure.png"), mask: [page.locator("input[type=password]")] }).catch(() => {});
    throw error;
  } finally {
    await writeFile(path.join(artifactsDir, "verification.json"), JSON.stringify({ mode: expectMissingCard ? "baseline-reproduction" : "verification", phase, checks, externalRequests, pageErrors }, null, 2));
    await browser.close();
  }
}
