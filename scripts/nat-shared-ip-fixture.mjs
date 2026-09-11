import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createCipheriv, createHash, createHmac, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, realpath } from "node:fs/promises";
import path from "node:path";

// Only the dedicated, disposable GitHub-hosted NAT simulation may seed these
// rows. This script never loads .env, imports application startup, or mints a
// session. Every browser must authenticate through the normal HTTPS login.
const ISOLATION_MARKER = "sqr-nat-simulation";
const DATABASE = "sqr_nat_simulation";
const BASE_URL = "https://127.0.0.1:5443";
const AGINGS = ["D3", "D4", "D5", "D6"];

function requireEqual(name, value) {
  assert.equal(process.env[name], value, `NAT fixture requires ${name}=${value}.`);
}

function assertIsolation() {
  requireEqual("CI", "true");
  requireEqual("GITHUB_ACTIONS", "true");
  requireEqual("NAT_SIMULATION_ISOLATED", "1");
  requireEqual("PG_HOST", "127.0.0.1");
  requireEqual("PG_PORT", "5432");
  requireEqual("PG_DATABASE", DATABASE);
  requireEqual("PG_USER", "postgres");
  assert.equal(process.platform, "linux", "NAT fixture requires the disposable Linux CI job.");
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted", "NAT fixture requires a GitHub-hosted runner.");
  assert.equal(process.versions.node.split(".")[0], "24", "Use the pinned Node 24 runtime.");
  for (const name of [
    "DATABASE_URL", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
    "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGOPTIONS", "PGHOSTADDR",
  ]) assert(!process.env[name], `Remove the ${name} override before the isolated fixture runs.`);
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || !/REDIS.*URL/i.test(name)) continue;
    assert.equal(value, "redis://127.0.0.1:6379/0", `Unsafe ${name}: only the dedicated loopback Redis is permitted.`);
  }
  assert(process.env.PG_PASSWORD?.length >= 24, "Use an ephemeral PostgreSQL password with at least 24 characters.");
  const password = process.env.NAT_SIMULATION_PASSWORD || "";
  assert(password.length >= 24 && Buffer.byteLength(password) <= 72
    && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password),
  "Use an ephemeral fixture password of 24–72 bytes satisfying the normal password policy.");
  for (const name of ["SQR_AUDIT_HMAC_KEY", "COLLECTION_PII_ENCRYPTION_KEY"]) {
    assert(process.env[name]?.length >= 32, `The fixture and app must share an ephemeral ${name}.`);
  }
  const expectedSha = process.env.NAT_SIMULATION_EXPECTED_SHA || "";
  assert(/^62cbe7aa[0-9a-f]{32}$/.test(expectedSha), "A full pinned production SHA beginning 62cbe7aa is required.");
  const applicationDirectory = process.env.NAT_SIMULATION_APP_DIR;
  assert(applicationDirectory && path.isAbsolute(applicationDirectory), "NAT_SIMULATION_APP_DIR must identify the pinned application checkout.");
  const actualSha = execFileSync("git", ["-C", applicationDirectory, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  assert.equal(actualSha, expectedSha, "Run the fixture from the pinned application checkout.");
  if (process.env.NAT_SIMULATION_BASE_URL) requireEqual("NAT_SIMULATION_BASE_URL", BASE_URL);
  return { password, expectedSha };
}

async function reservePrivateFixtureFile() {
  const root = await realpath(process.cwd());
  const privateDirectory = path.join(root, "artifacts", "nat-shared-ip", "private");
  const filename = path.resolve(process.env.NAT_SIMULATION_FIXTURE_FILE || path.join(privateDirectory, "fixture.json"));
  assert.equal(filename, path.join(privateDirectory, "fixture.json"), "Fixture output must be artifacts/nat-shared-ip/private/fixture.json in the harness checkout.");
  for (const relative of ["artifacts", "artifacts/nat-shared-ip", "artifacts/nat-shared-ip/private"]) {
    const directory = path.join(root, relative);
    await mkdir(directory, { mode: 0o700 }).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(directory);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), "Fixture output must not traverse symbolic links.");
    assert.equal(await realpath(directory), directory, "Fixture directory must remain in the harness checkout.");
  }
  await chmod(privateDirectory, 0o700);
  // Exclusive creation avoids overwriting an earlier run or following a link.
  return { filename, handle: await open(filename, "wx", 0o600) };
}

