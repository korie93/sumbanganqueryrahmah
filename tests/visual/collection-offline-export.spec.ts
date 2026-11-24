import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { installFixture, nickname, openRecords } from "./helpers/collection-records-fixture";

test.use({ serviceWorkers: "block" });

const recordId = (index: number) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const customer = (number: number) => `Synthetic Customer ${number}`;
const checkbox = (page: Page, number: number) => page.getByRole("checkbox", {
  name: `Pilih rekod ${recordId(number - 1)} untuk ${customer(number)}`, exact: true,
});
const action = (root: Page | Locator, name: string) => root.getByRole("button", { name, exact: true });
const selectPage = (page: Page) => page.getByRole("checkbox", { name: "Pilih semua rekod di halaman ini", exact: true });
const snapshot = (number: number, cents = 125000, receipts = 0) => ({ id: recordId(number - 1), cents, receipts });
const selectionRequest = (...expected: ReturnType<typeof snapshot>[]) => ({ recordIds: expected.map(({ id }) => id), expected });

function exportError(route: Route, status: number, code: string, details: object) {
  const message = "Sila semak semula rekod dipilih.";
  return route.fulfill({ status, json: { ok: false, message, error: { code, message, details } } });
}

function fulfillTestZip(route: Route) {
  return route.fulfill({ contentType: "application/zip",
    headers: { "Content-Disposition": 'attachment; filename="Collection_Selected.zip"' },
    body: Buffer.from(zipSync({ "Export_Readme.txt": strToU8("Synthetic receipt verification") })) });
}

// Check the actual interactive target and its text bounds. A button can be inside the
// dialog while its nowrap label sticks out of the right edge at a narrow width.
async function assertDialogGeometry(dialog: Locator) {
  const violations = await dialog.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const outside = [...node.querySelectorAll("button, input")].filter((element) => {
      const b = element.getBoundingClientRect();
      // Rows are intentionally scrollable. Actions outside the list must fit vertically too.
      const clippedControl = !element.closest("ul") && (b.top < box.top - 1 || b.bottom > box.bottom + 1);
      return b.width > 0 && b.height > 0 &&
        (clippedControl || b.left < box.left - 1 || b.right > box.right + 1 || element.scrollWidth > element.clientWidth + 1);
    }).map((element) => element.getAttribute("aria-label") || element.textContent?.trim());
    return { outside, fits: box.left >= -1 && box.top >= -1 &&
      box.right <= window.innerWidth + 1 && box.bottom <= window.innerHeight + 1 };
  });
  expect(violations).toEqual({ outside: [], fits: true });
}

