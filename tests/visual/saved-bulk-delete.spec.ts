import { expect, test, type Page, type Request } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture } from "./helpers/save-collection-fixture";

// Real production frontend with isolated in-memory files and synthetic DELETE
// replies. No server, production identity, customer data or external service.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });

type Deletion = {
  id: string;
  attempt: number;
  request: Request;
  released: boolean;
  settled: boolean;
  release: (status: number) => void;
};

const fileName = (id: string) => `Synthetic saved file ${id.slice(-2)}`;

async function installFixture(page: Page, baseURL: string | undefined, count: number) {
  const session = await installSessionFixture(page, baseURL, { role: "superuser" });
  const origin = new URL(baseURL!).origin;
  const files = new Map(Array.from({ length: count }, (_, index) => {
    const id = `bulk-${String(index + 1).padStart(2, "0")}`;
    return [id, {
      id, name: fileName(id), filename: `${id}.csv`, createdAt: "2026-10-10T08:00:00.000Z",
      createdBy: "guidance.superuser", rowCount: 10 + index, sourceSizeBytes: 1024,
      isDeleted: false,
    }] as const;
  }));
  const deletions: Deletion[] = [];
  let active = 0;
  let maximumActive = 0;
  let automaticReply: ((id: string, attempt: number) => number) | null = null;
  let permitAbortedResponses = false;

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
    const imports = [...files.values()];
    return route.fulfill({ json: { imports, pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: imports.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } }, headers: { "Cache-Control": "no-store" } });
  });
  await page.context().route((url) => url.origin === origin && /^\/api\/imports\/bulk-\d{2}$/.test(url.pathname), async (route) => {
    const request = route.request();
    if (request.method() !== "DELETE") return route.fallback();
    const id = new URL(request.url()).pathname.split("/").pop()!;
    const attempt = deletions.filter((entry) => entry.id === id).length + 1;
    let reply: (status: number) => void = () => {};
    const gate = new Promise<number>((resolve) => { reply = resolve; });
    const entry: Deletion = {
      id, attempt, request, released: false, settled: false,
      release(status) {
        if (entry.released) return;
        entry.released = true;
        reply(status);
      },
    };
    deletions.push(entry);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    if (automaticReply) entry.release(automaticReply(id, attempt));
    try {
      const status = await gate;
      // This intercepted request is now sending its response; it no longer
      // occupies a held server slot while Chromium observes that response.
      active -= 1;
      if (status === 200 && !request.failure()) files.delete(id);
      await route.fulfill({ status, json: status === 200
        ? { ok: true, success: true }
        : { ok: false, code: status === 403 ? "FORBIDDEN" : "SYNTHETIC_DELETE_FAILED", message: "Synthetic deletion failed." },
      headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      // Only the explicit navigation-abort case may deliver a reply to an
      // already-cancelled intercepted request. Other route errors still fail.
      if (!permitAbortedResponses || !request.failure()) throw error;
    } finally {
      entry.settled = true;
    }
  });

  return {
    session, files, deletions,
    get active() { return active; },
    get maximumActive() { return maximumActive; },
    allowAbortedResponses() { permitAbortedResponses = true; },
    resume(reply: (id: string, attempt: number) => number) {
      automaticReply = reply;
      for (const entry of deletions) entry.release(reply(entry.id, entry.attempt));
    },
  };
}

async function openSaved(page: Page, count: number) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Saved Imports", exact: true })).toBeVisible();
  await expect(page.getByTestId("text-import-count")).toHaveText(`${count} files`);
  await expect(page.getByTestId("button-view-bulk-01")).toBeVisible();
}

async function selectAll(page: Page, count: number) {
  await page.getByRole("checkbox", { name: "Select all visible imports", exact: true }).check();
  await expect(page.getByTestId("button-bulk-delete")).toHaveText(`Delete Selected (${count})`);
}

async function confirmBulkDelete(page: Page, count: number) {
  await page.getByTestId("button-bulk-delete").click();
  const dialog = page.getByRole("alertdialog", { name: "Delete Selected Files?", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`${count} ${count === 1 ? "file" : "files"} selected`, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete Selected", exact: true }).click();
}

test("Saved bulk delete: eight selected files use at most three requests and refill one freed slot", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, 8);
  try {
    await openSaved(page, 8);
    await selectAll(page, 8);
    await confirmBulkDelete(page, 8);
    await expect.poll(() => fixture.deletions.length).toBe(3);
    await expect(page.getByTestId("button-bulk-delete")).toBeDisabled();
    expect(fixture.active).toBe(3);
    expect(fixture.maximumActive).toBe(3);
    // All first requests remain held: no fourth request may start meanwhile.
    await page.waitForTimeout(150);
    expect(fixture.deletions.length).toBe(3);
    fixture.deletions[1].release(200);
    await expect.poll(() => fixture.deletions.length).toBe(4);
    expect(fixture.maximumActive).toBe(3);
    expect(fixture.deletions.filter((entry) => !entry.released)).toHaveLength(3);
    fixture.resume(() => 200);
    await expect(page.getByText("No saved data yet", { exact: true })).toBeVisible();
    await expect(page.getByTestId("text-import-count")).toHaveText("0 files");
    await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
    expect(fixture.deletions).toHaveLength(8);
    expect(new Set(fixture.deletions.map((entry) => entry.id)).size).toBe(8);
    expect(fixture.maximumActive).toBe(3);
    await checkFixture(page, fixture.session);
  } finally { fixture.resume(() => 200); }
});