function createFixtureCodec() {
  // These domains mirror collection-source-repository-utils.ts and
  // collection-pii-encryption{-crypto}.ts at the pinned application revision.
  const sourceKey = createHmac("sha256", process.env.SQR_AUDIT_HMAC_KEY)
    .update("sqr-collection-source-blind-index-key-v1", "utf8").digest();
  const piiSecret = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  const encryptionKey = Buffer.from(hkdfSync("sha256", Buffer.from(piiSecret, "utf8"),
    Buffer.from("sqr-collection-pii-encryption-salt-v1", "utf8"),
    Buffer.from("sqr-collection-pii-encryption-v1", "utf8"), 32));
  const searchKey = createHash("sha256").update(piiSecret).digest();
  return {
    sourceHash(value, kind = "account_number") {
      const normalized = value.trim().replace(/\s+/g, "").toUpperCase();
      return createHmac("sha256", sourceKey).update(`sqr-collection-source-identifier-v2:${kind}:${normalized}`, "utf8").digest("hex");
    },
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
    },
    accountSearchHash(value) {
      return createHmac("sha256", searchKey).update(`accountNumber:${value.trim().replace(/\s+/g, "").toUpperCase()}`).digest("hex");
    },
    customerSearchHashes(value) {
      const terms = new Set();
      for (const token of value.trim().toLowerCase().split(/\s+/)) {
        for (let length = 2; length <= Math.min(token.length, 12); length += 1) terms.add(token.slice(0, length));
        if (token.length > 12) terms.add(token);
      }
      return [...terms].map((term) => createHmac("sha256", searchKey).update(`customerName:${term}`).digest("hex"));
    },
  };
}

async function seedAccounts(client, accounts, passwordHash) {
  for (const account of accounts) {
    await client.query(`INSERT INTO public.users
      (id, username, full_name, role, password_hash, status, is_banned,
       must_change_password, password_reset_by_superuser, activated_at, password_changed_at)
      VALUES ($1, $2, $3, $4, $5, 'active', false, false, false, now(), now())`,
    [account.userId, account.username, `Synthetic NAT ${account.role} ${account.index}`, account.role, passwordHash]);
    if (account.role === "manager") continue; // Managers have no nickname login/write capability.
    await client.query(`INSERT INTO public.collection_staff_nicknames
      (id, nickname, role_scope, is_active, nickname_password_hash, must_change_password,
       password_reset_by_superuser, password_updated_at, created_by)
      VALUES ($1::uuid, $2, $3, true, $4, false, false, now(), $5)`,
    [account.nicknameId, account.nickname, account.role, passwordHash, account.username]);
  }
  const admins = accounts.filter((account) => account.role === "admin");
  const users = accounts.filter((account) => account.role === "user");
  for (let index = 0; index < admins.length; index += 1) {
    const admin = admins[index];
    const member = users[index];
    const teamId = randomUUID();
    admin.teamId = teamId;
    member.teamId = teamId;
    await client.query(`INSERT INTO public.admin_groups
      (id, leader_nickname_id, leader_nickname, created_by) VALUES ($1::uuid, $2::uuid, $3, $4)`,
    [teamId, admin.nicknameId, admin.nickname, admin.username]);
    await client.query(`INSERT INTO public.admin_group_members
      (id, admin_group_id, member_nickname_id, member_nickname) VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`,
    [randomUUID(), teamId, member.nicknameId, member.nickname]);
    for (const nicknameId of [admin.nicknameId, member.nicknameId]) {
      await client.query(`INSERT INTO public.admin_visible_nicknames
        (id, admin_user_id, nickname_id) VALUES ($1::uuid, $2, $3::uuid)`,
      [randomUUID(), admin.userId, nicknameId]);
    }
  }
}

