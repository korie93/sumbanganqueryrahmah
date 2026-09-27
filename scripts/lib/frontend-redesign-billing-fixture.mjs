import assert from "node:assert/strict";
import { lstat, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { validateRedesignSeedEnvironment } from "../fixtures/frontend-redesign-seed.mjs";

const targetPrefix = "/api/collection/report/billing-principal/saved-targets";
const agingScope = ["D3", "D4", "D5", "D6"];

// This helper is opt-in, called once after a real superuser login by the isolated
// runner. Its only SQL is read-only provenance verification. All synthetic writes
// use the real authenticated API, with shared-target creation through the UI.
export function validateRedesignBillingEnvironment(env, baseUrl, tempParent = os.tmpdir()) {
  const fixture = validateRedesignSeedEnvironment(env, tempParent);
  const url = new URL(baseUrl);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.origin, baseUrl);
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  assert.equal(env.PUBLIC_APP_URL, baseUrl);
  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.PORT, url.port);
  assert.notEqual(env.PORT, env.PG_PORT);
  assert.match(env.SEED_ADMIN_USERNAME || "", /^designadmin[a-f0-9]{12}$/);
  return fixture;
}

export function buildRedesignBillingPlan() {
  const rows = ["1000.00", "2000.00", "3000.00", "4000.00", "500.00"].map((osp, index) => ({
    "Customer Name": `Synthetic Design Billing Customer ${index + 1}`,
    "Account No": `000088000000000${index + 1}`,
    "Card No": `000099000000000${index + 1}`,
    "IC Number": `99010101000${index + 1}`,
    "Customer Phone Number": `0199900000${index + 1}`,
    "TOTAL DUE": "500.00", "Billing Principal (OSP)": osp,
    DC_STS: String(index < 4 ? index + 3 : 3), "Calling Date": "2026-08-01",
  }));
  return {
    nickname: "Design Billing Collector", targetName: "Synthetic Design Billing August 2026",
    from: "2026-08-01", to: "2026-08-31", year: 2026, month: 8,
    sources: [
      { name: "Synthetic Design Billing Source A", filename: "design-billing-source-a.csv", data: [rows[0], rows[1], rows[4]] },
      { name: "Synthetic Design Billing Source B", filename: "design-billing-source-b.csv", data: [rows[2], rows[3]] },
    ],
    payments: rows.map((row, index) => ({ row, amount: index < 4 ? "500.00" : "100.00", paymentDate: index < 2 ? "2026-08-20" : "2026-08-21" })),
  };
}

async function verifyFreshFixture(env, baseUrl) {
  const tempParent = await realpath(os.tmpdir());
  const { dataDir, fixtureRoot } = validateRedesignBillingEnvironment(env, baseUrl, tempParent);
  for (const directory of [fixtureRoot, dataDir]) {
    const state = await lstat(directory);
    assert.equal(state.isDirectory(), true);
    assert.equal(state.isSymbolicLink(), false);
    assert.equal(await realpath(directory), path.resolve(directory));
  }
  const connection = new pg.Client({ host: "127.0.0.1", port: Number(env.PG_PORT), user: "sqr_fixture",
    password: env.PG_PASSWORD, database: "sqr_collection_card_test", ssl: false, connectionTimeoutMillis: 3_000 });
  try {
    await connection.connect();
    const cluster = await connection.query("SHOW data_directory");
    assert.equal(await realpath(cluster.rows[0].data_directory), await realpath(dataDir));
    const identity = await connection.query("SELECT current_database() AS database, current_user AS username");
    assert.deepEqual(identity.rows[0], { database: "sqr_collection_card_test", username: "sqr_fixture" });
    const accounts = await connection.query("SELECT id,username,role FROM users WHERE username=ANY($1::text[])", [[env.SEED_SUPERUSER_USERNAME, env.SEED_ADMIN_USERNAME]]);
    const owner = accounts.rows.find((user) => user.username === env.SEED_SUPERUSER_USERNAME);
    const admin = accounts.rows.find((user) => user.username === env.SEED_ADMIN_USERNAME);
    assert.equal(owner?.role, "superuser");
    assert.equal(admin?.role, "admin");
    const records = await connection.query("SELECT count(*)::int AS count FROM collection_records WHERE created_by_login=$1 AND collection_staff_nickname='Fixture Collector'", [owner.username]);
    assert.equal(records.rows[0].count, 59);
    const targets = await connection.query("SELECT count(*)::int AS count FROM collection_osp_saved_targets");
    assert.equal(targets.rows[0].count, 0, "Billing supplement requires a fresh target table");
    const nickname = await connection.query("SELECT count(*)::int AS count FROM collection_staff_nicknames WHERE nickname='Design Billing Collector'");
    assert.equal(nickname.rows[0].count, 0, "Billing supplement may run only once");
    return { owner, admin };
  } finally { await connection.end(); }
}

