import { expect, test, type Page, type Request } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Actual compiled Viewer with synthetic files and controlled data GETs only.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

const importId = "viewer-retry-a";
const alternateId = "viewer-retry-b";
const importName = "Synthetic retry dataset";
const alternateName = "Synthetic alternate dataset";
const headers = ["Customer Name", "Reference", "Account Number", "Region", "Notes"];
const customer = (number: number) => `Synthetic Customer ${String(number).padStart(3, "0")}`;
type ColumnFilter = { column: string; operator: string; value: string };
type Query = { id: string; page: number; pageSize: number; cursor: string | null; search: string; filters: ColumnFilter[] };
type Reply = { status: number; body?: unknown };
type DataRead = {
  request: Request;
  query: Query;
  released: boolean;
  settled: boolean;
  release: (status: number, body?: unknown) => void;
};

async function installFixture(page: Page, baseURL: string | undefined, options: {
  firstStatus?: number; controlledClock?: boolean;
} = {}) {
  const session = await installSessionFixture(page, baseURL, {
    role: "superuser", ...(options.controlledClock === undefined ? {} : { controlledClock: options.controlledClock }),
  });
  const origin = new URL(baseURL!).origin;
  const requests: DataRead[] = [];
  const files = [
    { id: importId, name: importName, filename: "synthetic-retry.csv", rowCount: 61 },
    { id: alternateId, name: alternateName, filename: "synthetic-alternate.csv", rowCount: 12 },
  ].map((item) => ({ ...item, createdAt: now, createdBy: "guidance.superuser", isDeleted: false }));
  let responsePlan: (query: Query) => Reply | null = () => ({ status: options.firstStatus ?? 200 });
  let permitAbortedResponses = false;

  function dataResponse(query: Query) {
    const count = query.id === importId ? 61 : 12;
    const rows = Array.from({ length: count }, (_, index) => ({
      id: `${query.id}-row-${index + 1}`, importId: query.id,
      jsonDataJsonb: {
        "Customer Name": query.id === importId ? customer(index + 1) : `Alternate Customer ${index + 1}`,
        Reference: `SYNTHETIC-${index + 1}`, "Account Number": `000000${String(index + 1).padStart(6, "0")}`,
        Region: (index + 1) % 2 === 0 ? "Even" : "Odd", Notes: `Synthetic note ${index + 1}`,
      },
    })).filter((row) => {
      const values: Record<string, string> = row.jsonDataJsonb;
      if (query.search && !Object.values(values).some((value) => value.toLowerCase().includes(query.search.toLowerCase()))) return false;
      return query.filters.every(({ column, operator, value }) => {
        const actual = values[column]!.toLowerCase();
        const expected = value.toLowerCase();
        if (operator === "equals") return actual === expected;
        if (operator === "startsWith") return actual.startsWith(expected);
        if (operator === "endsWith") return actual.endsWith(expected);
        if (operator === "notEquals") return actual !== expected;
        return actual.includes(expected);
      });
    });
    let offset = (query.page - 1) * query.pageSize;
    if (query.cursor !== null) {
      const match = /^viewer-retry:(\d+):(\d+)$/.exec(query.cursor);
      expect(match, "Only the cursor issued for this batch may be reused").not.toBeNull();
      expect(Number(match![1])).toBe(query.pageSize);
      offset = Number(match![2]);
      expect(offset).toBe((query.page - 1) * query.pageSize);
    }
    const pageRows = rows.slice(offset, offset + query.pageSize);
    const hasNextPage = offset + pageRows.length < rows.length;
    const nextCursor = hasNextPage ? `viewer-retry:${query.pageSize}:${offset + pageRows.length}` : null;
    return { headers, rows: pageRows, total: rows.length, page: query.page, pageSize: query.pageSize,
      limit: query.pageSize, offset, nextCursor,
      pagination: { mode: "hybrid", page: query.page, pageSize: query.pageSize, limit: query.pageSize,
        offset, nextCursor, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / query.pageSize)),
        hasNextPage, hasPreviousPage: query.page > 1 },
    };
  }

  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, viewer: true } } });
  });
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { ok: true, sourceConfigs: [] } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const pageSize = Number(new URL(route.request().url()).searchParams.get("pageSize") ?? 20);
    return route.fulfill({ json: { imports: files.slice(0, pageSize), pagination: {
      page: 1, pageSize, limit: pageSize, mode: "offset", offset: 0,
      total: files.length, totalPages: Math.max(1, Math.ceil(files.length / pageSize)),
      hasNextPage: pageSize < files.length, hasPreviousPage: false,
    } } });
  });
  await page.context().route((url) => url.origin === origin && /^\/api\/imports\/viewer-retry-[ab]\/data$/.test(url.pathname), async (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.fallback();
    const url = new URL(request.url());
    const query: Query = {
      id: url.pathname.split("/")[3], page: Number(url.searchParams.get("page")),
      pageSize: Number(url.searchParams.get("pageSize")), cursor: url.searchParams.get("cursor"),
      search: url.searchParams.get("search") ?? "",
      filters: JSON.parse(url.searchParams.get("columnFilters") ?? "[]") as ColumnFilter[],
    };
    expect([importId, alternateId]).toContain(query.id);
    expect(Number.isInteger(query.page) && query.page > 0).toBe(true);
    expect(Number.isInteger(query.pageSize) && query.pageSize >= 10 && query.pageSize <= 500).toBe(true);
    for (const filter of query.filters) expect(headers).toContain(filter.column);
    let releaseReply: (reply: Reply) => void = () => {};
    const gate = new Promise<Reply>((resolve) => { releaseReply = resolve; });
    const entry: DataRead = { request, query, released: false, settled: false,
      release(status, body) {
        if (entry.released) return;
        entry.released = true;
        releaseReply({ status, body });
      },
    };
    requests.push(entry);
    const automatic = responsePlan(query);
    if (automatic) entry.release(automatic.status, automatic.body);
    try {
      const reply = await gate;
      await route.fulfill({ status: reply.status, json: reply.body ?? (reply.status === 200
        ? dataResponse(query)
        : { ok: false, code: reply.status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR",
          message: reply.status === 403 ? "Synthetic Viewer access denied." : "Synthetic Viewer temporarily unavailable." }),
      headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (!permitAbortedResponses || !request.failure()) throw error;
    } finally { entry.settled = true; }
  });

  return {
    session, requests, dataResponse,
    setResponse(plan: (query: Query) => Reply | null) { responsePlan = plan; },
    allowAbortedResponses() { permitAbortedResponses = true; },
    cleanup() {
      permitAbortedResponses = true;
      for (const entry of requests) entry.release(500);
    },
  };
}

type Fixture = Awaited<ReturnType<typeof installFixture>>;
const pagination = (page: Page) => page.getByRole("navigation", { name: "Dataset pagination", exact: true });
const retry = (page: Page) => page.getByTestId("button-retry-viewer");

async function openViewer(page: Page, id = importId) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await page.getByTestId(`button-view-${id}`).click();
  await expect(page).toHaveURL(/\/viewer(?:[?#]|$)/);
  await expect(page.locator("#viewer-dataset-title")).toHaveText(id === importId ? importName : alternateName);
  await expect(page.getByTestId("input-search-viewer")).toBeVisible();
}

async function useTwentyFiveRows(page: Page) {
  await expect(pagination(page)).toBeVisible();
  await page.getByTestId("select-viewer-page-size").selectOption("25");
  await expect(pagination(page)).toContainText("Showing 1-25 of 61 rows");
}

async function nextRead(fixture: Fixture, previousCount: number) {
  await expect.poll(() => fixture.requests.length).toBe(previousCount + 1);
  return fixture.requests[previousCount];
}

test("Viewer retry: initial failure recovers only after explicit retry and a later denial clears exportable rows", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { firstStatus: 500 });
  try {
    await openViewer(page);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(retry(page)).toHaveText("Cuba Semula");
    await expect(retry(page)).toBeEnabled();
    const failed = fixture.requests.length;
    await page.waitForTimeout(650);
    expect(fixture.requests, "The 500 response must not trigger an automatic Viewer retry").toHaveLength(failed);
    fixture.setResponse(() => ({ status: 200 }));
    await retry(page).focus();
    await retry(page).press("Enter");
    await expect(pagination(page)).toContainText("Showing 1-61 of 61 rows");
    await expect(retry(page)).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(fixture.requests).toHaveLength(failed + 1);
    expect(fixture.requests[fixture.requests.length - 1].query).toEqual(fixture.requests[failed - 1].query);

    await page.getByRole("checkbox", { name: "Select row 1", exact: true }).check();
    fixture.setResponse(() => ({ status: 403 }));
    await page.getByTestId("input-search-viewer").fill("denied");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(retry(page)).toBeDisabled();
    await expect(page.locator(".viewer-page-context")).toContainText("0 rekod");
    await expect(page.getByRole("cell", { name: customer(1), exact: true })).toHaveCount(0);
    const more = page.getByTestId("button-viewer-more-actions");
    if (await more.count()) {
      await more.click();
      await expect(page.getByTestId("button-export-menu")).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
    await expect(page.locator('[data-testid^="button-export-"]')).toHaveCount(0);
    const denied = fixture.requests.length;
    await retry(page).dispatchEvent("click");
    await page.waitForTimeout(150);
    expect(fixture.requests).toHaveLength(denied);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Viewer retry: a failed cursor page preserves search, filters and column order on its exact retry", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openViewer(page);
    await useTwentyFiveRows(page);
    await page.getByTestId("button-column-selector").click();
    await page.getByRole("button", { name: "Move Reference up", exact: true }).click();
    await page.getByTestId("checkbox-column-Notes").uncheck();
    await page.keyboard.press("Escape");
    const orderedHeaders = ["Reference", "Customer Name", "Account Number", "Region"];
    await expect.poll(async () => (await page.getByRole("columnheader").allTextContents()).map((value) => value.trim()).filter((value) => headers.includes(value))).toEqual(orderedHeaders);
    await page.getByTestId("button-toggle-filters").click();
    await page.getByTestId("button-add-filter").click();
    await page.getByTestId("select-filter-column-0").click();
    await page.getByRole("option", { name: "Region", exact: true }).click();
    await page.getByTestId("input-filter-value-0").fill("Even");
    await page.getByTestId("input-search-viewer").fill("Synthetic");
    await expect(pagination(page)).toContainText("Showing 1-25 of 30 rows");
    await expect.poll(() => fixture.requests[fixture.requests.length - 1].query).toMatchObject({ search: "Synthetic", filters: [{ column: "Region", operator: "contains", value: "Even" }] });
    fixture.setResponse((query) => ({ status: query.page === 2 ? 500 : 200 }));
    const beforeFailure = fixture.requests.length;
    await page.getByTestId("button-viewer-next-page").click();
    const failed = await nextRead(fixture, beforeFailure);
    await expect(retry(page)).toBeEnabled();
    expect(failed.query).toEqual({ id: importId, page: 2, pageSize: 25, cursor: "viewer-retry:25:25",
      search: "Synthetic", filters: [{ id: expect.stringMatching(/^viewer-filter-\d+$/), column: "Region", operator: "contains", value: "Even" }] });
    await expect(page.getByTestId("input-search-viewer")).toHaveValue("Synthetic");
    await expect(page.getByTestId("input-filter-value-0")).toHaveValue("Even");
    fixture.setResponse(() => null);
    const beforeRetry = fixture.requests.length;
    await retry(page).click();
    const repeated = await nextRead(fixture, beforeRetry);
    expect(repeated.query).toEqual(failed.query);
    await expect(retry(page)).toHaveText("Memuat semula…");
    await expect(retry(page)).toBeDisabled();
    repeated.release(200);
    await expect(pagination(page)).toContainText("Showing 26-30 of 30 rows");
    await expect(page.getByRole("cell", { name: customer(52), exact: true })).toBeVisible();
    await expect(page.getByTestId("input-search-viewer")).toHaveValue("Synthetic");
    await expect(page.getByTestId("input-filter-value-0")).toHaveValue("Even");
    await expect.poll(async () => (await page.getByRole("columnheader").allTextContents()).map((value) => value.trim()).filter((value) => headers.includes(value))).toEqual(orderedHeaders);
    await expect(retry(page)).toHaveCount(0);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Viewer retry: a held retry keeps its error visible and blocks duplicate attempts at 320px", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const fixture = await installFixture(page, baseURL, { firstStatus: 500 });
  try {
    await openViewer(page);
    await expect(retry(page)).toBeEnabled();
    const message = await page.getByRole("alert").innerText();
    fixture.setResponse(() => null);
    const beforeRetry = fixture.requests.length;
    await retry(page).click();
    const held = await nextRead(fixture, beforeRetry);
    await expect(retry(page)).toHaveText("Memuat semula…");
    await expect(retry(page)).toBeDisabled();
    await expect(page.getByRole("alert")).toHaveText(message);
    await retry(page).dispatchEvent("click");
    await retry(page).dispatchEvent("click");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    expect(fixture.requests).toHaveLength(beforeRetry + 1);
    expect(held.query).toEqual(fixture.requests[beforeRetry - 1].query);
    held.release(200);
    await expect(page.locator(".viewer-mobile-card")).toHaveCount(25);
    await expect(retry(page)).toHaveCount(0);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Viewer retry: editing raw search invalidates a failed cursor retry before the search debounce", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { controlledClock: true });
  try {
    await openViewer(page);
    await useTwentyFiveRows(page);
    fixture.setResponse((query) => ({ status: query.page === 2 ? 500 : 200 }));
    await page.getByTestId("button-viewer-next-page").click();
    await expect(retry(page)).toBeEnabled();
    // Pause only after bootstrap has completed so the next 300ms search window
    // is deterministic without slowing authentication and lazy-route loading.
    await page.clock.pauseAt(new Date(now));
    const staleButton = await retry(page).elementHandle();
    const beforeChange = fixture.requests.length;
    fixture.setResponse(() => ({ status: 200 }));
    await page.getByTestId("input-search-viewer").fill(customer(60));
    await staleButton!.evaluate((button) => (button as HTMLElement).click());
    await page.clock.runFor(299);
    expect(fixture.requests, "The obsolete failed-page button must not start a request during debounce").toHaveLength(beforeChange);
    await page.clock.runFor(1);
    const changed = await nextRead(fixture, beforeChange);
    expect(changed.query).toEqual({ id: importId, page: 1, pageSize: 25, cursor: null, search: customer(60), filters: [] });
    await expect(pagination(page)).toContainText("Showing 1-1 of 1 rows");
    await expect(page.getByRole("cell", { name: customer(60), exact: true })).toBeVisible();
    await expect(retry(page)).toHaveCount(0);
    expect(fixture.requests.filter((entry) => entry.query.page === 2)).toHaveLength(1);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Viewer retry: reverting raw search before debounce starts a fresh first page after the held retry aborts", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { controlledClock: true });
  try {
    await openViewer(page);
    await useTwentyFiveRows(page);
    const search = page.getByTestId("input-search-viewer");
    await search.fill("Synthetic");
    await expect.poll(() => fixture.requests[fixture.requests.length - 1].query.search).toBe("Synthetic");
    await expect(pagination(page)).toContainText("Showing 1-25 of 61 rows");
    fixture.setResponse((query) => ({ status: query.page === 2 ? 500 : 200 }));
    await page.getByTestId("button-viewer-next-page").click();
    await expect(retry(page)).toBeEnabled();
    await page.clock.pauseAt(new Date(now));
    fixture.setResponse(() => null);
    const beforeRetry = fixture.requests.length;
    await retry(page).click();
    const obsolete = await nextRead(fixture, beforeRetry);
    expect(obsolete.query).toMatchObject({ page: 2, cursor: "viewer-retry:25:25", search: "Synthetic" });

    await search.fill("Alternate");
    await expect.poll(() => Boolean(obsolete.request.failure())).toBe(true);
    expect(fixture.requests, "An unready raw query must not issue a stale request").toHaveLength(beforeRetry + 1);
    await search.fill("Synthetic");
    const fresh = await nextRead(fixture, beforeRetry + 1);
    expect(fresh.query).toEqual({ id: importId, page: 1, pageSize: 25, cursor: null, search: "Synthetic", filters: [] });
    fresh.release(200);
    await expect(pagination(page)).toContainText("Showing 1-25 of 61 rows");
    await expect(page.getByRole("cell", { name: customer(1), exact: true })).toBeVisible();
    fixture.allowAbortedResponses();
    obsolete.release(200);
    await expect.poll(() => obsolete.settled).toBe(true);
    await page.clock.runFor(301);
    await expect(search).toHaveValue("Synthetic");
    await expect(pagination(page)).toContainText("Showing 1-25 of 61 rows");
    await expect(page.getByRole("cell", { name: customer(26), exact: true })).toHaveCount(0);
    await expect(retry(page)).toHaveCount(0);
    expect(fixture.requests).toHaveLength(beforeRetry + 2);
    expect(fixture.requests.filter((entry) => entry.query.search === "Alternate")).toHaveLength(0);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Viewer retry: leaving a file aborts its retry and a late response cannot affect another file", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { firstStatus: 500 });
  try {
    await openViewer(page);
    await expect(retry(page)).toBeEnabled();
    fixture.setResponse(() => null);
    const beforeRetry = fixture.requests.length;
    await retry(page).click();
    const held = await nextRead(fixture, beforeRetry);
    await page.getByRole("button", { name: "Back to Saved Imports", exact: true }).click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect.poll(() => Boolean(held.request.failure())).toBe(true);
    fixture.setResponse(() => ({ status: 200 }));
    await page.getByTestId(`button-view-${alternateId}`).click();
    await expect(page.locator("#viewer-dataset-title")).toHaveText(alternateName);
    await expect(pagination(page)).toContainText("Showing 1-12 of 12 rows");
    await expect(page.getByRole("cell", { name: "Alternate Customer 1", exact: true })).toBeVisible();
    fixture.allowAbortedResponses();
    held.release(200);
    await expect.poll(() => held.settled).toBe(true);
    await page.waitForTimeout(150);
    await expect(page.locator("#viewer-dataset-title")).toHaveText(alternateName);
    await expect(pagination(page)).toContainText("Showing 1-12 of 12 rows");
    await expect(page.getByRole("cell", { name: customer(1), exact: true })).toHaveCount(0);
    await expect(retry(page)).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(fixture.requests.filter((entry) => entry.query.id === alternateId)).toHaveLength(1);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});
