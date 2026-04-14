import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ensureBackupsBootstrapSchema } from "../../internal/backupsBootstrap";
import { ensureCollectionRecordsTables } from "../../internal/collection-bootstrap-records";
import {
  ensureCoreBannedSessionsTable,
  ensureCoreUserActivityTable,
} from "../../internal/core-schema-bootstrap-activity";
import { ensureCoreImportsTable } from "../../internal/core-schema-bootstrap-imports";
import { ensureCoreMonitorAlertHistoryTable } from "../../internal/core-schema-bootstrap-runtime";
import { ensureSettingsSchema } from "../../internal/settings-bootstrap-schema";
import { ensureUsersBootstrapSchema } from "../../internal/users-bootstrap/schema";
import { decryptCollectionPiiValue } from "../../lib/collection-pii-encryption";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const aiMessagesIndexMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0000_ai_messages_conversation_created_at_idx.sql"),
  "utf8",
);
const aiSupportMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0006_reviewed_ai_support_tables.sql"),
  "utf8",
);
const dataEmbeddingsMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0008_reviewed_data_embeddings.sql"),
  "utf8",
);
const opsMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0002_reviewed_ops_tables.sql"),
  "utf8",
);
const storageMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0003_reviewed_storage_tables.sql"),
  "utf8",
);
const collectionAccessMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0004_reviewed_collection_access_tables.sql"),
  "utf8",
);
const authLifecycleMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0009_reviewed_auth_lifecycle_tables.sql"),
  "utf8",
);
const collectionRecordMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0011_reviewed_collection_record_tables.sql"),
  "utf8",
);
const collectionRecordDailyRollupMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0014_reviewed_collection_record_daily_rollups.sql"),
  "utf8",
);
const collectionRecordDailyRollupQueueMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0015_reviewed_collection_record_daily_rollup_refresh_queue.sql"),
  "utf8",
);
const monitorAndMonthlyRollupsMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0016_reviewed_monitor_and_monthly_rollups.sql"),
  "utf8",
);
const usersMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0012_reviewed_users_table.sql"),
  "utf8",
);
const usersTwoFactorMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0013_reviewed_users_two_factor.sql"),
  "utf8",
);
const usersLoginLockoutMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0017_reviewed_users_login_lockout.sql"),
  "utf8",
);
const timezoneMigrationFileName = "0024_stormy_mockingbird.sql";
const timezoneMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", timezoneMigrationFileName),
  "utf8",
);
const migrationSqlFileNames = readdirSync(path.join(repoRoot, "drizzle"))
  .filter((name) => name.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right));
const schemaIntegrityMigrationFileName = migrationSqlFileNames.find((name) => /^0025_.*\.sql$/.test(name));
if (!schemaIntegrityMigrationFileName) {
  throw new Error("Expected a 0025 schema integrity migration file in drizzle/");
}
const schemaIntegrityMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", schemaIntegrityMigrationFileName),
  "utf8",
);
const collectionPiiShadowMigrationFileName = migrationSqlFileNames.find((name) => /^0026_.*\.sql$/.test(name));
if (!collectionPiiShadowMigrationFileName) {
  throw new Error("Expected a 0026 collection PII shadow migration file in drizzle/");
}
const collectionPiiShadowMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", collectionPiiShadowMigrationFileName),
  "utf8",
);
const collectionPiiPlaintextNullableMigrationFileName = migrationSqlFileNames.find((name) => /^0030_.*\.sql$/.test(name));
if (!collectionPiiPlaintextNullableMigrationFileName) {
  throw new Error("Expected a 0030 collection PII plaintext nullable migration file in drizzle/");
}
const collectionPiiPlaintextNullableMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", collectionPiiPlaintextNullableMigrationFileName),
  "utf8",
);
const collectionAuditConstraintMigrationFileName = migrationSqlFileNames.find((name) => /^0032_.*\.sql$/.test(name));
if (!collectionAuditConstraintMigrationFileName) {
  throw new Error("Expected a 0032 collection audit constraint migration file in drizzle/");
}
const collectionAuditConstraintMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", collectionAuditConstraintMigrationFileName),
  "utf8",
);
const collectionRecordActorIntegrityMigrationFileName = migrationSqlFileNames.find((name) => /^0033_.*\.sql$/.test(name));
if (!collectionRecordActorIntegrityMigrationFileName) {
  throw new Error("Expected a 0033 collection record actor integrity migration file in drizzle/");
}
const collectionRecordActorIntegrityMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", collectionRecordActorIntegrityMigrationFileName),
  "utf8",
);
const collectionRecordCreatedByForeignKeyMigrationFileName = migrationSqlFileNames.find((name) => /^0034_.*\.sql$/.test(name));
if (!collectionRecordCreatedByForeignKeyMigrationFileName) {
  throw new Error("Expected a 0034 collection record created_by foreign key migration file in drizzle/");
}
const collectionRecordCreatedByForeignKeyMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", collectionRecordCreatedByForeignKeyMigrationFileName),
  "utf8",
);
const collectionRecordCreatedByDeleteRuleMigrationFileName = migrationSqlFileNames.find((name) => /^0035_.*\.sql$/.test(name));
if (!collectionRecordCreatedByDeleteRuleMigrationFileName) {
  throw new Error("Expected a 0035 collection record created_by delete rule migration file in drizzle/");
}
const collectionRecordCreatedByDeleteRuleMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", collectionRecordCreatedByDeleteRuleMigrationFileName),
  "utf8",
);
const usersIsBannedNotNullMigrationFileName = migrationSqlFileNames.find((name) => /^0036_.*\.sql$/.test(name));
if (!usersIsBannedNotNullMigrationFileName) {
  throw new Error("Expected a 0036 users is_banned not null migration file in drizzle/");
}
const usersIsBannedNotNullMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", usersIsBannedNotNullMigrationFileName),
  "utf8",
);
const coreUserReferenceForeignKeyMigrationFileName = migrationSqlFileNames.find((name) => /^0037_.*\.sql$/.test(name));
if (!coreUserReferenceForeignKeyMigrationFileName) {
  throw new Error("Expected a 0037 core user-reference foreign key migration file in drizzle/");
}
const coreUserReferenceForeignKeyMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", coreUserReferenceForeignKeyMigrationFileName),
  "utf8",
);
const coreEnumChecksMigrationFileName = migrationSqlFileNames.find((name) => /^0038_.*\.sql$/.test(name));
if (!coreEnumChecksMigrationFileName) {
  throw new Error("Expected a 0038 core enum checks migration file in drizzle/");
}
const coreEnumChecksMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", coreEnumChecksMigrationFileName),
  "utf8",
);
const preTimezoneMigrationSqlTexts = migrationSqlFileNames
  .filter((name) => name.localeCompare(timezoneMigrationFileName) < 0)
  .sort((left, right) => left.localeCompare(right))
  .map((name) => readFileSync(path.join(repoRoot, "drizzle", name), "utf8"));

const pgBaseConfig = {
  host: process.env.PG_HOST || "127.0.0.1",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "postgres",
};

const maintenanceDatabase = process.env.PG_MAINTENANCE_DATABASE || "postgres";

function quoteIdentifier(value: string): string {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

async function detectPostgresAvailability(): Promise<string | null> {
  const pool = new pg.Pool({
    ...pgBaseConfig,
    database: maintenanceDatabase,
    max: 1,
    connectionTimeoutMillis: 1_500,
    idleTimeoutMillis: 1_500,
  });

  try {
    await pool.query("SELECT 1");
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `PostgreSQL unavailable for bootstrap integration tests: ${message}`;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const skipReason = await detectPostgresAvailability();

async function withTempDatabase(
  run: (context: { pool: pg.Pool; databaseName: string }) => Promise<void>,
): Promise<void> {
  const adminPool = new pg.Pool({
    ...pgBaseConfig,
    database: maintenanceDatabase,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
  });
  const databaseName = `sqr_bootstrap_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const quotedDatabaseName = quoteIdentifier(databaseName);

  try {
    await adminPool.query(`CREATE DATABASE ${quotedDatabaseName}`);

    const pool = new pg.Pool({
      ...pgBaseConfig,
      database: databaseName,
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 5_000,
    });

    try {
      await run({ pool, databaseName });
    } finally {
      await pool.end().catch(() => undefined);
    }
  } finally {
    try {
      await adminPool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [databaseName],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS ${quotedDatabaseName}`);
    } finally {
      await adminPool.end().catch(() => undefined);
    }
  }
}

async function applySql(pool: pg.Pool, sqlText: string): Promise<void> {
  await pool.query(sqlText);
}

async function constraintExists(pool: pg.Pool, name: string): Promise<boolean> {
  const result = await pool.query<{ present: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = $1
      ) AS present
    `,
    [name],
  );
  return Boolean(result.rows[0]?.present);
}

async function indexExists(pool: pg.Pool, name: string): Promise<boolean> {
  const result = await pool.query<{ present: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = $1
      ) AS present
    `,
    [name],
  );
  return Boolean(result.rows[0]?.present);
}

async function columnDefault(pool: pg.Pool, table: string, column: string): Promise<string | null> {
  const result = await pool.query<{ column_default: string | null }>(
    `
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    `,
    [table, column],
  );
  return result.rows[0]?.column_default ?? null;
}

async function columnIsNotNull(pool: pg.Pool, table: string, column: string): Promise<boolean> {
  const result = await pool.query<{ is_not_null: boolean }>(
    `
      SELECT (is_nullable = 'NO') AS is_not_null
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    `,
    [table, column],
  );
  return Boolean(result.rows[0]?.is_not_null);
}

async function columnDataType(pool: pg.Pool, table: string, column: string): Promise<string | null> {
  const result = await pool.query<{ data_type: string | null }>(
    `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    `,
    [table, column],
  );
  return result.rows[0]?.data_type ?? null;
}

async function columnComment(pool: pg.Pool, table: string, column: string): Promise<string | null> {
  const result = await pool.query<{ column_comment: string | null }>(
    `
      SELECT pg_catalog.col_description(
        format('public.%I', $1::text)::regclass::oid,
        attribute.attnum
      ) AS column_comment
      FROM pg_catalog.pg_attribute attribute
      WHERE attribute.attrelid = format('public.%I', $1::text)::regclass
        AND attribute.attname = $2
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    `,
    [table, column],
  );
  return result.rows[0]?.column_comment ?? null;
}

async function foreignKeyRules(
  pool: pg.Pool,
  table: string,
  column: string,
): Promise<Array<{ constraint_name: string; update_rule: string; delete_rule: string }>> {
  const result = await pool.query<{
    constraint_name: string;
    update_rule: string;
    delete_rule: string;
  }>(
    `
      SELECT
        rc.constraint_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.referential_constraints rc
      INNER JOIN information_schema.key_column_usage kcu
        ON rc.constraint_schema = kcu.constraint_schema
       AND rc.constraint_name = kcu.constraint_name
      WHERE kcu.table_schema = 'public'
        AND kcu.table_name = $1
        AND kcu.column_name = $2
      ORDER BY rc.constraint_name
    `,
    [table, column],
  );
  return result.rows;
}

