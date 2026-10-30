import { expect, test, type Download, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Actual Viewer UI and exporter, fictional records and owner-scoped loopback
// API state only. No production calls, screenshot, trace or video artifacts.
test.use({ serviceWorkers: "block", acceptDownloads: true, screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0, timeout: 60_000 });

const firstImport = "viewer-presets-first-synthetic";
const secondImport = "viewer-presets-second-synthetic";
const importNames = new Map([[firstImport, "Synthetic first preset dataset"], [secondImport, "Synthetic second preset dataset"]]);
const headers = ["Customer Name", "Payment Date", "Amount", "Reference"];
type Filter = { column: string; operator: string; value: string; valueTo?: string };
type NumericSort = { column: string; direction: "asc" | "desc" };
type Preset = { id: string; name: string; columnFilters: Filter[]; numericSort: NumericSort | null };
type Read = { importId: string; page: number; pageSize: number; cursor: string | null; search: string; filters: Filter[]; numericSort: NumericSort | null };
const dateAt = (day: number) => new Date(Date.UTC(2024, 0, day + 1)).toISOString().slice(0, 10);
const rowsFor = (importId: string) => Array.from({ length: 145 }, (_, index) => {
  const amount = index * 47 % 145;
  return { id: `preset-row-${String(index + 1).padStart(4, "0")}`, importId, jsonDataJsonb: {
    "Customer Name": `Synthetic customer ${String(amount).padStart(3, "0")}`,
    "Payment Date": dateAt(amount), Amount: String(amount), Reference: `PRESET-${amount}`,
  } };
});
const combinedPreset: Preset = {
  id: "10000000-0000-4000-8000-000000000001", name: "Quarterly review",
  columnFilters: [
    { column: "Payment Date", operator: "dateBetween", value: "2024-01-10", valueTo: "2024-05-10" },
    { column: "Amount", operator: "between", value: "10", valueTo: "130" },
  ], numericSort: { column: "Amount", direction: "desc" },
};
const stalePreset: Preset = { id: "10000000-0000-4000-8000-000000000002", name: "Older source columns",
  columnFilters: [{ column: "Removed Amount", operator: "greaterThan", value: "10" }], numericSort: null };
const pagination = (page: Page) => page.getByRole("navigation", { name: "Dataset pagination", exact: true });
const picker = (page: Page) => page.getByTestId("viewer-preset-select");
const save = (page: Page) => page.getByTestId("button-save-viewer-preset");
const apply = (page: Page) => page.getByTestId("button-apply-viewer-preset");
const presetName = (page: Page) => page.getByTestId("input-viewer-preset-name");
const confirm = (page: Page) => page.getByTestId("button-confirm-viewer-preset");
const cursor = (read: Read, offset: number) => `preset:${encodeURIComponent(JSON.stringify([read.importId, read.pageSize, read.search, read.filters, read.numericSort, offset]))}`;

function matchingRows(read: Pick<Read, "importId" | "filters" | "numericSort" | "search">) {
  const result = rowsFor(read.importId).filter(row => (!read.search || row.jsonDataJsonb["Customer Name"].toLowerCase().includes(read.search.toLowerCase()))
    && read.filters.every(filter => {
      const amount = Number(row.jsonDataJsonb.Amount), date = row.jsonDataJsonb["Payment Date"];
      if (filter.column === "Payment Date" && filter.operator === "dateBetween") return date >= filter.value && date <= filter.valueTo!;
      if (filter.column !== "Amount") return false;
      if (filter.operator === "greaterThan") return amount > Number(filter.value);
      if (filter.operator === "lessThan") return amount < Number(filter.value);
      return filter.operator === "between" && amount >= Number(filter.value) && amount <= Number(filter.valueTo);
    }));
  if (read.numericSort) result.sort((a, b) => (Number(a.jsonDataJsonb.Amount) - Number(b.jsonDataJsonb.Amount)) * (read.numericSort!.direction === "asc" ? 1 : -1));
  return result;
}

async function installFixture(page: Page, baseURL: string | undefined, options: {
  theme?: "light" | "dark"; initialPresets?: Preset[]; failFirstList?: boolean; holdFirstList?: boolean;
} = {}) {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", theme: options.theme ?? "light" });
  const origin = new URL(baseURL!).origin, reads: Read[] = [], requests: Array<{ method: string; importId: string; body: unknown }> = [];
  const presets = new Map<string, Preset[]>([[firstImport, structuredClone(options.initialPresets ?? [])], [secondImport, []]]);
  let failList = options.failFirstList ?? false, failRename = false, nextId = 10;
  const heldList = { started: false, settled: false, cancelled: false };
  let releaseHeldList = () => {};
  const heldListGate = new Promise<void>(resolve => { releaseHeldList = resolve; });
  await page.addInitScript(() => { localStorage.setItem("perf_mode", "high"); Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); });
  await page.context().route(`${origin}/api/settings/tab-visibility`, route => route.request().method() !== "GET" ? route.fallback()
    : route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, viewer: true } } }));
  await page.context().route(`${origin}/api/collection/source-configs`, route => route.request().method() !== "GET" ? route.fallback()
    : route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.context().route(url => url.origin === origin && url.pathname === "/api/imports", route => route.request().method() !== "GET" ? route.fallback()
    : route.fulfill({ json: { imports: [...importNames].map(([id, name]) => ({ id, name, filename: "synthetic-presets.csv", rowCount: 145,
      createdAt: now, createdBy: "guidance.superuser", isDeleted: false })), pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } } }));
  await page.context().route(url => url.origin === origin && /^\/api\/imports\/[^/]+\/viewer-presets(?:\/[^/]+)?$/.test(url.pathname), async route => {
    const parts = new URL(route.request().url()).pathname.split("/"), importId = decodeURIComponent(parts[3]), id = parts[5];
    expect(presets.has(importId)).toBe(true);
    const list = presets.get(importId)!, method = route.request().method();
    if (method === "GET" && !id) {
      if (failList) { failList = false; return route.fulfill({ status: 503, json: { message: "Synthetic preset list unavailable" } }); }
      if (options.holdFirstList && importId === firstImport && !heldList.started) {
        const snapshot = structuredClone(list);
        heldList.started = true;
        await heldListGate;
        try {
          await route.fulfill({ json: { presets: snapshot }, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          // Navigating away legitimately aborts this owned fetch. Do not hide
          // fixture/server failures, page closure or an unrelated route error.
          if (route.request().failure()?.errorText !== "net::ERR_ABORTED") throw error;
          heldList.cancelled = true;
        } finally { heldList.settled = true; }
        return;
      }
      return route.fulfill({ json: { presets: list }, headers: { "Cache-Control": "no-store" } });
    }
    const body: unknown = method === "DELETE" ? null : route.request().postDataJSON();
    requests.push({ method, importId, body });
    if (method === "POST" && !id) {
      const payload = body as Omit<Preset, "id">;
      expect(Object.keys(payload).sort()).toEqual(["columnFilters", "name", "numericSort"]);
      expect(payload.name.trim().length).toBeGreaterThan(0); expect(payload.name.length).toBeLessThanOrEqual(60);
      expect(payload.columnFilters.every(filter => !Object.prototype.hasOwnProperty.call(filter, "id"))).toBe(true);
      const preset: Preset = { ...structuredClone(payload), id: `10000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}` };
      list.push(preset); return route.fulfill({ status: 201, json: { preset } });
    }
    const index = list.findIndex(preset => preset.id === id);
    if (index < 0) return route.fulfill({ status: 404, json: { message: "Preset not found" } });
    if (method === "PATCH") {
      expect(Object.keys(body as object)).toEqual(["name"]);
      if (failRename) { failRename = false; return route.fulfill({ status: 503, json: { message: "Synthetic rename unavailable" } }); }
      list[index] = { ...list[index], name: (body as { name: string }).name };
      return route.fulfill({ json: { preset: list[index] } });
    }
    if (method === "DELETE") { list.splice(index, 1); return route.fulfill({ json: { ok: true } }); }
    return route.fallback();
  });
  await page.context().route(url => url.origin === origin && /^\/api\/imports\/[^/]+\/data$/.test(url.pathname), route => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url()), importId = decodeURIComponent(url.pathname.split("/")[3]);
    expect(importNames.has(importId)).toBe(true);
    const rawFilters = JSON.parse(url.searchParams.get("columnFilters") ?? "[]") as Filter[];
    const filters = rawFilters.map(({ column, operator, value, valueTo }) => ({ column, operator, value, ...(valueTo === undefined ? {} : { valueTo }) }));
    const read: Read = { importId, page: Number(url.searchParams.get("page") ?? 1), pageSize: Number(url.searchParams.get("pageSize") ?? 100),
      cursor: url.searchParams.get("cursor"), search: url.searchParams.get("search") ?? "", filters,
      numericSort: JSON.parse(url.searchParams.get("numericSort") ?? "null") as NumericSort | null };
    const offset = (read.page - 1) * read.pageSize;
    expect(read.cursor, "Cursors cannot cross a preset query or source").toBe(read.page === 1 ? null : cursor(read, offset));
    reads.push(read);
    const matches = matchingRows(read), selected = matches.slice(offset, offset + read.pageSize);
    const nextCursor = offset + selected.length < matches.length ? cursor(read, offset + selected.length) : null;
    return route.fulfill({ json: { headers, rows: selected, total: matches.length, page: read.page, pageSize: read.pageSize,
      limit: read.pageSize, offset, nextCursor, pagination: { mode: "hybrid", page: read.page, pageSize: read.pageSize,
        limit: read.pageSize, offset, nextCursor, total: matches.length, totalPages: Math.max(1, Math.ceil(matches.length / read.pageSize)),
        hasNextPage: nextCursor !== null, hasPreviousPage: read.page > 1 } }, headers: { "Cache-Control": "no-store" } });
  });
  return { session, reads, requests, presets, heldList, releaseHeldList, failNextRename: () => { failRename = true; } };
}
async function openViewer(page: Page, importId = firstImport, waitForPresetPicker = true) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importNames.get(importId)!);
  const size = page.getByTestId("select-viewer-page-size"); await expect(size).toBeEnabled();
  if (await size.inputValue() !== "25") await size.selectOption("25");
  await expect(pagination(page)).toContainText("Showing 1-25 of 145 rows");
  await page.getByTestId("button-toggle-filters").click();
  if (waitForPresetPicker) await expect(picker(page)).toBeVisible();
}
async function addAmountFilter(page: Page) {
  await page.getByTestId("button-add-filter").click(); await page.getByTestId("select-filter-column-0").click();
  await page.getByRole("combobox", { name: "Search filter columns", exact: true }).fill("Amount");
  await page.getByRole("option", { name: "Amount", exact: true }).click();
  await page.getByTestId("select-filter-operator-0").click(); await page.getByRole("option", { name: "Greater than", exact: true }).click();
  await page.getByTestId("input-filter-value-0").fill("50");
  await expect(pagination(page)).toContainText("Showing 1-25 of 94 rows");
}
async function expectCsv(download: Download, expected: ReturnType<typeof rowsFor>) {
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream(); expect(stream).not.toBeNull();
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of stream!) { const part = Buffer.from(chunk); bytes += part.length; expect(bytes).toBeLessThan(512 * 1024); chunks.push(part); }
  const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  expect(Buffer.concat(chunks).toString("utf8").trim()).toBe([headers.map(csv).join(","),
    ...expected.map(row => headers.map(header => csv(row.jsonDataJsonb[header as keyof typeof row.jsonDataJsonb])).join(",")),
  ].join("\r\n"));
  await download.delete();
}

