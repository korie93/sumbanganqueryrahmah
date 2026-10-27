import { expect, test, type Page, type Request } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture } from "./helpers/save-collection-fixture";

// Exercise the real compiled frontend with synthetic HTTP only. Page reads are
// controlled separately from the shell's pageSize=1 Saved-count request.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

type Reply = { status: number; body?: unknown };
type PageRead = {
  request: Request;
  params: URLSearchParams;
  released: boolean;
  settled: boolean;
  release: (status: number, body?: unknown) => void;
};
type Deletion = {
  id: string;
  released: boolean;
  release: (status: number) => void;
};

const staleTitle = "Senarai belum dapat dikemas kini.";
const fileName = (id: string) => `Synthetic refresh file ${id.slice(-2)}`;

async function installFixture(page: Page, baseURL: string | undefined, count = 4) {
  const session = await installSessionFixture(page, baseURL, { role: "superuser" });
  const origin = new URL(baseURL!).origin;
  const files = new Map(Array.from({ length: count }, (_, index) => {
    const id = `refresh-${String(index + 1).padStart(2, "0")}`;
    return [id, {
      id, name: fileName(id), filename: `${id}.csv`, createdAt: "2026-10-10T08:00:00.000Z",
      createdBy: "guidance.superuser", rowCount: 10 + index, sourceSizeBytes: 1024,
      isDeleted: false,
    }] as const;
  }));
  const pageReads: PageRead[] = [];
  const countReads: Request[] = [];
  const deletions: Deletion[] = [];
  const searchFiles = new Map<string, ReadonlySet<string>>();
  let automaticPageStatus: number | null = 200;
  let automaticDeleteReply: ((id: string) => number) | null = null;
  let permitAbortedResponses = false;
  let activeDeletes = 0;
  let maximumActiveDeletes = 0;

  function listResponse(params: URLSearchParams) {
    const matchingIds = searchFiles.get(params.get("search") ?? "");
    const all = [...files.values()].filter((item) => !matchingIds || matchingIds.has(item.id));
    const pageSize = Number(params.get("pageSize") ?? 20);
    const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
    const currentPage = Math.min(Number(params.get("page") ?? 1), totalPages);
    const offset = (currentPage - 1) * pageSize;
    return { imports: all.slice(offset, offset + pageSize), pagination: {
      page: currentPage, pageSize, limit: pageSize, mode: "offset", offset,
      total: all.length, totalPages,
      hasNextPage: currentPage < totalPages, hasPreviousPage: currentPage > 1,
    } };
  }

  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { role: "superuser", tabs: {
      home: true, saved: true, viewer: true, "collection-report": true,
    } }, headers: { "Cache-Control": "no-store" } });
  });
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { ok: true, sourceConfigs: [] }, headers: { "Cache-Control": "no-store" } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.fallback();
    const params = new URL(request.url()).searchParams;
    if (params.get("pageSize") === "1") {
      countReads.push(request);
      return route.fulfill({ json: listResponse(params), headers: { "Cache-Control": "no-store" } });
    }
    let reply: (value: Reply) => void = () => {};
    const gate = new Promise<Reply>((resolve) => { reply = resolve; });
    const entry: PageRead = {
      request, params, released: false, settled: false,
      release(status, body) {
        if (entry.released) return;
        entry.released = true;
        reply({ status, body });
      },
    };
    pageReads.push(entry);
    if (automaticPageStatus !== null) entry.release(automaticPageStatus);
    try {
      const response = await gate;
      await route.fulfill({ status: response.status, json: response.body ?? (response.status === 200
        ? listResponse(params)
        : { ok: false, code: response.status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR",
          message: response.status === 403 ? "Synthetic saved access denied." : "Synthetic saved list unavailable." }),
      headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (!permitAbortedResponses || !request.failure()) throw error;
    } finally {
      entry.settled = true;
    }
  });
  await page.context().route((url) => url.origin === origin && /^\/api\/imports\/refresh-\d{2}$/.test(url.pathname), async (route) => {
    const request = route.request();
    if (request.method() !== "DELETE") return route.fallback();
    const id = new URL(request.url()).pathname.split("/").pop()!;
    let reply: (status: number) => void = () => {};
    const gate = new Promise<number>((resolve) => { reply = resolve; });
    const entry: Deletion = { id, released: false, release(status) {
      if (entry.released) return;
      entry.released = true;
      reply(status);
    } };
    deletions.push(entry);
    activeDeletes += 1;
    maximumActiveDeletes = Math.max(maximumActiveDeletes, activeDeletes);
    if (automaticDeleteReply) entry.release(automaticDeleteReply(id));
    const status = await gate;
    activeDeletes -= 1;
    if (status === 200) files.delete(id);
    return route.fulfill({ status, json: status === 200
      ? { ok: true, success: true }
      : { ok: false, code: "INTERNAL_ERROR", message: "Synthetic deletion failed." },
    headers: { "Cache-Control": "no-store" } });
  });

  return {
    session, files, pageReads, countReads, deletions,
    get maximumActiveDeletes() { return maximumActiveDeletes; },
    listResponse,
    setSearchFiles(search: string, ids: string[]) { searchFiles.set(search, new Set(ids)); },
    holdPageReads() { automaticPageStatus = null; },
    respondPageReads(status: number) {
      automaticPageStatus = status;
      for (const entry of pageReads) entry.release(status);
    },
    respondDeletions(reply: (id: string) => number) {
      automaticDeleteReply = reply;
      for (const entry of deletions) entry.release(reply(entry.id));
    },
    cleanup() {
      permitAbortedResponses = true;
      automaticPageStatus = 200;
      for (const entry of pageReads) entry.release(200);
      automaticDeleteReply = () => 500;
      for (const entry of deletions) entry.release(500);
    },
    allowAbortedResponses() { permitAbortedResponses = true; },
  };
}