test("Collection offline export keeps the exact selection through pagination, search, filters, and sort", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const fixture = await installFixture(page, baseURL, { count: 65, role: "superuser", paginate: true, recordId });
  const requests: unknown[] = [];
  const archive = Buffer.from(zipSync({ "Export_Readme.txt": strToU8("Synthetic download for browser transport verification") }));
  await page.route(new URL("/api/collection/export-selected-offline", baseURL).href, async (route) => {
    expect(route.request().method()).toBe("POST");
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "application/zip", headers: {
      "Content-Disposition": 'attachment; filename="Collection_Selected.zip"', "Cache-Control": "no-store",
    }, body: archive });
  });
  await openRecords(page);
  await checkbox(page, 1).focus();
  await page.keyboard.press("Space");
  await expect(checkbox(page, 1)).toBeChecked();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(selectPage(page)).toBeChecked({ indeterminate: true });

  await action(page, "Next").click();
  await expect(checkbox(page, 51)).not.toBeChecked();
  await selectPage(page).check();
  await expect(checkbox(page, 65)).toBeChecked();
  await selectPage(page).uncheck();
  await expect(checkbox(page, 65)).not.toBeChecked();
  await checkbox(page, 51).check();

  const search = page.getByLabel("Search", { exact: true });
  await search.fill(customer(64));
  await checkbox(page, 64).check();
  await search.fill("");
  await expect(checkbox(page, 1)).toBeChecked();
  await page.getByTestId("collection-records-filter-toggle").click();
  await page.getByTestId("collection-records-from-date").click();
  await page.getByRole("grid", { name: "October 2026", exact: true })
    .getByRole("gridcell", { name: "3", exact: true }).click();
  await page.locator("#collection-records-nickname-filter").click();
  await page.getByRole("button", { name: nickname, exact: true }).click();
  await page.locator("#collection-records-sort-desktop").click();
  await page.getByRole("option", { name: "Jumlah: terendah", exact: true }).click();
  await expect.poll(() => {
    const query = new URLSearchParams(fixture.listRequests.at(-1));
    return query.get("sortBy") === "amount" && query.get("from") === "2026-10-03"
      && [...query.values()].includes(nickname);
  }).toBe(true);
  await page.locator("#collection-records-aging-desktop").click();
  await page.getByRole("option", { name: "D4", exact: true }).click();
  await expect(page.getByTestId("collection-records-empty-state")).toBeVisible();

  const reviewButton = action(page, "Lihat pilihan");
  await reviewButton.click();
  const review = page.getByRole("dialog", { name: "Rekod dipilih", exact: true });
  for (const number of [1, 51, 64]) await expect(review.getByText(customer(number), { exact: true })).toBeVisible();
  await review.getByRole("searchbox", { name: "Cari dalam pilihan" }).fill(customer(51));
  await expect(review.getByText(customer(64), { exact: true })).toHaveCount(0);
  await action(review, `Keluarkan ${customer(51)} daripada pilihan`).click();
  await page.keyboard.press("Escape");
  await expect(reviewButton).toBeFocused();
  const exportButton = action(page, "Export pilihan (ZIP)");
  await exportButton.click();
  const confirmButton = action(page, "Muat turun ZIP");
  const confirmation = page.getByRole("dialog").filter({ has: confirmButton });
  await expect(confirmation).toContainText(/2,500\.00/);
  await page.keyboard.press("Escape");
  await expect(exportButton).toBeFocused();
  expect(requests).toHaveLength(0);
  await exportButton.click();
  const downloaded = page.waitForEvent("download");
  await confirmButton.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.zip$/i);
  expect(await readFile((await file.path())!)).toEqual(archive);
  expect(requests).toEqual([selectionRequest(snapshot(1), snapshot(64))]);
  await action(page, "Kosongkan pilihan").click();
  await expect(exportButton).toBeDisabled();
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

const exportControlsModule = /\/CollectionOfflineExportControls(?:-[\w-]+\.js|\.tsx)(?:\?.*)?$/;