test("Viewer filter presets: desktop saves applies renames deletes and keeps presets scoped to their source", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL); await openViewer(page); await addAmountFilter(page);
  await save(page).click(); await presetName(page).fill("Priority <b>review</b>"); await confirm(page).click();
  await expect(save(page)).toBeFocused();
  await expect(picker(page).locator("option")).toHaveText(["Choose a preset", "Priority <b>review</b>"]);
  expect(fixture.requests.filter(request => request.method === "POST")).toHaveLength(1);
  const created = fixture.presets.get(firstImport)![0];
  expect(created).toMatchObject({ name: "Priority <b>review</b>", columnFilters: [{ column: "Amount", operator: "greaterThan", value: "50" }], numericSort: null });
  await page.getByTestId("button-clear-filters").click(); await expect(pagination(page)).toContainText("Showing 1-25 of 145 rows");
  await picker(page).selectOption(created.id); await apply(page).click(); await expect(pagination(page)).toContainText("Showing 1-25 of 94 rows");
  await page.getByTestId("button-rename-viewer-preset").click(); await presetName(page).fill("Priority accounts"); await confirm(page).click();
  await expect(picker(page)).toBeFocused();
  await expect(picker(page).locator("option")).toHaveText(["Choose a preset", "Priority accounts"]);
  await save(page).click(); await expect(presetName(page)).toBeFocused();
  await page.getByTestId("button-cancel-viewer-preset").click(); await expect(save(page)).toBeFocused();
  // Viewer keeps the selected import in SPA state. Reopen through Saved in a
  // fresh document to verify server persistence using the existing workflow.
  await openViewer(page); await expect(picker(page).locator("option")).toHaveText(["Choose a preset", "Priority accounts"]);
  await openViewer(page, secondImport); await expect(picker(page).locator("option")).toHaveText(["No saved presets"]);
  await openViewer(page); await picker(page).selectOption(created.id); await apply(page).click();
  await expect(pagination(page)).toContainText("Showing 1-25 of 94 rows");
  await page.getByTestId("button-delete-viewer-preset").click(); await expect(confirm(page)).toHaveText("Delete preset");
  expect(fixture.presets.get(firstImport)).toHaveLength(1); await confirm(page).click();
  await expect(save(page)).toBeFocused();
  await expect(picker(page).locator("option")).toHaveText(["No saved presets"]); expect(fixture.presets.get(firstImport)).toEqual([]);
  expect(fixture.requests.map(({ method, importId }) => ({ method, importId }))).toEqual(["POST", "PATCH", "DELETE"].map(method => ({ method, importId: firstImport })));
  await checkFixture(page, fixture.session);
});

