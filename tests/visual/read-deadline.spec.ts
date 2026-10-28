import { expect, test, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Actual compiled routes with strict fictional HTTP fixtures. A narrowly armed
// fetch gate models missing headers or a real Response whose ReadableStream body
// stays unfinished; ordinary requests still use the existing routed transport.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

const timeoutMessage = "Permintaan mengambil masa terlalu lama. Sila cuba semula.";
type Target = "list" | "summary" | "viewer";
type Hold = { target: Target; mode: "headers" | "body"; ignoreAbort?: boolean };
type Read = {
  target: Target; url: string; mode: "headers" | "body"; startedAt: number;
  headersDelivered: boolean; bodyUsed: boolean; aborted: boolean; released: boolean;
};
type BrowserControl = {
  hold: (plan: Hold) => void;
  reads: () => Read[];
  calls: () => Array<{ target: Target; url: string }>;
  release: (index: number, payload: unknown) => void;
  dispose: () => void;
};
declare global { interface Window { __sqrReadDeadlineFixture: BrowserControl } }

const files = [1, 2].map((number) => ({
  id: `deadline-0${number}`, name: `Synthetic deadline file ${number}`, filename: `deadline-${number}.csv`,
  createdAt: now, createdBy: "guidance.superuser", rowCount: 2, sourceSizeBytes: 1024, isDeleted: false,
}));
function listResponse(params: URLSearchParams) {
  const search = params.get("search")?.toLowerCase() ?? "";
  const matches = files.filter((file) => !search || file.name.toLowerCase().includes(search));
  const pageSize = Number(params.get("pageSize") ?? 20);
  return { imports: matches, pagination: { page: 1, pageSize, limit: pageSize, mode: "offset", offset: 0,
    total: matches.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false } };
}
function summaryResponse(id: string) {
  return { import: files.find((file) => file.id === id)!, columns: [`Synthetic field ${id}`], columnCount: 1 };
}
function viewerResponse(id: string, params = new URLSearchParams()) {
  const pageSize = Number(params.get("pageSize") ?? 100);
  return { headers: ["Customer Name", "Reference"],
    rows: [1, 2].map((number) => ({ id: `${id}-row-${number}`, importId: id,
      jsonDataJsonb: { "Customer Name": `Synthetic deadline customer ${number}`, Reference: `DEADLINE-${number}` } })),
    total: 2, page: 1, pageSize, limit: pageSize, offset: 0, nextCursor: null,
    pagination: { mode: "hybrid", page: 1, pageSize, limit: pageSize, offset: 0, nextCursor: null,
      total: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false } };
}

async function installFixture(page: Page, baseURL: string | undefined, initialHold?: Hold) {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", controlledClock: true });
  const origin = new URL(baseURL!).origin;
  await page.addInitScript(({ initial }) => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    const originalFetch = window.fetch.bind(window);
    let next: Hold | undefined = initial;
    const calls: Array<{ target: Target; url: string }> = [];
    const reads: Array<{ read: Omit<Read, "bodyUsed">; response?: Response; release: (body: unknown) => void; abort: () => void }> = [];
    const classify = (url: URL): Target | null => {
      if (url.origin !== location.origin) return null;
      if (url.pathname === "/api/imports" && url.searchParams.get("pageSize") !== "1") return "list";
      if (/^\/api\/imports\/deadline-0[12]\/summary$/.test(url.pathname)) return "summary";
      if (/^\/api\/imports\/deadline-0[12]\/data$/.test(url.pathname)) return "viewer";
      return null;
    };
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : undefined;
      const url = new URL(request?.url ?? String(input), location.href);
      const target = (init?.method ?? request?.method ?? "GET").toUpperCase() === "GET" ? classify(url) : null;
      if (!target) return originalFetch(input, init);
      calls.push({ target, url: url.href });
      if (!next || next.target !== target) return originalFetch(input, init);
      const plan = next;
      next = undefined;
      const signal = init?.signal ?? request?.signal;
      const read: Omit<Read, "bodyUsed"> = { target, url: url.href, mode: plan.mode, startedAt: Date.now(),
        headersDelivered: false, aborted: false, released: false };
      let rejectHeaders: (error: unknown) => void = () => {};
      let resolveHeaders: (response: Response) => void = () => {};
      let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
      let settled = false;
      const cleanup = () => signal?.removeEventListener("abort", onAbort);
      const abort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        const error = new DOMException("Synthetic request aborted", "AbortError");
        if (plan.mode === "body") stream?.error(error);
        else rejectHeaders(error);
      };
      const onAbort = () => { read.aborted = true; if (!plan.ignoreAbort) abort(); };
      const entry: typeof reads[number] = { read, abort, release(body) {
        if (settled) return;
        settled = true;
        read.released = true;
        cleanup();
        if (plan.mode === "body") {
          stream!.enqueue(new TextEncoder().encode(JSON.stringify(body)));
          stream!.close();
        } else {
          read.headersDelivered = true;
          entry.response = new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
          resolveHeaders(entry.response);
        }
      } };
      let result: Promise<Response>;
      if (plan.mode === "body") {
        const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
        entry.response = new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
        read.headersDelivered = true;
        result = Promise.resolve(entry.response);
      } else {
        result = new Promise<Response>((resolve, reject) => { resolveHeaders = resolve; rejectHeaders = reject; });
      }
      reads.push(entry);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
      return result;
    };
    window.__sqrReadDeadlineFixture = {
      hold(plan) { next = plan; }, calls: () => calls.map((call) => ({ ...call })),
      reads: () => reads.map(({ read, response }) => ({ ...read, bodyUsed: response?.bodyUsed ?? false })),
      release(index, payload) { reads[index].release(payload); },
      dispose() { next = undefined; for (const entry of reads) entry.abort(); },
    };
  }, { initial: initialHold });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, viewer: true } } }));
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: listResponse(new URL(route.request().url()).searchParams) }));
  await page.context().route((url) => url.origin === origin && /^\/api\/imports\/deadline-0[12]\/(?:summary|data)$/.test(url.pathname), (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const id = url.pathname.split("/")[3];
    return route.fulfill({ json: url.pathname.endsWith("/summary") ? summaryResponse(id) : viewerResponse(id, url.searchParams) });
  });
  return { session, async cleanup() { await page.evaluate(() => window.__sqrReadDeadlineFixture.dispose()); } };
}

