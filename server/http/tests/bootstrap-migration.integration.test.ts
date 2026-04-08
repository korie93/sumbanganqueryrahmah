import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ensureCollectionRecordsTables } from "../../internal/collection-bootstrap-records";
import { ensureCoreImportsTable } from "../../internal/core-schema-bootstrap-imports";
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
  "reviewed pre-user migrations remain compatible before users exists and users migration restores deferred constraints",
  { skip: skipReason || false },
  async () => {
    await withTempDatabase(async ({ pool }) => {
      await applySql(pool, storageMigrationSql);
      await applySql(pool, collectionAccessMigrationSql);
      await applySql(pool, usersMigrationSql);

      assert.equal(await constraintExists(pool, "fk_user_activity_user_id"), true);
      assert.equal(await constraintExists(pool, "fk_data_rows_import_id"), true);
      assert.equal(await constraintExists(pool, "fk_admin_group_members_admin_group_id"), true);
      assert.equal(await constraintExists(pool, "fk_collection_nickname_sessions_activity_id"), true);
      assert.equal(await constraintExists(pool, "fk_admin_visible_nicknames_nickname_id"), true);
      assert.equal(await constraintExists(pool, "fk_admin_visible_nicknames_admin_user_id"), true);
      assert.equal(await indexExists(pool, "idx_user_activity_user_id"), true);
      assert.equal(await indexExists(pool, "idx_admin_visible_nicknames_admin_nickname_unique"), true);
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
        customer_phone: string;
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

      assert.equal(record?.customer_phone, "-");
      assert.equal(record?.created_by_login, "unknown");
      assert.equal(record?.collection_staff_nickname, "unknown");
      assert.equal(record?.staff_username, "unknown");
      assert.ok(record?.updated_at instanceof Date);

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

      const receiptCount = await pool.query<{ count: number }>(
        `
          SELECT COUNT(*)::int AS count
          FROM public.collection_record_receipts
          WHERE collection_record_id = $1::uuid
        `,
        [recordId],
      );
      const record = await pool.query<{
        customer_phone: string;
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
      assert.equal(record.rows[0]?.customer_phone, "-");
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

        const encryptedRecord = await pool.query<{
          customer_name_encrypted: string | null;
          ic_number_encrypted: string | null;
          customer_phone_encrypted: string | null;
          account_number_encrypted: string | null;
        }>(`
          SELECT
            customer_name_encrypted,
            ic_number_encrypted,
            customer_phone_encrypted,
            account_number_encrypted
          FROM public.collection_records
          WHERE id = $1::uuid
        `, [recordId]);

        const row = encryptedRecord.rows[0];
        assert.ok(row?.customer_name_encrypted);
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