test("Viewer filter presets: applying compound filters resets page selection and sorted CSV keeps current search", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL, { initialPresets: [combinedPreset] }); await openViewer(page);
  await page.getByTestId("input-search-viewer").fill("synthetic"); await expect.poll(() => fixture.reads[fixture.reads.length - 1]?.search).toBe("synthetic");
  await page.getByTestId("button-viewer-next-page").click(); await expect(pagination(page)).toContainText("Showing 26-50 of 145 rows");
  await page.getByRole("checkbox", { name: "Select row 26", exact: true }).check();
  const beforeApply = fixture.reads.length;
  await picker(page).selectOption(combinedPreset.id); await apply(page).click();
  await expect(pagination(page)).toContainText("Showing 1-25 of 121 rows");
  await expect(page.getByTestId("button-clear-selection")).toHaveCount(0);
  expect(fixture.reads.slice(beforeApply)).toEqual([expect.objectContaining({ page: 1, cursor: null, search: "synthetic",
    filters: combinedPreset.columnFilters, numericSort: combinedPreset.numericSort })]);
  await expect(page.getByTestId("input-filter-value-0")).toHaveValue("2024-01-10");
  await expect(page.getByTestId("input-filter-value-to-0")).toHaveValue("2024-05-10");
  await expect(page.getByTestId("input-filter-value-1")).toHaveValue("10");
  // Explicit Apply must also reset when the chosen preset already matches the
  // current query: new query identity cannot be the only reset trigger.
  await page.getByTestId("button-viewer-next-page").click(); await expect(pagination(page)).toContainText("Showing 26-50 of 121 rows");
  await page.getByRole("checkbox", { name: "Select row 26", exact: true }).check();
  const beforeSameApply = fixture.reads.length; await apply(page).click();
  await expect(pagination(page)).toContainText("Showing 1-25 of 121 rows");
  await expect(page.getByTestId("button-clear-selection")).toHaveCount(0);
  expect(fixture.reads.slice(beforeSameApply)).toEqual([expect.objectContaining({ page: 1, cursor: null, search: "synthetic",
    filters: combinedPreset.columnFilters, numericSort: combinedPreset.numericSort })]);
  const exportStart = fixture.reads.length;
  await page.getByTestId("button-viewer-more-actions").click(); await page.getByTestId("button-export-menu").click();
  const downloaded = page.waitForEvent("download"); await page.getByTestId("button-export-csv-all").click();
  await expectCsv(await downloaded, matchingRows({ importId: firstImport, search: "synthetic", filters: combinedPreset.columnFilters, numericSort: combinedPreset.numericSort }));
  expect(fixture.reads.slice(exportStart)).toEqual([1, 2].map(number => expect.objectContaining({ page: number, pageSize: 100,
    search: "synthetic", filters: combinedPreset.columnFilters, numericSort: combinedPreset.numericSort })));
  expect(fixture.requests).toEqual([]); await checkFixture(page, fixture.session);
});