for (const width of [320, 1366]) {
  test(`Superuser chooses Excel columns and keeps them after a revised estimate at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 768 });
    await installFixture(page, baseURL, { role: "superuser", count: 1, recordId, theme: width === 320 ? "dark" : "light" });
    const posts: unknown[] = [];
    const revised = snapshot(1, 150000);
    await page.route(new URL("/api/collection/export-selected-offline", baseURL).href, async route => {
      posts.push(route.request().postDataJSON());
      if (posts.length === 1) return exportError(route, 409, "OFFLINE_EXPORT_SELECTION_CHANGED", { changes: [revised] });
      await fulfillTestZip(route);
    });
    await openRecords(page);
    await checkbox(page, 1).check();
    await action(page, "Export pilihan (ZIP)").click();
    const dialog = page.getByRole("dialog");
    const picker = dialog.getByRole("button", { name: /^Lajur Excel/ });
    await expect(dialog).toHaveAccessibleDescription("Eksport Excel tanpa resit.");
    await expect(dialog.getByText(/Ekstrak ZIP/)).toHaveCount(0);
    await expect(dialog.getByRole("checkbox", { includeHidden: true })).toHaveCount(0);
    await picker.focus();
    await page.keyboard.press("Enter");
    await expect(picker).toContainText("(47/47)");
    await expect(dialog.getByRole("checkbox", { name: "Nama Pelanggan" })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "Dikemas Kini (UTC)" })).toBeChecked();
    const confirm = action(dialog, "Muat turun ZIP");
    await expect(confirm).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("checkbox", { name: "Jumlah Bayaran", exact: true })).toBeInViewport({ ratio: 1 });
    await dialog.screenshot({ path: testInfo.outputPath("excel-column-picker.png") });
    await action(dialog, "Kosongkan lajur").click();
    const download = action(dialog, "Muat turun ZIP");
    await expect(download).toBeDisabled();
    await action(dialog, "Pilih semua lajur").click();
    await expect(download).toBeEnabled();
    await action(dialog, "Kosongkan lajur").click();
    const search = dialog.getByRole("searchbox", { name: "Cari lajur Excel" });
    await search.fill("Jumlah Bayaran");
    await dialog.getByRole("checkbox", { name: "Jumlah Bayaran", exact: true }).check();
    await search.fill("Nama Pelanggan");
    await dialog.getByRole("checkbox", { name: "Nama Pelanggan", exact: true }).check();
    await expect(picker).toContainText("(2/");
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await download.click();
    const changed = page.getByRole("dialog", { name: "Semak perubahan rekod" });
    const downloaded = page.waitForEvent("download");
    await action(changed, "Sahkan perubahan dan muat turun ZIP").click();
    await downloaded;
    const columns = ["customerName", "amount"];
    expect(posts).toEqual([{ ...selectionRequest(snapshot(1)), columns }, { ...selectionRequest(revised), columns }]);
  });
}

test("daily workbook preset exports six columns and bulk search edits only its matches", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, baseURL, { role: "superuser", count: 1, receipts: 2, recordId });
  const requests: unknown[] = [];
  await page.route(new URL("/api/collection/export-selected-offline", baseURL).href, async route => {
    requests.push(route.request().postDataJSON());
    await fulfillTestZip(route);
  });
  await openRecords(page);
  await checkbox(page, 1).check();
  const openExport = action(page, "Export pilihan (ZIP)");
  const dialog = page.getByRole("dialog");
  const picker = dialog.getByRole("button", { name: /^Lajur Excel/ });
  const daily = ["customerName", "cardNumber", "accountNumber", "amount", "paymentDate", "receipt"];
  const expected = selectionRequest(snapshot(1, 125000, 2));
  const download = () => Promise.all([page.waitForEvent("download"), action(dialog, "Muat turun ZIP").click()]);
  await openExport.click();
  await expect(dialog).toHaveAccessibleDescription("ZIP mengandungi fail Excel dan 2 resit asal.");
  await expect(dialog.getByText(/Ekstrak ZIP/)).toBeVisible();
  const preset = action(dialog, "Kutipan harian");
  await preset.focus();
  await page.keyboard.press("Enter");
  await expect(picker).toHaveText(/6\/47/);
  await download();
  expect(requests).toEqual([{ ...expected, columns: daily }]);

  await openExport.click();
  await picker.click();
  const search = dialog.getByRole("searchbox", { name: "Cari lajur Excel" });
  await search.fill("  ReSiT ");
  const addResults = action(dialog, "Pilih hasil carian");
  const removeResults = action(dialog, "Nyahpilih hasil carian");
  await expect(preset).toHaveCount(0);
  await addResults.click();
  await expect(addResults).toBeDisabled();
  await expect(dialog.getByRole("checkbox", { checked: false })).toHaveCount(0);
  await removeResults.click();
  await expect(removeResults).toBeDisabled();
  await expect(picker).toHaveText(/5\/47/);
  await expect(dialog.getByText(/folder Receipts/)).toBeVisible();
  await search.fill("nonexistent synthetic column");
  await expect(dialog.getByText("Tiada lajur sepadan.")).toBeVisible();
  await expect(addResults).toBeDisabled();
  await expect(removeResults).toBeDisabled();
  await search.fill(" ");
  await expect(action(dialog, "Kosongkan lajur")).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Status CP", exact: true }).check();
  await download();
  expect(requests[1]).toEqual({ ...expected, columns: [...daily.slice(0, -1), "cpStatus"] });
});

test("Collection records remain selectable while the export controls are loading", async ({ page, baseURL }) => {
  await installFixture(page, baseURL, { role: "superuser", count: 2, recordId });
  let releaseControls!: () => void;
  const pending = new Promise<void>((resolve) => { releaseControls = resolve; });
  await page.route(exportControlsModule, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await Promise.all([
      page.waitForRequest(exportControlsModule),
      page.goto("/collection/records", { waitUntil: "domcontentloaded" }),
    ]);
    await checkbox(page, 1).check();
    await expect(action(page, "Export pilihan (ZIP)")).toHaveCount(0);
  } finally {
    releaseControls();
  }
  await expect(page.getByText("1 rekod dipilih", { exact: true })).toBeVisible();
  await expect(action(page, "Export pilihan (ZIP)")).toBeEnabled();
});

for (const role of ["user", "admin", "manager"] as const) {
  test(`Collection offline export controls are absent for ${role}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const fixture = await installFixture(page, baseURL, { role, count: 2, recordId });
    const controlsRequests: string[] = [];
    page.on("request", (request) => {
      if (exportControlsModule.test(request.url())) controlsRequests.push(request.url());
    });
    await openRecords(page);
    await expect(action(page, customer(1))).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^Pilih (semua )?rekod/ })).toHaveCount(0);
    for (const label of ["Lihat pilihan", "Kosongkan pilihan", "Export pilihan (ZIP)"]) {
      await expect(action(page, label)).toHaveCount(0);
    }
    await action(page, customer(1)).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(controlsRequests).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