test(
  "reviewed AI migrations remain compatible on a fresh database even when the early index migration runs first",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await applySql(pool, aiMessagesIndexMigrationSql);
      await applySql(pool, aiSupportMigrationSql);

      assert.equal(await indexExists(pool, "idx_ai_messages_conversation_created_at"), true);
      assert.equal(await indexExists(pool, "idx_ai_messages_conversation_id"), true);
      assert.equal(await constraintExists(pool, "fk_ai_messages_conversation_id"), true);
    });
  },
);

test(
  "reviewed pgvector migration stays compatible when the extension is unavailable",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await applySql(pool, dataEmbeddingsMigrationSql);
      const vectorInstalled = await pool
        .query<{ present: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS present`)
        .then((result) => Boolean(result.rows[0]?.present));

      if (vectorInstalled) {
        assert.equal(await indexExists(pool, "idx_data_embeddings_import_id"), true);
      } else {
        assert.equal(await indexExists(pool, "idx_data_embeddings_import_id"), false);
        assert.equal(await indexExists(pool, "idx_data_embeddings_vector"), false);
      }
    });
  },
);

test(
  "reviewed collection audit constraint migration canonicalizes nullable audit users and enforces safe foreign keys",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text NOT NULL UNIQUE
        );

        CREATE TABLE public.user_activity (
          id text PRIMARY KEY
        );

        CREATE TABLE public.collection_staff_nicknames (
          id uuid PRIMARY KEY,
          nickname text NOT NULL,
          created_by text
        );

        CREATE TABLE public.admin_groups (
          id uuid PRIMARY KEY,
          leader_nickname text NOT NULL,
          created_by text NOT NULL
        );

        CREATE TABLE public.collection_daily_targets (
          id uuid PRIMARY KEY,
          username text NOT NULL,
          year integer NOT NULL,
          month integer NOT NULL,
          created_by text,
          updated_by text
        );

        CREATE TABLE public.collection_daily_calendar (
          id uuid PRIMARY KEY,
          year integer NOT NULL,
          month integer NOT NULL,
          day integer NOT NULL,
          created_by text,
          updated_by text
        );

        CREATE TABLE public.banned_sessions (
          id text PRIMARY KEY,
          username text NOT NULL,
          role text NOT NULL,
          activity_id text NOT NULL
        );

        CREATE TABLE public.collection_record_receipts (
          id uuid PRIMARY KEY,
          receipt_amount bigint,
          extracted_amount bigint,
          extraction_status text NOT NULL DEFAULT 'unprocessed'
        );
      `);

      await pool.query(`
        INSERT INTO public.users (id, username)
        VALUES
          ('user-1', 'admin.user'),
          ('user-2', 'auditor.user');

        INSERT INTO public.user_activity (id)
        VALUES ('activity-1');

        INSERT INTO public.collection_staff_nicknames (id, nickname, created_by)
        VALUES
          ('11111111-1111-1111-1111-111111111111'::uuid, 'Collector Alpha', ' Admin.User '),
          ('11111111-1111-1111-1111-111111111112'::uuid, 'Collector Beta', 'system-seed');

        INSERT INTO public.admin_groups (id, leader_nickname, created_by)
        VALUES
          ('22222222-2222-2222-2222-222222222221'::uuid, 'Collector Alpha', 'AUDITOR.USER'),
          ('22222222-2222-2222-2222-222222222222'::uuid, 'Collector Beta', 'system-seed');

        INSERT INTO public.collection_daily_targets (id, username, year, month, created_by, updated_by)
        VALUES
          ('33333333-3333-3333-3333-333333333331'::uuid, 'admin.user', 2026, 4, 'ADMIN.USER', 'auditor.user'),
          ('33333333-3333-3333-3333-333333333332'::uuid, 'admin.user', 2026, 5, 'legacy.user', 'system-seed');

        INSERT INTO public.collection_daily_calendar (id, year, month, day, created_by, updated_by)
        VALUES
          ('44444444-4444-4444-4444-444444444441'::uuid, 2026, 4, 8, ' auditor.user ', 'ADMIN.USER'),
          ('44444444-4444-4444-4444-444444444442'::uuid, 2026, 4, 9, 'missing.user', '');

        INSERT INTO public.banned_sessions (id, username, role, activity_id)
        VALUES
          ('ban-1', 'admin.user', 'admin', 'activity-1'),
          ('ban-2', 'admin.user', 'admin', 'missing-activity');

        INSERT INTO public.collection_record_receipts (id, receipt_amount, extracted_amount, extraction_status)
        VALUES
          ('55555555-5555-5555-5555-555555555551'::uuid, 1234, NULL, 'suggested'),
          ('55555555-5555-5555-5555-555555555552'::uuid, NULL, NULL, 'suggested');
      `);

      await applySql(pool, collectionAuditConstraintMigrationSql);

      assert.equal(await constraintExists(pool, "fk_collection_staff_nicknames_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_admin_groups_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_collection_daily_targets_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_collection_daily_targets_updated_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_collection_daily_calendar_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_collection_daily_calendar_updated_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_banned_sessions_activity_id"), true);
      assert.equal(await constraintExists(pool, "chk_collection_record_receipts_suggested_extracted_amount"), true);
      assert.equal(await indexExists(pool, "idx_banned_sessions_activity_id"), true);
      assert.equal(await columnIsNotNull(pool, "admin_groups", "created_by"), false);

      const nicknameAuditRows = await pool.query<{ created_by: string | null }>(`
        SELECT created_by
        FROM public.collection_staff_nicknames
        ORDER BY nickname ASC
      `);
      assert.deepEqual(
        nicknameAuditRows.rows.map((row) => row.created_by),
        ["admin.user", null],
      );

      const adminGroupAuditRows = await pool.query<{ created_by: string | null }>(`
        SELECT created_by
        FROM public.admin_groups
        ORDER BY leader_nickname ASC
      `);
      assert.deepEqual(
        adminGroupAuditRows.rows.map((row) => row.created_by),
        ["auditor.user", null],
      );

      const targetAuditRows = await pool.query<{ created_by: string | null; updated_by: string | null }>(`
        SELECT created_by, updated_by
        FROM public.collection_daily_targets
        ORDER BY month ASC
      `);
      assert.deepEqual(targetAuditRows.rows, [
        { created_by: "admin.user", updated_by: "auditor.user" },
        { created_by: null, updated_by: null },
      ]);

      const calendarAuditRows = await pool.query<{ created_by: string | null; updated_by: string | null }>(`
        SELECT created_by, updated_by
        FROM public.collection_daily_calendar
        ORDER BY day ASC
      `);
      assert.deepEqual(calendarAuditRows.rows, [
        { created_by: "auditor.user", updated_by: "admin.user" },
        { created_by: null, updated_by: null },
      ]);

      const bannedSessionIds = await pool.query<{ id: string }>(`
        SELECT id
        FROM public.banned_sessions
        ORDER BY id ASC
      `);
      assert.deepEqual(bannedSessionIds.rows.map((row) => row.id), ["ban-1"]);

      const receiptState = await pool.query<{
        id: string;
        receipt_amount: string | null;
        extracted_amount: string | null;
        extraction_status: string;
      }>(`
        SELECT id, receipt_amount::text, extracted_amount::text, extraction_status
        FROM public.collection_record_receipts
        ORDER BY id ASC
      `);
      assert.deepEqual(receiptState.rows, [
        {
          id: "55555555-5555-5555-5555-555555555551",
          receipt_amount: "1234",
          extracted_amount: "1234",
          extraction_status: "suggested",
        },
        {
          id: "55555555-5555-5555-5555-555555555552",
          receipt_amount: null,
          extracted_amount: null,
          extraction_status: "unprocessed",
        },
      ]);

      await assert.rejects(
        () => pool.query(`
          INSERT INTO public.collection_record_receipts (id, receipt_amount, extracted_amount, extraction_status)
          VALUES ('55555555-5555-5555-5555-555555555553'::uuid, NULL, NULL, 'suggested')
        `),
        /chk_collection_record_receipts_suggested_extracted_amount/i,
      );

      const adminGroupRules = await foreignKeyRules(pool, "admin_groups", "created_by");
      const staffNicknameRules = await foreignKeyRules(pool, "collection_staff_nicknames", "created_by");
      const bannedSessionRules = await foreignKeyRules(pool, "banned_sessions", "activity_id");

      assert.equal(adminGroupRules[0]?.delete_rule, "SET NULL");
      assert.equal(adminGroupRules[0]?.update_rule, "CASCADE");
      assert.equal(staffNicknameRules[0]?.delete_rule, "SET NULL");
      assert.equal(staffNicknameRules[0]?.update_rule, "CASCADE");
      assert.equal(bannedSessionRules[0]?.delete_rule, "CASCADE");
      assert.equal(bannedSessionRules[0]?.update_rule, "CASCADE");
    });
  },
);

