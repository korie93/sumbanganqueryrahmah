import { expect, test, type Page, type Request } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture } from "./helpers/save-collection-fixture";

// Actual compiled frontend with isolated synthetic files and controlled PATCH
// replies. No production session, customer data or external service is used.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

type Rename = {
  id: string;
  name: string;
  request: Request;
  released: boolean;
  settled: boolean;
  release: (status: number) => void;
};

const fileName = (id: string) => `Synthetic rename file ${id.slice(-2)}`;

async function installFixture(page: Page, baseURL: string | undefined) {
  const session = await installSessionFixture(page, baseURL, { role: "superuser" });
  const origin = new URL(baseURL!).origin;
  const files = new Map(["rename-01", "rename-02"].map((id, index) => [id, {
    id, name: fileName(id), filename: `${id}.csv`, createdAt: "2026-10-10T08:00:00.000Z",
    createdBy: "guidance.superuser", rowCount: 10 + index, sourceSizeBytes: 1024,
    isDeleted: false,
  }] as const));
  const renames: Rename[] = [];
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
    const params = new URL(route.request().url()).searchParams;
    const pageSize = Number(params.get("pageSize") ?? 20);
    return route.fulfill({ json: { imports: [...files.values()].slice(0, pageSize), pagination: {
      page: 1, pageSize, limit: pageSize, mode: "offset", offset: 0,
      total: files.size, totalPages: Math.max(1, Math.ceil(files.size / pageSize)),
      hasNextPage: files.size > pageSize, hasPreviousPage: false,
    } }, headers: { "Cache-Control": "no-store" } });
  });
  await page.context().route((url) => url.origin === origin && /^\/api\/imports\/rename-\d{2}\/rename$/.test(url.pathname), async (route) => {
    const request = route.request();
    if (request.method() !== "PATCH") return route.fallback();
    const id = new URL(request.url()).pathname.split("/").slice(-2)[0]!;
    const payload = request.postDataJSON() as { name: string };
    let reply: (status: number) => void = () => {};
    const gate = new Promise<number>((resolve) => { reply = resolve; });
    const entry: Rename = {
      id, name: payload.name, request, released: false, settled: false,
      release(status) {
        if (entry.released) return;
        entry.released = true;
        reply(status);
      },
    };
    renames.push(entry);
    try {
      const status = await gate;
      const item = files.get(id)!;
      if (status === 200 && !request.failure()) files.set(id, { ...item, name: entry.name });
      await route.fulfill({ status, json: status === 200
        ? { ...item, name: entry.name }
        : { ok: false, code: "INTERNAL_ERROR", message: "Synthetic rename unavailable. Please retry." },
      headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      // Only the explicit SPA-unmount case permits an already-aborted reply.
      if (!permitAbortedResponses || !request.failure()) throw error;
    } finally {
      entry.settled = true;
    }
  });

  return {
    session, files, renames,
    allowAbortedResponses() { permitAbortedResponses = true; },
    cleanup() {
      permitAbortedResponses = true;
      for (const entry of renames) entry.release(500);
    },
  };
}

function renameDialog(page: Page) {
  return page.getByRole("dialog", { name: "Rename Import", exact: true });
}

async function openSaved(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
  await expect(page.getByTestId("button-view-rename-01")).toBeVisible();
}

async function openRename(page: Page, id = "rename-01") {
  await page.getByTestId(`button-import-actions-${id}`).click();
  await page.getByTestId(`button-rename-${id}`).click();
  const dialog = renameDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "New name", exact: true })).toHaveValue(fileName(id));
  return dialog;
}

