import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { buildPostgresPoolConfig } from "./postgres-preflight.mjs";

const prefix = "/api/collection/report/billing-principal/saved-targets";
const from = "2026-08-12";
const to = "2026-09-10";
const paymentDate = "2026-08-27";
const fixtureName = "osp-retrospective-restart-fixture.json";

function disposablePool() {
  const database = process.env.COLLECTION_SAVE_ACCESS_QA_DATABASE || "";
  assert(/^sqr_save_access_[0-9]+_[a-f0-9]{6}$/.test(database));
  assert.equal(process.env.PG_DATABASE, database);
  const config = buildPostgresPoolConfig(process.env);
  if (config.connectionString) {
    const url = new URL(config.connectionString);
    assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    assert.equal(decodeURIComponent(url.pathname.slice(1)), database);
  } else {
    assert(["localhost", "127.0.0.1", "::1"].includes(config.host));
    assert.equal(config.database, database);
  }
  return new pg.Pool({ ...config, max: 1 });
}

async function waitForBusinessState(read, assertState) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const value = await read();
    try { assertState(value); return value; } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function assertRetrospectiveReport({ api, actor, fixture }) {
  const route = fixture.revisionPath;
  for (const [asOf, amount] of [["2026-08-26", "0.00"], [paymentDate, "1000.00"], ["2026-09-01", "1000.00"], ["2026-09-06", "1000.00"], [to, "1000.00"]]) {
    const overview = await api(actor, "GET", `${route}/overview?asOf=${asOf}`);
    assert.equal(overview.systemResult.all.ospClosed, amount, `Retrospective System Result at ${asOf}`);
    assert.equal(overview.systemResult.all.closedAccountCount, amount === "0.00" ? 0 : 1);
    assert.equal(overview.systemResult.all.balanceOsp, amount === "0.00" ? "900.00" : "-100.00", "Table A remains target minus closed, never TT OSP minus closed");
  }
  const calendar = await api(actor, "GET", `${route}/calendar?from=${from}&to=${to}`);
  assert.equal(calendar.days.length, 30);
  assert.equal(calendar.days[0].date, from);
  assert.equal(calendar.days.at(-1).date, to);
  assert.equal(calendar.days[0].systemDailyAccounts, 0);
  assert.equal(calendar.days.find((day) => day.date === paymentDate).systemOspClosedToday, "1000.00");
  assert.equal(calendar.days.find((day) => day.date === "2026-09-06").systemOspClosedToday, "0.00");
  const drilldown = await api(actor, "GET", `${route}/drilldown?asOf=${to}&date=${paymentDate}&pageSize=10`);
  assert.equal(drilldown.items.length, 1, "CP-only account is not an OSP closure");
  assert.equal(drilldown.items[0].paymentDate, paymentDate);
  assert.equal(drilldown.items[0].effectiveClosedDate, paymentDate);
  assert.equal(drilldown.items[0].classification, "ABORT_CP");
  const exported = await api(actor, "GET", `${route}/export?format=json&asOf=${paymentDate}&from=${from}&to=${to}`);
  assert.equal(exported.overview.systemResult.all.ospClosed, "1000.00");
  assert.equal(exported.calendar.find((day) => day.date === paymentDate).systemDailyAccounts, 1);
  assert.equal(exported.overview.revision.reportingWindow.from, from);
  assert.equal(exported.overview.revision.reportingWindow.to, to);
  assert.equal(exported.generatedByUserId, actor.user.id);
  for (const suffix of ["/overview?asOf=2026-08-11", "/overview?asOf=2026-09-11", "/overview?asOf=2026-02-30", "/drilldown?date=2026-08-11", "/calendar?from=2026-08-11&to=2026-09-10", "/export?format=json&asOf=2026-09-11"]) {
    await api(actor, "GET", route + suffix, undefined, 400);
  }
}

async function assertPersistedPaymentAndRollup(pool, fixture) {
  const record = await pool.query("SELECT payment_date::text, created_at::date::text AS audit_date FROM public.collection_records WHERE id = $1 AND source_import_id = $2", [fixture.recordId, fixture.sourceId]);
  assert.equal(record.rows[0]?.payment_date, paymentDate);
  assert.equal(record.rows[0]?.audit_date, "2026-09-06");
  await waitForBusinessState(() => pool.query("SELECT payment_date::text, total_records, total_amount::text FROM public.collection_record_daily_rollups WHERE collection_staff_nickname = $1 ORDER BY payment_date", ["SW.ABU_324"]), (result) => {
    assert.deepEqual(result.rows.map((row) => row.payment_date), [paymentDate]);
    assert.equal(result.rows[0].total_records, 2);
    assert.equal(result.rows[0].total_amount, "550.00");
  });
  await waitForBusinessState(() => pool.query("SELECT year, month, total_records, total_amount::text FROM public.collection_record_monthly_rollups WHERE collection_staff_nickname = $1 ORDER BY year, month", ["SW.ABU_324"]), (result) => {
    assert.deepEqual(result.rows, [{ year: 2026, month: 8, total_records: 2, total_amount: "550.00" }]);
  });
}