for (const width of [320, 390, 1366]) for (const theme of ["light", "dark"] as const) {
  test(`Collection offline export controls and dialogs fit ${width}px ${theme}`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 844 });
    const fixture = await installFixture(page, baseURL, { role: "superuser", count: 65, paginate: true, receipts: 2, theme, recordId });
    await openRecords(page);
    await expect(checkbox(page, 1)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath("list.jpg"), quality: 79 });
    await checkbox(page, 1).check();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await checkbox(page, 2).check();
    const reviewButton = action(page, "Lihat pilihan");
    await reviewButton.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("selection.jpg"), quality: 79 });
    await reviewButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(customer(2), { exact: true })).toBeVisible();
    await assertDialogGeometry(dialog);
    await page.screenshot({ path: testInfo.outputPath("review.jpg"), quality: 79 });
    await page.keyboard.press("Escape");
    await expect(reviewButton).toBeFocused();
    await action(page, "Export pilihan (ZIP)").click();
    await expect(action(dialog, "Muat turun ZIP")).toBeVisible();
    await assertDialogGeometry(dialog);
    await page.screenshot({ path: testInfo.outputPath("confirm.jpg"), quality: 79 });
    expect(fixture.errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
}
test("Collection offline export recovers stale selections, preserves choices on cancellation, and clears them after refresh", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const fixture = await installFixture(page, baseURL, { count: 3, role: "superuser", recordId });
  const posts: unknown[] = [];
  const downloads: string[] = [];
  page.on("download", (file) => downloads.push(file.suggestedFilename()));
  let releasePending!: () => void;
  const pending = new Promise<void>((resolve) => { releasePending = resolve; });
  await page.route(new URL("/api/collection/export-selected-offline", baseURL).href, async (route) => {
    posts.push(route.request().postDataJSON());
    if (posts.length === 1) {
      await route.fulfill({ status: 409, json: {
        ok: false, message: "Sebahagian pilihan sudah tidak tersedia.",
        error: { code: "OFFLINE_EXPORT_RECORDS_UNAVAILABLE", message: "Sebahagian pilihan sudah tidak tersedia.",
          details: { unavailableIds: [recordId(1)] } },
      } });
      return;
    }
    await pending;
    await route.abort("aborted");
  });
  await openRecords(page);
  const exportButton = action(page, "Export pilihan (ZIP)");
  await expect(exportButton).toBeDisabled();
  for (const n of [1, 2]) await checkbox(page, n).check();
  await exportButton.click();
  await action(page, "Muat turun ZIP").click();
  const review = page.getByRole("dialog", { name: "Rekod dipilih" });
  await expect(review.getByRole("status")).toContainText("1 rekod yang tidak lagi tersedia");
  await expect(review.getByText(customer(2), { exact: true })).toHaveCount(0);
  await expect(review.getByText(customer(1), { exact: true })).toBeVisible();
  await expect(review.getByRole("searchbox", { name: "Cari dalam pilihan" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(checkbox(page, 2)).not.toBeChecked();

  await exportButton.click();
  await action(page, "Muat turun ZIP").click();
  await expect(action(page, "Menyediakan ZIP…")).toBeDisabled();
  await expect.poll(() => posts.length).toBe(2);
  await action(page, "Batal").click();
  releasePending();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Eksport dibatalkan. Pilihan anda dikekalkan.")).toBeVisible();
  await expect(checkbox(page, 1)).toBeChecked();
  await page.reload();
  await expect(checkbox(page, 1)).not.toBeChecked();
  await expect(exportButton).toBeDisabled();
  expect(posts).toEqual([selectionRequest(snapshot(1), snapshot(2)), selectionRequest(snapshot(1))]);
  expect(downloads).toEqual([]);
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test("Collection offline Undo restores original order and totals across pages", async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const fixture = await installFixture(page, baseURL, { role: "superuser", count: 60, paginate: true, receipts: 2, recordId });
  const requests: unknown[] = [];
  await page.route(new URL("/api/collection/export-selected-offline", baseURL).href, (route) => {
    requests.push(route.request().postDataJSON());
    return fulfillTestZip(route);
  });
  await openRecords(page);
  await checkbox(page, 2).check();
  await checkbox(page, 1).check();
  await action(page, "Next").click();
  await checkbox(page, 51).check();
  await action(page, "Kosongkan pilihan").press("Enter");
  await expect(checkbox(page, 51)).not.toBeChecked();
  await expect(action(page, "Export pilihan (ZIP)")).toBeDisabled();
  const undo = action(page, "Pulihkan pilihan");
  await expect(undo).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("undo.jpg"), quality: 79 });
  await undo.press("Enter");
  await expect(checkbox(page, 51)).toBeChecked();
  await expect(undo).toHaveCount(0);
  const reviewButton = action(page, "Lihat pilihan");
  await reviewButton.click();
  const review = page.getByRole("dialog", { name: "Rekod dipilih" });
  await expect(review.getByRole("listitem")).toHaveCount(3);
  for (const [position, number] of [2, 1, 51].entries()) {
    await expect(review.getByRole("listitem").nth(position)).toContainText(customer(number));
  }
  await expect(review).toContainText("3,750.00");
  await page.keyboard.press("Escape");
  await expect(reviewButton).toBeFocused();
  await action(page, "Export pilihan (ZIP)").click();
  const download = page.waitForEvent("download");
  await action(page, "Muat turun ZIP").press("Enter");
  await download;
  expect(requests).toEqual([selectionRequest(snapshot(2, 125000, 2), snapshot(1, 125000, 2), snapshot(51, 125000, 2))]);
  await action(page, "Kosongkan pilihan").click();
  await checkbox(page, 52).check();
  await expect(undo).toHaveCount(0);
  await expect(checkbox(page, 51)).not.toBeChecked();
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const [width, theme] of [[320, "dark"], [1366, "light"]] as const) {
  test(`Collection offline invalid receipt identifies a row across pages and opens the right record at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 768 });
    const fixture = await installFixture(page, baseURL, { role: "superuser", count: 60, paginate: true, receipts: 2, recordId, theme });
    const requests: unknown[] = [];
    const badNumber = 49;
    const badId = recordId(badNumber - 1);
    const knownOrdinal = width === 1366;
    await page.route(new URL("/api/collection/export-selected-offline", baseURL).href, (route) => {
      requests.push(route.request().postDataJSON());
      return requests.length === 1 ? exportError(route, 409, "INVALID_RECEIPT", {
        recordId: badId, receiptCount: 2, receiptNumber: knownOrdinal ? 2 : null,
      }) : fulfillTestZip(route);
    });
    await openRecords(page);
    await selectPage(page).check();
    await action(page, "Next").click();
    await checkbox(page, 51).check();
    await expect(checkbox(page, badNumber)).toHaveCount(0);
    await action(page, "Export pilihan (ZIP)").click();
    await action(page, "Muat turun ZIP").click();
    const review = page.getByRole("dialog", { name: "Rekod dipilih" });
    const row = review.getByRole("listitem").filter({ has: page.getByText(customer(badNumber), { exact: true }) });
    await expect(row).toContainText(knownOrdinal ? "Resit 2 daripada 2" : "Semak resit rekod ini");
    const detailButton = action(row, "Buka butiran rekod");
    await expect(detailButton).toBeVisible();
    await assertDialogGeometry(review);
    await page.screenshot({ path: testInfo.outputPath("receipt-issue.jpg"), quality: 79 });
    await detailButton.press("Enter");
    const details = page.getByRole("dialog", { name: customer(badNumber), exact: true });
    await expect(details.getByText(`SYNTHETIC-ACCOUNT-${badNumber}`, { exact: true })).toBeVisible();
    expect(fixture.offlineDetailViews).toEqual([badId]);
    const receipts = action(details, "Lihat 2 resit");
    await receipts.press("Enter");
    const preview = page.getByRole("dialog", { name: "Receipt Preview", exact: true });
    await expect(preview).toBeVisible();
    await expect.poll(() => fixture.receiptViews.includes(badId)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
    await expect(receipts).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(review).toBeVisible();
    await expect(detailButton).toBeFocused();
    await action(row, `Keluarkan ${customer(badNumber)} daripada pilihan`).press("Enter");
    await expect(row).toHaveCount(0);
    await expect(review).toContainText("50 rekod dipilih");
    await page.keyboard.press("Escape");
    await action(page, "Export pilihan (ZIP)").click();
    const download = page.waitForEvent("download");
    await action(page, "Muat turun ZIP").click();
    await download;
    const selected = Array.from({ length: 51 }, (_, index) => snapshot(index + 1, 125000, 2));
    expect(requests).toEqual([selectionRequest(...selected), selectionRequest(...selected.filter((item) => item.id !== badId))]);
    expect(fixture.errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });

  test(`Collection offline repeated drift requires explicit confirmation each time at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 768 });
    const fixture = await installFixture(page, baseURL, { role: "superuser", count: 2, receipts: 2, theme, recordId });
    const original = snapshot(2, 125000, 2);
    const first = snapshot(2, 135040, 3);
    const second = snapshot(2, 117010, 1);
    const unchanged = snapshot(1, 125000, 2);
    const requests: unknown[] = [];
    const downloads: string[] = [];
    page.on("download", (file) => downloads.push(file.suggestedFilename()));
    await page.route(new URL("/api/collection/export-selected-offline", baseURL).href, (route) => {
      requests.push(route.request().postDataJSON());
      return requests.length <= 2
        ? exportError(route, 409, "OFFLINE_EXPORT_SELECTION_CHANGED", { changes: [requests.length === 1 ? first : second] })
        : fulfillTestZip(route);
    });
    await openRecords(page);
    await checkbox(page, 2).check();
    await checkbox(page, 1).check();
    await action(page, "Export pilihan (ZIP)").click();
    await action(page, "Muat turun ZIP").click();
    const dialog = page.getByRole("dialog", { name: "Semak perubahan rekod" });
    const heading = dialog.getByRole("heading", { name: "Semak perubahan rekod" });
    const confirm = action(dialog, "Sahkan perubahan dan muat turun ZIP");
    await expect(heading).toBeFocused();
    await expect(dialog).toContainText(customer(2));
    for (const value of ["Sebelum", "Terkini", "1,250.00", "1,350.40", "2 resit", "3 resit"]) {
      await expect(dialog).toContainText(value);
    }
    await assertDialogGeometry(dialog);
    await page.screenshot({ path: testInfo.outputPath("compare.jpg"), quality: 79 });
    expect(requests).toEqual([selectionRequest(original, unchanged)]);
    expect(downloads).toEqual([]);
    await confirm.press("Enter");
    for (const value of ["1,350.40", "1,170.10", "3 resit", "1 resit"]) await expect(dialog).toContainText(value);
    await expect(heading).toBeFocused();
    expect(requests).toEqual([selectionRequest(original, unchanged), selectionRequest(first, unchanged)]);
    expect(downloads).toEqual([]);
    const download = page.waitForEvent("download");
    await confirm.press("Enter");
    expect((await download).suggestedFilename()).toMatch(/\.zip$/i);
    expect(requests).toEqual([selectionRequest(original, unchanged), selectionRequest(first, unchanged), selectionRequest(second, unchanged)]);
    await expect(dialog).toHaveCount(0);
    expect(fixture.errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
}

test("Collection offline cancelling changed values keeps the original selection until explicitly accepted", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role: "superuser", count: 1, receipts: 1, recordId });
  const original = snapshot(1, 125000, 1);
  const latest = snapshot(1, 150000, 1);
  const requests: unknown[] = [];
  const downloads: string[] = [];
  page.on("download", file => downloads.push(file.suggestedFilename()));
  await page.route(new URL("/api/collection/export-selected-offline", baseURL).href, route => {
    requests.push(route.request().postDataJSON());
    return exportError(route, 409, "OFFLINE_EXPORT_SELECTION_CHANGED", { changes: [latest] });
  });
  await openRecords(page);
  await checkbox(page, 1).check();
  const trigger = action(page, "Export pilihan (ZIP)");
  const changes = page.getByRole("dialog", { name: "Semak perubahan rekod" });
  for (let attempt = 0; attempt < 2; attempt++) {
    await trigger.click();
    await action(page, "Muat turun ZIP").click();
    await expect(changes).toContainText("1,500.00");
    await action(changes, "Batal").click();
    await expect(trigger).toBeFocused();
    await expect(checkbox(page, 1)).toBeChecked();
  }
  expect(requests).toEqual([selectionRequest(original), selectionRequest(original)]);
  expect(downloads).toEqual([]);
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