test("Viewer filter presets: mobile320 dark keyboard handles load retry stale columns and failed rename safely", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, { theme: "dark", initialPresets: [combinedPreset, stalePreset], failFirstList: true });
  await openViewer(page);
  const dialog = page.getByRole("dialog", { name: "Column Filters", exact: true }); await expect(dialog).toBeVisible();
  await expect(page.getByTestId("viewer-preset-error")).toBeVisible(); await page.getByTestId("button-retry-viewer-presets").click();
  await expect(picker(page).locator("option")).toHaveText(["Choose a preset", "Quarterly review", "Older source columns"]);
  await expect(picker(page)).toHaveAccessibleName("Saved preset");
  // Open the native select before choosing: Enter on a closed Linux select
  // opens its popup, which would consume the next Tab rather than move focus.
  await picker(page).focus(); await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(picker(page)).toHaveValue(combinedPreset.id);
  await page.keyboard.press("Tab"); await expect(apply(page)).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.getByTestId("input-filter-value-1")).toHaveValue("10");
  const beforeStale = fixture.reads.length; await picker(page).selectOption(stalePreset.id);
  await expect(page.getByTestId("viewer-preset-error")).toContainText("A preset column is no longer available");
  await expect(apply(page)).toBeDisabled(); expect(fixture.reads.length).toBe(beforeStale);
  await expect(page.getByTestId("input-filter-value-1")).toHaveValue("10");
  await picker(page).selectOption(combinedPreset.id); fixture.failNextRename();
  await page.getByTestId("button-rename-viewer-preset").click(); await expect(presetName(page)).toHaveAccessibleName("Preset name");
  await presetName(page).fill("Updated review"); await confirm(page).click();
  await expect(page.getByTestId("viewer-preset-error")).toContainText("Synthetic rename unavailable");
  await expect(presetName(page)).toHaveValue("Updated review"); expect(fixture.presets.get(firstImport)![0].name).toBe("Quarterly review");
  await confirm(page).click(); await expect(presetName(page)).toHaveCount(0);
  await expect(picker(page)).toBeFocused();
  await expect(picker(page).locator("option")).toHaveText(["Choose a preset", "Older source columns", "Updated review"]);
  for (const control of [picker(page), save(page), apply(page), page.getByTestId("button-rename-viewer-preset"), page.getByTestId("button-delete-viewer-preset")]) {
    await control.scrollIntoViewIfNeeded(); const box = await control.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(321);
    expect(box!.height).toBeGreaterThanOrEqual(30);
  }
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
  await expect(page.getByTestId("button-toggle-filters")).toBeFocused(); await checkFixture(page, fixture.session);
});