test(
  "reviewed collection record actor integrity migration canonicalizes created_by_login and keeps staff_username aligned to nickname",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text NOT NULL UNIQUE
        );

        CREATE TABLE public.collection_records (
          id uuid PRIMARY KEY,
          batch text NOT NULL,
          payment_date date NOT NULL,
          amount numeric(14,2) NOT NULL,
          created_by_login text NOT NULL,
          collection_staff_nickname text NOT NULL,
          staff_username text NOT NULL,
          created_at timestamp with time zone NOT NULL DEFAULT now(),
          updated_at timestamp with time zone NOT NULL DEFAULT now()
        );
      `);

      await pool.query(`
        INSERT INTO public.users (id, username)
        VALUES
          ('user-1', 'admin.user'),
          ('user-2', 'staff.user');

        INSERT INTO public.collection_records (
          id,
          batch,
          payment_date,
          amount,
          created_by_login,
          collection_staff_nickname,
          staff_username
        )
        VALUES
          (
            '66666666-6666-6666-6666-666666666661'::uuid,
            'P10',
            DATE '2026-04-12',
            10.00,
            ' Admin.User ',
            ' Collector Alpha ',
            'staff.alpha'
          ),
          (
            '66666666-6666-6666-6666-666666666662'::uuid,
            'P10',
            DATE '2026-04-12',
            12.00,
            'system',
            '',
            'Collector Beta'
          );
      `);

      await applySql(pool, collectionRecordActorIntegrityMigrationSql);

      assert.equal(
        await constraintExists(pool, "chk_collection_records_staff_username_matches_nickname"),
        true,
      );

      const actorRows = await pool.query<{
        created_by_login: string;
        collection_staff_nickname: string;
        staff_username: string;
      }>(`
        SELECT created_by_login, collection_staff_nickname, staff_username
        FROM public.collection_records
        ORDER BY id ASC
      `);
      assert.deepEqual(actorRows.rows, [
        {
          created_by_login: "admin.user",
          collection_staff_nickname: "Collector Alpha",
          staff_username: "Collector Alpha",
        },
        {
          created_by_login: "system",
          collection_staff_nickname: "Collector Beta",
          staff_username: "Collector Beta",
        },
      ]);

      await assert.rejects(
        () => pool.query(`
          INSERT INTO public.collection_records (
            id,
            batch,
            payment_date,
            amount,
            created_by_login,
            collection_staff_nickname,
            staff_username
          )
          VALUES (
            '66666666-6666-6666-6666-666666666663'::uuid,
            'P10',
            DATE '2026-04-12',
            15.00,
            'staff.user',
            'Collector Gamma',
            'Mismatch Gamma'
          )
        `),
        /chk_collection_records_staff_username_matches_nickname/i,
      );
    });
  },
);

test(
  "reviewed collection record created_by migration provisions a disabled system actor and enforces a safe foreign key",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text NOT NULL UNIQUE,
          full_name text,
          email text,
          role text NOT NULL DEFAULT 'user',
          password_hash text,
          status text NOT NULL DEFAULT 'active',
          must_change_password boolean NOT NULL DEFAULT false,
          password_reset_by_superuser boolean NOT NULL DEFAULT false,
          two_factor_enabled boolean NOT NULL DEFAULT false,
          two_factor_secret_encrypted text,
          two_factor_configured_at timestamp with time zone,
          failed_login_attempts integer NOT NULL DEFAULT 0,
          locked_at timestamp with time zone,
          locked_reason text,
          locked_by_system boolean NOT NULL DEFAULT false,
          created_by text,
          is_banned boolean DEFAULT false,
          created_at timestamp with time zone DEFAULT now(),
          updated_at timestamp with time zone DEFAULT now(),
          password_changed_at timestamp with time zone,
          activated_at timestamp with time zone,
          last_login_at timestamp with time zone
        );

        CREATE TABLE public.collection_records (
          id uuid PRIMARY KEY,
          batch text NOT NULL,
          payment_date date NOT NULL,
          amount numeric(14,2) NOT NULL,
          created_by_login text NOT NULL,
          collection_staff_nickname text NOT NULL,
          staff_username text NOT NULL,
          created_at timestamp with time zone NOT NULL DEFAULT now(),
          updated_at timestamp with time zone NOT NULL DEFAULT now()
        );
      `);

      await pool.query(`
        INSERT INTO public.users (id, username, role, password_hash, status)
        VALUES ('user-1', 'admin.user', 'admin', '$2b$12$legacyhashlegacyhashlegacyhashlegacyhashlegacyhashlegacyh', 'active');

        INSERT INTO public.collection_records (
          id,
          batch,
          payment_date,
          amount,
          created_by_login,
          collection_staff_nickname,
          staff_username
        )
        VALUES
          (
            '77777777-7777-7777-7777-777777777771'::uuid,
            'P10',
            DATE '2026-04-12',
            10.00,
            ' Admin.User ',
            'Collector Alpha',
            'Collector Alpha'
          ),
          (
            '77777777-7777-7777-7777-777777777772'::uuid,
            'P10',
            DATE '2026-04-12',
            12.00,
            'ghost.user',
            'Collector Beta',
            'Collector Beta'
          );
      `);

      await applySql(pool, collectionRecordCreatedByForeignKeyMigrationSql);

      const systemActor = await pool.query<{
        username: string;
        status: string;
      }>(`
        SELECT username, status
        FROM public.users
        WHERE username = 'system'
      `);
      assert.deepEqual(systemActor.rows, [{ username: "system", status: "disabled" }]);

      const actorRows = await pool.query<{ created_by_login: string }>(`
        SELECT created_by_login
        FROM public.collection_records
        ORDER BY id ASC
      `);
      assert.deepEqual(actorRows.rows, [
        { created_by_login: "admin.user" },
        { created_by_login: "system" },
      ]);

      const createdByRules = await foreignKeyRules(pool, "collection_records", "created_by_login");
      assert.equal(createdByRules[0]?.constraint_name, "fk_collection_records_created_by_login_username");
      assert.equal(createdByRules[0]?.update_rule, "CASCADE");
      assert.equal(createdByRules[0]?.delete_rule, "RESTRICT");

      await assert.rejects(
        () => pool.query(`
          INSERT INTO public.collection_records (
            id,
            batch,
            payment_date,
            amount,
            created_by_login,
            collection_staff_nickname,
            staff_username
          )
          VALUES (
            '77777777-7777-7777-7777-777777777773'::uuid,
            'P10',
            DATE '2026-04-12',
            15.00,
            'missing.user',
            'Collector Gamma',
            'Collector Gamma'
          )
        `),
        /fk_collection_records_created_by_login_username/i,
      );

      await assert.rejects(
        () => pool.query(`DELETE FROM public.users WHERE username = 'admin.user'`),
        /fk_collection_records_created_by_login_username/i,
      );
    });
  },
);

test(
  "reviewed collection record created_by delete rule migration upgrades legacy cascade deletes to restrict",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text NOT NULL UNIQUE
        );

        CREATE TABLE public.collection_records (
          id uuid PRIMARY KEY,
          batch text NOT NULL,
          payment_date date NOT NULL,
          amount numeric(14,2) NOT NULL,
          created_by_login text NOT NULL,
          collection_staff_nickname text NOT NULL,
          staff_username text NOT NULL,
          created_at timestamp with time zone NOT NULL DEFAULT now(),
          updated_at timestamp with time zone NOT NULL DEFAULT now(),
          CONSTRAINT fk_collection_records_created_by_login_username
            FOREIGN KEY (created_by_login)
            REFERENCES public.users(username)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        );

        INSERT INTO public.users (id, username)
        VALUES ('user-1', 'admin.user');

        INSERT INTO public.collection_records (
          id,
          batch,
          payment_date,
          amount,
          created_by_login,
          collection_staff_nickname,
          staff_username
        )
        VALUES (
          '77777777-7777-7777-7777-777777777774'::uuid,
          'P10',
          DATE '2026-04-12',
          18.00,
          'admin.user',
          'Collector Delta',
          'Collector Delta'
        );
      `);

      await applySql(pool, collectionRecordCreatedByDeleteRuleMigrationSql);

      const createdByRules = await foreignKeyRules(pool, "collection_records", "created_by_login");
      assert.equal(createdByRules[0]?.constraint_name, "fk_collection_records_created_by_login_username");
      assert.equal(createdByRules[0]?.update_rule, "CASCADE");
      assert.equal(createdByRules[0]?.delete_rule, "RESTRICT");

      await assert.rejects(
        () => pool.query(`DELETE FROM public.users WHERE username = 'admin.user'`),
        /fk_collection_records_created_by_login_username/i,
      );
    });
  },
);

test(
  "reviewed pre-user migrations remain compatible before users exists and users migration restores deferred constraints",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await applySql(pool, opsMigrationSql);
      await applySql(pool, storageMigrationSql);
      await applySql(pool, collectionAccessMigrationSql);
      await applySql(pool, usersMigrationSql);
      await applySql(pool, usersTwoFactorMigrationSql);
      await applySql(pool, authLifecycleMigrationSql);
      await applySql(pool, usersLoginLockoutMigrationSql);
      await applySql(pool, usersIsBannedNotNullMigrationSql);
      await applySql(pool, coreUserReferenceForeignKeyMigrationSql);
      await applySql(pool, coreEnumChecksMigrationSql);

      assert.equal(await constraintExists(pool, "fk_user_activity_user_id"), true);
      assert.equal(await constraintExists(pool, "fk_data_rows_import_id"), true);
      assert.equal(await constraintExists(pool, "fk_admin_group_members_admin_group_id"), true);
      assert.equal(await constraintExists(pool, "fk_collection_nickname_sessions_activity_id"), true);
      assert.equal(await constraintExists(pool, "fk_admin_visible_nicknames_nickname_id"), true);
      assert.equal(await constraintExists(pool, "fk_admin_visible_nicknames_admin_user_id"), true);
      assert.equal(await constraintExists(pool, "fk_users_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_account_activation_tokens_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_password_reset_requests_requested_by_user_username"), true);
      assert.equal(await constraintExists(pool, "fk_password_reset_requests_approved_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_imports_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_backups_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_backup_jobs_requested_by_username"), true);
      assert.equal(await constraintExists(pool, "chk_users_role"), true);
      assert.equal(await constraintExists(pool, "chk_users_status"), true);
      assert.equal(await constraintExists(pool, "chk_user_activity_role"), true);
      assert.equal(await constraintExists(pool, "chk_backup_jobs_status"), true);
      assert.equal(await indexExists(pool, "idx_user_activity_user_id"), true);
      assert.equal(await indexExists(pool, "idx_users_created_by"), true);
      assert.equal(await indexExists(pool, "idx_backups_created_by"), true);
      assert.equal(await indexExists(pool, "idx_backup_jobs_requested_by"), true);
      assert.equal(await indexExists(pool, "idx_admin_visible_nicknames_admin_nickname_unique"), true);
      assert.equal(await columnIsNotNull(pool, "users", "is_banned"), true);
      assert.equal(await columnIsNotNull(pool, "user_activity", "role"), true);
      assert.equal(await columnIsNotNull(pool, "backup_jobs", "status"), true);
    });
  },
);

test(
  "reviewed users is_banned migration backfills null bans and enforces not-null safely",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text NOT NULL UNIQUE,
          is_banned boolean DEFAULT false
        );

        INSERT INTO public.users (id, username, is_banned)
        VALUES
          ('user-1', 'active.user', NULL),
          ('user-2', 'banned.user', true);
      `);

      await applySql(pool, usersIsBannedNotNullMigrationSql);

      assert.equal(await columnIsNotNull(pool, "users", "is_banned"), true);
      assert.match(String(await columnDefault(pool, "users", "is_banned") || ""), /false/i);

      const rows = await pool.query<{ username: string; is_banned: boolean }>(`
        SELECT username, is_banned
        FROM public.users
        ORDER BY username ASC
      `);
      assert.deepEqual(rows.rows, [
        { username: "active.user", is_banned: false },
        { username: "banned.user", is_banned: true },
      ]);

      await assert.rejects(
        () => pool.query(`
          INSERT INTO public.users (id, username, is_banned)
          VALUES ('user-3', 'null.user', NULL)
        `),
        /null value in column "is_banned"/i,
      );
    });
  },
);