async function seedSource(client, fixture, codec) {
  const actor = fixture.accounts.find((account) => account.role === "admin");
  await client.query(`INSERT INTO public.imports (id, name, filename, created_by)
    VALUES ($1, $2, $3, $4)`, [fixture.sourceImportId, fixture.sourceName, fixture.sourceFilename, actor.username]);
  for (const account of fixture.accounts) {
    const jsonData = {
      "Customer Name": account.customerName, "IC Number": account.icNumber,
      "Customer Phone Number": account.customerPhone, "Account No": account.accountNumber,
      "Card No": account.cardNumber, "TOTAL DUE": account.amount,
      "Billing Principal (OSP)": "10.00", "DC_STS": account.agingBucket.slice(1),
      "Calling Date": fixture.callingDate,
    };
    await client.query(`INSERT INTO public.data_rows (id, import_id, json_data) VALUES ($1, $2, $3::jsonb)`,
    [account.sourceRowId, fixture.sourceImportId, JSON.stringify(jsonData)]);
    const accountHash = codec.sourceHash(account.accountNumber);
    await client.query(`INSERT INTO public.collection_source_rows
      (source_import_id, source_data_row_id, account_number_hash, card_number_hash, card_number_last4,
       canonical_obligation_key, total_due, billing_principal_osp, aging_bucket, calling_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, 10.00, $8, $9::date)`,
    [fixture.sourceImportId, account.sourceRowId, accountHash, codec.sourceHash(account.cardNumber, "card_number"),
      account.cardNumber.slice(-4), `account:${accountHash}`, account.amount, account.agingBucket, fixture.callingDate]);
  }
  await client.query(`INSERT INTO public.collection_source_configs
    (source_import_id, valid_from, valid_to, cycle_key, enabled, compatibility_status, indexed_row_count, configured_by)
    VALUES ($1, $2::date, $3::date, $4, true, 'compatible', $5, $6)`,
  [fixture.sourceImportId, fixture.periodFrom, fixture.periodTo, fixture.periodFrom.slice(0, 7), fixture.accounts.length, actor.username]);
}