type Fixture = Awaited<ReturnType<typeof installFixture>>;

async function openSaved(page: Page, count: number) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Saved Imports", exact: true })).toBeVisible();
  await expect(page.getByTestId("text-import-count")).toHaveText(`${count} files`);
  await expect(page.getByTestId("button-view-refresh-01")).toBeVisible();
}

async function selectAll(page: Page, count: number) {
  await page.getByRole("checkbox", { name: "Select all visible imports", exact: true }).check();
  await expect(page.getByTestId("button-bulk-delete")).toHaveText(`Delete Selected (${count})`);
}

async function nextPageRead(fixture: Fixture, previousCount: number) {
  await expect.poll(() => fixture.pageReads.length).toBe(previousCount + 1);
  return fixture.pageReads[previousCount];
}

async function expectRetainedPage(page: Page, count: number, ids: string[]) {
  await expect(page.getByTestId("text-import-count")).toHaveText(`${count} files`);
  await expect(page.getByTestId("saved-loading-skeleton")).toHaveCount(0);
  for (const id of ids) {
    await expect(page.getByTestId(`button-view-${id}`)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: `Select ${fileName(id)}`, exact: true })).toBeChecked();
  }
  await expect(page.getByTestId("button-bulk-delete")).toHaveText(`Delete Selected (${ids.length})`);
  await expect(page.getByTestId("button-bulk-delete")).toBeDisabled();
}