test("Saved bulk delete: out-of-order partial failures stay selected and only an explicit retry deletes them", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, 6);
  const failed = new Set(["bulk-02", "bulk-05"]);
  try {
    await openSaved(page, 6);
    await selectAll(page, 6);
    await confirmBulkDelete(page, 6);
    await expect.poll(() => fixture.deletions.length).toBe(3);
    fixture.deletions.find((entry) => entry.id === "bulk-02")!.release(403);
    fixture.deletions.find((entry) => entry.id === "bulk-01")!.release(200);
    fixture.resume((id) => failed.has(id) ? 500 : 200);
    const bulkButton = page.getByTestId("button-bulk-delete");
    await expect(bulkButton).toHaveText("Delete Selected (2)");
    await expect(bulkButton).toBeEnabled();
    await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
    for (const id of failed) await expect(page.getByRole("checkbox", { name: `Select ${fileName(id)}`, exact: true })).toBeChecked();
    for (const id of ["bulk-01", "bulk-03", "bulk-04", "bulk-06"]) await expect(page.getByTestId(`card-import-${id}`)).toHaveCount(0);
    expect(fixture.deletions).toHaveLength(6);
    await page.waitForTimeout(150);
    expect(fixture.deletions, "Failures must never be automatically retried").toHaveLength(6);
    fixture.resume(() => 200);
    await confirmBulkDelete(page, 2);
    await expect(page.getByText("No saved data yet", { exact: true })).toBeVisible();
    expect(fixture.deletions).toHaveLength(8);
    expect(new Set(fixture.deletions.slice(6).map((entry) => entry.id))).toEqual(failed);
    for (const id of failed) expect(fixture.deletions.filter((entry) => entry.id === id)).toHaveLength(2);
    expect(fixture.maximumActive).toBeLessThanOrEqual(3);
    await checkFixture(page, fixture.session);
  } finally { fixture.resume(() => 200); }
});

test("Saved bulk delete: every failed file stays selected on a narrow screen", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL, 4);
  try {
    fixture.resume(() => 403);
    await openSaved(page, 4);
    await selectAll(page, 4);
    await confirmBulkDelete(page, 4);
    await expect.poll(() => fixture.deletions.length).toBe(4);
    const bulkButton = page.getByTestId("button-bulk-delete");
    await expect(bulkButton).toBeEnabled();
    await expect(bulkButton).toHaveText("Delete Selected (4)");
    await expect(page.getByTestId("text-import-count")).toHaveText("4 files");
    for (const id of fixture.files.keys()) await expect(page.getByRole("checkbox", { name: `Select ${fileName(id)}`, exact: true })).toBeChecked();
    await page.waitForTimeout(150);
    expect(fixture.deletions).toHaveLength(4);
    expect(fixture.maximumActive).toBeLessThanOrEqual(3);
    await checkFixture(page, fixture.session);
  } finally { fixture.resume(() => 403); }
});

test("Saved bulk delete: leaving Saved aborts active requests and never dispatches queued deletions", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, 8);
  try {
    await openSaved(page, 8);
    await selectAll(page, 8);
    await confirmBulkDelete(page, 8);
    await expect.poll(() => fixture.deletions.length).toBe(3);
    // Use the actual SPA navigation. SQR may replace history entries, so
    // browser Back does not reliably represent leaving this protected route.
    await page.getByTestId("nav-group-workspace").click();
    await expect(page.getByTestId("desktop-flyout-workspace")).toBeVisible();
    await page.getByTestId("flyout-nav-viewer").click();
    await expect(page).toHaveURL(/\/viewer$/);
    await expect(page.locator("#viewer-dataset-title")).toHaveText("Data Viewer");
    await expect.poll(() => fixture.deletions.filter((entry) => entry.request.failure()).length).toBe(3);
    fixture.allowAbortedResponses();
    fixture.resume(() => 200);
    await expect.poll(() => fixture.deletions.every((entry) => entry.settled)).toBe(true);
    await page.waitForTimeout(150);
    expect(fixture.deletions, "Unmounted queue must not dispatch the other five files").toHaveLength(3);
    await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
    await expect(page.getByText("Success", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Partial Success", { exact: true })).toHaveCount(0);
    await checkFixture(page, fixture.session);
  } finally {
    fixture.allowAbortedResponses();
    fixture.resume(() => 200);
  }
});
