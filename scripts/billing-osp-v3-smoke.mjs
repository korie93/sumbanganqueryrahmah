import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";
import { runBillingOspRetrospectiveQa, verifyBillingOspRetrospectiveRestart } from "./lib/billing-osp-retrospective-qa.mjs";

// Writes synthetic fixtures only to the disposable local QA environment.
const database = process.env.COLLECTION_SAVE_ACCESS_QA_DATABASE || "";
assert(/^sqr_save_access_[0-9]+_[a-f0-9]{6}$/.test(database));
assert.equal(process.env.PG_DATABASE, database);
const baseUrl = process.env.SMOKE_BASE_URL;
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname));
const artifactDir = path.resolve(process.env.SMOKE_ARTIFACTS_DIR);
const prefix = "/api/collection/report/billing-principal/saved-targets";
const restartCheck = process.env.COLLECTION_OSP_RESTART_CHECK === "1";
const credentials = {
  superuser: [process.env.SMOKE_TEST_USERNAME, process.env.SMOKE_TEST_PASSWORD],
  admin: [process.env.COLLECTION_SAVE_ADMIN_USERNAME, process.env.COLLECTION_SAVE_ADMIN_PASSWORD],
  manager: [process.env.COLLECTION_OSP_MANAGER_USERNAME, process.env.COLLECTION_OSP_MANAGER_PASSWORD],
  otherAdmin: [process.env.COLLECTION_OSP_OTHER_ADMIN_USERNAME, process.env.COLLECTION_OSP_OTHER_ADMIN_PASSWORD],
  user: [process.env.COLLECTION_SAVE_USER_USERNAME, process.env.COLLECTION_SAVE_USER_PASSWORD],
};
for (const [label, values] of Object.entries(credentials)) assert(values.every(Boolean), `Missing ${label} fixture credentials.`);
const checks = [];
const pageErrors = [];
const contexts = [];
const actors = [];
let phase = "startup";
let browser;
let currentPage;
const watchdog = setTimeout(() => { console.error(`Billing V3 smoke timed out during ${phase}`); process.exit(124); }, 8 * 60_000);
const checked = (label) => { checks.push(label); console.log(`[billing-osp-v3] pass: ${label}`); };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(actor, method, endpoint, body, status = 200, extraHeaders = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const csrf = (await actor.context.cookies(baseUrl)).find((cookie) => cookie.name === "sqr_csrf");
    const response = await actor.context.request.fetch(baseUrl + endpoint, {
      method, headers: { Accept: "application/json", ...(csrf ? { "X-CSRF-Token": csrf.value } : {}), ...extraHeaders },
      ...(body === undefined ? {} : { data: body }), timeout: 30_000,
    });
    if (response.status() === 429 && status !== 429 && attempt < 2) {
      await wait(Math.min(30, Math.max(1, Number(response.headers()["retry-after"]) || 12)) * 1000); continue;
    }
    const payload = await response.json().catch(() => ({}));
    assert.equal(response.status(), status, `${method} ${endpoint}: ${response.status()} ${payload.error?.code || ""} ${payload.message || ""}`);
    return payload;
  }
}

async function login(label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage(); currentPage = page;
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
  await page.goto(baseUrl + "/login", { waitUntil: "domcontentloaded" });
  await page.getByTestId("input-username").fill(credentials[label][0]);
  await page.getByTestId("input-password").fill(credentials[label][1]);
  const pending = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/auth/login");
  await page.getByTestId("button-login").click();
  assert.equal((await pending).status(), 200, `${label} login`);
  await page.getByTestId("input-username").waitFor({ state: "hidden" });
  const actor = { context, page, label };
  actors.push(actor);
  actor.user = (await api(actor, "GET", "/api/me")).user;
  assert.equal(actor.user.role, label === "otherAdmin" ? "admin" : label);
  return actor;
}