async function reads(page: Page) { return page.evaluate(() => window.__sqrReadDeadlineFixture.reads()); }
async function calls(page: Page, target: Target) {
  return page.evaluate((key) => window.__sqrReadDeadlineFixture.calls().filter((call) => call.target === key), target);
}
async function hold(page: Page, target: Target, mode: Hold["mode"], ignoreAbort = false) {
  await page.evaluate((plan) => window.__sqrReadDeadlineFixture.hold(plan), { target, mode, ignoreAbort });
}
async function release(page: Page, index: number, body: unknown) {
  await page.evaluate(({ at, payload }) => window.__sqrReadDeadlineFixture.release(at, payload), { at: index, payload: body });
}
async function openSavedAndPause(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
  await expect(page.getByTestId("button-view-deadline-01")).toBeVisible();
  await page.clock.pauseAt(new Date(now));
}

test("Saved read deadline: stalled initial headers stop and Refresh recovers", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { target: "list", mode: "headers" });
  try {
    await page.goto("/saved", { waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await reads(page)).length).toBe(1);
    await expect(page.getByTestId("text-import-count")).toHaveCount(0);
    expect((await reads(page))[0].headersDelivered).toBe(false);
    await page.clock.pauseAt(new Date(now));
    await page.clock.runFor(60_001);
    await expect(page.getByRole("alert")).toHaveText(timeoutMessage);
    await expect(page.getByTestId("button-refresh")).toBeEnabled();
    expect((await reads(page))[0].aborted).toBe(true);
    expect(await calls(page, "list")).toHaveLength(1);
    await page.getByTestId("button-refresh").click();
    await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await calls(page, "list")).toHaveLength(2);
    await checkFixture(page, fixture.session);
  } finally { await fixture.cleanup(); }
});

