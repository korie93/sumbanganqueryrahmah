import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture } from "./helpers/save-collection-fixture";

// Exercise the actual compiled Saved drawer with synthetic HTTP only. Each
// summary read has an independently controlled response; no real file is read.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

type Reply = { status: number; body?: unknown };
type SummaryRead = {
  id: string;
  request: Request;
  released: boolean;
  settled: boolean;
  release: (status: number, body?: unknown) => void;
};

const unavailable = "Butiran fail belum dapat dimuatkan.";
const empty = "No columns were detected.";
const name = (id: string) => `Synthetic detail file ${id.slice(-2)}`;

async function installFixture(page: Page, baseURL: string | undefined) {
  const session = await installSessionFixture(page, baseURL, { role: "superuser" });
  const origin = new URL(baseURL!).origin;
  const files = new Map(["detail-01", "detail-02"].map((id, index) => [id, {
    id, name: name(id), filename: `${id}.csv`, createdAt: "2026-10-10T08:00:00.000Z",
    createdBy: "guidance.superuser", rowCount: 10 + index, sourceSizeBytes: 1024,
    isDeleted: false,
  }] as const));
  const reads: SummaryRead[] = [];
  let permitAbortedResponses = false;

  function summary(id: string, columns: string[]) {
    return { import: files.get(id)!, columns, columnCount: columns.length };
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
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const pageSize = Number(new URL(route.request().url()).searchParams.get("pageSize") ?? 20);
    return route.fulfill({ json: { imports: [...files.values()].slice(0, pageSize), pagination: {
      page: 1, pageSize, limit: pageSize, mode: "offset", offset: 0,
      total: files.size, totalPages: Math.max(1, Math.ceil(files.size / pageSize)),
      hasNextPage: files.size > pageSize, hasPreviousPage: false,
    } }, headers: { "Cache-Control": "no-store" } });
  });
  await page.context().route((url) => url.origin === origin && /^\/api\/imports\/detail-\d{2}\/summary$/.test(url.pathname), async (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.fallback();
    const id = new URL(request.url()).pathname.split("/").slice(-2)[0]!;
    let reply: (value: Reply) => void = () => {};
    const gate = new Promise<Reply>((resolve) => { reply = resolve; });
    const entry: SummaryRead = {
      id, request, released: false, settled: false,
      release(status, body) {
        if (entry.released) return;
        entry.released = true;
        reply({ status, body });
      },
    };
    reads.push(entry);
    try {
      const response = await gate;
      await route.fulfill({ status: response.status, json: response.body ?? (response.status === 200
        ? summary(id, [id === "detail-01" ? "First file field" : "Second file field"])
        : { ok: false, code: "SYNTHETIC_DETAIL_FAILURE", message: "Synthetic file summary unavailable." }),
      headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (!permitAbortedResponses || !request.failure()) throw error;
    } finally {
      entry.settled = true;
    }
  });
  return {
    session, files, reads, summary,
    allowAbortedResponses() { permitAbortedResponses = true; },
    cleanup() {
      permitAbortedResponses = true;
      for (const entry of reads) entry.release(500);
    },
  };
}

async function openSaved(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
  await expect(page.getByTestId("button-select-import-detail-01")).toBeVisible();
}

async function openDetail(page: Page, id = "detail-01") {
  await page.getByTestId(`button-select-import-${id}`).click();
  const drawer = page.getByTestId("saved-import-detail-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: name(id), exact: true })).toBeVisible();
  return drawer;
}

async function expectNoEmpty(drawer: Locator) {
  await expect(drawer.getByText(empty, { exact: true })).toHaveCount(0);
}

test("Saved detail recovery: temporary failure stays distinct from empty and keyboard retry recovers without duplicate reads", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    const drawer = await openDetail(page);
    await expect.poll(() => fixture.reads.length).toBe(1);
    await expectNoEmpty(drawer);
    await expect(drawer.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
    fixture.reads[0].release(503);
    await expect(drawer.getByText(unavailable, { exact: true })).toBeVisible();
    const retry = drawer.getByTestId("button-retry-saved-detail");
    await expect(retry).toHaveText("Cuba Semula");
    await expect(retry).toBeEnabled();
    await expectNoEmpty(drawer);
    // Shared GET transport normally retries 503 after about one second. This
    // drawer intentionally leaves that decision to its explicit retry control.
    await page.waitForTimeout(1250);
    expect(fixture.reads).toHaveLength(1);

    await drawer.getByRole("button", { name: "Close", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => fixture.reads.length).toBe(2);
    await expect(retry).toBeDisabled();
    await expect(retry).toHaveText("Memuat semula…");
    await expect(drawer.getByText(unavailable, { exact: true })).toBeVisible();
    await expectNoEmpty(drawer);
    await expect(drawer.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect(retry).toBeVisible();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    expect(fixture.reads).toHaveLength(2);
    expect(fixture.reads.map((entry) => entry.id)).toEqual(["detail-01", "detail-01"]);
    fixture.reads[1].release(200);
    await expect(drawer.getByText("First file field", { exact: true })).toBeVisible();
    await expect(drawer.getByText(unavailable, { exact: true })).toHaveCount(0);
    await expect(retry).toHaveCount(0);
    await expectNoEmpty(drawer);
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId("button-select-import-detail-01")).toBeFocused();
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved detail recovery: access denial missing file and malformed response cannot offer retry or a false empty state", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    const replies: Reply[] = [{ status: 403 }, { status: 404 }, { status: 200, body: { columns: [] } }];
    for (let index = 0; index < replies.length; index += 1) {
      const drawer = await openDetail(page);
      await expect.poll(() => fixture.reads.length).toBe(index + 1);
      const response = replies[index];
      fixture.reads[index].release(response.status, response.body);
      await expect(drawer.getByText(unavailable, { exact: true })).toBeVisible();
      await expect(drawer.getByTestId("button-retry-saved-detail")).toHaveCount(0);
      await expectNoEmpty(drawer);
      await expect(drawer.getByText("First file field", { exact: true })).toHaveCount(0);
      await expect(drawer.getByRole("button", { name: "Open Viewer", exact: true })).toBeEnabled();
      await drawer.getByRole("button", { name: "Close", exact: true }).click();
      await expect(drawer).toHaveCount(0);
      await expect(page.getByTestId("button-select-import-detail-01")).toBeFocused();
      expect(fixture.reads).toHaveLength(index + 1);
    }
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved detail recovery: successful empty summary is distinct from loading at 320px", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    const drawer = await openDetail(page);
    await expect.poll(() => fixture.reads.length).toBe(1);
    await expectNoEmpty(drawer);
    await expect(drawer.getByRole("status")).toBeVisible();
    await expect(drawer.getByText(unavailable, { exact: true })).toHaveCount(0);
    fixture.reads[0].release(200, fixture.summary("detail-01", []));
    await expect(drawer.getByText(empty, { exact: true })).toBeVisible();
    await expect(drawer.getByRole("status")).toHaveCount(0);
    await expect(drawer.getByTestId("button-retry-saved-detail")).toHaveCount(0);
    await expect(drawer.getByText(unavailable, { exact: true })).toHaveCount(0);
    expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const bounds = await drawer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved detail recovery: closing a held read aborts it and its late reply cannot replace a newly opened file", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    const drawer = await openDetail(page);
    await expect.poll(() => fixture.reads.length).toBe(1);
    const obsolete = fixture.reads[0];
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect.poll(() => Boolean(obsolete.request.failure())).toBe(true);
    await openDetail(page, "detail-02");
    await expect.poll(() => fixture.reads.length).toBe(2);
    fixture.reads[1].release(200);
    await expect(drawer.getByText("Second file field", { exact: true })).toBeVisible();

    fixture.allowAbortedResponses();
    obsolete.release(200);
    await expect.poll(() => obsolete.settled).toBe(true);
    await page.waitForTimeout(150);
    await expect(drawer.getByRole("heading", { name: name("detail-02"), exact: true })).toBeVisible();
    await expect(drawer.getByText("Second file field", { exact: true })).toBeVisible();
    await expect(drawer.getByText("First file field", { exact: true })).toHaveCount(0);
    await expect(drawer.getByText(unavailable, { exact: true })).toHaveCount(0);
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await openDetail(page);
    await expect.poll(() => fixture.reads.length).toBe(3);
    await expect(drawer.getByText("Second file field", { exact: true })).toHaveCount(0);
    await expectNoEmpty(drawer);
    fixture.reads[2].release(200);
    await expect(drawer.getByText("First file field", { exact: true })).toBeVisible();
    expect(fixture.reads.map((entry) => entry.id)).toEqual(["detail-01", "detail-02", "detail-01"]);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});