async function seedBilling(client, fixture, codec) {
  const scopeHash = createHash("sha256").update(`sqr-collection-osp-source-scope-v1:${fixture.sourceImportId}`, "utf8").digest("hex");
  fixture.billingTargets = [];
  for (const admin of fixture.accounts.filter((account) => account.role === "admin")) {
    const targetId = randomUUID();
    const revisionId = randomUUID();
    const name = `Synthetic NAT Billing ${admin.index}`;
    await client.query(`INSERT INTO public.collection_osp_saved_targets
      (id, assigned_admin_user_id, target_name, normalized_name, created_by, updated_by)
      VALUES ($1::uuid, $2, $3, $4, $5, $5)`, [targetId, admin.userId, name, name.toLowerCase(), admin.username]);
    await client.query(`INSERT INTO public.collection_osp_target_revisions
      (id, target_id, revision_number, source_scope_hash, period_from, period_to, tracking_start_date,
       tracking_end_date, timezone, nickname_scope, aging_scope, calculation_version, created_by)
      VALUES ($1::uuid, $2::uuid, 1, $3, $4::date, $5::date, $4::date, $5::date,
       'Asia/Kuala_Lumpur', ARRAY[]::text[], $6::text[], 'osp-effective-private-v3-canonical-source', $7)`,
    [revisionId, targetId, scopeHash, fixture.periodFrom, fixture.periodTo, AGINGS, admin.username]);
    await client.query(`INSERT INTO public.collection_osp_target_sources
      (target_revision_id, source_import_id, source_name_snapshot, source_filename_snapshot)
      VALUES ($1::uuid, $2, $3, $4)`, [revisionId, fixture.sourceImportId, fixture.sourceName, fixture.sourceFilename]);
    for (const account of fixture.accounts) {
      const obligationKey = `account:${codec.sourceHash(account.accountNumber)}`;
      await client.query(`INSERT INTO public.collection_osp_target_source_rows
        (target_revision_id, source_import_id, source_data_row_id, canonical_obligation_key, cycle_key,
         account_number_encrypted, account_number_search_hash, card_number_last4, card_number_encrypted,
         identification_number_encrypted, phone_encrypted, customer_name_encrypted, customer_name_search_hashes,
         aging_bucket, calling_date, calling_window_end_exclusive, total_due, billing_principal_osp)
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::text[], $14,
          $15::date, ($15::date + interval '1 month')::date, $16::numeric, 10.00)`,
      [revisionId, fixture.sourceImportId, account.sourceRowId, obligationKey, `${fixture.callingDate}:${obligationKey}`,
        codec.encrypt(account.accountNumber), codec.accountSearchHash(account.accountNumber), account.cardNumber.slice(-4),
        codec.encrypt(account.cardNumber), codec.encrypt(account.icNumber), codec.encrypt(account.customerPhone),
        codec.encrypt(account.customerName), codec.customerSearchHashes(account.customerName), account.agingBucket,
        fixture.callingDate, account.amount]);
    }
    for (const aging of AGINGS) {
      const baseline = fixture.accounts.filter((account) => account.agingBucket === aging).length * 10;
      await client.query(`INSERT INTO public.collection_osp_target_aging_rows
        (target_revision_id, aging_bucket, total_osp_baseline, target_percentage, target_osp)
        VALUES ($1::uuid, $2, $3::numeric, 30.0000, $3::numeric * 0.30)`, [revisionId, aging, baseline]);
    }
    admin.billingTargetId = targetId;
    admin.billingRevisionId = revisionId;
    fixture.billingTargets.push({ targetId, revisionId, assignedAdminUserId: admin.userId, name });
  }
  for (const [index, manager] of fixture.accounts.filter((account) => account.role === "manager").entries()) {
    manager.billingTargetId = fixture.billingTargets[index].targetId;
    manager.billingRevisionId = fixture.billingTargets[index].revisionId;
  }
  fixture.targetId = fixture.billingTargets[0].targetId;
  fixture.revisionId = fixture.billingTargets[0].revisionId;
}