test("Saved refresh: a held refresh and temporary failure retain rows, count and selection until explicit retry succeeds", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL);
  const selected = [...fixture.files.keys()];
  try {
    await openSaved(page, 4);
    await selectAll(page, 4);
    fixture.holdPageReads();
    const beforeRefresh = fixture.pageReads.length;
    await page.getByTestId("button-refresh").click();
    await nextPageRead(fixture, beforeRefresh);
    await expectRetainedPage(page, 4, selected);
    await expect(page.getByTestId("button-refresh")).toBeDisabled();
    await expect(page.getByTestId("button-retry-saved")).toBeDisabled();
    await page.getByTestId("button-import-actions-refresh-01").click();
    await expect(page.getByTestId("button-delete-refresh-01")).toBeDisabled();
    await page.keyboard.press("Escape");

    fixture.respondPageReads(500);
    await expect(page.getByText(staleTitle, { exact: true })).toBeVisible();
    await expectRetainedPage(page, 4, selected);
    await expect(page.getByTestId("button-refresh")).toBeEnabled();
    await expect(page.getByTestId("button-retry-saved")).toBeEnabled();
    const notice = await page.getByTestId("saved-refresh-notice").boundingBox();
    const retryButton = await page.getByTestId("button-retry-saved").boundingBox();
    expect(notice).not.toBeNull();
    expect(retryButton).not.toBeNull();
    expect(notice!.x).toBeGreaterThanOrEqual(0);
    expect(notice!.x + notice!.width).toBeLessThanOrEqual(320);
    expect(retryButton!.height).toBeGreaterThanOrEqual(44);
    await page.waitForTimeout(150);
    expect(fixture.pageReads, "A failed refresh needs an explicit retry").toHaveLength(beforeRefresh + 1);

    fixture.holdPageReads();
    const beforeRetry = fixture.pageReads.length;
    await page.getByTestId("button-retry-saved").click();
    await nextPageRead(fixture, beforeRetry);
    await expectRetainedPage(page, 4, selected);
    await expect(page.getByTestId("button-refresh")).toBeDisabled();
    await expect(page.getByTestId("button-retry-saved")).toBeDisabled();
    fixture.respondPageReads(200);
    await expect(page.getByTestId("saved-refresh-notice")).toHaveCount(0);
    await expect(page.getByText(staleTitle, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("button-retry-saved")).toHaveCount(0);
    await expect(page.getByTestId("button-refresh")).toBeEnabled();
    await expect(page.getByTestId("button-bulk-delete")).toBeEnabled();
    for (const id of selected) await expect(page.getByRole("checkbox", { name: `Select ${fileName(id)}`, exact: true })).toBeChecked();
    expect(fixture.deletions).toHaveLength(0);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved refresh: changed search, filter, workspace view and page hide the old page and fail without stale results", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, 21);
  try {
    await openSaved(page, 21);
    const changes = [
      { name: "search", key: "search", value: "changed", run: () => page.getByTestId("input-search-saved").fill("changed") },
      { name: "uploader filter", key: "createdBy", value: "synthetic.uploader", run: async () => {
        await page.getByTestId("button-toggle-saved-advanced-filters").click();
        await page.getByTestId("input-saved-uploader").fill("synthetic.uploader");
      } },
      { name: "workspace view", key: "view", value: "recent", run: () => page.getByRole("combobox", { name: "Saved workspace views", exact: true }).selectOption("recent") },
      { name: "page", key: "page", value: "2", run: () => page.getByRole("button", { name: "Next", exact: true }).click() },
    ];
    for (const change of changes) {
      await test.step(change.name, async () => {
        await selectAll(page, 20);
        fixture.holdPageReads();
        const before = fixture.pageReads.length;
        await change.run();
        const request = await nextPageRead(fixture, before);
        expect(request.params.get(change.key)).toBe(change.value);
        await expect(page.getByTestId("saved-loading-skeleton")).toBeVisible();
        await expect(page.getByTestId("button-view-refresh-01")).toHaveCount(0);
        await expect(page.getByTestId("text-import-count")).toHaveCount(0);
        await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
        fixture.respondPageReads(500);
        await expect(page.getByRole("alert")).toContainText("Synthetic saved list unavailable.");
        await expect(page.getByText(staleTitle, { exact: true })).toHaveCount(0);
        await expect(page.getByTestId("button-view-refresh-01")).toHaveCount(0);
        await expect(page.getByTestId("text-import-count")).toHaveCount(0);
        await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
        if (change.name !== "page") {
          fixture.respondPageReads(200);
          await page.getByTestId("button-refresh").click();
          await expect(page.getByTestId("button-view-refresh-01")).toBeVisible();
          await expect(page.getByTestId("text-import-count")).toHaveText("21 matching");
          await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
        }
      });
    }
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved refresh: access denial clears old rows and selection instead of retaining a stale page", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page, 4);
    await selectAll(page, 4);
    fixture.holdPageReads();
    const before = fixture.pageReads.length;
    await page.getByTestId("button-refresh").click();
    await nextPageRead(fixture, before);
    await expectRetainedPage(page, 4, [...fixture.files.keys()]);
    fixture.respondPageReads(403);
    await expect(page.getByRole("alert")).toContainText("Synthetic saved access denied.");
    await expect(page.getByTestId("button-view-refresh-01")).toHaveCount(0);
    await expect(page.getByTestId("text-import-count")).toHaveCount(0);
    await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
    await expect(page.getByText(staleTitle, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("button-retry-saved")).toHaveCount(0);
    fixture.respondPageReads(200);
    await page.getByTestId("button-refresh").click();
    await expect(page.getByTestId("button-view-refresh-01")).toBeVisible();
    await expect(page.getByTestId("text-import-count")).toHaveText("4 files");
    await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Select all visible imports", exact: true })).not.toBeChecked();
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved refresh: partial deletion keeps only failed selections when the follow-up page read fails", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, 6);
  const failed = new Set(["refresh-02", "refresh-05"]);
  try {
    await openSaved(page, 6);
    await selectAll(page, 6);
    const before = fixture.pageReads.length;
    fixture.holdPageReads();
    await page.getByTestId("button-bulk-delete").click();
    const dialog = page.getByRole("alertdialog", { name: "Delete Selected Files?", exact: true });
    await expect(dialog.getByText("6 files selected", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Delete Selected", exact: true }).click();
    await expect.poll(() => fixture.deletions.length).toBe(3);
    fixture.respondDeletions((id) => failed.has(id) ? 500 : 200);
    const read = await nextPageRead(fixture, before);
    expect(read.params.get("pageSize")).toBe("20");
    await expectRetainedPage(page, 2, [...failed]);
    for (const id of ["refresh-01", "refresh-03", "refresh-04", "refresh-06"]) await expect(page.getByTestId(`card-import-${id}`)).toHaveCount(0);
    fixture.respondPageReads(500);
    await expect(page.getByText(staleTitle, { exact: true })).toBeVisible();
    await expectRetainedPage(page, 2, [...failed]);
    await expect(page.getByTestId("button-refresh")).toBeEnabled();
    await expect(page.getByTestId("button-retry-saved")).toBeEnabled();
    expect(fixture.deletions).toHaveLength(6);
    expect(fixture.maximumActiveDeletes).toBeLessThanOrEqual(3);
    expect(fixture.countReads.length, "Shell count requests do not consume the held list response").toBeGreaterThan(0);
    fixture.respondPageReads(200);
    await page.getByTestId("button-retry-saved").click();
    await expect(page.getByText(staleTitle, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("button-bulk-delete")).toHaveText("Delete Selected (2)");
    await expect(page.getByTestId("button-bulk-delete")).toBeEnabled();
    for (const id of failed) await expect(page.getByRole("checkbox", { name: `Select ${fileName(id)}`, exact: true })).toBeChecked();
    expect(fixture.deletions, "Refreshing the list must not retry failed deletions").toHaveLength(6);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved refresh: an old-query deletion refreshes the latest query without reducing unrelated rows or count", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  fixture.setSearchFiles("query-a", ["refresh-01", "refresh-02"]);
  fixture.setSearchFiles("query-b", ["refresh-03", "refresh-04"]);
  const search = page.getByTestId("input-search-saved");
  try {
    await openSaved(page, 4);
    await search.fill("query-a");
    await expect(page.getByTestId("text-import-count")).toHaveText("2 matching");
    await expect(page.getByTestId("button-view-refresh-01")).toBeVisible();
    await expect(page.getByTestId("button-view-refresh-03")).toHaveCount(0);

    await page.getByTestId("button-import-actions-refresh-01").click();
    await page.getByTestId("button-delete-refresh-01").click();
    const dialog = page.getByRole("alertdialog", { name: "Delete Data?", exact: true });
    await expect(dialog.getByText(fileName("refresh-01"), { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(() => fixture.deletions.length).toBe(1);
    expect(fixture.deletions[0].id).toBe("refresh-01");
    await expect(dialog).toHaveCount(0);

    // Filtering remains available while the delete for query A is still held.
    await expect(search).toBeEnabled();
    const beforeQueryB = fixture.pageReads.length;
    await search.fill("query-b");
    const queryB = await nextPageRead(fixture, beforeQueryB);
    expect(queryB.params.get("search")).toBe("query-b");
    await expect(page.getByTestId("text-import-count")).toHaveText("2 matching");
    for (const id of ["refresh-03", "refresh-04"]) await expect(page.getByTestId(`button-view-${id}`)).toBeVisible();
    for (const id of ["refresh-01", "refresh-02"]) await expect(page.getByTestId(`card-import-${id}`)).toHaveCount(0);

    fixture.holdPageReads();
    const beforeDeleteCompletes = fixture.pageReads.length;
    fixture.deletions[0].release(200);
    const followUp = await nextPageRead(fixture, beforeDeleteCompletes);
    expect(followUp.params.get("search"), "Mutation completion must refresh current query B").toBe("query-b");
    await expect(page.getByTestId("text-import-count")).toHaveText("2 matching");
    await expect(page.getByTestId("saved-loading-skeleton")).toHaveCount(0);
    for (const id of ["refresh-03", "refresh-04"]) await expect(page.getByTestId(`button-view-${id}`)).toBeVisible();
    fixture.respondPageReads(500);
    await expect(page.getByText(staleTitle, { exact: true })).toBeVisible();
    await expect(search).toHaveValue("query-b");
    await expect(page.getByTestId("text-import-count")).toHaveText("2 matching");
    await expect(page.locator('[data-testid^="card-import-refresh-"]')).toHaveCount(2);
    for (const id of ["refresh-03", "refresh-04"]) await expect(page.getByTestId(`button-view-${id}`)).toBeVisible();
    for (const id of ["refresh-01", "refresh-02"]) await expect(page.getByTestId(`card-import-${id}`)).toHaveCount(0);
    await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
    await expect(page.getByTestId("button-refresh")).toBeEnabled();
    await expect(page.getByTestId("button-retry-saved")).toBeEnabled();
    expect(fixture.deletions).toHaveLength(1);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved refresh: SPA navigation aborts a held read and its late response cannot update Viewer or a new Saved visit", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page, 4);
    await selectAll(page, 4);
    fixture.holdPageReads();
    const before = fixture.pageReads.length;
    await page.getByTestId("button-refresh").click();
    const held = await nextPageRead(fixture, before);
    await page.getByTestId("nav-group-workspace").click();
    await expect(page.getByTestId("desktop-flyout-workspace")).toBeVisible();
    await page.getByTestId("flyout-nav-viewer").click();
    await expect(page).toHaveURL(/\/viewer$/);
    await expect(page.locator("#viewer-dataset-title")).toHaveText("Data Viewer");
    await expect.poll(() => Boolean(held.request.failure())).toBe(true);
    fixture.allowAbortedResponses();
    const obsolete = fixture.listResponse(held.params);
    held.release(200, { ...obsolete, imports: [{ ...obsolete.imports[0], id: "refresh-late", name: "Obsolete late refresh result" }] });
    await expect.poll(() => held.settled).toBe(true);
    await page.waitForTimeout(150);
    await expect(page.locator("#viewer-dataset-title")).toHaveText("Data Viewer");
    await expect(page.getByText("Obsolete late refresh result", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
    await expect(page.getByText(staleTitle, { exact: true })).toHaveCount(0);

    fixture.respondPageReads(200);
    await page.getByTestId("nav-group-workspace").click();
    await expect(page.getByTestId("desktop-flyout-workspace")).toBeVisible();
    await page.getByTestId("flyout-nav-saved").click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.getByTestId("button-view-refresh-01")).toBeVisible();
    await expect(page.getByTestId("text-import-count")).toHaveText("4 files");
    await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
    await expect(page.getByText("Obsolete late refresh result", { exact: true })).toHaveCount(0);
    expect(fixture.pageReads).toHaveLength(before + 2);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});
