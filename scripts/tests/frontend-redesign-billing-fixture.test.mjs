import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRedesignBillingPlan, validateRedesignBillingEnvironment } from "../lib/frontend-redesign-billing-fixture.mjs";

const source = readFileSync(new URL("../lib/frontend-redesign-billing-fixture.mjs", import.meta.url), "utf8");
const tempParent = path.resolve(os.tmpdir());
const baseUrl = "http://127.0.0.1:54321";
const env = {
  SQR_REDESIGN_ISOLATED_CLUSTER: "1", PG_HOST: "127.0.0.1", PG_DATABASE: "sqr_collection_card_test",
  PG_USER: "sqr_fixture", PG_PORT: "54320", SEED_SUPERUSER_USERNAME: "collectioncardfixture123456abcdef",
  SEED_ADMIN_USERNAME: "designadmin123456abcdef", HOST: "127.0.0.1", PORT: "54321", PUBLIC_APP_URL: baseUrl,
  SQR_REDESIGN_DATA_DIR: path.join(tempParent, "sqr-collection-card-no-Ab12Cd", "postgres"),
};

test("billing supplement accepts only the exact freshly-owned loopback environment", () => {
  assert.equal(validateRedesignBillingEnvironment(env, baseUrl, tempParent).dataDir, env.SQR_REDESIGN_DATA_DIR);
  for (const changed of [
    { SQR_REDESIGN_ISOLATED_CLUSTER: "0" }, { PG_HOST: "localhost" }, { PG_DATABASE: "sqr_db" },
    { DATABASE_URL: "postgresql://127.0.0.1/existing" }, { PG_USER: "postgres" },
    { SEED_SUPERUSER_USERNAME: "real-user" }, { SEED_ADMIN_USERNAME: "admin" },
    { HOST: "0.0.0.0" }, { PORT: "54320" }, { PUBLIC_APP_URL: "https://production.example" },
    { SQR_REDESIGN_DATA_DIR: tempParent },
  ]) assert.throws(() => validateRedesignBillingEnvironment({ ...env, ...changed }, baseUrl, tempParent));
  for (const url of ["http://localhost:54321", "https://127.0.0.1:54321", "http://127.0.0.1:54321/path", "http://real.example", "http://x:y@127.0.0.1:54321"]) {
    assert.throws(() => validateRedesignBillingEnvironment({ ...env, PUBLIC_APP_URL: url }, url, tempParent));
  }
});

test("billing fixture uses two synthetic sources, all four agings and exact string identifiers", () => {
  const plan = buildRedesignBillingPlan();
  assert.equal(plan.sources.length, 2);
  assert.equal(plan.payments.length, 5);
  const rows = plan.sources.flatMap((entry) => entry.data);
  assert.equal(new Set(rows.map((row) => row["Account No"])).size, 5);
  assert.deepEqual([...new Set(rows.map((row) => row.DC_STS))], ["3", "4", "5", "6"]);
  for (const row of rows) {
    for (const field of ["Account No", "Card No", "IC Number", "Customer Phone Number"]) assert.equal(typeof row[field], "string");
    assert.match(row["Account No"], /^0000/);
    assert.match(row["Card No"], /^0000/);
    assert.equal(row["TOTAL DUE"], "500.00");
    assert.equal(row["Calling Date"], plan.from);
  }
  for (const payment of plan.payments) assert.equal(rows.includes(payment.row), true);
  assert.deepEqual(plan.payments.map((payment) => payment.amount), ["500.00", "500.00", "500.00", "500.00", "100.00"]);
  assert.equal(plan.payments.reduce((sum, item) => sum + Number(item.amount), 0), 2100);
});

test("billing supplement does not change the September59-record fixture or fake canonical calculations", () => {
  const plan = buildRedesignBillingPlan();
  assert.equal(plan.year, 2026);
  assert.equal(plan.month, 8);
  assert.equal(plan.from, "2026-08-01");
  assert.equal(plan.to, "2026-08-31");
  assert.equal(plan.nickname, "Design Billing Collector");
  assert.ok(plan.payments.every((payment) => payment.paymentDate.startsWith("2026-08-")));
  assert.doesNotMatch(source, /INSERT INTO|UPDATE public|UPDATE collection|DELETE FROM|route\.fulfill|dotenv|process\.env/);
  assert.match(source, /await api\("POST", "\/api\/collection",/);
  assert.match(source, /overview\.systemResult\.all\.ospClosed, "10000\.00"/);
  assert.match(source, /overview\.clientResult\.all\.ospClosed, "2100\.00"/);
  assert.match(source, /Number\(daily\.summary\.collectedToDate\), 2100/);
});

test("actual cluster, account and single-run provenance are verified before authenticated writes", () => {
  assert.match(source, /SHOW data_directory/);
  assert.match(source, /state\.isSymbolicLink\(\), false/);
  assert.match(source, /SELECT current_database\(\)/);
  assert.match(source, /records\.rows\[0\]\.count, 59/);
  assert.match(source, /targets\.rows\[0\]\.count, 0/);
  assert.match(source, /nickname\.rows\[0\]\.count, 0/);
  assert.match(source, /session\.user\?\.id, owner\.id/);
  assert.ok(source.indexOf('session.user?.id, owner.id') < source.indexOf('api("POST", "/api/collection/nicknames"'));
  assert.match(source, /finally \{ await connection\.end\(\); \}/);
});

test("target creation follows the actual configured-source UI and preserves existing admin assignments", () => {
  assert.match(source, /\.\.\.assignments\.nicknameIds, createdNickname\.id/);
  assert.match(source, /#osp-assigned-admin"\)\.selectOption\(admin\.id\)/);
  assert.match(source, /#osp-configured-source"\)\.selectOption\(source\.id\)/);
  assert.match(source, /Shared target baseline preview/);
  assert.match(source, /Save Target.*\.click\(\)/);
  assert.match(source, /target\.assignedAdminUserId, admin\.id/);
  assert.match(source, /target\.activeRevision\.sourceImportIds/);
  assert.doesNotMatch(source, /api\("POST", targetPrefix/);
  assert.match(source, /redirect: "error"/);
  assert.match(source, /"X-CSRF-Token"/);
  assert.match(source, /response\.status === 429 && attempt < 2/);
});