export async function prepareRedesignBillingFixture({ page, baseUrl, env }) {
  const { owner, admin } = await verifyFreshFixture(env, baseUrl);
  assert.equal(new URL(page.url()).origin, baseUrl);
  const api = async (method, endpoint, body) => {
    assert.ok(endpoint.startsWith("/api/") && !endpoint.startsWith("//"));
    for (let attempt = 0; ; attempt++) {
      const response = await page.evaluate(async ({ method, endpoint, body, origin }) => {
        if (location.origin !== origin) throw new Error("Fixture origin changed");
        const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("sqr_csrf="))?.slice("sqr_csrf=".length);
        const result = await fetch(endpoint, { method, credentials: "include", redirect: "error", signal: AbortSignal.timeout(30_000),
          headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: result.status, retryAfter: result.headers.get("retry-after"), payload: await result.json() };
      }, { method, endpoint, body, origin: baseUrl });
      if (response.status === 429 && attempt < 2) {
        const seconds = Number(response.retryAfter || 12);
        assert.ok(Number.isFinite(seconds) && seconds > 0 && seconds <= 30, "Fixture rate window exceeds bounded retry");
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        continue;
      }
      assert.equal(response.status, 200, `Synthetic fixture ${method} ${endpoint.split("?")[0]} failed`);
      return response.payload;
    }
  };
  const session = await api("GET", "/api/me");
  assert.equal(session.user?.id, owner.id);
  assert.equal(session.user?.role, "superuser");
  const plan = buildRedesignBillingPlan();
  const createdNickname = (await api("POST", "/api/collection/nicknames", { nickname: plan.nickname, roleScope: "both" })).nickname;
  assert.equal(createdNickname.nickname, plan.nickname);
  const assignmentsUrl = `/api/collection/nickname-assignments/${encodeURIComponent(admin.id)}`;
  const assignments = await api("GET", assignmentsUrl);
  await api("PUT", assignmentsUrl, { nicknameIds: [...new Set([...assignments.nicknameIds, createdNickname.id])] });
  const sources = [];
  for (const source of plan.sources) {
    const saved = await api("POST", "/api/imports", source);
    assert.ok(saved.id);
    sources.push({ ...source, id: saved.id });
    await api("PUT", `/api/collection/source-configs/${encodeURIComponent(saved.id)}`, { validFrom: plan.from, validTo: plan.to, enabled: true });
  }
  for (const payment of plan.payments) {
    const row = payment.row;
    const source = sources.find((entry) => entry.data.includes(row));
    assert.ok(source);
    const result = await api("POST", "/api/collection", {
      customerName: row["Customer Name"], accountNumber: row["Account No"], cardNumber: row["Card No"],
      icNumber: row["IC Number"], customerPhone: row["Customer Phone Number"], sourceImportId: source.id,
      agingBucket: `D${row.DC_STS}`, batch: "P10", paymentDate: payment.paymentDate,
      amount: payment.amount, collectionStaffNickname: plan.nickname,
    });
    assert.equal(result.record?.paymentDate, payment.paymentDate);
  }
  await api("PUT", "/api/collection/daily/target", { username: plan.nickname, year: plan.year, month: plan.month, monthlyTarget: 10000 });
  await api("PUT", "/api/collection/daily/calendar", { username: plan.nickname, year: plan.year, month: plan.month, days: [
    { day: 20, status: "WORKING", isWorkingDay: true, isHoliday: false },
    { day: 22, status: "HOLIDAY", leaveType: "AL", note: "Synthetic annual leave", isWorkingDay: false, isHoliday: true },
    { day: 24, status: "HOLIDAY", leaveType: "OFF", note: "Synthetic office closed", isWorkingDay: false, isHoliday: true },
  ] });
  await page.goto(`${baseUrl}/collection/billing-principal`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create Target", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create Billing OSP target", exact: true });
  await dialog.getByLabel("Search admin accounts").fill(admin.username);
  await dialog.locator("#osp-assigned-admin").selectOption(admin.id);
  for (const source of sources) {
    await dialog.getByLabel("Search configured sources").fill(source.filename);
    const preview = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `${targetPrefix}/preview`);
    await dialog.locator("#osp-configured-source").selectOption(source.id);
    assert.equal((await preview).status(), 200, "Real configured source preview must succeed");
    await dialog.getByRole("table", { name: "Shared target baseline preview", exact: true }).waitFor();
  }
  for (const aging of agingScope) await dialog.getByLabel(`${aging} shared target percentage`).fill("30");
  await dialog.getByLabel("4. Target name", { exact: true }).fill(plan.targetName);
  const createdResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === targetPrefix);
  await dialog.getByRole("button", { name: "Save Target", exact: true }).click();
  const created = await createdResponse;
  assert.equal(created.status(), 200, "Real Create Target must succeed");
  const { target } = await created.json();
  assert.equal(target.assignedAdminUserId, admin.id);
  assert.deepEqual([...target.activeRevision.sourceImportIds].sort(), sources.map((source) => source.id).sort());
  const revisionPath = `${targetPrefix}/${encodeURIComponent(target.id)}/revisions/${encodeURIComponent(target.activeRevision.id)}`;
  await api("PUT", `${revisionPath}/client-results`, { rows: agingScope.map((aging) => ({ aging, targetPercentage: "25", resultPercentage: "20" })) });
  const overview = await api("GET", `${revisionPath}/overview?asOf=${plan.to}`);
  assert.equal(overview.systemResult.all.totalOsp, "10500.00");
  assert.equal(overview.systemResult.all.ospClosed, "10000.00");
  assert.equal(overview.systemResult.all.closedAccountCount, 4);
  assert.equal(overview.clientResult.all.ospClosed, "2100.00");
  const calendar = await api("GET", `${revisionPath}/calendar`);
  assert.equal(calendar.days.length, 31);
  assert.equal(calendar.days.find((day) => day.date === "2026-08-20").systemOspClosedToday, "3000.00");
  assert.equal(calendar.days.find((day) => day.date === "2026-08-21").systemOspClosedToday, "7000.00");
  const daily = await api("GET", `/api/collection/daily/overview?year=2026&month=8&username=${encodeURIComponent(plan.nickname)}`);
  assert.equal(Number(daily.summary.monthlyTarget), 10000);
  assert.equal(Number(daily.summary.collectedToDate), 2100);
  return { targetId: target.id, revisionId: target.activeRevision.id, assignedAdminId: admin.id,
    nickname: plan.nickname, targetName: plan.targetName, from: plan.from, to: plan.to,
    year: plan.year, month: plan.month, sourceIds: sources.map((source) => source.id),
    evidence: { realCreateTarget: true, sourceCount: 2, collections: 5, closedAccounts: 4, systemOspClosed: "10000.00", privateOspClosed: "2100.00", dailyCollected: 2100 } };
}