async function openReport(actor, targetId) {
  currentPage = actor.page;
  await actor.page.goto(baseUrl + "/collection/billing-principal", { waitUntil: "domcontentloaded" });
  await actor.page.getByRole("table", { name: "Table B Client Billing Principal result" }).waitFor();
  if (targetId && await actor.page.locator("#billing-saved-target-select").inputValue() !== targetId) {
    const changed = actor.page.waitForResponse((response) => new URL(response.url()).pathname.includes(`/saved-targets/${targetId}/revisions/`) && new URL(response.url()).pathname.endsWith("/overview"));
    await actor.page.locator("#billing-saved-target-select").selectOption(targetId);
    assert.equal((await changed).status(), 200);
    await actor.page.getByRole("table", { name: "Table B Client Billing Principal result" }).waitFor();
  }
  assert.equal(await actor.page.locator("#collection-nickname-input").count(), 0, "Billing must use assigned account access, not require a nickname login.");
}

async function savePrivate(actor, targetPercent, resultPercent) {
  await actor.page.getByLabel("D3 private target percentage").fill(targetPercent);
  await actor.page.getByLabel("D3 client result percentage").fill(resultPercent);
  assert(await actor.page.getByRole("button", { name: "Reload Targets", exact: true }).isDisabled());
  assert(await actor.page.getByRole("button", { name: "Export Billing Principal report as XLSX" }).isDisabled());
  const responsePromise = actor.page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.endsWith("/client-results"));
  await actor.page.getByRole("button", { name: "Save Client Result", exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const payload = await response.json();
  const d3 = payload.clientResult.rows.find((row) => row.aging === "D3");
  assert.equal(d3.targetPercentage, Number(targetPercent).toFixed(4));
  assert.equal(d3.resultPercentage, Number(resultPercent).toFixed(4));
  await actor.page.getByText("Saved to your account", { exact: true }).waitFor();
  return d3;
}

async function verifyPrivateExports(actor, targetPercent, resultPercent) {
  const page = actor.page;
  for (const format of ["XLSX", "PNG", "PDF"]) {
    const downloads = [];
    const errors = [];
    const consume = (download) => {
      downloads.push((async () => {
        const stream = await download.createReadStream();
        assert(stream);
        const chunks = []; let size = 0;
        for await (const chunk of stream) {
          size += chunk.length;
          assert(size < 32 * 1024 * 1024, "Synthetic private report download stays bounded.");
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        assert(size > 8);
        if (format === "XLSX") {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(bytes, { type: "buffer" });
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Table B Client"]);
          assert.equal(rows[0]["Target Percentage"], Number(targetPercent));
          assert.equal(rows[0]["Client Result Percentage"], Number(resultPercent));
          assert.equal(workbook.SheetNames.some((name) => /account|table c/i.test(name)), false);
        } else if (format === "PNG") assert(bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
        else assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
        await download.delete();
      })().catch((error) => { errors.push(error); }));
    };
    const button = page.getByRole("button", { name: `Export Billing Principal report as ${format}` });
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/export")
      && new URL(response.url()).searchParams.get("format") === (format === "XLSX" ? "xlsx" : "json"));
    page.on("download", consume);
    try {
      await button.click();
      const response = await responsePromise;
      assert.equal(response.status(), 200, `${actor.label} ${format} authorization`);
      if (format !== "XLSX") {
        const dataset = await response.json();
        assert.equal(dataset.overview.clientResult.rows[0].targetPercentage, targetPercent);
        assert.equal(dataset.overview.clientResult.rows[0].resultPercentage, resultPercent);
        assert.deepEqual(dataset.drilldown, []);
      }
      const deadline = Date.now() + 60_000;
      while (!downloads.length || !(await button.isEnabled())) {
        assert(Date.now() < deadline, `${actor.label} ${format} rendering did not complete.`);
        await wait(25);
      }
      await Promise.all(downloads);
      assert.deepEqual(errors.map((error) => error.message), []);
      assert.equal(format === "PNG" || downloads.length === 1, true);
    } finally { page.off("download", consume); }
  }
}

async function verifyWorkspaceResourceCycles(superuser, manager, targetId) {
  const target = (await api(superuser, "GET", prefix + "/" + targetId)).target;
  const second = (await api(superuser, "POST", prefix, { name: "V3 resource target " + Date.now(),
    assignedAdminUserId: target.assignedAdminUserId, sourceImportIds: target.activeRevision.sourceImportIds,
    agingScope: ["D3", "D4", "D5", "D6"], targets: ["D3", "D4", "D5", "D6"].map((agingBucket) => ({ agingBucket, targetPercentage: "30" })) })).target;
  const page = manager.page;
  await openReport(manager);
  await page.evaluate(() => {
    const active = new Set(); const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const value = create(blob); active.add(value); return value; };
    URL.revokeObjectURL = (value) => { active.delete(value); return revoke(value); };
    window.__ospActiveExportUrls = active;
  });
  const cdp = await manager.context.newCDPSession(page);
  const resourceSnapshot = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    return { ...(await cdp.send("Memory.getDOMCounters")), ...(await cdp.send("Runtime.getHeapUsage")),
      activeUrls: await page.evaluate(() => window.__ospActiveExportUrls.size) };
  };
  const exercise = async () => {
    for (const selected of [second, target, second, target]) {
      await page.locator("#billing-saved-target-select").selectOption(selected.id);
      await page.getByRole("heading", { name: selected.name, exact: true }).waitFor();
      await page.getByLabel("D3 private target percentage").waitFor();
      await savePrivate(manager, "35", "28");
      await page.getByRole("button", { name: /^2026-08-20, 12 accounts/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("table", { name: "Accounts closed on selected day" }).waitFor();
      await dialog.getByRole("tab", { name: "D4", exact: true }).click();
      await dialog.getByText("1 accounts", { exact: true }).waitFor();
      await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    }
    await verifyPrivateExports(manager, "35.0000", "28.0000");
  };
  try {
    await exercise();
    const baseline = await resourceSnapshot();
    assert.equal(baseline.activeUrls, 0, "completed PNG/PDF/XLSX exports revoke their object URLs");
    // Keep the production export limit intact while testing a second cycle.
    await wait(61_000);
    await exercise();
    const after = await resourceSnapshot();
    assert.equal(after.activeUrls, 0);
    assert(after.nodes < baseline.nodes + 1500);
    assert(after.jsEventListeners < baseline.jsEventListeners + 200);
    assert(after.usedSize - baseline.usedSize < 32 * 1024 * 1024, "warmed target/save/aging/export cycles must not retain runaway heap buffers");
    const blockedPattern = "**/saved-targets/**/export?**";
    let intercepted = false;
    await page.route(blockedPattern, async (route) => {
      intercepted = true;
      await wait(250);
      await route.abort("aborted").catch(() => undefined);
    });
    let downloadCount = 0;
    const countDownload = () => { downloadCount += 1; };
    page.on("download", countDownload);
    try {
      await page.getByRole("button", { name: "Export Billing Principal report as PDF" }).click();
      await page.getByRole("button", { name: "Cancel export", exact: true }).click();
      await page.getByRole("button", { name: "Cancel export", exact: true }).waitFor({ state: "hidden" });
      await wait(300);
      assert.equal(intercepted, true);
      assert.equal(downloadCount, 0);
      assert.equal(await page.evaluate(() => window.__ospActiveExportUrls.size), 0);
      assert(await page.getByRole("button", { name: "Reload Targets", exact: true }).isEnabled());
    } finally { page.off("download", countDownload); await page.unroute(blockedPattern); }
    await writeFile(path.join(artifactDir, "osp-v3-resources.json"), JSON.stringify({ baseline, after, targetSwitches: 8, privateSaves: 8, exportFormats: 6, cancellation: true }, null, 2));
    checked("repeated target switches, private saves, aging dialogs and all export formats release DOM/listeners/Blob URLs/heap; cancellation releases workspace");
  } finally {
    await cdp.detach();
    await api(superuser, "DELETE", prefix + "/" + second.id + "?version=" + second.version);
  }
}

async function verifyExportOwnerSwitch(superuser, manager, targetId) {
  const page = superuser.page;
  const targetPath = prefix + "/" + targetId;
  const target = (await api(superuser, "GET", targetPath)).target;
  const secondViewer = await api(manager, "GET", targetPath);
  assert.equal(secondViewer.target.version, target.version, "Both owners can read the same unchanged shared target.");
  assert.equal(secondViewer.viewerUserId, manager.user.id);
  for (const format of ["XLSX", "PNG", "PDF"]) {
    await openReport(superuser);
    await page.locator("#billing-saved-target-select").selectOption(targetId);
    await page.getByRole("heading", { name: target.name, exact: true }).waitFor();
    await page.getByLabel("D3 private target percentage").waitFor();
    const originalCookies = await superuser.context.cookies(baseUrl);
    const replacementCookies = await manager.context.cookies(baseUrl);
    let intercepted = false;
    let downloadCount = 0;
    let finalViewerId = "";
    const pendingChecks = [];
    const errors = [];
    const exportUrl = (url) => url.pathname === targetPath + "/revisions/" + target.activeRevision.id + "/export";
    const intercept = async (route) => {
      try {
        // Fetch with the original authenticated browser request, then replace
        // only this disposable context's cookies before rendering can finish.
        const response = await route.fetch();
        assert.equal(response.status(), 200, format + " original-owner export");
        assert.equal(response.headers()["x-billing-export-owner-id"], superuser.user.id);
        if (format !== "XLSX") assert.equal((await response.json()).generatedByUserId, superuser.user.id);
        await superuser.context.addCookies(replacementCookies);
        intercepted = true;
        await route.fulfill({ response });
      } catch (error) {
        errors.push(error.message);
        await route.abort("failed").catch(() => undefined);
      }
    };
    const observeFinalOwner = (response) => {
      if (!intercepted || new URL(response.url()).pathname !== targetPath || response.request().method() !== "GET") return;
      pendingChecks.push((async () => {
        assert.equal(response.status(), 200, "Replacement owner still has shared target access.");
        const payload = await response.json();
        assert.equal(payload.target.version, target.version);
        finalViewerId = payload.viewerUserId;
      })().catch((error) => { errors.push(error.message); }));
    };
    const countDownload = (download) => { downloadCount += 1; void download.delete().catch(() => undefined); };
    await page.evaluate(() => {
      window.__ospOwnerSwitchBlobCreations = 0;
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { window.__ospOwnerSwitchBlobCreations += 1; return create(blob); };
    });
    await page.route(exportUrl, intercept);
    page.on("response", observeFinalOwner);
    page.on("download", countDownload);
    try {
      await page.getByRole("button", { name: `Export Billing Principal report as ${format}` }).click();
      await page.getByRole("table", { name: "Table B Client Billing Principal result" }).waitFor({ state: "hidden" });
      // Both live metadata and the final export check fence the owner. Either
      // may clear the private workspace first; retain all no-download checks.
      await page.getByRole("alert").filter({ hasText: /^(?:Saved Target access could not be confirmed|Authenticated account changed)\. Reload targets before continuing\.$/ }).waitFor();
      await Promise.all(pendingChecks);
      assert.equal(intercepted, true);
      assert.equal(finalViewerId, manager.user.id, "Final target authorization observes the new stable owner.");
      assert.equal(downloadCount, 0, format + " must not release the previous owner's private result after session replacement.");
      assert.equal(await page.evaluate(() => window.__ospOwnerSwitchBlobCreations), 0);
      assert.deepEqual(errors, []);
    } finally {
      page.off("response", observeFinalOwner);
      page.off("download", countDownload);
      await page.unroute(exportUrl, intercept);
      await superuser.context.addCookies(originalCookies);
    }
  }
  checked("XLSX/PNG/PDF reject a real cookie owner switch after dataset generation even when the new owner can read the unchanged target; no download or Blob URL, private UI cleared");
}

async function verifyLongMetadataAndLargeMoney(superuser, manager, assignedAdminUserId) {
  const stamp = String(Date.now());
  const source = await api(superuser, "POST", "/api/imports", {
    name: "Long synthetic Billing source " + "name ".repeat(35),
    filename: "large-billing-" + "source-name-".repeat(12) + stamp + ".csv",
    // Source rows use NUMERIC(14,2), while a target's aggregate is NUMERIC(16,2).
    // Valid source amounts sum exactly to the maximum supported target total.
    data: [...Array.from({ length: 100 }, () => "999999999999.99"), "0.99"].map((amount, index) => ({
      "Customer Name": "Synthetic large money layout " + index, "Account No": "000" + stamp + index,
      "Card No": "001" + stamp + index, "TOTAL DUE": "500.00", "Billing Principal (OSP)": amount,
      DC_STS: "3", "Calling Date": "2026-08-12",
    })),
  });
  await api(superuser, "PUT", "/api/collection/source-configs/" + source.id, { validFrom: "2026-08-12", validTo: "2026-09-11", enabled: true });
  const target = (await api(superuser, "POST", prefix, { name: ("Long custom target " + "descriptive name ".repeat(9)).slice(0, 120),
    description: "Long description retained without layout clipping. ".repeat(18), assignedAdminUserId,
    sourceImportIds: [source.id], agingScope: ["D3", "D4", "D5", "D6"],
    targets: ["D3", "D4", "D5", "D6"].map((agingBucket) => ({ agingBucket, targetPercentage: "30" })) })).target;
  const page = manager.page;
  try {
    await openReport(manager);
    await page.locator("#billing-saved-target-select").selectOption(target.id);
    await page.getByRole("heading", { name: target.name, exact: true }).waitFor();
    await savePrivate(manager, "0", "100");
    await page.getByText("-RM99,999,999,999,999.99", { exact: true }).first().waitFor();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => document.documentElement.classList.toggle("dark", value === "dark"), theme);
      for (const zoom of [0.8, 1, 1.25, 1.5]) {
        await page.setViewportSize({ width: Math.round(1440 / zoom), height: Math.round(1000 / zoom) });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await page.screenshot({ path: path.join(artifactDir, `osp-large-${theme}-${zoom * 100}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(artifactDir, "osp-large-narrow.png"), fullPage: true });
    checked("maximum exact money, negative private balance and long target/source metadata remain reachable without page overflow at all zoom/theme/narrow layouts");
  } finally {
    await api(superuser, "DELETE", prefix + "/" + target.id + "?version=" + target.version);
  }
}

try {
  await mkdir(artifactDir, { recursive: true });
  browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  if (restartCheck) {
    phase = "fresh login after actual server restart";
    const { targetId, revisionPath } = JSON.parse(await readFile(path.join(artifactDir, "osp-v3-restart-fixture.json"), "utf8"));
    for (const [label, targetPct, resultPct] of [["superuser", "25.0000", "20.0000"], ["manager", "35.0000", "28.0000"], ["otherAdmin", "32.0000", "0.0000"]]) {
      const actor = await login(label);
      await openReport(actor, targetId);
      const response = await api(actor, "GET", revisionPath + "/overview?asOf=2026-08-12");
      assert.equal(response.target.id, targetId);
      assert.equal(response.clientResult.rows[0].targetPercentage, targetPct);
      assert.equal(response.clientResult.rows[0].resultPercentage, resultPct);
      assert.equal(response.systemResult.rows[0].targetPercentage, "32.0000");
      assert.equal(response.clientResult.all.receivedDate === null, label === "otherAdmin");
      assert.equal(await actor.page.getByLabel("D3 private target percentage").inputValue(), targetPct);
    }
    const formerAdmin = await login("admin");
    await api(formerAdmin, "GET", revisionPath + "/overview", undefined, 404);
    checked("actual server restart and fresh logins preserve private owners, shared percentages, assignment and old-admin revocation");
    phase = "retrospective payment after actual server restart";
    await verifyBillingOspRetrospectiveRestart({ api, manager: actors.find((actor) => actor.label === "manager"), openReport, artifactDir, checked });
    phase = "repeated full workspace resource cycles";
    await verifyWorkspaceResourceCycles(actors.find((actor) => actor.label === "superuser"), actors.find((actor) => actor.label === "manager"), targetId);
    phase = "long metadata and maximum exact signed money layouts";
    const assignedAdminUserId = (await api(actors.find((actor) => actor.label === "superuser"), "GET", prefix + "/" + targetId)).target.assignedAdminUserId;
    await verifyLongMetadataAndLargeMoney(actors.find((actor) => actor.label === "superuser"), actors.find((actor) => actor.label === "manager"), assignedAdminUserId);
    phase = "owner-bound export after authenticated cookie replacement";
    await verifyExportOwnerSwitch(actors.find((actor) => actor.label === "superuser"), actors.find((actor) => actor.label === "manager"), targetId);
  } else {
  phase = "real staff sessions and synthetic closed accounts";
  const superuser = await login("superuser");
  const admin = await login("admin");
  const manager = await login("manager");
  const otherAdmin = await login("otherAdmin");
  const stamp = String(Date.now());
  const nickname = (await api(superuser, "POST", "/api/collection/nicknames", { nickname: "OSP QA " + stamp, roleScope: "both" })).nickname.nickname;
  const data = Array.from({ length: 12 }, (_, i) => ({
    "Customer Name": "QA full customer " + i, "Account No": "000" + stamp + String(i).padStart(2, "0"),
    "Card No": "001" + stamp + String(i).padStart(2, "0"), "IC Number": "000101" + String(i).padStart(6, "0"),
    "Customer Phone Number": "012345" + String(i).padStart(4, "0"),
    "TOTAL DUE": "500.00", "Billing Principal (OSP)": "1000.00", DC_STS: i < 11 ? "3" : "4", "Calling Date": "2026-08-12",
  }));
  const source = await api(superuser, "POST", "/api/imports", { name: "V3 synthetic source " + stamp, filename: "v3-" + stamp + ".csv", data });
  await api(superuser, "PUT", "/api/collection/source-configs/" + source.id, { validFrom: "2026-08-12", validTo: "2026-09-11", enabled: true });
  for (const [index, row] of data.entries()) {
    for (const [part, amount] of ["100.00", "400.00"].entries()) {
      await api(superuser, "POST", "/api/collection", {
        customerName: row["Customer Name"], accountNumber: row["Account No"], cardNumber: row["Card No"],
        icNumber: row["IC Number"], customerPhone: row["Customer Phone Number"], sourceImportId: source.id,
        agingBucket: index < 11 ? "D3" : "D4", batch: "P10", paymentDate: part === 0 ? "2026-08-19" : "2026-08-20",
        amount, collectionStaffNickname: nickname,
      });
    }
  }
  const targets = ["D3", "D4", "D5", "D6"].map((agingBucket) => ({ agingBucket, targetPercentage: "30" }));
  let target = (await api(superuser, "POST", prefix, { name: "V3 browser target " + stamp, assignedAdminUserId: admin.user.id,
    sourceImportIds: [source.id], agingScope: ["D3", "D4", "D5", "D6"], targets })).target;
  const revisionPath = prefix + "/" + target.id + "/revisions/" + target.activeRevision.id;
  for (const actor of [superuser, manager, admin]) await openReport(actor);
  assert.equal((await api(otherAdmin, "GET", prefix)).targets.length, 0);
  for (const suffix of ["/overview", "/calendar", "/drilldown", "/export?format=json"]) await api(otherAdmin, "GET", revisionPath + suffix, undefined, 404);
  checked("stable assigned-admin scope and real manager/superuser sessions; unrelated admin cannot enumerate/read/calendar/detail/export");

  phase = "private percentages for three owners and shared edits";
  await savePrivate(superuser, "25", "20"); await savePrivate(manager, "35", "28"); await savePrivate(admin, "40", "30");
  for (const [actor, targetPct, resultPct] of [[superuser, "25.0000", "20.0000"], [manager, "35.0000", "28.0000"], [admin, "40.0000", "30.0000"]]) {
    const response = await api(actor, "GET", revisionPath + "/overview?asOf=2026-08-12");
    assert.equal(response.clientResult.rows[0].targetPercentage, targetPct);
    assert.equal(response.clientResult.rows[0].resultPercentage, resultPct);
  }
  await api(admin, "PUT", revisionPath + "/client-results", { ownerUserId: superuser.user.id, rows: [] }, 400);
  for (const actor of [admin, manager]) {
    await api(actor, "PATCH", prefix + "/" + target.id, { name: "forged", version: target.version }, 403);
    assert.equal(await actor.page.getByRole("button", { name: "Edit Target", exact: true }).count(), 0);
  }
  target = (await api(superuser, "PATCH", prefix + "/" + target.id, { version: target.version, targets: targets.map((row) => ({ ...row, targetPercentage: "32" })) })).target;
  for (const [actor, value] of [[superuser, "25.0000"], [manager, "35.0000"], [admin, "40.0000"]]) {
    await openReport(actor); assert.equal(await actor.page.getByLabel("D3 private target percentage").inputValue(), value);
  }
  checked("three owners persist independent Target/Result percentages; early System date and shared 30→32 edit do not rewrite B; owner/shared-write forgery denied");

  phase = "exact-day full PII pages and calendar reconciliation";
  const calendar = await api(admin, "GET", revisionPath + "/calendar?asOf=2026-08-12&from=2026-08-12&to=2026-08-12");
  assert.equal(calendar.days.length, 31); assert.equal(calendar.days[0].date, "2026-08-12"); assert.equal(calendar.days.at(-1).date, "2026-09-11");
  const closed = calendar.days.find((day) => day.date === "2026-08-20");
  assert.equal(closed.systemDailyAccounts, 12); assert.equal(closed.systemOspClosedToday, "12000.00");
  currentPage = admin.page;
  await admin.page.getByRole("button", { name: /^2026-08-20, 12 accounts/ }).click();
  const dialog = admin.page.getByRole("dialog");
  const detailTable = dialog.getByRole("table", { name: "Accounts closed on selected day" });
  await detailTable.waitFor();
  assert.equal(await detailTable.locator("tbody tr").count(), 10);
  const stickyHeader = await detailTable.evaluate((table) => {
    const scroll = table.parentElement;
    scroll.scrollTop = 160;
    const top = scroll.getBoundingClientRect().top;
    const headerTop = table.querySelector("thead").getBoundingClientRect().top;
    const result = { scrollTop: scroll.scrollTop, offset: Math.abs(headerTop - top) };
    scroll.scrollTop = 0;
    return result;
  });
  assert(stickyHeader.scrollTop > 0 && stickyHeader.offset <= 2, `The account header remains visible inside its own vertical/horizontal scroll region: ${JSON.stringify(stickyHeader)}`);
  const pageOneAccounts = await detailTable.locator("tbody tr td:nth-child(2)").allTextContents();
  for (const cell of [data[0]["Customer Name"], data[0]["Account No"], data[0]["Card No"], data[0]["IC Number"], data[0]["Customer Phone Number"]]) await dialog.getByText(cell, { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Next accounts", exact: true }).click();
  await dialog.getByText("Page 2 of 2 · 10 per page", { exact: true }).waitFor();
  assert.equal(await detailTable.locator("tbody tr").count(), 2);
  const pageTwoAccounts = await detailTable.locator("tbody tr td:nth-child(2)").allTextContents();
  assert.equal(new Set([...pageOneAccounts, ...pageTwoAccounts]).size, 12);
  await dialog.getByRole("tab", { name: "D3", exact: true }).click();
  await dialog.getByText("11 accounts", { exact: true }).waitFor();
  await dialog.getByText("Page 1 of 2 · 10 per page", { exact: true }).waitFor();
  await dialog.getByRole("tab", { name: "D6", exact: true }).click();
  await dialog.getByText("No D6 accounts closed on this date.", { exact: true }).waitFor();
  await admin.page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  checked("31-day source-validity calendar; 12 logical closures reconcile exact-day 10/2 SQL pages, full leading-zero PII, ALL/D3/D6 tabs");

  phase = "fresh owner-private Excel, PNG and PDF browser downloads";
  for (const [actor, targetPercent, resultPercent] of [[superuser, "25.0000", "20.0000"], [manager, "35.0000", "28.0000"], [admin, "40.0000", "30.0000"]]) {
    currentPage = actor.page;
    await verifyPrivateExports(actor, targetPercent, resultPercent);
  }
  checked("real XLSX/PNG/PDF downloads contain each of three authenticated owners' own private percentages, fresh visual data and no standalone accounts");

  phase = "light/dark effective zoom and repeated dialog cleanup";
  for (const theme of ["light", "dark"]) {
    await admin.page.evaluate((value) => document.documentElement.classList.toggle("dark", value === "dark"), theme);
    for (const zoom of [0.8, 1, 1.25, 1.5]) {
      // Browser zoom changes CSS viewport size at a fixed physical viewport.
      await admin.page.setViewportSize({ width: Math.round(1440 / zoom), height: Math.round(1000 / zoom) });
      assert(await admin.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Billing page must not overflow the viewport.");
      await admin.page.screenshot({ path: path.join(artifactDir, `osp-${theme}-${zoom * 100}.png`), fullPage: true });
    }
  }
  await admin.page.setViewportSize({ width: 390, height: 844 });
  assert(await admin.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await admin.page.screenshot({ path: path.join(artifactDir, "osp-narrow.png"), fullPage: true });
  await admin.page.setViewportSize({ width: 1440, height: 1000 });
  const cdp = await admin.context.newCDPSession(admin.page);
  await cdp.send("HeapProfiler.collectGarbage");
  const baseline = await cdp.send("Memory.getDOMCounters");
  for (let i = 0; i < 8; i += 1) {
    await admin.page.getByRole("button", { name: /^2026-08-20, 12 accounts/ }).click();
    await detailTable.waitFor();
    await admin.page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  }
  await cdp.send("HeapProfiler.collectGarbage"); const after = await cdp.send("Memory.getDOMCounters"); await cdp.detach();
  assert(after.nodes < baseline.nodes + 1500, "Repeated detail open/close must not retain account DOM subtrees.");
  assert(after.jsEventListeners < baseline.jsEventListeners + 200, "Repeated dialogs must release their listeners.");
  assert.equal(await admin.page.getByText(data[0]["Account No"], { exact: true }).count(), 0);
  checked("light/dark 80/100/125/150% effective viewports and narrow layout; repeated dialogs release account DOM/listeners and clear PII");

  phase = "reassignment clears old admin and does not transfer private B";
  target = (await api(superuser, "PATCH", prefix + "/" + target.id, { version: target.version, assignedAdminUserId: otherAdmin.user.id })).target;
  await admin.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await admin.page.getByRole("table", { name: "Table B Client Billing Principal result" }).waitFor({ state: "hidden" });
  await api(admin, "GET", revisionPath + "/overview", undefined, 404);
  await openReport(otherAdmin);
  await otherAdmin.page.getByText("Unsaved — defaults from TABLE A", { exact: true }).waitFor();
  assert.equal(await otherAdmin.page.getByLabel("D3 private target percentage").inputValue(), "32.0000");
  const user = await login("user");
  await api(user, "GET", prefix, undefined, 403);
  await user.page.goto(baseUrl + "/collection/billing-principal", { waitUntil: "domcontentloaded" });
  assert.equal(await user.page.getByRole("table", { name: "Table B Client Billing Principal result" }).count(), 0);
  checked("reassignment revokes old-admin open private UI and denies reads; new admin gets UNSAVED defaults, never prior owner values; ordinary user forbidden");
  phase = "exact retrospective Payment Date and live source validity lifecycle";
  await runBillingOspRetrospectiveQa({ api, superuser, manager, admin, otherAdmin, user, openReport, savePrivate, artifactDir, checked });
  await writeFile(path.join(artifactDir, "osp-v3-restart-fixture.json"), JSON.stringify({ targetId: target.id, revisionPath }));
  }
  assert.deepEqual(pageErrors, []);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(artifactDir, "osp-v3-failure.png"), fullPage: true }).catch(() => undefined);
  console.error(`[billing-osp-v3] failed during ${phase}: ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  // Close authenticated sessions normally before testing a fresh login after
  // restart; merely closing Chrome must not bypass the single-session guard.
  for (const actor of actors) await api(actor, "POST", "/api/activity/logout", {}).catch(() => undefined);
  await writeFile(path.join(artifactDir, restartCheck ? "osp-v3-restart-results.json" : "osp-v3-results.json"), JSON.stringify({ phase, checks, pageErrors, success: process.exitCode !== 1 }, null, 2));
  for (const context of contexts) await context.close().catch(() => undefined);
  await browser?.close();
}
