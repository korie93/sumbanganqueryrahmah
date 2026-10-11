import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runner = await readFile(new URL("../test-collection-card-no-isolated.mjs", import.meta.url), "utf8");
const browser = await readFile(new URL("../collection-card-no-browser.mjs", import.meta.url), "utf8");
const seed = await readFile(new URL("../fixtures/collection-card-no-seed.ts", import.meta.url), "utf8");

test("Collection Card browser fixture starts only fresh loopback PostgreSQL with generated credentials", () => {
  assert.doesNotMatch(runner, /import\s+["']dotenv|\.\.\.process\.env|process\.env\.(?:DATABASE_URL|PG_HOST|PG_PORT|PG_USER|PG_PASSWORD|SESSION_SECRET|SEED_SUPERUSER_PASSWORD)/);
  assert.match(runner, /const cleanEnv = Object\.fromEntries\(inheritedKeys/);
  assert.match(runner, /mkdtemp\(path\.join\(tempParent, "sqr-collection-card-no-"\)\)/);
  assert.match(runner, /run\(executable\("initdb"\)/);
  assert.match(runner, /SHOW data_directory/);
  assert.match(runner, /CREATE DATABASE sqr_collection_card_test/);
  assert.match(runner, /PG_HOST: "127\.0\.0\.1", PG_PORT: String\(databasePort\)/);
  assert.match(runner, /SQR_AUDIT_HMAC_KEY: randomBytes/);
  assert.doesNotMatch(runner, /SQR_RATE_LIMIT_(?:LOGIN|USER|AUTHENTICATED)/);
});

test("Collection Card fixture uses real built application without copying .env, uploads or receipts", () => {
  assert.match(runner, /const builtServer = path\.join\(repoRoot, "dist-local", "server", "index-local\.js"\)/);
  assert.match(runner, /spawn\(process\.execPath, \[builtServer\], \{ cwd: appDir, env, windowsHide: true, shell: false/);
  assert.doesNotMatch(runner, /cp\([^\n]*(?:uploads|\.env|receipts|collection-record)/i);
  assert.match(runner, /LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0"/);
  assert.match(browser, /\/collection\/records/);
  assert.match(browser, /\/api\/collection\/list/);
  assert.match(browser, /input-username/);
  assert.doesNotMatch(browser, /route\.fulfill|storageState:|recordHar|tracing\.start/);
});

test("Collection Card seed verifies disposable database identity before inserting synthetic encrypted PII", () => {
  assert.match(seed, /assert\.equal\(process\.env\.SQR_COLLECTION_CARD_ISOLATED_CLUSTER, "1"\)/);
  assert.match(seed, /assert\.equal\(process\.env\.PG_DATABASE, "sqr_collection_card_test"\)/);
  assert.match(seed, /assert\.equal\(process\.env\.DATABASE_URL, undefined\)/);
  assert.match(seed, /assert\.equal\(await realpath\(state\.rows\[0\]\.data_directory\), await realpath\(dataDir\)\)/);
  assert.match(seed, /hashCollectionSourceIdentifier\(entry\.card, "card_number"\)/);
  assert.match(seed, /encryptCollectionPiiFieldValue\(entry\.ic\)/);
  assert.match(seed, /connection\.query\("BEGIN"\)/);
  assert.match(seed, /connection\.query\("ROLLBACK"\)/);
  assert.match(seed, /connection\.release\(\)/);
});

test("Collection Card baseline reproduction is explicit while default verification must find full cards", () => {
  assert.match(runner, /const expectMissingCard = process\.argv\.includes\("--expect-missing-card"\)/);
  assert.match(browser, /expectMissingCard = false/);
  assert.match(browser, /queryUi\(cardA, expectMissingCard \? 0 : 51/);
  assert.match(browser, /EXPECTED BASELINE DEFECT/);
  assert.match(browser, /longCard = "9007199254740993123"/);
  assert.match(browser, /sourceImportIds: "fixture-card-source-b"/);
  assert.match(browser, /if \(!expectMissingCard\) \{\s*const fullView = page\.getByRole/);
  assert.match(browser, /const emptyRecords = expectMissingCard\s*\? page\.getByText\("No collection records found\.", \{ exact: true \}\)\s*: page\.getByTestId\("collection-records-empty-state"\)/);
});

test("Collection Card browser explicitly selects the full desktop view before checking positional card cells", () => {
  const fullViewIndex = browser.indexOf('const fullView = page.getByRole("group", { name: "Paparan rekod", exact: true })');
  const selectIndex = browser.indexOf("await fullView.click()", fullViewIndex);
  const headingIndex = browser.indexOf('name: "Card Number", exact: true', selectIndex);
  const firstQueryIndex = browser.indexOf('const byIc = await queryUi(');
  assert.ok(fullViewIndex >= 0 && selectIndex > fullViewIndex);
  assert.ok(headingIndex > selectIndex && firstQueryIndex > headingIndex);
  assert.match(browser, /getByRole\("button", \{ name: "Lengkap", exact: true \}\)/);
  assert.match(browser, /assert\.equal\(await fullView\.getAttribute\("aria-pressed"\), "true"\)/);
  assert.match(browser, /td:nth-child\(5\)/);
  assert.match(browser, /assert\.deepEqual\([\s\S]*expectedCards,[\s\S]*without rounding or clipping digits/);
});

test("Collection Card empty searches require the filtered empty state rather than a loading or request failure", () => {
  assert.match(browser, /: page\.getByTestId\("collection-records-empty-state"\)\s*\.getByRole\("heading", \{ name: "Tiada rekod sepadan", exact: true \}\)/);
  assert.match(browser, /else await emptyRecords\.waitFor\(\)/);
  assert.match(browser, /else await emptyRecords\.scrollIntoViewIfNeeded\(\)/);
  assert.match(browser, /assert\.equal\(result\.status\(\), 200/);
  assert.match(browser, /assert\.equal\(payload\.total, total/);
});

test("Collection Card cleanup requires stopped processes and verified narrow nonsymlink directory", () => {
  assert.match(runner, /if \(appStopped && databaseStopped\)/);
  assert.match(runner, /assert\.equal\(info\.isSymbolicLink\(\), false\)/);
  assert.match(runner, /assert\.equal\(path\.dirname\(resolved\), tempParent\)/);
  assert.match(runner, /assert\.match\(path\.basename\(resolved\), \/\^sqr-collection-card-no-/);
  assert.match(runner, /child\.send\("shutdown"/);
  assert.doesNotMatch(runner, /taskkill|pkill|killall|rm -rf/);
});
