import { expect, test, type Page, type Request } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Actual compiled Saved/Viewer routes with fictional, independently read files.
// The fixture never returns cached rows and never accesses a real dataset.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

type Reply = { status: number; body?: unknown };
type ListRead = {
  request: Request; params: URLSearchParams; released: boolean; settled: boolean;
  release: (status?: number, body?: unknown) => void;
};
const fileId = (number: number) => `return-${String(number).padStart(3, "0")}`;
const fileName = (number: number) => `Synthetic Alpha file ${String(number).padStart(3, "0")}`;

async function installFixture(page: Page, baseURL: string | undefined) {
  const session = await installSessionFixture(page, baseURL, { role: "superuser" });
  const origin = new URL(baseURL!).origin;
  const files = Array.from({ length: 120 }, (_, index) => ({
    id: fileId(index + 1), name: fileName(index + 1), filename: `alpha-${index + 1}.csv`,
    createdAt: now, createdBy: "synthetic.operator", rowCount: 12,
    sourceSizeBytes: 1024, isDeleted: false,
  }));
  const reads: ListRead[] = [];
  let holdNext = false;
  let allowAborted = false;

  function listResponse(params: URLSearchParams) {
    const search = (params.get("search") ?? "").toLowerCase();
    const uploader = (params.get("createdBy") ?? "").toLowerCase();
    const matches = files.filter((item) =>
      (!search || `${item.name} ${item.filename} ${item.createdBy}`.toLowerCase().includes(search))
      && (!uploader || item.createdBy.toLowerCase().includes(uploader))
      && (!params.has("createdOn") || item.createdAt.startsWith(params.get("createdOn")!))
      && (!params.has("minRows") || item.rowCount >= Number(params.get("minRows")))
      && (!params.has("maxRows") || item.rowCount <= Number(params.get("maxRows"))));
    const pageSize = Number(params.get("pageSize") ?? 20);
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const current = Math.min(Number(params.get("page") ?? 1), totalPages);
    const offset = (current - 1) * pageSize;
    return { imports: matches.slice(offset, offset + pageSize), pagination: {
      page: current, pageSize, limit: pageSize, mode: "offset", offset,
      total: matches.length, totalPages,
      hasNextPage: current < totalPages, hasPreviousPage: current > 1,
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
  // Leaving through Home reads its authorized summary as well as the existing
  // analytics fixtures. Keep that unrelated dashboard response explicit.
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/collection/summary", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { ok: true, year: Number(params.get("year") ?? 2026), summary: [],
      dashboard: { month: Number(params.get("month") ?? 10), scopeStatus: "ready",
        scopeLabel: "Synthetic records", canViewLeaderBreakdown: true, leaders: [], unassignedAmount: 0 },
    }, headers: { "Cache-Control": "no-store" } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.fallback();
    const params = new URL(request.url()).searchParams;
    // Shell-count requests are not Saved page reads and must not consume gates.
    if (params.get("pageSize") === "1") return route.fulfill({ json: listResponse(params) });
    let deliver: (reply: Reply) => void = () => {};
    const gate = new Promise<Reply>((resolve) => { deliver = resolve; });
    const entry: ListRead = {
      request, params, released: false, settled: false,
      release(status = 200, body) {
        if (entry.released) return;
        entry.released = true;
        deliver({ status, body: body ?? listResponse(params) });
      },
    };
    reads.push(entry);
    if (holdNext) holdNext = false;
    else entry.release();
    try {
      const reply = await gate;
      await route.fulfill({ status: reply.status, json: reply.body, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (!allowAborted || !request.failure()) throw error;
    } finally { entry.settled = true; }
  });
  await page.context().route((url) => url.origin === origin && /^\/api\/imports\/return-\d{3}\/data$/.test(url.pathname), (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const id = url.pathname.split("/")[3];
    const pageSize = Number(url.searchParams.get("pageSize") ?? 100);
    const rows = [{ id: `${id}-row-1`, importId: id,
      jsonDataJsonb: { Reference: `SYNTHETIC-${id}`, Region: "Fictional" } }];
    return route.fulfill({ json: {
      headers: ["Reference", "Region"], rows, total: 1, page: 1, pageSize,
      limit: pageSize, offset: 0, nextCursor: null,
      pagination: { mode: "hybrid", page: 1, pageSize, limit: pageSize, offset: 0,
        nextCursor: null, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    }, headers: { "Cache-Control": "no-store" } });
  });
  return {
    session, files, reads,
    holdNextRead() { holdNext = true; },
    allowAbortedResponses() { allowAborted = true; },
    cleanup() {
      allowAborted = true;
      holdNext = false;
      for (const entry of reads) entry.release();
    },
  };
}

type Fixture = Awaited<ReturnType<typeof installFixture>>;
const search = (page: Page) => page.getByTestId("input-search-saved");
const pageSize = (page: Page) => page.getByRole("combobox", { name: "Page size for saved files", exact: true });

async function openSaved(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("120 files");
  await expect(page.getByTestId(`button-view-${fileId(1)}`)).toBeVisible();
}

async function expectPage(page: Page, number: number, size: number, total = 120) {
  const start = total === 0 ? 0 : (number - 1) * size + 1;
  await expect(page.getByText(`Showing ${start}-${Math.min(total, number * size)} of ${total} saved files`, { exact: true })).toBeVisible();
}

async function openFromSaved(page: Page, number: number) {
  const button = page.getByTestId(`button-view-${fileId(number)}`);
  await button.scrollIntoViewIfNeeded();
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/viewer(?:[?#]|$)/);
  await expect(page.getByTestId("input-search-viewer")).toBeVisible();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(fileName(number));
}

async function nextRead(fixture: Fixture, before: number) {
  await expect.poll(() => fixture.reads.length).toBeGreaterThan(before);
  return fixture.reads[before];
}

async function position(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-testid="saved-files-scroll-region"]');
    return { windowX: window.scrollX, windowY: window.scrollY, listTop: list?.scrollTop ?? 0, listLeft: list?.scrollLeft ?? 0 };
  });
}

test("Saved return context: desktop restores the submitted filters page size page internal scroll and file focus with fresh rows", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    await page.getByTestId("button-toggle-saved-advanced-filters").click();
    await search(page).fill("  Alpha  ");
    await page.getByTestId("input-saved-uploader").fill("synthetic.operator");
    await page.getByTestId("input-saved-uploader").press("Enter");
    await expect(page.getByTestId("text-import-count")).toHaveText("120 matching");
    await page.getByTestId("input-saved-min-rows").fill("10");
    await expect(page.getByTestId(`button-view-${fileId(1)}`)).toBeVisible();
    await page.getByTestId("input-saved-max-rows").fill("20");
    await expect(page.getByTestId(`button-view-${fileId(1)}`)).toBeVisible();
    await page.getByTestId("button-date-filter").click();
    await page.locator('button[name="day"]:not(.day-outside)').filter({ hasText: /^10$/ }).click();
    await expect(page.getByTestId(`button-view-${fileId(1)}`)).toBeVisible();
    await page.getByTestId("select-saved-workspace-view").selectOption("recent");
    await expect(page.getByTestId(`button-view-${fileId(1)}`)).toBeVisible();
    await pageSize(page).selectOption("30");
    await expectPage(page, 1, 30);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expectPage(page, 2, 30);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expectPage(page, 3, 30);

    const target = page.getByTestId(`button-view-${fileId(80)}`);
    await target.scrollIntoViewIfNeeded();
    await target.focus();
    const beforePosition = await position(page);
    expect(beforePosition.listTop).toBeGreaterThan(100);
    const before = fixture.reads.length;
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("input-search-viewer")).toBeVisible();
    fixture.files[79].name = "Updated Synthetic Alpha file 080";
    fixture.holdNextRead();
    await page.getByTestId("button-back").click();
    const read = await nextRead(fixture, before);
    expect(Object.fromEntries(read.params)).toMatchObject({
      page: "3", pageSize: "30", search: "Alpha", createdBy: "synthetic.operator",
      createdOn: "2026-10-10", minRows: "10", maxRows: "20", view: "recent",
    });
    await expect(search(page)).toHaveValue("  Alpha  ");
    await expect(page.getByTestId(`button-view-${fileId(80)}`)).toHaveCount(0);
    read.release();
    await expectPage(page, 3, 30);
    await expect(page.getByTestId("input-saved-uploader")).toHaveValue("synthetic.operator");
    await expect(page.getByTestId("input-saved-min-rows")).toHaveValue("10");
    await expect(page.getByTestId("input-saved-max-rows")).toHaveValue("20");
    await expect(page.getByTestId("select-saved-workspace-view")).toHaveValue("recent");
    await expect(pageSize(page)).toHaveValue("30");
    await expect(page.getByTestId(`card-import-${fileId(80)}`)).toContainText("Updated Synthetic Alpha file 080");
    await expect(page.getByTestId(`button-view-${fileId(80)}`)).toBeFocused();
    await expect.poll(async () => Math.abs((await position(page)).listTop - beforePosition.listTop)).toBeLessThanOrEqual(2);
    await expect.poll(async () => Math.abs((await position(page)).windowY - beforePosition.windowY)).toBeLessThanOrEqual(2);
    await page.waitForTimeout(350);
    expect(fixture.reads).toHaveLength(before + 1);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved return context: mobile return restores window position and keyboard focus without reopening details or selections", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    await pageSize(page).selectOption("10");
    await expectPage(page, 1, 10);
    await page.getByRole("checkbox", { name: "Select all visible imports", exact: true }).check();
    const target = page.getByTestId(`button-view-${fileId(9)}`);
    await target.scrollIntoViewIfNeeded();
    await target.focus();
    const beforePosition = await position(page);
    expect(beforePosition.windowY).toBeGreaterThan(200);
    const before = fixture.reads.length;
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("input-search-viewer")).toBeVisible();
    fixture.holdNextRead();
    await page.getByTestId("button-back").click();
    const read = await nextRead(fixture, before);
    expect(read.params.get("pageSize")).toBe("10");
    read.release();
    await expectPage(page, 1, 10);
    await expect(page.getByTestId(`button-view-${fileId(9)}`)).toBeFocused();
    await expect.poll(async () => Math.abs((await position(page)).windowY - beforePosition.windowY)).toBeLessThanOrEqual(2);
    await expect(page.getByTestId("saved-import-detail-drawer")).toHaveCount(0);
    await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Select all visible imports", exact: true })).not.toBeChecked();
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved return context: a missing anchor and clamped page recover safely and later filter changes cannot steal focus", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expectPage(page, 2, 20);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expectPage(page, 3, 20);
    await openFromSaved(page, 50);
    fixture.files.splice(5);
    await page.getByTestId("button-back").click();
    await expectPage(page, 1, 20, 5);
    await expect(search(page)).toBeFocused();
    await expect(page.getByTestId(`button-view-${fileId(50)}`)).toHaveCount(0);

    // A subsequent return must not restore focus after the person has already
    // started a different search while the restored list read is still pending.
    await openFromSaved(page, 1);
    const before = fixture.reads.length;
    fixture.holdNextRead();
    await page.getByTestId("button-back").click();
    const obsolete = await nextRead(fixture, before);
    expect(obsolete.params.has("search")).toBe(false);
    await search(page).fill("Alpha file 00");
    await search(page).press("Enter");
    const current = await nextRead(fixture, before + 1);
    expect(current.params.get("search")).toBe("Alpha file 00");
    await expect.poll(() => Boolean(obsolete.request.failure())).toBe(true);
    await expect(search(page)).toBeFocused();
    await expectPage(page, 1, 20, 5);
    fixture.allowAbortedResponses();
    obsolete.release(200, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    await expect.poll(() => obsolete.settled).toBe(true);
    await page.waitForTimeout(350);
    await expectPage(page, 1, 20, 5);
    await expect(search(page)).toBeFocused();
    await expect(search(page)).toHaveValue("Alpha file 00");
    await expect(page.getByTestId("saved-import-detail-drawer")).toHaveCount(0);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved return context: leaving the Saved Viewer corridor and refreshing start a fresh list context", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    await search(page).fill("Alpha");
    await search(page).press("Enter");
    await expect(page.getByTestId("text-import-count")).toHaveText("120 matching");
    await openFromSaved(page, 1);
    await page.getByTestId("nav-home").click();
    await expect(page).not.toHaveURL(/\/viewer(?:[?#]|$)/);
    await page.getByTestId("nav-group-workspace").click();
    await page.getByTestId("flyout-nav-saved").click();
    await expect(search(page)).toHaveValue("");
    await expectPage(page, 1, 20);
    await search(page).fill("Alpha");
    await search(page).press("Enter");
    await expect(page.getByTestId("text-import-count")).toHaveText("120 matching");
    await openFromSaved(page, 2);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("input-search-viewer")).toBeVisible();
    const before = fixture.reads.length;
    await page.getByTestId("button-back").click();
    const read = await nextRead(fixture, before);
    expect(read.params.has("search")).toBe(false);
    expect(read.params.get("page")).toBe("1");
    expect(read.params.get("pageSize")).toBe("20");
    await expect(search(page)).toHaveValue("");
    await expectPage(page, 1, 20);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});
