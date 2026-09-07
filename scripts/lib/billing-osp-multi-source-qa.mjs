import assert from "node:assert/strict";
import path from "node:path";

const prefix = "/api/collection/report/billing-principal/saved-targets";
const sourceValidities = [
  { validFrom: "2026-09-01", validTo: "2026-09-30", enabled: true },
  { validFrom: "2026-08-12", validTo: "2026-09-10", enabled: true },
  { validFrom: "2026-09-15", validTo: "2026-10-05", enabled: true },
];
const validity = { validFrom: "2026-08-12", validTo: "2026-10-05" };
const exampleNames = [
  "NPL CC P10 SEP26 - AKALI",
  "NPL CC P10 SEP26 - batch 2",
  "NPL CC P25 AUG26 - AKALI RESOURCES",
];
const sortedIds = (items) => [...items].sort();

// Real UI + HTTP + PostgreSQL path. The caller owns a fresh, guarded QA
// database; the display names never imply or override configured validity.
export async function runBillingOspMultiSourceQa({ api, superuser, admin, otherAdmin, artifactDir, checked }) {
  const database = process.env.COLLECTION_SAVE_ACCESS_QA_DATABASE || "";
  assert(/^sqr_save_access_[0-9]+_[a-f0-9]{6}$/.test(database));
  assert.equal(process.env.PG_DATABASE, database);
  const baseUrl = process.env.SMOKE_BASE_URL;
  assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname));
  const page = superuser.page;
  const stamp = String(Date.now());
  const sources = [];
  let target;
  let failed = false;
  try {
    for (const [index, name] of exampleNames.entries()) {
      const filename = `multi-configured-${stamp}-${index}.csv`;
      const source = await api(superuser, "POST", "/api/imports", {
        name, filename, data: [{
          "Customer Name": `Synthetic multi-source ${index}`,
          "Account No": `00${stamp}${index}`, "Card No": `01${stamp}${index}`,
          "IC Number": `000303${String(index).padStart(6, "0")}`,
          "Customer Phone Number": `012347${String(index).padStart(4, "0")}`,
          "TOTAL DUE": "500.00", "Billing Principal (OSP)": `${(index + 1) * 100}.00`,
          DC_STS: "3", "Calling Date": sourceValidities[index].validFrom,
        }],
      });
      sources.push({ id: source.id, name, filename, ...sourceValidities[index] });
      await api(superuser, "PUT", "/api/collection/source-configs/" + source.id, sourceValidities[index]);
    }
    await page.goto(baseUrl + "/collection/billing-principal", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Create Target", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Create Billing OSP target" }).waitFor();
    const sourceSelect = dialog.locator("#osp-configured-source");
    const selectedList = dialog.getByRole("list", { name: "Selected configured sources" });
    const save = dialog.getByRole("button", { name: "Save Target", exact: true });
    await dialog.getByLabel("4. Target name", { exact: true }).fill("Multi configured target " + stamp);
    assert(await sourceSelect.isDisabled(), "Source selection requires an assigned account.");
    await dialog.locator("#osp-assigned-admin").selectOption(admin.user.id);
    assert(await save.isDisabled(), "An empty source selection cannot submit even with valid target fields.");

    const awaitPreview = async (action, expected) => {
      const pending = page.waitForResponse((response) => response.request().method() === "POST"
        && new URL(response.url()).pathname === prefix + "/preview"
        && JSON.stringify(sortedIds(response.request().postDataJSON().sourceImportIds)) === JSON.stringify(sortedIds(expected)));
      await action();
      const response = await pending;
      assert.equal(response.status(), 200, "Authoritative multi-source preview succeeds.");
      const preview = await response.json();
      assert.deepEqual(sortedIds(preview.sourceImportIds), sortedIds(expected));
      const selected = sources.filter((source) => expected.includes(source.id));
      assert.equal(preview.from, selected.map((source) => source.validFrom).sort()[0]);
      assert.equal(preview.to, selected.map((source) => source.validTo).sort().reverse()[0]);
      await dialog.getByRole("table", { name: "Shared target baseline preview" }).waitFor();
      return preview;
    };
    const selectSource = async (source, expected) => {
      await dialog.getByLabel("Search configured sources").fill(source.filename);
      const preview = await awaitPreview(() => sourceSelect.selectOption(source.id), expected);
      await selectedList.getByRole("button", { name: "Remove source " + source.name, exact: true }).waitFor();
      assert.equal(await selectedList.getByRole("listitem").count(), expected.length);
      assert.equal(await sourceSelect.locator(`option[value="${source.id}"]`).count(), 0, "Selected sources cannot be selected twice.");
      return preview;
    };
    await selectSource(sources[0], [sources[0].id]);
    await dialog.getByLabel("D3 shared target percentage").fill("25");
    const twoSourcePreview = await selectSource(sources[1], sources.slice(0, 2).map((source) => source.id));
    assert.equal(twoSourcePreview.rows.find((row) => row.aging === "D3").totalOsp, "300.00");
    assert.equal(await dialog.getByLabel("D3 shared target percentage").inputValue(), "25", "Adding File B retains the percentage already entered for File A.");
    await dialog.getByRole("table", { name: "Shared target baseline preview" }).getByText("RM75.00", { exact: true }).waitFor();
    await dialog.locator("#osp-assigned-admin").selectOption(otherAdmin.user.id);
    await selectedList.waitFor({ state: "hidden" });
    assert(await save.isDisabled(), "Changing assigned account invalidates the old source preview.");
    assert.equal(await dialog.getByLabel("Search configured sources").inputValue(), "");
    await dialog.locator("#osp-assigned-admin").selectOption(admin.user.id);
    await selectSource(sources[0], [sources[0].id]);
    await selectSource(sources[1], sources.slice(0, 2).map((source) => source.id));
    const allIds = sources.map((source) => source.id);
    const fullPreview = await selectSource(sources[2], allIds);
    assert.equal(fullPreview.rows.find((row) => row.aging === "D3").totalOsp, "600.00");
    for (const source of sources) await selectedList.getByText(source.name, { exact: true }).waitFor();
    const reduced = await awaitPreview(() => selectedList.getByRole("button", { name: "Remove source " + sources[1].name, exact: true }).click(), [sources[0].id, sources[2].id]);
    assert.equal(reduced.rows.find((row) => row.aging === "D3").totalOsp, "400.00", "Removing one source refreshes only the selected aggregate.");
    await selectSource(sources[1], allIds);
    await dialog.getByLabel("D3 shared target percentage").fill("30");
    await page.screenshot({ path: path.join(artifactDir, "osp-multi-source-selected.png"), fullPage: true });
    const originalViewport = page.viewportSize();
    const originalDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    try {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.setViewportSize({ width: 390, height: 844 });
      await selectedList.scrollIntoViewIfNeeded();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Multi-source selection does not overflow a narrow page.");
      assert(await selectedList.evaluate((list) => list.scrollWidth <= list.clientWidth + 1), "Selected filenames wrap within the existing dialog at narrow width.");
      for (const source of sources) assert(await selectedList.getByRole("button", { name: "Remove source " + source.name, exact: true }).isVisible());
      await page.screenshot({ path: path.join(artifactDir, "osp-multi-source-selected-dark-narrow.png"), fullPage: true });
    } finally {
      await page.setViewportSize(originalViewport);
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), originalDark);
    }
    checked("Create Target keeps TABLE A available while adding different-validity files; previews each selected union, blocks duplicates/empty selection, removes/re-adds one and clears stale sources on account change");

    const pendingCreate = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === prefix);
    await save.click();
    const created = await pendingCreate;
    assert.deepEqual(sortedIds(created.request().postDataJSON().sourceImportIds), sortedIds(allIds), "The browser submits every selected source ID.");
    assert.equal(created.status(), 200);
    target = (await created.json()).target;
    const assertSources = (value) => {
      assert.deepEqual(sortedIds(value.activeRevision.sourceImportIds), sortedIds(allIds));
      assert.deepEqual(sortedIds(value.activeRevision.sourceSnapshots.map((source) => source.sourceImportId)), sortedIds(allIds));
      assert.equal(new Set(value.activeRevision.sourceImportIds).size, 3);
      assert.equal(value.assignedAdminUserId, admin.user.id);
      assert.equal(value.activeRevision.from, validity.validFrom);
      assert.equal(value.activeRevision.to, validity.validTo);
      assert.equal(value.activeRevision.reportingWindow.from, validity.validFrom);
      assert.equal(value.activeRevision.reportingWindow.to, validity.validTo);
      for (const source of sources) {
        const window = value.activeRevision.reportingWindow.sources.find((item) => item.sourceImportId === source.id);
        assert.equal(window.validFrom, source.validFrom);
        assert.equal(window.validTo, source.validTo);
      }
    };
    assertSources(target);
    await page.getByRole("heading", { name: target.name, exact: true }).waitFor();
    assertSources((await api(superuser, "GET", prefix + "/" + target.id)).target);
    assertSources((await api(superuser, "GET", prefix)).targets.find((item) => item.id === target.id));
    const overview = await api(admin, "GET", `${prefix}/${target.id}/revisions/${target.activeRevision.id}/overview?asOf=${validity.validFrom}`);
    assert.equal(overview.systemResult.all.totalOsp, "600.00", "Direct downstream resolution includes all three baseline sources.");
    assert.equal(overview.systemResult.all.targetOsp, "180.00");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: target.name, exact: true }).waitFor();
    const initialEditOptions = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname === prefix + "/options");
    const initialEditOverview = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname.endsWith("/overview"));
    await page.getByRole("button", { name: "Edit Target", exact: true }).click();
    await dialog.getByRole("heading", { name: "Edit shared target" }).waitFor();
    assert.equal((await initialEditOptions).status(), 200);
    assert.equal((await initialEditOverview).status(), 200);
    await dialog.getByRole("table", { name: "Shared target baseline preview" }).waitFor();
    const frozenSources = await dialog.locator("#osp-configured-source").innerText();
    for (const source of sources) assert(frozenSources.includes(source.name) && frozenSources.includes(source.filename));
    assert.equal(await dialog.locator("select#osp-configured-source").count(), 0, "Existing frozen-source editing semantics remain unchanged.");
    await dialog.getByLabel("D3 shared target percentage").fill("37");
    await dialog.locator("#osp-assigned-admin").selectOption(otherAdmin.user.id);
    assert(await dialog.getByRole("table", { name: "Shared target baseline preview" }).isVisible(), "Changing the edited assignment does not reload/reset the frozen baseline.");
    assert.equal(await dialog.getByLabel("D3 shared target percentage").inputValue(), "37", "Changing assignment in the existing edit form must not overwrite an unsaved percentage draft.");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.screenshot({ path: path.join(artifactDir, "osp-multi-source-reloaded.png"), fullPage: true });
    checked("Real mixed-validity three-source creation persists all IDs and individual dates under Aug12-Oct5 combined bounds; detail/list/reload/edit retain all sources; assigned-admin baseline RM600 and unchanged 30% target RM180");
    checked("Selected source names/removal controls fit dark narrow layout; existing Edit Target preserves an unsaved percentage when assignment changes");
  } catch (error) {
    failed = true;
    await page.screenshot({ path: path.join(artifactDir, "osp-multi-source-failure.png"), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    const cleanupErrors = [];
    if (target) await api(superuser, "DELETE", `${prefix}/${target.id}?version=${target.version}`).catch((error) => cleanupErrors.push(error));
    for (const source of sources) await api(superuser, "DELETE", "/api/imports/" + source.id).catch((error) => cleanupErrors.push(error));
    if (!failed) assert.deepEqual(cleanupErrors.map((error) => error.message), [], "Synthetic multi-source fixtures clean up through the real APIs.");
  }
}