test(
  "reviewed core enum checks migration normalizes legacy enum text fields and enforces safe CHECK constraints",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text NOT NULL UNIQUE,
          password_hash text NOT NULL,
          role text NOT NULL,
          status text NOT NULL,
          created_by text
        );

        CREATE TABLE public.user_activity (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          username text NOT NULL,
          role text NOT NULL
        );

        CREATE TABLE public.banned_sessions (
          id text PRIMARY KEY,
          username text NOT NULL,
          role text NOT NULL,
          activity_id text NOT NULL,
          banned_at timestamp with time zone DEFAULT now() NOT NULL
        );

        CREATE TABLE public.backups (
          id text PRIMARY KEY,
          created_by text
        );

        CREATE TABLE public.backup_jobs (
          id uuid PRIMARY KEY,
          status text NOT NULL,
          requested_by text
        );

        CREATE TABLE public.monitor_alert_incidents (
          id uuid PRIMARY KEY,
          severity text NOT NULL,
          status text NOT NULL
        );
      `);

      await pool.query(`
        INSERT INTO public.users (id, username, password_hash, role, status, created_by)
        VALUES
          ('user-1', 'Legacy.User', '$2b$12$legacyhashlegacyhashlegacyhashlegacyhashlegacyhashlegacyh', 'ADMIN', 'ACTIVE', NULL),
          ('user-2', 'Broken.User', 'plain-text-password', 'owner', 'mystery', NULL);

        INSERT INTO public.user_activity (id, user_id, username, role)
        VALUES ('activity-1', 'user-1', 'Legacy.User', 'ADMINISTRATOR');

        INSERT INTO public.banned_sessions (id, username, role, activity_id)
        VALUES ('ban-1', 'Legacy.User', 'Moderator', 'activity-1');

        INSERT INTO public.backups (id, created_by)
        VALUES ('backup-1', 'Legacy.User');

        INSERT INTO public.backup_jobs (id, status, requested_by)
        VALUES ('55555555-5555-5555-5555-555555555555'::uuid, 'stuck', 'Legacy.User');

        INSERT INTO public.monitor_alert_incidents (id, severity, status)
        VALUES ('66666666-6666-6666-6666-666666666666'::uuid, 'critical ', 'OPEN');
      `);

      await applySql(pool, coreEnumChecksMigrationSql);

      const usersRows = await pool.query<{ username: string; role: string; status: string }>(`
        SELECT username, role, status
        FROM public.users
        ORDER BY username ASC
      `);
      assert.deepEqual(usersRows.rows, [
        { username: "Broken.User", role: "user", status: "pending_activation" },
        { username: "Legacy.User", role: "admin", status: "active" },
      ]);

      const activityRows = await pool.query<{ role: string }>(`
        SELECT role
        FROM public.user_activity
        WHERE id = 'activity-1'
      `);
      assert.deepEqual(activityRows.rows, [{ role: "user" }]);

      const bannedRows = await pool.query<{ role: string }>(`
        SELECT role
        FROM public.banned_sessions
        WHERE id = 'ban-1'
      `);
      assert.deepEqual(bannedRows.rows, [{ role: "user" }]);

      const backupJobRows = await pool.query<{ status: string }>(`
        SELECT status
        FROM public.backup_jobs
        WHERE id = '55555555-5555-5555-5555-555555555555'::uuid
      `);
      assert.deepEqual(backupJobRows.rows, [{ status: "queued" }]);

      const incidentRows = await pool.query<{ severity: string; status: string }>(`
        SELECT severity, status
        FROM public.monitor_alert_incidents
        WHERE id = '66666666-6666-6666-6666-666666666666'::uuid
      `);
      assert.deepEqual(incidentRows.rows, [{ severity: "CRITICAL", status: "open" }]);

      assert.equal(await constraintExists(pool, "chk_users_role"), true);
      assert.equal(await constraintExists(pool, "chk_users_status"), true);
      assert.equal(await constraintExists(pool, "chk_user_activity_role"), true);
      assert.equal(await constraintExists(pool, "chk_banned_sessions_role"), true);
      assert.equal(await constraintExists(pool, "chk_backup_jobs_status"), true);
      assert.equal(await constraintExists(pool, "chk_monitor_alert_incidents_severity"), true);
      assert.equal(await constraintExists(pool, "chk_monitor_alert_incidents_status"), true);
      assert.equal(await indexExists(pool, "idx_users_created_by"), true);
      assert.equal(await indexExists(pool, "idx_backups_created_by"), true);
      assert.equal(await indexExists(pool, "idx_backup_jobs_requested_by"), true);
      assert.equal(await columnIsNotNull(pool, "user_activity", "role"), true);
      assert.equal(await columnIsNotNull(pool, "banned_sessions", "role"), true);
      assert.equal(await columnIsNotNull(pool, "backup_jobs", "status"), true);
      assert.equal(await columnIsNotNull(pool, "monitor_alert_incidents", "severity"), true);
      assert.equal(await columnIsNotNull(pool, "monitor_alert_incidents", "status"), true);

      await assert.rejects(
        () => pool.query(`UPDATE public.users SET role = 'owner' WHERE id = 'user-1'`),
        /chk_users_role/i,
      );
      await assert.rejects(
        () => pool.query(`UPDATE public.backup_jobs SET status = 'paused' WHERE id = '55555555-5555-5555-5555-555555555555'::uuid`),
        /chk_backup_jobs_status/i,
      );
      await assert.rejects(
        () => pool.query(`UPDATE public.monitor_alert_incidents SET severity = 'LOW' WHERE id = '66666666-6666-6666-6666-666666666666'::uuid`),
        /chk_monitor_alert_incidents_severity/i,
      );
    });
  },
);

test(
  "reviewed core user-reference foreign key migration canonicalizes legacy actor fields and enforces safe rules",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text NOT NULL UNIQUE,
          password_hash text NOT NULL,
          full_name text,
          email text,
          role text NOT NULL DEFAULT 'user',
          status text NOT NULL DEFAULT 'active',
          must_change_password boolean NOT NULL DEFAULT false,
          password_reset_by_superuser boolean NOT NULL DEFAULT false,
          two_factor_enabled boolean NOT NULL DEFAULT false,
          failed_login_attempts integer NOT NULL DEFAULT 0,
          locked_by_system boolean NOT NULL DEFAULT false,
          created_by text,
          is_banned boolean NOT NULL DEFAULT false,
          created_at timestamp with time zone DEFAULT now(),
          updated_at timestamp with time zone DEFAULT now(),
          two_factor_secret_encrypted text,
          two_factor_configured_at timestamp with time zone,
          locked_at timestamp with time zone,
          locked_reason text,
          password_changed_at timestamp with time zone,
          activated_at timestamp with time zone,
          last_login_at timestamp with time zone
        );

        CREATE TABLE public.account_activation_tokens (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          token_hash text NOT NULL,
          expires_at timestamp with time zone NOT NULL,
          used_at timestamp with time zone,
          created_by text,
          created_at timestamp with time zone DEFAULT now()
        );

        CREATE TABLE public.password_reset_requests (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          requested_by_user text,
          approved_by text,
          reset_type text NOT NULL DEFAULT 'email_link',
          token_hash text,
          expires_at timestamp with time zone,
          used_at timestamp with time zone,
          created_at timestamp with time zone DEFAULT now()
        );

        CREATE TABLE public.imports (
          id text PRIMARY KEY,
          name text NOT NULL,
          filename text NOT NULL,
          created_at timestamp with time zone DEFAULT now() NOT NULL,
          is_deleted boolean DEFAULT false NOT NULL,
          created_by text
        );

        CREATE TABLE public.backups (
          id text PRIMARY KEY,
          name text NOT NULL,
          created_at timestamp with time zone DEFAULT now() NOT NULL,
          created_by text,
          backup_data text NOT NULL,
          metadata text
        );

        CREATE TABLE public.backup_jobs (
          id uuid PRIMARY KEY,
          type text NOT NULL,
          status text NOT NULL DEFAULT 'queued',
          requested_by text,
          requested_at timestamp with time zone DEFAULT now() NOT NULL,
          started_at timestamp with time zone,
          finished_at timestamp with time zone,
          updated_at timestamp with time zone DEFAULT now() NOT NULL,
          backup_id text,
          backup_name text,
          result jsonb,
          error jsonb
        );
      `);

      await pool.query(`
        INSERT INTO public.users (id, username, password_hash, created_by)
        VALUES
          ('admin-user', 'Admin.User', 'hash', NULL),
          ('auditor-user', 'Auditor.User', 'hash', NULL),
          ('subject-user', 'Subject.User', 'hash', ' Admin.User '),
          ('legacy-user', 'Legacy.User', 'hash', 'legacy-create-user'),
          ('ghost-user', 'Ghost.User', 'hash', 'ghost.actor')
      `);
      await pool.query(`
        INSERT INTO public.account_activation_tokens (id, user_id, token_hash, expires_at, created_by)
        VALUES
          ('activation-1', 'subject-user', 'hash-1', now() + interval '1 day', ' admin.user '),
          ('activation-2', 'legacy-user', 'hash-2', now() + interval '1 day', 'ghost.actor')
      `);
      await pool.query(`
        INSERT INTO public.password_reset_requests (
          id,
          user_id,
          requested_by_user,
          approved_by,
          reset_type,
          token_hash,
          expires_at
        )
        VALUES
          ('reset-1', 'subject-user', 'AUDITOR.USER', 'ghost.actor', 'email_link', 'token-1', now() + interval '1 day'),
          ('reset-2', 'legacy-user', 'system-bootstrap', ' legacy-create-user ', 'manual_reset', NULL, NULL)
      `);
      await pool.query(`
        INSERT INTO public.imports (id, name, filename, created_by)
        VALUES
          ('import-1', 'Import 1', 'one.csv', ' system-bootstrap '),
          ('import-2', 'Import 2', 'two.csv', 'ghost.actor')
      `);
      await pool.query(`
        INSERT INTO public.backups (id, name, created_by, backup_data, metadata)
        VALUES
          ('backup-1', 'Nightly', ' admin.user ', '{}'::text, NULL),
          ('backup-2', 'Legacy', 'ghost.actor', '{}'::text, NULL)
      `);
      await pool.query(`
        INSERT INTO public.backup_jobs (id, type, status, requested_by)
        VALUES
          ('11111111-1111-1111-1111-111111111111'::uuid, 'create', 'queued', ' system-bootstrap '),
          ('22222222-2222-2222-2222-222222222222'::uuid, 'restore', 'queued', 'ghost.actor')
      `);

      await applySql(pool, coreUserReferenceForeignKeyMigrationSql);

      assert.equal(await constraintExists(pool, "fk_users_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_account_activation_tokens_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_password_reset_requests_requested_by_user_username"), true);
      assert.equal(await constraintExists(pool, "fk_password_reset_requests_approved_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_imports_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_backups_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_backup_jobs_requested_by_username"), true);

      const userCreatedByRules = await foreignKeyRules(pool, "users", "created_by");
      const tokenCreatedByRules = await foreignKeyRules(pool, "account_activation_tokens", "created_by");
      const resetRequestedByRules = await foreignKeyRules(pool, "password_reset_requests", "requested_by_user");
      const resetApprovedByRules = await foreignKeyRules(pool, "password_reset_requests", "approved_by");
      const importCreatedByRules = await foreignKeyRules(pool, "imports", "created_by");
      const backupCreatedByRules = await foreignKeyRules(pool, "backups", "created_by");
      const backupJobRequestedByRules = await foreignKeyRules(pool, "backup_jobs", "requested_by");

      assert.equal(userCreatedByRules[0]?.delete_rule, "SET NULL");
      assert.equal(tokenCreatedByRules[0]?.delete_rule, "SET NULL");
      assert.equal(resetRequestedByRules[0]?.delete_rule, "SET NULL");
      assert.equal(resetApprovedByRules[0]?.delete_rule, "SET NULL");
      assert.equal(importCreatedByRules[0]?.delete_rule, "SET NULL");
      assert.equal(backupCreatedByRules[0]?.delete_rule, "RESTRICT");
      assert.equal(backupJobRequestedByRules[0]?.delete_rule, "RESTRICT");

      const userRows = await pool.query<{ username: string; created_by: string | null }>(`
        SELECT username, created_by
        FROM public.users
        ORDER BY username ASC
      `);
      assert.deepEqual(userRows.rows, [
        { username: "Admin.User", created_by: null },
        { username: "Auditor.User", created_by: null },
        { username: "Ghost.User", created_by: null },
        { username: "Legacy.User", created_by: "system" },
        { username: "Subject.User", created_by: "Admin.User" },
        { username: "system", created_by: null },
      ]);

      const tokenRows = await pool.query<{ id: string; created_by: string | null }>(`
        SELECT id, created_by
        FROM public.account_activation_tokens
        ORDER BY id ASC
      `);
      assert.deepEqual(tokenRows.rows, [
        { id: "activation-1", created_by: "Admin.User" },
        { id: "activation-2", created_by: null },
      ]);

      const resetRows = await pool.query<{
        id: string;
        requested_by_user: string | null;
        approved_by: string | null;
      }>(`
        SELECT id, requested_by_user, approved_by
        FROM public.password_reset_requests
        ORDER BY id ASC
      `);
      assert.deepEqual(resetRows.rows, [
        { id: "reset-1", requested_by_user: "Auditor.User", approved_by: null },
        { id: "reset-2", requested_by_user: "system", approved_by: "system" },
      ]);

      const importRows = await pool.query<{ id: string; created_by: string | null }>(`
        SELECT id, created_by
        FROM public.imports
        ORDER BY id ASC
      `);
      assert.deepEqual(importRows.rows, [
        { id: "import-1", created_by: "system" },
        { id: "import-2", created_by: null },
      ]);

      const backupRows = await pool.query<{ id: string; created_by: string }>(`
        SELECT id, created_by
        FROM public.backups
        ORDER BY id ASC
      `);
      assert.deepEqual(backupRows.rows, [
        { id: "backup-1", created_by: "Admin.User" },
        { id: "backup-2", created_by: "system" },
      ]);
      assert.equal(await columnIsNotNull(pool, "backups", "created_by"), true);

      const backupJobRows = await pool.query<{ id: string; requested_by: string }>(`
        SELECT id::text AS id, requested_by
        FROM public.backup_jobs
        ORDER BY id ASC
      `);
      assert.deepEqual(backupJobRows.rows, [
        { id: "11111111-1111-1111-1111-111111111111", requested_by: "system" },
        { id: "22222222-2222-2222-2222-222222222222", requested_by: "system" },
      ]);
      assert.equal(await columnIsNotNull(pool, "backup_jobs", "requested_by"), true);

      await pool.query(`DELETE FROM public.users WHERE username = 'Auditor.User'`);
      const deletedAuditorRefs = await pool.query<{ requested_by_user: string | null }>(`
        SELECT requested_by_user
        FROM public.password_reset_requests
        WHERE id = 'reset-1'
      `);
      assert.equal(deletedAuditorRefs.rows[0]?.requested_by_user, null);

      await assert.rejects(
        () => pool.query(`DELETE FROM public.users WHERE username = 'Admin.User'`),
        /fk_backups_created_by_username/i,
      );
    });
  },
);

