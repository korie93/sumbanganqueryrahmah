// server/index-local.ts
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import bcrypt2 from "bcrypt";

// shared/schema-postgres.ts
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { jsonb } from "drizzle-orm/pg-core";
var users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  isBanned: boolean("is_banned").default(false)
});
var imports = pgTable("imports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  filename: text("filename").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  isDeleted: boolean("is_deleted").default(false),
  createdBy: text("created_by")
});
var dataRows = pgTable("data_rows", {
  id: text("id").primaryKey(),
  importId: text("import_id").notNull(),
  jsonDataJsonb: jsonb("json_data").notNull()
  // guna satu column sahaja
});
var userActivity = pgTable("user_activity", {
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
var auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  performedBy: text("performed_by").notNull(),
  targetUser: text("target_user"),
  targetResource: text("target_resource"),
  details: text("details"),
  timestamp: timestamp("timestamp").defaultNow()
});
var backups = pgTable("backups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by").notNull(),
  backupData: text("backup_data").notNull(),
  metadata: text("metadata")
});
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true
});
var insertImportSchema = createInsertSchema(imports).pick({
  name: true,
  filename: true
});
var insertDataRowSchema = z.object({
  importId: z.string(),
  jsonDataJsonb: z.record(z.any())
});
var insertUserActivitySchema = createInsertSchema(userActivity).pick({
  userId: true,
  username: true,
  role: true,
  pcName: true,
  browser: true,
  fingerprint: true,
  ipAddress: true
});
var insertAuditLogSchema = createInsertSchema(auditLogs).pick({
  action: true,
  performedBy: true,
  targetUser: true,
  targetResource: true,
  details: true
});
var insertBackupSchema = createInsertSchema(backups).pick({
  name: true,
  createdBy: true,
  backupData: true,
  metadata: true
});
var loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  fingerprint: z.string().optional()
});
var importRelations = relations(imports, ({ many }) => ({
  rows: many(dataRows)
}));
var dataRowRelations = relations(dataRows, ({ one }) => ({
  import: one(imports, {
    fields: [dataRows.importId],
    references: [imports.id]
  })
}));

// server/storage-postgres.ts
import bcrypt from "bcrypt";

// server/db-postgres.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
var { Pool } = pg;
var pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "Postgres@123",
  database: process.env.PG_DATABASE || "sqr_db",
  options: "-c search_path=public"
});
var db = drizzle(pool);