async function verifyDirtyOwnerSwitch({ api, manager, superuser, fixture, openReport }) {
  const page = manager.page;
  const originalCookies = await manager.context.cookies();
  const replacementCookies = await superuser.context.cookies();
  const before = await api(superuser, "GET", fixture.revisionPath + "/overview");
  for (const action of ["focus", "save"]) {
    await openReport(manager, fixture.targetId);
    await page.getByLabel("D3 private target percentage").fill("36");
    let privateWrites = 0;
    const observe = (request) => { if (request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/client-results")) privateWrites += 1; };
    page.on("request", observe);
    try {
      await manager.context.clearCookies();
      await manager.context.addCookies(replacementCookies);
      if (action === "focus") await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      else await page.getByRole("button", { name: "Save Client Result", exact: true }).click();
      await page.getByRole("table", { name: "Table B Client Billing Principal result" }).waitFor({ state: "hidden" });
      assert.equal(privateWrites, 0, `An owner switch during ${action} clears A's draft before any write as B`);
      const after = await api(superuser, "GET", fixture.revisionPath + "/overview");
      assert.deepEqual(after.clientResult, before.clientResult);
    } finally {
      page.off("request", observe);
      await manager.context.clearCookies();
      await manager.context.addCookies(originalCookies);
    }
  }
  // The server also rejects a replacement cookie that arrives after browser
  // preflight, by checking the optional freshness header against the actor.
  await api(superuser, "PUT", fixture.revisionPath + "/client-results", { rows: ["D3", "D4", "D5", "D6"].map((aging) => ({ aging, targetPercentage: "36", resultPercentage: "0" })) }, 403, { "X-Billing-Viewer-Id": manager.user.id });
  await openReport(manager, fixture.targetId);
}

export async function runBillingOspRetrospectiveQa({ api, superuser, manager, admin, otherAdmin, user, openReport, savePrivate, artifactDir, checked }) {
  const stamp = String(Date.now());
  const nickname = (await api(superuser, "POST", "/api/collection/nicknames", { nickname: "SW.ABU_324", roleScope: "both" })).nickname.nickname;
  const rows = ["ABORT", "CP"].map((kind, index) => ({
    "Customer Name": `Synthetic retrospective ${kind} ${stamp}`, "Account No": `00${stamp}${index}`,
    "Card No": `01${stamp}${index}`, "IC Number": `000202${String(index).padStart(6, "0")}`,
    "Customer Phone Number": `012346${String(index).padStart(4, "0")}`,
    "TOTAL DUE": "500.00", "Billing Principal (OSP)": index ? "2000.00" : "1000.00",
    DC_STS: "3", "Calling Date": from,
  }));
  const source = await api(superuser, "POST", "/api/imports", { name: `Retrospective date QA ${stamp}`, filename: `retrospective-${stamp}.csv`, data: rows });
  await api(superuser, "PUT", `/api/collection/source-configs/${source.id}`, { validFrom: from, validTo: to, enabled: true });
  const records = [];
  for (const [index, row] of rows.entries()) {
    const result = await api(superuser, "POST", "/api/collection", { customerName: row["Customer Name"], accountNumber: row["Account No"], cardNumber: row["Card No"],
      icNumber: row["IC Number"], customerPhone: row["Customer Phone Number"],
      sourceImportId: source.id, agingBucket: "D3", batch: "P10", paymentDate, amount: index ? "50.00" : "500.00", collectionStaffNickname: nickname });
    assert.equal(result.record.paymentDate, paymentDate);
    records.push(result.record);
  }
  const pool = disposablePool();
  try {
    // Only these two synthetic records in the guarded, disposable QA database
    // receive the fixed audit timestamp needed to reproduce the exact example.
    // The real save API ran first, and its canonical Payment Date is untouched.
    const stamped = await pool.query("UPDATE public.collection_records SET created_at = '2026-09-06T04:00:00Z'::timestamptz WHERE id = ANY($1::uuid[]) AND source_import_id = $2 AND payment_date = $3::date RETURNING id", [records.map((record) => record.id), source.id, paymentDate]);
    assert.equal(stamped.rowCount, 2);
    const target = (await api(superuser, "POST", prefix, { name: `Retrospective target ${stamp}`, assignedAdminUserId: admin.user.id,
      sourceImportIds: [source.id], agingScope: ["D3", "D4", "D5", "D6"], targets: ["D3", "D4", "D5", "D6"].map((agingBucket) => ({ agingBucket, targetPercentage: "30" })) })).target;
    const fixture = { targetId: target.id, sourceId: source.id, recordId: records[0].id, revisionPath: `${prefix}/${target.id}/revisions/${target.activeRevision.id}` };
    await assertPersistedPaymentAndRollup(pool, fixture);
    await assertRetrospectiveReport({ api, actor: manager, fixture });
    for (const actor of [otherAdmin, user]) {
      await api(actor, "GET", fixture.revisionPath + "/overview", undefined, actor === user ? 403 : 404);
      await api(actor, "GET", fixture.revisionPath + `/drilldown?date=${paymentDate}`, undefined, actor === user ? 403 : 404);
    }
    const page = manager.page;
    await openReport(manager, target.id);
    await page.getByRole("button", { name: /^2026-08-27, 1 accounts/ }).click();
    await page.getByRole("dialog").getByRole("table", { name: "Accounts closed on selected day" }).waitFor();
    await page.getByRole("dialog").getByText(rows[0]["Account No"], { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await savePrivate(manager, "35", "20");
    const dateInput = page.locator("#billing-system-as-of");
    const selected = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/overview") && new URL(response.url()).searchParams.get("asOf") === "2026-09-08");
    await dateInput.fill("2026-09-08");
    assert.equal((await selected).status(), 200);
    await page.getByLabel("D3 private target percentage").waitFor();
    await page.locator("#billing-calendar-month").fill("2026-09");
    await page.getByLabel("D3 private target percentage").fill("36");
    assert(await page.getByRole("button", { name: "Reload Targets", exact: true }).isDisabled());
    await api(superuser, "PUT", `/api/collection/source-configs/${source.id}`, { validFrom: "2026-08-15", validTo: "2026-09-05", enabled: true });
    const changed = (await api(superuser, "GET", `${prefix}/${target.id}`)).target;
    assert.equal(changed.version, target.version);
    assert.notEqual(changed.activeRevision.reportingWindow.version, target.activeRevision.reportingWindow.version);
    assert.equal(changed.activeRevision.from, target.activeRevision.from, "Immutable saved snapshot is retained");
    const focused = page.waitForResponse((response) => new URL(response.url()).pathname === `${prefix}/${target.id}`);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    assert.equal((await focused).status(), 200);
    assert.equal(await page.getByLabel("D3 private target percentage").inputValue(), "36", "Live source edit must not erase an unsaved private draft");
    assert.equal(await dateInput.getAttribute("max"), to, "Domain adoption is deferred while the private draft is locked");
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await waitForBusinessState(() => dateInput.getAttribute("max"), (value) => assert.equal(value, "2026-09-05"));
    assert.equal(await dateInput.getAttribute("min"), "2026-08-15");
    assert.equal(await dateInput.inputValue(), "2026-09-05");
    await page.getByLabel("D3 private target percentage").waitFor();
    assert.equal(await page.getByLabel("D3 private target percentage").inputValue(), "35.0000");
    await api(manager, "GET", fixture.revisionPath + "/overview?asOf=2026-09-08", undefined, 400);
    const shorter = await api(manager, "GET", fixture.revisionPath + "/calendar");
    assert.equal(shorter.days[0].date, "2026-08-15");
    assert.equal(shorter.days.at(-1).date, "2026-09-05");
    assert.equal(shorter.days.find((day) => day.date === paymentDate).systemOspClosedToday, "1000.00");
    await api(superuser, "PUT", `/api/collection/source-configs/${source.id}`, { validFrom: from, validTo: to, enabled: true });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await waitForBusinessState(() => dateInput.getAttribute("max"), (value) => assert.equal(value, to));
    await page.getByRole("button", { name: /^2026-08-27, 1 accounts/ }).waitFor();
    await assertPersistedPaymentAndRollup(pool, fixture);
    await verifyDirtyOwnerSwitch({ api, manager, superuser, fixture, openReport });
    await writeFile(path.join(artifactDir, fixtureName), JSON.stringify(fixture));
    checked("exact Aug27 Payment Date / Sep6 audit save: historical rollup, retrospective AsOf, CP exclusion, calendar/drilldown/export, direct RBAC, same-version live validity, draft-safe clamp and real cookie owner-switch rejection before private writes");
  } finally { await pool.end(); }
}

export async function verifyBillingOspRetrospectiveRestart({ api, manager, openReport, artifactDir, checked }) {
  const fixture = JSON.parse(await readFile(path.join(artifactDir, fixtureName), "utf8"));
  const pool = disposablePool();
  try {
    await assertPersistedPaymentAndRollup(pool, fixture);
    await assertRetrospectiveReport({ api, actor: manager, fixture });
    await openReport(manager, fixture.targetId);
    await manager.page.getByRole("button", { name: /^2026-08-27, 1 accounts/ }).waitFor();
    assert.equal(await manager.page.getByLabel("D3 private target percentage").inputValue(), "35.0000");
    assert.equal(await manager.page.locator("#billing-system-as-of").getAttribute("min"), from);
    assert.equal(await manager.page.locator("#billing-system-as-of").getAttribute("max"), to);
    checked("real server restart retains exact retrospective attribution, source validity, historical rollup and actor-private percentages");
  } finally { await pool.end(); }
}