test(
  "reviewed timezone migration upgrades active schema timestamps to timestamptz without shifting UTC values",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      for (const migrationSql of preTimezoneMigrationSqlTexts) {
        await applySql(pool, migrationSql);
      }

      await pool.query(`
        INSERT INTO public.audit_logs (id, action, performed_by, "timestamp")
        VALUES ('audit-utc-preservation', 'TEST', 'system', TIMESTAMP '2026-04-08 09:10:11')
      `);

      await applySql(pool, timezoneMigrationSql);

      assert.equal(await columnDataType(pool, "users", "created_at"), "timestamp with time zone");
      assert.equal(await columnDataType(pool, "audit_logs", "timestamp"), "timestamp with time zone");
      assert.equal(await columnDataType(pool, "collection_records", "created_at"), "timestamp with time zone");
      assert.equal(await columnDataType(pool, "ai_messages", "created_at"), "timestamp with time zone");
      assert.equal(await columnDataType(pool, "system_settings", "updated_at"), "timestamp with time zone");

      const preservedTimestamp = await pool.query<{ utc_value: string }>(`
        SELECT to_char("timestamp" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS utc_value
        FROM public.audit_logs
        WHERE id = 'audit-utc-preservation'
      `);
      assert.equal(preservedTimestamp.rows[0]?.utc_value, "2026-04-08 09:10:11");
    });
  },
);

test(
  "reviewed schema integrity migration remains compatible with legacy imports, settings, and collection bootstrap flows",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.imports (
          id text PRIMARY KEY,
          name text,
          filename text,
          created_at timestamp DEFAULT now(),
          is_deleted boolean,
          created_by text
        );

        CREATE TABLE public.setting_categories (
          id uuid PRIMARY KEY,
          name text NOT NULL,
          description text,
          created_at timestamp DEFAULT now()
        );

        CREATE TABLE public.system_settings (
          id uuid PRIMARY KEY,
          category_id uuid,
          key text NOT NULL,
          label text NOT NULL,
          description text,
          type text NOT NULL,
          value text NOT NULL,
          default_value text,
          is_critical boolean DEFAULT false,
          updated_at timestamp DEFAULT now(),
          CONSTRAINT system_settings_category_id_fkey
            FOREIGN KEY (category_id)
            REFERENCES public.setting_categories(id)
            ON DELETE CASCADE
        );

        CREATE TABLE public.setting_options (
          id uuid PRIMARY KEY,
          setting_id uuid,
          value text NOT NULL,
          label text NOT NULL,
          CONSTRAINT setting_options_setting_id_fkey
            FOREIGN KEY (setting_id)
            REFERENCES public.system_settings(id)
            ON DELETE CASCADE
        );

        CREATE TABLE public.collection_records (
          id uuid PRIMARY KEY,
          customer_name text,
          ic_number text,
          customer_phone text,
          account_number text,
          batch text,
          payment_date date,
          amount numeric(14,2),
          receipt_file text,
          receipt_validation_status text,
          created_by_login text,
          collection_staff_nickname text,
          staff_username text,
          created_at timestamp DEFAULT now(),
          updated_at timestamp
        );

        CREATE TABLE public.collection_record_receipts (
          id uuid PRIMARY KEY,
          collection_record_id uuid,
          storage_path text,
          original_file_name text,
          original_mime_type text,
          original_extension text,
          file_size bigint,
          extraction_status text,
          receipt_date date,
          created_at timestamp
        );
      `);

      await pool.query(`
        INSERT INTO public.imports (id, name, filename, created_at, is_deleted, created_by)
        VALUES ('legacy-import', 'Legacy Import', 'legacy.csv', now(), NULL, 'system');

        INSERT INTO public.setting_categories (id, name, description)
        VALUES ('11111111-1111-1111-1111-111111111111'::uuid, 'General', 'Legacy category');

        INSERT INTO public.system_settings (
          id, category_id, key, label, type, value, updated_at
        )
        VALUES (
          '22222222-2222-2222-2222-222222222222'::uuid,
          '11111111-1111-1111-1111-111111111111'::uuid,
          'site_name',
          'Site Name',
          'text',
          'SQR',
          now()
        );

        INSERT INTO public.setting_options (id, setting_id, value, label)
        VALUES (
          '33333333-3333-3333-3333-333333333333'::uuid,
          '22222222-2222-2222-2222-222222222222'::uuid,
          'enabled',
          'Enabled'
        );

        INSERT INTO public.collection_records (
          id,
          customer_name,
          ic_number,
          customer_phone,
          account_number,
          batch,
          payment_date,
          amount,
          receipt_file,
          receipt_validation_status,
          created_by_login,
          collection_staff_nickname,
          staff_username,
          created_at,
          updated_at
        )
        VALUES (
          '44444444-4444-4444-4444-444444444444'::uuid,
          'Customer',
          '900101-01-1234',
          '0123456789',
          '1234567890',
          'B1',
          DATE '2026-04-08',
          50.00,
          NULL,
          'matched',
          'admin',
          'Collector Alpha',
          'staff.user',
          now(),
          now()
        );

        INSERT INTO public.collection_record_receipts (
          id,
          collection_record_id,
          storage_path,
          original_file_name,
          original_mime_type,
          original_extension,
          file_size,
          extraction_status,
          receipt_date,
          created_at
        )
        VALUES (
          '55555555-5555-5555-5555-555555555555'::uuid,
          '44444444-4444-4444-4444-444444444444'::uuid,
          '/uploads/collection-receipts/legacy-proof.jpg',
          'legacy-proof.jpg',
          'image/jpeg',
          '.jpg',
          1024,
          'processed',
          DATE '2026-04-08',
          now()
        );
      `);

      await applySql(pool, schemaIntegrityMigrationSql);
      await ensureCoreImportsTable(drizzle(pool));
      await ensureSettingsSchema(drizzle(pool));
      await ensureCollectionRecordsTables(drizzle(pool));

      assert.equal(await columnIsNotNull(pool, "imports", "is_deleted"), true);
      assert.equal(
        await pool
          .query<{ is_deleted: boolean }>(`SELECT is_deleted FROM public.imports WHERE id = 'legacy-import'`)
          .then((result) => result.rows[0]?.is_deleted),
        false,
      );

      const settingsCategoryRules = await foreignKeyRules(pool, "system_settings", "category_id");
      const settingOptionRules = await foreignKeyRules(pool, "setting_options", "setting_id");

      assert.equal(settingsCategoryRules.length, 1);
      assert.equal(settingsCategoryRules[0]?.update_rule, "CASCADE");
      assert.equal(settingsCategoryRules[0]?.delete_rule, "CASCADE");
      assert.equal(settingOptionRules.length, 1);
      assert.equal(settingOptionRules[0]?.update_rule, "CASCADE");
      assert.equal(settingOptionRules[0]?.delete_rule, "CASCADE");

      assert.equal(await indexExists(pool, "idx_collection_records_receipt_validation_status"), true);
      assert.equal(await indexExists(pool, "idx_collection_record_receipts_extraction_status"), true);
      assert.equal(await indexExists(pool, "idx_collection_record_receipts_receipt_date"), true);
      const amountComment = await columnComment(pool, "collection_records", "amount");
      const receiptTotalAmountComment = await columnComment(pool, "collection_records", "receipt_total_amount");
      const receiptAmountComment = await columnComment(pool, "collection_record_receipts", "receipt_amount");
      const extractedAmountComment = await columnComment(pool, "collection_record_receipts", "extracted_amount");

      assert.ok(amountComment);
      assert.ok(receiptTotalAmountComment);
      assert.ok(receiptAmountComment);
      assert.ok(extractedAmountComment);
      assert.match(amountComment, /MYR/i);
      assert.match(receiptTotalAmountComment, /sen\/cents/i);
      assert.match(receiptAmountComment, /sen\/cents/i);
      assert.match(extractedAmountComment, /sen\/cents/i);
    });
  },
);

test(
  "reviewed auth migrations remain compatible when users bootstrap runs afterward",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text,
          password text,
          role text,
          status text,
          created_at timestamp DEFAULT now(),
          password_changed_at timestamp
        );
        CREATE TABLE public.account_activation_tokens (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          token_hash text NOT NULL,
          expires_at timestamp NOT NULL,
          used_at timestamp
        );
        CREATE TABLE public.password_reset_requests (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          approved_by text,
          created_at timestamp DEFAULT now()
        );
      `);

      await pool.query(
        `
          INSERT INTO public.users (id, username, password, role, status)
          VALUES ($1, $2, $3, $4, $5)
        `,
        ["legacy-user", "LegacyUser", "legacy-plain-text", "ADMIN", "ACTIVE"],
      );
      await pool.query(
        `
          INSERT INTO public.account_activation_tokens (id, user_id, token_hash, expires_at)
          VALUES
            ('valid-token', 'legacy-user', 'token-hash', now() + interval '1 day'),
            ('orphan-token', 'missing-user', 'orphan-hash', now() + interval '1 day')
        `,
      );
      await pool.query(
        `
          INSERT INTO public.password_reset_requests (id, user_id, approved_by)
          VALUES
            ('valid-reset', 'legacy-user', NULL),
            ('orphan-reset', 'missing-user', NULL)
        `,
      );

      await applySql(pool, usersMigrationSql);
      await applySql(pool, authLifecycleMigrationSql);
      await ensureUsersBootstrapSchema(drizzle(pool));

      const userResult = await pool.query<{
        role: string;
        status: string;
        password_hash: string;
      }>(`
        SELECT role, status, password_hash
        FROM public.users
        WHERE id = 'legacy-user'
      `);
      const user = userResult.rows[0];

      assert.equal(user?.role, "admin");
      assert.equal(user?.status, "pending_activation");
      assert.match(String(user?.password_hash || ""), /^\$2[aby]\$/);
      assert.equal(await columnIsNotNull(pool, "users", "password_hash"), true);
      assert.equal(await columnIsNotNull(pool, "users", "is_banned"), true);
      assert.equal(
        await pool.query(`SELECT COUNT(*)::int AS count FROM public.account_activation_tokens WHERE user_id = 'missing-user'`).then((result) => result.rows[0]?.count),
        0,
      );
      assert.equal(
        await pool.query(`SELECT COUNT(*)::int AS count FROM public.password_reset_requests WHERE user_id = 'missing-user'`).then((result) => result.rows[0]?.count),
        0,
      );
      assert.match(String(await columnDefault(pool, "password_reset_requests", "reset_type") || ""), /email_link/i);
      assert.equal(await constraintExists(pool, "fk_password_reset_requests_user_id"), true);
      assert.equal(await indexExists(pool, "idx_password_reset_requests_token_hash_unique"), true);
    });
  },
);