async function main() {
  const { password, expectedSha } = assertIsolation();
  const { default: pg } = await import("pg");
  const { default: bcrypt } = await import("bcrypt");
  const fixtureFile = await reservePrivateFixtureFile();
  const client = new pg.Client({
    host: "127.0.0.1", port: 5432, database: DATABASE, user: "postgres",
    password: process.env.PG_PASSWORD, ssl: false, connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000, application_name: ISOLATION_MARKER,
  });
  let connected = false;
  let inTransaction = false;
  try {
    await client.connect();
    connected = true;
    const identity = (await client.query(`SELECT current_database() AS database, inet_server_port() AS port,
      current_user AS username, pg_is_in_recovery() AS replica`)).rows[0];
    assert.deepEqual(identity, { database: DATABASE, port: 5432, username: "postgres", replica: false }, "Connected database identity does not match the isolated fixture.");
    await client.query("BEGIN");
    inTransaction = true;
    const tables = ["imports", "data_rows", "collection_records", "collection_staff_nicknames", "collection_source_configs", "collection_osp_saved_targets"];
    for (const table of tables) {
      const existing = await client.query(`SELECT 1 FROM public.${table} LIMIT 1`);
      assert.equal(existing.rowCount, 0, `The isolated ${table} table must be empty; no existing data may be overwritten.`);
    }
    const requiredSettings = ["user", "admin", "manager"].flatMap((role) =>
      ["general_search", "collection_report"].map((suffix) => `tab_${role}_${suffix}_enabled`));
    const settings = (await client.query("SELECT key, value FROM public.system_settings WHERE key = ANY($1::text[])", [requiredSettings])).rows;
    assert.equal(settings.length, requiredSettings.length, "Start the application once to seed its normal settings before running this fixture.");
    assert(settings.every((setting) => setting.value === "true"), "The normal role Search/Collection settings must already be enabled.");
    const dashboardSettings = (await client.query("SELECT key, value FROM public.system_settings WHERE key = ANY($1::text[])", [["tab_user_dashboard_enabled", "tab_admin_dashboard_enabled", "tab_manager_dashboard_enabled"]])).rows;
    assert.deepEqual(Object.fromEntries(dashboardSettings.map((setting) => [setting.key, setting.value])), {
      tab_user_dashboard_enabled: "false", tab_admin_dashboard_enabled: "false", tab_manager_dashboard_enabled: "true",
    }, "Retain default Dashboard permissions; the browser counts verified denials separately.");
    const paymentDate = new Date().toISOString().slice(0, 10);
    const sourceImportId = `nat-synthetic-${randomUUID()}`;
    const fixture = {
      schemaVersion: 1, isolated: true, isolationMarker: ISOLATION_MARKER, expectedSha,
      baseUrl: BASE_URL, createdAt: new Date().toISOString(), paymentDate,
      callingDate: `${paymentDate.slice(0, 7)}-01`, periodFrom: paymentDate, periodTo: paymentDate,
      sourceImportId, sourceName: "Synthetic NAT masterlisting", sourceFilename: "synthetic-nat-masterlisting.csv",
      accounts: Array.from({ length: 30 }, (_, offset) => {
        const index = offset + 1;
        const suffix = String(index).padStart(2, "0");
        const role = ["user", "admin", "manager"][Math.floor(offset / 10)];
        const accountNumber = `9900000000${suffix}`;
        return {
          index, username: `nat_${role}_${suffix}`, userId: randomUUID(), role,
          nickname: role === "manager" ? null : `NAT ${role} ${suffix}`,
          nicknameId: role === "manager" ? null : randomUUID(),
          searchQuery: accountNumber, accountNumber, cardNumber: `99009900000000${suffix}`,
          customerName: `Synthetic NAT Customer ${suffix}`, icNumber: `0000000000${suffix}`,
          customerPhone: `01000000${suffix}`, amount: "12.34", agingBucket: AGINGS[offset % AGINGS.length],
          sourceImportId, sourceRowId: randomUUID(),
        };
      }),
    };
    const codec = createFixtureCodec();
    // Cost 12 is the application's normal minimum. Session state is never seeded.
    await seedAccounts(client, fixture.accounts, await bcrypt.hash(password, 12));
    await seedSource(client, fixture, codec);
    await seedBilling(client, fixture, codec);
    await client.query("COMMIT");
    inTransaction = false;
    await fixtureFile.handle.writeFile(`${JSON.stringify(fixture, null, 2)}\n`, "utf8");
    await fixtureFile.handle.sync();
    console.log("[nat-fixture] Seeded 30 distinct synthetic accounts, 10 teams, 30 source rows, and 10 assigned Billing targets in the disposable CI database.");
    console.log("[nat-fixture] Private fixture metadata written; passwords, encryption keys, tokens, and sessions are excluded.");
  } finally {
    if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
    if (connected) await client.end();
    await fixtureFile.handle.close();
  }
}

main().catch((error) => {
  // Database errors can contain bound data. Report a safe category only.
  console.error(error instanceof assert.AssertionError ? `[nat-fixture] ${error.message}` : "[nat-fixture] Isolated fixture failed; synthetic database transaction was not published as a usable fixture.");
  // PostgreSQL identifiers/codes aid CI diagnosis without echoing bound values.
  if (!(error instanceof assert.AssertionError)) {
    const diagnostic = {};
    for (const name of ["code", "table", "column", "constraint"]) {
      if (typeof error?.[name] === "string" && /^[A-Za-z0-9_]{1,100}$/.test(error[name])) diagnostic[name] = error[name];
    }
    console.error("[nat-fixture] " + JSON.stringify(diagnostic));
  }
  process.exitCode = 1;
});