test("Saved read deadline: 59999ms keeps refresh pending and 60000ms retains last good rows until explicit retry", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSavedAndPause(page);
    await page.getByRole("checkbox", { name: "Select all visible imports", exact: true }).check();
    const before = (await calls(page, "list")).length;
    await hold(page, "list", "headers");
    await page.getByTestId("button-refresh").click();
    await expect.poll(async () => (await reads(page)).length).toBe(1);
    await page.clock.runFor(59_999);
    await expect(page.getByTestId("button-refresh")).toBeDisabled();
    await expect(page.getByText(timeoutMessage, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
    await page.clock.runFor(1);
    await expect(page.getByTestId("saved-refresh-notice")).toContainText(timeoutMessage);
    await expect(page.getByTestId("button-retry-saved")).toBeEnabled();
    await expect(page.getByTestId("button-view-deadline-01")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Select all visible imports", exact: true })).toBeChecked();
    await expect(page.getByTestId("button-bulk-delete")).toBeDisabled();
    expect((await reads(page))[0].aborted).toBe(true);
    await page.clock.runFor(5_000);
    expect(await calls(page, "list")).toHaveLength(before + 1);
    await page.getByTestId("button-retry-saved").click();
    await expect(page.getByTestId("saved-refresh-notice")).toHaveCount(0);
    await expect(page.getByTestId("button-refresh")).toBeEnabled();
    expect(await calls(page, "list")).toHaveLength(before + 2);
    await checkFixture(page, fixture.session);
  } finally { await fixture.cleanup(); }
});

test("Saved detail deadline: delivered headers with an unfinished body time out and retry recovers at 320px", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL);
  try {
    await openSavedAndPause(page);
    await hold(page, "summary", "body");
    await page.getByTestId("button-select-import-deadline-01").click();
    const drawer = page.getByTestId("saved-import-detail-drawer");
    await expect(drawer).toBeVisible();
    await expect.poll(async () => (await reads(page))[0]?.bodyUsed).toBe(true);
    expect((await reads(page))[0].headersDelivered).toBe(true);
    await page.clock.runFor(59_999);
    await expect(drawer.getByText(timeoutMessage, { exact: true })).toHaveCount(0);
    await expect(drawer.getByRole("status")).toBeVisible();
    await page.clock.runFor(1);
    await expect(drawer.getByRole("alert")).toHaveText(timeoutMessage);
    const retry = drawer.getByTestId("button-retry-saved-detail");
    await expect(retry).toBeEnabled();
    await expect(drawer.getByText("No columns were detected.", { exact: true })).toHaveCount(0);
    expect((await reads(page))[0].aborted).toBe(true);
    expect(await calls(page, "summary")).toHaveLength(1);
    await retry.press("Enter");
    await expect(drawer.getByText("Synthetic field deadline-01", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("alert")).toHaveCount(0);
    expect(await calls(page, "summary")).toHaveLength(2);
    expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await checkFixture(page, fixture.session);
  } finally { await fixture.cleanup(); }
});

test("Viewer read deadline: unfinished body times out and retry restores the same query without exportable stale rows", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSavedAndPause(page);
    await hold(page, "viewer", "body");
    await page.getByTestId("button-view-deadline-01").click();
    await expect(page.getByTestId("input-search-viewer")).toBeVisible();
    await expect.poll(async () => (await reads(page))[0]?.bodyUsed).toBe(true);
    expect((await reads(page))[0].headersDelivered).toBe(true);
    const failed = (await calls(page, "viewer"))[0].url;
    await page.clock.runFor(59_999);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.clock.runFor(1);
    await expect(page.getByRole("alert")).toHaveText(timeoutMessage);
    await expect(page.getByTestId("button-retry-viewer")).toBeEnabled();
    await expect(page.locator('[data-testid^="button-export-"]')).toHaveCount(0);
    expect((await reads(page))[0].aborted).toBe(true);
    await page.clock.runFor(5_000);
    expect(await calls(page, "viewer")).toHaveLength(1);
    await page.getByTestId("button-retry-viewer").click();
    await expect(page.getByRole("cell", { name: "Synthetic deadline customer 1", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect((await calls(page, "viewer")).map((call) => call.url)).toEqual([failed, failed]);
    await checkFixture(page, fixture.session);
  } finally { await fixture.cleanup(); }
});

test("Read deadline cancellation: closing or changing route aborts quietly and late noncooperative replies cannot replace current data", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSavedAndPause(page);
    await hold(page, "summary", "body", true);
    await page.getByTestId("button-select-import-deadline-01").click();
    await expect.poll(async () => (await reads(page))[0]?.bodyUsed).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("saved-import-detail-drawer")).toHaveCount(0);
    expect((await reads(page))[0].aborted).toBe(true);
    await page.clock.runFor(60_001);
    await page.getByTestId("button-select-import-deadline-02").click();
    const drawer = page.getByTestId("saved-import-detail-drawer");
    await expect(drawer.getByText("Synthetic field deadline-02", { exact: true })).toBeVisible();
    await release(page, 0, summaryResponse("deadline-01"));
    await page.clock.runFor(1);
    await expect(drawer.getByText("Synthetic field deadline-02", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Synthetic field deadline-01", { exact: true })).toHaveCount(0);
    await expect(page.getByText(timeoutMessage, { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await hold(page, "viewer", "headers", true);
    await page.getByTestId("button-view-deadline-01").click();
    await expect(page.getByTestId("input-search-viewer")).toBeVisible();
    await expect.poll(async () => (await reads(page)).length).toBe(2);
    await page.getByTestId("button-back").click();
    await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
    expect((await reads(page))[1].aborted).toBe(true);
    await page.clock.runFor(60_001);
    await release(page, 1, viewerResponse("deadline-01"));
    await page.clock.runFor(1);
    await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
    await expect(page.getByTestId("input-search-viewer")).toHaveCount(0);
    await expect(page.getByText(timeoutMessage, { exact: true })).toHaveCount(0);
    await checkFixture(page, fixture.session);
  } finally { await fixture.cleanup(); }
});
