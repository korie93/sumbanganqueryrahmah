import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveRedesignRealtimeChecksEnabled, validateRedesignRealtimeEnvironment } from "../frontend-redesign-realtime-browser.mjs";

const source = readFileSync(new URL("../frontend-redesign-realtime-browser.mjs", import.meta.url), "utf8");
const runner = readFileSync(new URL("../test-frontend-redesign-isolated.mjs", import.meta.url), "utf8");
const tempParent = path.resolve(os.tmpdir());
const baseUrl = "http://127.0.0.1:54322";
const accounts = { superuser: { username: "collectioncardfixture123456abcdef", password: "Fixture9!" + "a".repeat(32) }, user: { username: "designuser123456abcdef", password: "Fixture9!" + "b".repeat(32) } };
const env = { SQR_REDESIGN_ISOLATED_CLUSTER: "1", SQR_REDESIGN_DATA_DIR: path.join(tempParent, "sqr-collection-card-no-Ab12Cd", "postgres"),
  PG_HOST: "127.0.0.1", PG_PORT: "54321", PG_USER: "sqr_fixture", PG_DATABASE: "sqr_collection_card_test",
  SEED_SUPERUSER_USERNAME: accounts.superuser.username, SEED_USER_USERNAME: accounts.user.username, PUBLIC_APP_URL: baseUrl, HOST: "127.0.0.1", PORT: "54322" };

test("realtime verification is strictly opt-in and rejects existing or remote fixture identity", () => {
  for (const value of [undefined, "", "0"]) assert.equal(resolveRedesignRealtimeChecksEnabled({ SQR_REDESIGN_REALTIME_CHECKS: value }), false);
  assert.equal(resolveRedesignRealtimeChecksEnabled({ SQR_REDESIGN_REALTIME_CHECKS: "1" }), true);
  for (const value of [true, 1, "yes", " 1", "2"]) assert.throws(() => resolveRedesignRealtimeChecksEnabled({ SQR_REDESIGN_REALTIME_CHECKS: value }));
  assert.equal(validateRedesignRealtimeEnvironment(env, baseUrl, accounts, tempParent).dataDir, env.SQR_REDESIGN_DATA_DIR);
  for (const changed of [{ PG_HOST: "production.example" }, { PG_DATABASE: "sqr_db" }, { DATABASE_URL: "postgresql://localhost/existing" },
    { SQR_REDESIGN_ISOLATED_CLUSTER: "0" }, { SQR_REDESIGN_DATA_DIR: tempParent }, { SEED_USER_USERNAME: "existing-user" },
    { HOST: "0.0.0.0" }, { PORT: env.PG_PORT }, { PUBLIC_APP_URL: "https://sqr-system.com" }]) {
    assert.throws(() => validateRedesignRealtimeEnvironment({ ...env, ...changed }, baseUrl, accounts, tempParent));
  }
  for (const url of ["https://127.0.0.1:54322", "http://localhost:54322", "https://sqr-system.com", `${baseUrl}/path`]) {
    assert.throws(() => validateRedesignRealtimeEnvironment({ ...env, PUBLIC_APP_URL: url }, url, accounts, tempParent));
  }
  assert.throws(() => validateRedesignRealtimeEnvironment(env, baseUrl, { ...accounts, user: { username: "existing-user", password: "password" } }, tempParent));
});

test("realtime mutation is gated by read-only cluster provenance and uses native transports", () => {
  assert.match(source, /SHOW data_directory/);
  assert.match(source, /records\.rows\[0\]\.count, 59/);
  assert.ok(source.indexOf("await verifyFreshFixture") < source.indexOf("chromium.launch"));
  assert.doesNotMatch(source, /route\.fulfill|routeWebSocket|connectToServer|storageState:|recordHar|tracing\.start|INSERT INTO|DELETE FROM|UPDATE users|Socket\.IO|clock\.install|clock\.fastForward|dispatchEvent\(/);
  assert.match(source, /page\.on\("websocket"/);
  assert.match(source, /socket\.on\("framereceived"/);
  assert.match(source, /context\.setOffline\(true\)/);
  assert.match(source, /context\.setOffline\(false\)/);
  assert.match(source, /Runtime\.queryObjects/);
  assert.match(source, /socket\.url === expected/);
  assert.match(source, /sockets\.length > 1/);
  assert.match(source, /Synthetic offline transport fault/);
  assert.match(source, /Network\.webSocketHandshakeResponseReceived/);
  assert.match(source, /response\.status === 101/);
  assert.match(source, /actor\.openedSockets > openedBeforeOffline/);
});

test("runner keeps realtime verification separate and passes only the newly generated fixture identity", () => {
  assert.match(runner, /!realtimeChecksEnabled \|\| \(!smokeOnly && !importChecksEnabled && !roleChecksEnabled && !billingFixtureEnabled\)/);
  assert.ok(runner.indexOf("Realtime checks run in their own fresh fixture") < runner.indexOf("const fixtureRoot = await mkdtemp"));
  const branch = runner.slice(runner.indexOf("} else if (realtimeChecksEnabled) {"), runner.indexOf("} else if (smokeOnly) {"));
  assert.match(branch, /await runRedesignRealtimeBrowser/);
  assert.match(branch, /SQR_REDESIGN_ISOLATED_CLUSTER: "1", SQR_REDESIGN_DATA_DIR: dataDir/);
  assert.match(branch, /SEED_USER_USERNAME: env\.SEED_USER_USERNAME/);
  assert.doesNotMatch(branch, /\.\.\.env|\.\.\.process\.env|SESSION_SECRET|process\.env\./);
});

test("Activity proof waits for real login/logout updates and reconnect retains authentication without reload", () => {
  assert.match(source, /getByTestId\("input-username"\)\.fill/);
  assert.match(source, /getByTestId\("button-logout"\)\.click/);
  assert.match(source, /actor\.page\.locator\("\.sqr-workspace"\)\.waitFor\(\{ state: "hidden" \}\)/);
  assert.match(source, /actor\.page\.waitForURL\(\(url\) => url\.origin === baseUrl && url\.pathname === "\/"\)/);
  assert.match(source, /api\(actor\.page, baseUrl, "GET", "\/api\/me", undefined, 401\)/);
  assert.match(source, /\/api\/activity\/page/);
  assert.match(source, /observer\.actorActivity\?\.status === "ONLINE"/);
  assert.match(source, /observer\.actorActivity\?\.id === activityId/);
  assert.match(source, /observer\.actorActivity\?\.status === "LOGOUT"/);
  assert.doesNotMatch(source, /getByTestId\("button-refresh"\)\.click/);
  assert.match(source, /assert\.equal\(actor\.loginRequests, 1/);
  assert.match(source, /assert\.equal\(meAfter\.user\?\.id, actorId/);
  assert.match(source, /performance\.timeOrigin\), actorDocument/);
  assert.match(source, /nextSocket\.settingsFrames > 0/);
  assert.match(source, /value: originalSystemName/);
  assert.match(source, /observer\.activityResponses > previousResponses/);
  assert.match(source, /heartbeatBeforeRefresh, "This observed refresh is not a heartbeat-triggered request"/);
  assert.match(source, /manifest\.checks\.length, 8/);
});