test(
  "reviewed auth migrations remain idempotent when they run after users bootstrap",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text,
          password text,
          role text,
          status text,
          created_at timestamp DEFAULT now(),
          password_changed_at timestamp
        );
        CREATE TABLE public.account_activation_tokens (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          token_hash text NOT NULL,
          expires_at timestamp NOT NULL,
          used_at timestamp
        );
        CREATE TABLE public.password_reset_requests (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          approved_by text,
          created_at timestamp DEFAULT now()
        );
      `);

      await pool.query(
        `
          INSERT INTO public.users (id, username, password, role, status)
          VALUES ($1, $2, $3, $4, $5)
        `,
        ["legacy-user", "LegacyUser", "legacy-plain-text", "ADMIN", "ACTIVE"],
      );
      await pool.query(
        `
          INSERT INTO public.account_activation_tokens (id, user_id, token_hash, expires_at)
          VALUES
            ('valid-token', 'legacy-user', 'token-hash', now() + interval '1 day'),
            ('orphan-token', 'missing-user', 'orphan-hash', now() + interval '1 day')
        `,
      );
      await pool.query(
        `
          INSERT INTO public.password_reset_requests (id, user_id, approved_by)
          VALUES
            ('valid-reset', 'legacy-user', NULL),
            ('orphan-reset', 'missing-user', NULL)
        `,
      );

      await ensureUsersBootstrapSchema(drizzle(pool));
      await applySql(pool, usersMigrationSql);
      await applySql(pool, authLifecycleMigrationSql);

      const userResult = await pool.query<{
        role: string;
        status: string;
        password_hash: string;
      }>(`
        SELECT role, status, password_hash
        FROM public.users
        WHERE id = 'legacy-user'
      `);
      const user = userResult.rows[0];

      assert.equal(user?.role, "admin");
      assert.equal(user?.status, "pending_activation");
      assert.match(String(user?.password_hash || ""), /^\$2[aby]\$/);
      assert.equal(await columnIsNotNull(pool, "users", "is_banned"), true);
      assert.equal(await constraintExists(pool, "fk_account_activation_tokens_user_id"), true);
      assert.match(String(await columnDefault(pool, "password_reset_requests", "reset_type") || ""), /email_link/i);
      assert.equal(await indexExists(pool, "idx_password_reset_requests_pending_review"), true);
      assert.equal(
        await pool.query(`SELECT COUNT(*)::int AS count FROM public.password_reset_requests WHERE user_id = 'missing-user'`).then((result) => result.rows[0]?.count),
        0,
      );
    });
  },
);

test(
  "users, imports, and backups bootstrap helpers normalize user-reference actors and add safe foreign keys",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text,
          password text,
          role text,
          status text,
          created_by text,
          created_at timestamp DEFAULT now(),
          password_changed_at timestamp
        );

        CREATE TABLE public.account_activation_tokens (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          token_hash text NOT NULL,
          expires_at timestamp NOT NULL,
          used_at timestamp,
          created_by text
        );

        CREATE TABLE public.password_reset_requests (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          requested_by_user text,
          approved_by text,
          created_at timestamp DEFAULT now()
        );

        CREATE TABLE public.imports (
          id text PRIMARY KEY,
          name text,
          filename text,
          created_at timestamp,
          is_deleted boolean,
          created_by text
        );

        CREATE TABLE public.backups (
          id text PRIMARY KEY,
          name text,
          created_at timestamp,
          created_by text,
          backup_data text,
          metadata text
        );

        CREATE TABLE public.backup_jobs (
          id uuid PRIMARY KEY,
          type text,
          status text,
          requested_by text,
          requested_at timestamp,
          started_at timestamp,
          finished_at timestamp,
          updated_at timestamp,
          backup_id text,
          backup_name text,
          result jsonb,
          error jsonb
        );
      `);

      await pool.query(`
        INSERT INTO public.users (id, username, password, role, status, created_by)
        VALUES
          ('admin-user', 'Admin.User', 'legacy-password', 'ADMIN', 'ACTIVE', NULL),
          ('member-user', 'Member.User', 'legacy-password', 'USER', 'ACTIVE', 'legacy-create-user')
      `);
      await pool.query(`
        INSERT INTO public.account_activation_tokens (id, user_id, token_hash, expires_at, created_by)
        VALUES ('activation-1', 'member-user', 'hash-1', now() + interval '1 day', ' admin.user ')
      `);
      await pool.query(`
        INSERT INTO public.password_reset_requests (id, user_id, requested_by_user, approved_by)
        VALUES ('reset-1', 'member-user', ' system-bootstrap ', 'ghost.actor')
      `);
      await pool.query(`
        INSERT INTO public.imports (id, name, filename, created_by)
        VALUES
          ('import-1', NULL, 'legacy.csv', ' admin.user '),
          ('import-2', 'Ghost import', 'ghost.csv', 'ghost.actor')
      `);
      await pool.query(`
        INSERT INTO public.backups (id, name, created_by, backup_data)
        VALUES
          ('backup-1', 'Nightly', ' admin.user ', '{}'::text),
          ('backup-2', 'Legacy', NULL, '{}'::text)
      `);
      await pool.query(`
        INSERT INTO public.backup_jobs (id, type, status, requested_by, requested_at, updated_at)
        VALUES
          ('33333333-3333-3333-3333-333333333333'::uuid, 'create', NULL, 'ghost.actor', now(), now()),
          ('44444444-4444-4444-4444-444444444444'::uuid, 'restore', 'queued', NULL, now(), now())
      `);

      await ensureUsersBootstrapSchema(drizzle(pool));
      await ensureCoreImportsTable(drizzle(pool));
      await ensureBackupsBootstrapSchema(drizzle(pool));

      assert.equal(await constraintExists(pool, "fk_users_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_account_activation_tokens_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_password_reset_requests_requested_by_user_username"), true);
      assert.equal(await constraintExists(pool, "fk_password_reset_requests_approved_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_imports_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_backups_created_by_username"), true);
      assert.equal(await constraintExists(pool, "fk_backup_jobs_requested_by_username"), true);
      assert.equal(await constraintExists(pool, "chk_users_role"), true);
      assert.equal(await constraintExists(pool, "chk_users_status"), true);
      assert.equal(await constraintExists(pool, "chk_backup_jobs_status"), true);
      assert.equal(await indexExists(pool, "idx_users_created_by"), true);
      assert.equal(await indexExists(pool, "idx_backups_created_by"), true);
      assert.equal(await indexExists(pool, "idx_backup_jobs_requested_by"), true);
      assert.equal(await columnIsNotNull(pool, "backup_jobs", "status"), true);

      const usersRows = await pool.query<{ username: string; created_by: string | null }>(`
        SELECT username, created_by
        FROM public.users
        ORDER BY username ASC
      `);
      assert.deepEqual(usersRows.rows, [
        { username: "Admin.User", created_by: null },
        { username: "Member.User", created_by: "system" },
        { username: "system", created_by: null },
      ]);

      const importsRows = await pool.query<{ id: string; created_by: string | null }>(`
        SELECT id, created_by
        FROM public.imports
        ORDER BY id ASC
      `);
      assert.deepEqual(importsRows.rows, [
        { id: "import-1", created_by: "Admin.User" },
        { id: "import-2", created_by: null },
      ]);

      const backupRows = await pool.query<{ id: string; created_by: string }>(`
        SELECT id, created_by
        FROM public.backups
        ORDER BY id ASC
      `);
      assert.deepEqual(backupRows.rows, [
        { id: "backup-1", created_by: "Admin.User" },
        { id: "backup-2", created_by: "system" },
      ]);

      const backupJobRows = await pool.query<{ id: string; requested_by: string; status: string }>(`
        SELECT id::text AS id, requested_by, status
        FROM public.backup_jobs
        ORDER BY id ASC
      `);
      assert.deepEqual(backupJobRows.rows, [
        { id: "33333333-3333-3333-3333-333333333333", requested_by: "system", status: "queued" },
        { id: "44444444-4444-4444-4444-444444444444", requested_by: "system", status: "queued" },
      ]);
    });
  },
);

