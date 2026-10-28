import { expect, test, type Page, type Request } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Actual compiled Saved workspace. Only synthetic list HTTP is controlled;
// shell-count GETs are independent of page reads and never consume their gates.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

type PageRead = {
  request: Request;
  params: URLSearchParams;
  released: boolean;
  settled: boolean;
  release: (body?: unknown) => void;
};

async function installFixture(page: Page, baseURL: string | undefined) {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", controlledClock: true });
  const origin = new URL(baseURL!).origin;
  const files = Array.from({ length: 24 }, (_, index) => ({
    id: `debounce-${String(index + 1).padStart(2, "0")}`,
    name: `Synthetic Alpha file ${String(index + 1).padStart(2, "0")}`,
    filename: `synthetic-alpha-${index + 1}.csv`, createdAt: now,
    createdBy: "synthetic.operator", rowCount: 10 + index, sourceSizeBytes: 1024, isDeleted: false,
  }));
  const reads: PageRead[] = [];
  const countReads: Request[] = [];
  let hold = false;
  let permitAbortedResponses = false;

  function listResponse(params: URLSearchParams) {
    const search = (params.get("search") ?? "").toLowerCase();
    const uploader = (params.get("createdBy") ?? "").toLowerCase();
    const matches = files.filter((item) =>
      (!search || `${item.name} ${item.filename} ${item.createdBy}`.toLowerCase().includes(search))
      && (!uploader || item.createdBy.toLowerCase().includes(uploader)));
    const pageSize = Number(params.get("pageSize") ?? 20);
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const currentPage = Math.min(Number(params.get("page") ?? 1), totalPages);
    const offset = (currentPage - 1) * pageSize;
    return { imports: matches.slice(offset, offset + pageSize), pagination: {
      page: currentPage, pageSize, limit: pageSize, mode: "offset", offset,
      total: matches.length, totalPages,
      hasNextPage: currentPage < totalPages, hasPreviousPage: currentPage > 1,
    } };
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
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.fallback();
    const params = new URL(request.url()).searchParams;
    if (params.get("pageSize") === "1") {
      countReads.push(request);
      return route.fulfill({ json: listResponse(params), headers: { "Cache-Control": "no-store" } });
    }
    let deliver: (body: unknown) => void = () => {};
    const gate = new Promise<unknown>((resolve) => { deliver = resolve; });
    const entry: PageRead = { request, params, released: false, settled: false,
      release(body) {
        if (entry.released) return;
        entry.released = true;
        deliver(body ?? listResponse(params));
      },
    };
    reads.push(entry);
    if (!hold) entry.release();
    try {
      await route.fulfill({ json: await gate, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (!permitAbortedResponses || !request.failure()) throw error;
    } finally { entry.settled = true; }
  });

  return {
    session, reads, countReads, listResponse,
    holdReads() { hold = true; },
    allowAbortedResponses() { permitAbortedResponses = true; },
    cleanup() {
      permitAbortedResponses = true;
      hold = false;
      for (const entry of reads) entry.release();
    },
  };
}

type Fixture = Awaited<ReturnType<typeof installFixture>>;
const search = (page: Page) => page.getByTestId("input-search-saved");
const uploader = (page: Page) => page.getByTestId("input-saved-uploader");

async function openAndPause(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("24 files");
  await expect(page.getByTestId("button-view-debounce-01")).toBeVisible();
  await page.getByTestId("button-toggle-saved-advanced-filters").click();
  await expect(uploader(page)).toBeVisible();
  // Pause after auth and lazy route bootstrap, not while their timers run.
  await page.clock.pauseAt(new Date(now));
}

async function nextRead(fixture: Fixture, previousCount: number) {
  await expect.poll(() => fixture.reads.length).toBe(previousCount + 1);
  return fixture.reads[previousCount];
}

async function expectOldPageHidden(page: Page) {
  await expect(page.getByTestId("button-view-debounce-01")).toHaveCount(0);
  await expect(page.getByTestId("text-import-count")).toHaveCount(0);
  await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Select all visible imports", exact: true })).toHaveCount(0);
}

test("Saved search debounce: both raw text fields update immediately but only their latest values fetch after 300ms", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const fixture = await installFixture(page, baseURL);
  try {
    await openAndPause(page);
    await page.getByRole("checkbox", { name: "Select all visible imports", exact: true }).check();
    await expect(page.getByTestId("button-bulk-delete")).toHaveText("Delete Selected (20)");
    const before = fixture.reads.length;
    await search(page).fill("Al");
    await expect(search(page)).toHaveValue("Al");
    await expectOldPageHidden(page);
    await page.clock.runFor(100);
    await search(page).fill("Alpha");
    await page.clock.runFor(100);
    await uploader(page).fill("synthetic.operator");
    await expect(uploader(page)).toHaveValue("synthetic.operator");
    await page.clock.runFor(299);
    expect(fixture.reads, "Only the final search/uploader pair should be fetched").toHaveLength(before);
    await expectOldPageHidden(page);
    await page.clock.runFor(1);
    const request = await nextRead(fixture, before);
    expect(request.params.get("search")).toBe("Alpha");
    expect(request.params.get("createdBy")).toBe("synthetic.operator");
    expect(request.params.get("page")).toBe("1");
    await expect(page.getByTestId("button-view-debounce-01")).toBeVisible();
    await expect(page.getByTestId("text-import-count")).toHaveText("24 matching");
    await expect(uploader(page)).toBeFocused();
    await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
    expect(fixture.countReads.length).toBeGreaterThan(0);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved search debounce: Enter flushes both latest inputs once, ignores IME Enter, and clearing search cancels its pending value", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openAndPause(page);
    const before = fixture.reads.length;
    await search(page).dispatchEvent("compositionstart", { data: "" });
    await search(page).fill("Alpha");
    await uploader(page).fill("synthetic.operator");
    await page.clock.runFor(350);
    expect(fixture.reads, "An unfinished composition must not publish either pending text field").toHaveLength(before);
    await uploader(page).dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: true });
    expect(fixture.reads, "Composition Enter must not flush a pending query").toHaveLength(before);
    await search(page).dispatchEvent("compositionend", { data: "Alpha" });
    await uploader(page).press("Enter");
    const flushed = await nextRead(fixture, before);
    expect(flushed.params.get("search")).toBe("Alpha");
    expect(flushed.params.get("createdBy")).toBe("synthetic.operator");
    await expect(page.getByTestId("text-import-count")).toHaveText("24 matching");
    await page.clock.runFor(350);
    expect(fixture.reads).toHaveLength(before + 1);

    const beforeClear = fixture.reads.length;
    await search(page).fill("no-match-pending");
    await expectOldPageHidden(page);
    await search(page).fill("");
    const cleared = await nextRead(fixture, beforeClear);
    expect(cleared.params.has("search")).toBe(false);
    expect(cleared.params.get("createdBy")).toBe("synthetic.operator");
    await expect(page.getByTestId("button-view-debounce-01")).toBeVisible();
    await page.clock.runFor(350);
    expect(fixture.reads).toHaveLength(beforeClear + 1);
    expect(fixture.reads.some((entry) => entry.params.get("search") === "no-match-pending")).toBe(false);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved search debounce: discrete view, clear, date, Refresh and page actions do not wait for a text timer", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openAndPause(page);
    let before = fixture.reads.length;
    await search(page).fill("Alpha");
    await uploader(page).fill("synthetic.operator");
    await page.getByTestId("select-saved-workspace-view").selectOption("recent");
    const view = await nextRead(fixture, before);
    expect(view.params.get("search")).toBe("Alpha");
    expect(view.params.get("createdBy")).toBe("synthetic.operator");
    expect(view.params.get("view")).toBe("recent");
    await expect(page.getByTestId("button-view-debounce-01")).toBeVisible();
    await page.clock.runFor(350);
    expect(fixture.reads).toHaveLength(before + 1);

    before = fixture.reads.length;
    await search(page).fill("pending-clear");
    await page.getByTestId("button-clear-filters").click();
    const clear = await nextRead(fixture, before);
    expect(clear.params.has("search")).toBe(false);
    expect(clear.params.has("createdBy")).toBe(false);
    await expect(search(page)).toHaveValue("");
    await expect(uploader(page)).toHaveValue("");
    await expect(page.getByTestId("button-view-debounce-01")).toBeVisible();
    await page.clock.runFor(350);
    expect(fixture.reads).toHaveLength(before + 1);

    before = fixture.reads.length;
    await search(page).fill("Alpha");
    await page.getByTestId("button-date-filter").click();
    await page.locator('button[name="day"]:not(.day-outside)').filter({ hasText: /^10$/ }).click();
    const dated = await nextRead(fixture, before);
    expect(dated.params.get("search")).toBe("Alpha");
    expect(dated.params.get("createdOn")).toBe("2026-10-10");
    await expect(page.getByTestId("button-view-debounce-01")).toBeVisible();

    before = fixture.reads.length;
    await search(page).fill("Alpha file");
    await page.getByTestId("button-refresh").click();
    const refreshed = await nextRead(fixture, before);
    expect(refreshed.params.get("search")).toBe("Alpha file");
    expect(refreshed.params.get("createdOn")).toBe("2026-10-10");
    await expect(page.getByTestId("button-view-debounce-01")).toBeVisible();
    await page.clock.runFor(350);
    expect(fixture.reads).toHaveLength(before + 1);

    before = fixture.reads.length;
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const nextPage = await nextRead(fixture, before);
    expect(nextPage.params.get("page")).toBe("2");
    expect(nextPage.params.get("search")).toBe("Alpha file");
    await expect(page.getByText("Showing 21-24 of 24 saved files", { exact: true })).toBeVisible();
    await page.clock.runFor(350);
    expect(fixture.reads).toHaveLength(before + 1);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved search debounce: raw changes abort an older read and reverting before debounce recovers without a late overwrite", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openAndPause(page);
    fixture.holdReads();
    const before = fixture.reads.length;
    await search(page).fill("Alpha");
    await page.clock.runFor(300);
    const obsolete = await nextRead(fixture, before);
    await search(page).fill("no-match-reverted");
    await expectOldPageHidden(page);
    await expect.poll(() => Boolean(obsolete.request.failure())).toBe(true);
    await search(page).fill("Alpha");
    await page.clock.runFor(300);
    const fresh = await nextRead(fixture, before + 1);
    expect(fresh.params.get("search")).toBe("Alpha");
    expect(fresh.params.get("page")).toBe("1");
    fresh.release();
    await expect(page.getByTestId("text-import-count")).toHaveText("24 matching");
    fixture.allowAbortedResponses();
    obsolete.release({ imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    await expect.poll(() => obsolete.settled).toBe(true);
    await page.clock.runFor(350);
    await expect(search(page)).toHaveValue("Alpha");
    await expect(page.getByTestId("button-view-debounce-01")).toBeVisible();
    await expect(page.getByTestId("text-import-count")).toHaveText("24 matching");
    expect(fixture.reads).toHaveLength(before + 2);
    expect(fixture.reads.some((entry) => entry.params.get("search") === "no-match-reverted")).toBe(false);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved search debounce: leaving Saved cancels pending text timers and a later visit starts with its own query", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openAndPause(page);
    const before = fixture.reads.length;
    await search(page).fill("pending-navigation");
    await uploader(page).fill("pending-uploader");
    await page.getByTestId("nav-group-workspace").click();
    await page.getByTestId("flyout-nav-viewer").click();
    await expect(page.locator("#viewer-dataset-title")).toHaveText("Data Viewer");
    await page.clock.runFor(350);
    expect(fixture.reads, "Unmounted Saved timers must not dispatch a list request").toHaveLength(before);
    await expect(page.getByTestId("input-search-saved")).toHaveCount(0);
    await page.getByTestId("nav-group-workspace").click();
    await page.getByTestId("flyout-nav-saved").click();
    const current = await nextRead(fixture, before);
    expect(current.params.has("search")).toBe(false);
    expect(current.params.has("createdBy")).toBe(false);
    await expect(search(page)).toHaveValue("");
    await expect(page.getByTestId("button-view-debounce-01")).toBeVisible();
    await expect(page.getByTestId("text-import-count")).toHaveText("24 files");
    await page.clock.runFor(350);
    expect(fixture.reads).toHaveLength(before + 1);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});