// server/storage-postgres.ts
import { eq, desc, and, or, gte, lte, count, sql, inArray } from "drizzle-orm";
import crypto from "crypto";
var MAX_SEARCH_LIMIT = 200;
var ANALYTICS_TZ = process.env.ANALYTICS_TZ || "Asia/Kuala_Lumpur";
var STORAGE_DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";
var ALLOWED_OPERATORS = /* @__PURE__ */ new Set([
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
var BACKUP_CHUNK_SIZE = 500;
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
var PostgresStorage = class {
  constructor() {
    this.seedDefaultUsers();
  }
  async init() {
    await this.ensureBackupsTable();
    await this.ensurePerformanceIndexes();
    await this.ensureBannedSessionsTable();
    await this.ensureAiTables();
    await this.ensureSpatialTables();
    await this.ensureCategoryRulesTable();
    await this.ensureCategoryStatsTable();
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
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await db.insert(users).values({
          id: crypto.randomUUID(),
          username: user.username,
          password: hashedPassword,
          role: user.role,
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
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }
  async createUser(user) {
    const id = crypto.randomUUID();
    const hashedPassword = await bcrypt.hash(user.password, 10);
    await db.insert(users).values({
      id,
      username: user.username,
      password: hashedPassword,
      role: user.role ?? "user",
      isBanned: false
    });
    return {
      id,
      username: user.username,
      password: hashedPassword,
      role: user.role ?? "user",
      isBanned: false
    };
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
    await db.update(users).set({ isBanned }).where(eq(users.username, username));
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
    return await db.select().from(imports).where(eq(imports.isDeleted, false)).orderBy(desc(imports.createdAt));
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
    const rows = await db.select().from(dataRows).where(eq(dataRows.importId, importId));
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
    const columnSet = /* @__PURE__ */ new Set();
    const activeImports = await this.getImports();
    const activeImportIds = new Set(activeImports.map((imp) => imp.id));
    const allRows = await db.select().from(dataRows);
    for (const row of allRows) {
      if (!activeImportIds.has(row.importId)) continue;
      const data = row.jsonDataJsonb;
      if (!data || typeof data !== "object") continue;
      for (const key of Object.keys(data)) {
        columnSet.add(key);
      }
    }
    return Array.from(columnSet).sort();
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
    return await db.select().from(userActivity).where(eq(userActivity.isActive, true)).orderBy(desc(userActivity.loginTime));
  }
  async getAllActivities() {
    const activities = await db.select().from(userActivity).orderBy(desc(userActivity.loginTime));
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
    const activities = await db.select().from(userActivity).where(whereConditions.length ? and(...whereConditions) : void 0).orderBy(desc(userActivity.loginTime));
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
      const activities = await db.select().from(userActivity).where(eq(userActivity.logoutReason, "BANNED")).orderBy(desc(userActivity.logoutTime));
      const lastBannedActivity = activities.find(
        (a) => a.username.toLowerCase() === user.username.toLowerCase()
      );
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
    const q = params.query;
    const digits = q.replace(/[^0-9]/g, "");
    const hasDigits = digits.length >= 6;
    const icKeysMatch = hasDigits ? sql`
        (
          coalesce((dr.json_data::jsonb)->>'No. MyKad','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'No Pengenalan','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'No. IC','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'IC','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'NRIC','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'MyKad','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'ID No','') = ${digits}
        )
      ` : sql`FALSE`;
    const phoneKeysMatch = hasDigits ? sql`
        (
          coalesce((dr.json_data::jsonb)->>'No. Telefon Rumah','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'No. Telefon Bimbit','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Telefon','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Phone','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'HP','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Handphone','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'OfficePhone','') = ${digits}
        )
      ` : sql`FALSE`;
    const accountKeysMatch = hasDigits ? sql`
        (
          coalesce((dr.json_data::jsonb)->>'Nombor Akaun Bank Pemohon','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Account No','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Account Number','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'No Akaun','') = ${digits} OR
          coalesce((dr.json_data::jsonb)->>'Card No','') = ${digits}
        )
      ` : sql`FALSE`;
    const isIc = digits.length === 12;
    const isPhone = digits.length >= 9 && digits.length <= 11;
    const isAccount = digits.length >= 10 && digits.length <= 16;
    const whereCondition = isIc ? sql`(${icKeysMatch})` : isPhone ? sql`(${phoneKeysMatch})` : isAccount ? sql`(${accountKeysMatch})` : sql`FALSE`;
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
        AND ${whereCondition}
      ORDER BY dr.id
      LIMIT ${params.limit}
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
    const lookup = async () => {
      const result = await db.execute(sql`
        SELECT lat, lng
        FROM public.aeon_branch_postcodes
        WHERE postcode = ${postcode}
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
        const match = address.match(/\b\d{5}\b/);
        if (!match) continue;
        const pc = match[0];
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
      let postcode = null;
      if (postcodeVal) {
        const pcDigits = String(postcodeVal).match(/\d{5}/)?.[0] || null;
        postcode = pcDigits;
      }
      if (!postcode && addressVal) {
        const addressStr = String(addressVal);
        const postcodeMatch = addressStr.match(/\b\d{5}\b/);
        postcode = postcodeMatch ? postcodeMatch[0] : null;
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
  async getAccounts() {
    return await db.select({
      username: users.username,
      role: users.role,
      isBanned: users.isBanned
    }).from(users).orderBy(users.role);
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
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp));
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
    `);
    return result.rows.map((row) => {
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
      passwordHash: u.password
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
        const userRows = backupData.users.filter((u) => u.passwordHash).map((u) => ({
          id: crypto.randomUUID(),
          username: u.username,
          password: u.passwordHash,
          role: u.role,
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

// server/middleware/rate-limit.ts
import rateLimit from "express-rate-limit";
var searchRateLimiter = rateLimit({
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

// server/ai-ollama.ts
var OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
var OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || "llama3:8b";
var OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
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
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 2e3);
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
        messages,
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

// server/index-local.ts
var storage = new PostgresStorage();
var app = express();
var server = createServer(app);
var wss = new WebSocketServer({ server, path: "/ws" });
var JWT_SECRET = process.env.SESSION_SECRET || "sqr-local-secret-key-2025";
var connectedClients = /* @__PURE__ */ new Map();
var WS_IDLE_MINUTES = 3;
var WS_IDLE_MS = WS_IDLE_MINUTES * 60 * 1e3;
var AI_PRECOMPUTE_ON_START = String(process.env.AI_PRECOMPUTE_ON_START || "0") === "1";
var API_DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";
var idleSweepRunning = false;
var buildEmbeddingText = (data) => {
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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
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
    req.user = decoded;
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
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: "postgresql" });
});
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
async function handleLogin(req, res) {
  try {
    const { username, password, fingerprint, pcName, browser } = req.body;
    const user = await storage.getUserByUsername(username);
    if (!user) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: username,
        details: "User not found"
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const isVisitorBanned = await storage.isVisitorBanned(fingerprint || null, req.ip || req.socket.remoteAddress || null);
    if (isVisitorBanned) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED_BANNED",
        performedBy: username,
        details: "Visitor is banned"
      });
      return res.status(403).json({ message: "Account is banned", banned: true });
    }
    if (user.isBanned) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED_BANNED",
        performedBy: username,
        details: "User is banned"
      });
      return res.status(403).json({ message: "Account is banned", banned: true });
    }
    const validPassword = await bcrypt2.compare(password, user.password);
    if (!validPassword) {
      await storage.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: username,
        details: "Invalid password"
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const browserName = parseBrowser(browser || req.headers["user-agent"]);
    if (user.role === "superuser") {
      await storage.deactivateUserActivities(username, "NEW_LOGIN");
    } else if (user.role === "admin" && fingerprint) {
      await storage.deactivateUserSessionsByFingerprint(
        username,
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
        username: user.username,
        role: user.role,
        activityId: activity.id
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    await storage.createAuditLog({
      action: "LOGIN_SUCCESS",
      performedBy: username,
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
app.get("/api/activity/all", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
  try {
    const activities = await storage.getAllActivities();
    res.json({ activities });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/activity/filter", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
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
app.get("/api/users/banned", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
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
    for (const row of dataRows2) {
      await storage.createDataRow({
        importId: importRecord.id,
        jsonDataJsonb: row
      });
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
      const importId = req.params.id;
      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.min(Number(req.query.limit ?? 100), 500);
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
      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = (page - 1) * limit;
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
        limit,
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
        total: result.total,
        page,
        limit
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
var excludeColumnsFromIC = [
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
var excludeColumnsFromPolice = [
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
app.get("/api/imports/:id/analyze", authenticateToken, async (req, res) => {
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
});
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
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(Number(limit), 200);
    const offset = (safePage - 1) * safeLimit;
    const rawResult = await storage.advancedSearchDataRows(filters, logic || "AND", safeLimit, offset);
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
      total: rawResult.total || 0,
      page: safePage,
      limit: safeLimit
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/ai/config", authenticateToken, requireRole("user", "admin", "superuser"), async (req, res) => {
  res.json(getOllamaConfig());
});
var extractJsonObject = (text2) => {
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
var parseIntentFallback = (query) => {
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
var DEFAULT_COUNT_GROUPS = [
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
var CATEGORY_RULES_CACHE_MS = 6e4;
var categoryRulesCache = null;
var loadCategoryRules = async () => {
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
var detectCountRequest = (query, rules) => {
  const lower = query.toLowerCase();
  const trigger = /(berapa|jumlah|bilangan|ramai|count|how many|berapa orang)/i.test(lower);
  if (!trigger) return null;
  const enabledRules = rules.filter((rule) => rule.enabled !== false);
  const matched = enabledRules.filter(
    (group) => group.terms.some((term) => lower.includes(term.toLowerCase())) || lower.includes(group.key)
  );
  return matched.length > 0 ? matched : enabledRules;
};
var categoryStatsInflight = /* @__PURE__ */ new Map();
var enqueueCategoryStatsCompute = (keys, rules) => {
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
var tokenizeQuery = (text2) => {
  return text2.toLowerCase().split(/\s+/).map((t) => t.replace(/[^a-z0-9]/gi, "")).filter((t) => t.length >= 3);
};
var buildFieldMatchSummary = (data, query) => {
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
var parseIntent = async (query) => {
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
    const raw = await ollamaChat(messages, { num_predict: 160, temperature: 0.1, top_p: 0.9 });
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
var rowScore = (row, ic, name, account, phone) => {
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
var scoreRowDigits = (row, digits) => {
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
var extractLatLng = (data) => {
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
var isLatLng = (value) => {
  if (!value || typeof value !== "object") return false;
  const v = value;
  return typeof v.lat === "number" && Number.isFinite(v.lat) && typeof v.lng === "number" && Number.isFinite(v.lng);
};
var isNonEmptyString = (value) => {
  return typeof value === "string" && value.trim().length > 0;
};
var hasPostcodeCoord = (value) => {
  return isLatLng(value);
};
var buildExplanation = async (payload) => {
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
var searchCache = /* @__PURE__ */ new Map();
var searchInflight = /* @__PURE__ */ new Map();
var SEARCH_CACHE_MS = 6e4;
var SEARCH_FAST_TIMEOUT_MS = 5500;
var withTimeout = (promise, ms) => {
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
var computeAiSearch = async (query, userKey) => {
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
      const data = personForBranch.jsonDataJsonb || {};
      const postcode = data["Poskod"] || data["Postcode"] || data["Postal Code"] || data["HomePostcode"] || data["OfficePostcode"] || null;
      if (postcode) {
        const postcodeDigits = String(postcode).match(/\d{5}/)?.[0] ?? null;
        if (isNonEmptyString(postcodeDigits)) {
          const postcodeDigitsSafe = postcodeDigits;
          const pc = await storage.getPostcodeLatLng(postcodeDigitsSafe);
          if (hasPostcodeCoord(pc)) {
            const pcSafe = pc;
            const branches = await storage.getNearestBranches({ lat: pcSafe.lat, lng: pcSafe.lng, limit: 1 });
            nearestBranch = branches[0] || null;
          } else {
            missingCoords = true;
            branchTextSearch = true;
            const branches = await storage.findBranchesByText({ query: postcodeDigitsSafe, limit: 1 });
            nearestBranch = branches[0] || null;
          }
        } else {
          missingCoords = true;
        }
      } else {
        missingCoords = true;
      }
      if (!nearestBranch && missingCoords) {
        const city = data["Bandar"] || data["City"] || data["City/Town"] || null;
        const state = data["Negeri"] || data["State"] || null;
        const address = data["Alamat Surat Menyurat"] || data["HomeAddress1"] || data["OfficeAddress1"] || data["Address"] || null;
        const hint = normalizeLocationHint([city, state, address].filter(Boolean).join(" "));
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
  async (req, res) => {
    try {
      const query = String(req.body?.query || "").trim();
      if (!query) {
        return res.status(400).json({ message: "Query required" });
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
            await withTimeout(storage.computeCategoryStatsForKeys(computeKeys, rules), 12e3);
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
      let inflight = searchInflight.get(cacheKey);
      if (!inflight) {
        inflight = computeAiSearch(query, req.user.activityId || req.user.username).then((result) => {
          searchCache.set(cacheKey, { ts: Date.now(), payload: result.payload, audit: result.audit });
          searchInflight.delete(cacheKey);
          return result;
        }).catch((err) => {
          searchInflight.delete(cacheKey);
          throw err;
        });
        searchInflight.set(cacheKey, inflight);
      }
      try {
        const result = await withTimeout(inflight, SEARCH_FAST_TIMEOUT_MS);
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
      } catch {
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
          const data = personForBranch.jsonDataJsonb || {};
          const postcode = data["Poskod"] || data["Postcode"] || data["Postal Code"] || data["HomePostcode"] || data["OfficePostcode"] || null;
          if (postcode) {
            const postcodeDigits = String(postcode).match(/\d{5}/)?.[0] ?? null;
            if (isNonEmptyString(postcodeDigits)) {
              const postcodeDigitsSafe = postcodeDigits;
              const pc = await storage.getPostcodeLatLng(postcodeDigitsSafe);
              if (hasPostcodeCoord(pc)) {
                const pcSafe = pc;
                const branches = await storage.getNearestBranches({ lat: pcSafe.lat, lng: pcSafe.lng, limit: 1 });
                nearestBranch = branches[0] || null;
              } else {
                missingCoords = true;
                branchTextSearch = true;
                const branches = await storage.findBranchesByText({ query: postcodeDigitsSafe, limit: 1 });
                nearestBranch = branches[0] || null;
              }
            } else {
              missingCoords = true;
            }
          } else {
            missingCoords = true;
          }
          if (!nearestBranch && missingCoords) {
            const city = data["Bandar"] || data["City"] || data["City/Town"] || null;
            const state = data["Negeri"] || data["State"] || null;
            const address = data["Alamat Surat Menyurat"] || data["HomeAddress1"] || data["OfficeAddress1"] || data["Address"] || null;
            const hint = normalizeLocationHint([city, state, address].filter(Boolean).join(" "));
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
  }
);
app.post(
  "/api/ai/index/import/:id",
  authenticateToken,
  requireRole("user", "admin", "superuser"),
  async (req, res) => {
    try {
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
  async (req, res) => {
    try {
      const message = String(req.body?.message || "").trim();
      if (!message) {
        return res.status(400).json({ message: "Message required" });
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
        reply = await ollamaChat(chatMessages, { num_predict: 96, temperature: 0.2, top_p: 0.9 });
      } catch (err) {
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
  }
);
app.get("/api/columns", authenticateToken, async (req, res) => {
  try {
    const columns = await storage.getAllColumnNames();
    res.json(columns);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/activities", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
  try {
    const activities = await storage.getAllActivities();
    res.json(activities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/activities/active", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
  try {
    const activities = await storage.getActiveActivities();
    res.json(activities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.post("/api/activities/filter", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
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
    const hashedPassword = await bcrypt2.hash(password, 10);
    const user = await storage.createUser({ username, password: hashedPassword, role });
    await storage.createAuditLog({
      action: "CREATE_USER",
      performedBy: req.user.username,
      targetUser: username,
      details: `Created user with role: ${role}`
    });
    res.json({ id: user.id, username: user.username, role: user.role, isBanned: user.isBanned });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/audit-logs", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
  try {
    const logs = await storage.getAuditLogs();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/audit-logs/stats", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
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
app.get("/api/analyze/all", authenticateToken, requireRole("admin", "superuser"), async (req, res) => {
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
});
app.get("/api/debug/websocket-clients", authenticateToken, requireRole("superuser"), async (req, res) => {
  try {
    const clients = Array.from(connectedClients.keys());
    res.json({ count: clients.length, clients });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.delete("/api/audit-logs/cleanup", authenticateToken, requireRole("superuser"), async (req, res) => {
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
app.get("/api/analytics/summary", authenticateToken, requireRole("superuser"), async (req, res) => {
  try {
    const summary = await storage.getDashboardSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/analytics/login-trends", authenticateToken, requireRole("superuser"), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const trends = await storage.getLoginTrends(days);
    res.json(trends);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/analytics/top-users", authenticateToken, requireRole("superuser"), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const topUsers = await storage.getTopActiveUsers(limit);
    res.json(topUsers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/analytics/peak-hours", authenticateToken, requireRole("superuser"), async (req, res) => {
  try {
    const peakHours = await storage.getPeakHours();
    res.json(peakHours);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/analytics/role-distribution", authenticateToken, requireRole("superuser"), async (req, res) => {
  try {
    const distribution = await storage.getRoleDistribution();
    res.json(distribution);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/backups", authenticateToken, requireRole("superuser"), async (req, res) => {
  try {
    const backups3 = await storage.getBackups();
    res.json({ backups: backups3 });
  } catch (error) {
    console.error("Get backups error:", error);
    res.status(500).json({ message: error.message });
  }
});
app.post("/api/backups", authenticateToken, requireRole("superuser"), async (req, res) => {
  try {
    const { name } = req.body;
    const startTime = Date.now();
    const backupData = await storage.getBackupDataForExport();
    const metadata = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      importsCount: backupData.imports.length,
      dataRowsCount: backupData.dataRows.length,
      usersCount: backupData.users.length,
      auditLogsCount: backupData.auditLogs.length
    };
    const backup = await storage.createBackup({
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
    res.json(backup);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/api/backups/:id", authenticateToken, requireRole("superuser"), async (req, res) => {
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
app.post("/api/backups/:id/restore", authenticateToken, requireRole("superuser"), async (req, res) => {
  try {
    const backup = await storage.getBackupById(req.params.id);
    if (!backup) {
      return res.status(404).json({ message: "Backup not found" });
    }
    const startTime = Date.now();
    const backupData = JSON.parse(backup.backupData);
    const result = await storage.restoreFromBackup(backupData);
    await storage.createAuditLog({
      action: "RESTORE_BACKUP",
      performedBy: req.user.username,
      targetResource: backup.name,
      details: JSON.stringify({
        ...result.stats,
        durationMs: Date.now() - startTime
      })
    });
    res.json({
      ...result,
      message: `Restore completed in ${Math.round((Date.now() - startTime) / 1e3)}s`
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.delete("/api/backups/:id", authenticateToken, requireRole("superuser"), async (req, res) => {
  try {
    const backup = await storage.getBackupById(req.params.id);
    const deleted = await storage.deleteBackup(req.params.id);
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
    ws.on("close", () => {
      if (connectedClients.get(activityId) === ws) {
        connectedClients.delete(activityId);
      }
      console.log(`WebSocket closed for activityId=${activityId}`);
    });
  } catch (err) {
    console.log("\u274C WS handshake failed");
    ws.close();
  }
});
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
setInterval(async () => {
  if (idleSweepRunning) return;
  idleSweepRunning = true;
  try {
    const now = Date.now();
    const activities = await storage.getActiveActivities();
    for (const activity of activities) {
      if (!activity.lastActivityTime) continue;
      const last = new Date(activity.lastActivityTime).getTime();
      const diff = now - last;
      if (diff > WS_IDLE_MS) {
        const freshActivity = await storage.getActivityById(activity.id);
        if (!freshActivity || freshActivity.isActive === false) {
          continue;
        }
        const freshLast = freshActivity.lastActivityTime ? new Date(freshActivity.lastActivityTime).getTime() : 0;
        const freshDiff = now - freshLast;
        if (!freshLast || freshDiff <= WS_IDLE_MS) {
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
          details: `Auto logout after ${WS_IDLE_MINUTES} minutes idle`
        });
      }
    }
  } catch (err) {
    console.error("Idle session checker error:", err);
  } finally {
    idleSweepRunning = false;
  }
}, 60 * 1e3);
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
startServer();