test("Saved rename recovery: failure preserves typed name and accessible inline error until explicit retry succeeds", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    const dialog = await openRename(page);
    const input = dialog.getByTestId("input-rename");
    const typed = "  Updated synthetic collection source  ";
    await input.fill(typed);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => fixture.renames.length).toBe(1);
    expect(fixture.renames[0].name).toBe(typed.trim());
    fixture.renames[0].release(500);

    const error = dialog.getByTestId("saved-rename-error");
    await expect(error).toBeVisible();
    await expect(error).not.toBeEmpty();
    await expect(error).toHaveAttribute("id", "saved-import-rename-error");
    await expect(input).toHaveAttribute("aria-describedby", /\bsaved-import-rename-error\b/);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveValue(typed);
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
    await expect(page.getByTestId("card-import-rename-01")).toContainText(fileName("rename-01"));
    await page.waitForTimeout(150);
    expect(fixture.renames, "Failed renames require an explicit retry").toHaveLength(1);

    const retrySave = dialog.getByRole("button", { name: "Save", exact: true });
    await input.focus();
    let reachedRetry = false;
    for (let tab = 0; tab < 4; tab += 1) {
      await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus"), "Tab focus must stay inside the rename dialog").toHaveCount(1);
      if (await retrySave.evaluate((button) => button === document.activeElement)) {
        reachedRetry = true;
        break;
      }
    }
    expect(reachedRetry, "The enabled retry Save must be reachable within four Tabs").toBe(true);
    await page.keyboard.press("Enter");
    await expect.poll(() => fixture.renames.length).toBe(2);
    expect(fixture.renames[1].name).toBe(typed.trim());
    fixture.renames[1].release(200);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("button-import-actions-rename-01")).toBeFocused();
    await expect(page.getByTestId("card-import-rename-01")).toContainText(typed.trim());
    await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
    expect(fixture.renames.map((entry) => entry.id)).toEqual(["rename-01", "rename-01"]);
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved rename recovery: editing clears the error and cancel discards the failed draft before reopening", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    const dialog = await openRename(page);
    const input = dialog.getByTestId("input-rename");
    await input.fill("Uncommitted synthetic name");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => fixture.renames.length).toBe(1);
    fixture.renames[0].release(500);
    await expect(dialog.getByTestId("saved-rename-error")).toBeVisible();
    await input.fill("Revised draft still not saved");
    await expect(dialog.getByTestId("saved-rename-error")).toHaveCount(0);
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await openRename(page);
    await expect(input).toHaveValue(fileName("rename-01"));
    await expect(dialog.getByTestId("saved-rename-error")).toHaveCount(0);
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await openRename(page, "rename-02");
    await expect(input).toHaveValue(fileName("rename-02"));
    await expect(dialog.getByTestId("saved-rename-error")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(fixture.renames).toHaveLength(1);
    await expect(page.getByTestId("card-import-rename-01")).toContainText(fileName("rename-01"));
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved rename recovery: a pending save blocks duplicate submits, Escape, outside click and close controls", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    const dialog = await openRename(page);
    const input = dialog.getByTestId("input-rename");
    await input.fill("Held synthetic rename");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => fixture.renames.length).toBe(1);
    const saving = dialog.getByRole("button", { name: "Saving...", exact: true });
    await expect(saving).toBeDisabled();
    await expect(input).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
    // Repeated activations must not create another request, including direct
    // event dispatch attempts while the save control is disabled.
    await saving.dispatchEvent("click");
    await saving.dispatchEvent("click");
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    await expect(input).toHaveValue("Held synthetic rename");
    await page.waitForTimeout(150);
    expect(fixture.renames).toHaveLength(1);
    fixture.renames[0].release(200);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("card-import-rename-01")).toContainText("Held synthetic rename");
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});

test("Saved rename recovery: route unmount aborts the request and its late response cannot reset a later dialog", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openSaved(page);
    const dialog = await openRename(page);
    await dialog.getByTestId("input-rename").fill("Obsolete pending rename");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => fixture.renames.length).toBe(1);
    const obsolete = fixture.renames[0];
    // Programmatically invoke real SPA controls to exercise a route unmount
    // while the modal is pending; physical modal dismissal is tested above.
    await page.getByTestId("nav-group-workspace").dispatchEvent("click");
    await page.getByTestId("flyout-nav-viewer").dispatchEvent("click");
    await expect(page).toHaveURL(/\/viewer$/);
    await expect(page.locator("#viewer-dataset-title")).toHaveText("Data Viewer");
    await expect.poll(() => Boolean(obsolete.request.failure())).toBe(true);
    await expect(dialog).toHaveCount(0);
    await page.getByTestId("nav-group-workspace").click();
    await page.getByTestId("flyout-nav-saved").click();
    await expect(page.getByTestId("button-view-rename-01")).toBeVisible();
    await openRename(page, "rename-02");
    const currentInput = dialog.getByTestId("input-rename");
    await currentInput.fill("Current dialog draft");

    fixture.allowAbortedResponses();
    obsolete.release(200);
    await expect.poll(() => obsolete.settled).toBe(true);
    await page.waitForTimeout(150);
    await expect(dialog).toBeVisible();
    await expect(currentInput).toHaveValue("Current dialog draft");
    await expect(dialog.getByTestId("saved-rename-error")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await expect(page.getByText("Success", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("card-import-rename-01")).toContainText(fileName("rename-01"));
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => fixture.renames.length).toBe(2);
    expect(fixture.renames[1].id).toBe("rename-02");
    fixture.renames[1].release(200);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("card-import-rename-02")).toContainText("Current dialog draft");
    await checkFixture(page, fixture.session);
  } finally { fixture.cleanup(); }
});
