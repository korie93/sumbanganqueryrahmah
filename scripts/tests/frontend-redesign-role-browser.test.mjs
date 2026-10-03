import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveRedesignRoleChecksEnabled, validateRedesignRoleInputs, roleNavigation } from "../frontend-redesign-role-browser.mjs";

const source = await readFile(new URL("../frontend-redesign-role-browser.mjs", import.meta.url), "utf8");
const runner = await readFile(new URL("../test-frontend-redesign-isolated.mjs", import.meta.url), "utf8");
const inputs = () => ({ baseUrl: "http://127.0.0.1:32123", prepareBillingFixture() {}, widths: [1440, 390], themes: ["light", "dark"], accounts: Object.fromEntries([["superuser", "collectioncardfixture"], ["admin", "designadmin"], ["user", "designuser"]].map(([role, prefix]) => [role, { username: `${prefix}abcdef123456`, password: `Fixture9!${"a".repeat(32)}` }])) });

test("role checks are strictly opt-in and reject remote or arbitrary account inputs", () => {
  for (const value of [undefined, "", "0"]) assert.equal(resolveRedesignRoleChecksEnabled({ SQR_REDESIGN_ROLE_CHECKS: value }), false);
  assert.equal(resolveRedesignRoleChecksEnabled({ SQR_REDESIGN_ROLE_CHECKS: "1" }), true);
  for (const value of [1, true, "yes", " 1"]) assert.throws(() => resolveRedesignRoleChecksEnabled({ SQR_REDESIGN_ROLE_CHECKS: value }));
  assert.doesNotThrow(() => validateRedesignRoleInputs(inputs()));
  for (const changed of [{ baseUrl: "https://production.example" }, { baseUrl: "http://127.0.0.1:32123/path" }, { prepareBillingFixture: undefined }, { widths: [319] }, { themes: ["auto"] }, { accounts: { ...inputs().accounts, admin: { username: "real-admin", password: "secret" } } }]) assert.throws(() => validateRedesignRoleInputs({ ...inputs(), ...changed }));
});

test("actual default navigation expectations preserve protected role boundaries", () => {
  assert.deepEqual(roleNavigation.user, ["home", "general-search", "collection-report"]);
  assert.ok(roleNavigation.admin.includes("settings") && !roleNavigation.manager.includes("settings"));
  assert.ok(!roleNavigation.admin.includes("monitor"), "Admin monitor additionally requires the existing System Performance capability");
  for (const role of ["manager", "admin", "user"]) assert.ok(!roleNavigation[role].includes("backup") && !roleNavigation[role].includes("audit-logs"));
  assert.ok(!roleNavigation.manager.includes("saved") && !roleNavigation.manager.includes("viewer"));
});

test("role harness proves real sessions and uses canonical mutations only after guarded provenance", () => {
  assert.doesNotMatch(source, /dotenv|route\.fulfill|storageState|recordHar|tracing\.start|new pg\.|UPDATE users|INSERT INTO users/);
  assert.match(source, /session\.user\?\.role, role/);
  assert.match(source, /getByTestId\("input-password"\)\.fill\(account\.password\)/);
  const guard = source.indexOf("const fixture = await prepareBillingFixture(ownerPage)");
  const mutation = source.indexOf('"PATCH", `/api/admin/users/');
  assert.ok(guard > 0 && mutation > guard);
  assert.match(source, /role: "manager"/);
  assert.match(source, /role: "user"/);
  assert.match(source, /COLLECTION_NICKNAME_SESSION_MISMATCH/);
  assert.match(source, /private edits|Private edits do not mutate Table A/);
  assert.match(source, /Other role saves preserve Superuser private result/);
  assert.match(source, /route\.abort\(\)/);
  assert.doesNotMatch(source, /JSON\.stringify\((?:accounts|error|fixture|session)/);
});

test("runner role mode requires opt-in Billing and keeps private credentials out of child environment and logs", () => {
  assert.match(runner, /!roleChecksEnabled \|\| billingFixtureEnabled/);
  assert.match(runner, /if \(roleChecksEnabled\) \{/);
  assert.match(runner, /admin: \{ username: env\.SEED_ADMIN_USERNAME, password: env\.SEED_ADMIN_PASSWORD \}/);
  assert.match(runner, /user: \{ username: env\.SEED_USER_USERNAME, password: env\.SEED_USER_PASSWORD \}/);
  assert.doesNotMatch(runner, /console\.(?:log|error)\([^\n]*(?:accounts|password|SEED_ADMIN_PASSWORD)/);
  assert.match(source, /finally \{/);
  assert.match(source, /\/api\/activity\/logout/);
});