test("Viewer filter presets: delayed responses from a previous file cannot replace the current private list", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL, { initialPresets: [combinedPreset], holdFirstList: true });
  try {
    await openViewer(page, firstImport, false);
    await expect.poll(() => fixture.heldList.started).toBe(true);
    await expect(page.getByText("Loading your presets…", { exact: true })).toBeVisible();
    const originalDocumentTime = await page.evaluate(() => performance.timeOrigin);
    // Use the real SPA controls. No page.goto/reload or React state injection
    // can discard the old document as a substitute for lifecycle cleanup.
    await page.getByTestId("button-back").click();
    await expect(page.getByTestId("text-import-count")).toHaveText("2 files");
    await page.getByTestId(`button-view-${secondImport}`).click();
    await expect(page.locator("#viewer-dataset-title")).toHaveText(importNames.get(secondImport)!);
    const size = page.getByTestId("select-viewer-page-size"); await expect(size).toBeEnabled();
    if (await size.inputValue() !== "25") await size.selectOption("25");
    await expect(pagination(page)).toContainText("Showing 1-25 of 145 rows");
    await page.getByTestId("button-toggle-filters").click();
    await expect(picker(page).locator("option")).toHaveText(["No saved presets"]);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(originalDocumentTime);
    const beforeRelease = fixture.reads.length;
    fixture.releaseHeldList(); await expect.poll(() => fixture.heldList.settled).toBe(true);
    await page.waitForTimeout(400);
    await expect(picker(page).locator("option")).toHaveText(["No saved presets"]);
    await expect(page.getByTestId("viewer-preset-status")).toBeEmpty();
    await expect(page.getByTestId("viewer-preset-error")).toHaveCount(0);
    await expect(page.locator('section[aria-labelledby="viewer-presets-title"]')).toHaveAttribute("aria-busy", "false");
    expect(fixture.reads.length).toBe(beforeRelease);
    expect(fixture.reads.filter(read => read.importId === secondImport).every(read => read.filters.length === 0 && read.numericSort === null)).toBe(true);
    expect(fixture.requests).toEqual([]);
    // A fresh mutation in the new scope must work, rather than leaving a stale
    // pending flag or leaking the first file's preset into the list.
    await addAmountFilter(page); await save(page).click(); await presetName(page).fill("Current file review"); await confirm(page).click();
    await expect(save(page)).toBeFocused();
    await expect(picker(page).locator("option")).toHaveText(["Choose a preset", "Current file review"]);
    expect(fixture.requests).toEqual([expect.objectContaining({ method: "POST", importId: secondImport })]);
    expect(fixture.presets.get(firstImport)).toEqual([combinedPreset]);
    await checkFixture(page, fixture.session);
  } finally {
    fixture.releaseHeldList();
    if (fixture.heldList.started) await expect.poll(() => fixture.heldList.settled, { timeout: 3_000 }).toBe(true);
  }
});