test(
  "core activity and monitor bootstrap helpers normalize enum-like text fields and add safe check constraints",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text,
          password text,
          role text,
          status text,
          created_at timestamp DEFAULT now(),
          password_changed_at timestamp
        );

        CREATE TABLE public.user_activity (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          username text NOT NULL,
          role text NOT NULL,
          is_active boolean,
          login_time timestamp with time zone,
          last_activity_time timestamp with time zone
        );

        CREATE TABLE public.banned_sessions (
          id text PRIMARY KEY,
          username text NOT NULL,
          role text NOT NULL,
          activity_id text NOT NULL,
          fingerprint text,
          ip_address text,
          browser text,
          pc_name text,
          banned_at timestamp with time zone
        );

        CREATE TABLE public.monitor_alert_incidents (
          id uuid PRIMARY KEY,
          alert_key text,
          severity text,
          source text,
          message text,
          status text,
          first_seen_at timestamp with time zone,
          last_seen_at timestamp with time zone,
          resolved_at timestamp with time zone,
          updated_at timestamp with time zone
        );
      `);

      await pool.query(`
        INSERT INTO public.users (id, username, password, role, status)
        VALUES ('legacy-user', 'LegacyUser', 'legacy-plain-text', 'ADMIN', 'ACTIVE');

        INSERT INTO public.user_activity (id, user_id, username, role, is_active)
        VALUES ('activity-1', 'legacy-user', 'LegacyUser', 'operator', NULL);

        INSERT INTO public.banned_sessions (id, username, role, activity_id, banned_at)
        VALUES ('ban-1', 'LegacyUser', 'root', 'activity-1', NULL);

        INSERT INTO public.monitor_alert_incidents (
          id, alert_key, severity, message, status, first_seen_at, last_seen_at, updated_at
        )
        VALUES (
          '77777777-7777-7777-7777-777777777777'::uuid,
          'alert-1',
          'warn',
          '',
          'closed',
          NULL,
          NULL,
          NULL
        );
      `);

      await ensureUsersBootstrapSchema(drizzle(pool));
      await ensureCoreUserActivityTable(drizzle(pool));
      await ensureCoreBannedSessionsTable(drizzle(pool));
      await ensureCoreMonitorAlertHistoryTable(drizzle(pool));

      assert.equal(await constraintExists(pool, "chk_user_activity_role"), true);
      assert.equal(await constraintExists(pool, "chk_banned_sessions_role"), true);
      assert.equal(await constraintExists(pool, "chk_monitor_alert_incidents_severity"), true);
      assert.equal(await constraintExists(pool, "chk_monitor_alert_incidents_status"), true);
      assert.equal(await columnIsNotNull(pool, "user_activity", "role"), true);
      assert.equal(await columnIsNotNull(pool, "banned_sessions", "role"), true);
      assert.equal(await columnIsNotNull(pool, "monitor_alert_incidents", "severity"), true);
      assert.equal(await columnIsNotNull(pool, "monitor_alert_incidents", "status"), true);

      const activityRows = await pool.query<{ role: string; is_active: boolean }>(`
        SELECT role, is_active
        FROM public.user_activity
        WHERE id = 'activity-1'
      `);
      assert.deepEqual(activityRows.rows, [{ role: "user", is_active: true }]);

      const bannedRows = await pool.query<{ role: string }>(`
        SELECT role
        FROM public.banned_sessions
        WHERE id = 'ban-1'
      `);
      assert.deepEqual(bannedRows.rows, [{ role: "user" }]);

      const monitorRows = await pool.query<{ severity: string; status: string; message: string }>(`
        SELECT severity, status, message
        FROM public.monitor_alert_incidents
        WHERE id = '77777777-7777-7777-7777-777777777777'::uuid
      `);
      assert.deepEqual(monitorRows.rows, [{ severity: "INFO", status: "open", message: "Monitor alert" }]);
    });
  },
);

test(
  "reviewed collection migrations remain compatible when collection bootstrap runs afterward",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      const recordId = "11111111-1111-1111-1111-111111111111";

      await pool.query(`
        CREATE TABLE public.collection_records (
          id uuid PRIMARY KEY,
          customer_name text,
          ic_number text,
          customer_phone text,
          account_number text,
          batch text,
          payment_date date,
          amount numeric(14,2),
          receipt_file text,
          created_by_login text,
          collection_staff_nickname text,
          staff_username text,
          created_at timestamp DEFAULT now(),
          updated_at timestamp
        );
        CREATE TABLE public.collection_record_receipts (
          id uuid PRIMARY KEY,
          collection_record_id uuid,
          storage_path text,
          original_file_name text,
          original_mime_type text,
          original_extension text,
          file_size bigint,
          created_at timestamp
        );
      `);

      await pool.query(
        `
          INSERT INTO public.collection_records (
            id, customer_name, ic_number, customer_phone, account_number, batch,
            payment_date, amount, receipt_file, created_by_login, collection_staff_nickname,
            staff_username, created_at, updated_at
          )
          VALUES (
            $1::uuid, 'Customer', '900101-01-1234', '', '1234567890', 'B1',
            DATE '2026-03-24', 50.00, '/uploads/receipts/legacy-proof.jpg', '', '', '',
            now(), NULL
          )
        `,
        [recordId],
      );
      await pool.query(`
        INSERT INTO public.collection_record_receipts (
          id, collection_record_id, storage_path, original_file_name, original_mime_type, original_extension, file_size, created_at
        )
        VALUES
          ('22222222-2222-2222-2222-222222222222'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, '/uploads/receipts/orphan.jpg', '', '', '', NULL, NULL),
          ('44444444-4444-4444-4444-444444444444'::uuid, NULL, '', '', '', '', NULL, NULL)
      `);

      await applySql(pool, collectionRecordMigrationSql);
      await applySql(pool, collectionRecordDailyRollupMigrationSql);
      await applySql(pool, collectionRecordDailyRollupQueueMigrationSql);
      await applySql(pool, monitorAndMonthlyRollupsMigrationSql);
      await applySql(pool, collectionPiiShadowMigrationSql);
      await ensureCollectionRecordsTables(drizzle(pool));

      const recordResult = await pool.query<{
        customer_phone: string | null;
        created_by_login: string;
        collection_staff_nickname: string;
        staff_username: string;
        updated_at: Date;
      }>(`
        SELECT customer_phone, created_by_login, collection_staff_nickname, staff_username, updated_at
        FROM public.collection_records
        WHERE id = $1::uuid
      `, [recordId]);
      const record = recordResult.rows[0];

      assert.equal(record?.customer_phone, null);
      assert.equal(record?.created_by_login, "unknown");
      assert.equal(record?.collection_staff_nickname, "unknown");
      assert.equal(record?.staff_username, "unknown");
      assert.ok(record?.updated_at instanceof Date);
      assert.equal(await columnIsNotNull(pool, "collection_records", "customer_name"), false);
      assert.equal(await columnIsNotNull(pool, "collection_records", "ic_number"), false);
      assert.equal(await columnIsNotNull(pool, "collection_records", "customer_phone"), false);
      assert.equal(await columnIsNotNull(pool, "collection_records", "account_number"), false);

      const receiptResult = await pool.query<{
        storage_path: string;
        original_file_name: string;
        original_mime_type: string;
      }>(`
        SELECT storage_path, original_file_name, original_mime_type
        FROM public.collection_record_receipts
        WHERE collection_record_id = $1::uuid
        ORDER BY created_at ASC
      `, [recordId]);

      assert.equal(receiptResult.rows.length, 1);
      assert.equal(receiptResult.rows[0]?.storage_path, "/uploads/receipts/legacy-proof.jpg");
      assert.equal(receiptResult.rows[0]?.original_file_name, "legacy-proof.jpg");
      assert.equal(receiptResult.rows[0]?.original_mime_type, "image/jpeg");
      const rollupResult = await pool.query<{
        total_records: number;
        total_amount: string;
      }>(`
        SELECT total_records, total_amount
        FROM public.collection_record_daily_rollups
        WHERE payment_date = DATE '2026-03-24'
          AND created_by_login = 'unknown'
          AND collection_staff_nickname = 'unknown'
      `);
      assert.equal(rollupResult.rows[0]?.total_records, 1);
      assert.equal(Number(rollupResult.rows[0]?.total_amount || 0), 50);
      const monthlyRollupResult = await pool.query<{
        total_records: number;
        total_amount: string;
      }>(`
        SELECT total_records, total_amount
        FROM public.collection_record_monthly_rollups
        WHERE year = 2026
          AND month = 3
          AND created_by_login = 'unknown'
          AND collection_staff_nickname = 'unknown'
      `);
      assert.equal(monthlyRollupResult.rows[0]?.total_records, 1);
      assert.equal(Number(monthlyRollupResult.rows[0]?.total_amount || 0), 50);
      assert.equal(
        await pool.query(`SELECT COUNT(*)::int AS count FROM public.collection_record_receipts WHERE collection_record_id = '33333333-3333-3333-3333-333333333333'::uuid`).then((result) => result.rows[0]?.count),
        0,
      );
      assert.equal(await constraintExists(pool, "fk_collection_record_receipts_record_id"), true);
      assert.equal(await constraintExists(pool, "idx_collection_record_daily_rollups_slice_unique"), true);
      assert.equal(await constraintExists(pool, "idx_collection_rollup_refresh_queue_slice_unique"), true);
      assert.equal(await constraintExists(pool, "idx_collection_record_monthly_rollups_slice_unique"), true);
      assert.equal(await indexExists(pool, "idx_collection_record_receipts_record_storage_unique"), true);
      assert.equal(await indexExists(pool, "idx_collection_record_daily_rollups_slice_unique"), true);
      assert.equal(await indexExists(pool, "idx_collection_rollup_refresh_queue_slice_unique"), true);
      assert.equal(await indexExists(pool, "idx_collection_record_monthly_rollups_slice_unique"), true);
    });
  },
);

test(
  "reviewed collection migrations remain idempotent when they run after collection bootstrap",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      const recordId = "55555555-5555-5555-5555-555555555555";

      await pool.query(`
        CREATE TABLE public.collection_records (
          id uuid PRIMARY KEY,
          customer_name text,
          ic_number text,
          customer_phone text,
          account_number text,
          batch text,
          payment_date date,
          amount numeric(14,2),
          receipt_file text,
          created_by_login text,
          collection_staff_nickname text,
          staff_username text,
          created_at timestamp DEFAULT now(),
          updated_at timestamp
        );
        CREATE TABLE public.collection_record_receipts (
          id uuid PRIMARY KEY,
          collection_record_id uuid,
          storage_path text,
          original_file_name text,
          original_mime_type text,
          original_extension text,
          file_size bigint,
          created_at timestamp
        );
      `);

      await pool.query(
        `
          INSERT INTO public.collection_records (
            id, customer_name, ic_number, customer_phone, account_number, batch,
            payment_date, amount, receipt_file, created_by_login, collection_staff_nickname,
            staff_username, created_at, updated_at
          )
          VALUES (
            $1::uuid, 'Customer', '900101-01-5678', '', '0987654321', 'B2',
            DATE '2026-03-24', 88.00, '/uploads/receipts/bootstrap-proof.png', '', '', '',
            now(), NULL
          )
        `,
        [recordId],
      );

      await ensureCollectionRecordsTables(drizzle(pool));
      await applySql(pool, collectionRecordMigrationSql);
      await applySql(pool, collectionRecordDailyRollupMigrationSql);
      await applySql(pool, collectionRecordDailyRollupQueueMigrationSql);
      await applySql(pool, monitorAndMonthlyRollupsMigrationSql);
      await applySql(pool, collectionPiiShadowMigrationSql);
      await applySql(pool, collectionPiiPlaintextNullableMigrationSql);

      const receiptCount = await pool.query<{ count: number }>(
        `
          SELECT COUNT(*)::int AS count
          FROM public.collection_record_receipts
          WHERE collection_record_id = $1::uuid
        `,
        [recordId],
      );
      const record = await pool.query<{
        customer_phone: string | null;
        created_by_login: string;
        collection_staff_nickname: string;
        staff_username: string;
      }>(
        `
          SELECT customer_phone, created_by_login, collection_staff_nickname, staff_username
          FROM public.collection_records
          WHERE id = $1::uuid
        `,
        [recordId],
      );

      assert.equal(receiptCount.rows[0]?.count, 1);
      assert.equal(record.rows[0]?.customer_phone, null);
      assert.equal(record.rows[0]?.created_by_login, "unknown");
      assert.equal(record.rows[0]?.collection_staff_nickname, "unknown");
      assert.equal(record.rows[0]?.staff_username, "unknown");
      const rollupCount = await pool.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count
        FROM public.collection_record_daily_rollups
        WHERE payment_date = DATE '2026-03-24'
          AND created_by_login = 'unknown'
          AND collection_staff_nickname = 'unknown'
      `);
      const monthlyRollupCount = await pool.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count
        FROM public.collection_record_monthly_rollups
        WHERE year = 2026
          AND month = 3
          AND created_by_login = 'unknown'
          AND collection_staff_nickname = 'unknown'
      `);
      assert.equal(rollupCount.rows[0]?.count, 1);
      assert.equal(monthlyRollupCount.rows[0]?.count, 1);
      assert.equal(await constraintExists(pool, "fk_collection_record_receipts_record_id"), true);
      assert.equal(await constraintExists(pool, "idx_collection_record_daily_rollups_slice_unique"), true);
      assert.equal(await constraintExists(pool, "idx_collection_rollup_refresh_queue_slice_unique"), true);
      assert.equal(await constraintExists(pool, "idx_collection_record_monthly_rollups_slice_unique"), true);
      assert.equal(await indexExists(pool, "idx_collection_records_lower_created_by_payment_created_id"), true);
      assert.equal(await indexExists(pool, "idx_collection_record_daily_rollups_slice_unique"), true);
      assert.equal(await indexExists(pool, "idx_collection_rollup_refresh_queue_slice_unique"), true);
      assert.equal(await indexExists(pool, "idx_collection_record_monthly_rollups_slice_unique"), true);
    });
  },
);

test(
  "reviewed collection bootstrap adds safe created_by_login foreign keys when users bootstrap already provisioned the system actor",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await pool.query(`
        CREATE TABLE public.users (
          id text PRIMARY KEY,
          username text,
          password text,
          role text,
          status text,
          created_at timestamp DEFAULT now(),
          password_changed_at timestamp
        );
      `);
      await pool.query(
        `
          INSERT INTO public.users (id, username, password, role, status)
          VALUES ($1, $2, $3, $4, $5)
        `,
        ["legacy-user", "Admin.User", "legacy-plain-text", "ADMIN", "ACTIVE"],
      );

      await ensureUsersBootstrapSchema(drizzle(pool));

      await pool.query(`
        CREATE TABLE public.collection_records (
          id uuid PRIMARY KEY,
          customer_name text,
          ic_number text,
          customer_phone text,
          account_number text,
          batch text,
          payment_date date,
          amount numeric(14,2),
          receipt_file text,
          created_by_login text,
          collection_staff_nickname text,
          staff_username text,
          created_at timestamp DEFAULT now(),
          updated_at timestamp
        );
      `);
      await pool.query(`
        INSERT INTO public.collection_records (
          id,
          customer_name,
          batch,
          payment_date,
          amount,
          receipt_file,
          created_by_login,
          collection_staff_nickname,
          staff_username,
          created_at,
          updated_at
        )
        VALUES
          (
            '88888888-8888-8888-8888-888888888881'::uuid,
            'Customer A',
            'B1',
            DATE '2026-03-24',
            50.00,
            NULL,
            ' admin.user ',
            'Collector Alpha',
            'Collector Alpha',
            now(),
            NULL
          ),
          (
            '88888888-8888-8888-8888-888888888882'::uuid,
            'Customer B',
            'B1',
            DATE '2026-03-24',
            55.00,
            NULL,
            'ghost.user',
            'Collector Beta',
            'Collector Beta',
            now(),
            NULL
          )
      `);

      await ensureCollectionRecordsTables(drizzle(pool));

      const actorRows = await pool.query<{ created_by_login: string }>(`
        SELECT created_by_login
        FROM public.collection_records
        ORDER BY id ASC
      `);
      assert.deepEqual(actorRows.rows, [
        { created_by_login: "Admin.User" },
        { created_by_login: "system" },
      ]);
      assert.equal(await constraintExists(pool, "fk_collection_records_created_by_login_username"), true);
    });
  },
);

test(
  "collection bootstrap backfills encrypted PII shadow columns when a collection PII key is configured",
  { skip: skipReason || false },
  async () => {
    const previousCollectionPiiKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
    process.env.COLLECTION_PII_ENCRYPTION_KEY = "test-collection-pii-encryption-key";

    try {
      await withTempDatabase(async ({ pool }) => {
        const recordId = "66666666-6666-6666-6666-666666666666";

        await pool.query(`
          CREATE TABLE public.collection_records (
            id uuid PRIMARY KEY,
            customer_name text,
            ic_number text,
            customer_phone text,
            account_number text,
            batch text,
            payment_date date,
            amount numeric(14,2),
            receipt_file text,
            created_by_login text,
            collection_staff_nickname text,
            staff_username text,
            created_at timestamp DEFAULT now(),
            updated_at timestamp
          );
        `);

        await pool.query(
          `
            INSERT INTO public.collection_records (
              id, customer_name, ic_number, customer_phone, account_number, batch,
              payment_date, amount, receipt_file, created_by_login, collection_staff_nickname,
              staff_username, created_at, updated_at
            )
            VALUES (
              $1::uuid, 'Encrypted Customer', '900101015555', '0123000001', 'ACC-1001', 'B3',
              DATE '2026-04-08', 50.00, NULL, 'system', 'Collector Alpha', 'Collector Alpha',
              now(), now()
            )
          `,
          [recordId],
        );

        await ensureCollectionRecordsTables(drizzle(pool));

        assert.equal(await columnDataType(pool, "collection_records", "customer_name_encrypted"), "text");
        assert.equal(await columnDataType(pool, "collection_records", "ic_number_encrypted"), "text");
        assert.equal(await columnDataType(pool, "collection_records", "customer_phone_encrypted"), "text");
        assert.equal(await columnDataType(pool, "collection_records", "account_number_encrypted"), "text");
        assert.equal(await indexExists(pool, "idx_collection_records_customer_name_search_hashes"), true);

        const encryptedRecord = await pool.query<{
          customer_name_encrypted: string | null;
          customer_name_search_hashes: string[] | null;
          ic_number_encrypted: string | null;
          customer_phone_encrypted: string | null;
          account_number_encrypted: string | null;
        }>(`
          SELECT
            customer_name_encrypted,
            customer_name_search_hashes,
            ic_number_encrypted,
            customer_phone_encrypted,
            account_number_encrypted
          FROM public.collection_records
          WHERE id = $1::uuid
        `, [recordId]);

        const row = encryptedRecord.rows[0];
        assert.ok(row?.customer_name_encrypted);
        assert.ok(Array.isArray(row?.customer_name_search_hashes));
        assert.ok((row?.customer_name_search_hashes?.length ?? 0) > 0);
        assert.ok(row?.ic_number_encrypted);
        assert.ok(row?.customer_phone_encrypted);
        assert.ok(row?.account_number_encrypted);
        assert.equal(decryptCollectionPiiValue(String(row?.customer_name_encrypted || "")), "Encrypted Customer");
        assert.equal(decryptCollectionPiiValue(String(row?.ic_number_encrypted || "")), "900101015555");
        assert.equal(decryptCollectionPiiValue(String(row?.customer_phone_encrypted || "")), "0123000001");
        assert.equal(decryptCollectionPiiValue(String(row?.account_number_encrypted || "")), "ACC-1001");
      });
    } finally {
      if (previousCollectionPiiKey === undefined) {
        delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
      } else {
        process.env.COLLECTION_PII_ENCRYPTION_KEY = previousCollectionPiiKey;
      }
    }
  },
);
