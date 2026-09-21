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
});

test("Collection Card cleanup requires stopped processes and verified narrow nonsymlink directory", () => {
  assert.match(runner, /if \(appStopped && databaseStopped\)/);
  assert.match(runner, /assert\.equal\(info\.isSymbolicLink\(\), false\)/);
  assert.match(runner, /assert\.equal\(path\.dirname\(resolved\), tempParent\)/);
  assert.match(runner, /assert\.match\(path\.basename\(resolved\), \/\^sqr-collection-card-no-/);
  assert.match(runner, /child\.send\("shutdown"/);
  assert.doesNotMatch(runner, /taskkill|pkill|killall|rm -rf/);
});
