var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// shared/schema-postgres.ts
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { jsonb } from "drizzle-orm/pg-core";
var users, imports, dataRows, userActivity, auditLogs, backups, insertUserSchema, insertImportSchema, insertDataRowSchema, insertUserActivitySchema, insertAuditLogSchema, insertBackupSchema, loginSchema, importRelations, dataRowRelations;
var init_schema_postgres = __esm({
  "shared/schema-postgres.ts"() {
    "use strict";
    users = pgTable("users", {
      id: text("id").primaryKey(),
      username: text("username").notNull().unique(),
      passwordHash: text("password_hash").notNull(),
      role: text("role").notNull().default("user"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull(),
      passwordChangedAt: timestamp("password_changed_at"),
      isBanned: boolean("is_banned").default(false)
    });
    imports = pgTable("imports", {
      id: text("id").primaryKey(),
      name: text("name").notNull(),
      filename: text("filename").notNull(),
      createdAt: timestamp("created_at").defaultNow(),
      isDeleted: boolean("is_deleted").default(false),
      createdBy: text("created_by")
    });
    dataRows = pgTable("data_rows", {
      id: text("id").primaryKey(),
      importId: text("import_id").notNull(),
      jsonDataJsonb: jsonb("json_data").notNull()
      // guna satu column sahaja
    });
    userActivity = pgTable("user_activity", {
      id: text("id").primaryKey(),
      userId: text("user_id").notNull(),
      username: text("username").notNull(),
      role: text("role").notNull(),
      pcName: text("pc_name"),
      browser: text("browser"),
      fingerprint: text("fingerprint"),
      ipAddress: text("ip_address"),
      loginTime: timestamp("login_time"),
      logoutTime: timestamp("logout_time"),
      lastActivityTime: timestamp("last_activity_time"),
      isActive: boolean("is_active").default(true),
      logoutReason: text("logout_reason")
    });
    auditLogs = pgTable("audit_logs", {
      id: text("id").primaryKey(),
      action: text("action").notNull(),
      performedBy: text("performed_by").notNull(),
      targetUser: text("target_user"),
      targetResource: text("target_resource"),
      details: text("details"),
      timestamp: timestamp("timestamp").defaultNow()
    });
    backups = pgTable("backups", {
      id: text("id").primaryKey(),
      name: text("name").notNull(),
      createdAt: timestamp("created_at").defaultNow(),
      createdBy: text("created_by").notNull(),
      backupData: text("backup_data").notNull(),
      metadata: text("metadata")
    });
    insertUserSchema = z.object({
      username: z.string().min(1, "Username is required"),
      password: z.string().min(1, "Password is required"),
      role: z.string().optional()
    });
    insertImportSchema = createInsertSchema(imports).pick({
      name: true,
      filename: true
    });
    insertDataRowSchema = z.object({
      importId: z.string(),
      jsonDataJsonb: z.record(z.any())
    });
    insertUserActivitySchema = createInsertSchema(userActivity).pick({
      userId: true,
      username: true,
      role: true,
      pcName: true,
      browser: true,
      fingerprint: true,
      ipAddress: true
    });
    insertAuditLogSchema = createInsertSchema(auditLogs).pick({
      action: true,
      performedBy: true,
      targetUser: true,
      targetResource: true,
      details: true
    });
    insertBackupSchema = createInsertSchema(backups).pick({
      name: true,
      createdBy: true,
      backupData: true,
      metadata: true
    });
    loginSchema = z.object({
      username: z.string().min(1, "Username is required"),
      password: z.string().min(1, "Password is required"),
      fingerprint: z.string().optional()
    });
    importRelations = relations(imports, ({ many }) => ({
      rows: many(dataRows)
    }));
    dataRowRelations = relations(dataRows, ({ one }) => ({
      import: one(imports, {
        fields: [dataRows.importId],
        references: [imports.id]
      })
    }));
  }
});

// server/db-postgres.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
var Pool, pool, db;
var init_db_postgres = __esm({
  "server/db-postgres.ts"() {
    "use strict";
    ({ Pool } = pg);
    pool = new Pool({
      host: process.env.PG_HOST || "localhost",
      port: Number(process.env.PG_PORT || 5432),
      user: process.env.PG_USER || "postgres",
      password: process.env.PG_PASSWORD || "Postgres@123",
      database: process.env.PG_DATABASE || "sqr_db",
      max: 5,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 5e3,
      options: "-c search_path=public"
    });
    db = drizzle(pool);
  }
});

// server/storage-postgres.ts
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import { eq, desc, and, or, gte, lte, count, sql, inArray } from "drizzle-orm";
import crypto from "crypto";
function detectValueType(value) {
  if (!value) return "string";
  if (!isNaN(Number(value))) {
    return "number";
  }
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return "date";
  }
  return "string";
}
function buildSqlCondition(field, operator, value) {
  const column = sql`json_data_jsonb ->> ${field}`;
  const valueType = detectValueType(value);
  switch (operator) {
    case "contains":
      return sql`${column} ILIKE ${"%" + value + "%"}`;
    case "equals":
      return sql`${column} = ${value}`;
    case "notEquals":
      return sql`${column} <> ${value}`;
    case "startsWith":
      return sql`${column} ILIKE ${value + "%"}`;
    case "endsWith":
      return sql`${column} ILIKE ${"%" + value}`;
    case "greaterThan":
      if (valueType === "number") {
        return sql`(${column})::numeric > ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql`(${column})::date > ${value}`;
      }
      return sql`false`;
    case "lessThan":
      if (valueType === "number") {
        return sql`(${column})::numeric < ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql`(${column})::date < ${value}`;
      }
      return sql`false`;
    case "greaterThanOrEqual":
      if (valueType === "number") {
        return sql`(${column})::numeric >= ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql`(${column})::date >= ${value}`;
      }
      return sql`false`;
    case "lessThanOrEqual":
      if (valueType === "number") {
        return sql`(${column})::numeric <= ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql`(${column})::date <= ${value}`;
      }
      return sql`false`;
  }
}
var MAX_SEARCH_LIMIT, QUERY_PAGE_LIMIT, MAX_COLUMN_KEYS, ANALYTICS_TZ, STORAGE_DEBUG_LOGS, BCRYPT_COST, ALLOWED_OPERATORS, BACKUP_CHUNK_SIZE, ROLE_TAB_SETTINGS, roleTabSettingKey, PostgresStorage;
var init_storage_postgres = __esm({
  "server/storage-postgres.ts"() {
    "use strict";
    init_schema_postgres();
    init_db_postgres();
    MAX_SEARCH_LIMIT = 200;
    QUERY_PAGE_LIMIT = 1e3;
    MAX_COLUMN_KEYS = 500;
    ANALYTICS_TZ = process.env.ANALYTICS_TZ || "Asia/Kuala_Lumpur";
    STORAGE_DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";
    BCRYPT_COST = 12;
    ALLOWED_OPERATORS = /* @__PURE__ */ new Set([
      "contains",
      "equals",
      "notEquals",
      "startsWith",
      "endsWith",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
      "isEmpty",
      "isNotEmpty"
    ]);
    BACKUP_CHUNK_SIZE = 500;
    ROLE_TAB_SETTINGS = {
      admin: [
        { pageId: "home", suffix: "home", label: "Admin Tab: Home", description: "Allow admin to open Home tab.", defaultEnabled: true },
        { pageId: "import", suffix: "import", label: "Admin Tab: Import", description: "Allow admin to open Import tab.", defaultEnabled: true },
        { pageId: "saved", suffix: "saved", label: "Admin Tab: Saved", description: "Allow admin to open Saved tab.", defaultEnabled: true },
        { pageId: "viewer", suffix: "viewer", label: "Admin Tab: Viewer", description: "Allow admin to open Viewer tab.", defaultEnabled: true },
        { pageId: "general-search", suffix: "general_search", label: "Admin Tab: Search", description: "Allow admin to open Search tab.", defaultEnabled: true },
        { pageId: "analysis", suffix: "analysis", label: "Admin Tab: Analysis", description: "Allow admin to open Analysis tab.", defaultEnabled: true },
        { pageId: "dashboard", suffix: "dashboard", label: "Admin Tab: Dashboard", description: "Allow admin to open Dashboard tab.", defaultEnabled: false },
        { pageId: "monitor", suffix: "monitor", label: "Admin Tab: System Monitor", description: "Allow admin to open System Monitor tab.", defaultEnabled: true },
        { pageId: "activity", suffix: "activity", label: "Admin Tab: Activity", description: "Allow admin to open Activity tab.", defaultEnabled: false },
        { pageId: "audit-logs", suffix: "audit_logs", label: "Admin Tab: Audit", description: "Allow admin to open Audit tab.", defaultEnabled: false },
        { pageId: "backup", suffix: "backup", label: "Admin Tab: Backup", description: "Allow admin to open Backup tab.", defaultEnabled: false },
        { pageId: "settings", suffix: "settings", label: "Admin Tab: Settings", description: "Allow admin to open Settings tab.", defaultEnabled: true }
      ],
      user: [
        { pageId: "home", suffix: "home", label: "User Tab: Home", description: "Allow user to open Home tab.", defaultEnabled: false },
        { pageId: "import", suffix: "import", label: "User Tab: Import", description: "Allow user to open Import tab.", defaultEnabled: false },
        { pageId: "saved", suffix: "saved", label: "User Tab: Saved", description: "Allow user to open Saved tab.", defaultEnabled: false },
        { pageId: "viewer", suffix: "viewer", label: "User Tab: Viewer", description: "Allow user to open Viewer tab.", defaultEnabled: false },
        { pageId: "general-search", suffix: "general_search", label: "User Tab: Search", description: "Allow user to open Search tab.", defaultEnabled: true },
        { pageId: "analysis", suffix: "analysis", label: "User Tab: Analysis", description: "Allow user to open Analysis tab.", defaultEnabled: false },
        { pageId: "dashboard", suffix: "dashboard", label: "User Tab: Dashboard", description: "Allow user to open Dashboard tab.", defaultEnabled: false },
        { pageId: "monitor", suffix: "monitor", label: "User Tab: System Monitor", description: "Allow user to open System Monitor tab.", defaultEnabled: false },
        { pageId: "activity", suffix: "activity", label: "User Tab: Activity", description: "Allow user to open Activity tab.", defaultEnabled: false },
        { pageId: "audit-logs", suffix: "audit_logs", label: "User Tab: Audit", description: "Allow user to open Audit tab.", defaultEnabled: false },
        { pageId: "backup", suffix: "backup", label: "User Tab: Backup", description: "Allow user to open Backup tab.", defaultEnabled: false }
      ]
    };
    roleTabSettingKey = (role, suffix) => `tab_${role}_${suffix}_enabled`;
    PostgresStorage = class {
      constructor() {
        this.settingsTablesReady = false;
        this.settingsTablesInitPromise = null;
      }
      async init() {
        await this.ensureUsersTable();
        await this.seedDefaultUsers();
        await this.ensureBackupsTable();
        await this.ensurePerformanceIndexes();
        await this.ensureBannedSessionsTable();
        await this.ensureAiTables();
        await this.ensureSpatialTables();
        await this.ensureCategoryRulesTable();
        await this.ensureCategoryStatsTable();
        await this.ensureSettingsTables();
      }
      async ensureUsersTable() {
        try {
          await db.execute(sql`SET search_path TO public`);
          await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.users (
          id text PRIMARY KEY,
          username text NOT NULL,
          role text NOT NULL DEFAULT 'user',
          password_hash text,
          password text,
          is_banned boolean DEFAULT false,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now(),
          password_changed_at timestamp
        )
      `);
          await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text`);
          await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text`);
          await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password text`);
          await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false`);
          await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
          await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
          await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamp`);
          await db.execute(sql`
        UPDATE public.users
        SET password_hash = password
        WHERE password_hash IS NULL
          AND password IS NOT NULL
      `);
          const missingHashRows = await db.execute(sql`
        SELECT id
        FROM public.users
        WHERE password_hash IS NULL
      `);
          for (const row of missingHashRows.rows) {
            const userId = String(row.id || "").trim();
            if (!userId) continue;
            const fallbackHash = await bcrypt.hash(randomUUID(), BCRYPT_COST);
            await db.execute(sql`
          UPDATE public.users
          SET password_hash = ${fallbackHash}
          WHERE id = ${userId}
        `);
          }
          await db.execute(sql`
        UPDATE public.users
        SET
          role = COALESCE(NULLIF(role, ''), 'user'),
          created_at = COALESCE(created_at, now()),
          updated_at = COALESCE(updated_at, now()),
          is_banned = COALESCE(is_banned, false)
      `);
          await db.execute(sql`ALTER TABLE public.users ALTER COLUMN username SET NOT NULL`);
          await db.execute(sql`ALTER TABLE public.users ALTER COLUMN role SET NOT NULL`);
          await db.execute(sql`ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON public.users (lower(username))`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_username_lower ON public.users (lower(username))`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role)`);
        } catch (err) {
          console.error("\u274C Failed to ensure users table:", err?.message || err);
          throw err;
        }
      }
      async ensurePerformanceIndexes() {
        try {
          await db.execute(sql`SET search_path TO public`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON data_rows(import_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON imports(is_deleted)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON user_activity(login_time)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_logout_time ON user_activity(logout_time)`);
          try {
            await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_json_text_trgm
          ON data_rows
          USING GIN ((json_data::text) gin_trgm_ops)
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_mykad_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. MyKad',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_idno_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'ID No',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nopengenalan_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No Pengenalan',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_ic_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'IC',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_cardno_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Card No',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountno_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Account No',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountnumber_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Account Number',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_akaunpemohon_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Nombor Akaun Bank Pemohon',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_noakaun_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No Akaun',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telrumah_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. Telefon Rumah',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telbimbit_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. Telefon Bimbit',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_phone_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Phone',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_handphone_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Handphone',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_officephone_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'OfficePhone',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nob_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'NOB') gin_trgm_ops)
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_employer_name_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'EMPLOYER NAME') gin_trgm_ops)
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nature_business_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'NATURE OF BUSINESS') gin_trgm_ops)
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nama_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'Nama') gin_trgm_ops)
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_customer_name_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'Customer Name') gin_trgm_ops)
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_name_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'name') gin_trgm_ops)
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_mykad_exact
          ON data_rows (((json_data::jsonb)->>'No. MyKad'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_idno_exact
          ON data_rows (((json_data::jsonb)->>'ID No'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nopengenalan_exact
          ON data_rows (((json_data::jsonb)->>'No Pengenalan'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_ic_exact
          ON data_rows (((json_data::jsonb)->>'IC'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountno_exact
          ON data_rows (((json_data::jsonb)->>'Account No'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountnumber_exact
          ON data_rows (((json_data::jsonb)->>'Account Number'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_cardno_exact
          ON data_rows (((json_data::jsonb)->>'Card No'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_noakaun_exact
          ON data_rows (((json_data::jsonb)->>'No Akaun'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_akaunpemohon_exact
          ON data_rows (((json_data::jsonb)->>'Nombor Akaun Bank Pemohon'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telrumah_exact
          ON data_rows (((json_data::jsonb)->>'No. Telefon Rumah'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telbimbit_exact
          ON data_rows (((json_data::jsonb)->>'No. Telefon Bimbit'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_phone_exact
          ON data_rows (((json_data::jsonb)->>'Phone'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_handphone_exact
          ON data_rows (((json_data::jsonb)->>'Handphone'))
        `);
            await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_data_rows_officephone_exact
          ON data_rows (((json_data::jsonb)->>'OfficePhone'))
        `);
          } catch (err) {
            console.warn("\u26A0\uFE0F pg_trgm not available; skipping trigram index:", err?.message || err);
          }
        } catch (err) {
          console.error("\u274C Failed to ensure performance indexes:", err?.message || err);
        }
      }
      async ensureBannedSessionsTable() {
        try {
          await db.execute(sql`SET search_path TO public`);
          await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.banned_sessions (
          id text PRIMARY KEY,
          username text NOT NULL,
          role text NOT NULL,
          activity_id text NOT NULL,
          fingerprint text,
          ip_address text,
          browser text,
          pc_name text,
          banned_at timestamp DEFAULT now()
        )
      `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_banned_sessions_fingerprint ON public.banned_sessions(fingerprint)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_banned_sessions_ip ON public.banned_sessions(ip_address)`);
        } catch (err) {
          console.error("\u274C Failed to ensure banned_sessions table:", err?.message || err);
        }
      }
      async ensureAiTables() {
        try {
          await db.execute(sql`SET search_path TO public`);
          let vectorAvailable = true;
          try {
            await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
          } catch (err) {
            vectorAvailable = false;
            console.warn("\u26A0\uFE0F pgvector extension not available. Embeddings disabled until installed.");
          }
          if (vectorAvailable) {
            await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.data_embeddings (
            id text PRIMARY KEY,
            import_id text NOT NULL,
            row_id text NOT NULL UNIQUE,
            content text NOT NULL,
            embedding vector(768) NOT NULL,
            created_at timestamp DEFAULT now()
          )
        `);
            await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_embeddings_import_id ON public.data_embeddings(import_id)`);
            try {
              await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_data_embeddings_vector
            ON public.data_embeddings
            USING ivfflat (embedding vector_cosine_ops)
          `);
            } catch (err) {
              console.warn("\u26A0\uFE0F Failed to create ivfflat index:", err?.message || err);
            }
          }
          await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.ai_conversations (
          id text PRIMARY KEY,
          created_by text NOT NULL,
          created_at timestamp DEFAULT now()
        )
      `);
          await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.ai_messages (
          id text PRIMARY KEY,
          conversation_id text NOT NULL,
          role text NOT NULL,
          content text NOT NULL,
          created_at timestamp DEFAULT now()
        )
      `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON public.ai_messages(conversation_id)`);
        } catch (err) {
          console.error("\u274C Failed to ensure AI tables:", err?.message || err);
        }
      }
      async ensureCategoryStatsTable() {
        try {
          await db.execute(sql`SET search_path TO public`);
          await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.ai_category_stats (
          key text PRIMARY KEY,
          total integer NOT NULL,
          samples jsonb,
          updated_at timestamp DEFAULT now()
        )
      `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_category_stats_updated_at ON public.ai_category_stats(updated_at)`);
        } catch (err) {
          console.error("\u274C Failed to ensure ai_category_stats table:", err?.message || err);
        }
      }
      async ensureCategoryRulesTable() {
        try {
          await db.execute(sql`SET search_path TO public`);
          await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.ai_category_rules (
          key text PRIMARY KEY,
          terms text[] NOT NULL DEFAULT '{}',
          fields text[] NOT NULL DEFAULT '{}',
          match_mode text NOT NULL DEFAULT 'contains',
          enabled boolean NOT NULL DEFAULT true,
          updated_at timestamp DEFAULT now()
        )
      `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_category_rules_updated_at ON public.ai_category_rules(updated_at)`);
          const defaultFields = [
            "NOB",
            "NATURE OF BUSINESS",
            "Nature of Business",
            "EMPLOYER NAME",
            "EmployerName",
            "Company",
            "Nama Majikan",
            "Majikan",
            "Department",
            "Agensi"
          ];
          const defaults = [
            {
              key: "kerajaan",
              terms: [
                "GOVERNMENT",
                "KERAJAAN",
                "PUBLIC SECTOR",
                "SECTOR AWAM",
                "KEMENTERIAN",
                "JABATAN",
                "AGENSI",
                "PERSEKUTUAN",
                "NEGERI",
                "MAJLIS",
                "KKM",
                "KPM",
                "KPT",
                "MOE",
                "MOH",
                "SEKOLAH",
                "GURU",
                "TEACHER",
                "CIKGU",
                "PENDIDIKAN"
              ],
              fields: defaultFields,
              matchMode: "contains",
              enabled: true
            },
            {
              key: "hospital",
              terms: [
                "HEALTHCARE",
                "HOSPITAL",
                "CLINIC",
                "KLINIK",
                "KESIHATAN",
                "MEDICAL",
                "HEALTH"
              ],
              fields: defaultFields,
              matchMode: "contains",
              enabled: true
            },
            {
              key: "hotel",
              terms: [
                "HOTEL",
                "HOSPITALITY",
                "RESORT",
                "INN",
                "MOTEL",
                "RESTAURANT",
                "SERVICE LINE",
                "HOTEL,RESTAURANT",
                "HOTEL & RESTAURANT"
              ],
              fields: defaultFields,
              matchMode: "contains",
              enabled: true
            },
            {
              key: "polis",
              terms: ["POLIS", "POLICE", "PDRM", "IPD", "IPK", "ROYAL MALAYSIA POLICE"],
              fields: defaultFields,
              matchMode: "contains",
              enabled: true
            },
            {
              key: "tentera",
              terms: [
                "TENTERA",
                "ARMY",
                "MILITARY",
                "ARMED FORCES",
                "ATM",
                "TUDM",
                "TLDM",
                "TENTERA DARAT",
                "TENTERA LAUT",
                "TENTERA UDARA",
                "ANGKATAN TENTERA",
                "ANGKATAN TENTERA MALAYSIA",
                "MINDEF",
                "MINISTRY OF DEFENCE",
                "KEMENTERIAN PERTAHANAN",
                "DEFENCE",
                "PERTAHANAN"
              ],
              fields: defaultFields,
              matchMode: "contains",
              enabled: true
            },
            {
              key: "swasta",
              terms: ["SWASTA", "PRIVATE", "SDN BHD", "BHD", "ENTERPRISE", "TRADING", "LTD", "PLC"],
              fields: defaultFields,
              matchMode: "complement",
              enabled: true
            }
          ];
          const toTextArray = (values) => {
            if (!values.length) return sql`'{}'::text[]`;
            const joined = sql.join(values.map((v) => sql`${v}`), sql`, `);
            return sql`ARRAY[${joined}]::text[]`;
          };
          for (const rule of defaults) {
            const termsSql = toTextArray(rule.terms || []);
            const fieldsSql = toTextArray(rule.fields || []);
            await db.execute(sql`
          INSERT INTO public.ai_category_rules (key, terms, fields, match_mode, enabled, updated_at)
          VALUES (${rule.key}, ${termsSql}, ${fieldsSql}, ${rule.matchMode ?? "contains"}, ${rule.enabled ?? true}, now())
          ON CONFLICT (key) DO UPDATE SET
            terms = EXCLUDED.terms,
            fields = EXCLUDED.fields,
            match_mode = EXCLUDED.match_mode,
            enabled = EXCLUDED.enabled,
            updated_at = now()
        `);
          }
        } catch (err) {
          console.error("\u274C Failed to ensure ai_category_rules table:", err?.message || err);
        }
      }
      async ensureSettingsTables() {
        if (this.settingsTablesReady) return;
        if (this.settingsTablesInitPromise) {
          await this.settingsTablesInitPromise;
          return;
        }
        this.settingsTablesInitPromise = (async () => {
          try {
            await db.execute(sql`SET search_path TO public`);
            await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
            await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.setting_categories (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name text UNIQUE NOT NULL,
          description text,
          created_at timestamp DEFAULT now()
        )
        `);
            await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.system_settings (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          category_id uuid REFERENCES public.setting_categories(id) ON DELETE CASCADE,
          key text UNIQUE NOT NULL,
          label text NOT NULL,
          description text,
          type text NOT NULL,
          value text NOT NULL,
          default_value text,
          is_critical boolean DEFAULT false,
          updated_at timestamp DEFAULT now()
        )
        `);
            await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.setting_options (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          setting_id uuid REFERENCES public.system_settings(id) ON DELETE CASCADE,
          value text NOT NULL,
          label text NOT NULL
        )
        `);
            try {
              await db.execute(sql`
          WITH ranked AS (
            SELECT
              ctid,
              row_number() OVER (PARTITION BY setting_id, value ORDER BY id) AS rn
            FROM public.setting_options
          )
          DELETE FROM public.setting_options so
          USING ranked r
          WHERE so.ctid = r.ctid
            AND r.rn > 1
        `);
            } catch (dupCleanupErr) {
              console.warn("\u26A0\uFE0F setting_options duplicate cleanup skipped:", dupCleanupErr?.message || dupCleanupErr);
            }
            try {
              await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_options_unique_value
          ON public.setting_options (setting_id, value)
        `);
            } catch (idxErr) {
              console.warn("\u26A0\uFE0F setting_options unique index not created:", idxErr?.message || idxErr);
            }
            await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_setting_options_setting_id
        ON public.setting_options (setting_id)
        `);
            await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.role_setting_permissions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          role text NOT NULL,
          setting_key text NOT NULL,
          can_view boolean DEFAULT false,
          can_edit boolean DEFAULT false
        )
        `);
            await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_role_setting_permissions_unique
        ON public.role_setting_permissions (role, setting_key)
        `);
            await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.setting_versions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          setting_key text NOT NULL,
          old_value text,
          new_value text NOT NULL,
          changed_by text NOT NULL,
          changed_at timestamp DEFAULT now()
        )
        `);
            await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_setting_versions_key_time
        ON public.setting_versions (setting_key, changed_at DESC)
        `);
            await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.feature_flags (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          key text UNIQUE NOT NULL,
          enabled boolean NOT NULL DEFAULT false,
          description text,
          updated_at timestamp DEFAULT now()
        )
        `);
            const categories = [
              { name: "General", description: "Global platform behavior and identity settings." },
              { name: "Security", description: "Authentication, session, and security policy controls." },
              { name: "AI & Search", description: "AI assistant and search tuning configuration." },
              { name: "Data Management", description: "Data processing, viewer, and indexing limits." },
              { name: "Backup & Restore", description: "Backup lifecycle and recovery controls." },
              { name: "Roles & Permissions", description: "Role behavior and privilege defaults." },
              { name: "System Monitoring", description: "WebSocket and runtime diagnostics settings." }
            ];
            for (const category of categories) {
              await db.execute(sql`
          INSERT INTO public.setting_categories (name, description)
          VALUES (${category.name}, ${category.description})
          ON CONFLICT (name) DO UPDATE SET
            description = EXCLUDED.description
        `);
            }
            const settingsSeed = [
              {
                categoryName: "General",
                key: "system_name",
                label: "System Name",
                description: "Display name shown in application header.",
                type: "text",
                value: "SQR System",
                defaultValue: "SQR System",
                isCritical: false
              },
              {
                categoryName: "General",
                key: "session_timeout_minutes",
                label: "Session Timeout (Minutes)",
                description: "Default idle timeout duration for authenticated sessions.",
                type: "number",
                value: "30",
                defaultValue: "30",
                isCritical: true
              },
              {
                categoryName: "Security",
                key: "jwt_expiry_hours",
                label: "JWT Expiry (Hours)",
                description: "Token validity period used during login.",
                type: "number",
                value: "24",
                defaultValue: "24",
                isCritical: true
              },
              {
                categoryName: "Security",
                key: "enforce_superuser_single_session",
                label: "Enforce Single Superuser Session",
                description: "Force single active session for superuser accounts.",
                type: "boolean",
                value: "true",
                defaultValue: "true",
                isCritical: false
              },
              {
                categoryName: "AI & Search",
                key: "ai_enabled",
                label: "Enable AI Assistant",
                description: "Controls AI endpoints and chat behavior.",
                type: "boolean",
                value: "true",
                defaultValue: "true",
                isCritical: false
              },
              {
                categoryName: "AI & Search",
                key: "semantic_search_enabled",
                label: "Enable Semantic Search",
                description: "Allow pgvector semantic retrieval for AI workflows.",
                type: "boolean",
                value: "true",
                defaultValue: "true",
                isCritical: false
              },
              {
                categoryName: "AI & Search",
                key: "ai_timeout_ms",
                label: "AI Timeout (ms)",
                description: "Server timeout for AI requests before fallback response.",
                type: "number",
                value: "6000",
                defaultValue: "6000",
                isCritical: false
              },
              {
                categoryName: "Data Management",
                key: "search_result_limit",
                label: "Search Result Limit",
                description: "Maximum records returned in search APIs.",
                type: "number",
                value: "200",
                defaultValue: "200",
                isCritical: false
              },
              {
                categoryName: "Data Management",
                key: "viewer_rows_per_page",
                label: "Viewer Rows Per Page",
                description: "Default row count per viewer page.",
                type: "number",
                value: "100",
                defaultValue: "100",
                isCritical: false
              },
              {
                categoryName: "Backup & Restore",
                key: "backup_retention_days",
                label: "Backup Retention (Days)",
                description: "Retention target for automated backup lifecycle policies.",
                type: "number",
                value: "30",
                defaultValue: "30",
                isCritical: false
              },
              {
                categoryName: "Backup & Restore",
                key: "backup_auto_cleanup_enabled",
                label: "Enable Backup Auto Cleanup",
                description: "Automatically remove backups older than retention policy.",
                type: "boolean",
                value: "false",
                defaultValue: "false",
                isCritical: false
              },
              {
                categoryName: "Roles & Permissions",
                key: "admin_can_edit_maintenance_message",
                label: "Admin Can Edit Maintenance Message",
                description: "Allow admin role to edit maintenance message and window only.",
                type: "boolean",
                value: "true",
                defaultValue: "true",
                isCritical: false
              },
              {
                categoryName: "Roles & Permissions",
                key: "canViewSystemPerformance",
                label: "View System Performance",
                description: "Allow admin role to view System Performance in System Monitor.",
                type: "boolean",
                value: "false",
                defaultValue: "false",
                isCritical: false
              },
              {
                categoryName: "System Monitoring",
                key: "ws_idle_minutes",
                label: "WebSocket Idle Timeout (Minutes)",
                description: "Idle timeout before websocket session termination.",
                type: "number",
                value: "3",
                defaultValue: "3",
                isCritical: false
              },
              {
                categoryName: "System Monitoring",
                key: "debug_logs_enabled",
                label: "Enable Debug Logs",
                description: "Enable verbose API debug logging.",
                type: "boolean",
                value: "false",
                defaultValue: "false",
                isCritical: false
              },
              {
                categoryName: "System Monitoring",
                key: "maintenance_mode",
                label: "Maintenance Mode",
                description: "Master switch for maintenance mode activation.",
                type: "boolean",
                value: "false",
                defaultValue: "false",
                isCritical: true
              },
              {
                categoryName: "System Monitoring",
                key: "maintenance_message",
                label: "Maintenance Message",
                description: "Message shown to end users while maintenance is active.",
                type: "text",
                value: "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.",
                defaultValue: "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.",
                isCritical: false
              },
              {
                categoryName: "System Monitoring",
                key: "maintenance_type",
                label: "Maintenance Type",
                description: "Soft mode limits selected modules. Hard mode blocks all protected routes.",
                type: "select",
                value: "soft",
                defaultValue: "soft",
                isCritical: true
              },
              {
                categoryName: "System Monitoring",
                key: "maintenance_start_time",
                label: "Maintenance Start Time",
                description: "Optional ISO timestamp to schedule maintenance start.",
                type: "timestamp",
                value: "",
                defaultValue: "",
                isCritical: false
              },
              {
                categoryName: "System Monitoring",
                key: "maintenance_end_time",
                label: "Maintenance End Time",
                description: "Optional ISO timestamp to auto-end maintenance.",
                type: "timestamp",
                value: "",
                defaultValue: "",
                isCritical: false
              }
            ];
            for (const [role, tabSettings] of Object.entries(ROLE_TAB_SETTINGS)) {
              for (const tabSetting of tabSettings) {
                const key = roleTabSettingKey(role, tabSetting.suffix);
                settingsSeed.push({
                  categoryName: "Roles & Permissions",
                  key,
                  label: tabSetting.label,
                  description: tabSetting.description,
                  type: "boolean",
                  value: tabSetting.defaultEnabled ? "true" : "false",
                  defaultValue: tabSetting.defaultEnabled ? "true" : "false",
                  isCritical: false
                });
              }
            }
            for (const setting of settingsSeed) {
              await db.execute(sql`
          INSERT INTO public.system_settings (
            category_id, key, label, description, type, value, default_value, is_critical, updated_at
          )
          VALUES (
            (SELECT id FROM public.setting_categories WHERE name = ${setting.categoryName}),
            ${setting.key},
            ${setting.label},
            ${setting.description},
            ${setting.type},
            ${setting.value},
            ${setting.defaultValue},
            ${setting.isCritical},
            now()
          )
          ON CONFLICT (key) DO UPDATE SET
            category_id = EXCLUDED.category_id,
            label = EXCLUDED.label,
            description = EXCLUDED.description,
            type = EXCLUDED.type,
            default_value = EXCLUDED.default_value,
            is_critical = EXCLUDED.is_critical
        `);
            }
            const maintenanceTypeRes = await db.execute(sql`
          SELECT id
          FROM public.system_settings
          WHERE key = 'maintenance_type'
          LIMIT 1
        `);
            const maintenanceTypeId = String(maintenanceTypeRes.rows[0]?.id || "").trim();
            if (maintenanceTypeId) {
              await db.execute(sql`
            DELETE FROM public.setting_options
            WHERE setting_id = ${maintenanceTypeId}
          `);
              await db.execute(sql`
            INSERT INTO public.setting_options (setting_id, value, label)
            VALUES
              (${maintenanceTypeId}, 'soft', 'Soft Maintenance'),
              (${maintenanceTypeId}, 'hard', 'Hard Maintenance')
          `);
            }
            const adminEditable = /* @__PURE__ */ new Set([
              "system_name",
              "ai_enabled",
              "semantic_search_enabled",
              "ai_timeout_ms",
              "search_result_limit",
              "viewer_rows_per_page",
              "maintenance_message",
              "maintenance_start_time",
              "maintenance_end_time"
            ]);
            for (const setting of settingsSeed) {
              await db.execute(sql`
          INSERT INTO public.role_setting_permissions (role, setting_key, can_view, can_edit)
          VALUES ('superuser', ${setting.key}, true, true)
          ON CONFLICT (role, setting_key) DO UPDATE SET
            can_view = EXCLUDED.can_view,
            can_edit = EXCLUDED.can_edit
        `);
              await db.execute(sql`
          INSERT INTO public.role_setting_permissions (role, setting_key, can_view, can_edit)
          VALUES ('admin', ${setting.key}, true, ${adminEditable.has(setting.key)})
          ON CONFLICT (role, setting_key) DO UPDATE SET
            can_view = EXCLUDED.can_view,
            can_edit = EXCLUDED.can_edit
        `);
              await db.execute(sql`
          INSERT INTO public.role_setting_permissions (role, setting_key, can_view, can_edit)
          VALUES ('user', ${setting.key}, false, false)
          ON CONFLICT (role, setting_key) DO UPDATE SET
            can_view = EXCLUDED.can_view,
            can_edit = EXCLUDED.can_edit
        `);
            }
            this.settingsTablesReady = true;
          } catch (err) {
            console.error("\u274C Failed to ensure enterprise settings tables:", err?.message || err);
          }
        })();
        try {
          await this.settingsTablesInitPromise;
        } finally {
          this.settingsTablesInitPromise = null;
        }
      }
      async ensureSpatialTables() {
        try {
          await db.execute(sql`SET search_path TO public`);
          await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
          await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.aeon_branches (
          id text PRIMARY KEY,
          name text NOT NULL,
          branch_address text,
          phone_number text,
          fax_number text,
          business_hour text,
          day_open text,
          atm_cdm text,
          inquiry_availability text,
          application_availability text,
          aeon_lounge text,
          branch_lat double precision NOT NULL,
          branch_lng double precision NOT NULL
        )
      `);
          await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.aeon_branch_postcodes (
          postcode text PRIMARY KEY,
          lat double precision NOT NULL,
          lng double precision NOT NULL,
          source_branch text,
          state text
        )
      `);
          await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS branch_address text`);
          await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS phone_number text`);
          await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS fax_number text`);
          await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS business_hour text`);
          await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS day_open text`);
          await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS atm_cdm text`);
          await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS inquiry_availability text`);
          await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS application_availability text`);
          await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS aeon_lounge text`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_aeon_branches_lat_lng ON public.aeon_branches (branch_lat, branch_lng)`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_aeon_branches_name_unique ON public.aeon_branches (lower(name))`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_aeon_postcodes ON public.aeon_branch_postcodes (postcode)`);
        } catch (err) {
          console.warn("\u26A0\uFE0F Failed to ensure PostGIS tables:", err?.message || err);
        }
      }
      async ensureBackupsTable() {
        try {
          await db.execute(sql`SET search_path TO public`);
          await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.backups (
          id text PRIMARY KEY,
          name text NOT NULL,
          created_at timestamp DEFAULT now(),
          created_by text NOT NULL,
          backup_data text NOT NULL,
          metadata text
        )
      `);
          await db.execute(sql`
        CREATE TABLE IF NOT EXISTS backups (
          id text PRIMARY KEY,
          name text NOT NULL,
          created_at timestamp DEFAULT now(),
          created_by text NOT NULL,
          backup_data text NOT NULL,
          metadata text
        )
      `);
          await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS name text`);
          await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_at timestamp`);
          await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_by text`);
          await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS backup_data text`);
          await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS metadata text`);
          const idTypeResult = await db.execute(sql`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'backups'
          AND column_name = 'id'
        LIMIT 1
      `);
          const idType = idTypeResult.rows?.[0]?.data_type;
          if (idType && idType !== "text") {
            await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.backups_new (
            id text PRIMARY KEY,
            name text NOT NULL,
            created_at timestamp DEFAULT now(),
            created_by text NOT NULL,
            backup_data text NOT NULL,
            metadata text
          )
        `);
            await db.execute(sql`
          INSERT INTO public.backups_new (id, name, created_at, created_by, backup_data, metadata)
          SELECT
            id::text,
            COALESCE(name, 'backup')::text,
            COALESCE(created_at, now()),
            COALESCE(created_by, 'system')::text,
            COALESCE(backup_data, '{}')::text,
            metadata
          FROM public.backups
          ON CONFLICT (id) DO NOTHING
        `);
            await db.execute(sql`DROP TABLE public.backups`);
            await db.execute(sql`ALTER TABLE public.backups_new RENAME TO backups`);
          }
          const info = await db.execute(sql`SELECT current_database() AS db, current_schema() AS schema`);
          const row = info.rows?.[0];
          console.log(`\u{1F9FE} DB info: database=${row?.db ?? "unknown"}, schema=${row?.schema ?? "unknown"}`);
        } catch (err) {
          console.error("\u274C Failed to ensure backups table:", err?.message || err);
        }
      }
      parseBackupMetadataSafe(raw) {
        if (!raw) return null;
        if (typeof raw === "object") return raw;
        if (typeof raw !== "string") return null;
        const trimmed = raw.trim();
        if (!trimmed) return null;
        if (trimmed.length > 2e5) return null;
        try {
          const parsed = JSON.parse(trimmed);
          return parsed && typeof parsed === "object" ? parsed : null;
        } catch {
          return null;
        }
      }
      async seedDefaultUsers() {
        const defaultUsers = [
          { username: "superuser", password: "0441024k", role: "superuser" },
          { username: "admin1", password: "admin123", role: "admin" },
          { username: "user1", password: "user123", role: "user" }
        ];
        for (const user of defaultUsers) {
          const existing = await this.getUserByUsername(user.username);
          if (!existing) {
            const now = /* @__PURE__ */ new Date();
            const hashedPassword = await bcrypt.hash(user.password, BCRYPT_COST);
            await db.insert(users).values({
              id: crypto.randomUUID(),
              username: user.username,
              passwordHash: hashedPassword,
              role: user.role,
              createdAt: now,
              updatedAt: now,
              passwordChangedAt: now,
              isBanned: false
            });
          }
        }
      }
      async getUser(id) {
        const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
        return result[0];
      }
      async getUserByUsername(username) {
        const normalized = String(username || "").trim();
        if (!normalized) return void 0;
        const result = await db.select().from(users).where(sql`lower(${users.username}) = lower(${normalized})`).limit(1);
        return result[0];
      }
      async createUser(user) {
        const id = crypto.randomUUID();
        const now = /* @__PURE__ */ new Date();
        const hashedPassword = await bcrypt.hash(user.password, BCRYPT_COST);
        await db.insert(users).values({
          id,
          username: user.username,
          passwordHash: hashedPassword,
          role: user.role ?? "user",
          createdAt: now,
          updatedAt: now,
          passwordChangedAt: now,
          isBanned: false
        });
        return await this.getUser(id);
      }
      async updateUserCredentials(params) {
        const next = {
          updatedAt: /* @__PURE__ */ new Date()
        };
        if (typeof params.newUsername === "string" && params.newUsername.trim()) {
          next.username = params.newUsername.trim();
        }
        if (typeof params.newPasswordHash === "string" && params.newPasswordHash.trim()) {
          next.passwordHash = params.newPasswordHash.trim();
          next.passwordChangedAt = params.passwordChangedAt ?? /* @__PURE__ */ new Date();
        } else if (params.passwordChangedAt !== void 0) {
          next.passwordChangedAt = params.passwordChangedAt;
        }
        await db.update(users).set(next).where(eq(users.id, params.userId));
        return this.getUser(params.userId);
      }
      async getUsersByRoles(roles) {
        if (!Array.isArray(roles) || roles.length === 0) return [];
        const results = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select({
            id: users.id,
            username: users.username,
            role: users.role,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
            passwordChangedAt: users.passwordChangedAt,
            isBanned: users.isBanned
          }).from(users).where(inArray(users.role, roles)).orderBy(users.role, users.username).limit(QUERY_PAGE_LIMIT).offset(offset);
          if (!chunk.length) break;
          results.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        return results;
      }
      async updateActivitiesUsername(oldUsername, newUsername) {
        await db.update(userActivity).set({ username: newUsername }).where(eq(userActivity.username, oldUsername));
      }
      async searchGlobalDataRows(params) {
        const { search, limit, offset } = params;
        const rowsResult = await db.execute(sql`
    SELECT
      dr.id,
      dr.import_id,
      dr.json_data as json_data_jsonb,
      i.name as import_name,
      i.filename as import_filename
    FROM data_rows dr
    JOIN imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
      AND dr.json_data::text ILIKE ${"%" + search + "%"}
    ORDER BY dr.id
    LIMIT ${limit} OFFSET ${offset}
  `);
        const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM data_rows dr
    JOIN imports i ON i.id = dr.import_id
    WHERE i.is_deleted = false
      AND dr.json_data::text ILIKE ${"%" + search + "%"}
  `);
        const convertedRows = rowsResult.rows.map((row, idx) => {
          let jsonData = row.json_data_jsonb;
          if (idx === 0 && STORAGE_DEBUG_LOGS) {
            console.log(`\u{1F50D} DEBUG first row keys: ${Object.keys(row).join(", ")}`);
            console.log(`\u{1F50D} DEBUG json_data type: ${typeof jsonData}, isArray: ${Array.isArray(jsonData)}, value sample: ${JSON.stringify(jsonData).substring(0, 100)}`);
          }
          if (typeof jsonData === "string") {
            try {
              jsonData = JSON.parse(jsonData);
            } catch (e) {
              if (STORAGE_DEBUG_LOGS) {
                console.log(`\u{1F50D} Failed to parse json_data as JSON, treating as string`);
              }
            }
          }
          if (Array.isArray(jsonData)) {
            const obj = {};
            for (let i = 0; i < jsonData.length; i++) {
              obj[`col_${i + 1}`] = jsonData[i];
            }
            jsonData = obj;
            if (idx === 0 && STORAGE_DEBUG_LOGS) {
              console.log(`\u{1F50D} Converted array to object with keys: ${Object.keys(jsonData).join(",")}`);
            }
          }
          return {
            id: row.id,
            importId: row.import_id,
            importName: row.import_name,
            importFilename: row.import_filename,
            jsonDataJsonb: jsonData
          };
        });
        const total = totalResult.rows && totalResult.rows[0] ? Number(totalResult.rows[0].total) : 0;
        return {
          rows: convertedRows,
          total
        };
      }
      async searchSimpleDataRows(search) {
        return await db.execute(sql`
    SELECT
      dr.import_id as "importId",
      i.name as "importName",
      dr.json_data_jsonb as "jsonDataJsonb"
    FROM data_rows dr
    JOIN imports i ON i.id = dr.import_id
    WHERE dr.json_data_jsonb::text ILIKE ${"%" + search + "%"}
    LIMIT 200
  `);
      }
      async updateUserBan(username, isBanned) {
        await db.update(users).set({ isBanned, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.username, username));
        const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
        return result[0];
      }
      async createImport(data) {
        const now = /* @__PURE__ */ new Date();
        const result = await db.insert(imports).values({
          id: crypto.randomUUID(),
          name: data.name,
          filename: data.filename,
          createdBy: data.createdBy || null,
          createdAt: /* @__PURE__ */ new Date(),
          isDeleted: false
        }).returning();
        return result[0];
      }
      async getImports() {
        const results = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(imports).where(eq(imports.isDeleted, false)).orderBy(desc(imports.createdAt)).limit(QUERY_PAGE_LIMIT).offset(offset);
          if (!chunk.length) break;
          results.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        return results;
      }
      async getImportById(id) {
        const result = await db.select().from(imports).where(and(eq(imports.id, id), eq(imports.isDeleted, false))).limit(1);
        return result[0];
      }
      async updateImportName(id, name) {
        await db.update(imports).set({ name }).where(eq(imports.id, id));
        return this.getImportById(id);
      }
      async deleteImport(id) {
        await db.update(imports).set({ isDeleted: true }).where(eq(imports.id, id));
        return true;
      }
      async createDataRow(data) {
        if (!data.jsonDataJsonb || typeof data.jsonDataJsonb !== "object") {
          throw new Error("Invalid jsonDataJsonb");
        }
        const result = await db.insert(dataRows).values({
          id: crypto.randomUUID(),
          importId: data.importId,
          jsonDataJsonb: data.jsonDataJsonb
        }).returning();
        return result[0];
      }
      async getDataRowsByImport(importId) {
        if (STORAGE_DEBUG_LOGS) {
          console.log("\u{1F9EA} VIEWER importId received:", importId);
        }
        const rows = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(dataRows).where(eq(dataRows.importId, importId)).limit(QUERY_PAGE_LIMIT).offset(offset);
          if (!chunk.length) break;
          rows.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        if (STORAGE_DEBUG_LOGS) {
          console.log("\u{1F9EA} ROW COUNT:", rows.length);
        }
        return rows;
      }
      async getDataRowCountByImport(importId) {
        const [{ count: count2 }] = await db.select({ count: sql`count(*)` }).from(dataRows).where(eq(dataRows.importId, importId));
        return Number(count2);
      }
      async searchDataRows(params) {
        const { importId, search, limit, offset } = params;
        const trimmedSearch = search && search.trim() ? search.trim() : null;
        if (STORAGE_DEBUG_LOGS) {
          console.log(`\u{1F50D} searchDataRows called: search="${search}" -> trimmed="${trimmedSearch}"`);
        }
        const safeLimit = Math.min(limit, MAX_SEARCH_LIMIT);
        const safeOffset = Math.max(offset, 0);
        if (trimmedSearch && trimmedSearch.length < 2) {
          return { rows: [], total: 0 };
        }
        if (!trimmedSearch) {
          const rows = await db.select().from(dataRows).where(eq(dataRows.importId, importId)).limit(safeLimit).offset(safeOffset);
          const [{ count: count2 }] = await db.select({ count: sql`count(*)` }).from(dataRows).where(eq(dataRows.importId, importId));
          if (STORAGE_DEBUG_LOGS) {
            console.log("\u{1F50D} searchDataRows (no search) - returned:", rows.length, "rows");
          }
          return { rows, total: Number(count2) };
        }
        if (STORAGE_DEBUG_LOGS) {
          console.log(`\u{1F50D} Executing search query for: "${trimmedSearch}"`);
        }
        const rowsResult = await db.execute(sql`
    SELECT 
      id,
      import_id,
      json_data::jsonb as json_data
    FROM data_rows
    WHERE import_id = ${importId}
      AND json_data::text ILIKE ${"%" + trimmedSearch + "%"}
    ORDER BY id
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `);
        const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM data_rows
    WHERE import_id = ${importId}
      AND json_data::text ILIKE ${"%" + trimmedSearch + "%"}
  `);
        const totalCount = totalResult.rows && totalResult.rows[0] ? Number(totalResult.rows[0].total) : 0;
        if (STORAGE_DEBUG_LOGS) {
          console.log(`\u{1F50D} Search results: ${rowsResult.rows.length} rows found (total: ${totalCount})`);
        }
        const convertedRows = rowsResult.rows.map((row) => {
          let jsonData = row.json_data;
          if (Array.isArray(jsonData)) {
            const obj = {};
            for (let i = 0; i < jsonData.length; i++) {
              obj[`col_${i + 1}`] = jsonData[i];
            }
            jsonData = obj;
            if (STORAGE_DEBUG_LOGS) {
              console.log(`\u{1F50D} Converted array row id=${row.id} to object with keys: ${Object.keys(jsonData).join(",")}`);
            }
          }
          return {
            id: row.id,
            importId: row.import_id,
            jsonDataJsonb: jsonData
          };
        });
        return {
          rows: convertedRows,
          total: totalCount
        };
      }
      async getAllowedSearchColumns() {
        const columns = await this.getAllColumnNames();
        return new Set(columns);
      }
      async advancedSearchDataRows(filters, logic, limit, offset) {
        const activeImports = await this.getImports();
        const activeImportIds = activeImports.map((imp) => imp.id);
        if (activeImportIds.length === 0) {
          return { rows: [], total: 0 };
        }
        const allowedColumns = await this.getAllowedSearchColumns();
        const safeFilters = filters.filter(
          (f) => allowedColumns.has(f.field) && ALLOWED_OPERATORS.has(f.operator)
        );
        if (safeFilters.length === 0) {
          return { rows: [], total: 0 };
        }
        const conditions = safeFilters.map(
          (filter) => buildSqlCondition(filter.field, filter.operator, filter.value)
        );
        const combinedCondition = logic === "AND" ? and(...conditions) : or(...conditions);
        const safeLimit = Math.min(limit, MAX_SEARCH_LIMIT);
        const safeOffset = Math.max(offset, 0);
        const rows = await db.select().from(dataRows).where(
          and(
            inArray(dataRows.importId, activeImportIds),
            combinedCondition
          )
        ).limit(safeLimit).offset(safeOffset);
        const [{ count: count2 }] = await db.select({ count: sql`count(*)` }).from(dataRows).where(
          and(
            inArray(dataRows.importId, activeImportIds),
            combinedCondition
          )
        );
        return { rows, total: Number(count2) };
      }
      async getAllColumnNames() {
        const result = await db.execute(sql`
      SELECT DISTINCT key AS column_name
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      CROSS JOIN LATERAL jsonb_object_keys(dr.json_data::jsonb) AS key
      WHERE i.is_deleted = false
        AND jsonb_typeof(dr.json_data::jsonb) = 'object'
      ORDER BY key
      LIMIT ${MAX_COLUMN_KEYS}
    `);
        return (result.rows || []).map((row) => String(row.column_name || "").trim()).filter((name) => name.length > 0);
      }
      async createActivity(data) {
        const now = /* @__PURE__ */ new Date();
        const result = await db.insert(userActivity).values({
          id: crypto.randomUUID(),
          userId: data.userId,
          username: data.username,
          role: data.role,
          pcName: data.pcName ?? null,
          browser: data.browser ?? null,
          fingerprint: data.fingerprint ?? null,
          ipAddress: data.ipAddress ?? null,
          loginTime: now,
          logoutTime: null,
          lastActivityTime: /* @__PURE__ */ new Date(),
          isActive: true,
          logoutReason: null
        }).returning();
        return result[0];
      }
      async touchActivity(activityId) {
        await db.update(userActivity).set({
          lastActivityTime: /* @__PURE__ */ new Date()
        }).where(eq(userActivity.id, activityId));
      }
      async getActiveActivitiesByUsername(username) {
        const activities = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(userActivity).where(
            and(
              eq(userActivity.username, username),
              eq(userActivity.isActive, true)
            )
          ).orderBy(desc(userActivity.loginTime)).limit(QUERY_PAGE_LIMIT).offset(offset);
          if (!chunk.length) break;
          activities.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        return activities;
      }
      async updateActivity(id, data) {
        const updateData = {};
        if (data.lastActivityTime !== void 0) updateData.lastActivityTime = data.lastActivityTime;
        if (data.isActive !== void 0) updateData.isActive = data.isActive;
        if (data.logoutTime !== void 0) updateData.logoutTime = data.logoutTime;
        if (data.logoutReason !== void 0) updateData.logoutReason = data.logoutReason;
        if (Object.keys(updateData).length > 0) {
          await db.update(userActivity).set(updateData).where(eq(userActivity.id, id));
        }
        const result = await db.select().from(userActivity).where(eq(userActivity.id, id)).limit(1);
        return result[0];
      }
      async getActivityById(id) {
        const result = await db.select().from(userActivity).where(eq(userActivity.id, id)).limit(1);
        return result[0];
      }
      async getActiveActivities() {
        const activities = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(userActivity).where(eq(userActivity.isActive, true)).orderBy(desc(userActivity.loginTime)).limit(QUERY_PAGE_LIMIT).offset(offset);
          if (!chunk.length) break;
          activities.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        return activities;
      }
      async getAllActivities() {
        const activities = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(userActivity).orderBy(desc(userActivity.loginTime)).limit(QUERY_PAGE_LIMIT).offset(offset);
          if (!chunk.length) break;
          activities.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        return activities.map((a) => ({
          ...a,
          status: this.computeActivityStatus(a)
        }));
      }
      async deleteActivity(id) {
        await db.delete(userActivity).where(eq(userActivity.id, id));
        return true;
      }
      computeActivityStatus(activity) {
        if (!activity.isActive) {
          if (activity.logoutReason === "KICKED") return "KICKED";
          if (activity.logoutReason === "BANNED") return "BANNED";
          return "LOGOUT";
        }
        if (activity.lastActivityTime) {
          const lastActive = new Date(activity.lastActivityTime).getTime();
          const now = Date.now();
          const diffMins = Math.floor((now - lastActive) / 6e4);
          if (diffMins >= 5) return "IDLE";
        }
        return "ONLINE";
      }
      async getFilteredActivities(filters) {
        const whereConditions = [];
        if (filters.username) {
          whereConditions.push(eq(userActivity.username, filters.username));
        }
        if (filters.ipAddress) {
          whereConditions.push(eq(userActivity.ipAddress, filters.ipAddress));
        }
        if (filters.browser) {
          whereConditions.push(eq(userActivity.browser, filters.browser));
        }
        if (filters.dateFrom) {
          whereConditions.push(gte(userActivity.loginTime, filters.dateFrom));
        }
        if (filters.dateTo) {
          const endOfDay = new Date(filters.dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          whereConditions.push(lte(userActivity.loginTime, endOfDay));
        }
        const activities = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(userActivity).where(whereConditions.length ? and(...whereConditions) : void 0).orderBy(desc(userActivity.loginTime)).limit(QUERY_PAGE_LIMIT).offset(offset);
          if (!chunk.length) break;
          activities.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        if (filters.status?.length) {
          return activities.filter(
            (a) => filters.status.includes(this.computeActivityStatus(a))
          );
        }
        return activities;
      }
      async deactivateUserActivities(username, reason) {
        const updateData = {
          isActive: false,
          logoutTime: /* @__PURE__ */ new Date()
        };
        if (reason) {
          updateData.logoutReason = reason;
        }
        await db.update(userActivity).set(updateData).where(
          and(
            eq(userActivity.isActive, true),
            eq(userActivity.username, username)
          )
        );
      }
      async deactivateUserSessionsByFingerprint(username, fingerprint) {
        await db.update(userActivity).set({
          isActive: false,
          logoutTime: /* @__PURE__ */ new Date(),
          logoutReason: "NEW_SESSION"
        }).where(
          and(
            eq(userActivity.username, username),
            eq(userActivity.fingerprint, fingerprint),
            eq(userActivity.isActive, true)
          )
        );
      }
      async getBannedUsers() {
        const bannedUsers = await db.select().from(users).where(eq(users.isBanned, true));
        const enrichedUsers = [];
        for (const user of bannedUsers) {
          const activities = await db.select().from(userActivity).where(
            and(
              eq(userActivity.logoutReason, "BANNED"),
              sql`lower(${userActivity.username}) = lower(${user.username})`
            )
          ).orderBy(desc(userActivity.logoutTime)).limit(1);
          const lastBannedActivity = activities[0];
          const banInfo = lastBannedActivity ? {
            ipAddress: lastBannedActivity.ipAddress,
            browser: lastBannedActivity.browser,
            bannedAt: lastBannedActivity.logoutTime ? new Date(lastBannedActivity.logoutTime) : null
          } : void 0;
          enrichedUsers.push({ ...user, banInfo });
        }
        return enrichedUsers;
      }
      async isVisitorBanned(fingerprint, ipAddress) {
        await this.ensureBannedSessionsTable();
        if (!fingerprint && !ipAddress) return false;
        const fp = fingerprint ?? null;
        const ip = ipAddress ?? null;
        const result = await db.execute(sql`
      SELECT id
      FROM public.banned_sessions
      WHERE (${fp}::text IS NOT NULL AND fingerprint = ${fp}::text)
         OR (${ip}::text IS NOT NULL AND ip_address = ${ip}::text)
      LIMIT 1
    `);
        return (result.rows?.length || 0) > 0;
      }
      async banVisitor(params) {
        await this.ensureBannedSessionsTable();
        const banId = crypto.randomUUID();
        await db.execute(sql`
      INSERT INTO public.banned_sessions
        (id, username, role, activity_id, fingerprint, ip_address, browser, pc_name, banned_at)
      VALUES
        (${banId}, ${params.username}, ${params.role}, ${params.activityId},
         ${params.fingerprint ?? null}, ${params.ipAddress ?? null}, ${params.browser ?? null}, ${params.pcName ?? null},
         ${/* @__PURE__ */ new Date()})
      ON CONFLICT DO NOTHING
    `);
      }
      async unbanVisitor(banId) {
        await this.ensureBannedSessionsTable();
        await db.execute(sql`DELETE FROM public.banned_sessions WHERE id = ${banId}`);
      }
      async getBannedSessions() {
        await this.ensureBannedSessionsTable();
        const result = await db.execute(sql`
      SELECT
        id as "banId",
        username,
        role,
        fingerprint,
        ip_address as "ipAddress",
        browser,
        banned_at as "bannedAt"
      FROM public.banned_sessions
      ORDER BY banned_at DESC
    `);
        return result.rows.map((row) => {
          let jsonData = row.jsonDataJsonb;
          if (typeof jsonData === "string") {
            try {
              jsonData = JSON.parse(jsonData);
            } catch {
            }
          }
          return { ...row, jsonDataJsonb: jsonData };
        });
      }
      async createConversation(createdBy) {
        const id = crypto.randomUUID();
        await db.execute(sql`
      INSERT INTO public.ai_conversations (id, created_by, created_at)
      VALUES (${id}, ${createdBy}, ${/* @__PURE__ */ new Date()})
    `);
        return id;
      }
      async saveConversationMessage(conversationId, role, content) {
        await db.execute(sql`
      INSERT INTO public.ai_messages (id, conversation_id, role, content, created_at)
      VALUES (${crypto.randomUUID()}, ${conversationId}, ${role}, ${content}, ${/* @__PURE__ */ new Date()})
    `);
      }
      async getConversationMessages(conversationId, limit = 20) {
        const result = await db.execute(sql`
      SELECT role, content
      FROM public.ai_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);
        return result.rows;
      }
      async saveEmbedding(params) {
        const embeddingLiteral = sql.raw(`'[${params.embedding.join(",")}]'`);
        await db.execute(sql`
      INSERT INTO public.data_embeddings (id, import_id, row_id, content, embedding, created_at)
      VALUES (${crypto.randomUUID()}, ${params.importId}, ${params.rowId}, ${params.content}, ${embeddingLiteral}::vector, ${/* @__PURE__ */ new Date()})
      ON CONFLICT (row_id) DO UPDATE SET
        import_id = EXCLUDED.import_id,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding
    `);
      }
      async semanticSearch(params) {
        const embeddingLiteral = sql.raw(`'[${params.embedding.join(",")}]'`);
        const importFilter = params.importId ? sql`AND e.import_id = ${params.importId}` : sql``;
        try {
          await db.execute(sql`SET ivfflat.probes = 5`);
        } catch {
        }
        const result = await db.execute(sql`
      SELECT
        e.row_id as "rowId",
        e.import_id as "importId",
        e.content as "content",
        (1 - (e.embedding <=> ${embeddingLiteral}::vector))::float as "score",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_embeddings e
      JOIN data_rows dr ON dr.id = e.row_id
      LEFT JOIN imports i ON i.id = e.import_id
      WHERE (i.is_deleted = false OR i.is_deleted IS NULL)
      ${importFilter}
      ORDER BY e.embedding <=> ${embeddingLiteral}::vector
      LIMIT ${params.limit}
    `);
        return result.rows.map((row) => {
          let jsonData = row.jsonDataJsonb;
          if (typeof jsonData === "string") {
            try {
              jsonData = JSON.parse(jsonData);
            } catch {
            }
          }
          return { ...row, jsonDataJsonb: jsonData };
        });
      }
      async aiKeywordSearch(params) {
        const q = String(params.query || "");
        const digits = q.replace(/[^0-9]/g, "");
        const limit = Math.max(1, Math.min(50, params.limit || 10));
        if (digits.length < 6) return [];
        const isIc = digits.length === 12;
        const isPhone = digits.length >= 9 && digits.length <= 11;
        const icFields = ["No. MyKad", "ID No", "No Pengenalan", "IC", "NRIC", "MyKad"];
        const phoneFields = ["No. Telefon Rumah", "No. Telefon Bimbit", "Telefon", "Phone", "HP", "Handphone", "OfficePhone"];
        const accountFields = ["Nombor Akaun Bank Pemohon", "Account No", "Account Number", "No Akaun", "Card No"];
        const primaryFields = isIc ? icFields : isPhone ? phoneFields : accountFields;
        if (primaryFields.length === 0) return [];
        const perFieldMatch = sql.join(
          primaryFields.map(
            (key) => sql`coalesce((dr.json_data::jsonb)->>${key}, '') = ${digits}`
          ),
          sql` OR `
        );
        const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${perFieldMatch})
      ORDER BY dr.id
      LIMIT ${limit}
    `);
        return result.rows;
      }
      async aiNameSearch(params) {
        const q = String(params.query || "").trim();
        if (!q) return [];
        const nameKeysMatch = sql`
      (
        coalesce((dr.json_data::jsonb)->>'Nama','') ILIKE ${"%" + q + "%"} OR
        coalesce((dr.json_data::jsonb)->>'Customer Name','') ILIKE ${"%" + q + "%"} OR
        coalesce((dr.json_data::jsonb)->>'name','') ILIKE ${"%" + q + "%"} OR
        coalesce((dr.json_data::jsonb)->>'MAKLUMAT PEMOHON','') ILIKE ${"%" + q + "%"}
      )
    `;
        const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND ${nameKeysMatch}
      ORDER BY dr.id
      LIMIT ${params.limit}
    `);
        return result.rows;
      }
      async aiDigitsSearch(params) {
        const digits = params.digits;
        const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND regexp_replace(dr.json_data::text, '[^0-9]', '', 'g') LIKE ${"%" + digits + "%"}
      ORDER BY dr.id
      LIMIT ${params.limit}
    `);
        return result.rows;
      }
      async aiFuzzySearch(params) {
        const raw = String(params.query || "").toLowerCase().trim();
        const tokens = raw.split(/\s+/).map((t) => t.replace(/[^a-z0-9]/gi, "")).filter((t) => t.length >= 3);
        if (tokens.length === 0) return [];
        const scoreParts = tokens.map(
          (t) => sql`CASE WHEN dr.json_data::text ILIKE ${"%" + t + "%"} THEN 1 ELSE 0 END`
        );
        const whereParts = tokens.map(
          (t) => sql`dr.json_data::text ILIKE ${"%" + t + "%"}`
        );
        const scoreSql = sql.join(scoreParts, sql` + `);
        const whereSql = sql.join(whereParts, sql` OR `);
        const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb",
        (${scoreSql})::int as "score"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${whereSql})
      ORDER BY "score" DESC, dr.id
      LIMIT ${params.limit}
    `);
        return result.rows;
      }
      async findBranchesByText(params) {
        const q = String(params.query || "").trim();
        if (!q) return [];
        const limit = Math.max(1, Math.min(5, params.limit));
        try {
          const result = await db.execute(sql`
          SELECT
            name,
            branch_address,
            phone_number,
            fax_number,
            business_hour,
            day_open,
            atm_cdm,
            inquiry_availability,
            application_availability,
            aeon_lounge,
            GREATEST(
              similarity(coalesce(name, ''), ${q}),
              similarity(coalesce(branch_address, ''), ${q})
            ) AS score
          FROM public.aeon_branches
          WHERE
            name ILIKE ${"%" + q + "%"}
            OR branch_address ILIKE ${"%" + q + "%"}
            OR GREATEST(
              similarity(coalesce(name, ''), ${q}),
              similarity(coalesce(branch_address, ''), ${q})
            ) > 0.1
          ORDER BY
            CASE
              WHEN name ILIKE ${"%" + q + "%"} OR branch_address ILIKE ${"%" + q + "%"} THEN 0
              ELSE 1
            END,
            score DESC,
            name
          LIMIT ${limit}
        `);
          return result.rows.map((row) => ({
            name: row.name,
            address: row.branch_address,
            phone: row.phone_number,
            fax: row.fax_number,
            businessHour: row.business_hour,
            dayOpen: row.day_open,
            atmCdm: row.atm_cdm,
            inquiryAvailability: row.inquiry_availability,
            applicationAvailability: row.application_availability,
            aeonLounge: row.aeon_lounge
          }));
        } catch {
          const result = await db.execute(sql`
          SELECT
            name,
            branch_address,
            phone_number,
            fax_number,
            business_hour,
            day_open,
            atm_cdm,
            inquiry_availability,
            application_availability,
            aeon_lounge
          FROM public.aeon_branches
          WHERE name ILIKE ${"%" + q + "%"}
             OR branch_address ILIKE ${"%" + q + "%"}
          ORDER BY name
          LIMIT ${limit}
        `);
          return result.rows.map((row) => ({
            name: row.name,
            address: row.branch_address,
            phone: row.phone_number,
            fax: row.fax_number,
            businessHour: row.business_hour,
            dayOpen: row.day_open,
            atmCdm: row.atm_cdm,
            inquiryAvailability: row.inquiry_availability,
            applicationAvailability: row.application_availability,
            aeonLounge: row.aeon_lounge
          }));
        }
      }
      async findBranchesByPostcode(params) {
        await this.ensureSpatialTables();
        const rawDigits = String(params.postcode || "").replace(/\D/g, "");
        const postcode = rawDigits.length === 4 ? `0${rawDigits}` : rawDigits.slice(0, 5);
        if (postcode.length !== 5) return [];
        const limit = Math.max(1, Math.min(5, params.limit));
        let result = await db.execute(sql`
        (
          SELECT DISTINCT
            b.name,
            b.branch_address,
            b.phone_number,
            b.fax_number,
            b.business_hour,
            b.day_open,
            b.atm_cdm,
            b.inquiry_availability,
            b.application_availability,
            b.aeon_lounge
          FROM public.aeon_branch_postcodes p
          JOIN public.aeon_branches b
            ON lower(b.name) = lower(p.source_branch)
          WHERE p.postcode = ${postcode}
        )
        UNION
        (
          SELECT
            b.name,
            b.branch_address,
            b.phone_number,
            b.fax_number,
            b.business_hour,
            b.day_open,
            b.atm_cdm,
            b.inquiry_availability,
            b.application_availability,
            b.aeon_lounge
          FROM public.aeon_branches b
          WHERE coalesce(b.branch_address, '') ~ ('(^|\\D)' || ${postcode} || '(\\D|$)')
        )
        ORDER BY name
        LIMIT ${limit}
      `);
        if (result.rows.length === 0) {
          result = await db.execute(sql`
          SELECT
            b.name,
            b.branch_address,
            b.phone_number,
            b.fax_number,
            b.business_hour,
            b.day_open,
            b.atm_cdm,
            b.inquiry_availability,
            b.application_availability,
            b.aeon_lounge
          FROM public.aeon_branch_postcodes p
          JOIN public.aeon_branches b
            ON lower(b.name) = lower(p.source_branch)
          WHERE p.postcode ~ '^[0-9]{5}$'
          ORDER BY abs((p.postcode)::int - (${postcode})::int), b.name
          LIMIT ${limit}
        `);
        }
        return result.rows.map((row) => ({
          name: row.name,
          address: row.branch_address ?? null,
          phone: row.phone_number ?? null,
          fax: row.fax_number ?? null,
          businessHour: row.business_hour ?? null,
          dayOpen: row.day_open ?? null,
          atmCdm: row.atm_cdm ?? null,
          inquiryAvailability: row.inquiry_availability ?? null,
          applicationAvailability: row.application_availability ?? null,
          aeonLounge: row.aeon_lounge ?? null
        }));
      }
      async countRowsByKeywords(params) {
        const groups = params.groups || [];
        const countSqls = [];
        const matchSqlByKey = /* @__PURE__ */ new Map();
        for (const group of groups) {
          const terms = (group.terms || []).filter((t) => t.trim().length > 0);
          const fields = (group.fields || []).filter((f) => f.trim().length > 0);
          const matchMode = String(group.matchMode || "contains").toLowerCase();
          if (matchMode === "complement") {
            continue;
          }
          if (terms.length === 0 || fields.length === 0) {
            countSqls.push(sql`0::int as "${sql.raw(group.key)}"`);
            continue;
          }
          const termSql = matchMode === "exact" ? sql.join(
            fields.map((f) => {
              const list = sql.join(
                terms.map((v) => sql`${v.toUpperCase()}`),
                sql`, `
              );
              return sql`upper(trim(coalesce((dr.json_data::jsonb)->>${f}, ''))) IN (${list})`;
            }),
            sql` OR `
          ) : sql.join(
            terms.map((t) => {
              const perField = sql.join(
                fields.map((f) => sql`coalesce((dr.json_data::jsonb)->>${f}, '') ILIKE ${"%" + t + "%"}`),
                sql` OR `
              );
              return sql`((${perField}) OR dr.json_data::text ILIKE ${"%" + t + "%"})`;
            }),
            sql` OR `
          );
          matchSqlByKey.set(group.key, termSql);
          countSqls.push(
            sql`COUNT(*) FILTER (WHERE (${termSql}))::int as "${sql.raw(group.key)}"`
          );
        }
        const complementGroups = groups.filter((g) => String(g.matchMode || "").toLowerCase() === "complement");
        if (complementGroups.length > 0) {
          if (matchSqlByKey.size > 0) {
            const combined = sql.join(Array.from(matchSqlByKey.values()).map((v) => sql`(${v})`), sql` OR `);
            for (const group of complementGroups) {
              countSqls.push(
                sql`COUNT(*) FILTER (WHERE NOT (${combined}))::int as "${sql.raw(group.key)}"`
              );
            }
          } else {
            for (const group of complementGroups) {
              countSqls.push(
                sql`COUNT(*)::int as "${sql.raw(group.key)}"`
              );
            }
          }
        }
        const selectParts = countSqls.length > 0 ? sql.join(countSqls, sql`, `) : sql``;
        const res = await db.execute(sql`
      SELECT
        COUNT(*)::int as "total",
        ${selectParts}
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
    `);
        const row = res.rows[0] || {};
        const totalRows = Number(row.total ?? 0);
        const counts = {};
        for (const group of groups) {
          counts[group.key] = Number(row[group.key] ?? 0);
        }
        return { totalRows, counts };
      }
      async getCategoryRules() {
        const normalizeArray = (value) => {
          if (Array.isArray(value)) {
            return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
          }
          if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) return [];
            if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
              return trimmed.slice(1, -1).split(",").map((v) => v.replace(/^\"|\"$/g, "").trim()).filter((v) => v.length > 0);
            }
            return [trimmed];
          }
          return [];
        };
        const result = await db.execute(sql`
      SELECT key, terms, fields, match_mode, enabled
      FROM public.ai_category_rules
      ORDER BY key
    `);
        return result.rows.map((row) => ({
          key: String(row.key),
          terms: normalizeArray(row.terms),
          fields: normalizeArray(row.fields),
          matchMode: String(row.match_mode || "contains"),
          enabled: row.enabled !== false
        }));
      }
      async getCategoryRulesMaxUpdatedAt() {
        const result = await db.execute(sql`
      SELECT MAX(updated_at) as updated_at
      FROM public.ai_category_rules
    `);
        const row = result.rows[0];
        return row?.updated_at ? new Date(row.updated_at) : null;
      }
      async getCategoryStats(keys) {
        if (!keys.length) return [];
        const quoted = keys.map((k) => `'${k.replace(/'/g, "''")}'`).join(",");
        const result = await db.execute(sql`
      SELECT key, total, samples, updated_at
      FROM public.ai_category_stats
      WHERE key IN (${sql.raw(quoted)})
    `);
        return result.rows.map((row) => ({
          key: row.key,
          total: Number(row.total ?? 0),
          samples: Array.isArray(row.samples) ? row.samples : [],
          updatedAt: row.updated_at ? new Date(row.updated_at) : null
        }));
      }
      async computeCategoryStatsForKeys(keys, groups) {
        if (!keys.length) return [];
        const uniqueKeys = Array.from(new Set(keys));
        const ruleMap = new Map(groups.map((g) => [g.key, g]));
        const requestedGroups = uniqueKeys.filter((k) => k !== "__all__").map((k) => ruleMap.get(k)).filter((g) => Boolean(g && g.enabled !== false));
        const extractName = (data) => {
          return data?.["Nama"] || data?.["Customer Name"] || data?.["name"] || data?.["MAKLUMAT PEMOHON"] || "-";
        };
        const extractIc = (data) => {
          return data?.["No. MyKad"] || data?.["ID No"] || data?.["No Pengenalan"] || data?.["IC"] || "-";
        };
        const buildMatchSql = (terms, fields, matchMode) => {
          if (terms.length === 0) return null;
          if (fields.length === 0) {
            return sql.join(
              terms.map((t) => sql`dr.json_data::text ILIKE ${"%" + t + "%"}`),
              sql` OR `
            );
          }
          if (matchMode === "exact") {
            return sql.join(
              fields.map((f) => {
                const list = sql.join(
                  terms.map((v) => sql`${v.toUpperCase()}`),
                  sql`, `
                );
                return sql`upper(trim(coalesce((dr.json_data::jsonb)->>${f}, ''))) IN (${list})`;
              }),
              sql` OR `
            );
          }
          return sql.join(
            terms.map((t) => {
              const perField = sql.join(
                fields.map((f) => sql`(dr.json_data::jsonb)->>${f} ILIKE ${"%" + t + "%"}`),
                sql` OR `
              );
              return sql`(${perField})`;
            }),
            sql` OR `
          );
        };
        if (uniqueKeys.includes("__all__")) {
          const totalRes = await db.execute(sql`
        SELECT COUNT(*)::int as "count"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
      `);
          const totalRows = Number(totalRes.rows[0]?.count ?? 0);
          await db.execute(sql`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES ('__all__', ${totalRows}, '[]'::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, updated_at = now()
      `);
        }
        for (const group of requestedGroups) {
          const terms = (group.terms || []).filter((t) => t.trim().length > 0);
          const fields = (group.fields || []).filter((f) => f.trim().length > 0);
          const matchMode = String(group.matchMode || "contains").toLowerCase();
          const termSql = buildMatchSql(terms, fields, matchMode);
          if (!termSql) {
            await db.execute(sql`
          INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
          VALUES (${group.key}, 0, '[]'::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
        `);
            continue;
          }
          const countRes = await db.execute(sql`
        SELECT COUNT(*)::int as "count"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
      `);
          const total = Number(countRes.rows[0]?.count ?? 0);
          let samples = [];
          if (total > 0) {
            const sampleRes = await db.execute(sql`
          SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
          FROM data_rows dr
          JOIN imports i ON i.id = dr.import_id
          WHERE i.is_deleted = false
            AND (${termSql})
          LIMIT 10
        `);
            samples = sampleRes.rows.map((row) => {
              let data = row.jsonData;
              if (typeof data === "string") {
                try {
                  data = JSON.parse(data);
                } catch {
                  data = {};
                }
              }
              const name = extractName(data);
              const ic = extractIc(data);
              const source = row.importName || row.importFilename || null;
              return { name: String(name || "-"), ic: String(ic || "-"), source };
            });
          }
          await db.execute(sql`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES (${group.key}, ${total}, ${JSON.stringify(samples)}::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
      `);
        }
        return this.getCategoryStats(uniqueKeys);
      }
      async rebuildCategoryStats(groups) {
        if (!groups.length) return;
        const totalRes = await db.execute(sql`
      SELECT COUNT(*)::int as "count"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
    `);
        const totalRows = Number(totalRes.rows[0]?.count ?? 0);
        await db.execute(sql`
      DELETE FROM public.ai_category_stats
      WHERE key <> '__all__'
    `);
        await db.execute(sql`
      INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
      VALUES ('__all__', ${totalRows}, '[]'::jsonb, now())
      ON CONFLICT (key)
    DO UPDATE SET total = EXCLUDED.total, updated_at = now()
  `);
        const extractName = (data) => {
          return data?.["Nama"] || data?.["Customer Name"] || data?.["name"] || data?.["MAKLUMAT PEMOHON"] || "-";
        };
        const extractIc = (data) => {
          return data?.["No. MyKad"] || data?.["ID No"] || data?.["No Pengenalan"] || data?.["IC"] || "-";
        };
        const enabledGroups = groups.filter((g) => g.enabled !== false);
        const matchSqlByKey = /* @__PURE__ */ new Map();
        const buildMatchSql = (terms, fields, matchMode) => {
          if (terms.length === 0) return null;
          if (fields.length === 0) {
            return sql.join(
              terms.map((t) => sql`dr.json_data::text ILIKE ${"%" + t + "%"}`),
              sql` OR `
            );
          }
          if (matchMode === "exact") {
            return sql.join(
              fields.map((f) => {
                const list = sql.join(
                  terms.map((v) => sql`${v.toUpperCase()}`),
                  sql`, `
                );
                return sql`upper(trim(coalesce((dr.json_data::jsonb)->>${f}, ''))) IN (${list})`;
              }),
              sql` OR `
            );
          }
          return sql.join(
            terms.map((t) => {
              const perField = sql.join(
                fields.map((f) => sql`(dr.json_data::jsonb)->>${f} ILIKE ${"%" + t + "%"}`),
                sql` OR `
              );
              return sql`(${perField})`;
            }),
            sql` OR `
          );
        };
        const baseGroups = enabledGroups.filter((g) => String(g.matchMode || "").toLowerCase() !== "complement");
        const complementGroups = enabledGroups.filter((g) => String(g.matchMode || "").toLowerCase() === "complement");
        for (const group of baseGroups) {
          const terms = (group.terms || []).filter((t) => t.trim().length > 0);
          const fields = (group.fields || []).filter((f) => f.trim().length > 0);
          const matchMode = String(group.matchMode || "contains").toLowerCase();
          const termSql = buildMatchSql(terms, fields, matchMode);
          if (!termSql) {
            await db.execute(sql`
          INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
          VALUES (${group.key}, 0, '[]'::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
        `);
            continue;
          }
          matchSqlByKey.set(group.key, termSql);
          const countRes = await db.execute(sql`
        SELECT COUNT(*)::int as "count"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
      `);
          const total = Number(countRes.rows[0]?.count ?? 0);
          const sampleRes = await db.execute(sql`
        SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
        LIMIT 10
      `);
          const samples = sampleRes.rows.map((row) => {
            let data = row.jsonData;
            if (typeof data === "string") {
              try {
                data = JSON.parse(data);
              } catch {
                data = {};
              }
            }
            const name = extractName(data);
            const ic = extractIc(data);
            const source = row.importName || row.importFilename || null;
            return { name: String(name || "-"), ic: String(ic || "-"), source };
          });
          await db.execute(sql`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES (${group.key}, ${total}, ${JSON.stringify(samples)}::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
      `);
        }
        if (complementGroups.length > 0) {
          const combined = matchSqlByKey.size > 0 ? sql.join(Array.from(matchSqlByKey.values()).map((v) => sql`(${v})`), sql` OR `) : null;
          for (const group of complementGroups) {
            let total = totalRows;
            let samples = [];
            if (combined) {
              const countRes = await db.execute(sql`
            SELECT COUNT(*)::int as "count"
            FROM data_rows dr
            JOIN imports i ON i.id = dr.import_id
            WHERE i.is_deleted = false
              AND NOT (${combined})
          `);
              total = Number(countRes.rows[0]?.count ?? 0);
              const sampleRes = await db.execute(sql`
            SELECT dr.json_data as "jsonData", i.name as "importName", i.filename as "importFilename"
            FROM data_rows dr
            JOIN imports i ON i.id = dr.import_id
            WHERE i.is_deleted = false
              AND NOT (${combined})
            LIMIT 10
          `);
              samples = sampleRes.rows.map((row) => {
                let data = row.jsonData;
                if (typeof data === "string") {
                  try {
                    data = JSON.parse(data);
                  } catch {
                    data = {};
                  }
                }
                const name = extractName(data);
                const ic = extractIc(data);
                const source = row.importName || row.importFilename || null;
                return { name: String(name || "-"), ic: String(ic || "-"), source };
              });
            }
            await db.execute(sql`
          INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
          VALUES (${group.key}, ${total}, ${JSON.stringify(samples)}::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
        `);
          }
        }
      }
      async getNearestBranches(params) {
        const limit = Math.max(1, Math.min(5, params.limit ?? 3));
        const result = await db.execute(sql`
      SELECT
        name,
        branch_address,
        phone_number,
        fax_number,
        business_hour,
        day_open,
        atm_cdm,
        inquiry_availability,
        application_availability,
        aeon_lounge,
        ST_DistanceSphere(
          ST_MakePoint(${params.lng}, ${params.lat}),
          ST_MakePoint(branch_lng, branch_lat)
        ) / 1000 AS distance_km
      FROM public.aeon_branches
      ORDER BY distance_km
      LIMIT ${limit}
    `);
        return result.rows.map((row) => ({
          name: row.name,
          address: row.branch_address ?? null,
          phone: row.phone_number ?? null,
          fax: row.fax_number ?? null,
          businessHour: row.business_hour ?? null,
          dayOpen: row.day_open ?? null,
          atmCdm: row.atm_cdm ?? null,
          inquiryAvailability: row.inquiry_availability ?? null,
          applicationAvailability: row.application_availability ?? null,
          aeonLounge: row.aeon_lounge ?? null,
          distanceKm: Number(row.distance_km)
        }));
      }
      async getPostcodeLatLng(postcode) {
        await this.ensureSpatialTables();
        const postcodeNorm = (() => {
          const digits = String(postcode || "").replace(/\D/g, "");
          if (digits.length === 4) return `0${digits}`;
          return digits.length >= 5 ? digits.slice(0, 5) : digits;
        })();
        if (!postcodeNorm) return null;
        const lookup = async () => {
          const result = await db.execute(sql`
        SELECT lat, lng
        FROM public.aeon_branch_postcodes
        WHERE postcode = ${postcodeNorm}
        LIMIT 1
      `);
          return result.rows?.[0];
        };
        let row = await lookup();
        if (row) return { lat: Number(row.lat), lng: Number(row.lng) };
        const countRes = await db.execute(sql`
      SELECT COUNT(*)::int as "count"
      FROM public.aeon_branch_postcodes
    `);
        const count2 = Number(countRes.rows[0]?.count ?? 0);
        if (count2 === 0) {
          const branches = await db.execute(sql`
        SELECT name, branch_address, branch_lat, branch_lng
        FROM public.aeon_branches
      `);
          for (const b of branches.rows) {
            const address = String(b.branch_address || "");
            const match5 = address.match(/\b\d{5}\b/);
            const match4 = address.match(/\b\d{4}\b/);
            const pc = match5 ? match5[0] : match4 ? `0${match4[0]}` : null;
            if (!pc) continue;
            await db.execute(sql`
          INSERT INTO public.aeon_branch_postcodes (postcode, lat, lng, source_branch, state)
          VALUES (${pc}, ${Number(b.branch_lat)}, ${Number(b.branch_lng)}, ${String(b.name)}, null)
          ON CONFLICT (postcode) DO NOTHING
        `);
          }
          row = await lookup();
          if (row) return { lat: Number(row.lat), lng: Number(row.lng) };
        }
        return null;
      }
      async importBranchesFromRows(params) {
        await this.ensureSpatialTables();
        const rows = await db.execute(sql`
      SELECT id, json_data as "jsonDataJsonb"
      FROM data_rows
      WHERE import_id = ${params.importId}
    `);
        const normalizeKey = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
        const detectKeys = (sample2) => {
          const keys = Object.keys(sample2);
          const normalized = keys.map((k) => ({ raw: k, norm: normalizeKey(k) }));
          const findBy = (candidates) => {
            const hit = normalized.find((k) => candidates.some((c) => k.norm.includes(c)));
            return hit?.raw || null;
          };
          const nameKey2 = findBy(["branchnames", "branchname", "cawangan", "branch", "nama"]) || null;
          const latKey2 = findBy(["latitude", "lat"]) || null;
          const lngKey2 = findBy(["longitude", "lng", "long"]) || null;
          const addressKey2 = findBy(["branchaddress", "address", "alamat"]) || null;
          const postcodeKey2 = findBy(["postcode", "poskod", "postalcode", "zip"]) || null;
          const phoneKey2 = findBy(["phonenumber", "phone", "telefon", "tel"]) || null;
          const faxKey2 = findBy(["faxnumber", "fax"]) || null;
          const businessHourKey2 = findBy(["businesshour", "operatinghour", "waktu", "jam"]) || null;
          const dayOpenKey2 = findBy(["dayopen", "dayopen", "day", "hari"]) || null;
          const atmKey2 = findBy(["atmcdm", "atm", "cdm"]) || null;
          const inquiryKey2 = findBy(["inquiryavailability", "inquiry"]) || null;
          const applicationKey2 = findBy(["applicationavailability", "application"]) || null;
          const loungeKey2 = findBy(["aeonlounge", "lounge"]) || null;
          const stateKey2 = findBy(["state", "negeri"]) || null;
          return {
            nameKey: nameKey2,
            latKey: latKey2,
            lngKey: lngKey2,
            addressKey: addressKey2,
            postcodeKey: postcodeKey2,
            phoneKey: phoneKey2,
            faxKey: faxKey2,
            businessHourKey: businessHourKey2,
            dayOpenKey: dayOpenKey2,
            atmKey: atmKey2,
            inquiryKey: inquiryKey2,
            applicationKey: applicationKey2,
            loungeKey: loungeKey2,
            stateKey: stateKey2
          };
        };
        const firstRow = rows.rows[0];
        const sample = firstRow && firstRow.jsonDataJsonb && typeof firstRow.jsonDataJsonb === "object" ? firstRow.jsonDataJsonb : {};
        const detected = detectKeys(sample);
        const nameKey = params.nameKey || detected.nameKey;
        const latKey = params.latKey || detected.latKey;
        const lngKey = params.lngKey || detected.lngKey;
        const addressKey = detected.addressKey;
        const postcodeKey = detected.postcodeKey;
        const phoneKey = detected.phoneKey;
        const faxKey = detected.faxKey;
        const businessHourKey = detected.businessHourKey;
        const dayOpenKey = detected.dayOpenKey;
        const atmKey = detected.atmKey;
        const inquiryKey = detected.inquiryKey;
        const applicationKey = detected.applicationKey;
        const loungeKey = detected.loungeKey;
        const stateKey = detected.stateKey;
        if (!nameKey || !latKey || !lngKey) {
          return {
            inserted: 0,
            skipped: rows.rows.length,
            usedKeys: { nameKey: nameKey || "", latKey: latKey || "", lngKey: lngKey || "" }
          };
        }
        let inserted = 0;
        let skipped = 0;
        for (const row of rows.rows) {
          const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
          const nameVal = data[nameKey];
          const latVal = data[latKey];
          const lngVal = data[lngKey];
          const addressVal = addressKey ? data[addressKey] : null;
          const postcodeVal = postcodeKey ? data[postcodeKey] : null;
          const phoneVal = phoneKey ? data[phoneKey] : null;
          const faxVal = faxKey ? data[faxKey] : null;
          const businessHourVal = businessHourKey ? data[businessHourKey] : null;
          const dayOpenVal = dayOpenKey ? data[dayOpenKey] : null;
          const atmVal = atmKey ? data[atmKey] : null;
          const inquiryVal = inquiryKey ? data[inquiryKey] : null;
          const applicationVal = applicationKey ? data[applicationKey] : null;
          const loungeVal = loungeKey ? data[loungeKey] : null;
          const stateVal = stateKey ? data[stateKey] : null;
          if (!nameVal || latVal === void 0 || lngVal === void 0) {
            skipped += 1;
            continue;
          }
          const lat = Number(String(latVal).replace(/[^0-9.\-]/g, ""));
          const lng = Number(String(lngVal).replace(/[^0-9.\-]/g, ""));
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            skipped += 1;
            continue;
          }
          const id = crypto.randomUUID();
          await db.execute(sql`
          INSERT INTO public.aeon_branches (
            id, name, branch_address, phone_number, fax_number, business_hour, day_open,
            atm_cdm, inquiry_availability, application_availability, aeon_lounge,
            branch_lat, branch_lng
        )
        VALUES (
          ${id},
          ${String(nameVal)},
          ${addressVal ? String(addressVal) : null},
          ${phoneVal ? String(phoneVal) : null},
          ${faxVal ? String(faxVal) : null},
          ${businessHourVal ? String(businessHourVal) : null},
          ${dayOpenVal ? String(dayOpenVal) : null},
          ${atmVal ? String(atmVal) : null},
          ${inquiryVal ? String(inquiryVal) : null},
          ${applicationVal ? String(applicationVal) : null},
          ${loungeVal ? String(loungeVal) : null},
          ${lat},
          ${lng}
        )
        ON CONFLICT DO NOTHING
        `);
          const normalizePostcode = (value) => {
            if (value === void 0 || value === null) return null;
            const raw = String(value);
            const five = raw.match(/\b\d{5}\b/);
            if (five) return five[0];
            const four = raw.match(/\b\d{4}\b/);
            if (four) return `0${four[0]}`;
            return null;
          };
          let postcode = null;
          if (postcodeVal) {
            postcode = normalizePostcode(postcodeVal);
          }
          if (!postcode && addressVal) {
            postcode = normalizePostcode(addressVal);
          }
          if (postcode) {
            await db.execute(sql`
            INSERT INTO public.aeon_branch_postcodes (postcode, lat, lng, source_branch, state)
            VALUES (${postcode}, ${lat}, ${lng}, ${String(nameVal)}, ${stateVal ? String(stateVal) : null})
            ON CONFLICT (postcode) DO NOTHING
          `);
          }
          inserted += 1;
        }
        return { inserted, skipped, usedKeys: { nameKey, latKey, lngKey } };
      }
      async getDataRowsForEmbedding(importId, limit, offset) {
        const result = await db.execute(sql`
      SELECT id, json_data as "jsonDataJsonb"
      FROM data_rows
      WHERE import_id = ${importId}
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `);
        return result.rows;
      }
      parseSettingType(raw) {
        const t = String(raw || "text").toLowerCase();
        if (t === "number" || t === "boolean" || t === "select" || t === "timestamp") {
          return t;
        }
        return "text";
      }
      normalizeSettingValue(type, value) {
        if (value === null || value === void 0) {
          return type === "timestamp" ? "" : null;
        }
        if (type === "boolean") {
          if (typeof value === "boolean") return value ? "true" : "false";
          const str = String(value).trim().toLowerCase();
          if (["true", "1", "yes", "on"].includes(str)) return "true";
          if (["false", "0", "no", "off"].includes(str)) return "false";
          return null;
        }
        if (type === "number") {
          const num = Number(value);
          if (!Number.isFinite(num)) return null;
          return String(num);
        }
        if (type === "timestamp") {
          const str = String(value).trim();
          if (!str) return "";
          const d = new Date(str);
          if (Number.isNaN(d.getTime())) return null;
          return d.toISOString();
        }
        return String(value);
      }
      applySettingConstraints(settingKey, type, normalizedValue) {
        if (type !== "number") {
          return { valid: true, value: normalizedValue };
        }
        const numericValue = Number(normalizedValue);
        if (!Number.isFinite(numericValue)) {
          return { valid: false, value: normalizedValue, message: "Numeric setting value is invalid." };
        }
        const clampInteger = (min, max) => String(Math.min(max, Math.max(min, Math.floor(numericValue))));
        if (settingKey === "search_result_limit") {
          if (numericValue < 10 || numericValue > 5e3) {
            return { valid: false, value: normalizedValue, message: "Search Result Limit must be between 10 and 5000." };
          }
          return { valid: true, value: clampInteger(10, 5e3) };
        }
        if (settingKey === "viewer_rows_per_page") {
          if (numericValue < 10 || numericValue > 500) {
            return { valid: false, value: normalizedValue, message: "Viewer Rows Per Page must be between 10 and 500." };
          }
          return { valid: true, value: clampInteger(10, 500) };
        }
        return { valid: true, value: normalizedValue };
      }
      isAdminMaintenanceEditableKey(settingKey) {
        return settingKey === "maintenance_message" || settingKey === "maintenance_start_time" || settingKey === "maintenance_end_time";
      }
      async isAdminMaintenanceEditingEnabled() {
        const res = await db.execute(sql`
      SELECT value
      FROM public.system_settings
      WHERE key = 'admin_can_edit_maintenance_message'
      LIMIT 1
    `);
        const row = res.rows[0];
        const raw = String(row?.value ?? "").trim().toLowerCase();
        return ["true", "1", "yes", "on"].includes(raw);
      }
      async getSettingsForRole(role) {
        await this.ensureSettingsTables();
        const rows = await db.execute(sql`
      SELECT
        c.id as category_id,
        c.name as category_name,
        c.description as category_description,
        s.id as setting_id,
        s.key,
        s.label,
        s.description,
        s.type,
        s.value,
        s.default_value,
        s.is_critical,
        s.updated_at,
        COALESCE(p.can_view, false) as can_view,
        COALESCE(p.can_edit, false) as can_edit
      FROM public.setting_categories c
      JOIN public.system_settings s ON s.category_id = c.id
      LEFT JOIN public.role_setting_permissions p
        ON p.setting_key = s.key
       AND p.role = ${role}
      WHERE COALESCE(p.can_view, false) = true
      ORDER BY c.name, s.label
    `);
        const settingIds = rows.rows.map((r) => String(r.setting_id)).filter((v) => v.length > 0);
        const optionsMap = /* @__PURE__ */ new Map();
        if (settingIds.length > 0) {
          const quoted = settingIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
          const optionsRows = await db.execute(sql`
        SELECT DISTINCT ON (setting_id, value) setting_id, value, label
        FROM public.setting_options
        WHERE setting_id IN (${sql.raw(quoted)})
        ORDER BY setting_id, value, label
      `);
          const perSettingValueSeen = /* @__PURE__ */ new Map();
          for (const row of optionsRows.rows) {
            const settingId = String(row.setting_id);
            const optionValue = String(row.value);
            const seen = perSettingValueSeen.get(settingId) || /* @__PURE__ */ new Set();
            if (seen.has(optionValue)) continue;
            seen.add(optionValue);
            perSettingValueSeen.set(settingId, seen);
            const list = optionsMap.get(settingId) || [];
            list.push({ value: optionValue, label: String(row.label) });
            optionsMap.set(settingId, list);
          }
        }
        const adminMaintenanceEditingEnabled = role === "admin" ? await this.isAdminMaintenanceEditingEnabled() : true;
        const categoryMap = /* @__PURE__ */ new Map();
        for (const row of rows.rows) {
          const categoryId = String(row.category_id);
          if (!categoryMap.has(categoryId)) {
            categoryMap.set(categoryId, {
              id: categoryId,
              name: String(row.category_name),
              description: row.category_description ? String(row.category_description) : null,
              settings: []
            });
          }
          const key = String(row.key);
          const canEditFromPermission = row.can_edit === true;
          const canEdit = role === "admin" && this.isAdminMaintenanceEditableKey(key) && !adminMaintenanceEditingEnabled ? false : canEditFromPermission;
          categoryMap.get(categoryId).settings.push({
            key,
            label: String(row.label),
            description: row.description ? String(row.description) : null,
            type: this.parseSettingType(row.type),
            value: String(row.value ?? ""),
            defaultValue: row.default_value === null || row.default_value === void 0 ? null : String(row.default_value),
            isCritical: row.is_critical === true,
            updatedAt: row.updated_at ? new Date(row.updated_at) : null,
            permission: {
              canView: row.can_view === true,
              canEdit
            },
            options: optionsMap.get(String(row.setting_id)) || []
          });
        }
        return Array.from(categoryMap.values());
      }
      async getBooleanSystemSetting(key, fallback = false) {
        await this.ensureSettingsTables();
        const res = await db.execute(sql`
      SELECT value
      FROM public.system_settings
      WHERE key = ${key}
      LIMIT 1
    `);
        const row = res.rows[0];
        if (!row) return fallback;
        const raw = String(row.value ?? "").trim().toLowerCase();
        if (!raw) return fallback;
        return ["true", "1", "yes", "on"].includes(raw);
      }
      async getRoleTabVisibility(role) {
        await this.ensureSettingsTables();
        if (role === "superuser") {
          return {};
        }
        const roleKey = role === "admin" ? "admin" : role === "user" ? "user" : null;
        if (!roleKey) {
          return {};
        }
        const settings = ROLE_TAB_SETTINGS[roleKey];
        const visibility = {};
        for (const tab of settings) {
          visibility[tab.pageId] = tab.defaultEnabled;
        }
        const keys = settings.map((tab) => roleTabSettingKey(roleKey, tab.suffix));
        if (keys.length === 0) {
          return visibility;
        }
        const keyList = keys.map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
        const rows = await db.execute(sql`
      SELECT key, value
      FROM public.system_settings
      WHERE key IN (${sql.raw(keyList)})
    `);
        const keyToPage = /* @__PURE__ */ new Map();
        for (const tab of settings) {
          keyToPage.set(roleTabSettingKey(roleKey, tab.suffix), tab.pageId);
        }
        for (const row of rows.rows) {
          const key = String(row.key || "");
          const pageId = keyToPage.get(key);
          if (!pageId) continue;
          const raw = String(row.value ?? "").trim().toLowerCase();
          visibility[pageId] = ["true", "1", "yes", "on"].includes(raw);
        }
        if (roleKey === "admin") {
          const canViewRes = await db.execute(sql`
        SELECT value
        FROM public.system_settings
        WHERE key = 'canViewSystemPerformance'
        LIMIT 1
      `);
          const canViewRaw = String(canViewRes.rows[0]?.value ?? "").trim().toLowerCase();
          const canViewSystemPerformance = ["true", "1", "yes", "on"].includes(canViewRaw);
          visibility.canViewSystemPerformance = canViewSystemPerformance;
          visibility.monitor = visibility.monitor === true && canViewSystemPerformance;
        }
        return visibility;
      }
      async updateSystemSetting(params) {
        await this.ensureSettingsTables();
        const settingRes = await db.execute(sql`
      SELECT
        s.id,
        s.key,
        s.label,
        s.description,
        s.type,
        s.value,
        s.default_value,
        s.is_critical,
        s.updated_at,
        COALESCE(p.can_edit, false) as can_edit
      FROM public.system_settings s
      LEFT JOIN public.role_setting_permissions p
        ON p.setting_key = s.key
       AND p.role = ${params.role}
      WHERE s.key = ${params.settingKey}
      LIMIT 1
    `);
        const current = settingRes.rows[0];
        if (!current) {
          return { status: "not_found", message: "Setting not found." };
        }
        if (params.role === "admin" && this.isAdminMaintenanceEditableKey(String(current.key)) && !await this.isAdminMaintenanceEditingEnabled()) {
          return { status: "forbidden", message: "Admin is not allowed to edit maintenance message settings." };
        }
        if (current.can_edit !== true) {
          return { status: "forbidden", message: "You do not have permission to edit this setting." };
        }
        if (current.is_critical === true && !params.confirmCritical) {
          return {
            status: "requires_confirmation",
            message: "Critical setting requires explicit confirmation."
          };
        }
        const settingType = this.parseSettingType(current.type);
        const normalized = this.normalizeSettingValue(settingType, params.value);
        if (normalized === null) {
          return { status: "invalid", message: `Invalid value for type ${settingType}.` };
        }
        const constrained = this.applySettingConstraints(String(current.key), settingType, normalized);
        if (!constrained.valid) {
          return { status: "invalid", message: constrained.message || "Invalid setting value." };
        }
        const nextValue = constrained.value;
        if (settingType === "select") {
          const optionRes = await db.execute(sql`
        SELECT 1
        FROM public.setting_options
        WHERE setting_id = ${current.id}
          AND value = ${normalized}
        LIMIT 1
      `);
          if (optionRes.rows.length === 0) {
            return { status: "invalid", message: "Selected option is not allowed." };
          }
        }
        const previousValue = String(current.value ?? "");
        if (previousValue === nextValue) {
          return { status: "unchanged", message: "No change detected." };
        }
        await db.execute(sql`
      UPDATE public.system_settings
      SET value = ${nextValue}, updated_at = now()
      WHERE id = ${current.id}
    `);
        await db.execute(sql`
      INSERT INTO public.setting_versions (setting_key, old_value, new_value, changed_by, changed_at)
      VALUES (${params.settingKey}, ${previousValue}, ${nextValue}, ${params.updatedBy}, now())
    `);
        const latestRes = await db.execute(sql`
      SELECT
        id,
        key,
        label,
        description,
        type,
        value,
        default_value,
        is_critical,
        updated_at
      FROM public.system_settings
      WHERE id = ${current.id}
      LIMIT 1
    `);
        const latest = latestRes.rows[0];
        const shouldBroadcast = String(params.settingKey).startsWith("maintenance_");
        return {
          status: "updated",
          message: "Setting updated successfully.",
          shouldBroadcast,
          setting: {
            key: String(latest.key),
            label: String(latest.label),
            description: latest.description ? String(latest.description) : null,
            type: this.parseSettingType(latest.type),
            value: String(latest.value ?? ""),
            defaultValue: latest.default_value === null || latest.default_value === void 0 ? null : String(latest.default_value),
            isCritical: latest.is_critical === true,
            updatedAt: latest.updated_at ? new Date(latest.updated_at) : null,
            permission: { canView: true, canEdit: true },
            options: []
          }
        };
      }
      async getMaintenanceState(now = /* @__PURE__ */ new Date()) {
        await this.ensureSettingsTables();
        const rows = await db.execute(sql`
      SELECT key, value
      FROM public.system_settings
      WHERE key IN (
        'maintenance_mode',
        'maintenance_message',
        'maintenance_type',
        'maintenance_start_time',
        'maintenance_end_time'
      )
    `);
        const map = /* @__PURE__ */ new Map();
        for (const row of rows.rows) {
          map.set(String(row.key), String(row.value ?? ""));
        }
        const modeValue = (map.get("maintenance_mode") || "false").toLowerCase();
        const baseEnabled = ["true", "1", "yes", "on"].includes(modeValue);
        const type = (map.get("maintenance_type") || "soft").toLowerCase() === "hard" ? "hard" : "soft";
        const message = map.get("maintenance_message") || "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.";
        const startTime = (map.get("maintenance_start_time") || "").trim() || null;
        const endTime = (map.get("maintenance_end_time") || "").trim() || null;
        let enabled = baseEnabled;
        if (enabled && startTime) {
          const start = new Date(startTime);
          if (!Number.isNaN(start.getTime()) && now < start) {
            enabled = false;
          }
        }
        if (enabled && endTime) {
          const end = new Date(endTime);
          if (!Number.isNaN(end.getTime()) && now > end) {
            enabled = false;
          }
        }
        return {
          maintenance: enabled,
          message,
          type,
          startTime,
          endTime
        };
      }
      async getAppConfig() {
        await this.ensureSettingsTables();
        const res = await db.execute(sql`
      SELECT key, value
      FROM public.system_settings
      WHERE key IN (
        'system_name',
        'session_timeout_minutes',
        'ws_idle_minutes',
        'ai_enabled',
        'semantic_search_enabled',
        'ai_timeout_ms',
        'search_result_limit',
        'viewer_rows_per_page'
      )
    `);
        const map = /* @__PURE__ */ new Map();
        for (const row of res.rows) {
          map.set(String(row.key), String(row.value ?? ""));
        }
        const asNumber = (key, fallback, min, max) => {
          const raw = Number(map.get(key) ?? "");
          if (!Number.isFinite(raw)) return fallback;
          return Math.min(max, Math.max(min, Math.floor(raw)));
        };
        const asBool = (key, fallback) => {
          const raw = String(map.get(key) ?? "").trim().toLowerCase();
          if (!raw) return fallback;
          return ["true", "1", "yes", "on"].includes(raw);
        };
        const systemName = String(map.get("system_name") ?? "").trim() || "SQR System";
        const sessionTimeoutMinutes = asNumber("session_timeout_minutes", 30, 1, 1440);
        const wsIdleMinutes = asNumber("ws_idle_minutes", 3, 1, 1440);
        const aiTimeoutMs = asNumber("ai_timeout_ms", 6e3, 1e3, 12e4);
        const searchResultLimit = asNumber("search_result_limit", 200, 10, 5e3);
        const viewerRowsPerPage = asNumber("viewer_rows_per_page", 100, 10, 500);
        const aiEnabled = asBool("ai_enabled", true);
        const semanticSearchEnabled = asBool("semantic_search_enabled", true);
        const heartbeatIntervalMinutes = Math.max(1, Math.min(10, Math.floor(sessionTimeoutMinutes / 2) || 1));
        return {
          systemName,
          sessionTimeoutMinutes,
          heartbeatIntervalMinutes,
          wsIdleMinutes,
          aiEnabled,
          semanticSearchEnabled,
          aiTimeoutMs,
          searchResultLimit,
          viewerRowsPerPage
        };
      }
      async getAccounts() {
        const rows = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select({
            username: users.username,
            role: users.role,
            isBanned: users.isBanned
          }).from(users).orderBy(users.role).limit(QUERY_PAGE_LIMIT).offset(offset);
          if (!chunk.length) break;
          rows.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        return rows;
      }
      async createAuditLog(data) {
        const result = await db.insert(auditLogs).values({
          id: crypto.randomUUID(),
          action: data.action,
          performedBy: data.performedBy,
          targetUser: data.targetUser ?? null,
          targetResource: data.targetResource ?? null,
          details: data.details ?? null,
          timestamp: /* @__PURE__ */ new Date()
        }).returning();
        return result[0];
      }
      async getAuditLogs() {
        const logs = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(QUERY_PAGE_LIMIT).offset(offset);
          if (!chunk.length) break;
          logs.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        return logs;
      }
      async createBackup(data) {
        await this.ensureBackupsTable();
        const id = crypto.randomUUID();
        const result = await db.execute(sql`
      INSERT INTO public.backups (id, name, created_at, created_by, backup_data, metadata)
      VALUES (${id}, ${data.name}, ${/* @__PURE__ */ new Date()}, ${data.createdBy}, ${data.backupData}, ${data.metadata ?? null})
      RETURNING
        id,
        name,
        created_at as "createdAt",
        created_by as "createdBy",
        ''::text as "backupData",
        metadata
    `);
        return result.rows[0];
      }
      async getBackups() {
        await this.ensureBackupsTable();
        const rows = [];
        let offset = 0;
        while (true) {
          const result = await db.execute(sql`
        SELECT
          id,
          name,
          created_at as "createdAt",
          created_by as "createdBy",
          ''::text as "backupData",
          CASE
            WHEN metadata IS NULL THEN NULL
            WHEN length(metadata) > 200000 THEN NULL
            ELSE metadata
          END as metadata
        FROM public.backups
        ORDER BY created_at DESC
        LIMIT ${QUERY_PAGE_LIMIT}
        OFFSET ${offset}
      `);
          const chunk = result.rows || [];
          if (!chunk.length) break;
          rows.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        return rows.map((row) => {
          return { ...row, metadata: this.parseBackupMetadataSafe(row.metadata) };
        });
      }
      async getBackupById(id) {
        await this.ensureBackupsTable();
        const result = await db.execute(sql`
      SELECT
        id,
        name,
        created_at as "createdAt",
        created_by as "createdBy",
        backup_data as "backupData",
        CASE
          WHEN metadata IS NULL THEN NULL
          WHEN length(metadata) > 200000 THEN NULL
          ELSE metadata
        END as metadata
      FROM public.backups
      WHERE id = ${id}
      LIMIT 1
    `);
        const row = result.rows[0];
        if (!row) return void 0;
        return { ...row, metadata: this.parseBackupMetadataSafe(row.metadata) };
      }
      async deleteBackup(id) {
        await this.ensureBackupsTable();
        await db.execute(sql`DELETE FROM public.backups WHERE id = ${id}`);
        return true;
      }
      async getBackupDataForExport() {
        const allImports = await db.select().from(imports).where(eq(imports.isDeleted, false));
        const allDataRows = await db.select().from(dataRows);
        const allUsersFromDb = await db.select().from(users);
        const allUsers = allUsersFromDb.map((u) => ({
          username: u.username,
          role: u.role,
          isBanned: u.isBanned,
          passwordHash: u.passwordHash
        }));
        const allAuditLogs = await db.select().from(auditLogs);
        return {
          imports: allImports,
          dataRows: allDataRows,
          users: allUsers,
          auditLogs: allAuditLogs
        };
      }
      async restoreFromBackup(backupData) {
        const stats = {
          imports: 0,
          dataRows: 0,
          users: 0,
          auditLogs: 0
        };
        const toDate = (value) => {
          if (!value) return null;
          if (value instanceof Date) return value;
          const d = new Date(value);
          return isNaN(d.getTime()) ? null : d;
        };
        const chunkArray = (arr, size) => {
          const chunks = [];
          for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
          }
          return chunks;
        };
        await db.transaction(async (tx) => {
          if (backupData.imports.length > 0) {
            for (const chunk of chunkArray(backupData.imports, BACKUP_CHUNK_SIZE)) {
              const rows = chunk.map((imp) => ({
                id: imp.id,
                name: imp.name,
                filename: imp.filename,
                createdAt: toDate(imp.createdAt) ?? /* @__PURE__ */ new Date(),
                isDeleted: imp.isDeleted ?? false,
                createdBy: imp.createdBy ?? null
              }));
              for (const row of rows) {
                await tx.update(imports).set({ isDeleted: false }).where(eq(imports.id, row.id));
              }
              await tx.insert(imports).values(rows).onConflictDoNothing();
              stats.imports += rows.length;
            }
          }
          if (backupData.dataRows.length > 0) {
            for (const chunk of chunkArray(backupData.dataRows, BACKUP_CHUNK_SIZE)) {
              const rowsToInsert = chunk.map((row) => ({
                id: row.id ?? crypto.randomUUID(),
                importId: row.importId,
                jsonDataJsonb: row.jsonDataJsonb
              }));
              await tx.insert(dataRows).values(rowsToInsert).onConflictDoNothing();
              stats.dataRows += rowsToInsert.length;
            }
          }
          if (backupData.users.length > 0) {
            const now = /* @__PURE__ */ new Date();
            const userRows = backupData.users.filter((u) => u.passwordHash).map((u) => ({
              id: crypto.randomUUID(),
              username: u.username,
              passwordHash: u.passwordHash,
              role: u.role,
              createdAt: now,
              updatedAt: now,
              passwordChangedAt: now,
              isBanned: u.isBanned ?? false
            }));
            for (const chunk of chunkArray(userRows, BACKUP_CHUNK_SIZE)) {
              await tx.insert(users).values(chunk).onConflictDoNothing();
              stats.users += chunk.length;
            }
          }
          if (backupData.auditLogs.length > 0) {
            for (const chunk of chunkArray(backupData.auditLogs, BACKUP_CHUNK_SIZE)) {
              const rows = chunk.map((log) => ({
                id: log.id ?? crypto.randomUUID(),
                action: log.action,
                performedBy: log.performedBy,
                targetUser: log.targetUser ?? null,
                targetResource: log.targetResource ?? null,
                details: log.details ?? null,
                timestamp: toDate(log.timestamp) ?? /* @__PURE__ */ new Date()
              }));
              await tx.insert(auditLogs).values(rows).onConflictDoNothing();
              stats.auditLogs += rows.length;
            }
          }
        });
        return { success: true, stats };
      }
      async getDashboardSummary() {
        const today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        const [totalUsers] = await db.select({ value: count() }).from(users);
        const [activeSessions] = await db.select({ value: count() }).from(userActivity).where(eq(userActivity.isActive, true));
        const [loginsToday] = await db.select({ value: count() }).from(userActivity).where(gte(userActivity.loginTime, today));
        const [totalDataRows] = await db.select({ value: count() }).from(dataRows);
        const [totalImports] = await db.select({ value: count() }).from(imports).where(eq(imports.isDeleted, false));
        const [bannedUsers] = await db.select({ value: count() }).from(users).where(eq(users.isBanned, true));
        return {
          totalUsers: totalUsers.value,
          activeSessions: activeSessions.value,
          loginsToday: loginsToday.value,
          totalDataRows: totalDataRows.value,
          totalImports: totalImports.value,
          bannedUsers: bannedUsers.value
        };
      }
      async getLoginTrends(days = 7) {
        const result = await db.execute(sql`
    WITH bounds AS (
      SELECT (NOW() AT TIME ZONE ${ANALYTICS_TZ})::date AS end_date
    ),
    days AS (
      SELECT generate_series(
        (SELECT end_date FROM bounds) - (${days} - 1) * INTERVAL '1 day',
        (SELECT end_date FROM bounds),
        INTERVAL '1 day'
      )::date AS day
    ),
    logins AS (
      SELECT
        (login_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ})::date AS day,
        COUNT(*)::int AS logins
      FROM user_activity
      WHERE login_time IS NOT NULL
      GROUP BY day
    ),
    logouts AS (
      SELECT
        (logout_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ})::date AS day,
        COUNT(*)::int AS logouts
      FROM user_activity
      WHERE logout_time IS NOT NULL
      GROUP BY day
    )
    SELECT
      days.day AS date,
      COALESCE(logins.logins, 0)::int AS logins,
      COALESCE(logouts.logouts, 0)::int AS logouts
    FROM days
    LEFT JOIN logins ON logins.day = days.day
    LEFT JOIN logouts ON logouts.day = days.day
    ORDER BY days.day ASC
  `);
        const rows = result.rows;
        return rows.map((r) => ({
          date: r.date,
          logins: r.logins,
          logouts: r.logouts
        }));
      }
      async getTopActiveUsers(limit = 10) {
        const result = await db.execute(sql`
    SELECT
      username,
      role,
      COUNT(*)::int AS "loginCount",
      MAX(login_time) AS "lastLogin"
    FROM user_activity
    GROUP BY username, role
    ORDER BY "loginCount" DESC
    LIMIT ${limit}
  `);
        const rows = result.rows;
        return rows.map((row) => ({
          username: row.username,
          role: row.role,
          loginCount: row.loginCount,
          lastLogin: row.lastLogin ? new Date(row.lastLogin).toISOString() : null
        }));
      }
      async getPeakHours() {
        const result = await db.execute(sql`
    SELECT
      EXTRACT(HOUR FROM (login_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ}))::int AS hour,
      COUNT(*)::int AS count
    FROM user_activity
    WHERE login_time IS NOT NULL
    GROUP BY hour
    ORDER BY hour ASC
  `);
        const rows = result.rows;
        const hoursMap = /* @__PURE__ */ new Map();
        for (let i = 0; i < 24; i++) {
          hoursMap.set(i, 0);
        }
        for (const r of rows) {
          hoursMap.set(r.hour, r.count);
        }
        return Array.from(hoursMap.entries()).map(([hour, count2]) => ({
          hour,
          count: count2
        }));
      }
      async getRoleDistribution() {
        const result = await db.execute(sql`
    SELECT
      role,
      COUNT(*)::int AS count
    FROM users
    GROUP BY role
    ORDER BY role ASC
  `);
        const rows = result.rows;
        return rows;
      }
    };
  }
});

// server/middleware/rate-limit.ts
import rateLimit from "express-rate-limit";
var searchRateLimiter;
var init_rate_limit = __esm({
  "server/middleware/rate-limit.ts"() {
    "use strict";
    searchRateLimiter = rateLimit({
      windowMs: 10 * 1e3,
      // ⏱️ 10 saat
      max: 10,
      // ❌ max 10 request
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: "Too many search requests. Please slow down."
      }
    });
  }
});

// server/ai-ollama.ts
function ensureText(input) {
  return (input || "").trim();
}
async function ollamaEmbed(input) {
  const prompt = ensureText(input);
  if (!prompt) return [];
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_EMBED_MODEL,
      prompt
    })
  });
  if (!res.ok) {
    const text2 = await res.text();
    throw new Error(`Ollama embeddings failed: ${res.status} ${text2}`);
  }
  const data = await res.json();
  return Array.isArray(data.embedding) ? data.embedding : [];
}
async function ollamaChat(messages, options) {
  const timeoutMs = Number(options?.timeoutMs ?? process.env.OLLAMA_TIMEOUT_MS ?? 2e3);
  const boundedMessages = Array.isArray(messages) ? messages.slice(Math.max(0, messages.length - MAX_OLLAMA_MESSAGES)) : [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_CHAT_MODEL,
        messages: boundedMessages,
        stream: false,
        options: {
          num_predict: options?.num_predict ?? 96,
          temperature: options?.temperature ?? 0.2,
          top_p: options?.top_p ?? 0.9
        }
      })
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const text2 = await res.text();
    throw new Error(`Ollama chat failed: ${res.status} ${text2}`);
  }
  const data = await res.json();
  return data?.message?.content ?? "";
}
function getOllamaConfig() {
  return {
    host: OLLAMA_HOST,
    chatModel: OLLAMA_CHAT_MODEL,
    embedModel: OLLAMA_EMBED_MODEL
  };
}
var OLLAMA_HOST, OLLAMA_CHAT_MODEL, OLLAMA_EMBED_MODEL, MAX_OLLAMA_MESSAGES;
var init_ai_ollama = __esm({
  "server/ai-ollama.ts"() {
    "use strict";
    OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || "llama3:8b";
    OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
    MAX_OLLAMA_MESSAGES = 50;
  }
});

// server/internal/circuitBreaker.ts
var CircuitOpenError, CircuitBreaker;
var init_circuitBreaker = __esm({
  "server/internal/circuitBreaker.ts"() {
    "use strict";
    CircuitOpenError = class extends Error {
      constructor(name) {
        super(`Circuit '${name}' is OPEN`);
        this.name = "CircuitOpenError";
      }
    };
    CircuitBreaker = class {
      constructor(options) {
        this.state = "CLOSED";
        this.failures = 0;
        this.successes = 0;
        this.rejections = 0;
        this.totalRequests = 0;
        this.nextRetryAt = null;
        this.halfOpenInFlight = 0;
        this.name = options.name;
        this.threshold = Math.max(0.01, Math.min(1, options.threshold ?? 0.5));
        this.minRequests = Math.max(5, options.minRequests ?? 20);
        this.cooldownMs = Math.max(1e3, options.cooldownMs ?? 2e4);
        this.halfOpenMaxInFlight = Math.max(1, options.halfOpenMaxInFlight ?? 1);
      }
      getState() {
        this.evaluateCooldown();
        return this.state;
      }
      getSnapshot() {
        this.evaluateCooldown();
        return {
          name: this.name,
          state: this.state,
          failures: this.failures,
          successes: this.successes,
          rejections: this.rejections,
          totalRequests: this.totalRequests,
          failureRate: this.totalRequests > 0 ? this.failures / this.totalRequests : 0,
          nextRetryAt: this.nextRetryAt,
          cooldownMs: this.cooldownMs,
          threshold: this.threshold
        };
      }
      async execute(operation) {
        this.evaluateCooldown();
        if (this.state === "OPEN") {
          this.rejections += 1;
          throw new CircuitOpenError(this.name);
        }
        if (this.state === "HALF_OPEN" && this.halfOpenInFlight >= this.halfOpenMaxInFlight) {
          this.rejections += 1;
          throw new CircuitOpenError(this.name);
        }
        this.totalRequests += 1;
        if (this.state === "HALF_OPEN") {
          this.halfOpenInFlight += 1;
        }
        try {
          const result = await operation();
          this.onSuccess();
          return result;
        } catch (err) {
          this.onFailure();
          throw err;
        } finally {
          if (this.state === "HALF_OPEN" && this.halfOpenInFlight > 0) {
            this.halfOpenInFlight -= 1;
          }
        }
      }
      onSuccess() {
        this.successes += 1;
        if (this.state === "HALF_OPEN") {
          this.close();
          return;
        }
        this.trimCounters();
      }
      onFailure() {
        this.failures += 1;
        if (this.state === "HALF_OPEN") {
          this.open();
          return;
        }
        if (this.totalRequests >= this.minRequests) {
          const failureRate = this.failures / this.totalRequests;
          if (failureRate >= this.threshold) {
            this.open();
            return;
          }
        }
        this.trimCounters();
      }
      open() {
        this.state = "OPEN";
        this.nextRetryAt = Date.now() + this.cooldownMs;
        this.halfOpenInFlight = 0;
      }
      close() {
        this.state = "CLOSED";
        this.nextRetryAt = null;
        this.halfOpenInFlight = 0;
        this.failures = 0;
        this.successes = 0;
        this.totalRequests = 0;
      }
      evaluateCooldown() {
        if (this.state !== "OPEN") return;
        if (this.nextRetryAt === null) return;
        if (Date.now() >= this.nextRetryAt) {
          this.state = "HALF_OPEN";
          this.nextRetryAt = null;
          this.halfOpenInFlight = 0;
        }
      }
      trimCounters() {
        const maxWindow = 2e3;
        if (this.totalRequests <= maxWindow) return;
        const keepRatio = 0.5;
        this.totalRequests = Math.max(this.minRequests, Math.floor(this.totalRequests * keepRatio));
        this.failures = Math.floor(this.failures * keepRatio);
        this.successes = Math.floor(this.successes * keepRatio);
      }
    };
  }
});

// server/intelligence/anomaly/AnomalyEngine.ts
var WEIGHTS, clamp01, AnomalyEngine;
var init_AnomalyEngine = __esm({
  "server/intelligence/anomaly/AnomalyEngine.ts"() {
    "use strict";
    WEIGHTS = {
      normalizedZScore: 0.3,
      slopeWeight: 0.2,
      percentileShift: 0.2,
      correlationWeight: 0.2,
      forecastRisk: 0.1
    };
    clamp01 = (value) => Math.max(0, Math.min(1, value));
    AnomalyEngine = class {
      constructor(stats) {
        this.stats = stats;
      }
      evaluate(params) {
        try {
          const { snapshot, history, correlationMatrix, predictiveResult } = params;
          const mutationFactor = Number.isFinite(params.mutationFactor) ? params.mutationFactor : 1;
          const mean = this.stats.computeMean(history.p95LatencyMs);
          const stdDev = this.stats.computeStdDev(history.p95LatencyMs);
          const zScore = this.stats.computeZScore(snapshot.p95LatencyMs, mean, stdDev);
          const normalizedZScore = clamp01(Math.abs(zScore) / 5);
          const slope = this.stats.computeSlope(history.p95LatencyMs);
          const slopeWeight = clamp01(Math.abs(slope) / 50);
          const p90 = this.stats.computePercentile(history.p95LatencyMs, 90);
          const p50 = this.stats.computePercentile(history.p95LatencyMs, 50);
          const baseline = Math.max(1, p90 - p50);
          const percentileShift = clamp01(Math.max(0, (snapshot.p95LatencyMs - p90) / baseline));
          const maxCorrelation = Math.max(
            0,
            correlationMatrix.cpuToLatency,
            correlationMatrix.dbToErrors,
            correlationMatrix.aiToQueue
          );
          const correlationWeight = clamp01(maxCorrelation);
          const forecastRisk = this.computeForecastRisk(predictiveResult);
          const weightedBase = WEIGHTS.normalizedZScore * normalizedZScore + WEIGHTS.slopeWeight * slopeWeight + WEIGHTS.percentileShift * percentileShift + WEIGHTS.correlationWeight * correlationWeight + WEIGHTS.forecastRisk * forecastRisk;
          const withMutation = weightedBase * clamp01(Math.max(0.1, mutationFactor));
          const boosted = correlationMatrix.boostedPairs.length > 0 ? Math.min(1, withMutation * 1.15) : withMutation;
          const score = clamp01(boosted);
          const severity = this.resolveSeverity(score);
          const breakdown = {
            normalizedZScore,
            slopeWeight,
            percentileShift,
            correlationWeight,
            forecastRisk,
            mutationFactor: clamp01(mutationFactor),
            weightedScore: score
          };
          return {
            score,
            severity,
            breakdown
          };
        } catch {
          return this.failSafe();
        }
      }
      computeForecastRisk(predictiveResult) {
        if (predictiveResult.predictiveState === "CRITICAL_IMMINENT") return 1;
        if (predictiveResult.predictiveState === "PREEMPTIVE_DEGRADATION") return 0.65;
        return 0.1;
      }
      resolveSeverity(score) {
        if (score >= 0.85) return "EMERGENCY";
        if (score >= 0.65) return "CRITICAL";
        if (score >= 0.4) return "WARNING";
        return "NORMAL";
      }
      failSafe() {
        return {
          score: 0,
          severity: "NORMAL",
          breakdown: {
            normalizedZScore: 0,
            slopeWeight: 0,
            percentileShift: 0,
            correlationWeight: 0,
            forecastRisk: 0,
            mutationFactor: 1,
            weightedScore: 0
          }
        };
      }
    };
  }
});

// server/intelligence/chaos/ChaosEngine.ts
import crypto2 from "crypto";
var DEFAULT_DURATION_MS, MAX_DURATION_MS, DEFAULT_MAGNITUDE, clamp, ChaosEngine;
var init_ChaosEngine = __esm({
  "server/intelligence/chaos/ChaosEngine.ts"() {
    "use strict";
    DEFAULT_DURATION_MS = 2e4;
    MAX_DURATION_MS = 5 * 6e4;
    DEFAULT_MAGNITUDE = {
      cpu_spike: 25,
      db_latency_spike: 450,
      ai_delay: 600,
      worker_crash: 1,
      memory_pressure: 18
    };
    clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    ChaosEngine = class {
      constructor() {
        this.events = /* @__PURE__ */ new Map();
      }
      inject(input) {
        const now = Date.now();
        const magnitude = Number.isFinite(input.magnitude) ? Number(input.magnitude) : DEFAULT_MAGNITUDE[input.type];
        const durationMs = clamp(
          Number.isFinite(input.durationMs) ? Number(input.durationMs) : DEFAULT_DURATION_MS,
          5e3,
          MAX_DURATION_MS
        );
        const event = {
          id: crypto2.randomUUID(),
          type: input.type,
          magnitude,
          createdAt: now,
          expiresAt: now + durationMs
        };
        this.events.set(event.id, event);
        return event;
      }
      apply(snapshot) {
        this.cleanupExpired();
        if (this.events.size === 0) return snapshot;
        const next = {
          ...snapshot
        };
        for (const event of this.events.values()) {
          switch (event.type) {
            case "cpu_spike":
              next.cpuPercent = clamp(next.cpuPercent + event.magnitude, 0, 100);
              next.p95LatencyMs += event.magnitude * 2;
              break;
            case "db_latency_spike":
              next.dbLatencyMs = Math.max(0, next.dbLatencyMs + event.magnitude);
              next.p95LatencyMs += event.magnitude * 0.4;
              next.errorRate = clamp(next.errorRate + 1.5, 0, 100);
              break;
            case "ai_delay":
              next.aiLatencyMs = Math.max(0, next.aiLatencyMs + event.magnitude);
              next.queueSize = Math.max(0, next.queueSize + Math.ceil(event.magnitude / 120));
              next.aiFailRate = clamp(next.aiFailRate + 0.8, 0, 100);
              break;
            case "worker_crash": {
              const drop = Math.max(1, Math.floor(event.magnitude));
              next.workerCount = Math.max(1, next.workerCount - drop);
              next.p95LatencyMs += 80 * drop;
              next.activeRequests += 10 * drop;
              break;
            }
            case "memory_pressure":
              next.ramPercent = clamp(next.ramPercent + event.magnitude, 0, 100);
              next.eventLoopLagMs += event.magnitude * 1.5;
              break;
            default:
              break;
          }
        }
        next.score = clamp(next.score - 10, 0, 100);
        return next;
      }
      listActive(now = Date.now()) {
        this.cleanupExpired(now);
        return Array.from(this.events.values()).sort((a, b) => a.expiresAt - b.expiresAt);
      }
      cleanupExpired(now = Date.now()) {
        for (const [id, event] of this.events.entries()) {
          if (event.expiresAt <= now) {
            this.events.delete(id);
          }
        }
      }
    };
  }
});

// server/intelligence/governance/GovernanceEngine.ts
var COOLDOWN_MS, LOCKDOWN_WINDOW_MS, OSCILLATION_GUARD_MS, GovernanceEngine;
var init_GovernanceEngine = __esm({
  "server/intelligence/governance/GovernanceEngine.ts"() {
    "use strict";
    COOLDOWN_MS = 6e4;
    LOCKDOWN_WINDOW_MS = 10 * 6e4;
    OSCILLATION_GUARD_MS = 5e3;
    GovernanceEngine = class {
      constructor() {
        this.state = "IDLE" /* IDLE */;
        this.cooldownUntil = 0;
        this.lastTransitionAt = 0;
        this.emergencyEvents = [];
        this.transitionLogs = [];
      }
      update(input, now = Date.now()) {
        this.recordEmergency(input.severity, now);
        this.pruneEmergencyWindow(now);
        if (input.failSafe === true) {
          this.transition("FAIL_SAFE" /* FAIL_SAFE */, "Fail-safe trigger received.", now);
          return this.state;
        }
        if (this.emergencyEvents.length >= 3) {
          this.transition("LOCKDOWN" /* LOCKDOWN */, "Emergency threshold reached (3 in 10 minutes).", now);
          this.cooldownUntil = Math.max(this.cooldownUntil, now + COOLDOWN_MS);
          return this.state;
        }
        switch (this.state) {
          case "FAIL_SAFE" /* FAIL_SAFE */: {
            if (input.manualReset === true) {
              this.transition("COOLDOWN" /* COOLDOWN */, "Manual reset from fail-safe.", now);
              this.cooldownUntil = now + COOLDOWN_MS;
            }
            return this.state;
          }
          case "LOCKDOWN" /* LOCKDOWN */: {
            if (input.manualReset === true && now >= this.cooldownUntil) {
              this.transition("COOLDOWN" /* COOLDOWN */, "Manual reset from lockdown.", now);
              this.cooldownUntil = now + COOLDOWN_MS;
            }
            return this.state;
          }
          case "IDLE" /* IDLE */: {
            if (this.shouldPropose(input)) {
              this.transition("PROPOSED" /* PROPOSED */, "Action proposed from idle.", now);
            }
            return this.state;
          }
          case "PROPOSED" /* PROPOSED */: {
            if (!this.shouldPropose(input)) {
              this.transition("IDLE" /* IDLE */, "Proposal cancelled due to stable condition.", now);
              return this.state;
            }
            this.transition("CONSENSUS_PENDING" /* CONSENSUS_PENDING */, "Proposal accepted, waiting consensus.", now);
            return this.state;
          }
          case "CONSENSUS_PENDING" /* CONSENSUS_PENDING */: {
            if (!this.shouldPropose(input)) {
              this.transition("IDLE" /* IDLE */, "Consensus abandoned due to stable condition.", now);
              return this.state;
            }
            if (input.consensusApproved === true) {
              this.transition("EXECUTED" /* EXECUTED */, "Consensus approved.", now);
            }
            return this.state;
          }
          case "EXECUTED" /* EXECUTED */: {
            this.transition("COOLDOWN" /* COOLDOWN */, "Execution completed, entering cooldown.", now);
            this.cooldownUntil = now + COOLDOWN_MS;
            return this.state;
          }
          case "COOLDOWN" /* COOLDOWN */: {
            if (now < this.cooldownUntil) return this.state;
            if (this.shouldPropose(input)) {
              this.transition("PROPOSED" /* PROPOSED */, "Cooldown elapsed, new proposal required.", now);
            } else {
              this.transition("IDLE" /* IDLE */, "Cooldown elapsed and stable.", now);
            }
            return this.state;
          }
          default:
            return this.state;
        }
      }
      getState() {
        return this.state;
      }
      getCooldownRemainingMs(now = Date.now()) {
        if (this.state !== "COOLDOWN" /* COOLDOWN */ && this.state !== "LOCKDOWN" /* LOCKDOWN */) return 0;
        return Math.max(0, this.cooldownUntil - now);
      }
      getTransitionLogs(limit = 100) {
        const safeLimit = Math.max(1, Math.min(500, limit));
        if (this.transitionLogs.length <= safeLimit) return [...this.transitionLogs];
        return this.transitionLogs.slice(this.transitionLogs.length - safeLimit);
      }
      shouldPropose(input) {
        return input.recommendedAction !== "NONE" && input.severity !== "NORMAL";
      }
      recordEmergency(severity, now) {
        if (severity === "EMERGENCY") {
          this.emergencyEvents.push(now);
        }
      }
      pruneEmergencyWindow(now) {
        const boundary = now - LOCKDOWN_WINDOW_MS;
        this.emergencyEvents = this.emergencyEvents.filter((ts) => ts >= boundary);
      }
      transition(next, reason, now) {
        if (next === this.state) return;
        if (!this.passesOscillationGuard(next, now)) return;
        const previous = this.state;
        this.state = next;
        this.lastTransitionAt = now;
        this.transitionLogs.push({
          from: previous,
          to: next,
          reason,
          timestamp: now
        });
        if (this.transitionLogs.length > 500) {
          this.transitionLogs.splice(0, this.transitionLogs.length - 500);
        }
      }
      passesOscillationGuard(next, now) {
        if (this.lastTransitionAt === 0) return true;
        if (now - this.lastTransitionAt >= OSCILLATION_GUARD_MS) return true;
        const guardedStates = /* @__PURE__ */ new Set([
          "IDLE" /* IDLE */,
          "PROPOSED" /* PROPOSED */,
          "CONSENSUS_PENDING" /* CONSENSUS_PENDING */,
          "EXECUTED" /* EXECUTED */
        ]);
        if (guardedStates.has(this.state) && guardedStates.has(next)) {
          return false;
        }
        return true;
      }
    };
  }
});

// server/intelligence/control/AdaptiveControlEngine.ts
var AdaptiveControlEngine;
var init_AdaptiveControlEngine = __esm({
  "server/intelligence/control/AdaptiveControlEngine.ts"() {
    "use strict";
    AdaptiveControlEngine = class {
      resolve(input) {
        if (input.governanceState === "LOCKDOWN" || input.governanceState === "FAIL_SAFE") {
          return "NONE";
        }
        if (input.predictiveState === "CRITICAL_IMMINENT" && input.requestedAction === "NONE") {
          return "ENABLE_THROTTLE_MODE";
        }
        if (input.severity === "EMERGENCY" && input.requestedAction === "PAUSE_AI_QUEUE") {
          return "SELECTIVE_WORKER_RESTART";
        }
        return input.requestedAction;
      }
    };
  }
});

// server/intelligence/control/ControlEngine.ts
var ACTION_COOLDOWN_MS, AUTO_HEALING_ENABLED, ControlEngine;
var init_ControlEngine = __esm({
  "server/intelligence/control/ControlEngine.ts"() {
    "use strict";
    init_GovernanceEngine();
    init_AdaptiveControlEngine();
    ACTION_COOLDOWN_MS = 6e4;
    AUTO_HEALING_ENABLED = false;
    ControlEngine = class {
      constructor(callbacks) {
        this.adaptiveControl = new AdaptiveControlEngine();
        this.lastActionByKey = /* @__PURE__ */ new Map();
        this.lastAction = "NONE";
        this.callbacks = callbacks || {};
      }
      async execute(input, now = Date.now()) {
        const action = this.adaptiveControl.resolve({
          requestedAction: input.requestedAction,
          governanceState: input.governanceState,
          severity: input.severity,
          predictiveState: input.predictiveState
        });
        if (action === "NONE") {
          return { action, executed: false, reason: "No action requested by adaptive control." };
        }
        if (!AUTO_HEALING_ENABLED) {
          return { action, executed: false, reason: "AUTO_HEALING_ENABLED is false." };
        }
        if (!this.isGovernanceAllowed(input.governanceState)) {
          return { action, executed: false, reason: "Governance state does not allow autonomous control." };
        }
        if (!this.passesCooldown(action, now)) {
          return { action, executed: false, reason: "Action is in cooldown window." };
        }
        if (!this.passesOscillationGuard(action, now)) {
          return { action, executed: false, reason: "Oscillation guard blocked rapid action flip." };
        }
        const executed = await this.executeAction(action);
        if (!executed) {
          return { action, executed: false, reason: "Control callback returned false." };
        }
        this.lastActionByKey.set(action, now);
        this.lastAction = action;
        return { action, executed: true, reason: "Action executed successfully." };
      }
      async reduceWorkerCount() {
        return this.runCallback(this.callbacks.reduceWorkerCount);
      }
      async enableThrottleMode() {
        return this.runCallback(this.callbacks.enableThrottleMode);
      }
      async pauseAIQueue() {
        return this.runCallback(this.callbacks.pauseAIQueue);
      }
      async triggerSelectiveWorkerRestart() {
        return this.runCallback(this.callbacks.triggerSelectiveWorkerRestart);
      }
      isGovernanceAllowed(governanceState) {
        if (governanceState === "LOCKDOWN" /* LOCKDOWN */ || governanceState === "FAIL_SAFE" /* FAIL_SAFE */) return false;
        return governanceState === "EXECUTED" /* EXECUTED */ || governanceState === "CONSENSUS_PENDING" /* CONSENSUS_PENDING */ || governanceState === "PROPOSED" /* PROPOSED */;
      }
      passesCooldown(action, now) {
        const last = this.lastActionByKey.get(action);
        if (!last) return true;
        return now - last >= ACTION_COOLDOWN_MS;
      }
      passesOscillationGuard(action, now) {
        if (this.lastAction === "NONE" || this.lastAction === action) return true;
        const last = this.lastActionByKey.get(this.lastAction);
        if (!last) return true;
        return now - last >= ACTION_COOLDOWN_MS;
      }
      async executeAction(action) {
        switch (action) {
          case "REDUCE_WORKER_COUNT":
            return this.reduceWorkerCount();
          case "ENABLE_THROTTLE_MODE":
            return this.enableThrottleMode();
          case "PAUSE_AI_QUEUE":
            return this.pauseAIQueue();
          case "SELECTIVE_WORKER_RESTART":
            return this.triggerSelectiveWorkerRestart();
          default:
            return false;
        }
      }
      async runCallback(callback) {
        if (!callback) return true;
        try {
          const result = await Promise.resolve(callback());
          return result !== false;
        } catch {
          return false;
        }
      }
    };
  }
});

// server/intelligence/correlation/CorrelationEngine.ts
var BOOST_THRESHOLD, BOOST_MULTIPLIER, CorrelationEngine;
var init_CorrelationEngine = __esm({
  "server/intelligence/correlation/CorrelationEngine.ts"() {
    "use strict";
    BOOST_THRESHOLD = 0.6;
    BOOST_MULTIPLIER = 1.15;
    CorrelationEngine = class {
      constructor(stats) {
        this.stats = stats;
      }
      evaluate(history) {
        const cpuToLatency = this.safeCorrelation(history.cpuPercent, history.p95LatencyMs);
        const dbToErrors = this.safeCorrelation(history.dbLatencyMs, history.errorRate);
        const aiToQueue = this.safeCorrelation(history.aiLatencyMs, history.queueSize);
        const pairs = [
          { pair: "CPU\u2194P95_LATENCY", coefficient: cpuToLatency, boosted: cpuToLatency > BOOST_THRESHOLD },
          { pair: "DB_LATENCY\u2194ERROR_RATE", coefficient: dbToErrors, boosted: dbToErrors > BOOST_THRESHOLD },
          { pair: "AI_LATENCY\u2194QUEUE_SIZE", coefficient: aiToQueue, boosted: aiToQueue > BOOST_THRESHOLD }
        ];
        return {
          matrix: {
            cpuToLatency,
            dbToErrors,
            aiToQueue,
            boostedPairs: pairs.filter((p) => p.boosted).map((p) => p.pair)
          },
          pairs
        };
      }
      applyBoost(baseScore, matrix) {
        if (!Number.isFinite(baseScore)) return 0;
        if (matrix.boostedPairs.length === 0) return baseScore;
        return Math.min(1, baseScore * BOOST_MULTIPLIER);
      }
      safeCorrelation(x, y) {
        try {
          return this.stats.computeCorrelation(x, y);
        } catch {
          return 0;
        }
      }
    };
  }
});

// server/intelligence/learning/StabilityDnaEngine.ts
var StabilityDnaEngine;
var init_StabilityDnaEngine = __esm({
  "server/intelligence/learning/StabilityDnaEngine.ts"() {
    "use strict";
    init_db_postgres();
    StabilityDnaEngine = class {
      constructor() {
        this.ensurePromise = null;
      }
      async ensureTable() {
        if (this.ensurePromise) return this.ensurePromise;
        this.ensurePromise = (async () => {
          await pool.query(`
        CREATE TABLE IF NOT EXISTS system_stability_patterns (
          id BIGSERIAL PRIMARY KEY,
          metric_signature TEXT NOT NULL,
          hour INTEGER NOT NULL,
          weekday INTEGER NOT NULL,
          severity TEXT NOT NULL,
          action_taken TEXT NOT NULL,
          duration_ms BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
          await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_stability_patterns_signature_window
        ON system_stability_patterns (metric_signature, hour, weekday, severity)
      `);
        })().catch((error) => {
          this.ensurePromise = null;
          throw error;
        });
        return this.ensurePromise;
      }
      buildMetricSignature(snapshot) {
        const cpu = Math.round(snapshot.cpuPercent / 10) * 10;
        const ram = Math.round(snapshot.ramPercent / 10) * 10;
        const p95 = Math.round(snapshot.p95LatencyMs / 100) * 100;
        const db2 = Math.round(snapshot.dbLatencyMs / 100) * 100;
        const ai = Math.round(snapshot.aiLatencyMs / 100) * 100;
        const queue = Math.round(snapshot.queueSize / 5) * 5;
        return `cpu:${cpu}|ram:${ram}|p95:${p95}|db:${db2}|ai:${ai}|q:${queue}|mode:${snapshot.mode}`;
      }
      async getMutationFactor(metricSignature) {
        try {
          await this.ensureTable();
          const result = await pool.query(
            `
          SELECT COUNT(*)::int AS count
          FROM system_stability_patterns
          WHERE metric_signature = $1
        `,
            [metricSignature]
          );
          const count2 = Number(result.rows?.[0]?.count || 0);
          if (count2 > 5) return 0.85;
          return 1;
        } catch {
          return 1;
        }
      }
      async recordPattern(input) {
        try {
          await this.ensureTable();
          await pool.query(
            `
          INSERT INTO system_stability_patterns (
            metric_signature,
            hour,
            weekday,
            severity,
            action_taken,
            duration_ms
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
            [
              input.metricSignature,
              input.hour,
              input.weekday,
              input.severity,
              input.actionTaken,
              Math.max(0, Math.round(input.durationMs))
            ]
          );
        } catch {
        }
      }
    };
  }
});

// server/intelligence/predictive/PredictiveEngine.ts
var DEFAULT_CONFIG, PredictiveEngine;
var init_PredictiveEngine = __esm({
  "server/intelligence/predictive/PredictiveEngine.ts"() {
    "use strict";
    DEFAULT_CONFIG = {
      warningLatencyMs: 800,
      criticalLatencyMs: 1200,
      projectionSteps: 3
      // 5s polling * 3 = ~15 seconds
    };
    PredictiveEngine = class {
      constructor(stats, config) {
        this.stats = stats;
        this.config = {
          ...DEFAULT_CONFIG,
          ...config || {}
        };
      }
      evaluate(history) {
        const projection = this.stats.forecastNext(history.p95LatencyMs || [], this.config.projectionSteps);
        const maxProjectedLatencyMs = projection.reduce((max, value) => Math.max(max, value), 0);
        if (maxProjectedLatencyMs >= this.config.criticalLatencyMs) {
          return {
            predictiveState: "CRITICAL_IMMINENT",
            projection,
            maxProjectedLatencyMs
          };
        }
        if (maxProjectedLatencyMs >= this.config.warningLatencyMs) {
          return {
            predictiveState: "PREEMPTIVE_DEGRADATION",
            projection,
            maxProjectedLatencyMs
          };
        }
        return {
          predictiveState: "NORMAL",
          projection,
          maxProjectedLatencyMs
        };
      }
    };
  }
});

// server/intelligence/statistical/StatisticalEngine.ts
var StatisticalEngine;
var init_StatisticalEngine = __esm({
  "server/intelligence/statistical/StatisticalEngine.ts"() {
    "use strict";
    StatisticalEngine = class {
      constructor(maxSamples = 300) {
        this.maxSamples = Math.max(10, maxSamples);
      }
      boundBuffer(values) {
        if (!Array.isArray(values) || values.length === 0) return [];
        if (values.length <= this.maxSamples) return values.filter((v) => Number.isFinite(v));
        return values.slice(values.length - this.maxSamples).filter((v) => Number.isFinite(v));
      }
      pushSample(values, sample) {
        if (!Number.isFinite(sample)) return this.boundBuffer(values);
        const next = [...this.boundBuffer(values), sample];
        if (next.length <= this.maxSamples) return next;
        return next.slice(next.length - this.maxSamples);
      }
      computeMean(values) {
        const bounded = this.boundBuffer(values);
        if (bounded.length === 0) return 0;
        let sum = 0;
        for (let i = 0; i < bounded.length; i += 1) sum += bounded[i];
        return sum / bounded.length;
      }
      computeStdDev(values) {
        const bounded = this.boundBuffer(values);
        if (bounded.length < 2) return 0;
        const mean = this.computeMean(bounded);
        let varianceSum = 0;
        for (let i = 0; i < bounded.length; i += 1) {
          const diff = bounded[i] - mean;
          varianceSum += diff * diff;
        }
        return Math.sqrt(varianceSum / bounded.length);
      }
      computeZScore(value, mean, stdDev) {
        if (!Number.isFinite(value) || !Number.isFinite(mean) || !Number.isFinite(stdDev) || stdDev === 0) {
          return 0;
        }
        return (value - mean) / stdDev;
      }
      computeSlope(values) {
        const bounded = this.boundBuffer(values);
        const n = bounded.length;
        if (n < 2) return 0;
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumXX = 0;
        for (let i = 0; i < n; i += 1) {
          const x = i + 1;
          const y = bounded[i];
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumXX += x * x;
        }
        const denominator = n * sumXX - sumX * sumX;
        if (denominator === 0) return 0;
        return (n * sumXY - sumX * sumY) / denominator;
      }
      computePercentile(values, p) {
        const bounded = this.boundBuffer(values);
        if (bounded.length === 0) return 0;
        const normalizedP = Math.max(0, Math.min(100, p));
        const rank = Math.floor(normalizedP / 100 * (bounded.length - 1));
        const copy = bounded.slice();
        return this.quickSelect(copy, rank);
      }
      computeCorrelation(x, y) {
        const aligned = this.alignSeries(x, y);
        if (aligned.x.length < 2) return 0;
        const xMean = this.computeMean(aligned.x);
        const yMean = this.computeMean(aligned.y);
        let numerator = 0;
        let xVariance = 0;
        let yVariance = 0;
        for (let i = 0; i < aligned.x.length; i += 1) {
          const dx = aligned.x[i] - xMean;
          const dy = aligned.y[i] - yMean;
          numerator += dx * dy;
          xVariance += dx * dx;
          yVariance += dy * dy;
        }
        const denominator = Math.sqrt(xVariance * yVariance);
        if (denominator === 0) return 0;
        return numerator / denominator;
      }
      forecastNext(values, steps = 2) {
        const bounded = this.boundBuffer(values);
        const safeSteps = Math.max(1, Math.min(12, Math.floor(steps)));
        if (bounded.length === 0) return Array.from({ length: safeSteps }, () => 0);
        if (bounded.length === 1) return Array.from({ length: safeSteps }, () => bounded[0]);
        const slope = this.computeSlope(bounded);
        const mean = this.computeMean(bounded);
        const tail = bounded[bounded.length - 1];
        const momentum = (tail - mean) * 0.08;
        const forecast = [];
        for (let i = 1; i <= safeSteps; i += 1) {
          forecast.push(tail + slope * i + momentum);
        }
        return forecast;
      }
      alignSeries(x, y) {
        const safeX = this.boundBuffer(x);
        const safeY = this.boundBuffer(y);
        const n = Math.min(safeX.length, safeY.length);
        if (n === 0) return { x: [], y: [] };
        return {
          x: safeX.slice(safeX.length - n),
          y: safeY.slice(safeY.length - n)
        };
      }
      quickSelect(values, targetIndex) {
        let left = 0;
        let right = values.length - 1;
        while (left <= right) {
          const pivotIndex = this.partition(values, left, right);
          if (pivotIndex === targetIndex) return values[pivotIndex];
          if (pivotIndex < targetIndex) left = pivotIndex + 1;
          else right = pivotIndex - 1;
        }
        return values[Math.max(0, Math.min(values.length - 1, targetIndex))];
      }
      partition(values, left, right) {
        const pivotIndex = Math.floor((left + right) / 2);
        const pivotValue = values[pivotIndex];
        [values[pivotIndex], values[right]] = [values[right], values[pivotIndex]];
        let store = left;
        for (let i = left; i < right; i += 1) {
          if (values[i] < pivotValue) {
            [values[i], values[store]] = [values[store], values[i]];
            store += 1;
          }
        }
        [values[store], values[right]] = [values[right], values[store]];
        return store;
      }
    };
  }
});

// server/intelligence/strategy/StrategyEngine.ts
var STRATEGY_ORDER, StrategyEngine;
var init_StrategyEngine = __esm({
  "server/intelligence/strategy/StrategyEngine.ts"() {
    "use strict";
    STRATEGY_ORDER = ["ADAPTIVE", "CONSERVATIVE", "AGGRESSIVE"];
    StrategyEngine = class {
      constructor() {
        this.strategyStats = {
          CONSERVATIVE: { wins: 0, plays: 0 },
          AGGRESSIVE: { wins: 0, plays: 0 },
          ADAPTIVE: { wins: 0, plays: 0 }
        };
        this.anomalyOutcomes = [];
      }
      evaluate(context) {
        const conservative = this.runConservative(context);
        const aggressive = this.runAggressive(context);
        const adaptive = this.runAdaptive(context, conservative, aggressive);
        const candidates = [conservative, aggressive, adaptive];
        const winRates = this.getWinRates();
        const scored = candidates.map((candidate) => {
          const winRateBoost = winRates[candidate.strategy] * 0.2;
          return {
            candidate,
            score: candidate.confidenceScore + winRateBoost
          };
        });
        scored.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return STRATEGY_ORDER.indexOf(a.candidate.strategy) - STRATEGY_ORDER.indexOf(b.candidate.strategy);
        });
        return {
          chosen: scored[0].candidate,
          candidates,
          winRates
        };
      }
      recordOutcome(strategy, success) {
        const stats = this.strategyStats[strategy];
        stats.plays += 1;
        if (success) stats.wins += 1;
      }
      recordAnomalyOutcome(severity) {
        this.anomalyOutcomes.push(severity);
        if (this.anomalyOutcomes.length > 30) {
          this.anomalyOutcomes = this.anomalyOutcomes.slice(this.anomalyOutcomes.length - 30);
        }
      }
      getLastThreeOutcomes() {
        if (this.anomalyOutcomes.length <= 3) return [...this.anomalyOutcomes];
        return this.anomalyOutcomes.slice(this.anomalyOutcomes.length - 3);
      }
      getWinRates() {
        return {
          CONSERVATIVE: this.computeWinRate("CONSERVATIVE"),
          AGGRESSIVE: this.computeWinRate("AGGRESSIVE"),
          ADAPTIVE: this.computeWinRate("ADAPTIVE")
        };
      }
      computeWinRate(strategy) {
        const stats = this.strategyStats[strategy];
        if (stats.plays === 0) return 0.5;
        return stats.wins / stats.plays;
      }
      runConservative(context) {
        if (context.anomalySeverity === "EMERGENCY") {
          return {
            strategy: "CONSERVATIVE",
            recommendedAction: "ENABLE_THROTTLE_MODE",
            confidenceScore: 0.72,
            reason: "Emergency detected; conservative strategy enables throttle first."
          };
        }
        if (context.predictiveState === "PREEMPTIVE_DEGRADATION" || context.anomalySeverity === "CRITICAL") {
          return {
            strategy: "CONSERVATIVE",
            recommendedAction: "PAUSE_AI_QUEUE",
            confidenceScore: 0.66,
            reason: "High latency risk; conservative strategy pauses AI queue to protect stability."
          };
        }
        if (context.anomalySeverity === "WARNING") {
          return {
            strategy: "CONSERVATIVE",
            recommendedAction: "ENABLE_THROTTLE_MODE",
            confidenceScore: 0.58,
            reason: "Warning state; conservative strategy applies mild traffic control."
          };
        }
        return {
          strategy: "CONSERVATIVE",
          recommendedAction: "NONE",
          confidenceScore: 0.52,
          reason: "Normal state; conservative strategy keeps system unchanged."
        };
      }
      runAggressive(context) {
        if (context.anomalySeverity === "EMERGENCY" || context.predictiveState === "CRITICAL_IMMINENT") {
          return {
            strategy: "AGGRESSIVE",
            recommendedAction: "SELECTIVE_WORKER_RESTART",
            confidenceScore: 0.82,
            reason: "Critical imminent condition; aggressive strategy favors rapid worker reset."
          };
        }
        if (context.anomalySeverity === "CRITICAL") {
          return {
            strategy: "AGGRESSIVE",
            recommendedAction: "REDUCE_WORKER_COUNT",
            confidenceScore: 0.74,
            reason: "Critical instability; aggressive strategy trims worker pressure quickly."
          };
        }
        if (context.anomalySeverity === "WARNING") {
          return {
            strategy: "AGGRESSIVE",
            recommendedAction: "PAUSE_AI_QUEUE",
            confidenceScore: 0.61,
            reason: "Warning state with aggressive posture; AI queue is paused preemptively."
          };
        }
        return {
          strategy: "AGGRESSIVE",
          recommendedAction: "NONE",
          confidenceScore: 0.48,
          reason: "Normal state; aggressive strategy does not force intervention."
        };
      }
      runAdaptive(context, conservative, aggressive) {
        const emergencyCount = context.lastThreeAnomalyOutcomes.filter((s) => s === "EMERGENCY").length;
        const criticalCount = context.lastThreeAnomalyOutcomes.filter((s) => s === "CRITICAL").length;
        const unstableTrend = emergencyCount > 0 || criticalCount >= 2 || context.stabilityAverage5m < 62;
        if (unstableTrend || context.predictiveState === "CRITICAL_IMMINENT") {
          return {
            strategy: "ADAPTIVE",
            recommendedAction: aggressive.recommendedAction,
            confidenceScore: Math.min(0.92, aggressive.confidenceScore + 0.08),
            reason: "Adaptive strategy selected aggressive mode due to instability trend in last outcomes."
          };
        }
        if (context.stabilityAverage5m >= 80 && context.anomalySeverity === "NORMAL") {
          return {
            strategy: "ADAPTIVE",
            recommendedAction: "NONE",
            confidenceScore: 0.84,
            reason: "Adaptive strategy keeps no-op under strong 5-minute stability."
          };
        }
        return {
          strategy: "ADAPTIVE",
          recommendedAction: conservative.recommendedAction,
          confidenceScore: Math.min(0.88, conservative.confidenceScore + 0.1),
          reason: "Adaptive strategy selected conservative mode for balanced recovery."
        };
      }
    };
  }
});

// server/intelligence/index.ts
function clamp2(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function normalizeHistory(history, stats) {
  return {
    cpuPercent: stats.boundBuffer(history.cpuPercent || []).slice(-MAX_HISTORY),
    p95LatencyMs: stats.boundBuffer(history.p95LatencyMs || []).slice(-MAX_HISTORY),
    dbLatencyMs: stats.boundBuffer(history.dbLatencyMs || []).slice(-MAX_HISTORY),
    errorRate: stats.boundBuffer(history.errorRate || []).slice(-MAX_HISTORY),
    aiLatencyMs: stats.boundBuffer(history.aiLatencyMs || []).slice(-MAX_HISTORY),
    queueSize: stats.boundBuffer(history.queueSize || []).slice(-MAX_HISTORY),
    ramPercent: stats.boundBuffer(history.ramPercent || []).slice(-MAX_HISTORY),
    requestRate: stats.boundBuffer(history.requestRate || []).slice(-MAX_HISTORY),
    workerCount: stats.boundBuffer(history.workerCount || []).slice(-MAX_HISTORY)
  };
}
async function evaluateSystem(snapshot, history) {
  return ecosystem.evaluateSystem(snapshot, history);
}
function getIntelligenceExplainability() {
  return ecosystem.getExplainability();
}
function injectChaos(input) {
  return ecosystem.injectChaos(input);
}
var MAX_HISTORY, IntelligenceEcosystem, ecosystem;
var init_intelligence = __esm({
  "server/intelligence/index.ts"() {
    "use strict";
    init_AnomalyEngine();
    init_ChaosEngine();
    init_ControlEngine();
    init_CorrelationEngine();
    init_GovernanceEngine();
    init_StabilityDnaEngine();
    init_PredictiveEngine();
    init_StatisticalEngine();
    init_StrategyEngine();
    MAX_HISTORY = 300;
    IntelligenceEcosystem = class {
      constructor() {
        this.stats = new StatisticalEngine(MAX_HISTORY);
        this.correlation = new CorrelationEngine(this.stats);
        this.predictive = new PredictiveEngine(this.stats);
        this.anomaly = new AnomalyEngine(this.stats);
        this.governance = new GovernanceEngine();
        this.strategy = new StrategyEngine();
        this.chaos = new ChaosEngine();
        this.dna = new StabilityDnaEngine();
        this.control = new ControlEngine();
        this.explainability = {
          anomalyBreakdown: {
            normalizedZScore: 0,
            slopeWeight: 0,
            percentileShift: 0,
            correlationWeight: 0,
            forecastRisk: 0,
            mutationFactor: 1,
            weightedScore: 0
          },
          correlationMatrix: {
            cpuToLatency: 0,
            dbToErrors: 0,
            aiToQueue: 0,
            boostedPairs: []
          },
          slopeValues: {},
          forecastProjection: [],
          governanceState: "IDLE",
          chosenStrategy: {
            strategy: "CONSERVATIVE",
            recommendedAction: "NONE",
            confidenceScore: 0.5,
            reason: "No evaluation yet."
          },
          decisionReason: "No evaluation yet."
        };
        this.stabilitySamples = [];
        this.previousStabilityIndex = 100;
        this.previousChosenStrategy = null;
        this.activeIncident = null;
        void this.dna.ensureTable();
      }
      setControlCallbacks(callbacks) {
        this.control = new ControlEngine(callbacks);
      }
      async evaluateSystem(snapshot, history) {
        const normalizedHistory = normalizeHistory(history, this.stats);
        const chaosSnapshot = this.chaos.apply(snapshot);
        const signature = this.dna.buildMetricSignature(chaosSnapshot);
        const mutationFactor = await this.dna.getMutationFactor(signature);
        const correlationResult = this.correlation.evaluate(normalizedHistory);
        const predictiveResult = this.predictive.evaluate(normalizedHistory);
        const anomalySummary = this.anomaly.evaluate({
          snapshot: chaosSnapshot,
          history: normalizedHistory,
          correlationMatrix: correlationResult.matrix,
          predictiveResult,
          mutationFactor
        });
        const stabilityIndex = clamp2(100 - anomalySummary.score * 100, 0, 100);
        this.pushStabilitySample(stabilityIndex, chaosSnapshot.timestamp);
        this.strategy.recordAnomalyOutcome(anomalySummary.severity);
        const strategyOutcome = this.strategy.evaluate({
          snapshot: chaosSnapshot,
          anomalySeverity: anomalySummary.severity,
          predictiveState: predictiveResult.predictiveState,
          governanceState: this.governance.getState(),
          stabilityAverage5m: this.getStabilityAverage5m(chaosSnapshot.timestamp),
          lastThreeAnomalyOutcomes: this.strategy.getLastThreeOutcomes()
        });
        const governanceState = this.governance.update({
          severity: anomalySummary.severity,
          recommendedAction: strategyOutcome.chosen.recommendedAction,
          consensusApproved: anomalySummary.severity !== "NORMAL"
        });
        const controlResult = await this.control.execute({
          requestedAction: strategyOutcome.chosen.recommendedAction,
          governanceState,
          severity: anomalySummary.severity,
          predictiveState: predictiveResult.predictiveState
        });
        if (this.previousChosenStrategy) {
          const success = stabilityIndex >= this.previousStabilityIndex;
          this.strategy.recordOutcome(this.previousChosenStrategy, success);
        }
        this.previousChosenStrategy = strategyOutcome.chosen.strategy;
        this.previousStabilityIndex = stabilityIndex;
        await this.updateIncidentLearning({
          snapshot: chaosSnapshot,
          severity: anomalySummary.severity,
          action: strategyOutcome.chosen.recommendedAction
        });
        this.explainability = {
          anomalyBreakdown: anomalySummary.breakdown,
          correlationMatrix: correlationResult.matrix,
          slopeValues: {
            cpuSlope: this.stats.computeSlope(normalizedHistory.cpuPercent),
            latencySlope: this.stats.computeSlope(normalizedHistory.p95LatencyMs),
            dbSlope: this.stats.computeSlope(normalizedHistory.dbLatencyMs),
            aiSlope: this.stats.computeSlope(normalizedHistory.aiLatencyMs),
            errorSlope: this.stats.computeSlope(normalizedHistory.errorRate)
          },
          forecastProjection: predictiveResult.projection,
          governanceState,
          chosenStrategy: strategyOutcome.chosen,
          decisionReason: `${strategyOutcome.chosen.reason} Control: ${controlResult.reason}`
        };
        return {
          stabilityIndex,
          anomalySummary,
          recommendedAction: strategyOutcome.chosen.recommendedAction,
          predictiveState: predictiveResult.predictiveState,
          governanceState
        };
      }
      getExplainability() {
        return this.explainability;
      }
      injectChaos(input) {
        const event = this.chaos.inject(input);
        return {
          injected: event,
          active: this.chaos.listActive()
        };
      }
      pushStabilitySample(stabilityIndex, now) {
        this.stabilitySamples.push({ ts: now, stabilityIndex });
        const boundary = now - 10 * 6e4;
        this.stabilitySamples = this.stabilitySamples.filter((sample) => sample.ts >= boundary);
      }
      getStabilityAverage5m(now) {
        const boundary = now - 5 * 6e4;
        const slice = this.stabilitySamples.filter((sample) => sample.ts >= boundary);
        if (slice.length === 0) return this.previousStabilityIndex;
        const sum = slice.reduce((acc, sample) => acc + sample.stabilityIndex, 0);
        return sum / slice.length;
      }
      async updateIncidentLearning(params) {
        if (params.severity !== "NORMAL" && !this.activeIncident) {
          this.activeIncident = {
            startedAt: params.snapshot.timestamp,
            metricSignature: this.dna.buildMetricSignature(params.snapshot),
            severity: params.severity,
            actionTaken: params.action
          };
          return;
        }
        if (params.severity !== "NORMAL" && this.activeIncident) {
          this.activeIncident.severity = this.maxSeverity(this.activeIncident.severity, params.severity);
          this.activeIncident.actionTaken = params.action;
          return;
        }
        if (params.severity === "NORMAL" && this.activeIncident) {
          const startedAt = this.activeIncident.startedAt;
          const now = params.snapshot.timestamp;
          const date = new Date(startedAt);
          await this.dna.recordPattern({
            metricSignature: this.activeIncident.metricSignature,
            hour: date.getHours(),
            weekday: date.getDay(),
            severity: this.activeIncident.severity,
            actionTaken: this.activeIncident.actionTaken,
            durationMs: Math.max(0, now - startedAt)
          });
          this.activeIncident = null;
        }
      }
      maxSeverity(a, b) {
        const rank = {
          NORMAL: 0,
          WARNING: 1,
          CRITICAL: 2,
          EMERGENCY: 3
        };
        return rank[a] >= rank[b] ? a : b;
      }
    };
    ecosystem = new IntelligenceEcosystem();
  }
});

// server/index-local.ts
var index_local_exports = {};
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
import os from "node:os";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import bcrypt2 from "bcrypt";
function parseBrowser(userAgent) {
  if (!userAgent) return "Unknown";
  const ua = userAgent;
  const uaLower = ua.toLowerCase();
  const extractVersion = (pattern) => {
    const match = ua.match(pattern);
    if (match && match[1]) {
      const parts = match[1].split(".");
      return parts[0];
    }
    return "";
  };
  if (uaLower.includes("edg/")) {
    const ver = extractVersion(/Edg\/(\d+[\d.]*)/i);
    return ver ? `Edge ${ver}` : "Edge";
  }
  if (uaLower.includes("edge/")) {
    const ver = extractVersion(/Edge\/(\d+[\d.]*)/i);
    return ver ? `Edge ${ver}` : "Edge";
  }
  if (uaLower.includes("opr/")) {
    const ver = extractVersion(/OPR\/(\d+[\d.]*)/i);
    return ver ? `Opera ${ver}` : "Opera";
  }
  if (uaLower.includes("opera/")) {
    const ver = extractVersion(/Opera\/(\d+[\d.]*)/i);
    return ver ? `Opera ${ver}` : "Opera";
  }
  if (uaLower.includes("brave")) {
    const ver = extractVersion(/Brave\/(\d+[\d.]*)/i) || extractVersion(/Chrome\/(\d+[\d.]*)/i);
    return ver ? `Brave ${ver}` : "Brave";
  }
  if (uaLower.includes("duckduckgo")) {
    const ver = extractVersion(/DuckDuckGo\/(\d+[\d.]*)/i);
    return ver ? `DuckDuckGo ${ver}` : "DuckDuckGo";
  }
  if (uaLower.includes("vivaldi")) {
    const ver = extractVersion(/Vivaldi\/(\d+[\d.]*)/i);
    return ver ? `Vivaldi ${ver}` : "Vivaldi";
  }
  if (uaLower.includes("firefox/") || uaLower.includes("fxios/")) {
    const ver = extractVersion(/Firefox\/(\d+[\d.]*)/i) || extractVersion(/FxiOS\/(\d+[\d.]*)/i);
    return ver ? `Firefox ${ver}` : "Firefox";
  }
  if (uaLower.includes("safari/") && !uaLower.includes("chrome/") && !uaLower.includes("chromium/")) {
    const ver = extractVersion(/Version\/(\d+[\d.]*)/i);
    return ver ? `Safari ${ver}` : "Safari";
  }
  if (uaLower.includes("chrome/") || uaLower.includes("crios/") || uaLower.includes("chromium/")) {
    const ver = extractVersion(/Chrome\/(\d+[\d.]*)/i) || extractVersion(/CriOS\/(\d+[\d.]*)/i);
    return ver ? `Chrome ${ver}` : "Chrome";
  }
  if (uaLower.includes("msie") || uaLower.includes("trident/")) {
    const ver = extractVersion(/MSIE (\d+[\d.]*)/i) || extractVersion(/rv:(\d+[\d.]*)/i);
    return ver ? `Internet Explorer ${ver}` : "Internet Explorer";
  }
  return "Unknown";
}
function clamp3(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(clamp3(p, 0, 100) / 100 * (sorted.length - 1));
  return sorted[index];
}
function recordLatency(ms) {
  if (!Number.isFinite(ms) || ms < 0) return;
  latencySamples.push(ms);
  if (latencySamples.length > LATENCY_WINDOW) {
    latencySamples.splice(0, latencySamples.length - LATENCY_WINDOW);
  }
}
function getEventLoopLagMs() {
  const lagMs = Number(eventLoopHistogram.mean) / 1e6;
  return Number.isFinite(lagMs) ? lagMs : 0;
}
function observeDbLatency(ms) {
  if (!Number.isFinite(ms) || ms < 0) return;
  if (lastDbLatencyMs <= 0) {
    lastDbLatencyMs = ms;
  } else {
    lastDbLatencyMs = lastDbLatencyMs * 0.75 + ms * 0.25;
  }
}
function observeAiLatency(ms) {
  if (!Number.isFinite(ms) || ms < 0) return;
  if (lastAiLatencyMs <= 0) {
    lastAiLatencyMs = ms;
  } else {
    lastAiLatencyMs = lastAiLatencyMs * 0.75 + ms * 0.25;
  }
  lastAiLatencyObservedAt = Date.now();
}
function getEffectiveAiLatencyMs(now = Date.now()) {
  if (!Number.isFinite(lastAiLatencyMs) || lastAiLatencyMs <= 0) return 0;
  if (lastAiLatencyObservedAt <= 0) return Math.max(0, lastAiLatencyMs);
  const idleMs = Math.max(0, now - lastAiLatencyObservedAt);
  if (idleMs <= AI_LATENCY_STALE_AFTER_MS) {
    return Math.max(0, lastAiLatencyMs);
  }
  const decayWindowMs = idleMs - AI_LATENCY_STALE_AFTER_MS;
  const decayFactor = Math.exp(-Math.LN2 * decayWindowMs / AI_LATENCY_DECAY_HALF_LIFE_MS);
  const decayed = lastAiLatencyMs * decayFactor;
  return Math.max(0, decayed);
}
function maybeWarnPgPoolPressure(source) {
  const total = Number(pool.totalCount || 0);
  const idle = Number(pool.idleCount || 0);
  const waiting = Number(pool.waitingCount || 0);
  const max = Number(pool?.options?.max || 0);
  const nearMax = max > 0 ? total >= Math.max(1, max - 1) : false;
  const hasPressure = waiting > 0 || idle === 0 || nearMax;
  if (!hasPressure) {
    lastPgPoolWarningSignature = "";
    return;
  }
  const signature = `${total}:${idle}:${waiting}:${max}`;
  const now = Date.now();
  if (signature === lastPgPoolWarningSignature && now - lastPgPoolWarningAt < PG_POOL_WARN_COOLDOWN_MS) {
    return;
  }
  lastPgPoolWarningAt = now;
  lastPgPoolWarningSignature = signature;
  console.warn(
    `[PG_POOL] total=${total} idle=${idle} waiting=${waiting} max=${max} source=${source}`
  );
}
async function withDbCircuit(operation) {
  return circuitDb.execute(async () => {
    const start = Date.now();
    try {
      return await operation();
    } finally {
      observeDbLatency(Date.now() - start);
      maybeWarnPgPoolPressure("db-circuit");
    }
  });
}
async function withAiCircuit(operation) {
  return circuitAi.execute(async () => {
    const start = Date.now();
    try {
      return await operation();
    } finally {
      observeAiLatency(Date.now() - start);
    }
  });
}
async function withExportCircuit(operation) {
  return circuitExport.execute(operation);
}
function isHeavyRoute(pathname) {
  return pathname.startsWith("/api/ai/") || pathname.startsWith("/api/imports") || pathname.startsWith("/api/search/advanced") || pathname.startsWith("/api/backups");
}
function getSearchQueueLength() {
  const map = global.__searchInflightMap;
  return map?.size ?? 0;
}
function roundMetric(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}
function getRamPercent() {
  const total = Number(os.totalmem() || 0);
  const free = Number(os.freemem() || 0);
  if (total <= 0) return 0;
  return roundMetric((total - free) / total * 100, 2);
}
function computeInternalMonitorSnapshot() {
  const workerSamples = controlState.workers || [];
  const maxWorkerP95 = workerSamples.reduce((max, worker) => Math.max(max, Number(worker.latencyP95Ms || 0)), 0);
  const p95LatencyMs = Math.max(percentile(latencySamples, 95), maxWorkerP95);
  const slowQueryCount = workerSamples.filter((worker) => Number(worker.dbLatencyMs || 0) > 600).length;
  const aiFailureRate = clamp3(circuitAi.getSnapshot().failureRate * 100, 0, 100);
  const dbFailureRate = clamp3(circuitDb.getSnapshot().failureRate * 100, 0, 100);
  const exportFailureRate = clamp3(circuitExport.getSnapshot().failureRate * 100, 0, 100);
  const errorRate = Math.max(aiFailureRate, dbFailureRate, exportFailureRate);
  const mode2 = controlState.mode;
  const cpu = roundMetric(cpuPercent, 2);
  const ram = getRamPercent();
  const dbLatency = roundMetric(lastDbLatencyMs, 2);
  const aiLatency = roundMetric(getEffectiveAiLatencyMs(), 2);
  const loopLag = roundMetric(getEventLoopLagMs(), 2);
  let bottleneckType = "NONE";
  const pressureScore = [
    { type: "CPU", score: cpu / 100 },
    { type: "RAM", score: ram / 100 },
    { type: "DB", score: dbLatency / 1200 },
    { type: "AI", score: aiLatency / 1500 },
    { type: "EVENT_LOOP", score: loopLag / 180 },
    { type: "ERRORS", score: errorRate / 10 }
  ].sort((a, b) => b.score - a.score)[0];
  if (pressureScore && pressureScore.score >= 0.5) {
    bottleneckType = pressureScore.type;
  }
  return {
    score: roundMetric(controlState.healthScore, 2),
    mode: mode2,
    cpuPercent: cpu,
    ramPercent: ram,
    p95LatencyMs: roundMetric(p95LatencyMs, 2),
    errorRate: roundMetric(errorRate, 2),
    dbLatencyMs: dbLatency,
    aiLatencyMs: aiLatency,
    eventLoopLagMs: loopLag,
    requestRate: roundMetric(reqRatePerSec, 2),
    activeRequests,
    queueLength: getSearchQueueLength(),
    workerCount: controlState.workerCount,
    maxWorkers: controlState.maxWorkers,
    dbProtection: controlState.dbProtection || lastDbLatencyMs > 1e3,
    slowQueryCount,
    dbConnections: Math.max(0, Number(pool.totalCount || 0) + Number(pool.waitingCount || 0)),
    aiFailRate: roundMetric(aiFailureRate, 2),
    bottleneckType,
    updatedAt: controlState.updatedAt
  };
}
function buildInternalMonitorAlerts(snapshot) {
  const alerts = [];
  const timestamp2 = new Date(snapshot.updatedAt || Date.now()).toISOString();
  const pushAlert = (severity, source, message) => {
    alerts.push({
      id: `${source.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_${severity.toLowerCase()}`,
      severity,
      source,
      message,
      timestamp: timestamp2
    });
  };
  if (snapshot.mode === "PROTECTION") {
    pushAlert("CRITICAL", "MODE", "System is in PROTECTION mode. Heavy routes are restricted.");
  } else if (snapshot.mode === "DEGRADED") {
    pushAlert("WARNING", "MODE", "System is in DEGRADED mode. Throughput throttling is active.");
  }
  if (snapshot.cpuPercent >= 88) {
    pushAlert("CRITICAL", "CPU", `CPU usage is critically high at ${snapshot.cpuPercent.toFixed(1)}%.`);
  } else if (snapshot.cpuPercent >= 75) {
    pushAlert("WARNING", "CPU", `CPU usage is elevated at ${snapshot.cpuPercent.toFixed(1)}%.`);
  }
  if (snapshot.ramPercent >= 92) {
    pushAlert("CRITICAL", "RAM", `RAM usage is critically high at ${snapshot.ramPercent.toFixed(1)}%.`);
  } else if (snapshot.ramPercent >= 80) {
    pushAlert("WARNING", "RAM", `RAM usage is elevated at ${snapshot.ramPercent.toFixed(1)}%.`);
  }
  if (snapshot.dbLatencyMs >= 1e3) {
    pushAlert("CRITICAL", "DB", `Database latency is critical (${snapshot.dbLatencyMs.toFixed(0)} ms).`);
  } else if (snapshot.dbLatencyMs >= 400) {
    pushAlert("WARNING", "DB", `Database latency is elevated (${snapshot.dbLatencyMs.toFixed(0)} ms).`);
  }
  if (snapshot.aiLatencyMs >= 1400) {
    pushAlert("CRITICAL", "AI", `AI latency is critical (${snapshot.aiLatencyMs.toFixed(0)} ms).`);
  } else if (snapshot.aiLatencyMs >= 700) {
    pushAlert("WARNING", "AI", `AI latency is elevated (${snapshot.aiLatencyMs.toFixed(0)} ms).`);
  }
  if (snapshot.eventLoopLagMs >= 170) {
    pushAlert("CRITICAL", "EVENT_LOOP", `Event loop lag is critical (${snapshot.eventLoopLagMs.toFixed(1)} ms).`);
  } else if (snapshot.eventLoopLagMs >= 90) {
    pushAlert("WARNING", "EVENT_LOOP", `Event loop lag is elevated (${snapshot.eventLoopLagMs.toFixed(1)} ms).`);
  }
  if (snapshot.errorRate >= 5) {
    pushAlert("CRITICAL", "ERRORS", `Runtime failure rate is high (${snapshot.errorRate.toFixed(2)}%).`);
  } else if (snapshot.errorRate >= 2) {
    pushAlert("WARNING", "ERRORS", `Runtime failure rate is elevated (${snapshot.errorRate.toFixed(2)}%).`);
  }
  if (snapshot.queueLength >= 10) {
    pushAlert("CRITICAL", "QUEUE", `Request queue is saturated (${snapshot.queueLength} pending).`);
  } else if (snapshot.queueLength >= 5) {
    pushAlert("WARNING", "QUEUE", `Request queue is growing (${snapshot.queueLength} pending).`);
  }
  if (snapshot.workerCount >= snapshot.maxWorkers && snapshot.maxWorkers > 0) {
    pushAlert("WARNING", "WORKERS", `Worker capacity reached (${snapshot.workerCount}/${snapshot.maxWorkers}).`);
  }
  return alerts;
}
function appendIntelligenceValue(key, value) {
  if (!Number.isFinite(value)) return;
  const series = intelligenceHistory[key];
  series.push(value);
  if (series.length > MAX_INTELLIGENCE_HISTORY) {
    series.splice(0, series.length - MAX_INTELLIGENCE_HISTORY);
  }
}
function toIntelligenceSnapshot(snapshot) {
  return {
    timestamp: snapshot.updatedAt || Date.now(),
    score: snapshot.score,
    mode: snapshot.mode,
    cpuPercent: snapshot.cpuPercent,
    ramPercent: snapshot.ramPercent,
    p95LatencyMs: snapshot.p95LatencyMs,
    errorRate: snapshot.errorRate,
    dbLatencyMs: snapshot.dbLatencyMs,
    aiLatencyMs: snapshot.aiLatencyMs,
    eventLoopLagMs: snapshot.eventLoopLagMs,
    requestRate: snapshot.requestRate,
    activeRequests: snapshot.activeRequests,
    queueSize: snapshot.queueLength,
    workerCount: snapshot.workerCount,
    maxWorkers: snapshot.maxWorkers,
    dbConnections: snapshot.dbConnections,
    aiFailRate: snapshot.aiFailRate,
    bottleneckType: snapshot.bottleneckType
  };
}
async function runIntelligenceCycle() {
  if (intelligenceInFlight) return;
  intelligenceInFlight = true;
  try {
    const monitorSnapshot = computeInternalMonitorSnapshot();
    const snapshot = toIntelligenceSnapshot(monitorSnapshot);
    appendIntelligenceValue("cpuPercent", snapshot.cpuPercent);
    appendIntelligenceValue("p95LatencyMs", snapshot.p95LatencyMs);
    appendIntelligenceValue("dbLatencyMs", snapshot.dbLatencyMs);
    appendIntelligenceValue("errorRate", snapshot.errorRate);
    appendIntelligenceValue("aiLatencyMs", snapshot.aiLatencyMs);
    appendIntelligenceValue("queueSize", snapshot.queueSize);
    appendIntelligenceValue("ramPercent", snapshot.ramPercent);
    appendIntelligenceValue("requestRate", snapshot.requestRate);
    appendIntelligenceValue("workerCount", snapshot.workerCount);
    lastIntelligenceResult = await evaluateSystem(snapshot, intelligenceHistory);
  } catch (err) {
    if (API_DEBUG_LOGS) {
      console.warn("Intelligence cycle error:", err);
    }
  } finally {
    intelligenceInFlight = false;
  }
}
function adaptiveRateLimit(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  const windowMs = 1e4;
  const now = Date.now();
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const baseLimit = req.path.startsWith("/api/ai/") ? 14 : 40;
  const modePenalty = controlState.mode === "PROTECTION" ? 0.5 : controlState.mode === "DEGRADED" ? 0.75 : 1;
  const dynamicLimit = Math.max(4, Math.floor(baseLimit * modePenalty * clamp3(controlState.throttleFactor || 1, 0.2, 1.2)));
  const bucket = adaptiveRateState.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    adaptiveRateState.set(ip, { count: 1, resetAt: now + windowMs });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > dynamicLimit) {
    return res.status(429).json({
      message: "Too many requests under current system load.",
      limit: dynamicLimit,
      retryAfterMs: Math.max(0, bucket.resetAt - now),
      mode: controlState.mode
    });
  }
  return next();
}
function systemProtectionMiddleware(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/api/health") || req.path.startsWith("/api/maintenance-status")) {
    return next();
  }
  const dbProtection = controlState.dbProtection || lastDbLatencyMs > 1e3;
  if (dbProtection && req.path.startsWith("/api/search/advanced")) {
    return res.status(503).json({
      message: "Advanced search is temporarily disabled to protect database stability.",
      protection: true,
      reason: "db_latency_high"
    });
  }
  if (dbProtection && req.path.startsWith("/api/backups") && req.method !== "GET") {
    return res.status(503).json({
      message: "Export/backup write operations are temporarily disabled.",
      protection: true,
      reason: "db_latency_high"
    });
  }
  if (controlState.rejectHeavyRoutes && isHeavyRoute(req.path)) {
    return res.status(503).json({
      message: "Route temporarily throttled by protection mode.",
      protection: true,
      mode: controlState.mode
    });
  }
  return next();
}
function ensureObject(value) {
  if (value && typeof value === "object") {
    return value;
  }
  return null;
}
function normalizeUsernameInput(raw) {
  return String(raw ?? "").trim().toLowerCase();
}
function isStrongPassword(raw) {
  if (raw.length < CREDENTIAL_PASSWORD_MIN_LENGTH) return false;
  return /[A-Za-z]/.test(raw) && /\d/.test(raw);
}
function sendCredentialError(res, status, code, message) {
  return res.status(status).json({
    ok: false,
    error: { code, message }
  });
}
function buildCredentialAuditDetails(payload) {
  return JSON.stringify({
    actor_user_id: payload.actor_user_id,
    target_user_id: payload.target_user_id,
    metadata: {
      changedField: payload.changedField
    }
  });
}
function closeActivitySockets(activityIds, reason) {
  for (const activityId of activityIds) {
    const ws = connectedClients.get(activityId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "logout",
        reason
      }));
      ws.close();
    }
    connectedClients.delete(activityId);
  }
}
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token required" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const activity = await storage.getActivityById(decoded.activityId);
    if (!activity || activity.isActive === false || activity.logoutTime !== null) {
      return res.status(401).json({
        message: "Session expired. Please login again.",
        forceLogout: true
      });
    }
    const isVisitorBanned = await storage.isVisitorBanned(
      activity.fingerprint ?? null,
      activity.ipAddress ?? null
    );
    if (isVisitorBanned) {
      return res.status(401).json({
        message: "Session banned. Please login again.",
        forceLogout: true
      });
    }
    await storage.updateActivity(decoded.activityId, {
      lastActivityTime: /* @__PURE__ */ new Date(),
      isActive: true
    });
    req.user = {
      userId: activity.userId || decoded.userId,
      username: activity.username || decoded.username,
      role: activity.role || decoded.role,
      activityId: decoded.activityId
    };
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}
async function getRoleTabVisibilityCached(role) {
  if (role === "superuser") return {};
  const now = Date.now();
  const cached = tabVisibilityCache.get(role);
  if (cached && now - cached.cachedAt < TAB_VISIBILITY_CACHE_TTL_MS) {
    return cached.tabs;
  }
  const tabs = await storage.getRoleTabVisibility(role);
  tabVisibilityCache.set(role, { tabs, cachedAt: now });
  return tabs;
}
function requireTabAccess(tabId) {
  return async (req, res, next) => {
    try {
      const role = req.user?.role;
      if (!role) return res.status(401).json({ message: "Unauthenticated" });
      if (role === "superuser") return next();
      if (role !== "admin" && role !== "user") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const tabs = await getRoleTabVisibilityCached(role);
      const hasExplicit = Object.prototype.hasOwnProperty.call(tabs, tabId);
      const enabled = hasExplicit ? tabs[tabId] !== false : false;
      if (!enabled) {
        return res.status(403).json({ message: `Tab '${tabId}' is disabled for role '${role}'` });
      }
      return next();
    } catch (err) {
      console.error("Tab access guard error:", err);
      return res.status(500).json({ message: err?.message || "Failed to validate tab access" });
    }
  };
}
async function requireMonitorAccess(req, res, next) {
  try {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ message: "Unauthenticated" });
    if (role === "superuser") return next();
    if (role !== "admin" && role !== "user") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    const tabs = await getRoleTabVisibilityCached(role);
    if (tabs.monitor !== true) {
      return res.status(403).json({ message: "System Monitor access is disabled for this role." });
    }
    return next();
  } catch (err) {
    console.error("Monitor access guard error:", err);
    return res.status(500).json({ message: err?.message || "Failed to validate monitor access" });
  }
}
function normalizeAiRole(role) {
  if (role === "superuser") return "superuser";
  if (role === "admin") return "admin";
  return "user";
}
function getAiGateSnapshot(role) {
  const safeRole = role ? normalizeAiRole(role) : "user";
  return {
    globalInFlight: aiGateInflightGlobal,
    globalLimit: AI_GATE_GLOBAL_LIMIT,
    queueSize: aiGateQueue.length,
    queueLimit: AI_GATE_QUEUE_LIMIT,
    role: safeRole,
    roleInFlight: aiGateInflightByRole[safeRole],
    roleLimit: AI_GATE_ROLE_LIMITS[safeRole]
  };
}
function aiGateCanAcquire(role) {
  return aiGateInflightGlobal < AI_GATE_GLOBAL_LIMIT && aiGateInflightByRole[role] < AI_GATE_ROLE_LIMITS[role];
}
function aiGateAcquire(role, route) {
  aiGateInflightGlobal += 1;
  aiGateInflightByRole[role] += 1;
  return {
    role,
    route,
    released: false
  };
}
function aiGateRelease(lease) {
  if (lease.released) return;
  lease.released = true;
  aiGateInflightGlobal = Math.max(0, aiGateInflightGlobal - 1);
  aiGateInflightByRole[lease.role] = Math.max(0, aiGateInflightByRole[lease.role] - 1);
  queueMicrotask(() => {
    drainAiGateQueue();
  });
}
function drainAiGateQueue() {
  if (aiGateQueue.length === 0) return;
  let progressed = true;
  while (progressed && aiGateQueue.length > 0) {
    progressed = false;
    for (let i = 0; i < aiGateQueue.length; i += 1) {
      const item = aiGateQueue[i];
      if (!aiGateCanAcquire(item.role)) continue;
      aiGateQueue.splice(i, 1);
      clearTimeout(item.timeout);
      progressed = true;
      item.resolve({
        lease: aiGateAcquire(item.role, item.route),
        waitedMs: Math.max(0, Date.now() - item.enqueuedAt)
      });
      break;
    }
  }
}
function createAiGateError(message, code, status = 429) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}
function acquireAiGate(role, route) {
  if (aiGateCanAcquire(role)) {
    return Promise.resolve({
      lease: aiGateAcquire(role, route),
      waitedMs: 0
    });
  }
  if (aiGateQueue.length >= AI_GATE_QUEUE_LIMIT) {
    return Promise.reject(
      createAiGateError(
        "AI queue is full. Please retry in a few seconds.",
        "AI_GATE_QUEUE_FULL",
        429
      )
    );
  }
  return new Promise((resolve, reject) => {
    const id = ++aiGateSeq;
    const timeout = setTimeout(() => {
      const index = aiGateQueue.findIndex((item) => item.id === id);
      if (index >= 0) {
        aiGateQueue.splice(index, 1);
      }
      reject(
        createAiGateError(
          "AI queue wait timed out. Please retry.",
          "AI_GATE_WAIT_TIMEOUT",
          429
        )
      );
    }, AI_GATE_QUEUE_WAIT_MS).unref();
    aiGateQueue.push({
      id,
      role,
      route,
      enqueuedAt: Date.now(),
      resolve,
      reject,
      timeout
    });
    drainAiGateQueue();
  });
}
function withAiConcurrencyGate(route, handler) {
  return async (req, res) => {
    const role = normalizeAiRole(req.user?.role);
    let acquired = null;
    try {
      acquired = await acquireAiGate(role, route);
    } catch (error) {
      const status = Number.isFinite(error?.status) ? Number(error.status) : 429;
      const snapshot = getAiGateSnapshot(role);
      return res.status(status).json({
        message: error?.message || "AI queue is currently busy. Please retry shortly.",
        gate: {
          ...snapshot,
          queueWaitMs: AI_GATE_QUEUE_WAIT_MS,
          code: error?.code || "AI_GATE_BUSY"
        }
      });
    }
    const releaseOnce = () => {
      if (!acquired) return;
      aiGateRelease(acquired.lease);
      acquired = null;
    };
    res.once("finish", releaseOnce);
    res.once("close", releaseOnce);
    res.setHeader("x-ai-gate-global-limit", String(AI_GATE_GLOBAL_LIMIT));
    res.setHeader("x-ai-gate-inflight", String(aiGateInflightGlobal));
    res.setHeader("x-ai-gate-queue-size", String(aiGateQueue.length));
    if (acquired.waitedMs > 0) {
      res.setHeader("x-ai-gate-wait-ms", String(Math.round(acquired.waitedMs)));
    }
    try {
      await handler(req, res);
    } finally {
      releaseOnce();
    }
  };
}
function broadcastWsMessage(payload) {
  const msg = JSON.stringify(payload);
  for (const [activityId, ws] of connectedClients.entries()) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectedClients.delete(activityId);
      continue;
    }
    try {
      ws.send(msg);
    } catch {
      connectedClients.delete(activityId);
    }
  }
}
function invalidateMaintenanceCache() {
  maintenanceCache = null;
}
function invalidateRuntimeSettingsCache() {
  runtimeSettingsCache = null;
}
async function getRuntimeSettingsCached(force = false) {
  const now = Date.now();
  if (!force && runtimeSettingsCache && now - runtimeSettingsCache.cachedAt < RUNTIME_SETTINGS_CACHE_TTL_MS) {
    return runtimeSettingsCache.settings;
  }
  const config = await storage.getAppConfig();
  const settings = {
    sessionTimeoutMinutes: Number.isFinite(config.sessionTimeoutMinutes) ? Math.max(1, config.sessionTimeoutMinutes) : DEFAULT_SESSION_TIMEOUT_MINUTES,
    wsIdleMinutes: Number.isFinite(config.wsIdleMinutes) ? Math.max(1, config.wsIdleMinutes) : DEFAULT_WS_IDLE_MINUTES,
    aiEnabled: config.aiEnabled !== false,
    semanticSearchEnabled: config.semanticSearchEnabled !== false,
    aiTimeoutMs: Number.isFinite(config.aiTimeoutMs) ? Math.max(1e3, config.aiTimeoutMs) : DEFAULT_AI_TIMEOUT_MS,
    searchResultLimit: Number.isFinite(config.searchResultLimit) ? Math.min(5e3, Math.max(10, Math.floor(config.searchResultLimit))) : 200,
    viewerRowsPerPage: Number.isFinite(config.viewerRowsPerPage) ? Math.min(500, Math.max(10, Math.floor(config.viewerRowsPerPage))) : 100
  };
  runtimeSettingsCache = { settings, cachedAt: now };
  return settings;
}
async function getMaintenanceStateCached(force = false) {
  const now = Date.now();
  if (!force && maintenanceCache && now - maintenanceCache.cachedAt < MAINTENANCE_CACHE_TTL_MS) {
    return maintenanceCache.state;
  }
  const state = await storage.getMaintenanceState(/* @__PURE__ */ new Date());
  maintenanceCache = { state, cachedAt: now };
  return state;
}
function extractRoleFromToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded?.role || null;
  } catch {
    return null;
  }
}
function isMaintenanceBypassPath(pathname) {
  return pathname.startsWith("/api/login") || pathname.startsWith("/api/auth/login") || pathname.startsWith("/api/health") || pathname.startsWith("/api/maintenance-status") || pathname.startsWith("/api/settings/maintenance") || pathname.startsWith("/internal/") || pathname.startsWith("/ws");
}
async function maintenanceGuard(req, res, next) {
  try {
    if (isMaintenanceBypassPath(req.path)) {
      return next();
    }
    const state = await getMaintenanceStateCached();
    if (!state.maintenance) {
      return next();
    }
    const role = req.user?.role || extractRoleFromToken(req);
    if (role === "superuser" || role === "admin") {
      return next();
    }
    const maintenanceResponse = {
      maintenance: true,
      message: state.message,
      type: state.type,
      startTime: state.startTime,
      endTime: state.endTime
    };
    if (req.path.startsWith("/api/")) {
      if (state.type === "soft") {
        const blockedSoftPrefixes = ["/api/search", "/api/imports", "/api/ai"];
        if (!blockedSoftPrefixes.some((p) => req.path.startsWith(p))) {
          return next();
        }
      }
      return res.status(503).json(maintenanceResponse);
    }
    if (req.path.startsWith("/assets/") || req.path.match(/\.(js|css|png|jpg|svg|ico)$/i)) {
      return next();
    }
    if (state.type === "hard" && req.path !== "/maintenance") {
      return res.redirect(302, "/maintenance");
    }
    return next();
  } catch (err) {
    console.error("Maintenance guard error:", err);
    return next();
  }
}
async function handleLogin(req, res) {
  try {
    const { username, password, fingerprint, pcName, browser } = req.body;
    const normalizedUsername = normalizeUsernameInput(username);
    const user = await storage.getUserByUsername(normalizedUsername);
    if (!user) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: normalizedUsername || "unknown",
        details: "User not found"
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const isVisitorBanned = await storage.isVisitorBanned(fingerprint || null, req.ip || req.socket.remoteAddress || null);
    if (isVisitorBanned) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED_BANNED",
        performedBy: user.username,
        details: "Visitor is banned"
      });
      return res.status(403).json({ message: "Account is banned", banned: true });
    }
    if (user.isBanned) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED_BANNED",
        performedBy: user.username,
        details: "User is banned"
      });
      return res.status(403).json({ message: "Account is banned", banned: true });
    }
    const validPassword = await bcrypt2.compare(String(password ?? ""), user.passwordHash);
    if (!validPassword) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: user.username,
        details: "Invalid password"
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const browserName = parseBrowser(browser || req.headers["user-agent"]);
    if (user.role === "superuser") {
      const enforceSingleSuperuserSession = await storage.getBooleanSystemSetting(
        "enforce_superuser_single_session",
        false
      );
      if (enforceSingleSuperuserSession) {
        const activeSessions = await storage.getActiveActivitiesByUsername(user.username);
        if (activeSessions.length > 0) {
          await storage.createAuditLog({
            action: "LOGIN_BLOCKED_SINGLE_SESSION",
            performedBy: user.username,
            details: `Superuser single-session policy blocked login. Active sessions: ${activeSessions.length}`
          });
          return res.status(409).json({
            message: "Single superuser session is enforced. Logout from the current session first.",
            code: "SUPERUSER_SINGLE_SESSION_ENFORCED"
          });
        }
      }
    } else if (user.role === "admin" && fingerprint) {
      await storage.deactivateUserSessionsByFingerprint(
        user.username,
        fingerprint
      );
    }
    const activity = await storage.createActivity({
      userId: user.id,
      username: user.username,
      role: user.role,
      pcName: pcName || null,
      browser: browserName,
      fingerprint: fingerprint || null,
      ipAddress: req.ip || req.socket.remoteAddress || null
    });
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        activityId: activity.id
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    await storage.createAuditLog({
      action: "LOGIN_SUCCESS",
      performedBy: user.username,
      details: `Login from ${browserName}`
    });
    res.json({
      token,
      username: user.username,
      role: user.role,
      user: { username: user.username, role: user.role },
      activityId: activity.id
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
function isValidMalaysianIC(ic) {
  if (!/^\d{12}$/.test(ic)) return false;
  if (ic.startsWith("01")) return false;
  const mm = parseInt(ic.substring(2, 4), 10);
  const dd = parseInt(ic.substring(4, 6), 10);
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (dd > daysInMonth[mm - 1]) return false;
  return true;
}
function splitCellValue(val) {
  const withoutLabels = val.replace(/\b(IC\d*|NRIC|NO\.?\s*IC|KAD PENGENALAN|KP)\s*[:=]/gi, " ");
  return withoutLabels.split(/[\/,;|\n\r\s]+/).map((s) => s.trim()).filter((s) => s.length > 0);
}
function analyzeDataRows(rows) {
  const icLelakiSet = /* @__PURE__ */ new Set();
  const icPerempuanSet = /* @__PURE__ */ new Set();
  const noPolisSet = /* @__PURE__ */ new Set();
  const noTenteraSet = /* @__PURE__ */ new Set();
  const passportMYSet = /* @__PURE__ */ new Set();
  const passportLuarNegaraSet = /* @__PURE__ */ new Set();
  const valueCounts = {};
  const processedValues = /* @__PURE__ */ new Set();
  const passportPattern = /^[A-Z]{1,2}\d{6,9}$/i;
  const malaysiaPassportPrefixes = ["A", "H", "K", "Q"];
  const excludePrefixes = ["LOT", "NO", "PT", "KM", "JLN", "BLK", "TMN", "KG", "SG", "BTU", "RM"];
  const isValidPolisNo = (val) => {
    if (/^P\d{3,}$/i.test(val)) return false;
    if (/^G\d{5,10}$/i.test(val)) return true;
    if (/^(RF|SW)\d{4,10}$/i.test(val)) return true;
    if (/^(RFT|PDRM|POLIS|POL)\d{3,10}$/i.test(val)) return true;
    return false;
  };
  const isValidTenteraNo = (val) => {
    if (/^M\d{3,}$/i.test(val)) return false;
    if (/^T\d{5,10}$/i.test(val)) return true;
    if (/^(TD|TA|TT)\d{4,10}$/i.test(val)) return true;
    if (/^(TLDM|TUDM|ARMY|ATM|MAF|TEN|MIL)\d{3,10}$/i.test(val)) return true;
    return false;
  };
  rows.forEach((row) => {
    try {
      const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
      Object.entries(data).forEach(([key, val]) => {
        if (val && typeof val === "string") {
          const keyUpper = key.toUpperCase();
          const isExcludedFromIC = excludeColumnsFromIC.some((excl) => keyUpper.includes(excl));
          const isExcludedFromPolice = excludeColumnsFromPolice.some((excl) => keyUpper.includes(excl));
          const fragments = splitCellValue(val.toString());
          for (const fragment of fragments) {
            const cleaned = fragment.toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (cleaned.length === 0) continue;
            valueCounts[cleaned] = (valueCounts[cleaned] || 0) + 1;
            if (processedValues.has(cleaned)) continue;
            processedValues.add(cleaned);
            if (!isExcludedFromIC && isValidMalaysianIC(cleaned)) {
              const lastDigit = parseInt(cleaned.charAt(11), 10);
              if (lastDigit % 2 === 1) {
                icLelakiSet.add(cleaned);
              } else {
                icPerempuanSet.add(cleaned);
              }
            } else if (!isExcludedFromPolice && isValidPolisNo(cleaned)) {
              noPolisSet.add(cleaned);
            } else if (isValidTenteraNo(cleaned)) {
              noTenteraSet.add(cleaned);
            } else if (passportPattern.test(cleaned)) {
              const isExcluded = excludePrefixes.some((prefix) => cleaned.startsWith(prefix));
              if (!isExcluded) {
                const firstChar = cleaned.charAt(0);
                if (malaysiaPassportPrefixes.includes(firstChar)) {
                  passportMYSet.add(cleaned);
                } else {
                  passportLuarNegaraSet.add(cleaned);
                }
              }
            }
          }
        }
      });
    } catch {
    }
  });
  const icLelaki = Array.from(icLelakiSet);
  const icPerempuan = Array.from(icPerempuanSet);
  const noPolis = Array.from(noPolisSet);
  const noTentera = Array.from(noTenteraSet);
  const passportMY = Array.from(passportMYSet);
  const passportLuarNegara = Array.from(passportLuarNegaraSet);
  const duplicateItems = Object.entries(valueCounts).filter(([_, count2]) => count2 > 1).map(([value, count2]) => ({ value, count: count2 })).sort((a, b) => b.count - a.count);
  return {
    icLelaki: { count: icLelaki.length, samples: icLelaki.slice(0, 50) },
    icPerempuan: { count: icPerempuan.length, samples: icPerempuan.slice(0, 50) },
    noPolis: { count: noPolis.length, samples: noPolis.slice(0, 50) },
    noTentera: { count: noTentera.length, samples: noTentera.slice(0, 50) },
    passportMY: { count: passportMY.length, samples: passportMY.slice(0, 50) },
    passportLuarNegara: { count: passportLuarNegara.length, samples: passportLuarNegara.slice(0, 50) },
    duplicates: { count: duplicateItems.length, items: duplicateItems.slice(0, 50) }
  };
}
function trimCacheEntries(cache, maxEntries) {
  if (cache.size <= maxEntries) return;
  const excess = cache.size - maxEntries;
  const keysByAge = Array.from(cache.entries()).sort((a, b) => a[1].ts - b[1].ts).slice(0, excess).map(([key]) => key);
  for (const key of keysByAge) {
    cache.delete(key);
  }
}
function serveStatic() {
  const cwd = process.cwd();
  const possiblePaths = [
    "dist-local/public",
    "dist-local\\public",
    "dist/public",
    "dist\\public"
  ];
  console.log(`  Working directory: ${cwd}`);
  let foundPath = null;
  let foundIndex = null;
  for (const relPath of possiblePaths) {
    const fullPath = path.resolve(cwd, relPath);
    const indexFile = path.join(fullPath, "index.html");
    console.log(`  Checking: ${fullPath}`);
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        const files = fs.readdirSync(fullPath);
        console.log(`    Found ${files.length} files: ${files.slice(0, 5).join(", ")}${files.length > 5 ? "..." : ""}`);
        if (fs.existsSync(indexFile)) {
          foundPath = fullPath;
          foundIndex = indexFile;
          break;
        }
      }
    } catch (err) {
      console.log(`    Error: ${err.message}`);
    }
  }
  if (foundPath && foundIndex) {
    console.log(`  Frontend: Serving from ${foundPath}`);
    app.use(express.static(foundPath));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
        return next();
      }
      res.sendFile(foundIndex);
    });
    console.log(`  Frontend: OK`);
  } else {
    console.log("");
    console.log("  ERROR: Frontend files not found!");
    console.log("  Please run: npm run build:local");
    console.log(`  Expected location: ${path.resolve(cwd, "dist-local/public")}`);
    app.use((req, res) => {
      if (!req.path.startsWith("/api")) {
        res.status(404).send(`
          <html>
            <body style="font-family: sans-serif; padding: 40px;">
              <h1>Frontend Not Built</h1>
              <p>Please run: <code>npm run build:local</code></p>
              <p>Then restart the server.</p>
            </body>
          </html>
        `);
      }
    });
  }
}
async function startServer() {
  console.log("");
  console.log("=========================================");
  console.log("  SQR - SUMBANGAN QUERY RAHMAH");
  console.log("  Mode: Local (PostgreSQL Database)");
  console.log("=========================================");
  console.log("");
  console.log("  Database: PostgreSQL - OK");
  await storage.init();
  if (AI_PRECOMPUTE_ON_START) {
  }
  serveStatic();
  const PORT = parseInt(process.env.PORT || "5000", 10);
  const HOST = "0.0.0.0";
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\u274C Port ${PORT} is already in use.`);
      console.error(`   This usually means a previous server process hasn't fully released the port yet.`);
      console.error(`   Please wait a few seconds and try again, or use: lsof -i :${PORT} (or netstat -ano | findstr :${PORT} on Windows)`);
      process.exit(1);
    } else {
      console.error(`\u274C Server error:`, err);
      process.exit(1);
    }
  });
  server.listen(PORT, HOST, () => {
    console.log("");
    console.log("=========================================");
    console.log(`  Server berjalan di port ${PORT}`);
    console.log("");
    console.log("  Buka browser:");
    console.log(`    http://localhost:${PORT}`);
    console.log("");
    console.log("  Untuk akses dari PC lain (LAN):");
    console.log(`    http://[IP-KOMPUTER]:${PORT}`);
    console.log("=========================================");
    console.log("");
  });
  if (AI_PRECOMPUTE_ON_START) {
    setTimeout(async () => {
      try {
        const rules = await loadCategoryRules();
        const enabledRuleKeys = rules.filter((r) => r.enabled !== false).map((r) => r.key);
        const targetKeys = Array.from(/* @__PURE__ */ new Set(["__all__", ...enabledRuleKeys]));
        const rulesUpdatedAt = await storage.getCategoryRulesMaxUpdatedAt();
        const existing = await storage.getCategoryStats(targetKeys);
        const byKey = new Map(existing.map((row) => [row.key, row]));
        const statsUpdatedAt = byKey.get("__all__")?.updatedAt ?? null;
        const hasAllKeys = targetKeys.every((k) => byKey.has(k));
        const isStale = Boolean(rulesUpdatedAt && statsUpdatedAt && rulesUpdatedAt > statsUpdatedAt);
        if (hasAllKeys && !isStale) {
          console.log("\u2705 Category stats already present. Skipping precompute.");
          return;
        }
        const missingKeys = targetKeys.filter((k) => !byKey.has(k));
        const computeKeys = isStale ? targetKeys : Array.from(/* @__PURE__ */ new Set([...missingKeys, "__all__"]));
        console.log(`\u23F1\uFE0F Precomputing category stats (${computeKeys.length} key(s))...`);
        await storage.computeCategoryStatsForKeys(computeKeys, rules);
        console.log("\u2705 Precomputed category stats.");
      } catch (err) {
        console.error("\u274C Precompute stats failed:", err?.message || err);
      }
    }, 0);
  }
}
var storage, app, server, wss, JWT_SECRET, connectedClients, DEFAULT_SESSION_TIMEOUT_MINUTES, DEFAULT_WS_IDLE_MINUTES, DEFAULT_AI_TIMEOUT_MS, DEFAULT_BODY_LIMIT, IMPORT_BODY_LIMIT, PG_POOL_WARN_COOLDOWN_MS, AI_PRECOMPUTE_ON_START, API_DEBUG_LOGS, LOW_MEMORY_MODE, AI_GATE_GLOBAL_LIMIT, AI_GATE_QUEUE_LIMIT, AI_GATE_QUEUE_WAIT_MS, AI_GATE_ROLE_LIMITS, AI_LATENCY_STALE_AFTER_MS, AI_LATENCY_DECAY_HALF_LIFE_MS, MAINTENANCE_CACHE_TTL_MS, idleSweepRunning, maintenanceCache, RUNTIME_SETTINGS_CACHE_TTL_MS, runtimeSettingsCache, defaultControlState, controlState, preAllocatedBuffer, activeRequests, latencySamples, LATENCY_WINDOW, requestCounter, reqRatePerSec, lastCpuUsage, lastCpuTs, cpuPercent, gcCountWindow, gcPerMinute, lastDbLatencyMs, lastAiLatencyMs, lastAiLatencyObservedAt, lastIntelligenceResult, intelligenceInFlight, lastPgPoolWarningAt, lastPgPoolWarningSignature, MAX_INTELLIGENCE_HISTORY, intelligenceHistory, eventLoopHistogram, circuitAi, circuitDb, circuitExport, DB_METHOD_WRAP_EXCLUDE, storageProto, buildEmbeddingText, adaptiveRateState, CREDENTIAL_USERNAME_REGEX, CREDENTIAL_PASSWORD_MIN_LENGTH, CREDENTIAL_BCRYPT_COST, TAB_VISIBILITY_CACHE_TTL_MS, tabVisibilityCache, aiGateSeq, aiGateInflightGlobal, aiGateInflightByRole, aiGateQueue, excludeColumnsFromIC, excludeColumnsFromPolice, extractJsonObject, parseIntentFallback, DEFAULT_COUNT_GROUPS, CATEGORY_RULES_CACHE_MS, categoryRulesCache, loadCategoryRules, detectCountRequest, statsCache, STATS_CACHE_MS, categoryStatsInflight, MAX_STATS_CACHE_ENTRIES, enqueueCategoryStatsCompute, tokenizeQuery, buildFieldMatchSummary, parseIntent, rowScore, scoreRowDigits, extractLatLng, isLatLng, isNonEmptyString, hasPostcodeCoord, extractCustomerPostcode, extractCustomerLocationHint, toObjectJson, buildExplanation, searchCache, searchInflight, SEARCH_CACHE_MS, MAX_SEARCH_CACHE_ENTRIES, SEARCH_FAST_TIMEOUT_MS, withTimeout, computeAiSearch;
var init_index_local = __esm({
  "server/index-local.ts"() {
    "use strict";
    init_storage_postgres();
    init_db_postgres();
    init_rate_limit();
    init_ai_ollama();
    init_circuitBreaker();
    init_intelligence();
    storage = new PostgresStorage();
    app = express();
    server = createServer(app);
    wss = new WebSocketServer({ server, path: "/ws" });
    JWT_SECRET = process.env.SESSION_SECRET || "sqr-local-secret-key-2025";
    connectedClients = /* @__PURE__ */ new Map();
    DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
    DEFAULT_WS_IDLE_MINUTES = 3;
    DEFAULT_AI_TIMEOUT_MS = 6e3;
    DEFAULT_BODY_LIMIT = "2mb";
    IMPORT_BODY_LIMIT = process.env.IMPORT_BODY_LIMIT || "50mb";
    PG_POOL_WARN_COOLDOWN_MS = 6e4;
    AI_PRECOMPUTE_ON_START = String(process.env.AI_PRECOMPUTE_ON_START || "0") === "1";
    API_DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";
    LOW_MEMORY_MODE = String(process.env.SQR_LOW_MEMORY_MODE ?? "1") === "1";
    AI_GATE_GLOBAL_LIMIT = Math.max(1, Number(process.env.AI_GATE_GLOBAL_LIMIT ?? "4"));
    AI_GATE_QUEUE_LIMIT = Math.max(0, Number(process.env.AI_GATE_QUEUE_LIMIT ?? "20"));
    AI_GATE_QUEUE_WAIT_MS = Math.max(1e3, Number(process.env.AI_GATE_QUEUE_WAIT_MS ?? "12000"));
    AI_GATE_ROLE_LIMITS = {
      user: Math.max(1, Number(process.env.AI_GATE_USER_LIMIT ?? "2")),
      admin: Math.max(1, Number(process.env.AI_GATE_ADMIN_LIMIT ?? "1")),
      superuser: Math.max(1, Number(process.env.AI_GATE_SUPERUSER_LIMIT ?? "1"))
    };
    AI_LATENCY_STALE_AFTER_MS = Math.max(5e3, Number(process.env.AI_LATENCY_STALE_AFTER_MS ?? "20000"));
    AI_LATENCY_DECAY_HALF_LIFE_MS = Math.max(5e3, Number(process.env.AI_LATENCY_DECAY_HALF_LIFE_MS ?? "30000"));
    MAINTENANCE_CACHE_TTL_MS = 3e3;
    idleSweepRunning = false;
    maintenanceCache = null;
    RUNTIME_SETTINGS_CACHE_TTL_MS = 3e3;
    runtimeSettingsCache = null;
    defaultControlState = {
      mode: "NORMAL",
      healthScore: 100,
      dbProtection: false,
      rejectHeavyRoutes: false,
      throttleFactor: 1,
      predictor: {
        requestRateMA: 0,
        latencyMA: 0,
        cpuMA: 0,
        requestRateTrend: 0,
        latencyTrend: 0,
        cpuTrend: 0,
        sustainedUpward: false,
        lastUpdatedAt: null
      },
      workerCount: 1,
      maxWorkers: 1,
      queueLength: 0,
      preAllocateMB: 0,
      updatedAt: Date.now(),
      workers: [],
      circuits: {
        aiOpenWorkers: 0,
        dbOpenWorkers: 0,
        exportOpenWorkers: 0
      }
    };
    controlState = defaultControlState;
    preAllocatedBuffer = null;
    activeRequests = 0;
    latencySamples = [];
    LATENCY_WINDOW = 400;
    requestCounter = 0;
    reqRatePerSec = 0;
    lastCpuUsage = process.cpuUsage();
    lastCpuTs = Date.now();
    cpuPercent = 0;
    gcCountWindow = 0;
    gcPerMinute = 0;
    lastDbLatencyMs = 0;
    lastAiLatencyMs = 0;
    lastAiLatencyObservedAt = 0;
    lastIntelligenceResult = null;
    intelligenceInFlight = false;
    lastPgPoolWarningAt = 0;
    lastPgPoolWarningSignature = "";
    MAX_INTELLIGENCE_HISTORY = 300;
    intelligenceHistory = {
      cpuPercent: [],
      p95LatencyMs: [],
      dbLatencyMs: [],
      errorRate: [],
      aiLatencyMs: [],
      queueSize: [],
      ramPercent: [],
      requestRate: [],
      workerCount: []
    };
    eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
    eventLoopHistogram.enable();
    circuitAi = new CircuitBreaker({
      name: "ai",
      threshold: 0.4,
      minRequests: 10,
      cooldownMs: 8e3
    });
    circuitDb = new CircuitBreaker({
      name: "db",
      threshold: 0.35,
      minRequests: 20,
      cooldownMs: 12e3
    });
    circuitExport = new CircuitBreaker({
      name: "export",
      threshold: 0.4,
      minRequests: 8,
      cooldownMs: 15e3
    });
    DB_METHOD_WRAP_EXCLUDE = /* @__PURE__ */ new Set([
      "constructor"
    ]);
    storageProto = Object.getPrototypeOf(storage);
    for (const methodName of Object.getOwnPropertyNames(storageProto)) {
      if (DB_METHOD_WRAP_EXCLUDE.has(methodName)) continue;
      const method = storage[methodName];
      if (typeof method !== "function") continue;
      if (method.constructor?.name !== "AsyncFunction") continue;
      const original = method.bind(storage);
      storage[methodName] = async (...args) => {
        return withDbCircuit(async () => original(...args));
      };
    }
    try {
      const gcObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) gcCountWindow += entries.length;
      });
      gcObserver.observe({ entryTypes: ["gc"] });
    } catch {
    }
    buildEmbeddingText = (data) => {
      const preferredKeys = [
        "nama",
        "name",
        "full name",
        "alamat",
        "address",
        "bandar",
        "negeri",
        "employer",
        "majikan",
        "company",
        "occupation",
        "job",
        "department",
        "product",
        "model",
        "brand",
        "account",
        "akaun"
      ];
      const entries = Object.entries(data || {});
      const picked = [];
      for (const [key, value] of entries) {
        const lower = key.toLowerCase();
        if (!preferredKeys.some((p) => lower.includes(p))) continue;
        const v = String(value ?? "").trim();
        if (!v) continue;
        if (/^\d+$/.test(v)) continue;
        picked.push(`${key}: ${v}`);
        if (picked.length >= 20) break;
      }
      if (picked.length === 0) {
        for (const [key, value] of entries) {
          const v = String(value ?? "").trim();
          if (!v) continue;
          if (/^\d+$/.test(v)) continue;
          picked.push(`${key}: ${v}`);
          if (picked.length >= 15) break;
        }
      }
      const text2 = picked.join("\n");
      return text2.length > 2e3 ? text2.slice(0, 2e3) : text2;
    };
    adaptiveRateState = /* @__PURE__ */ new Map();
    if (typeof process.on === "function") {
      process.on("message", (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type !== "control-state" || !msg.payload) return;
        controlState = {
          ...defaultControlState,
          ...msg.payload
        };
        const preAllocateMB = clamp3(controlState.preAllocateMB, 0, LOW_MEMORY_MODE ? 8 : 32);
        if (preAllocateMB > 0) {
          const targetBytes = preAllocateMB * 1024 * 1024;
          if (!preAllocatedBuffer || preAllocatedBuffer.length !== targetBytes) {
            preAllocatedBuffer = Buffer.alloc(targetBytes);
          }
        } else {
          preAllocatedBuffer = null;
        }
      });
      process.on("message", (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type !== "graceful-shutdown") return;
        setTimeout(() => {
          server.close(() => process.exit(0));
          setTimeout(() => process.exit(0), 25e3).unref();
        }, 50);
      });
    }
    setInterval(() => {
      reqRatePerSec = requestCounter / 5;
      requestCounter = 0;
      gcPerMinute = gcCountWindow * 12;
      gcCountWindow = 0;
      const now = Date.now();
      const currentCpu = process.cpuUsage();
      const cpuDeltaMicros = currentCpu.user - lastCpuUsage.user + (currentCpu.system - lastCpuUsage.system);
      const elapsedMs = Math.max(1, now - lastCpuTs);
      const cpuCorePercent = cpuDeltaMicros / 1e3 / elapsedMs * 100;
      cpuPercent = clamp3(cpuCorePercent / Math.max(1, controlState.workerCount || 1), 0, 100);
      lastCpuUsage = currentCpu;
      lastCpuTs = now;
      if (process.send) {
        const mem2 = process.memoryUsage();
        process.send({
          type: "worker-metrics",
          payload: {
            workerId: Number(process.env.NODE_UNIQUE_ID || 0),
            pid: process.pid,
            cpuPercent,
            reqRate: reqRatePerSec,
            latencyP95Ms: percentile(latencySamples, 95),
            eventLoopLagMs: getEventLoopLagMs(),
            activeRequests,
            queueLength: getSearchQueueLength(),
            heapUsedMB: mem2.heapUsed / (1024 * 1024),
            heapTotalMB: mem2.heapTotal / (1024 * 1024),
            oldSpaceMB: mem2.heapUsed / (1024 * 1024),
            // best-effort without v8 stats overhead
            gcPerMin: gcPerMinute,
            dbLatencyMs: lastDbLatencyMs,
            aiLatencyMs: getEffectiveAiLatencyMs(),
            ts: Date.now(),
            circuit: {
              ai: { state: circuitAi.getState(), failureRate: circuitAi.getSnapshot().failureRate },
              db: { state: circuitDb.getState(), failureRate: circuitDb.getSnapshot().failureRate },
              export: { state: circuitExport.getState(), failureRate: circuitExport.getSnapshot().failureRate }
            }
          }
        });
      }
      const mem = process.memoryUsage();
      const heapRatio = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;
      if (heapRatio > 0.88) {
        searchCache.clear();
        if (process.send) {
          process.send({ type: "worker-event", payload: { kind: "memory-pressure" } });
        }
        if (typeof global.gc === "function" && activeRequests === 0) {
          try {
            global.gc();
          } catch {
          }
        }
      }
      void runIntelligenceCycle();
    }, 5e3).unref();
    void runIntelligenceCycle();
    app.use("/api/imports", express.json({ limit: IMPORT_BODY_LIMIT }));
    app.use("/api/imports", express.urlencoded({ extended: true, limit: IMPORT_BODY_LIMIT }));
    app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
    app.use(express.urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT }));
    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    });
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      activeRequests += 1;
      requestCounter += 1;
      res.on("finish", () => {
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
        activeRequests = Math.max(0, activeRequests - 1);
        recordLatency(elapsedMs);
      });
      next();
    });
    app.use(adaptiveRateLimit);
    app.use(systemProtectionMiddleware);
    CREDENTIAL_USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
    CREDENTIAL_PASSWORD_MIN_LENGTH = 8;
    CREDENTIAL_BCRYPT_COST = 12;
    TAB_VISIBILITY_CACHE_TTL_MS = 5e3;
    tabVisibilityCache = /* @__PURE__ */ new Map();
    aiGateSeq = 0;
    aiGateInflightGlobal = 0;
    aiGateInflightByRole = {
      user: 0,
      admin: 0,
      superuser: 0
    };
    aiGateQueue = [];
    setInterval(() => {
      for (const [activityId, ws] of connectedClients.entries()) {
        if (!ws || ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) {
          connectedClients.delete(activityId);
        }
      }
    }, 3e4).unref();
    app.use(maintenanceGuard);
    app.get("/api/health", (req, res) => {
      res.json({ status: "ok", mode: "postgresql" });
    });
    app.get("/api/maintenance-status", async (req, res) => {
      try {
        const state = await getMaintenanceStateCached();
        res.json(state);
      } catch (err) {
        res.status(500).json({ message: err?.message || "Failed to load maintenance status" });
      }
    });
    app.get(
      "/internal/system-health",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      requireMonitorAccess,
      (req, res) => {
        const snapshot = computeInternalMonitorSnapshot();
        const alerts = buildInternalMonitorAlerts(snapshot);
        res.json({
          ...snapshot,
          activeAlertCount: alerts.length
        });
      }
    );
    app.get(
      "/internal/system-mode",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      requireMonitorAccess,
      (req, res) => {
        res.json({
          mode: controlState.mode,
          throttleFactor: controlState.throttleFactor,
          rejectHeavyRoutes: controlState.rejectHeavyRoutes,
          dbProtection: controlState.dbProtection || lastDbLatencyMs > 1e3,
          preAllocatedMB: controlState.preAllocateMB,
          updatedAt: controlState.updatedAt
        });
      }
    );
    app.get(
      "/internal/workers",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      requireMonitorAccess,
      (req, res) => {
        res.json({
          count: controlState.workerCount,
          maxWorkers: controlState.maxWorkers,
          workers: controlState.workers,
          updatedAt: controlState.updatedAt
        });
      }
    );
    app.get(
      "/internal/alerts",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      requireMonitorAccess,
      (req, res) => {
        const snapshot = computeInternalMonitorSnapshot();
        const alerts = buildInternalMonitorAlerts(snapshot);
        res.json({
          alerts,
          updatedAt: snapshot.updatedAt
        });
      }
    );
    app.get(
      "/internal/load-trend",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      requireMonitorAccess,
      (req, res) => {
        res.json({
          predictor: controlState.predictor,
          queueLength: controlState.queueLength,
          requestRate: reqRatePerSec,
          p95LatencyMs: percentile(latencySamples, 95),
          updatedAt: controlState.updatedAt
        });
      }
    );
    app.get(
      "/internal/circuit-status",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      requireMonitorAccess,
      (req, res) => {
        res.json({
          local: {
            ai: circuitAi.getSnapshot(),
            db: circuitDb.getSnapshot(),
            export: circuitExport.getSnapshot()
          },
          cluster: controlState.circuits,
          updatedAt: controlState.updatedAt
        });
      }
    );
    app.get(
      "/internal/intelligence/explain",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      requireMonitorAccess,
      (req, res) => {
        const explain = getIntelligenceExplainability();
        res.json({
          anomalyBreakdown: explain.anomalyBreakdown,
          correlationMatrix: explain.correlationMatrix,
          slopeValues: explain.slopeValues,
          forecastProjection: explain.forecastProjection,
          governanceState: explain.governanceState,
          chosenStrategy: explain.chosenStrategy,
          decisionReason: explain.decisionReason
        });
      }
    );
    app.post(
      "/internal/chaos/inject",
      authenticateToken,
      requireRole("admin", "superuser"),
      async (req, res) => {
        try {
          const { type, magnitude, durationMs } = req.body || {};
          const allowed = /* @__PURE__ */ new Set([
            "cpu_spike",
            "db_latency_spike",
            "ai_delay",
            "worker_crash",
            "memory_pressure"
          ]);
          if (!allowed.has(type)) {
            return res.status(400).json({
              message: "Invalid chaos type.",
              allowed: Array.from(allowed)
            });
          }
          const result = injectChaos({
            type,
            magnitude: Number.isFinite(Number(magnitude)) ? Number(magnitude) : void 0,
            durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : void 0
          });
          await storage.createAuditLog({
            action: "CHAOS_INJECTED",
            performedBy: req.user?.username || "system",
            details: `Chaos injected: ${type}`
          });
          return res.json({
            success: true,
            ...result
          });
        } catch (err) {
          return res.status(500).json({ message: err?.message || "Failed to inject chaos event." });
        }
      }
    );
    app.get("/api/data-rows", authenticateToken, async (req, res) => {
      try {
        const importId = req.query.importId;
        const limit = Number(req.query.limit ?? 10);
        const offset = Number(req.query.offset ?? 0);
        if (!importId) {
          return res.status(400).json({ error: "importId is required" });
        }
        const search = String(req.query.q || "").trim();
        const result = await storage.searchDataRows({
          importId,
          search,
          limit,
          offset
        });
        res.json(result);
      } catch (err) {
        console.error("API /api/data-rows error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });
    app.post("/api/login", handleLogin);
    app.post("/api/auth/login", handleLogin);
    app.post("/api/activity/logout", authenticateToken, async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ success: false });
        }
        const activityId = req.user.activityId;
        const activity = await storage.getActivityById(activityId);
        if (!activity || activity.isActive === false) {
          return res.json({ success: true });
        }
        await storage.updateActivity(activityId, {
          isActive: false,
          logoutTime: /* @__PURE__ */ new Date(),
          logoutReason: "USER_LOGOUT"
        });
        const ws = connectedClients.get(activityId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "logout",
            reason: "User logged out"
          }));
          ws.close();
        }
        connectedClients.delete(activityId);
        await storage.createAuditLog({
          action: "LOGOUT",
          performedBy: req.user.username
        });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/activity/all", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("activity"), async (req, res) => {
      try {
        const activities = await storage.getAllActivities();
        res.json({ activities });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/activity/filter", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("activity"), async (req, res) => {
      try {
        const filters = {};
        if (req.query.status) {
          filters.status = req.query.status.split(",");
        }
        if (req.query.username) filters.username = req.query.username;
        if (req.query.ipAddress) filters.ipAddress = req.query.ipAddress;
        if (req.query.browser) filters.browser = req.query.browser;
        if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom);
        if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo);
        const activities = await storage.getFilteredActivities(filters);
        res.json({ activities });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.delete(
      "/api/activity/:id",
      authenticateToken,
      requireRole("admin", "superuser"),
      requireTabAccess("activity"),
      async (req, res) => {
        try {
          const activityId = String(req.params.id);
          if (!activityId) {
            return res.status(400).json({
              success: false,
              message: "Invalid activityId"
            });
          }
          await storage.deleteActivity(activityId);
          res.json({ success: true });
        } catch (error) {
          console.error("Delete activity error:", error);
          res.status(500).json({ message: error.message });
        }
      }
    );
    app.post(
      "/api/activity/kick",
      authenticateToken,
      requireRole("admin", "superuser"),
      requireTabAccess("activity"),
      async (req, res) => {
        try {
          const activityId = String(req.body.activityId);
          if (!activityId) {
            return res.status(400).json({
              success: false,
              message: "Invalid activityId"
            });
          }
          const activity = await storage.getActivityById(activityId);
          if (!activity) {
            return res.status(404).json({ message: "Activity not found" });
          }
          await storage.updateActivity(activityId, {
            isActive: false,
            logoutTime: /* @__PURE__ */ new Date(),
            logoutReason: "KICKED"
          });
          const ws = connectedClients.get(activityId);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "kicked",
              reason: "You have been logged out by an administrator."
            }));
            ws.close();
          }
          connectedClients.delete(activityId);
          await storage.createAuditLog({
            action: "KICK_USER",
            performedBy: req.user.username,
            targetUser: activity.username,
            details: `Kicked activityId=${activityId}`
          });
          res.json({ success: true });
        } catch (error) {
          console.error("Activity kick error:", error);
          res.status(500).json({ message: error.message });
        }
      }
    );
    app.post(
      "/api/activity/ban",
      authenticateToken,
      requireRole("superuser"),
      requireTabAccess("activity"),
      async (req, res) => {
        try {
          const activityId = String(req.body.activityId);
          if (!activityId) {
            return res.status(400).json({
              success: false,
              message: "Invalid activityId"
            });
          }
          const activity = await storage.getActivityById(activityId);
          if (!activity) {
            return res.status(404).json({ message: "Activity not found" });
          }
          const targetUser = await storage.getUserByUsername(activity.username);
          if (targetUser?.role === "superuser") {
            return res.status(403).json({ message: "Cannot ban a superuser" });
          }
          await storage.banVisitor({
            username: activity.username,
            role: activity.role,
            activityId: activity.id,
            fingerprint: activity.fingerprint ?? null,
            ipAddress: activity.ipAddress ?? null,
            browser: activity.browser ?? null,
            pcName: activity.pcName ?? null
          });
          await storage.updateActivity(activityId, {
            isActive: false,
            logoutTime: /* @__PURE__ */ new Date(),
            logoutReason: "BANNED"
          });
          const ws = connectedClients.get(activityId);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "banned",
              reason: "Your account has been banned."
            }));
            ws.close();
          }
          connectedClients.delete(activityId);
          await storage.createAuditLog({
            action: "BAN_USER",
            performedBy: req.user.username,
            targetUser: activity.username,
            details: `Banned via activityId=${activityId}`
          });
          res.json({ success: true });
        } catch (error) {
          console.error("Activity ban error:", error);
          res.status(500).json({ message: error.message });
        }
      }
    );
    app.get("/api/users/banned", authenticateToken, requireRole("admin", "superuser"), requireTabAccess("activity"), async (req, res) => {
      try {
        const bannedSessions = await storage.getBannedSessions();
        const usersWithVisitorId = bannedSessions.map((s) => ({
          visitorId: s.banId,
          banId: s.banId,
          username: s.username,
          role: s.role,
          banInfo: {
            ipAddress: s.ipAddress ?? null,
            browser: s.browser ?? null,
            bannedAt: s.bannedAt ?? null
          }
        }));
        res.json({ users: usersWithVisitorId });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/search/columns", authenticateToken, async (req, res) => {
      try {
        const columns = await storage.getAllColumnNames();
        res.json(columns);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/auth/me", authenticateToken, (req, res) => {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthenticated" });
      }
      res.json({
        user: {
          username: req.user.username,
          role: req.user.role,
          activityId: req.user.activityId
        }
      });
    });
    app.get("/api/me", authenticateToken, async (req, res) => {
      try {
        if (!req.user) {
          return sendCredentialError(res, 401, "PERMISSION_DENIED", "Authentication required.");
        }
        const user = req.user.userId ? await storage.getUser(req.user.userId) : await storage.getUserByUsername(req.user.username);
        if (!user) {
          return sendCredentialError(res, 404, "USER_NOT_FOUND", "User not found.");
        }
        return res.json({
          id: user.id,
          username: user.username,
          role: user.role
        });
      } catch (err) {
        return sendCredentialError(res, 500, "PERMISSION_DENIED", err?.message || "Failed to load user profile.");
      }
    });
    app.patch("/api/me/credentials", authenticateToken, async (req, res) => {
      try {
        if (!req.user) {
          return sendCredentialError(res, 401, "PERMISSION_DENIED", "Authentication required.");
        }
        const actor = req.user.userId ? await storage.getUser(req.user.userId) : await storage.getUserByUsername(req.user.username);
        if (!actor) {
          return sendCredentialError(res, 404, "USER_NOT_FOUND", "User not found.");
        }
        const body = ensureObject(req.body) || {};
        const hasUsernameField = Object.prototype.hasOwnProperty.call(body, "newUsername");
        const hasPasswordField = Object.prototype.hasOwnProperty.call(body, "newPassword");
        let nextUsername;
        let nextPasswordHash;
        let usernameChanged = false;
        let passwordChanged = false;
        if (hasUsernameField) {
          const normalized = normalizeUsernameInput(body.newUsername);
          if (!normalized || !CREDENTIAL_USERNAME_REGEX.test(normalized)) {
            return sendCredentialError(
              res,
              400,
              "USERNAME_TAKEN",
              "Username must match ^[a-zA-Z0-9._-]{3,32}$."
            );
          }
          const existing = await storage.getUserByUsername(normalized);
          if (existing && existing.id !== actor.id) {
            return sendCredentialError(res, 409, "USERNAME_TAKEN", "Username already exists.");
          }
          if (normalized !== actor.username) {
            nextUsername = normalized;
            usernameChanged = true;
          }
        }
        if (hasPasswordField) {
          const nextPasswordRaw = String(body.newPassword ?? "");
          const currentPasswordRaw = String(body.currentPassword ?? "");
          if (!currentPasswordRaw) {
            return sendCredentialError(res, 400, "INVALID_CURRENT_PASSWORD", "Current password is required.");
          }
          const currentPasswordMatch = await bcrypt2.compare(currentPasswordRaw, actor.passwordHash);
          if (!currentPasswordMatch) {
            return sendCredentialError(res, 400, "INVALID_CURRENT_PASSWORD", "Current password is invalid.");
          }
          if (!isStrongPassword(nextPasswordRaw)) {
            return sendCredentialError(
              res,
              400,
              "INVALID_PASSWORD",
              "Password must be at least 8 characters and include at least one letter and one number."
            );
          }
          const sameAsCurrent = await bcrypt2.compare(nextPasswordRaw, actor.passwordHash);
          if (sameAsCurrent) {
            return sendCredentialError(res, 400, "INVALID_PASSWORD", "New password must be different from current password.");
          }
          nextPasswordHash = await bcrypt2.hash(nextPasswordRaw, CREDENTIAL_BCRYPT_COST);
          passwordChanged = true;
        }
        if (!usernameChanged && !passwordChanged) {
          return res.json({
            ok: true,
            user: {
              id: actor.id,
              username: actor.username,
              role: actor.role
            }
          });
        }
        const activeSessions = passwordChanged ? await storage.getActiveActivitiesByUsername(actor.username) : [];
        const updatedUser = await storage.updateUserCredentials({
          userId: actor.id,
          newUsername: nextUsername,
          newPasswordHash: nextPasswordHash,
          passwordChangedAt: passwordChanged ? /* @__PURE__ */ new Date() : void 0
        });
        if (!updatedUser) {
          return sendCredentialError(res, 404, "USER_NOT_FOUND", "User not found.");
        }
        if (usernameChanged && !passwordChanged && nextUsername) {
          await storage.updateActivitiesUsername(actor.username, nextUsername);
        }
        if (usernameChanged) {
          await storage.createAuditLog({
            action: "USER_USERNAME_CHANGED",
            performedBy: actor.id,
            targetUser: updatedUser.id,
            details: buildCredentialAuditDetails({
              actor_user_id: actor.id,
              target_user_id: updatedUser.id,
              changedField: "username"
            })
          });
        }
        if (passwordChanged) {
          await storage.createAuditLog({
            action: "USER_PASSWORD_CHANGED",
            performedBy: actor.id,
            targetUser: updatedUser.id,
            details: buildCredentialAuditDetails({
              actor_user_id: actor.id,
              target_user_id: updatedUser.id,
              changedField: "password"
            })
          });
          await storage.deactivateUserActivities(actor.username, "PASSWORD_CHANGED");
          if (updatedUser.username !== actor.username) {
            await storage.deactivateUserActivities(updatedUser.username, "PASSWORD_CHANGED");
          }
          closeActivitySockets(
            activeSessions.map((activity) => activity.id),
            "Password changed. Please login again."
          );
        }
        return res.json({
          ok: true,
          forceLogout: passwordChanged,
          user: {
            id: updatedUser.id,
            username: updatedUser.username,
            role: updatedUser.role
          }
        });
      } catch (err) {
        if (String(err?.code || "") === "23505") {
          return sendCredentialError(res, 409, "USERNAME_TAKEN", "Username already exists.");
        }
        return sendCredentialError(res, 500, "PERMISSION_DENIED", err?.message || "Failed to update credentials.");
      }
    });
    app.get("/api/admin/users", authenticateToken, async (req, res) => {
      try {
        if (!req.user || req.user.role !== "superuser") {
          return sendCredentialError(res, 403, "PERMISSION_DENIED", "Only superuser can access this resource.");
        }
        const users2 = await storage.getUsersByRoles(["admin", "user"]);
        return res.json({
          ok: true,
          users: users2.map((item) => ({
            id: item.id,
            username: item.username,
            role: item.role
          }))
        });
      } catch (err) {
        return sendCredentialError(res, 500, "PERMISSION_DENIED", err?.message || "Failed to load users.");
      }
    });
    app.patch("/api/admin/users/:id/credentials", authenticateToken, async (req, res) => {
      try {
        if (!req.user || req.user.role !== "superuser") {
          return sendCredentialError(res, 403, "PERMISSION_DENIED", "Only superuser can access this resource.");
        }
        const actor = req.user.userId ? await storage.getUser(req.user.userId) : await storage.getUserByUsername(req.user.username);
        if (!actor) {
          return sendCredentialError(res, 404, "USER_NOT_FOUND", "Actor user not found.");
        }
        const targetUserId = String(req.params.id || "").trim();
        if (!targetUserId) {
          return sendCredentialError(res, 404, "USER_NOT_FOUND", "Target user not found.");
        }
        const target = await storage.getUser(targetUserId);
        if (!target) {
          return sendCredentialError(res, 404, "USER_NOT_FOUND", "Target user not found.");
        }
        if (target.role !== "admin" && target.role !== "user") {
          return sendCredentialError(res, 403, "PERMISSION_DENIED", "Target role is not allowed.");
        }
        const body = ensureObject(req.body) || {};
        const hasUsernameField = Object.prototype.hasOwnProperty.call(body, "newUsername");
        const hasPasswordField = Object.prototype.hasOwnProperty.call(body, "newPassword");
        let nextUsername;
        let nextPasswordHash;
        let usernameChanged = false;
        let passwordChanged = false;
        if (hasUsernameField) {
          const normalized = normalizeUsernameInput(body.newUsername);
          if (!normalized || !CREDENTIAL_USERNAME_REGEX.test(normalized)) {
            return sendCredentialError(
              res,
              400,
              "USERNAME_TAKEN",
              "Username must match ^[a-zA-Z0-9._-]{3,32}$."
            );
          }
          const existing = await storage.getUserByUsername(normalized);
          if (existing && existing.id !== target.id) {
            return sendCredentialError(res, 409, "USERNAME_TAKEN", "Username already exists.");
          }
          if (normalized !== target.username) {
            nextUsername = normalized;
            usernameChanged = true;
          }
        }
        if (hasPasswordField) {
          const nextPasswordRaw = String(body.newPassword ?? "");
          if (!isStrongPassword(nextPasswordRaw)) {
            return sendCredentialError(
              res,
              400,
              "INVALID_PASSWORD",
              "Password must be at least 8 characters and include at least one letter and one number."
            );
          }
          const sameAsCurrent = await bcrypt2.compare(nextPasswordRaw, target.passwordHash);
          if (sameAsCurrent) {
            return sendCredentialError(res, 400, "INVALID_PASSWORD", "New password must be different from current password.");
          }
          nextPasswordHash = await bcrypt2.hash(nextPasswordRaw, CREDENTIAL_BCRYPT_COST);
          passwordChanged = true;
        }
        if (!usernameChanged && !passwordChanged) {
          return res.json({ ok: true });
        }
        const activeSessions = passwordChanged ? await storage.getActiveActivitiesByUsername(target.username) : [];
        const updatedUser = await storage.updateUserCredentials({
          userId: target.id,
          newUsername: nextUsername,
          newPasswordHash: nextPasswordHash,
          passwordChangedAt: passwordChanged ? /* @__PURE__ */ new Date() : void 0
        });
        if (!updatedUser) {
          return sendCredentialError(res, 404, "USER_NOT_FOUND", "Target user not found.");
        }
        if (usernameChanged && !passwordChanged && nextUsername) {
          await storage.updateActivitiesUsername(target.username, nextUsername);
        }
        if (usernameChanged) {
          await storage.createAuditLog({
            action: "USER_USERNAME_CHANGED",
            performedBy: actor.id,
            targetUser: updatedUser.id,
            details: buildCredentialAuditDetails({
              actor_user_id: actor.id,
              target_user_id: updatedUser.id,
              changedField: "username"
            })
          });
        }
        if (passwordChanged) {
          await storage.createAuditLog({
            action: "USER_PASSWORD_CHANGED",
            performedBy: actor.id,
            targetUser: updatedUser.id,
            details: buildCredentialAuditDetails({
              actor_user_id: actor.id,
              target_user_id: updatedUser.id,
              changedField: "password"
            })
          });
          await storage.deactivateUserActivities(target.username, "PASSWORD_RESET_BY_SUPERUSER");
          if (updatedUser.username !== target.username) {
            await storage.deactivateUserActivities(updatedUser.username, "PASSWORD_RESET_BY_SUPERUSER");
          }
          closeActivitySockets(
            activeSessions.map((activity) => activity.id),
            "Password reset by superuser. Please login again."
          );
        }
        return res.json({ ok: true });
      } catch (err) {
        if (String(err?.code || "") === "23505") {
          return sendCredentialError(res, 409, "USERNAME_TAKEN", "Username already exists.");
        }
        return sendCredentialError(res, 500, "PERMISSION_DENIED", err?.message || "Failed to update credentials.");
      }
    });
    app.get("/api/app-config", authenticateToken, async (req, res) => {
      try {
        const config = await storage.getAppConfig();
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.json(config);
      } catch (err) {
        console.error("App config GET error:", err);
        res.status(500).json({ message: err?.message || "Failed to load app config" });
      }
    });
    app.get("/api/settings/tab-visibility", authenticateToken, async (req, res) => {
      try {
        const role = req.user?.role || "user";
        const tabs = await storage.getRoleTabVisibility(role);
        res.json({ role, tabs });
      } catch (err) {
        console.error("Tab visibility GET error:", err);
        res.status(500).json({ message: err?.message || "Failed to load tab visibility" });
      }
    });
    app.get("/api/settings", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
      try {
        const role = req.user?.role || "user";
        const categories = await storage.getSettingsForRole(role);
        res.json({ categories });
      } catch (err) {
        console.error("Settings GET error:", err);
        res.status(500).json({ message: err?.message || "Failed to load settings" });
      }
    });
    app.patch("/api/settings", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
      try {
        const { key, value, confirmCritical } = req.body || {};
        if (!key || typeof key !== "string") {
          return res.status(400).json({ message: "Invalid setting key" });
        }
        const role = req.user?.role || "user";
        const result = await storage.updateSystemSetting({
          role,
          settingKey: key,
          value: value ?? null,
          confirmCritical: Boolean(confirmCritical),
          updatedBy: req.user?.username || "system"
        });
        if (result.status === "not_found") {
          return res.status(404).json({ message: result.message });
        }
        if (result.status === "forbidden") {
          return res.status(403).json({ message: result.message });
        }
        if (result.status === "requires_confirmation") {
          return res.status(409).json({ message: result.message, requiresConfirmation: true });
        }
        if (result.status === "invalid") {
          return res.status(400).json({ message: result.message });
        }
        if (result.status === "updated") {
          tabVisibilityCache.clear();
          invalidateRuntimeSettingsCache();
          await storage.createAuditLog({
            action: result.setting?.isCritical ? "CRITICAL_SETTING_UPDATED" : "SETTING_UPDATED",
            performedBy: req.user?.username || "system",
            targetResource: key,
            details: `Updated setting ${key} to "${String(result.setting?.value ?? "")}"`
          });
          if (key === "ai_timeout_ms") {
            process.env.OLLAMA_TIMEOUT_MS = String(result.setting?.value ?? DEFAULT_AI_TIMEOUT_MS);
          }
          if (result.shouldBroadcast) {
            invalidateMaintenanceCache();
            const maintenanceState = await getMaintenanceStateCached(true);
            broadcastWsMessage({
              type: "maintenance_update",
              maintenance: maintenanceState.maintenance,
              message: maintenanceState.message,
              mode: maintenanceState.type,
              startTime: maintenanceState.startTime,
              endTime: maintenanceState.endTime
            });
          } else {
            broadcastWsMessage({
              type: "settings_updated",
              key,
              updatedBy: req.user?.username || "system"
            });
          }
        }
        return res.json({
          success: result.status === "updated" || result.status === "unchanged",
          status: result.status,
          message: result.message,
          setting: result.setting || null
        });
      } catch (err) {
        console.error("Settings PATCH error:", err);
        res.status(500).json({ message: err?.message || "Failed to update setting" });
      }
    });
    app.post("/api/activity/heartbeat", authenticateToken, async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ ok: false, message: "Unauthenticated" });
        }
        const activityId = req.user.activityId;
        if (API_DEBUG_LOGS) {
          console.log("================================");
          console.log("HEARTBEAT MASUK");
          console.log("Username:", req.user.username);
          console.log("ActivityId:", activityId);
          console.log("Time:", (/* @__PURE__ */ new Date()).toISOString());
          console.log("================================");
        }
        await storage.updateActivity(activityId, {
          lastActivityTime: /* @__PURE__ */ new Date(),
          isActive: true
        });
        res.json({
          ok: true,
          status: "ONLINE",
          lastActivityTime: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (err) {
        console.error("Heartbeat error:", err);
        res.status(500).json({ ok: false });
      }
    });
    app.get("/api/imports", authenticateToken, async (req, res) => {
      try {
        const allImports = await storage.getImports();
        const importsWithRowCount = await Promise.all(
          allImports.map(async (imp) => {
            const rowCount = await storage.getDataRowCountByImport(imp.id);
            return { ...imp, rowCount };
          })
        );
        res.json({ imports: importsWithRowCount });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.post("/api/imports", authenticateToken, async (req, res) => {
      try {
        const { name, filename, rows, data } = req.body;
        const dataRows2 = rows || data || [];
        if (!Array.isArray(dataRows2) || dataRows2.length === 0) {
          return res.status(400).json({ message: "No data rows provided" });
        }
        const importRecord = await storage.createImport({
          name,
          filename,
          createdBy: req.user?.username
        });
        const INSERT_CHUNK_SIZE = 20;
        for (let i = 0; i < dataRows2.length; i += INSERT_CHUNK_SIZE) {
          const chunk = dataRows2.slice(i, i + INSERT_CHUNK_SIZE);
          await Promise.all(
            chunk.map(
              (row) => storage.createDataRow({
                importId: importRecord.id,
                jsonDataJsonb: row
              })
            )
          );
        }
        await storage.createAuditLog({
          action: "IMPORT_DATA",
          performedBy: req.user.username,
          targetResource: name,
          details: `Imported ${dataRows2.length} rows from ${filename}`
        });
        res.json(importRecord);
      } catch (error) {
        console.error("Import error:", error);
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/imports/:id", authenticateToken, async (req, res) => {
      try {
        const importRecord = await storage.getImportById(req.params.id);
        if (!importRecord) {
          return res.status(404).json({ message: "Import not found" });
        }
        const rows = await storage.getDataRowsByImport(req.params.id);
        res.json({ import: importRecord, rows });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get(
      "/api/imports/:id/data",
      authenticateToken,
      searchRateLimiter,
      async (req, res) => {
        try {
          const runtimeSettings = await getRuntimeSettingsCached();
          const importId = req.params.id;
          const rawPage = Number(req.query.page ?? 1);
          const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
          const dbProtected = controlState.dbProtection || lastDbLatencyMs > 1e3;
          const maxLimit = Math.min(dbProtected ? 120 : 500, runtimeSettings.viewerRowsPerPage);
          const rawLimit = Number(req.query.limit ?? runtimeSettings.viewerRowsPerPage);
          const requestedLimit = Number.isFinite(rawLimit) ? Math.floor(rawLimit) : runtimeSettings.viewerRowsPerPage;
          const limit = Math.max(10, Math.min(requestedLimit, maxLimit));
          const offset = (page - 1) * limit;
          const search = String(req.query.search || "").trim();
          if (API_DEBUG_LOGS) {
            console.log(`\u{1F4E5} /api/imports/:id/data called: importId=${importId}, page=${page}, search="${search}"`);
          }
          if (!importId) {
            return res.status(400).json({ message: "importId is required" });
          }
          const result = await storage.searchDataRows({
            importId,
            search: search || null,
            limit,
            offset
          });
          const safeRows = result.rows || [];
          const formattedRows = safeRows.map((row) => ({
            id: row.id,
            importId: row.importId,
            jsonDataJsonb: row.jsonDataJsonb
          }));
          if (API_DEBUG_LOGS) {
            console.log(`\u{1F4E4} Returning ${formattedRows.length} rows, total: ${result.total}`);
          }
          return res.json({
            rows: formattedRows,
            total: result.total || 0,
            page,
            limit
          });
        } catch (error) {
          console.error("GET /api/imports/:id/data error:", error);
          return res.status(500).json({ message: error.message });
        }
      }
    );
    app.get(
      "/api/search/global",
      authenticateToken,
      searchRateLimiter,
      async (req, res) => {
        try {
          const search = String(req.query.q || "").trim();
          if (API_DEBUG_LOGS) {
            console.log(`\u{1F50E} /api/search/global called: search="${search}"`);
          }
          const runtimeSettings = await getRuntimeSettingsCached();
          const rawPage = Number(req.query.page ?? 1);
          const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
          const dbProtected = controlState.dbProtection || lastDbLatencyMs > 1e3;
          const maxTotal = runtimeSettings.searchResultLimit;
          const maxLimit = dbProtected ? Math.min(maxTotal, 80) : maxTotal;
          const requestedLimit = Number(req.query.limit ?? 50);
          const safeRequestedLimit = Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 50;
          const limit = Math.max(10, Math.min(safeRequestedLimit, maxLimit));
          const offset = (page - 1) * limit;
          if (offset >= maxTotal) {
            return res.json({
              columns: [],
              rows: [],
              results: [],
              total: maxTotal,
              page,
              limit
            });
          }
          const remainingBudget = Math.max(1, maxTotal - offset);
          const effectiveLimit = Math.min(limit, remainingBudget);
          if (search.length < 2) {
            if (API_DEBUG_LOGS) {
              console.log(`\u{1F50E} Search too short (${search.length} chars), returning empty`);
            }
            return res.json({
              columns: [],
              rows: [],
              results: [],
              total: 0
            });
          }
          const result = await storage.searchGlobalDataRows({
            search,
            limit: effectiveLimit,
            offset
          });
          if (API_DEBUG_LOGS) {
            console.log(`\u{1F50E} Global search found: ${result.rows.length} rows (total: ${result.total})`);
          }
          const parsedRows = result.rows.map((r) => {
            const base = r.jsonDataJsonb && typeof r.jsonDataJsonb === "object" ? r.jsonDataJsonb : {};
            const sourceFile = r.importFilename || r.importName || "";
            return {
              ...base,
              "Source File": sourceFile
            };
          });
          const columnSet = /* @__PURE__ */ new Set();
          for (const row of parsedRows) {
            Object.keys(row).forEach((key) => columnSet.add(key));
          }
          if (API_DEBUG_LOGS) {
            if (parsedRows.length > 0) {
              console.log(`\u{1F50E} Sample parsed row keys: ${Object.keys(parsedRows[0]).slice(0, 20).join(",")}`);
            } else {
              console.log("\u{1F50E} No parsed rows to sample");
            }
          }
          return res.json({
            columns: Array.from(columnSet),
            rows: parsedRows,
            results: parsedRows,
            total: Math.min(result.total, maxTotal),
            page,
            limit: effectiveLimit
          });
        } catch (error) {
          console.error("GET /api/search/global error:", error);
          return res.status(500).json({ message: error.message });
        }
      }
    );
    app.get(
      "/api/search",
      authenticateToken,
      searchRateLimiter,
      async (req, res) => {
        try {
          const search = String(req.query.q || "").trim();
          if (search.length < 2) {
            return res.json({ results: [], total: 0 });
          }
          const queryResult = await storage.searchSimpleDataRows(search);
          const rows = queryResult.rows || [];
          const results = rows.map((r) => ({
            ...r.jsonDataJsonb,
            _importId: r.importId,
            _importName: r.importName
          }));
          return res.json({
            results,
            total: results.length
          });
        } catch (err) {
          console.error("GET /api/search error:", err);
          res.status(500).json({ message: err.message });
        }
      }
    );
    excludeColumnsFromIC = [
      "AGREEMENT",
      "LOAN",
      "ACCOUNT",
      "AKAUN",
      "PINJAMAN",
      "CONTRACT",
      "KONTRAK",
      "REFERENCE",
      "TRANSACTION",
      "TRANSAKSI",
      "PHONE",
      "TELEFON",
      "MOBILE",
      "HANDPHONE",
      "FAX",
      "FAKS",
      "E-MONEY"
    ];
    excludeColumnsFromPolice = [
      "VEHICLE",
      "KENDERAAN",
      "REGISTRATION",
      "PLATE",
      "RSTG",
      "CAR",
      "KERETA",
      "MOTOR",
      "MOTOSIKAL",
      "VEH",
      "PENDAFTARAN"
    ];
    app.get(
      "/api/imports/:id/analyze",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      requireTabAccess("analysis"),
      async (req, res) => {
        try {
          const importRecord = await storage.getImportById(req.params.id);
          if (!importRecord) {
            return res.status(404).json({ message: "Import not found" });
          }
          const rows = await storage.getDataRowsByImport(req.params.id);
          const analysis = analyzeDataRows(rows);
          res.json({
            import: { id: importRecord.id, name: importRecord.name, filename: importRecord.filename },
            totalRows: rows.length,
            analysis
          });
        } catch (error) {
          res.status(500).json({ message: error.message });
        }
      }
    );
    app.get("/api/analyze/all-summary", authenticateToken, async (req, res) => {
      try {
        const imports2 = await storage.getImports();
        if (imports2.length === 0) {
          return res.json({
            totalImports: 0,
            totalRows: 0,
            imports: [],
            analysis: {
              icLelaki: { count: 0, samples: [] },
              icPerempuan: { count: 0, samples: [] },
              noPolis: { count: 0, samples: [] },
              noTentera: { count: 0, samples: [] },
              passportMY: { count: 0, samples: [] },
              passportLuarNegara: { count: 0, samples: [] },
              duplicates: { count: 0, items: [] }
            }
          });
        }
        let allRows = [];
        const importsWithCounts = await Promise.all(
          imports2.map(async (imp) => {
            const rows = await storage.getDataRowsByImport(imp.id);
            allRows = allRows.concat(rows);
            return { id: imp.id, name: imp.name, filename: imp.filename, rowCount: rows.length };
          })
        );
        const analysis = analyzeDataRows(allRows);
        res.json({
          totalImports: imports2.length,
          totalRows: allRows.length,
          imports: importsWithCounts,
          analysis
        });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.patch("/api/imports/:id", authenticateToken, async (req, res) => {
      try {
        const { name } = req.body;
        const updated = await storage.updateImportName(req.params.id, name);
        if (!updated) {
          return res.status(404).json({ message: "Import not found" });
        }
        await storage.createAuditLog({
          action: "UPDATE_IMPORT",
          performedBy: req.user.username,
          targetResource: name
        });
        res.json(updated);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.patch("/api/imports/:id/rename", authenticateToken, async (req, res) => {
      try {
        const { name } = req.body;
        const updated = await storage.updateImportName(req.params.id, name);
        if (!updated) {
          return res.status(404).json({ message: "Import not found" });
        }
        await storage.createAuditLog({
          action: "UPDATE_IMPORT",
          performedBy: req.user.username,
          targetResource: name
        });
        res.json(updated);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.delete("/api/imports/:id", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
      try {
        const importRecord = await storage.getImportById(req.params.id);
        const deleted = await storage.deleteImport(req.params.id);
        if (!deleted) {
          return res.status(404).json({ message: "Import not found" });
        }
        await storage.createAuditLog({
          action: "DELETE_IMPORT",
          performedBy: req.user.username,
          targetResource: importRecord?.name || req.params.id
        });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.post("/api/search/advanced", authenticateToken, async (req, res) => {
      try {
        const { filters, logic, page = 1, limit = 50 } = req.body;
        const runtimeSettings = await getRuntimeSettingsCached();
        const parsedPage = Number(page);
        const safePage = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
        const maxTotal = runtimeSettings.searchResultLimit;
        const maxLimit = maxTotal;
        const parsedLimit = Number(limit);
        const safeRequestedLimit = Number.isFinite(parsedLimit) ? Math.floor(parsedLimit) : 50;
        const safeLimit = Math.max(10, Math.min(safeRequestedLimit, maxLimit));
        const offset = (safePage - 1) * safeLimit;
        if (offset >= maxTotal) {
          return res.json({
            results: [],
            headers: [],
            total: maxTotal,
            page: safePage,
            limit: safeLimit
          });
        }
        const remainingBudget = Math.max(1, maxTotal - offset);
        const effectiveLimit = Math.min(safeLimit, remainingBudget);
        const rawResult = await storage.advancedSearchDataRows(filters, logic || "AND", effectiveLimit, offset);
        const importsList = await storage.getImports();
        const importMap = new Map(importsList.map((imp) => [imp.id, imp]));
        const parsedResults = rawResult.rows.map((row) => {
          const base = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
          const imp = importMap.get(row.importId);
          const sourceFile = imp?.filename || imp?.name || "";
          return { ...base, "Source File": sourceFile };
        });
        const columnSet = /* @__PURE__ */ new Set();
        for (const row of parsedResults) {
          Object.keys(row).forEach((key) => columnSet.add(key));
        }
        const headers = Array.from(columnSet);
        res.json({
          results: parsedResults,
          headers,
          total: Math.min(rawResult.total || 0, maxTotal),
          page: safePage,
          limit: effectiveLimit
        });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/ai/config", authenticateToken, requireRole("user", "admin", "superuser"), async (req, res) => {
      const runtimeSettings = await getRuntimeSettingsCached();
      res.json({
        ...getOllamaConfig(),
        aiEnabled: runtimeSettings.aiEnabled,
        semanticSearchEnabled: runtimeSettings.semanticSearchEnabled,
        aiTimeoutMs: runtimeSettings.aiTimeoutMs
      });
    });
    extractJsonObject = (text2) => {
      const first = text2.indexOf("{");
      const last = text2.lastIndexOf("}");
      if (first === -1 || last === -1 || last <= first) return null;
      const jsonText = text2.slice(first, last + 1);
      try {
        return JSON.parse(jsonText);
      } catch {
        return null;
      }
    };
    parseIntentFallback = (query) => {
      const lower = query.toLowerCase();
      const digits = query.match(/\d{6,}/g) || [];
      const ic = digits.find((d) => d.length === 12) || null;
      const account = digits.find((d) => d.length >= 10 && d.length <= 16) || null;
      const phone = digits.find((d) => d.length >= 9 && d.length <= 11) || null;
      const needBranch = /cawangan|branch|terdekat|nearest|lokasi|alamat/i.test(query);
      const name = needBranch ? null : ic ? null : query.trim();
      return {
        intent: "search_person",
        entities: {
          name,
          ic,
          account_no: account,
          phone,
          address: null,
          count_groups: null
        },
        need_nearest_branch: needBranch
      };
    };
    DEFAULT_COUNT_GROUPS = [
      {
        key: "kerajaan",
        terms: [
          "kerajaan",
          "government",
          "gov",
          "gomen",
          "sector awam",
          "public sector",
          "kementerian",
          "jabatan",
          "agensi",
          "persekutuan",
          "negeri",
          "majlis",
          "kkm",
          "kpm",
          "kpt",
          "moe",
          "moh",
          "state government",
          "federal",
          "sekolah",
          "guru",
          "teacher",
          "cikgu",
          "pendidikan",
          "government"
        ],
        fields: [
          "EMPLOYER NAME",
          "NATURE OF BUSINESS",
          "NOB",
          "EmployerName",
          "Nature of Business",
          "Company",
          "Nama Majikan",
          "Majikan",
          "Department",
          "Agensi"
        ],
        matchMode: "contains"
      },
      {
        key: "polis",
        terms: ["polis", "police", "pdrm", "polis diraja malaysia", "ipd", "ipk"],
        fields: [
          "EMPLOYER NAME",
          "NATURE OF BUSINESS",
          "NOB",
          "EmployerName",
          "Nature of Business",
          "Company",
          "Nama Majikan",
          "Majikan",
          "Department",
          "Agensi"
        ],
        matchMode: "contains"
      },
      {
        key: "tentera",
        terms: ["tentera", "army", "military", "atm", "angkatan tentera", "tldm", "tudm", "tentera darat", "tentera laut", "tentera udara"],
        fields: [
          "EMPLOYER NAME",
          "NATURE OF BUSINESS",
          "NOB",
          "EmployerName",
          "Nature of Business",
          "Company",
          "Nama Majikan",
          "Majikan",
          "Department",
          "Agensi"
        ],
        matchMode: "contains"
      },
      {
        key: "hospital",
        terms: ["hospital", "klinik", "clinic", "medical", "kesihatan", "health", "klin ik", "medical center", "healthcare"],
        fields: [
          "EMPLOYER NAME",
          "NATURE OF BUSINESS",
          "NOB",
          "EmployerName",
          "Nature of Business",
          "Company",
          "Nama Majikan",
          "Majikan",
          "Department",
          "Agensi"
        ],
        matchMode: "contains"
      },
      {
        key: "hotel",
        terms: ["hotel", "hospitality", "resort", "inn", "motel", "restaurant"],
        fields: [
          "EMPLOYER NAME",
          "NATURE OF BUSINESS",
          "NOB",
          "EmployerName",
          "Nature of Business",
          "Company",
          "Nama Majikan",
          "Majikan",
          "Department",
          "Agensi"
        ],
        matchMode: "contains"
      },
      {
        key: "swasta",
        terms: ["swasta", "private", "sdn bhd", "bhd", "enterprise", "trading", "ltd", "plc"],
        fields: [
          "EMPLOYER NAME",
          "NATURE OF BUSINESS",
          "NOB",
          "EmployerName",
          "Nature of Business",
          "Company",
          "Nama Majikan",
          "Majikan",
          "Department",
          "Agensi"
        ],
        matchMode: "complement"
      }
    ];
    CATEGORY_RULES_CACHE_MS = 6e4;
    categoryRulesCache = null;
    loadCategoryRules = async () => {
      if (categoryRulesCache && Date.now() - categoryRulesCache.ts < CATEGORY_RULES_CACHE_MS) {
        return categoryRulesCache.rules;
      }
      try {
        const rules = await storage.getCategoryRules();
        if (rules.length > 0) {
          categoryRulesCache = { ts: Date.now(), rules };
          return rules;
        }
      } catch {
      }
      return DEFAULT_COUNT_GROUPS;
    };
    detectCountRequest = (query, rules) => {
      const lower = query.toLowerCase();
      const trigger = /(berapa|jumlah|bilangan|ramai|count|how many|berapa orang)/i.test(lower);
      if (!trigger) return null;
      const enabledRules = rules.filter((rule) => rule.enabled !== false);
      const matched = enabledRules.filter(
        (group) => group.terms.some((term) => lower.includes(term.toLowerCase())) || lower.includes(group.key)
      );
      return matched.length > 0 ? matched : enabledRules;
    };
    statsCache = /* @__PURE__ */ new Map();
    STATS_CACHE_MS = 6e4;
    categoryStatsInflight = /* @__PURE__ */ new Map();
    MAX_STATS_CACHE_ENTRIES = Number(process.env.SQR_MAX_STATS_CACHE_ENTRIES ?? (LOW_MEMORY_MODE ? "40" : "120"));
    enqueueCategoryStatsCompute = (keys, rules) => {
      const normalized = Array.from(new Set(keys)).filter(Boolean).sort();
      if (!normalized.length) return;
      const queueKey = normalized.join("|");
      if (categoryStatsInflight.has(queueKey)) return;
      const task = storage.computeCategoryStatsForKeys(normalized, rules).then(() => void 0).catch((err) => {
        console.error("Category stats compute failed:", err?.message || err);
      }).finally(() => {
        categoryStatsInflight.delete(queueKey);
      });
      categoryStatsInflight.set(queueKey, task);
    };
    tokenizeQuery = (text2) => {
      return text2.toLowerCase().split(/\s+/).map((t) => t.replace(/[^a-z0-9]/gi, "")).filter((t) => t.length >= 3);
    };
    buildFieldMatchSummary = (data, query) => {
      const tokens = tokenizeQuery(query);
      if (tokens.length === 0) return [];
      const matches = [];
      const entries = Object.entries(data || {}).slice(0, 80);
      for (const [key, val] of entries) {
        if (key === "id") continue;
        const valueStr = String(val ?? "");
        const valueLower = valueStr.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (valueLower.includes(t)) score += 1;
        }
        if (score > 0) {
          matches.push({ key, value: valueStr, score });
        }
      }
      return matches.sort((a, b) => b.score - a.score).slice(0, 6).map((m) => `${m.key}: ${m.value}`);
    };
    parseIntent = async (query, timeoutMs = DEFAULT_AI_TIMEOUT_MS) => {
      const intentMode = String(process.env.AI_INTENT_MODE || "fast").toLowerCase();
      if (intentMode === "fast") {
        return parseIntentFallback(query);
      }
      const system = `Anda hanya keluarkan JSON SAHAJA. Tugas: kenalpasti intent carian dan entiti.
Format WAJIB:
{"intent":"search_person","entities":{"name":null,"ic":null,"account_no":null,"phone":null,"address":null},"need_nearest_branch":false}
Jika IC/MyKad ada, isi "ic". Jika akaun, isi "account_no". Jika nombor telefon, isi "phone".`;
      const messages = [
        { role: "system", content: system },
        { role: "user", content: query }
      ];
      try {
        const raw = await withAiCircuit(() => ollamaChat(messages, {
          num_predict: 160,
          temperature: 0.1,
          top_p: 0.9,
          timeoutMs
        }));
        const parsed = extractJsonObject(raw);
        if (parsed && parsed.intent && parsed.entities) {
          return {
            intent: String(parsed.intent || "search_person"),
            entities: {
              name: parsed.entities?.name ?? null,
              ic: parsed.entities?.ic ?? null,
              account_no: parsed.entities?.account_no ?? null,
              phone: parsed.entities?.phone ?? null,
              address: parsed.entities?.address ?? null
            },
            need_nearest_branch: Boolean(parsed.need_nearest_branch)
          };
        }
      } catch {
      }
      return parseIntentFallback(query);
    };
    rowScore = (row, ic, name, account, phone) => {
      const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
      let score = 0;
      const icDigits = ic ? ic.replace(/\D/g, "") : "";
      const accountDigits = account ? account.replace(/\D/g, "") : "";
      const phoneDigits = phone ? phone.replace(/\D/g, "") : "";
      const entries = Object.entries(data).slice(0, 80);
      for (const [key, val] of entries) {
        const keyLower = key.toLowerCase();
        const valueStr = String(val ?? "");
        const valueDigits = valueStr.replace(/\D/g, "");
        if (icDigits && valueDigits === icDigits) {
          score += keyLower.includes("ic") || keyLower.includes("mykad") || keyLower.includes("nric") || keyLower.includes("kp") || keyLower.includes("id no") || keyLower.includes("idno") ? 20 : 10;
        }
        if (accountDigits && valueDigits === accountDigits) {
          score += keyLower.includes("akaun") || keyLower.includes("account") ? 12 : 6;
        }
        if (phoneDigits && valueDigits === phoneDigits) {
          score += keyLower.includes("telefon") || keyLower.includes("phone") || keyLower.includes("hp") ? 8 : 4;
        }
        if (name && valueStr.toLowerCase().includes(name.toLowerCase())) {
          score += keyLower.includes("nama") || keyLower.includes("name") ? 6 : 2;
        }
      }
      return score;
    };
    scoreRowDigits = (row, digits) => {
      let data = row?.jsonDataJsonb;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          data = {};
        }
      }
      if (!data || typeof data !== "object") data = {};
      const keyGroups = [
        { keys: ["No. MyKad", "ID No", "No Pengenalan", "IC", "NRIC", "MyKad"], score: 20 },
        { keys: ["Account No", "Account Number", "Card No", "No Akaun", "Nombor Akaun Bank Pemohon"], score: 12 },
        { keys: ["No. Telefon Rumah", "No. Telefon Bimbit", "Phone", "Handphone", "OfficePhone"], score: 8 }
      ];
      let best = 0;
      for (const group of keyGroups) {
        for (const key of group.keys) {
          const val = data[key];
          if (!val) continue;
          const valueDigits = String(val).replace(/\D/g, "");
          if (valueDigits === digits) {
            best = Math.max(best, group.score);
          }
        }
      }
      return { score: best, parsed: data };
    };
    extractLatLng = (data) => {
      const keys = Object.keys(data);
      const findValue = (names) => {
        const key = keys.find((k) => names.includes(k.toLowerCase()));
        if (!key) return null;
        const val = Number(String(data[key]).replace(/[^0-9.\-]/g, ""));
        return Number.isFinite(val) ? val : null;
      };
      const lat = findValue(["lat", "latitude", "latitud"]);
      const lng = findValue(["lng", "long", "longitude", "longitud"]);
      if (lat === null || lng === null) return null;
      return { lat, lng };
    };
    isLatLng = (value) => {
      if (!value || typeof value !== "object") return false;
      const v = value;
      return typeof v.lat === "number" && Number.isFinite(v.lat) && typeof v.lng === "number" && Number.isFinite(v.lng);
    };
    isNonEmptyString = (value) => {
      return typeof value === "string" && value.trim().length > 0;
    };
    hasPostcodeCoord = (value) => {
      return isLatLng(value);
    };
    extractCustomerPostcode = (data) => {
      if (!data || typeof data !== "object") return null;
      const entries = Object.entries(data);
      const normalize = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
      const relationWords = [
        "pasangan",
        "wakil",
        "hubungan",
        "spouse",
        "guardian",
        "emergency",
        "waris",
        "ibu",
        "bapa",
        "suami",
        "isteri"
      ];
      const relationWordsNorm = relationWords.map(normalize);
      const extractDigits = (value) => {
        if (value === void 0 || value === null) return null;
        const raw = String(value);
        const five = raw.match(/\b\d{5}\b/);
        if (five) return five[0];
        const four = raw.match(/\b\d{4}\b/);
        if (four) return `0${four[0]}`;
        return null;
      };
      const isRelationKey = (normalizedKey) => {
        return relationWordsNorm.some((w) => normalizedKey.includes(w));
      };
      const pickByKey = (matcher, valueMatcher) => {
        for (const [rawKey, rawValue] of entries) {
          const keyNorm = normalize(rawKey);
          if (!matcher(keyNorm, rawKey)) continue;
          if (valueMatcher && !valueMatcher(keyNorm, rawValue)) continue;
          const pc = extractDigits(rawValue);
          if (pc) return pc;
        }
        return null;
      };
      const homePostcode = pickByKey(
        (k) => !isRelationKey(k) && k.includes("home") && (k.includes("postcode") || k.includes("postalcode") || k.includes("poskod"))
      );
      if (homePostcode) return homePostcode;
      const genericPostcode = pickByKey((k) => {
        const isGenericPostcode = k === "poskod" || k === "postcode" || k === "postalcode" || k.endsWith("postcode") || k.endsWith("poskod");
        if (!isGenericPostcode) return false;
        if (/[23]$/.test(k)) return false;
        if (k.includes("office")) return false;
        if (isRelationKey(k)) return false;
        return true;
      });
      if (genericPostcode) return genericPostcode;
      return pickByKey(
        (k) => {
          if (isRelationKey(k)) return false;
          if (k.includes("office")) return false;
          return k.includes("homeaddress") || k.includes("alamatsuratmenyurat") || k === "address" || k.includes("alamat");
        },
        (_k, rawValue) => isNonEmptyString(rawValue)
      );
    };
    extractCustomerLocationHint = (data) => {
      if (!data || typeof data !== "object") return "";
      const normalizeKey = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
      const relationWords = ["pasangan", "wakil", "hubungan", "spouse", "guardian", "waris", "ibu", "bapa", "suami", "isteri"];
      const relationWordsNorm = relationWords.map(normalizeKey);
      const isRelationKey = (normalizedKey) => relationWordsNorm.some((w) => normalizedKey.includes(w));
      const parts = [];
      for (const [rawKey, rawValue] of Object.entries(data)) {
        if (!isNonEmptyString(rawValue)) continue;
        const key = normalizeKey(rawKey);
        if (isRelationKey(key)) continue;
        if (key.includes("office")) continue;
        const isLocationField = key.includes("homeaddress") || key.includes("alamatsuratmenyurat") || key === "address" || key.includes("alamat") || key === "bandar" || key === "city" || key.includes("citytown") || key === "negeri" || key === "state" || key.includes("postcode") || key.includes("poskod");
        if (!isLocationField) continue;
        const val = String(rawValue).trim();
        if (val) parts.push(val);
      }
      return Array.from(new Set(parts)).join(" ");
    };
    toObjectJson = (value) => {
      if (!value) return null;
      if (typeof value === "object") return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return parsed && typeof parsed === "object" ? parsed : null;
        } catch {
          return null;
        }
      }
      return null;
    };
    buildExplanation = async (payload) => {
      const template = () => {
        if (payload.countSummary && payload.countSummary.length > 0) {
          return payload.countSummary.join("\n");
        }
        const personLines = payload.personSummary.length > 0 ? payload.personSummary.map((i) => `${i.label}: ${i.value}`).join("\n") : "Tiada maklumat pelanggan dijumpai.";
        const branchLines = payload.branchSummary.length > 0 ? payload.branchSummary.map((i) => `${i.label}: ${i.value}`).join("\n") : payload.missingCoords ? "Lokasi pelanggan tidak lengkap (tiada LAT/LNG atau Postcode)." : payload.branchTextSearch ? "Tiada padanan cawangan ditemui berdasarkan lokasi/teks." : "Tiada maklumat cawangan dijumpai.";
        let decisionLine = "Tiada cadangan dibuat.";
        if (payload.decision) {
          const timeInfo = payload.estimatedMinutes ? ` Anggaran masa ${payload.estimatedMinutes} minit.` : "";
          const modeInfo = payload.travelMode ? ` Mod: ${payload.travelMode}.` : "";
          if (payload.distanceKm && payload.branch) {
            decisionLine = `Cadangan: ${payload.decision}. Jarak ke ${payload.branch} adalah ${payload.distanceKm.toFixed(1)}KM.${timeInfo}${modeInfo}`;
          } else {
            decisionLine = `Cadangan: ${payload.decision}.${timeInfo}${modeInfo}`;
          }
        } else if (payload.branchSummary.length > 0) {
          decisionLine = "Cadangan: Sila hubungi/kunjungi cawangan di atas.";
        }
        const base = [
          "Maklumat Pelanggan:",
          personLines,
          "",
          "Cadangan Cawangan Terdekat:",
          branchLines,
          "",
          decisionLine
        ];
        if (payload.matchFields && payload.matchFields.length > 0) {
          base.push("", "Padanan Medan (Top):", payload.matchFields.join("\n"));
        }
        if (payload.suggestions && payload.suggestions.length > 0) {
          base.push("", "Cadangan Rekod (fuzzy):", payload.suggestions.join("\n"));
        }
        return base.join("\n");
      };
      return template();
    };
    searchCache = /* @__PURE__ */ new Map();
    searchInflight = /* @__PURE__ */ new Map();
    global.__searchInflightMap = searchInflight;
    SEARCH_CACHE_MS = 6e4;
    MAX_SEARCH_CACHE_ENTRIES = Number(process.env.SQR_MAX_SEARCH_CACHE_ENTRIES ?? (LOW_MEMORY_MODE ? "60" : "180"));
    SEARCH_FAST_TIMEOUT_MS = 5500;
    setInterval(() => {
      const now = Date.now();
      for (const [ip, bucket] of adaptiveRateState.entries()) {
        if (now >= bucket.resetAt + 6e4) {
          adaptiveRateState.delete(ip);
        }
      }
      for (const [key, entry] of searchCache.entries()) {
        if (now - entry.ts >= SEARCH_CACHE_MS) {
          searchCache.delete(key);
        }
      }
      trimCacheEntries(searchCache, Math.max(10, MAX_SEARCH_CACHE_ENTRIES));
      for (const [key, entry] of statsCache.entries()) {
        if (now - entry.ts >= STATS_CACHE_MS) {
          statsCache.delete(key);
        }
      }
      trimCacheEntries(statsCache, Math.max(10, MAX_STATS_CACHE_ENTRIES));
    }, 3e4).unref();
    withTimeout = (promise, ms) => {
      return new Promise((resolve, reject) => {
        const id = setTimeout(() => reject(new Error("timeout")), ms);
        promise.then((val) => {
          clearTimeout(id);
          resolve(val);
        }).catch((err) => {
          clearTimeout(id);
          reject(err);
        });
      });
    };
    computeAiSearch = async (query, userKey, semanticSearchEnabled, aiTimeoutMs) => {
      const intent = await parseIntent(query, aiTimeoutMs);
      const entities = intent.entities || {};
      const keywordTerms = [
        entities.ic,
        entities.account_no,
        entities.phone,
        entities.name
      ].filter(Boolean);
      const keywordQuery = keywordTerms.length > 0 ? keywordTerms[0] : query;
      const digitsOnly = keywordQuery.replace(/[^0-9]/g, "");
      const hasDigitsQuery = digitsOnly.length >= 6;
      const keywordResults = hasDigitsQuery ? await storage.aiKeywordSearch({ query: keywordQuery, limit: 10 }) : await storage.aiNameSearch({ query: keywordQuery, limit: 10 });
      const queryDigits = keywordQuery.replace(/[^0-9]/g, "");
      let fallbackDigitsResults = [];
      if (!hasDigitsQuery && keywordResults.length === 0 && queryDigits.length >= 6) {
        fallbackDigitsResults = await storage.aiDigitsSearch({ digits: queryDigits, limit: 25 });
      }
      if (process.env.AI_DEBUG === "1") {
        console.log("\u{1F9E0} AI_SEARCH DEBUG", {
          query,
          keywordQuery,
          queryDigits,
          keywordCount: keywordResults.length,
          fallbackDigitsCount: fallbackDigitsResults.length
        });
      }
      let vectorResults = [];
      if (semanticSearchEnabled && !hasDigitsQuery) {
        try {
          const embedding = await withAiCircuit(() => ollamaEmbed(query));
          if (embedding.length > 0) {
            vectorResults = await storage.semanticSearch({ embedding, limit: 10 });
          }
        } catch (err) {
          vectorResults = [];
        }
      }
      let best = null;
      let bestScore = 0;
      if (hasDigitsQuery) {
        const candidates = [...keywordResults, ...fallbackDigitsResults];
        for (const row of candidates) {
          const scored = scoreRowDigits(row, queryDigits);
          if (scored.score > bestScore) {
            bestScore = scored.score;
            row.jsonDataJsonb = scored.parsed;
            best = row;
          }
        }
      } else {
        const resultMap = /* @__PURE__ */ new Map();
        for (const row of keywordResults) {
          resultMap.set(row.rowId, row);
        }
        for (const row of fallbackDigitsResults) {
          resultMap.set(row.rowId, row);
        }
        for (const row of vectorResults) {
          resultMap.set(row.rowId, row);
        }
        const combined = Array.from(resultMap.values());
        const ensureJson = (row) => {
          if (row?.jsonDataJsonb && typeof row.jsonDataJsonb === "string") {
            try {
              row.jsonDataJsonb = JSON.parse(row.jsonDataJsonb);
            } catch {
            }
          }
          return row;
        };
        const scored = combined.map((row) => {
          const normalized = ensureJson(row);
          return {
            row: normalized,
            score: rowScore(normalized, entities.ic, entities.name, entities.account_no, entities.phone)
          };
        }).sort((a, b) => b.score - a.score);
        best = scored.length > 0 ? scored[0].row : null;
        bestScore = scored.length > 0 ? scored[0].score : 0;
      }
      if (process.env.AI_DEBUG === "1" && best) {
        const keys = best.jsonDataJsonb && typeof best.jsonDataJsonb === "object" ? Object.keys(best.jsonDataJsonb) : [];
        console.log("\u{1F9E0} AI_SEARCH BEST ROW", {
          rowId: best.rowId,
          jsonType: typeof best.jsonDataJsonb,
          sampleKeys: keys.slice(0, 10)
        });
      }
      if (best) {
        global.__lastAiPerson = global.__lastAiPerson || /* @__PURE__ */ new Map();
        global.__lastAiPerson.set(userKey, best);
      }
      const lastPersonMap = global.__lastAiPerson;
      const fallbackPerson = lastPersonMap?.get(userKey);
      const hasPersonId = Boolean(entities.ic || entities.account_no || entities.phone);
      const shouldFindBranch = intent.need_nearest_branch || hasPersonId;
      const branchTextPreferred = shouldFindBranch && !hasPersonId;
      const personForBranch = branchTextPreferred ? null : best || (!hasPersonId ? fallbackPerson : null) || null;
      const normalizeLocationHint = (value) => value.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
      const branchTimeoutMs = Math.max(700, Math.min(2200, Math.floor(aiTimeoutMs * 0.35)));
      const safeFindBranchesByText = async (text2, limit) => {
        try {
          return await withTimeout(storage.findBranchesByText({ query: text2, limit }), branchTimeoutMs);
        } catch {
          return [];
        }
      };
      const safeFindBranchesByPostcode = async (postcode, limit) => {
        try {
          return await withTimeout(storage.findBranchesByPostcode({ postcode, limit }), branchTimeoutMs);
        } catch {
          return [];
        }
      };
      const safeNearestBranches = async (lat, lng, limit) => {
        try {
          return await withTimeout(storage.getNearestBranches({ lat, lng, limit }), branchTimeoutMs);
        } catch {
          return [];
        }
      };
      const safePostcodeLatLng = async (postcode) => {
        try {
          return await withTimeout(storage.getPostcodeLatLng(postcode), branchTimeoutMs);
        } catch {
          return null;
        }
      };
      let nearestBranch = null;
      let missingCoords = false;
      let branchTextSearch = false;
      try {
        if (branchTextPreferred) {
          const locationHint = normalizeLocationHint(
            query.replace(/cawangan|branch|terdekat|nearest|lokasi|alamat|di|yang|paling|dekat/gi, " ")
          );
          if (locationHint.length >= 3) {
            branchTextSearch = true;
            const branches = await safeFindBranchesByText(locationHint, 3);
            nearestBranch = branches[0] || null;
          } else {
            branchTextSearch = true;
          }
        } else if (personForBranch && shouldFindBranch) {
          const coords = extractLatLng(personForBranch.jsonDataJsonb || {});
          if (isLatLng(coords)) {
            const safeCoords = coords;
            const branches = await safeNearestBranches(safeCoords.lat, safeCoords.lng, 1);
            nearestBranch = branches[0] || null;
          } else {
            let data = toObjectJson(personForBranch.jsonDataJsonb) || {};
            const basePostcode = extractCustomerPostcode(data);
            const baseHint = normalizeLocationHint(extractCustomerLocationHint(data));
            if (!basePostcode && baseHint.length < 3) {
              const locationCandidateRows = [best, ...keywordResults, ...fallbackDigitsResults];
              for (const candidate of locationCandidateRows) {
                const candidateData = toObjectJson(candidate?.jsonDataJsonb);
                if (!candidateData) continue;
                const candidatePostcode = extractCustomerPostcode(candidateData);
                const candidateHint = normalizeLocationHint(extractCustomerLocationHint(candidateData));
                if (candidatePostcode || candidateHint.length >= 3) {
                  data = candidateData;
                  break;
                }
              }
            }
            let postcodeWasProvided = false;
            const postcode = extractCustomerPostcode(data);
            if (postcode) {
              postcodeWasProvided = true;
              if (isNonEmptyString(postcode)) {
                const postcodeDigitsSafe = postcode;
                const pc = await safePostcodeLatLng(postcodeDigitsSafe);
                if (hasPostcodeCoord(pc)) {
                  const pcSafe = pc;
                  const branches = await safeNearestBranches(pcSafe.lat, pcSafe.lng, 1);
                  nearestBranch = branches[0] || null;
                  if (process.env.AI_DEBUG === "1") {
                    console.log("\u{1F9E0} AI_SEARCH POSTCODE_COORD", { postcode: postcodeDigitsSafe, lat: pcSafe.lat, lng: pcSafe.lng, branchCount: branches.length });
                  }
                } else {
                  let branches = await safeFindBranchesByPostcode(postcodeDigitsSafe, 1);
                  if (!branches.length) {
                    try {
                      branches = await storage.findBranchesByPostcode({ postcode: postcodeDigitsSafe, limit: 1 });
                    } catch {
                      branches = [];
                    }
                  }
                  nearestBranch = branches[0] || null;
                  if (process.env.AI_DEBUG === "1") {
                    console.log("\u{1F9E0} AI_SEARCH POSTCODE_TEXT", { postcode: postcodeDigitsSafe, branchCount: branches.length, branch: branches[0]?.name || null });
                  }
                  if (!nearestBranch) missingCoords = false;
                }
              } else {
                missingCoords = true;
              }
            } else {
              missingCoords = true;
            }
            if (!nearestBranch && missingCoords && !postcodeWasProvided) {
              const hint = normalizeLocationHint(extractCustomerLocationHint(data));
              if (hint.length >= 3) {
                branchTextSearch = true;
                const branches = await safeFindBranchesByText(hint, 1);
                nearestBranch = branches[0] ? { ...branches[0], distanceKm: void 0 } : null;
              }
            }
          }
        }
      } catch {
        missingCoords = true;
        nearestBranch = null;
      }
      let decision = null;
      let travelMode = null;
      let estimatedMinutes = null;
      if (nearestBranch?.distanceKm !== void 0) {
        if (nearestBranch.distanceKm < 5) {
          decision = "WALK-IN";
          travelMode = "WALK";
          estimatedMinutes = Math.max(1, Math.round(nearestBranch.distanceKm / 5 * 60));
        } else if (nearestBranch.distanceKm < 20) {
          decision = "DRIVE";
          travelMode = "DRIVE";
          estimatedMinutes = Math.max(1, Math.round(nearestBranch.distanceKm / 40 * 60));
        } else decision = "CALL";
        if (decision === "CALL") {
          travelMode = "CALL";
          estimatedMinutes = null;
        }
      }
      const person = best ? {
        id: best.rowId,
        ...best.jsonDataJsonb
      } : null;
      let suggestions = [];
      if ((!person || bestScore < 6) && !hasDigitsQuery) {
        const fuzzyResults = await storage.aiFuzzySearch({ query, limit: 5 });
        const tokens = tokenizeQuery(query);
        const maxScore = Math.max(1, tokens.length);
        suggestions = fuzzyResults.map((row) => {
          let data = row.jsonDataJsonb;
          if (typeof data === "string") {
            try {
              data = JSON.parse(data);
            } catch {
              data = {};
            }
          }
          if (!data || typeof data !== "object") data = {};
          const name = data["Nama"] || data["Customer Name"] || data["name"] || "-";
          const ic = data["No. MyKad"] || data["ID No"] || data["No Pengenalan"] || data["IC"] || "-";
          const addr = data["Alamat Surat Menyurat"] || data["HomeAddress1"] || data["Address"] || data["Alamat"] || "-";
          const confidence = Math.min(100, Math.round(Number(row.score || 0) / maxScore * 100));
          const hasAny = [name, ic, addr].some((v) => v && v !== "-" && String(v).trim() !== "");
          return hasAny ? `\u2022 ${name} | IC: ${ic} | Alamat: ${addr} | Keyakinan: ${confidence}%` : "";
        }).filter(Boolean);
      }
      const personSummary = [];
      if (person && typeof person === "object") {
        const pushIf = (label, key) => {
          const val = person[key];
          if (val !== void 0 && val !== null && String(val).trim() !== "") {
            personSummary.push({ label, value: String(val) });
          }
        };
        pushIf("Nama", "Nama");
        pushIf("Nama", "Customer Name");
        pushIf("Nama", "name");
        pushIf("No. MyKad", "No. MyKad");
        pushIf("ID No", "ID No");
        pushIf("No Pengenalan", "No Pengenalan");
        pushIf("IC", "ic");
        pushIf("Account No", "Account No");
        pushIf("Card No", "Card No");
        pushIf("No. Telefon Rumah", "No. Telefon Rumah");
        pushIf("No. Telefon Bimbit", "No. Telefon Bimbit");
        pushIf("Handphone", "Handphone");
        pushIf("OfficePhone", "OfficePhone");
        pushIf("Alamat Surat Menyurat", "Alamat Surat Menyurat");
        pushIf("HomeAddress1", "HomeAddress1");
        pushIf("HomeAddress2", "HomeAddress2");
        pushIf("HomeAddress3", "HomeAddress3");
        pushIf("HomePostcode", "HomePostcode");
        pushIf("Home Post Code", "Home Post Code");
        pushIf("Home Postal Code", "Home Postal Code");
        pushIf("Bandar", "Bandar");
        pushIf("Negeri", "Negeri");
        pushIf("Poskod", "Poskod");
      }
      if (personSummary.length === 0 && person && typeof person === "object") {
        const entries = Object.entries(person).filter(([k]) => k !== "id").slice(0, 8);
        for (const [k, v] of entries) {
          if (v !== void 0 && v !== null && String(v).trim() !== "") {
            personSummary.push({ label: k, value: String(v) });
          }
        }
      }
      const branchSummary = [];
      if (nearestBranch) {
        const push = (label, value) => {
          if (value !== void 0 && value !== null && String(value).trim() !== "") {
            branchSummary.push({ label, value: String(value) });
          }
        };
        push("Nama Cawangan", nearestBranch.name);
        push("Alamat", nearestBranch.address);
        push("Telefon", nearestBranch.phone);
        push("Fax", nearestBranch.fax);
        push("Business Hour", nearestBranch.businessHour);
        push("Day Open", nearestBranch.dayOpen);
        push("ATM & CDM", nearestBranch.atmCdm);
        push("Inquiry Availability", nearestBranch.inquiryAvailability);
        push("Application Availability", nearestBranch.applicationAvailability);
        push("AEON Lounge", nearestBranch.aeonLounge);
        push("Jarak (KM)", nearestBranch.distanceKm);
      }
      const explanation = await buildExplanation({
        decision,
        distanceKm: nearestBranch?.distanceKm ?? null,
        branch: nearestBranch?.name ?? null,
        personName: person?.Nama || person?.name || null,
        personSummary,
        branchSummary,
        estimatedMinutes,
        travelMode,
        missingCoords,
        suggestions,
        countSummary: null,
        matchFields: !hasDigitsQuery && person && typeof person === "object" ? buildFieldMatchSummary(person, query) : [],
        branchTextSearch
      });
      const responsePayload = {
        person,
        nearest_branch: nearestBranch ? {
          name: nearestBranch.name,
          address: nearestBranch.address,
          phone: nearestBranch.phone,
          fax: nearestBranch.fax,
          business_hour: nearestBranch.businessHour,
          day_open: nearestBranch.dayOpen,
          atm_cdm: nearestBranch.atmCdm,
          inquiry_availability: nearestBranch.inquiryAvailability,
          application_availability: nearestBranch.applicationAvailability,
          aeon_lounge: nearestBranch.aeonLounge,
          distance_km: nearestBranch.distanceKm,
          travel_mode: travelMode,
          estimated_minutes: estimatedMinutes
        } : null,
        decision,
        ai_explanation: explanation
      };
      const audit = {
        query,
        intent,
        matched_profile_id: person?.id || null,
        branch: nearestBranch?.name || null,
        distance_km: nearestBranch?.distanceKm || null,
        decision,
        travel_mode: travelMode,
        estimated_minutes: estimatedMinutes,
        used_last_person: !best && !!fallbackPerson
      };
      return { payload: responsePayload, audit };
    };
    app.post(
      "/api/ai/search",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      withAiConcurrencyGate("search", async (req, res) => {
        try {
          const query = String(req.body?.query || "").trim();
          if (!query) {
            return res.status(400).json({ message: "Query required" });
          }
          const runtimeSettings = await getRuntimeSettingsCached();
          if (!runtimeSettings.aiEnabled) {
            return res.status(503).json({
              message: "AI assistant is disabled by system settings.",
              disabled: true
            });
          }
          const rules = await loadCategoryRules();
          const countGroups = detectCountRequest(query, rules);
          if (countGroups) {
            const keys = [...countGroups.map((g) => g.key), "__all__"];
            const rulesUpdatedAt = await storage.getCategoryRulesMaxUpdatedAt();
            let statsRows = await storage.getCategoryStats(keys);
            let statsMap = new Map(statsRows.map((row) => [row.key, row]));
            let totalRow = statsMap.get("__all__");
            const statsUpdatedAt = totalRow?.updatedAt ?? null;
            const missingKeys = keys.filter((k) => !statsMap.get(k));
            const staleStats = Boolean(rulesUpdatedAt && statsUpdatedAt && rulesUpdatedAt > statsUpdatedAt);
            if (!totalRow || missingKeys.length > 0 || staleStats) {
              const computeKeys = staleStats ? keys : Array.from(/* @__PURE__ */ new Set([...missingKeys, "__all__"]));
              let readyNow = false;
              try {
                const statsTimeoutMs = Math.max(3e3, runtimeSettings.aiTimeoutMs || DEFAULT_AI_TIMEOUT_MS);
                await withTimeout(storage.computeCategoryStatsForKeys(computeKeys, rules), statsTimeoutMs);
                statsRows = await storage.getCategoryStats(keys);
                statsMap = new Map(statsRows.map((row) => [row.key, row]));
                totalRow = statsMap.get("__all__");
                readyNow = Boolean(totalRow && keys.every((k) => statsMap.has(k)));
              } catch {
                readyNow = false;
              }
              if (!readyNow) {
                enqueueCategoryStatsCompute(computeKeys, rules);
                return res.json({
                  person: null,
                  nearest_branch: null,
                  decision: null,
                  ai_explanation: "Statistik sedang disediakan. Sila cuba semula dalam 10-20 saat.",
                  processing: true
                });
              }
            }
            const summaryLines = [
              "Ringkasan Statistik (berdasarkan data import):",
              `Jumlah rekod dianalisis: ${totalRow?.total ?? 0}`
            ];
            for (const group of countGroups) {
              const row = statsMap.get(group.key);
              const count2 = row?.total ?? 0;
              summaryLines.push(`- ${group.key}: ${count2}`);
              if (row?.samples?.length) {
                summaryLines.push("  Contoh rekod:");
                for (const sample of row.samples.slice(0, 10)) {
                  const source = sample.source ? ` (${sample.source})` : "";
                  summaryLines.push(`  \u2022 ${sample.name} | IC: ${sample.ic}${source}`);
                }
              }
            }
            const explanation2 = summaryLines.join("\n");
            return res.json({
              person: null,
              nearest_branch: null,
              decision: null,
              ai_explanation: explanation2,
              stats: statsRows
            });
          }
          const cacheKey = `search:${query.toLowerCase()}`;
          const cached = searchCache.get(cacheKey);
          if (cached && Date.now() - cached.ts < SEARCH_CACHE_MS) {
            setTimeout(() => {
              storage.createAuditLog({
                action: "AI_SEARCH",
                performedBy: req.user.username,
                targetResource: "ai_search",
                details: JSON.stringify(cached.audit)
              }).catch((err) => {
                console.error("Audit log failed:", err?.message || err);
              });
            }, 0);
            return res.json(cached.payload);
          }
          if (cached) {
            searchCache.delete(cacheKey);
          }
          let inflight = searchInflight.get(cacheKey);
          if (!inflight) {
            inflight = withAiCircuit(() => computeAiSearch(
              query,
              req.user.activityId || req.user.username,
              runtimeSettings.semanticSearchEnabled,
              runtimeSettings.aiTimeoutMs
            )).then((result) => {
              searchCache.set(cacheKey, { ts: Date.now(), payload: result.payload, audit: result.audit });
              trimCacheEntries(searchCache, Math.max(10, MAX_SEARCH_CACHE_ENTRIES));
              searchInflight.delete(cacheKey);
              return result;
            }).catch((err) => {
              searchInflight.delete(cacheKey);
              throw err;
            });
            searchInflight.set(cacheKey, inflight);
          }
          try {
            const timeoutMs = Math.max(
              1e3,
              Math.min(
                runtimeSettings.aiTimeoutMs || SEARCH_FAST_TIMEOUT_MS,
                (runtimeSettings.aiTimeoutMs || SEARCH_FAST_TIMEOUT_MS) - 1200
              )
            );
            const result = await withTimeout(inflight, timeoutMs);
            setTimeout(() => {
              storage.createAuditLog({
                action: "AI_SEARCH",
                performedBy: req.user.username,
                targetResource: "ai_search",
                details: JSON.stringify(result.audit)
              }).catch((err) => {
                console.error("Audit log failed:", err?.message || err);
              });
            }, 0);
            return res.json(result.payload);
          } catch (err) {
            if (err instanceof CircuitOpenError) {
              return res.status(503).json({
                person: null,
                nearest_branch: null,
                decision: null,
                ai_explanation: "AI service is temporarily throttled for system stability. Please retry in a few seconds.",
                processing: false,
                circuit: "OPEN"
              });
            }
            if (err?.message && err.message !== "timeout") {
              console.error("AI search compute failed:", err?.message || err);
            }
            return res.json({
              person: null,
              nearest_branch: null,
              decision: null,
              ai_explanation: "Sedang proses carian. Sila tunggu beberapa saat dan cuba semula.",
              processing: true
            });
          }
          const intent = await parseIntent(query);
          const entities = intent.entities || {};
          const keywordTerms = [
            entities.ic,
            entities.account_no,
            entities.phone,
            entities.name
          ].filter(Boolean);
          const keywordQuery = keywordTerms.length > 0 ? keywordTerms[0] : query;
          const digitsOnly = keywordQuery.replace(/[^0-9]/g, "");
          const hasDigitsQuery = digitsOnly.length >= 6;
          const keywordResults = hasDigitsQuery ? await storage.aiKeywordSearch({ query: keywordQuery, limit: 10 }) : await storage.aiNameSearch({ query: keywordQuery, limit: 10 });
          const queryDigits = keywordQuery.replace(/[^0-9]/g, "");
          let fallbackDigitsResults = [];
          if (keywordResults.length === 0 && queryDigits.length >= 6) {
            fallbackDigitsResults = await storage.aiDigitsSearch({ digits: queryDigits, limit: 25 });
          }
          if (process.env.AI_DEBUG === "1") {
            console.log("\u{1F9E0} AI_SEARCH DEBUG", {
              query,
              keywordQuery,
              queryDigits,
              keywordCount: keywordResults.length,
              fallbackDigitsCount: fallbackDigitsResults.length
            });
          }
          let vectorResults = [];
          const vectorMode = String(process.env.AI_VECTOR_MODE || "off").toLowerCase();
          if (vectorMode === "on" && !hasDigitsQuery) {
            try {
              const embedding = await ollamaEmbed(query);
              if (embedding.length > 0) {
                vectorResults = await storage.semanticSearch({ embedding, limit: 10 });
              }
            } catch (err) {
              vectorResults = [];
            }
          }
          let best = null;
          let bestScore = 0;
          if (hasDigitsQuery) {
            const candidates = [...keywordResults, ...fallbackDigitsResults];
            for (const row of candidates) {
              const scored = scoreRowDigits(row, queryDigits);
              if (scored.score > bestScore) {
                bestScore = scored.score;
                row.jsonDataJsonb = scored.parsed;
                best = row;
              }
            }
          } else {
            const resultMap = /* @__PURE__ */ new Map();
            for (const row of keywordResults) {
              resultMap.set(row.rowId, row);
            }
            for (const row of fallbackDigitsResults) {
              resultMap.set(row.rowId, row);
            }
            for (const row of vectorResults) {
              resultMap.set(row.rowId, row);
            }
            const combined = Array.from(resultMap.values());
            const ensureJson = (row) => {
              if (row?.jsonDataJsonb && typeof row.jsonDataJsonb === "string") {
                try {
                  row.jsonDataJsonb = JSON.parse(row.jsonDataJsonb);
                } catch {
                }
              }
              return row;
            };
            const scored = combined.map((row) => {
              const normalized = ensureJson(row);
              return {
                row: normalized,
                score: rowScore(normalized, entities.ic, entities.name, entities.account_no, entities.phone)
              };
            }).sort((a, b) => b.score - a.score);
            best = scored.length > 0 ? scored[0].row : null;
            bestScore = scored.length > 0 ? scored[0].score : 0;
          }
          if (process.env.AI_DEBUG === "1" && best) {
            const keys = best.jsonDataJsonb && typeof best.jsonDataJsonb === "object" ? Object.keys(best.jsonDataJsonb) : [];
            console.log("\u{1F9E0} AI_SEARCH BEST ROW", {
              rowId: best.rowId,
              jsonType: typeof best.jsonDataJsonb,
              sampleKeys: keys.slice(0, 10)
            });
          }
          const userKey = req.user?.activityId || req.user?.username || "unknown";
          if (best) {
            global.__lastAiPerson = global.__lastAiPerson || /* @__PURE__ */ new Map();
            global.__lastAiPerson.set(userKey, best);
          }
          const lastPersonMap = global.__lastAiPerson;
          const fallbackPerson = lastPersonMap?.get(userKey);
          const hasPersonId = Boolean(entities.ic || entities.account_no || entities.phone);
          const shouldFindBranch = intent.need_nearest_branch || hasPersonId;
          const branchTextPreferred = shouldFindBranch && !hasPersonId;
          const personForBranch = branchTextPreferred ? null : best || fallbackPerson || null;
          const normalizeLocationHint = (value) => value.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
          let nearestBranch = null;
          let missingCoords = false;
          let branchTextSearch = false;
          if (branchTextPreferred) {
            const locationHint = normalizeLocationHint(
              query.replace(/cawangan|branch|terdekat|nearest|lokasi|alamat|di|yang|paling|dekat/gi, " ")
            );
            if (locationHint.length >= 3) {
              branchTextSearch = true;
              const branches = await storage.findBranchesByText({ query: locationHint, limit: 3 });
              nearestBranch = branches[0] || null;
            } else {
              branchTextSearch = true;
            }
          } else if (personForBranch && shouldFindBranch) {
            const coords = extractLatLng(personForBranch.jsonDataJsonb || {});
            if (isLatLng(coords)) {
              const safeCoords = coords;
              const branches = await storage.getNearestBranches({ lat: safeCoords.lat, lng: safeCoords.lng, limit: 1 });
              nearestBranch = branches[0] || null;
            } else {
              const initialData = toObjectJson(personForBranch.jsonDataJsonb);
              let data = initialData ?? {};
              const basePostcode = extractCustomerPostcode(data);
              const baseHint = normalizeLocationHint(extractCustomerLocationHint(data));
              if (!basePostcode && baseHint.length < 3) {
                const locationCandidateRows = [best, ...keywordResults, ...fallbackDigitsResults];
                for (const candidate of locationCandidateRows) {
                  const candidateDataRaw = toObjectJson(candidate?.jsonDataJsonb);
                  if (!candidateDataRaw || typeof candidateDataRaw !== "object") continue;
                  const candidateData = candidateDataRaw;
                  const candidatePostcode = extractCustomerPostcode(candidateData);
                  const candidateHint = normalizeLocationHint(extractCustomerLocationHint(candidateData));
                  if (candidatePostcode || candidateHint.length >= 3) {
                    data = candidateData;
                    break;
                  }
                }
              }
              let postcodeWasProvided = false;
              const postcodeRaw = extractCustomerPostcode(data);
              const trimmedPostcode = (postcodeRaw ?? "").trim();
              const postcodeDigitsSafe = trimmedPostcode.length > 0 ? trimmedPostcode : "";
              if (postcodeDigitsSafe) {
                postcodeWasProvided = true;
                const pc = await storage.getPostcodeLatLng(postcodeDigitsSafe);
                if (pc === null) {
                  const branches = await storage.findBranchesByPostcode({ postcode: postcodeDigitsSafe, limit: 1 });
                  nearestBranch = branches[0] || null;
                  if (!nearestBranch) missingCoords = false;
                } else if (hasPostcodeCoord(pc)) {
                  const branches = await storage.getNearestBranches({ lat: pc.lat, lng: pc.lng, limit: 1 });
                  nearestBranch = branches[0] || null;
                } else {
                  const branches = await storage.findBranchesByPostcode({ postcode: postcodeDigitsSafe, limit: 1 });
                  nearestBranch = branches[0] || null;
                  if (!nearestBranch) missingCoords = false;
                }
              } else {
                missingCoords = true;
              }
              if (!nearestBranch && missingCoords && !postcodeWasProvided) {
                const hint = normalizeLocationHint(extractCustomerLocationHint(data));
                if (hint.length >= 3) {
                  branchTextSearch = true;
                  const branches = await storage.findBranchesByText({ query: hint, limit: 1 });
                  nearestBranch = branches[0] ? { ...branches[0], distanceKm: void 0 } : null;
                }
              }
            }
          }
          let decision = null;
          let travelMode = null;
          let estimatedMinutes = null;
          if (nearestBranch?.distanceKm !== void 0) {
            if (nearestBranch.distanceKm < 5) {
              decision = "WALK-IN";
              travelMode = "WALK";
              estimatedMinutes = Math.max(1, Math.round(nearestBranch.distanceKm / 5 * 60));
            } else if (nearestBranch.distanceKm < 20) {
              decision = "DRIVE";
              travelMode = "DRIVE";
              estimatedMinutes = Math.max(1, Math.round(nearestBranch.distanceKm / 40 * 60));
            } else decision = "CALL";
            if (decision === "CALL") {
              travelMode = "CALL";
              estimatedMinutes = null;
            }
          }
          const person = best ? {
            id: best.rowId,
            ...best.jsonDataJsonb
          } : null;
          let suggestions = [];
          if ((!person || bestScore < 6) && !hasDigitsQuery) {
            const fuzzyResults = await storage.aiFuzzySearch({ query, limit: 5 });
            const tokens = tokenizeQuery(query);
            const maxScore = Math.max(1, tokens.length);
            suggestions = fuzzyResults.map((row) => {
              let data = row.jsonDataJsonb;
              if (typeof data === "string") {
                try {
                  data = JSON.parse(data);
                } catch {
                  data = {};
                }
              }
              if (!data || typeof data !== "object") data = {};
              const name = data["Nama"] || data["Customer Name"] || data["name"] || "-";
              const ic = data["No. MyKad"] || data["ID No"] || data["No Pengenalan"] || data["IC"] || "-";
              const addr = data["Alamat Surat Menyurat"] || data["HomeAddress1"] || data["Address"] || data["Alamat"] || "-";
              const confidence = Math.min(100, Math.round(Number(row.score || 0) / maxScore * 100));
              const hasAny = [name, ic, addr].some((v) => v && v !== "-" && String(v).trim() !== "");
              return hasAny ? `\u2022 ${name} | IC: ${ic} | Alamat: ${addr} | Keyakinan: ${confidence}%` : "";
            }).filter(Boolean);
          }
          const personSummary = [];
          if (person && typeof person === "object") {
            const pushIf = (label, key) => {
              const val = person[key];
              if (val !== void 0 && val !== null && String(val).trim() !== "") {
                personSummary.push({ label, value: String(val) });
              }
            };
            pushIf("Nama", "Nama");
            pushIf("Nama", "Customer Name");
            pushIf("Nama", "name");
            pushIf("No. MyKad", "No. MyKad");
            pushIf("ID No", "ID No");
            pushIf("No Pengenalan", "No Pengenalan");
            pushIf("IC", "ic");
            pushIf("Account No", "Account No");
            pushIf("Card No", "Card No");
            pushIf("No. Telefon Rumah", "No. Telefon Rumah");
            pushIf("No. Telefon Bimbit", "No. Telefon Bimbit");
            pushIf("Handphone", "Handphone");
            pushIf("OfficePhone", "OfficePhone");
            pushIf("Alamat Surat Menyurat", "Alamat Surat Menyurat");
            pushIf("HomeAddress1", "HomeAddress1");
            pushIf("HomeAddress2", "HomeAddress2");
            pushIf("HomeAddress3", "HomeAddress3");
            pushIf("HomePostcode", "HomePostcode");
            pushIf("Home Post Code", "Home Post Code");
            pushIf("Home Postal Code", "Home Postal Code");
            pushIf("Bandar", "Bandar");
            pushIf("Negeri", "Negeri");
            pushIf("Poskod", "Poskod");
          }
          if (personSummary.length === 0 && person && typeof person === "object") {
            const entries = Object.entries(person).filter(([k]) => k !== "id").slice(0, 8);
            for (const [k, v] of entries) {
              if (v !== void 0 && v !== null && String(v).trim() !== "") {
                personSummary.push({ label: k, value: String(v) });
              }
            }
          }
          const branchSummary = [];
          if (nearestBranch) {
            const push = (label, value) => {
              if (value !== void 0 && value !== null && String(value).trim() !== "") {
                branchSummary.push({ label, value: String(value) });
              }
            };
            push("Nama Cawangan", nearestBranch.name);
            push("Alamat", nearestBranch.address);
            push("Telefon", nearestBranch.phone);
            push("Fax", nearestBranch.fax);
            push("Business Hour", nearestBranch.businessHour);
            push("Day Open", nearestBranch.dayOpen);
            push("ATM & CDM", nearestBranch.atmCdm);
            push("Inquiry Availability", nearestBranch.inquiryAvailability);
            push("Application Availability", nearestBranch.applicationAvailability);
            push("AEON Lounge", nearestBranch.aeonLounge);
            push("Jarak (KM)", nearestBranch.distanceKm);
          }
          const explanation = await buildExplanation({
            decision,
            distanceKm: nearestBranch?.distanceKm ?? null,
            branch: nearestBranch?.name ?? null,
            personName: person?.Nama || person?.name || null,
            personSummary,
            branchSummary,
            estimatedMinutes,
            travelMode,
            missingCoords,
            suggestions,
            countSummary: null,
            matchFields: !hasDigitsQuery && person && typeof person === "object" ? buildFieldMatchSummary(person, query) : [],
            branchTextSearch
          });
          const responsePayload = {
            person,
            nearest_branch: nearestBranch ? {
              name: nearestBranch.name,
              address: nearestBranch.address,
              phone: nearestBranch.phone,
              fax: nearestBranch.fax,
              business_hour: nearestBranch.businessHour,
              day_open: nearestBranch.dayOpen,
              atm_cdm: nearestBranch.atmCdm,
              inquiry_availability: nearestBranch.inquiryAvailability,
              application_availability: nearestBranch.applicationAvailability,
              aeon_lounge: nearestBranch.aeonLounge,
              distance_km: nearestBranch.distanceKm,
              travel_mode: travelMode,
              estimated_minutes: estimatedMinutes
            } : null,
            decision,
            ai_explanation: explanation
          };
          setTimeout(() => {
            storage.createAuditLog({
              action: "AI_SEARCH",
              performedBy: req.user.username,
              targetResource: "ai_search",
              details: JSON.stringify({
                query,
                intent,
                matched_profile_id: person?.id || null,
                branch: nearestBranch?.name || null,
                distance_km: nearestBranch?.distanceKm || null,
                decision,
                travel_mode: travelMode,
                estimated_minutes: estimatedMinutes,
                used_last_person: !best && !!fallbackPerson
              })
            }).catch((err) => {
              console.error("Audit log failed:", err?.message || err);
            });
          }, 0);
          return res.json(responsePayload);
        } catch (error) {
          console.error("AI search error:", error);
          return res.status(500).json({ message: error.message });
        }
      })
    );
    app.post(
      "/api/ai/index/import/:id",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      async (req, res) => {
        try {
          const runtimeSettings = await getRuntimeSettingsCached();
          if (!runtimeSettings.aiEnabled) {
            return res.status(503).json({ message: "AI assistant is disabled by system settings." });
          }
          const importId = req.params.id;
          const importRecord = await storage.getImportById(importId);
          if (!importRecord) {
            return res.status(404).json({ message: "Import not found" });
          }
          const batchSize = Math.max(1, Math.min(20, Number(req.body?.batchSize ?? 5)));
          const maxRows = req.body?.maxRows ? Math.max(1, Number(req.body.maxRows)) : null;
          const totalRows = await storage.getDataRowCountByImport(importId);
          const targetTotal = maxRows ? Math.min(maxRows, totalRows) : totalRows;
          let processed = 0;
          let offset = 0;
          while (processed < targetTotal) {
            const rows = await storage.getDataRowsForEmbedding(importId, batchSize, offset);
            if (!rows.length) break;
            for (const row of rows) {
              if (processed >= targetTotal) break;
              const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
              const content = buildEmbeddingText(data);
              if (!content) {
                processed += 1;
                continue;
              }
              const embedding = await ollamaEmbed(content);
              if (!embedding.length) {
                processed += 1;
                continue;
              }
              await storage.saveEmbedding({
                importId,
                rowId: row.id,
                content,
                embedding
              });
              processed += 1;
            }
            offset += rows.length;
          }
          await storage.createAuditLog({
            action: "AI_INDEX_IMPORT",
            performedBy: req.user.username,
            targetResource: importRecord.name,
            details: `Indexed ${processed}/${targetTotal} rows`
          });
          return res.json({ success: true, processed, total: targetTotal });
        } catch (error) {
          console.error("AI index error:", error);
          return res.status(500).json({ message: error.message });
        }
      }
    );
    app.post(
      "/api/ai/branches/import/:id",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      async (req, res) => {
        try {
          const importId = req.params.id;
          const importRecord = await storage.getImportById(importId);
          if (!importRecord) {
            return res.status(404).json({ message: "Import not found" });
          }
          const result = await storage.importBranchesFromRows({
            importId,
            nameKey: req.body?.nameKey || null,
            latKey: req.body?.latKey || null,
            lngKey: req.body?.lngKey || null
          });
          await storage.createAuditLog({
            action: "IMPORT_BRANCHES",
            performedBy: req.user.username,
            targetResource: importRecord.name,
            details: JSON.stringify({ inserted: result.inserted, skipped: result.skipped, usedKeys: result.usedKeys })
          });
          return res.json({ success: true, ...result });
        } catch (error) {
          console.error("Branch import error:", error);
          return res.status(500).json({ message: error.message });
        }
      }
    );
    app.post(
      "/api/ai/chat",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      withAiConcurrencyGate("chat", async (req, res) => {
        try {
          const message = String(req.body?.message || "").trim();
          if (!message) {
            return res.status(400).json({ message: "Message required" });
          }
          const runtimeSettings = await getRuntimeSettingsCached();
          if (!runtimeSettings.aiEnabled) {
            return res.status(503).json({ message: "AI assistant is disabled by system settings." });
          }
          const extractKeywords = (text2) => {
            const raw = text2.toLowerCase();
            const digitMatches = raw.match(/\d{4,}/g) || [];
            const wordMatches = raw.match(/\b[a-z0-9]{4,}\b/gi) || [];
            const combined = [...digitMatches, ...wordMatches].map((t) => t.replace(/[^a-z0-9]/gi, "")).filter((t) => t.length >= 4);
            const unique = Array.from(new Set(combined));
            unique.sort((a, b) => b.length - a.length);
            return unique.slice(0, 4);
          };
          const valueMatchesTerm = (value, term) => {
            if (value === null || value === void 0) return false;
            const termLower = term.toLowerCase();
            const termDigits = term.replace(/\D/g, "");
            const asString = String(value);
            if (termDigits.length >= 6) {
              const valueDigits = asString.replace(/\D/g, "");
              if (valueDigits.includes(termDigits)) return true;
            }
            return asString.toLowerCase().includes(termLower);
          };
          const rowMatchesTerm = (row, term) => {
            const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
            for (const val of Object.values(data)) {
              if (valueMatchesTerm(val, term)) return true;
            }
            return false;
          };
          const scoreRowForTerm = (row, term) => {
            const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
            const termDigits = term.replace(/\D/g, "");
            let score = 0;
            for (const [key, val] of Object.entries(data)) {
              const keyLower = key.toLowerCase();
              const valueStr = String(val ?? "");
              const valueDigits = valueStr.replace(/\D/g, "");
              if (!termDigits) {
                if (valueStr.toLowerCase().includes(term.toLowerCase())) {
                  score += 2;
                }
                continue;
              }
              if (valueDigits === termDigits) {
                if (keyLower.includes("ic") || keyLower.includes("mykad") || keyLower.includes("nric") || keyLower.includes("kp")) {
                  score += 10;
                } else {
                  score += 6;
                }
              } else if (valueDigits.includes(termDigits)) {
                score += 3;
              }
            }
            return score;
          };
          const existingConversationId = req.body?.conversationId ? String(req.body.conversationId) : null;
          const conversationId = existingConversationId || await storage.createConversation(req.user.username);
          const history = await storage.getConversationMessages(conversationId, 3);
          const countRules = await loadCategoryRules();
          const countGroups = detectCountRequest(message, countRules);
          if (countGroups) {
            const keys = [...countGroups.map((g) => g.key), "__all__"];
            const rulesUpdatedAt = await storage.getCategoryRulesMaxUpdatedAt();
            let statsRows = await storage.getCategoryStats(keys);
            let statsMap = new Map(statsRows.map((row) => [row.key, row]));
            let totalRow = statsMap.get("__all__");
            const statsUpdatedAt = totalRow?.updatedAt ?? null;
            const missingKeys = keys.filter((k) => !statsMap.get(k));
            const staleStats = Boolean(rulesUpdatedAt && statsUpdatedAt && rulesUpdatedAt > statsUpdatedAt);
            if (!totalRow || missingKeys.length > 0 || staleStats) {
              const computeKeys = staleStats ? keys : Array.from(/* @__PURE__ */ new Set([...missingKeys, "__all__"]));
              let readyNow = false;
              try {
                await withTimeout(storage.computeCategoryStatsForKeys(computeKeys, countRules), 12e3);
                statsRows = await storage.getCategoryStats(keys);
                statsMap = new Map(statsRows.map((row) => [row.key, row]));
                totalRow = statsMap.get("__all__");
                readyNow = Boolean(totalRow && keys.every((k) => statsMap.has(k)));
              } catch {
                readyNow = false;
              }
              if (!readyNow) {
                enqueueCategoryStatsCompute(computeKeys, countRules);
                const pendingReply = "Statistik sedang disediakan. Sila cuba semula dalam 10-20 saat.";
                await storage.saveConversationMessage(conversationId, "user", message);
                await storage.saveConversationMessage(conversationId, "assistant", pendingReply);
                return res.json({ conversationId, reply: pendingReply, processing: true });
              }
            }
            const summaryLines = [
              "Ringkasan Statistik (berdasarkan data import):",
              `Jumlah rekod dianalisis: ${totalRow?.total ?? 0}`
            ];
            for (const group of countGroups) {
              const row = statsMap.get(group.key);
              const count2 = row?.total ?? 0;
              summaryLines.push(`- ${group.key}: ${count2}`);
              if (row?.samples?.length) {
                summaryLines.push("  Contoh rekod:");
                for (const sample of row.samples.slice(0, 10)) {
                  const source = sample.source ? ` (${sample.source})` : "";
                  summaryLines.push(`  \u2022 ${sample.name} | IC: ${sample.ic}${source}`);
                }
              }
            }
            const reply2 = summaryLines.join("\n");
            await storage.saveConversationMessage(conversationId, "user", message);
            await storage.saveConversationMessage(conversationId, "assistant", reply2);
            await storage.createAuditLog({
              action: "AI_CHAT",
              performedBy: req.user.username,
              details: `Conversation=${conversationId}`
            });
            return res.json({ conversationId, reply: reply2, stats: statsRows });
          }
          const keywords = extractKeywords(message);
          const searchTerms = keywords.length ? keywords : [message];
          const resultMap = /* @__PURE__ */ new Map();
          for (const term of searchTerms) {
            const retrieval = await storage.searchGlobalDataRows({
              search: term,
              limit: 30,
              offset: 0
            });
            for (const row of retrieval.rows || []) {
              if (!resultMap.has(row.id)) {
                resultMap.set(row.id, row);
              }
            }
            if (resultMap.size >= 60) break;
          }
          const allRows = Array.from(resultMap.values());
          const matchedRows = allRows.filter((row) => searchTerms.some((term) => rowMatchesTerm(row, term)));
          const scored = (matchedRows.length > 0 ? matchedRows : allRows).map((row) => ({
            row,
            score: Math.max(...searchTerms.map((term) => scoreRowForTerm(row, term)))
          })).sort((a, b) => b.score - a.score);
          const retrievalRows = scored.map((s) => s.row).slice(0, 5);
          const contextRows = (retrievalRows || []).map((row, idx) => {
            const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
            const entries = Object.entries(data).slice(0, 20);
            const lines = entries.map(([key, val]) => `${key}: ${String(val ?? "")}`);
            const source = row.importFilename || row.importName || "Unknown";
            return `# Rekod ${idx + 1} (Source: ${source}, RowId: ${row.id || row.rowId || "unknown"})
${lines.join("\n")}`;
          });
          const buildQuickReply = () => {
            if (retrievalRows.length === 0) {
              return "Tiada data dijumpai untuk kata kunci tersebut.";
            }
            const priorityKeys = [
              "nama",
              "name",
              "no. mykad",
              "mykad",
              "ic",
              "no. ic",
              "nric",
              "no. kp",
              "akaun",
              "account",
              "telefon",
              "phone",
              "hp",
              "alamat",
              "address",
              "umur",
              "age"
            ];
            const summaries = retrievalRows.slice(0, 3).map((row, idx) => {
              const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
              const pairs = [];
              for (const key of Object.keys(data)) {
                const lower = key.toLowerCase();
                if (priorityKeys.some((p) => lower.includes(p))) {
                  pairs.push(`${key}: ${String(data[key] ?? "")}`);
                }
                if (pairs.length >= 8) break;
              }
              if (pairs.length === 0) {
                const fallbackPairs = Object.entries(data).slice(0, 6).map(([k, v]) => `${k}: ${String(v ?? "")}`);
                pairs.push(...fallbackPairs);
              }
              const source = row.importFilename || row.importName || "Unknown";
              return `Rekod ${idx + 1} (Source: ${source})
${pairs.join("\n")}`;
            });
            return `Rekod dijumpai:
${summaries.join("\n\n")}`;
          };
          const contextBlock = contextRows.length > 0 ? `DATA SISTEM (HASIL CARIAN KATA KUNCI: ${searchTerms.join(", ")}):
${contextRows.join("\n\n")}` : "DATA SISTEM: TIADA REKOD DIJUMPAI UNTUK KATA KUNCI INI.";
          const chatMessages = [
            {
              role: "system",
              content: "Anda ialah pembantu AI offline untuk sistem SQR. Jawab dalam Bahasa Melayu. Jawapan mestilah berdasarkan DATA SISTEM di bawah. Jika tiada data yang sepadan, katakan dengan jelas bahawa tiada data dijumpai. Jangan membuat andaian atau menambah fakta yang tiada dalam data."
            },
            { role: "system", content: contextBlock },
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: message }
          ];
          let reply = "";
          try {
            reply = await withAiCircuit(() => ollamaChat(chatMessages, {
              num_predict: 96,
              temperature: 0.2,
              top_p: 0.9,
              timeoutMs: runtimeSettings.aiTimeoutMs
            }));
          } catch (err) {
            if (err instanceof CircuitOpenError) {
              return res.status(503).json({
                message: "AI circuit is OPEN. Please retry after cooldown.",
                circuit: "OPEN"
              });
            }
            if (err?.name === "AbortError") {
              reply = buildQuickReply();
            } else {
              throw err;
            }
          }
          await storage.saveConversationMessage(conversationId, "user", message);
          await storage.saveConversationMessage(conversationId, "assistant", reply);
          await storage.createAuditLog({
            action: "AI_CHAT",
            performedBy: req.user.username,
            details: `Conversation=${conversationId}`
          });
          res.json({ conversationId, reply });
        } catch (error) {
          console.error("AI chat error:", error);
          res.status(500).json({ message: error.message });
        }
      })
    );
    app.get("/api/columns", authenticateToken, async (req, res) => {
      try {
        const columns = await storage.getAllColumnNames();
        res.json(columns);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/activities", authenticateToken, requireRole("admin", "superuser"), requireTabAccess("activity"), async (req, res) => {
      try {
        const activities = await storage.getAllActivities();
        res.json(activities);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/activities/active", authenticateToken, requireRole("admin", "superuser"), requireTabAccess("activity"), async (req, res) => {
      try {
        const activities = await storage.getActiveActivities();
        res.json(activities);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.post("/api/activities/filter", authenticateToken, requireRole("admin", "superuser"), requireTabAccess("activity"), async (req, res) => {
      try {
        const filters = req.body;
        const activities = await storage.getFilteredActivities(filters);
        res.json(activities);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.post(
      "/api/admin/ban",
      authenticateToken,
      requireRole("superuser"),
      async (req, res) => {
        try {
          const { username } = req.body;
          if (!username) {
            return res.status(400).json({ message: "Username required" });
          }
          const targetUser = await storage.getUserByUsername(username);
          if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
          }
          if (targetUser.role === "superuser") {
            return res.status(403).json({ message: "Cannot ban a superuser" });
          }
          await storage.updateUserBan(username, true);
          await storage.deactivateUserActivities(username, "BANNED");
          const activities = await storage.getAllActivities();
          for (const activity of activities) {
            if (activity.username !== username) continue;
            const ws = connectedClients.get(activity.id);
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "banned",
                reason: "Your account has been banned."
              }));
              ws.close();
            }
            connectedClients.delete(activity.id);
          }
          await storage.createAuditLog({
            action: "BAN_USER",
            performedBy: req.user.username,
            targetUser: username,
            details: "Admin ban (account-level)"
          });
          res.json({ success: true });
        } catch (error) {
          console.error("Admin ban error:", error);
          res.status(500).json({ message: error.message });
        }
      }
    );
    app.post(
      "/api/admin/unban",
      authenticateToken,
      requireRole("superuser"),
      requireTabAccess("activity"),
      async (req, res) => {
        try {
          const { banId } = req.body;
          if (!banId) {
            return res.status(400).json({ message: "banId required" });
          }
          await storage.unbanVisitor(banId);
          await storage.createAuditLog({
            action: "UNBAN_USER",
            performedBy: req.user.username,
            details: `Unbanned banId=${banId}`
          });
          res.json({ success: true });
        } catch (error) {
          console.error("Admin unban error:", error);
          res.status(500).json({ message: error.message });
        }
      }
    );
    app.get("/api/accounts", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const allUsers = [];
        const usernames = ["superuser", "admin1", "user1"];
        for (const username of usernames) {
          const user = await storage.getUserByUsername(username);
          if (user) {
            allUsers.push({ id: user.id, username: user.username, role: user.role, isBanned: user.isBanned });
          }
        }
        res.json(allUsers);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.post("/api/users", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const { username, password, role } = req.body;
        const normalizedUsername = normalizeUsernameInput(username);
        const passwordRaw = String(password ?? "");
        const roleRaw = String(role ?? "user").trim().toLowerCase();
        if (!CREDENTIAL_USERNAME_REGEX.test(normalizedUsername)) {
          return res.status(400).json({ message: "Invalid username format." });
        }
        if (!isStrongPassword(passwordRaw)) {
          return res.status(400).json({ message: "Password does not meet minimum strength requirements." });
        }
        if (!["superuser", "admin", "user"].includes(roleRaw)) {
          return res.status(400).json({ message: "Invalid role." });
        }
        const existing = await storage.getUserByUsername(normalizedUsername);
        if (existing) {
          return res.status(409).json({ message: "Username already exists." });
        }
        const user = await storage.createUser({ username: normalizedUsername, password: passwordRaw, role: roleRaw });
        await storage.createAuditLog({
          action: "CREATE_USER",
          performedBy: req.user.username,
          targetUser: user.id,
          details: `Created user with role: ${user.role}`
        });
        res.json({ id: user.id, username: user.username, role: user.role, isBanned: user.isBanned });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/audit-logs", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("audit-logs"), async (req, res) => {
      try {
        const logs = await storage.getAuditLogs();
        res.json({ logs });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/audit-logs/stats", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("audit-logs"), async (req, res) => {
      try {
        const logs = await storage.getAuditLogs();
        const stats = {
          totalLogs: logs.length,
          todayLogs: logs.filter((l) => {
            const logDate = new Date(l.timestamp || l.createdAt);
            const today = /* @__PURE__ */ new Date();
            return logDate.toDateString() === today.toDateString();
          }).length,
          actionBreakdown: {}
        };
        logs.forEach((log) => {
          const action = log.action || "UNKNOWN";
          stats.actionBreakdown[action] = (stats.actionBreakdown[action] || 0) + 1;
        });
        res.json(stats);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get(
      "/api/analyze/all",
      authenticateToken,
      requireRole("user", "admin", "superuser"),
      requireTabAccess("analysis"),
      async (req, res) => {
        try {
          const imports2 = await storage.getImports();
          if (imports2.length === 0) {
            return res.json({
              totalImports: 0,
              totalRows: 0,
              imports: [],
              analysis: {
                icLelaki: { count: 0, samples: [] },
                icPerempuan: { count: 0, samples: [] },
                noPolis: { count: 0, samples: [] },
                noTentera: { count: 0, samples: [] },
                passportMY: { count: 0, samples: [] },
                passportLuarNegara: { count: 0, samples: [] },
                duplicates: { count: 0, items: [] }
              }
            });
          }
          let allRows = [];
          const importsWithCounts = await Promise.all(
            imports2.map(async (imp) => {
              const rows = await storage.getDataRowsByImport(imp.id);
              allRows = allRows.concat(rows);
              return { id: imp.id, name: imp.name, filename: imp.filename, rowCount: rows.length };
            })
          );
          const analysis = analyzeDataRows(allRows);
          return res.json({
            totalImports: imports2.length,
            totalRows: allRows.length,
            imports: importsWithCounts,
            analysis
          });
        } catch (error) {
          return res.status(500).json({ message: error.message });
        }
      }
    );
    app.get("/api/debug/websocket-clients", authenticateToken, requireRole("superuser"), async (req, res) => {
      try {
        const clients = Array.from(connectedClients.keys());
        res.json({ count: clients.length, clients });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.delete("/api/audit-logs/cleanup", authenticateToken, requireRole("superuser"), requireTabAccess("audit-logs"), async (req, res) => {
      try {
        const { olderThanDays } = req.body;
        const cutoffDate = /* @__PURE__ */ new Date();
        cutoffDate.setDate(cutoffDate.getDate() - (olderThanDays || 30));
        const logs = await storage.getAuditLogs();
        let deletedCount = 0;
        for (const log of logs) {
          if (log.timestamp) {
            const logDate = new Date(log.timestamp);
            if (logDate < cutoffDate) {
              deletedCount++;
            }
          }
        }
        await storage.createAuditLog({
          action: "CLEANUP_AUDIT_LOGS",
          performedBy: req.user.username,
          details: `Cleanup requested for logs older than ${olderThanDays} days`
        });
        res.json({ success: true, deletedCount, message: `Cleanup completed` });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/analytics/summary", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("dashboard"), async (req, res) => {
      try {
        const summary = await storage.getDashboardSummary();
        res.json(summary);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/analytics/login-trends", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("dashboard"), async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const trends = await storage.getLoginTrends(days);
        res.json(trends);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/analytics/top-users", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("dashboard"), async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const topUsers = await storage.getTopActiveUsers(limit);
        res.json(topUsers);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/analytics/peak-hours", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("dashboard"), async (req, res) => {
      try {
        const peakHours = await storage.getPeakHours();
        res.json(peakHours);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/analytics/role-distribution", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("dashboard"), async (req, res) => {
      try {
        const distribution = await storage.getRoleDistribution();
        res.json(distribution);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/backups", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("backup"), async (req, res) => {
      try {
        const backups3 = await storage.getBackups();
        res.json({ backups: backups3 });
      } catch (error) {
        console.error("Get backups error:", error);
        res.status(500).json({ message: error.message });
      }
    });
    app.post("/api/backups", authenticateToken, requireRole("admin", "superuser"), requireTabAccess("backup"), async (req, res) => {
      try {
        const { name } = req.body;
        const backup = await withExportCircuit(async () => {
          const startTime = Date.now();
          const backupData = await storage.getBackupDataForExport();
          const metadata = {
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            importsCount: backupData.imports.length,
            dataRowsCount: backupData.dataRows.length,
            usersCount: backupData.users.length,
            auditLogsCount: backupData.auditLogs.length
          };
          const created = await storage.createBackup({
            name,
            createdBy: req.user.username,
            backupData: JSON.stringify(backupData),
            metadata: JSON.stringify(metadata)
          });
          await storage.createAuditLog({
            action: "CREATE_BACKUP",
            performedBy: req.user.username,
            targetResource: name,
            details: JSON.stringify({
              ...metadata,
              durationMs: Date.now() - startTime
            })
          });
          return created;
        });
        res.json(backup);
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        res.status(500).json({ message: error.message });
      }
    });
    app.get("/api/backups/:id", authenticateToken, requireRole("user", "admin", "superuser"), requireTabAccess("backup"), async (req, res) => {
      try {
        const backup = await storage.getBackupById(req.params.id);
        if (!backup) {
          return res.status(404).json({ message: "Backup not found" });
        }
        res.json(backup);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    app.post("/api/backups/:id/restore", authenticateToken, requireRole("admin", "superuser"), requireTabAccess("backup"), async (req, res) => {
      try {
        const backup = await withExportCircuit(() => storage.getBackupById(req.params.id));
        if (!backup) {
          return res.status(404).json({ message: "Backup not found" });
        }
        const result = await withExportCircuit(async () => {
          const startTime = Date.now();
          const backupData = JSON.parse(backup.backupData);
          const restored = await storage.restoreFromBackup(backupData);
          await storage.createAuditLog({
            action: "RESTORE_BACKUP",
            performedBy: req.user.username,
            targetResource: backup.name,
            details: JSON.stringify({
              ...restored.stats,
              durationMs: Date.now() - startTime
            })
          });
          return { restored, startTime };
        });
        res.json({
          ...result.restored,
          message: `Restore completed in ${Math.round((Date.now() - result.startTime) / 1e3)}s`
        });
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        res.status(500).json({ message: error.message });
      }
    });
    app.delete("/api/backups/:id", authenticateToken, requireRole("admin", "superuser"), requireTabAccess("backup"), async (req, res) => {
      try {
        const backup = await withExportCircuit(() => storage.getBackupById(req.params.id));
        const deleted = await withExportCircuit(() => storage.deleteBackup(req.params.id));
        if (!deleted) {
          return res.status(404).json({ message: "Backup not found" });
        }
        await storage.createAuditLog({
          action: "DELETE_BACKUP",
          performedBy: req.user.username,
          targetResource: backup?.name || req.params.id
        });
        res.json({ success: true });
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        res.status(500).json({ message: error.message });
      }
    });
    wss.on("connection", async (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get("token");
      if (!token) {
        ws.close();
        return;
      }
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const activityId = decoded.activityId;
        const activity = await storage.getActivityById(activityId);
        if (!activity || activity.isActive === false || activity.logoutTime !== null) {
          console.log("\u274C WS rejected: invalid / expired session");
          ws.close();
          return;
        }
        const existingWs = connectedClients.get(activityId);
        if (existingWs && existingWs.readyState === WebSocket.OPEN) {
          existingWs.close();
        }
        connectedClients.set(activityId, ws);
        console.log(`\u2705 WebSocket connected for activityId=${activityId}`);
        const cleanupSocket = () => {
          if (connectedClients.get(activityId) === ws) {
            connectedClients.delete(activityId);
          }
        };
        ws.on("close", () => {
          cleanupSocket();
          console.log(`WebSocket closed for activityId=${activityId}`);
        });
        ws.on("error", cleanupSocket);
      } catch (err) {
        console.log("\u274C WS handshake failed");
        ws.close();
      }
    });
    setInterval(async () => {
      if (idleSweepRunning) return;
      idleSweepRunning = true;
      try {
        const now = Date.now();
        const activities = await storage.getActiveActivities();
        const runtimeSettings = await getRuntimeSettingsCached();
        const idleMinutes = Math.max(
          1,
          runtimeSettings.sessionTimeoutMinutes || runtimeSettings.wsIdleMinutes || DEFAULT_SESSION_TIMEOUT_MINUTES
        );
        const idleMs = idleMinutes * 60 * 1e3;
        for (const activity of activities) {
          if (!activity.lastActivityTime) continue;
          const last = new Date(activity.lastActivityTime).getTime();
          const diff = now - last;
          if (diff > idleMs) {
            const freshActivity = await storage.getActivityById(activity.id);
            if (!freshActivity || freshActivity.isActive === false) {
              continue;
            }
            const freshLast = freshActivity.lastActivityTime ? new Date(freshActivity.lastActivityTime).getTime() : 0;
            const freshDiff = now - freshLast;
            if (!freshLast || freshDiff <= idleMs) {
              continue;
            }
            console.log(
              `\u23F1\uFE0F IDLE TIMEOUT: ${activity.username} (${activity.id})`
            );
            await storage.updateActivity(activity.id, {
              isActive: false,
              logoutTime: /* @__PURE__ */ new Date(),
              logoutReason: "IDLE_TIMEOUT"
            });
            const ws = connectedClients.get(activity.id);
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "idle_timeout",
                reason: "Session expired due to inactivity"
              }));
              ws.close();
            }
            connectedClients.delete(activity.id);
            await storage.createAuditLog({
              action: "SESSION_IDLE_TIMEOUT",
              performedBy: activity.username,
              details: `Auto logout after ${idleMinutes} minutes idle`
            });
          }
        }
      } catch (err) {
        console.error("Idle session checker error:", err);
      } finally {
        idleSweepRunning = false;
      }
    }, 60 * 1e3);
    startServer();
  }
});

// server/cluster-local.ts
import cluster from "node:cluster";
import os2 from "node:os";
import path2 from "node:path";
import { fileURLToPath } from "node:url";

// server/internal/loadPredictor.ts
var LoadPredictor = class {
  constructor(options) {
    this.samples = [];
    this.sustainedSince = null;
    this.maxSamples = Math.max(30, options?.maxSamples ?? 720);
    this.shortWindowSec = Math.max(10, options?.shortWindowSec ?? 30);
    this.longWindowSec = Math.max(this.shortWindowSec + 10, options?.longWindowSec ?? 90);
    this.trendThreshold = Math.max(0.05, options?.trendThreshold ?? 0.2);
    this.sustainedMs = Math.max(5e3, options?.sustainedMs ?? 3e4);
  }
  update(sample) {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples = this.samples.slice(this.samples.length - this.maxSamples);
    }
    const snapshot = this.getSnapshot();
    const isUpward = snapshot.requestRateTrend >= this.trendThreshold && snapshot.latencyTrend >= this.trendThreshold && snapshot.cpuTrend >= this.trendThreshold;
    if (isUpward) {
      if (this.sustainedSince === null) this.sustainedSince = sample.ts;
    } else {
      this.sustainedSince = null;
    }
    const sustainedUpward = this.sustainedSince !== null && sample.ts - this.sustainedSince >= this.sustainedMs;
    return {
      ...snapshot,
      sustainedUpward,
      lastUpdatedAt: sample.ts
    };
  }
  getSnapshot() {
    const now = Date.now();
    const shortWindowStart = now - this.shortWindowSec * 1e3;
    const longWindowStart = now - this.longWindowSec * 1e3;
    const shortSamples = this.samples.filter((s) => s.ts >= shortWindowStart);
    const longSamples = this.samples.filter((s) => s.ts >= longWindowStart);
    const requestRateMA = average(shortSamples.map((s) => s.requestRate));
    const latencyMA = average(shortSamples.map((s) => s.latencyP95Ms));
    const cpuMA = average(shortSamples.map((s) => s.cpuPercent));
    const requestRateLong = average(longSamples.map((s) => s.requestRate));
    const latencyLong = average(longSamples.map((s) => s.latencyP95Ms));
    const cpuLong = average(longSamples.map((s) => s.cpuPercent));
    const requestRateTrend = relativeGrowth(requestRateLong, requestRateMA);
    const latencyTrend = relativeGrowth(latencyLong, latencyMA);
    const cpuTrend = relativeGrowth(cpuLong, cpuMA);
    const sustainedUpward = this.sustainedSince !== null && now - this.sustainedSince >= this.sustainedMs;
    return {
      requestRateMA,
      latencyMA,
      cpuMA,
      requestRateTrend,
      latencyTrend,
      cpuTrend,
      sustainedUpward,
      lastUpdatedAt: this.samples.length > 0 ? this.samples[this.samples.length - 1].ts : null
    };
  }
};
function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
function relativeGrowth(base, current) {
  if (base <= 0 && current <= 0) return 0;
  if (base <= 0) return 1;
  return (current - base) / base;
}

// server/cluster-local.ts
var SCALE_INTERVAL_MS = 5e3;
var LOW_LOAD_HOLD_MS = 6e4;
var ACTIVE_REQUESTS_THRESHOLD = 80;
var LOW_REQ_RATE_THRESHOLD = 8;
var LOW_MEMORY_MODE2 = String(process.env.SQR_LOW_MEMORY_MODE ?? "1") === "1";
var PREALLOCATE_MB = Number(process.env.SQR_PREALLOCATE_MB ?? (LOW_MEMORY_MODE2 ? "0" : "32"));
var MAX_SPAWN_PER_CYCLE = 1;
var MAX_WORKERS = Math.min(4, os2.cpus().length);
var requestedMaxWorkers = Number(process.env.SQR_MAX_WORKERS ?? (LOW_MEMORY_MODE2 ? "1" : String(MAX_WORKERS)));
var normalizedMaxWorkers = Number.isFinite(requestedMaxWorkers) ? Math.floor(requestedMaxWorkers) : 1;
var MAX_WORKERS_HARD_CAP = Math.max(1, Math.min(MAX_WORKERS, normalizedMaxWorkers));
var MIN_WORKERS = 1;
var SCALE_COOLDOWN_MS = LOW_MEMORY_MODE2 ? 3e4 : 15e3;
var RESTART_THROTTLE_MS = 2e3;
var MAX_RESTART_ATTEMPTS = 5;
var predictor = new LoadPredictor({
  shortWindowSec: 30,
  longWindowSec: 90,
  trendThreshold: 0.2,
  sustainedMs: 3e4
});
var workerMetrics = /* @__PURE__ */ new Map();
var intentionalExits = /* @__PURE__ */ new Set();
var drainingWorkers = /* @__PURE__ */ new Set();
var restartAttempts = /* @__PURE__ */ new Map();
var lastSpawnAttemptTime = -Infinity;
var consecutiveRestarts = 0;
var lastBroadcast = null;
var lowLoadSince = null;
var mode = "NORMAL";
var preAllocBuffer = null;
var rollingRestartInProgress = false;
var lastScaleTime = 0;
function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}
function getMaxWorkers() {
  return MAX_WORKERS_HARD_CAP;
}
function getMinWorkers() {
  return MIN_WORKERS;
}
function getWorkers() {
  return Object.values(cluster.workers ?? {}).filter((w) => Boolean(w));
}
function aggregateMetrics() {
  const samples = Array.from(workerMetrics.values());
  if (samples.length === 0) {
    return {
      cpuPercent: 0,
      reqRate: 0,
      p95: 0,
      eventLoopLagMs: 0,
      activeRequests: 0,
      queueLength: 0,
      dbLatencyMs: 0,
      aiLatencyMs: 0,
      heapUsedMB: 0,
      oldSpaceMB: 0
    };
  }
  const cpuPercent2 = samples.reduce((s, x) => s + x.cpuPercent, 0) / samples.length;
  const reqRate = samples.reduce((s, x) => s + x.reqRate, 0);
  const p95 = samples.reduce((m, x) => Math.max(m, x.latencyP95Ms), 0);
  const eventLoopLagMs = samples.reduce((m, x) => Math.max(m, x.eventLoopLagMs), 0);
  const activeRequests2 = samples.reduce((s, x) => s + x.activeRequests, 0);
  const queueLength = samples.reduce((s, x) => s + x.queueLength, 0);
  const dbLatencyMs = samples.reduce((m, x) => Math.max(m, x.dbLatencyMs), 0);
  const aiLatencyMs = samples.reduce((m, x) => Math.max(m, x.aiLatencyMs), 0);
  const heapUsedMB = samples.reduce((s, x) => s + x.heapUsedMB, 0);
  const oldSpaceMB = samples.reduce((s, x) => s + x.oldSpaceMB, 0);
  return {
    cpuPercent: round(cpuPercent2),
    reqRate: round(reqRate),
    p95: round(p95),
    eventLoopLagMs: round(eventLoopLagMs),
    activeRequests: activeRequests2,
    queueLength,
    dbLatencyMs: round(dbLatencyMs),
    aiLatencyMs: round(aiLatencyMs),
    heapUsedMB: round(heapUsedMB),
    oldSpaceMB: round(oldSpaceMB)
  };
}
function computeHealthScore(agg, workers, maxWorkers) {
  const cpuPenalty = Math.min(30, agg.cpuPercent / 100 * 30);
  const dbPenalty = agg.dbLatencyMs > 0 ? Math.min(20, agg.dbLatencyMs / 1e3 * 20) : 0;
  const aiPenalty = agg.aiLatencyMs > 0 ? Math.min(10, agg.aiLatencyMs / 1500 * 10) : 0;
  const lagPenalty = Math.min(10, agg.eventLoopLagMs / 200 * 10);
  const queuePenalty = Math.min(10, agg.queueLength / 10);
  const workerPressure = maxWorkers > 0 ? workers / maxWorkers : 0;
  const workerPenalty = workerPressure > 0.85 ? (workerPressure - 0.85) * 40 : 0;
  const raw = 100 - cpuPenalty - dbPenalty - aiPenalty - lagPenalty - queuePenalty - workerPenalty;
  return Math.max(0, Math.min(100, round(raw)));
}
function buildControlState(agg, trend) {
  const workers = getWorkers();
  const maxWorkers = getMaxWorkers();
  const healthScore = computeHealthScore(agg, workers.length, maxWorkers);
  let nextMode = "NORMAL";
  if (healthScore < 50 || agg.dbLatencyMs > 1e3) {
    nextMode = "PROTECTION";
  } else if (agg.cpuPercent > 70 || agg.p95 > 600 || agg.eventLoopLagMs > 120 || trend.sustainedUpward) {
    nextMode = "DEGRADED";
  }
  mode = nextMode;
  const rejectHeavyRoutes = nextMode === "PROTECTION" || workers.length >= maxWorkers && agg.cpuPercent > 85;
  let throttleFactor = 1;
  if (nextMode === "PROTECTION") throttleFactor = 0.4;
  else if (workers.length >= maxWorkers && agg.cpuPercent > 85) throttleFactor = 0.5;
  else if (nextMode === "DEGRADED") throttleFactor = 0.75;
  const sampleList = Array.from(workerMetrics.values()).map((m) => ({
    workerId: m.workerId,
    pid: m.pid,
    cpuPercent: round(m.cpuPercent),
    reqRate: round(m.reqRate),
    latencyP95Ms: round(m.latencyP95Ms),
    eventLoopLagMs: round(m.eventLoopLagMs),
    activeRequests: m.activeRequests,
    heapUsedMB: round(m.heapUsedMB),
    oldSpaceMB: round(m.oldSpaceMB),
    dbLatencyMs: round(m.dbLatencyMs),
    aiLatencyMs: round(m.aiLatencyMs),
    ts: m.ts
  }));
  const circuits = {
    aiOpenWorkers: Array.from(workerMetrics.values()).filter((m) => m.circuit.ai.state === "OPEN").length,
    dbOpenWorkers: Array.from(workerMetrics.values()).filter((m) => m.circuit.db.state === "OPEN").length,
    exportOpenWorkers: Array.from(workerMetrics.values()).filter((m) => m.circuit.export.state === "OPEN").length
  };
  return {
    mode: nextMode,
    healthScore,
    dbProtection: agg.dbLatencyMs > 1e3 || nextMode === "PROTECTION",
    rejectHeavyRoutes,
    throttleFactor,
    predictor: trend,
    workerCount: workers.length,
    maxWorkers,
    queueLength: agg.queueLength,
    preAllocateMB: PREALLOCATE_MB > 0 && trend.sustainedUpward ? PREALLOCATE_MB : 0,
    updatedAt: Date.now(),
    workers: sampleList,
    circuits
  };
}
function broadcastControl(control) {
  lastBroadcast = control;
  const workers = getWorkers();
  for (const worker of workers) {
    if (!worker || !worker.isConnected() || worker.isDead()) {
      continue;
    }
    try {
      worker.send({ type: "control-state", payload: control });
    } catch (err) {
      console.warn(`\u26A0 Failed to send control-state to worker#${worker.id}`);
    }
  }
}
function safeFork(reason) {
  const aliveWorkers = getWorkers().filter((w) => !w.isDead() && w.isConnected());
  const maxWorkers = getMaxWorkers();
  if (aliveWorkers.length >= maxWorkers) {
    console.log(`\u26A0 Max workers (${maxWorkers}) reached. Skipping spawn for: ${reason}`);
    return null;
  }
  try {
    const worker = cluster.fork({ ...process.env, SQR_CLUSTER_WORKER: "1" });
    console.log(`\u{1F9E9} Spawn worker#${worker.id} (${reason})`);
    worker.on("error", (err) => {
      console.error(`Worker#${worker.id} error:`, err);
    });
    worker.on("disconnect", () => {
      console.warn(`Worker#${worker.id} disconnected`);
    });
    return worker;
  } catch (err) {
    console.error(`Failed to fork worker for ${reason}:`, err);
    return null;
  }
}
function spawnWorker(reason) {
  return safeFork(reason) !== null;
}
async function drainAndRestartWorker(worker, reason) {
  if (drainingWorkers.has(worker.id)) return;
  drainingWorkers.add(worker.id);
  intentionalExits.add(worker.id);
  if (worker.isConnected() && !worker.isDead()) {
    try {
      worker.send({ type: "graceful-shutdown", reason });
    } catch {
    }
  }
  const timeout = setTimeout(() => {
    try {
      worker.kill();
    } catch {
    }
  }, 3e4);
  worker.once("exit", () => {
    clearTimeout(timeout);
    drainingWorkers.delete(worker.id);
  });
}
async function rollingRestartOne(reason) {
  if (rollingRestartInProgress) return;
  const workers = getWorkers().filter((w) => !drainingWorkers.has(w.id));
  if (workers.length <= getMinWorkers()) return;
  rollingRestartInProgress = true;
  try {
    let candidate = workers[0];
    let minActive = Number.MAX_SAFE_INTEGER;
    for (const w of workers) {
      const active = workerMetrics.get(w.id)?.activeRequests ?? 0;
      if (active < minActive) {
        minActive = active;
        candidate = w;
      }
    }
    await drainAndRestartWorker(candidate, reason);
  } finally {
    setTimeout(() => {
      rollingRestartInProgress = false;
    }, 1e4);
  }
}
function evaluateScale() {
  const workers = getWorkers();
  const maxWorkers = getMaxWorkers();
  const agg = aggregateMetrics();
  const trend = predictor.update({
    ts: Date.now(),
    requestRate: agg.reqRate,
    latencyP95Ms: agg.p95,
    cpuPercent: agg.cpuPercent
  });
  const now = Date.now();
  const timeSinceLastScale = now - lastScaleTime;
  const canScale = timeSinceLastScale >= SCALE_COOLDOWN_MS;
  const memUsageMB = process.memoryUsage().rss / 1024 / 1024;
  const memoryScaleUpBlockMB = LOW_MEMORY_MODE2 ? 220 : 1200;
  const memoryPressureHigh = memUsageMB > memoryScaleUpBlockMB;
  if (memoryPressureHigh) {
    console.log(`\u26A0 High memory (${Math.round(memUsageMB)}MB). Skipping scale up.`);
  }
  if (trend.sustainedUpward && canScale && !memoryPressureHigh) {
    let spawned = 0;
    while (spawned < MAX_SPAWN_PER_CYCLE && workers.length + spawned < maxWorkers) {
      if (!spawnWorker("predictive-uptrend")) break;
      spawned += 1;
      lastScaleTime = now;
    }
    if (PREALLOCATE_MB > 0 && !preAllocBuffer) {
      preAllocBuffer = Buffer.alloc(PREALLOCATE_MB * 1024 * 1024);
    }
  } else if (preAllocBuffer && agg.cpuPercent < 55 && agg.reqRate < LOW_REQ_RATE_THRESHOLD) {
    preAllocBuffer = null;
  }
  const latencyPressure = agg.p95 > 900 && agg.reqRate > LOW_REQ_RATE_THRESHOLD;
  const highLoad = agg.cpuPercent > 70 || latencyPressure || agg.activeRequests > ACTIVE_REQUESTS_THRESHOLD * Math.max(1, workers.length);
  if (highLoad && canScale && !memoryPressureHigh) {
    if (spawnWorker("reactive-high-load")) {
      lastScaleTime = now;
    }
  }
  const lowLoad = agg.cpuPercent < 40 && agg.reqRate < LOW_REQ_RATE_THRESHOLD;
  if (lowLoad) {
    if (lowLoadSince === null) lowLoadSince = Date.now();
    const longEnough = Date.now() - lowLoadSince >= LOW_LOAD_HOLD_MS;
    if (longEnough && workers.length > getMinWorkers()) {
      rollingRestartOne("scale-down-low-load").catch(() => void 0);
      lowLoadSince = Date.now();
    }
  } else {
    lowLoadSince = null;
  }
  const memoryPressure = agg.heapUsedMB > 0 && agg.oldSpaceMB / Math.max(agg.heapUsedMB, 1) > 0.75 && agg.heapUsedMB > 1024;
  if (memoryPressure) {
    rollingRestartOne("memory-pressure").catch(() => void 0);
  }
  const control = buildControlState(agg, trend);
  broadcastControl(control);
}
function wireWorker(worker) {
  worker.on("message", (msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "worker-metrics" && msg.payload) {
      const payload = msg.payload;
      workerMetrics.set(worker.id, { ...payload, workerId: worker.id, pid: worker.process.pid ?? payload.pid });
      return;
    }
    if (msg.type === "worker-event" && msg.payload?.kind === "memory-pressure") {
      rollingRestartOne("worker-memory-pressure").catch(() => void 0);
    }
  });
}
function bootCluster() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path2.dirname(__filename);
  const workerExec = path2.join(__dirname, "index-local.js");
  cluster.setupPrimary({
    exec: workerExec
  });
  const initialWorkers = 1;
  for (let i = 0; i < initialWorkers; i += 1) {
    const worker = safeFork("initial-boot");
    if (worker) {
      wireWorker(worker);
    }
  }
  cluster.on("online", (worker) => {
    wireWorker(worker);
    consecutiveRestarts = 0;
    if (lastBroadcast) {
      if (worker.isConnected() && !worker.isDead()) {
        try {
          worker.send({ type: "control-state", payload: lastBroadcast });
        } catch {
        }
      }
    }
  });
  cluster.on("exit", (worker, code, signal) => {
    workerMetrics.delete(worker.id);
    drainingWorkers.delete(worker.id);
    const intentional = intentionalExits.has(worker.id);
    if (intentional) {
      intentionalExits.delete(worker.id);
      restartAttempts.delete(worker.id);
      consecutiveRestarts = 0;
    } else {
      const now = Date.now();
      const timeSinceLastSpawn = now - lastSpawnAttemptTime;
      consecutiveRestarts++;
      if (consecutiveRestarts > MAX_RESTART_ATTEMPTS) {
        console.error(
          `\u274C CRASH LOOP DETECTED: Worker#${worker.id} failed (code=${code}). Exceeded max restart attempts (${MAX_RESTART_ATTEMPTS}). Stopping automatic restarts to prevent cascade. Check logs for root cause.`
        );
        return;
      }
      console.error(`\u274C Worker#${worker.id} exited unexpectedly (code=${code}, signal=${signal}). Restarting...`);
      if (timeSinceLastSpawn >= RESTART_THROTTLE_MS) {
        lastSpawnAttemptTime = now;
        const w = safeFork("unexpected-exit-restart");
        if (w) {
          wireWorker(w);
          console.log(`  \u2713 Spawned replacement worker in response to failure`);
        } else {
          console.log(`  \u26A0 Failed to spawn replacement (hard cap or resource limit)`);
        }
      } else {
        const remainingDelay = RESTART_THROTTLE_MS - timeSinceLastSpawn;
        console.log(`\u23F1  Throttling restart (${remainingDelay}ms) - spawn already attempted recently`);
      }
    }
    if (getWorkers().length < getMinWorkers()) {
      const now = Date.now();
      if (now - lastSpawnAttemptTime >= RESTART_THROTTLE_MS) {
        lastSpawnAttemptTime = now;
        const w = safeFork("min-capacity-restore");
        if (w) {
          wireWorker(w);
        }
      }
    }
  });
  setInterval(evaluateScale, SCALE_INTERVAL_MS);
  console.log(`\u{1F9E0} Cluster master online. workers=${initialWorkers}/${getMaxWorkers()} (min=${getMinWorkers()})`);
}
process.on("uncaughtException", (err) => {
  console.error("\u274C Uncaught Exception in master:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("\u274C Unhandled Rejection in master:", reason);
});
if (cluster.isPrimary) {
  bootCluster();
} else {
  await Promise.resolve().then(() => (init_index_local(), index_local_exports));
}
