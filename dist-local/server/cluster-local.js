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

// server/config/security.ts
import { randomBytes } from "node:crypto";
function readEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}
function buildEphemeralSecret(label) {
  return `${label.toLowerCase()}-${randomBytes(32).toString("hex")}`;
}
function getSessionSecret() {
  if (cachedSessionSecret) return cachedSessionSecret;
  const secret = readEnv("SESSION_SECRET");
  if (secret) {
    cachedSessionSecret = secret;
    return secret;
  }
  if (isProduction) {
    throw new Error("SESSION_SECRET is required in production.");
  }
  cachedSessionSecret = buildEphemeralSecret("session");
  return cachedSessionSecret;
}
function getCollectionNicknameTempPassword() {
  if (cachedCollectionNicknameTempPassword) {
    return cachedCollectionNicknameTempPassword;
  }
  const password = readEnv("COLLECTION_NICKNAME_TEMP_PASSWORD");
  if (password) {
    cachedCollectionNicknameTempPassword = password;
    return password;
  }
  if (isProduction) {
    throw new Error("COLLECTION_NICKNAME_TEMP_PASSWORD is required in production.");
  }
  cachedCollectionNicknameTempPassword = buildEphemeralSecret("collection-temp").slice(0, 16);
  return cachedCollectionNicknameTempPassword;
}
function shouldSeedDefaultUsers() {
  return String(process.env.SEED_DEFAULT_USERS || "0") === "1";
}
function readDatabasePassword() {
  const password = readEnv("PG_PASSWORD");
  if (password) return password;
  if (isProduction) {
    throw new Error("PG_PASSWORD is required in production.");
  }
  return void 0;
}
var isProduction, cachedSessionSecret, cachedCollectionNicknameTempPassword;
var init_security = __esm({
  "server/config/security.ts"() {
    "use strict";
    isProduction = process.env.NODE_ENV === "production";
    cachedSessionSecret = null;
    cachedCollectionNicknameTempPassword = null;
  }
});

// server/db-postgres.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
var Pool, pool, db;
var init_db_postgres = __esm({
  "server/db-postgres.ts"() {
    "use strict";
    init_security();
    ({ Pool } = pg);
    pool = new Pool({
      host: process.env.PG_HOST || "localhost",
      port: Number(process.env.PG_PORT || 5432),
      user: process.env.PG_USER || "postgres",
      password: readDatabasePassword(),
      database: process.env.PG_DATABASE || "sqr_db",
      max: 5,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 5e3,
      options: "-c search_path=public"
    });
    db = drizzle(pool);
  }
});

// server/internal/backupsBootstrap.ts
import { sql } from "drizzle-orm";
var BackupsBootstrap;
var init_backupsBootstrap = __esm({
  "server/internal/backupsBootstrap.ts"() {
    "use strict";
    init_db_postgres();
    BackupsBootstrap = class {
      constructor() {
        this.ready = false;
        this.initPromise = null;
      }
      async ensureTable() {
        if (this.ready) return;
        if (this.initPromise) {
          await this.initPromise;
          return;
        }
        this.initPromise = (async () => {
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
            this.ready = true;
          } catch (err) {
            console.error("\u274C Failed to ensure backups table:", err?.message || err);
          }
        })();
        try {
          await this.initPromise;
        } finally {
          this.initPromise = null;
        }
      }
    };
  }
});

// server/config/system-settings.ts
var ROLE_TAB_SETTINGS, roleTabSettingKey;
var init_system_settings = __esm({
  "server/config/system-settings.ts"() {
    "use strict";
    ROLE_TAB_SETTINGS = {
      admin: [
        { pageId: "home", suffix: "home", label: "Admin Tab: Home", description: "Allow admin to open Home tab.", defaultEnabled: true },
        { pageId: "import", suffix: "import", label: "Admin Tab: Import", description: "Allow admin to open Import tab.", defaultEnabled: true },
        { pageId: "saved", suffix: "saved", label: "Admin Tab: Saved", description: "Allow admin to open Saved tab.", defaultEnabled: true },
        { pageId: "viewer", suffix: "viewer", label: "Admin Tab: Viewer", description: "Allow admin to open Viewer tab.", defaultEnabled: true },
        { pageId: "general-search", suffix: "general_search", label: "Admin Tab: Search", description: "Allow admin to open Search tab.", defaultEnabled: true },
        { pageId: "collection-report", suffix: "collection_report", label: "Admin Tab: Collection Report", description: "Allow admin to open Collection Report tab.", defaultEnabled: true },
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
        { pageId: "collection-report", suffix: "collection_report", label: "User Tab: Collection Report", description: "Allow user to open Collection Report tab.", defaultEnabled: true },
        { pageId: "analysis", suffix: "analysis", label: "User Tab: Analysis", description: "Allow user to open Analysis tab.", defaultEnabled: false },
        { pageId: "dashboard", suffix: "dashboard", label: "User Tab: Dashboard", description: "Allow user to open Dashboard tab.", defaultEnabled: false },
        { pageId: "monitor", suffix: "monitor", label: "User Tab: System Monitor", description: "Allow user to open System Monitor tab.", defaultEnabled: false },
        { pageId: "activity", suffix: "activity", label: "User Tab: Activity", description: "Allow user to open Activity tab.", defaultEnabled: false },
        { pageId: "audit-logs", suffix: "audit_logs", label: "User Tab: Audit", description: "Allow user to open Audit tab.", defaultEnabled: false },
        { pageId: "backup", suffix: "backup", label: "User Tab: Backup", description: "Allow user to open Backup tab.", defaultEnabled: false }
      ]
    };
    roleTabSettingKey = (role, suffix) => `tab_${role}_${suffix}_enabled`;
  }
});

// server/internal/settingsBootstrap.ts
import { sql as sql2 } from "drizzle-orm";
var SettingsBootstrap;
var init_settingsBootstrap = __esm({
  "server/internal/settingsBootstrap.ts"() {
    "use strict";
    init_db_postgres();
    init_system_settings();
    SettingsBootstrap = class {
      constructor() {
        this.ready = false;
        this.initPromise = null;
      }
      async ensureTables() {
        if (this.ready) return;
        if (this.initPromise) {
          await this.initPromise;
          return;
        }
        this.initPromise = (async () => {
          try {
            await db.execute(sql2`SET search_path TO public`);
            await db.execute(sql2`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
            await db.execute(sql2`
          CREATE TABLE IF NOT EXISTS public.setting_categories (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text UNIQUE NOT NULL,
            description text,
            created_at timestamp DEFAULT now()
          )
        `);
            await db.execute(sql2`
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
            await db.execute(sql2`
          CREATE TABLE IF NOT EXISTS public.setting_options (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            setting_id uuid REFERENCES public.system_settings(id) ON DELETE CASCADE,
            value text NOT NULL,
            label text NOT NULL
          )
        `);
            try {
              await db.execute(sql2`
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
              await db.execute(sql2`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_options_unique_value
            ON public.setting_options (setting_id, value)
          `);
            } catch (idxErr) {
              console.warn("\u26A0\uFE0F setting_options unique index not created:", idxErr?.message || idxErr);
            }
            await db.execute(sql2`
          CREATE INDEX IF NOT EXISTS idx_setting_options_setting_id
          ON public.setting_options (setting_id)
        `);
            await db.execute(sql2`
          CREATE TABLE IF NOT EXISTS public.role_setting_permissions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            role text NOT NULL,
            setting_key text NOT NULL,
            can_view boolean DEFAULT false,
            can_edit boolean DEFAULT false
          )
        `);
            await db.execute(sql2`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_role_setting_permissions_unique
          ON public.role_setting_permissions (role, setting_key)
        `);
            await db.execute(sql2`
          CREATE TABLE IF NOT EXISTS public.setting_versions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            setting_key text NOT NULL,
            old_value text,
            new_value text NOT NULL,
            changed_by text NOT NULL,
            changed_at timestamp DEFAULT now()
          )
        `);
            await db.execute(sql2`
          CREATE INDEX IF NOT EXISTS idx_setting_versions_key_time
          ON public.setting_versions (setting_key, changed_at DESC)
        `);
            await db.execute(sql2`
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
              await db.execute(sql2`
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
                settingsSeed.push({
                  categoryName: "Roles & Permissions",
                  key: roleTabSettingKey(role, tabSetting.suffix),
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
              await db.execute(sql2`
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
            const maintenanceTypeRes = await db.execute(sql2`
          SELECT id
          FROM public.system_settings
          WHERE key = 'maintenance_type'
          LIMIT 1
        `);
            const maintenanceTypeId = String(maintenanceTypeRes.rows[0]?.id || "").trim();
            if (maintenanceTypeId) {
              await db.execute(sql2`
            DELETE FROM public.setting_options
            WHERE setting_id = ${maintenanceTypeId}
          `);
              await db.execute(sql2`
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
              await db.execute(sql2`
            INSERT INTO public.role_setting_permissions (role, setting_key, can_view, can_edit)
            VALUES ('superuser', ${setting.key}, true, true)
            ON CONFLICT (role, setting_key) DO UPDATE SET
              can_view = EXCLUDED.can_view,
              can_edit = EXCLUDED.can_edit
          `);
              await db.execute(sql2`
            INSERT INTO public.role_setting_permissions (role, setting_key, can_view, can_edit)
            VALUES ('admin', ${setting.key}, true, ${adminEditable.has(setting.key)})
            ON CONFLICT (role, setting_key) DO UPDATE SET
              can_view = EXCLUDED.can_view,
              can_edit = EXCLUDED.can_edit
          `);
              await db.execute(sql2`
            INSERT INTO public.role_setting_permissions (role, setting_key, can_view, can_edit)
            VALUES ('user', ${setting.key}, false, false)
            ON CONFLICT (role, setting_key) DO UPDATE SET
              can_view = EXCLUDED.can_view,
              can_edit = EXCLUDED.can_edit
          `);
            }
            this.ready = true;
          } catch (err) {
            console.error("\u274C Failed to ensure enterprise settings tables:", err?.message || err);
          }
        })();
        try {
          await this.initPromise;
        } finally {
          this.initPromise = null;
        }
      }
    };
  }
});

// server/internal/spatialBootstrap.ts
import { sql as sql3 } from "drizzle-orm";
var SpatialBootstrap;
var init_spatialBootstrap = __esm({
  "server/internal/spatialBootstrap.ts"() {
    "use strict";
    init_db_postgres();
    SpatialBootstrap = class {
      constructor() {
        this.ready = false;
        this.initPromise = null;
      }
      async ensureTables() {
        if (this.ready) return;
        if (this.initPromise) {
          await this.initPromise;
          return;
        }
        this.initPromise = (async () => {
          try {
            await db.execute(sql3`SET search_path TO public`);
            await db.execute(sql3`CREATE EXTENSION IF NOT EXISTS postgis`);
            await db.execute(sql3`
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
            await db.execute(sql3`
          CREATE TABLE IF NOT EXISTS public.aeon_branch_postcodes (
            postcode text PRIMARY KEY,
            lat double precision NOT NULL,
            lng double precision NOT NULL,
            source_branch text,
            state text
          )
        `);
            await db.execute(sql3`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS branch_address text`);
            await db.execute(sql3`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS phone_number text`);
            await db.execute(sql3`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS fax_number text`);
            await db.execute(sql3`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS business_hour text`);
            await db.execute(sql3`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS day_open text`);
            await db.execute(sql3`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS atm_cdm text`);
            await db.execute(sql3`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS inquiry_availability text`);
            await db.execute(sql3`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS application_availability text`);
            await db.execute(sql3`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS aeon_lounge text`);
            await db.execute(sql3`CREATE INDEX IF NOT EXISTS idx_aeon_branches_lat_lng ON public.aeon_branches (branch_lat, branch_lng)`);
            await db.execute(sql3`CREATE UNIQUE INDEX IF NOT EXISTS idx_aeon_branches_name_unique ON public.aeon_branches (lower(name))`);
            await db.execute(sql3`CREATE INDEX IF NOT EXISTS idx_aeon_postcodes ON public.aeon_branch_postcodes (postcode)`);
            this.ready = true;
          } catch (err) {
            console.warn("\u26A0\uFE0F Failed to ensure PostGIS tables:", err?.message || err);
          }
        })();
        try {
          await this.initPromise;
        } finally {
          this.initPromise = null;
        }
      }
    };
  }
});

// server/repositories/auth.repository.ts
import bcrypt from "bcrypt";
import crypto from "crypto";
import { inArray, sql as sql4 } from "drizzle-orm";
var BCRYPT_COST, QUERY_PAGE_LIMIT, AuthRepository;
var init_auth_repository = __esm({
  "server/repositories/auth.repository.ts"() {
    "use strict";
    init_schema_postgres();
    init_db_postgres();
    BCRYPT_COST = 12;
    QUERY_PAGE_LIMIT = 1e3;
    AuthRepository = class {
      async getUser(id) {
        const result = await db.select().from(users).where(sql4`${users.id} = ${id}`).limit(1);
        return result[0];
      }
      async getUserByUsername(username) {
        const normalized = String(username || "").trim();
        if (!normalized) return void 0;
        const result = await db.select().from(users).where(sql4`lower(${users.username}) = lower(${normalized})`).limit(1);
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
        await db.update(users).set(next).where(sql4`${users.id} = ${params.userId}`);
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
        await db.update(userActivity).set({ username: newUsername }).where(sql4`${userActivity.username} = ${oldUsername}`);
      }
      async updateUserBan(username, isBanned) {
        await db.update(users).set({ isBanned, updatedAt: /* @__PURE__ */ new Date() }).where(sql4`${users.username} = ${username}`);
        const result = await db.select().from(users).where(sql4`${users.username} = ${username}`).limit(1);
        return result[0];
      }
      async getAccounts() {
        const rows = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select({
            username: users.username,
            role: users.role,
            isBanned: users.isBanned
          }).from(users).orderBy(users.role, users.username).limit(QUERY_PAGE_LIMIT).offset(offset);
          if (!chunk.length) break;
          rows.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT) break;
          offset += chunk.length;
        }
        return rows;
      }
    };
  }
});

// server/repositories/imports.repository.ts
import crypto2 from "crypto";
import { and, desc, eq, sql as sql5 } from "drizzle-orm";
var QUERY_PAGE_LIMIT2, ImportsRepository;
var init_imports_repository = __esm({
  "server/repositories/imports.repository.ts"() {
    "use strict";
    init_schema_postgres();
    init_db_postgres();
    QUERY_PAGE_LIMIT2 = 1e3;
    ImportsRepository = class {
      async createImport(data) {
        const result = await db.insert(imports).values({
          id: crypto2.randomUUID(),
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
          const chunk = await db.select().from(imports).where(eq(imports.isDeleted, false)).orderBy(desc(imports.createdAt)).limit(QUERY_PAGE_LIMIT2).offset(offset);
          if (!chunk.length) break;
          results.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT2) break;
          offset += chunk.length;
        }
        return results;
      }
      async getImportsWithRowCounts() {
        const result = await db.execute(sql5`
      SELECT
        i.id,
        i.name,
        i.filename,
        i.created_at as "createdAt",
        i.is_deleted as "isDeleted",
        i.created_by as "createdBy",
        COALESCE(COUNT(dr.id), 0)::int as "rowCount"
      FROM public.imports i
      LEFT JOIN public.data_rows dr ON dr.import_id = i.id
      WHERE i.is_deleted = false
      GROUP BY i.id, i.name, i.filename, i.created_at, i.is_deleted, i.created_by
      ORDER BY i.created_at DESC
    `);
        return result.rows || [];
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
          id: crypto2.randomUUID(),
          importId: data.importId,
          jsonDataJsonb: data.jsonDataJsonb
        }).returning();
        return result[0];
      }
      async getDataRowsByImport(importId) {
        const rows = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(dataRows).where(eq(dataRows.importId, importId)).limit(QUERY_PAGE_LIMIT2).offset(offset);
          if (!chunk.length) break;
          rows.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT2) break;
          offset += chunk.length;
        }
        return rows;
      }
      async getDataRowsByImportPage(importId, limit, offset) {
        return db.select().from(dataRows).where(eq(dataRows.importId, importId)).limit(Math.max(1, limit)).offset(Math.max(0, offset));
      }
      async getDataRowCountByImport(importId) {
        const [{ count: count3 }] = await db.select({ count: sql5`count(*)` }).from(dataRows).where(eq(dataRows.importId, importId));
        return Number(count3);
      }
      async getDataRowCountsByImportIds(importIds) {
        if (!importIds.length) {
          return /* @__PURE__ */ new Map();
        }
        const result = await db.execute(sql5`
      SELECT
        dr.import_id as "importId",
        COUNT(dr.id)::int as "rowCount"
      FROM public.data_rows dr
      WHERE dr.import_id = ANY(${importIds}::text[])
      GROUP BY dr.import_id
    `);
        return new Map(
          (result.rows || []).map((row) => [String(row.importId), Number(row.rowCount)])
        );
      }
    };
  }
});

// server/repositories/search.repository.ts
import { sql as sql6 } from "drizzle-orm";
function detectValueType(value) {
  if (!value) return "string";
  if (!Number.isNaN(Number(value))) return "number";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return "date";
  return "string";
}
function normalizeJsonPayload(raw) {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    const mapped = {};
    for (let index = 0; index < value.length; index += 1) {
      mapped[`col_${index + 1}`] = value[index];
    }
    return mapped;
  }
  return value;
}
function buildFieldCondition(field, operator, value) {
  const column = sql6`dr.json_data::jsonb ->> ${field}`;
  const valueType = detectValueType(value);
  switch (operator) {
    case "contains":
      return sql6`${column} ILIKE ${`%${value}%`}`;
    case "equals":
      return sql6`${column} = ${value}`;
    case "notEquals":
      return sql6`${column} <> ${value}`;
    case "startsWith":
      return sql6`${column} ILIKE ${`${value}%`}`;
    case "endsWith":
      return sql6`${column} ILIKE ${`%${value}`}`;
    case "greaterThan":
      if (valueType === "number") return sql6`NULLIF(${column}, '')::numeric > ${Number(value)}`;
      if (valueType === "date") return sql6`NULLIF(${column}, '')::date > ${value}`;
      return sql6`false`;
    case "lessThan":
      if (valueType === "number") return sql6`NULLIF(${column}, '')::numeric < ${Number(value)}`;
      if (valueType === "date") return sql6`NULLIF(${column}, '')::date < ${value}`;
      return sql6`false`;
    case "greaterThanOrEqual":
      if (valueType === "number") return sql6`NULLIF(${column}, '')::numeric >= ${Number(value)}`;
      if (valueType === "date") return sql6`NULLIF(${column}, '')::date >= ${value}`;
      return sql6`false`;
    case "lessThanOrEqual":
      if (valueType === "number") return sql6`NULLIF(${column}, '')::numeric <= ${Number(value)}`;
      if (valueType === "date") return sql6`NULLIF(${column}, '')::date <= ${value}`;
      return sql6`false`;
    case "isEmpty":
      return sql6`COALESCE(${column}, '') = ''`;
    case "isNotEmpty":
      return sql6`COALESCE(${column}, '') <> ''`;
    default:
      return sql6`false`;
  }
}
var MAX_SEARCH_LIMIT, MAX_COLUMN_KEYS, ALLOWED_OPERATORS, SearchRepository;
var init_search_repository = __esm({
  "server/repositories/search.repository.ts"() {
    "use strict";
    init_db_postgres();
    MAX_SEARCH_LIMIT = 200;
    MAX_COLUMN_KEYS = 500;
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
    SearchRepository = class {
      async searchGlobalDataRows(params) {
        const { search, limit, offset } = params;
        const rowsResult = await db.execute(sql6`
      SELECT
        dr.id,
        dr.import_id,
        dr.json_data as json_data_jsonb,
        i.name as import_name,
        i.filename as import_filename
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND dr.json_data::text ILIKE ${`%${search}%`}
      ORDER BY dr.id
      LIMIT ${Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT))}
      OFFSET ${Math.max(0, offset)}
    `);
        const totalResult = await db.execute(sql6`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND dr.json_data::text ILIKE ${`%${search}%`}
    `);
        const rows = (rowsResult.rows || []).map((row) => ({
          id: row.id,
          importId: row.import_id,
          importName: row.import_name,
          importFilename: row.import_filename,
          jsonDataJsonb: normalizeJsonPayload(row.json_data_jsonb)
        }));
        const total = totalResult.rows?.[0] ? Number(totalResult.rows[0].total) : 0;
        return { rows, total };
      }
      async searchSimpleDataRows(search) {
        return db.execute(sql6`
      SELECT
        dr.import_id as "importId",
        i.name as "importName",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND dr.json_data::text ILIKE ${`%${search}%`}
      LIMIT ${MAX_SEARCH_LIMIT}
    `);
      }
      async searchDataRows(params) {
        const { importId, search, limit, offset } = params;
        const trimmedSearch = search && search.trim() ? search.trim() : null;
        const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
        const safeOffset = Math.max(offset, 0);
        if (trimmedSearch && trimmedSearch.length < 2) {
          return { rows: [], total: 0 };
        }
        if (!trimmedSearch) {
          const rowsResult2 = await db.execute(sql6`
        SELECT
          dr.id,
          dr.import_id as "importId",
          dr.json_data as "jsonDataJsonb"
        FROM public.data_rows dr
        WHERE dr.import_id = ${importId}
        ORDER BY dr.id
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
      `);
          const totalResult2 = await db.execute(sql6`
        SELECT COUNT(*)::int AS total
        FROM public.data_rows dr
        WHERE dr.import_id = ${importId}
      `);
          return {
            rows: (rowsResult2.rows || []).map((row) => ({
              id: row.id,
              importId: row.importId,
              jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb)
            })),
            total: totalResult2.rows?.[0] ? Number(totalResult2.rows[0].total) : 0
          };
        }
        const rowsResult = await db.execute(sql6`
      SELECT
        dr.id,
        dr.import_id as "importId",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_rows dr
      WHERE dr.import_id = ${importId}
        AND dr.json_data::text ILIKE ${`%${trimmedSearch}%`}
      ORDER BY dr.id
      LIMIT ${safeLimit}
      OFFSET ${safeOffset}
    `);
        const totalResult = await db.execute(sql6`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      WHERE dr.import_id = ${importId}
        AND dr.json_data::text ILIKE ${`%${trimmedSearch}%`}
    `);
        return {
          rows: (rowsResult.rows || []).map((row) => ({
            id: row.id,
            importId: row.importId,
            jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb)
          })),
          total: totalResult.rows?.[0] ? Number(totalResult.rows[0].total) : 0
        };
      }
      async advancedSearchDataRows(filters, logic, limit, offset) {
        const allowedColumns = new Set(await this.getAllColumnNames());
        const safeFilters = filters.filter(
          (filter) => allowedColumns.has(filter.field) && ALLOWED_OPERATORS.has(filter.operator)
        );
        if (safeFilters.length === 0) {
          return { rows: [], total: 0 };
        }
        const conditions = safeFilters.map(
          (filter) => buildFieldCondition(filter.field, filter.operator, String(filter.value ?? ""))
        );
        const conditionSql = conditions.length === 1 ? conditions[0] : sql6.join(conditions, logic === "AND" ? sql6` AND ` : sql6` OR `);
        const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
        const safeOffset = Math.max(offset, 0);
        const rowsResult = await db.execute(sql6`
      SELECT
        dr.id,
        dr.import_id as "importId",
        dr.json_data as "jsonDataJsonb",
        i.name as "importName",
        i.filename as "importFilename"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${conditionSql})
      ORDER BY dr.id
      LIMIT ${safeLimit}
      OFFSET ${safeOffset}
    `);
        const totalResult = await db.execute(sql6`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${conditionSql})
    `);
        return {
          rows: (rowsResult.rows || []).map((row) => ({
            id: row.id,
            importId: row.importId,
            jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
            importName: row.importName,
            importFilename: row.importFilename
          })),
          total: totalResult.rows?.[0] ? Number(totalResult.rows[0].total) : 0
        };
      }
      async getAllColumnNames() {
        const result = await db.execute(sql6`
      SELECT DISTINCT key AS column_name
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      CROSS JOIN LATERAL jsonb_object_keys(dr.json_data::jsonb) AS key
      WHERE i.is_deleted = false
        AND jsonb_typeof(dr.json_data::jsonb) = 'object'
      ORDER BY key
      LIMIT ${MAX_COLUMN_KEYS}
    `);
        return (result.rows || []).map((row) => String(row.column_name || "").trim()).filter(Boolean);
      }
    };
  }
});

// server/repositories/activity.repository.ts
import crypto3 from "crypto";
import { and as and2, desc as desc2, eq as eq2, gte, lte, sql as sql7 } from "drizzle-orm";
var QUERY_PAGE_LIMIT3, ActivityRepository;
var init_activity_repository = __esm({
  "server/repositories/activity.repository.ts"() {
    "use strict";
    init_schema_postgres();
    init_db_postgres();
    QUERY_PAGE_LIMIT3 = 1e3;
    ActivityRepository = class {
      constructor(options) {
        this.options = options;
      }
      computeActivityStatus(activity) {
        if (!activity.isActive) {
          if (activity.logoutReason === "KICKED") return "KICKED";
          if (activity.logoutReason === "BANNED") return "BANNED";
          return "LOGOUT";
        }
        if (activity.lastActivityTime) {
          const lastActive = new Date(activity.lastActivityTime).getTime();
          const diffMinutes = Math.floor((Date.now() - lastActive) / 6e4);
          if (diffMinutes >= 5) return "IDLE";
        }
        return "ONLINE";
      }
      async createActivity(data) {
        const now = /* @__PURE__ */ new Date();
        const result = await db.insert(userActivity).values({
          id: crypto3.randomUUID(),
          userId: data.userId,
          username: data.username,
          role: data.role,
          pcName: data.pcName ?? null,
          browser: data.browser ?? null,
          fingerprint: data.fingerprint ?? null,
          ipAddress: data.ipAddress ?? null,
          loginTime: now,
          logoutTime: null,
          lastActivityTime: now,
          isActive: true,
          logoutReason: null
        }).returning();
        return result[0];
      }
      async touchActivity(activityId) {
        await db.update(userActivity).set({ lastActivityTime: /* @__PURE__ */ new Date() }).where(eq2(userActivity.id, activityId));
      }
      async getActiveActivitiesByUsername(username) {
        const activities = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(userActivity).where(and2(eq2(userActivity.username, username), eq2(userActivity.isActive, true))).orderBy(desc2(userActivity.loginTime)).limit(QUERY_PAGE_LIMIT3).offset(offset);
          if (!chunk.length) break;
          activities.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT3) break;
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
          await db.update(userActivity).set(updateData).where(eq2(userActivity.id, id));
        }
        const result = await db.select().from(userActivity).where(eq2(userActivity.id, id)).limit(1);
        return result[0];
      }
      async getActivityById(id) {
        const result = await db.select().from(userActivity).where(eq2(userActivity.id, id)).limit(1);
        return result[0];
      }
      async getActiveActivities() {
        const activities = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(userActivity).where(eq2(userActivity.isActive, true)).orderBy(desc2(userActivity.loginTime)).limit(QUERY_PAGE_LIMIT3).offset(offset);
          if (!chunk.length) break;
          activities.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT3) break;
          offset += chunk.length;
        }
        return activities;
      }
      async getAllActivities() {
        const activities = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(userActivity).orderBy(desc2(userActivity.loginTime)).limit(QUERY_PAGE_LIMIT3).offset(offset);
          if (!chunk.length) break;
          activities.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT3) break;
          offset += chunk.length;
        }
        return activities.map((activity) => ({
          ...activity,
          status: this.computeActivityStatus(activity)
        }));
      }
      async deleteActivity(id) {
        await db.delete(userActivity).where(eq2(userActivity.id, id));
        return true;
      }
      async getFilteredActivities(filters) {
        const whereConditions = [];
        if (filters.username) whereConditions.push(eq2(userActivity.username, filters.username));
        if (filters.ipAddress) whereConditions.push(eq2(userActivity.ipAddress, filters.ipAddress));
        if (filters.browser) whereConditions.push(eq2(userActivity.browser, filters.browser));
        if (filters.dateFrom) whereConditions.push(gte(userActivity.loginTime, filters.dateFrom));
        if (filters.dateTo) {
          const endOfDay = new Date(filters.dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          whereConditions.push(lte(userActivity.loginTime, endOfDay));
        }
        const activities = [];
        let offset = 0;
        while (true) {
          const chunk = await db.select().from(userActivity).where(whereConditions.length ? and2(...whereConditions) : void 0).orderBy(desc2(userActivity.loginTime)).limit(QUERY_PAGE_LIMIT3).offset(offset);
          if (!chunk.length) break;
          activities.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT3) break;
          offset += chunk.length;
        }
        const enriched = activities.map((activity) => ({
          ...activity,
          status: this.computeActivityStatus(activity)
        }));
        if (filters.status?.length) {
          return enriched.filter((activity) => filters.status.includes(activity.status));
        }
        return enriched;
      }
      async deactivateUserActivities(username, reason) {
        const updateData = {
          isActive: false,
          logoutTime: /* @__PURE__ */ new Date()
        };
        if (reason) {
          updateData.logoutReason = reason;
        }
        await db.update(userActivity).set(updateData).where(and2(eq2(userActivity.isActive, true), eq2(userActivity.username, username)));
      }
      async deactivateUserSessionsByFingerprint(username, fingerprint) {
        await db.update(userActivity).set({
          isActive: false,
          logoutTime: /* @__PURE__ */ new Date(),
          logoutReason: "NEW_SESSION"
        }).where(
          and2(
            eq2(userActivity.username, username),
            eq2(userActivity.fingerprint, fingerprint),
            eq2(userActivity.isActive, true)
          )
        );
      }
      async getBannedUsers() {
        const result = await db.execute(sql7`
      SELECT
        u.*,
        ban.ip_address as "banIpAddress",
        ban.browser as "banBrowser",
        ban.logout_time as "banLogoutTime"
      FROM public.users u
      LEFT JOIN LATERAL (
        SELECT
          ua.ip_address,
          ua.browser,
          ua.logout_time
        FROM public.user_activity ua
        WHERE lower(ua.username) = lower(u.username)
          AND ua.logout_reason = 'BANNED'
        ORDER BY ua.logout_time DESC NULLS LAST
        LIMIT 1
      ) ban ON true
      WHERE u.is_banned = true
      ORDER BY u.username ASC
    `);
        return (result.rows || []).map((row) => ({
          id: row.id,
          username: row.username,
          passwordHash: row.password_hash,
          role: row.role,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          passwordChangedAt: row.password_changed_at,
          isBanned: row.is_banned,
          banInfo: row.banLogoutTime ? {
            ipAddress: row.banIpAddress ?? null,
            browser: row.banBrowser ?? null,
            bannedAt: row.banLogoutTime ? new Date(row.banLogoutTime) : null
          } : void 0
        }));
      }
      async isVisitorBanned(fingerprint, ipAddress) {
        await this.options.ensureBannedSessionsTable();
        if (!fingerprint && !ipAddress) return false;
        const result = await db.execute(sql7`
      SELECT id
      FROM public.banned_sessions
      WHERE (${fingerprint ?? null}::text IS NOT NULL AND fingerprint = ${fingerprint ?? null}::text)
         OR (${ipAddress ?? null}::text IS NOT NULL AND ip_address = ${ipAddress ?? null}::text)
      LIMIT 1
    `);
        return (result.rows?.length || 0) > 0;
      }
      async banVisitor(params) {
        await this.options.ensureBannedSessionsTable();
        const banId = crypto3.randomUUID();
        await db.execute(sql7`
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
        await this.options.ensureBannedSessionsTable();
        await db.execute(sql7`DELETE FROM public.banned_sessions WHERE id = ${banId}`);
      }
      async getBannedSessions() {
        await this.options.ensureBannedSessionsTable();
        const result = await db.execute(sql7`
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
        return result.rows || [];
      }
    };
  }
});

// server/repositories/audit.repository.ts
import crypto4 from "crypto";
import { desc as desc3, gte as gte2, sql as sql8 } from "drizzle-orm";
var QUERY_PAGE_LIMIT4, AuditRepository;
var init_audit_repository = __esm({
  "server/repositories/audit.repository.ts"() {
    "use strict";
    init_schema_postgres();
    init_db_postgres();
    QUERY_PAGE_LIMIT4 = 1e3;
    AuditRepository = class {
      async createAuditLog(data) {
        const result = await db.insert(auditLogs).values({
          id: crypto4.randomUUID(),
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
          const chunk = await db.select().from(auditLogs).orderBy(desc3(auditLogs.timestamp)).limit(QUERY_PAGE_LIMIT4).offset(offset);
          if (!chunk.length) break;
          logs.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT4) break;
          offset += chunk.length;
        }
        return logs;
      }
      async getAuditLogStats() {
        const today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        const [totalLogs, todayLogs] = await Promise.all([
          db.select({ value: sql8`count(*)` }).from(auditLogs),
          db.select({ value: sql8`count(*)` }).from(auditLogs).where(gte2(auditLogs.timestamp, today))
        ]);
        const actionRows = await db.execute(sql8`
      SELECT action, COUNT(*)::int AS count
      FROM public.audit_logs
      GROUP BY action
    `);
        const actionBreakdown = {};
        for (const row of actionRows.rows || []) {
          actionBreakdown[String(row.action || "UNKNOWN")] = Number(row.count || 0);
        }
        return {
          totalLogs: Number(totalLogs[0]?.value || 0),
          todayLogs: Number(todayLogs[0]?.value || 0),
          actionBreakdown
        };
      }
      async cleanupAuditLogsOlderThan(cutoffDate) {
        const result = await db.execute(sql8`
      DELETE FROM public.audit_logs
      WHERE timestamp IS NOT NULL
        AND timestamp < ${cutoffDate}
      RETURNING id
    `);
        return result.rows?.length || 0;
      }
    };
  }
});

// server/repositories/backups.repository.ts
import crypto5 from "crypto";
import { eq as eq3, sql as sql9 } from "drizzle-orm";
var BACKUP_CHUNK_SIZE, QUERY_PAGE_LIMIT5, BackupsRepository;
var init_backups_repository = __esm({
  "server/repositories/backups.repository.ts"() {
    "use strict";
    init_schema_postgres();
    init_db_postgres();
    BACKUP_CHUNK_SIZE = 500;
    QUERY_PAGE_LIMIT5 = 1e3;
    BackupsRepository = class {
      constructor(options) {
        this.options = options;
      }
      async createBackup(data) {
        await this.options.ensureBackupsTable();
        const id = crypto5.randomUUID();
        const result = await db.execute(sql9`
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
        await this.options.ensureBackupsTable();
        const rows = [];
        let offset = 0;
        while (true) {
          const result = await db.execute(sql9`
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
        LIMIT ${QUERY_PAGE_LIMIT5}
        OFFSET ${offset}
      `);
          const chunk = result.rows || [];
          if (!chunk.length) break;
          rows.push(...chunk);
          if (chunk.length < QUERY_PAGE_LIMIT5) break;
          offset += chunk.length;
        }
        return rows.map((row) => ({
          ...row,
          metadata: this.options.parseBackupMetadataSafe(row.metadata)
        }));
      }
      async getBackupById(id) {
        await this.options.ensureBackupsTable();
        const result = await db.execute(sql9`
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
        return {
          ...row,
          metadata: this.options.parseBackupMetadataSafe(row.metadata)
        };
      }
      async deleteBackup(id) {
        await this.options.ensureBackupsTable();
        await db.execute(sql9`DELETE FROM public.backups WHERE id = ${id}`);
        return true;
      }
      async getBackupDataForExport() {
        const [allImports, allDataRows, allUsersFromDb, allAuditLogs] = await Promise.all([
          db.select().from(imports).where(eq3(imports.isDeleted, false)),
          db.select().from(dataRows),
          db.select().from(users),
          db.select().from(auditLogs)
        ]);
        return {
          imports: allImports,
          dataRows: allDataRows,
          users: allUsersFromDb.map((user) => ({
            username: user.username,
            role: user.role,
            isBanned: user.isBanned,
            passwordHash: user.passwordHash
          })),
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
          const parsed = new Date(value);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        };
        const chunkArray = (rows, size) => {
          const chunks = [];
          for (let index = 0; index < rows.length; index += size) {
            chunks.push(rows.slice(index, index + size));
          }
          return chunks;
        };
        await db.transaction(async (tx) => {
          if (backupData.imports.length > 0) {
            for (const chunk of chunkArray(backupData.imports, BACKUP_CHUNK_SIZE)) {
              const rows = chunk.map((record) => ({
                id: record.id,
                name: record.name,
                filename: record.filename,
                createdAt: toDate(record.createdAt) ?? /* @__PURE__ */ new Date(),
                isDeleted: record.isDeleted ?? false,
                createdBy: record.createdBy ?? null
              }));
              for (const row of rows) {
                await tx.update(imports).set({ isDeleted: false }).where(eq3(imports.id, row.id));
              }
              await tx.insert(imports).values(rows).onConflictDoNothing();
              stats.imports += rows.length;
            }
          }
          if (backupData.dataRows.length > 0) {
            for (const chunk of chunkArray(backupData.dataRows, BACKUP_CHUNK_SIZE)) {
              const rows = chunk.map((row) => ({
                id: row.id ?? crypto5.randomUUID(),
                importId: row.importId,
                jsonDataJsonb: row.jsonDataJsonb
              }));
              await tx.insert(dataRows).values(rows).onConflictDoNothing();
              stats.dataRows += rows.length;
            }
          }
          if (backupData.users.length > 0) {
            const now = /* @__PURE__ */ new Date();
            const rows = backupData.users.filter((user) => user.passwordHash).map((user) => ({
              id: crypto5.randomUUID(),
              username: user.username,
              passwordHash: user.passwordHash,
              role: user.role,
              createdAt: now,
              updatedAt: now,
              passwordChangedAt: now,
              isBanned: user.isBanned ?? false
            }));
            for (const chunk of chunkArray(rows, BACKUP_CHUNK_SIZE)) {
              await tx.insert(users).values(chunk).onConflictDoNothing();
              stats.users += chunk.length;
            }
          }
          if (backupData.auditLogs.length > 0) {
            for (const chunk of chunkArray(backupData.auditLogs, BACKUP_CHUNK_SIZE)) {
              const rows = chunk.map((log2) => ({
                id: log2.id ?? crypto5.randomUUID(),
                action: log2.action,
                performedBy: log2.performedBy,
                targetUser: log2.targetUser ?? null,
                targetResource: log2.targetResource ?? null,
                details: log2.details ?? null,
                timestamp: toDate(log2.timestamp) ?? /* @__PURE__ */ new Date()
              }));
              await tx.insert(auditLogs).values(rows).onConflictDoNothing();
              stats.auditLogs += rows.length;
            }
          }
        });
        return { success: true, stats };
      }
    };
  }
});

// server/repositories/analytics.repository.ts
import { count, eq as eq4, gte as gte3, sql as sql10 } from "drizzle-orm";
var ANALYTICS_TZ, AnalyticsRepository;
var init_analytics_repository = __esm({
  "server/repositories/analytics.repository.ts"() {
    "use strict";
    init_schema_postgres();
    init_db_postgres();
    ANALYTICS_TZ = process.env.ANALYTICS_TZ || "Asia/Kuala_Lumpur";
    AnalyticsRepository = class {
      async getDashboardSummary() {
        const today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        const [totalUsers, activeSessions, loginsToday, totalDataRows, totalImports, bannedUsers] = await Promise.all([
          db.select({ value: count() }).from(users),
          db.select({ value: count() }).from(userActivity).where(eq4(userActivity.isActive, true)),
          db.select({ value: count() }).from(userActivity).where(gte3(userActivity.loginTime, today)),
          db.select({ value: count() }).from(dataRows),
          db.select({ value: count() }).from(imports).where(eq4(imports.isDeleted, false)),
          db.select({ value: count() }).from(users).where(eq4(users.isBanned, true))
        ]);
        return {
          totalUsers: totalUsers[0]?.value || 0,
          activeSessions: activeSessions[0]?.value || 0,
          loginsToday: loginsToday[0]?.value || 0,
          totalDataRows: totalDataRows[0]?.value || 0,
          totalImports: totalImports[0]?.value || 0,
          bannedUsers: bannedUsers[0]?.value || 0
        };
      }
      async getLoginTrends(days = 7) {
        const result = await db.execute(sql10`
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
        FROM public.user_activity
        WHERE login_time IS NOT NULL
        GROUP BY day
      ),
      logouts AS (
        SELECT
          (logout_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ})::date AS day,
          COUNT(*)::int AS logouts
        FROM public.user_activity
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
        return result.rows || [];
      }
      async getTopActiveUsers(limit = 10) {
        const result = await db.execute(sql10`
      SELECT
        username,
        role,
        COUNT(*)::int AS "loginCount",
        MAX(login_time) AS "lastLogin"
      FROM public.user_activity
      GROUP BY username, role
      ORDER BY "loginCount" DESC
      LIMIT ${limit}
    `);
        return result.rows.map((row) => ({
          username: row.username,
          role: row.role,
          loginCount: row.loginCount,
          lastLogin: row.lastLogin ? new Date(row.lastLogin).toISOString() : null
        }));
      }
      async getPeakHours() {
        const result = await db.execute(sql10`
      SELECT
        EXTRACT(HOUR FROM (login_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ}))::int AS hour,
        COUNT(*)::int AS count
      FROM public.user_activity
      WHERE login_time IS NOT NULL
      GROUP BY hour
      ORDER BY hour ASC
    `);
        const hoursMap = /* @__PURE__ */ new Map();
        for (let hour = 0; hour < 24; hour += 1) {
          hoursMap.set(hour, 0);
        }
        for (const row of result.rows) {
          hoursMap.set(row.hour, row.count);
        }
        return Array.from(hoursMap.entries()).map(([hour, count3]) => ({
          hour,
          count: count3
        }));
      }
      async getRoleDistribution() {
        const result = await db.execute(sql10`
      SELECT role, COUNT(*)::int AS count
      FROM public.users
      GROUP BY role
      ORDER BY role ASC
    `);
        return result.rows || [];
      }
    };
  }
});

// server/repositories/collection.repository.ts
import { randomUUID } from "crypto";
import { sql as sql11 } from "drizzle-orm";
function normalizeCollectionNicknameRoleScope(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "user" || normalized === "both") {
    return normalized;
  }
  return "both";
}
var COLLECTION_MONTH_NAMES, CollectionRepository;
var init_collection_repository = __esm({
  "server/repositories/collection.repository.ts"() {
    "use strict";
    init_db_postgres();
    COLLECTION_MONTH_NAMES = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    CollectionRepository = class {
      mapCollectionStaffNicknameRow(row) {
        const createdAtRaw = row.created_at ?? row.createdAt;
        const createdAt = createdAtRaw instanceof Date ? createdAtRaw : new Date(createdAtRaw ?? Date.now());
        return {
          id: String(row.id ?? ""),
          nickname: String(row.nickname ?? ""),
          isActive: Boolean(row.is_active ?? row.isActive),
          roleScope: normalizeCollectionNicknameRoleScope(row.role_scope ?? row.roleScope),
          createdBy: row.created_by ?? row.createdBy ?? null,
          createdAt
        };
      }
      mapCollectionNicknameAuthProfileRow(row) {
        const passwordUpdatedAtRaw = row.password_updated_at ?? row.passwordUpdatedAt ?? null;
        const passwordUpdatedAt = passwordUpdatedAtRaw instanceof Date ? passwordUpdatedAtRaw : passwordUpdatedAtRaw ? new Date(passwordUpdatedAtRaw) : null;
        return {
          id: String(row.id ?? ""),
          nickname: String(row.nickname ?? ""),
          isActive: Boolean(row.is_active ?? row.isActive),
          roleScope: normalizeCollectionNicknameRoleScope(row.role_scope ?? row.roleScope),
          mustChangePassword: Boolean(row.must_change_password ?? row.mustChangePassword ?? true),
          passwordResetBySuperuser: Boolean(row.password_reset_by_superuser ?? row.passwordResetBySuperuser ?? false),
          nicknamePasswordHash: row.nickname_password_hash ?? row.nicknamePasswordHash ?? null,
          passwordUpdatedAt
        };
      }
      mapCollectionAdminUserRow(row) {
        const createdAtRaw = row.created_at ?? row.createdAt;
        const createdAt = createdAtRaw instanceof Date ? createdAtRaw : new Date(createdAtRaw ?? Date.now());
        const updatedAtRaw = row.updated_at ?? row.updatedAt;
        const updatedAt = updatedAtRaw instanceof Date ? updatedAtRaw : new Date(updatedAtRaw ?? Date.now());
        return {
          id: String(row.id ?? ""),
          username: String(row.username ?? ""),
          role: "admin",
          isBanned: row.is_banned ?? row.isBanned ?? null,
          createdAt,
          updatedAt
        };
      }
      mapCollectionAdminGroupRow(row, nicknameIdByLowerName) {
        const createdAtRaw = row.created_at ?? row.createdAt;
        const createdAt = createdAtRaw instanceof Date ? createdAtRaw : new Date(createdAtRaw ?? Date.now());
        const updatedAtRaw = row.updated_at ?? row.updatedAt;
        const updatedAt = updatedAtRaw instanceof Date ? updatedAtRaw : new Date(updatedAtRaw ?? Date.now());
        const rawMembers = Array.isArray(row.member_nicknames) ? row.member_nicknames : Array.isArray(row.memberNicknames) ? row.memberNicknames : [];
        const memberNicknames = Array.from(new Set(
          rawMembers.map((value) => String(value ?? "").trim()).filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, void 0, { sensitivity: "base" }));
        const memberNicknameIds = memberNicknames.map((name) => nicknameIdByLowerName.get(name.toLowerCase()) || "").filter(Boolean);
        return {
          id: String(row.id ?? ""),
          leaderNickname: String(row.leader_nickname ?? row.leaderNickname ?? ""),
          leaderNicknameId: row.leader_nickname_id || row.leaderNicknameId ? String(row.leader_nickname_id ?? row.leaderNicknameId) : null,
          leaderIsActive: Boolean(row.leader_is_active ?? row.leaderIsActive ?? false),
          leaderRoleScope: row.leader_role_scope ? normalizeCollectionNicknameRoleScope(row.leader_role_scope) : row.leaderRoleScope ? normalizeCollectionNicknameRoleScope(row.leaderRoleScope) : null,
          memberNicknames,
          memberNicknameIds,
          createdBy: row.created_by ?? row.createdBy ?? null,
          createdAt,
          updatedAt
        };
      }
      mapCollectionNicknameSessionRow(row) {
        const verifiedAtRaw = row.verified_at ?? row.verifiedAt;
        const updatedAtRaw = row.updated_at ?? row.updatedAt;
        return {
          activityId: String(row.activity_id ?? row.activityId ?? ""),
          username: String(row.username ?? ""),
          userRole: String(row.user_role ?? row.userRole ?? ""),
          nickname: String(row.nickname ?? ""),
          verifiedAt: verifiedAtRaw instanceof Date ? verifiedAtRaw : new Date(verifiedAtRaw ?? Date.now()),
          updatedAt: updatedAtRaw instanceof Date ? updatedAtRaw : new Date(updatedAtRaw ?? Date.now())
        };
      }
      mapCollectionRecordRow(row) {
        const paymentDateRaw = row.payment_date ?? row.paymentDate;
        const paymentDate = typeof paymentDateRaw === "string" ? paymentDateRaw.slice(0, 10) : paymentDateRaw instanceof Date ? paymentDateRaw.toISOString().slice(0, 10) : "";
        const createdAtRaw = row.created_at ?? row.createdAt;
        const createdAt = createdAtRaw instanceof Date ? createdAtRaw : new Date(createdAtRaw ?? Date.now());
        return {
          id: String(row.id),
          customerName: String(row.customer_name ?? row.customerName ?? ""),
          icNumber: String(row.ic_number ?? row.icNumber ?? ""),
          customerPhone: String(row.customer_phone ?? row.customerPhone ?? ""),
          accountNumber: String(row.account_number ?? row.accountNumber ?? ""),
          batch: String(row.batch ?? ""),
          paymentDate,
          amount: String(row.amount ?? "0"),
          receiptFile: row.receipt_file ?? row.receiptFile ?? null,
          createdByLogin: String(row.created_by_login ?? row.createdByLogin ?? row.staff_username ?? row.staffUsername ?? ""),
          collectionStaffNickname: String(row.collection_staff_nickname ?? row.collectionStaffNickname ?? row.staff_username ?? row.staffUsername ?? ""),
          createdAt
        };
      }
      async getCollectionStaffNicknames(filters) {
        const conditions = [];
        if (filters?.activeOnly === true) {
          conditions.push(sql11`is_active = true`);
        }
        if (filters?.allowedRole === "admin") {
          conditions.push(sql11`role_scope IN ('admin', 'both')`);
        } else if (filters?.allowedRole === "user") {
          conditions.push(sql11`role_scope IN ('user', 'both')`);
        }
        const whereSql = conditions.length > 0 ? sql11`WHERE ${sql11.join(conditions, sql11` AND `)}` : sql11``;
        const result = await db.execute(sql11`
      SELECT
        id,
        nickname,
        is_active,
        role_scope,
        created_by,
        created_at
      FROM public.collection_staff_nicknames
      ${whereSql}
      ORDER BY is_active DESC, lower(nickname) ASC
      LIMIT 1000
    `);
        return (result.rows || []).map((row) => this.mapCollectionStaffNicknameRow(row));
      }
      async getCollectionAdminUsers() {
        const result = await db.execute(sql11`
      SELECT
        id,
        username,
        role,
        is_banned,
        created_at,
        updated_at
      FROM public.users
      WHERE role = 'admin'
      ORDER BY lower(username) ASC
      LIMIT 1000
    `);
        return (result.rows || []).map((row) => this.mapCollectionAdminUserRow(row));
      }
      async getCollectionAdminUserById(adminUserId) {
        const normalized = String(adminUserId || "").trim();
        if (!normalized) return void 0;
        const result = await db.execute(sql11`
      SELECT
        id,
        username,
        role,
        is_banned,
        created_at,
        updated_at
      FROM public.users
      WHERE id = ${normalized}
        AND role = 'admin'
      LIMIT 1
    `);
        const row = result.rows?.[0];
        if (!row) return void 0;
        return this.mapCollectionAdminUserRow(row);
      }
      async getCollectionAdminAssignedNicknameIds(adminUserId) {
        const normalized = String(adminUserId || "").trim();
        if (!normalized) return [];
        const result = await db.execute(sql11`
      SELECT avn.nickname_id
      FROM public.admin_visible_nicknames avn
      WHERE avn.admin_user_id = ${normalized}
      ORDER BY avn.nickname_id ASC
      LIMIT 5000
    `);
        return (result.rows || []).map((row) => String(row.nickname_id || "").trim()).filter(Boolean);
      }
      async getCollectionAdminVisibleNicknames(adminUserId, filters) {
        const normalized = String(adminUserId || "").trim();
        if (!normalized) return [];
        const conditions = [sql11`avn.admin_user_id = ${normalized}`];
        if (filters?.activeOnly === true) {
          conditions.push(sql11`n.is_active = true`);
        }
        if (filters?.allowedRole === "admin") {
          conditions.push(sql11`n.role_scope IN ('admin', 'both')`);
        } else if (filters?.allowedRole === "user") {
          conditions.push(sql11`n.role_scope IN ('user', 'both')`);
        }
        const whereSql = sql11`WHERE ${sql11.join(conditions, sql11` AND `)}`;
        const result = await db.execute(sql11`
      SELECT
        n.id,
        n.nickname,
        n.is_active,
        n.role_scope,
        n.created_by,
        n.created_at
      FROM public.admin_visible_nicknames avn
      INNER JOIN public.collection_staff_nicknames n
        ON n.id = avn.nickname_id
      INNER JOIN public.users u
        ON u.id = avn.admin_user_id
       AND u.role = 'admin'
      ${whereSql}
      ORDER BY n.is_active DESC, lower(n.nickname) ASC
      LIMIT 1000
    `);
        return (result.rows || []).map((row) => this.mapCollectionStaffNicknameRow(row));
      }
      async setCollectionAdminAssignedNicknameIds(params) {
        const adminUserId = String(params.adminUserId || "").trim();
        const createdBySuperuser = String(params.createdBySuperuser || "").trim();
        if (!adminUserId) {
          throw new Error("adminUserId is required.");
        }
        if (!createdBySuperuser) {
          throw new Error("createdBySuperuser is required.");
        }
        const normalizedNicknameIds = Array.isArray(params.nicknameIds) ? params.nicknameIds.map((value) => String(value || "").trim()).filter((value, index, array) => Boolean(value) && array.indexOf(value) === index) : [];
        return db.transaction(async (tx) => {
          const adminCheck = await tx.execute(sql11`
        SELECT id
        FROM public.users
        WHERE id = ${adminUserId}
          AND role = 'admin'
        LIMIT 1
      `);
          if (!adminCheck.rows?.[0]) {
            throw new Error("Admin user not found.");
          }
          let validNicknameIds = [];
          if (normalizedNicknameIds.length > 0) {
            const nicknameSql = sql11.join(
              normalizedNicknameIds.map((value) => sql11`${value}::uuid`),
              sql11`, `
            );
            const validRows = await tx.execute(sql11`
          SELECT id
          FROM public.collection_staff_nicknames
          WHERE id IN (${nicknameSql})
          LIMIT 5000
        `);
            validNicknameIds = (validRows.rows || []).map((row) => String(row.id || "").trim()).filter(Boolean);
            if (validNicknameIds.length !== normalizedNicknameIds.length) {
              throw new Error("Invalid nickname ids.");
            }
          }
          await tx.execute(sql11`
        DELETE FROM public.admin_visible_nicknames
        WHERE admin_user_id = ${adminUserId}
      `);
          for (const nicknameId of validNicknameIds) {
            await tx.execute(sql11`
          INSERT INTO public.admin_visible_nicknames (
            id,
            admin_user_id,
            nickname_id,
            created_by_superuser,
            created_at
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${adminUserId},
            ${nicknameId}::uuid,
            ${createdBySuperuser},
            now()
          )
          ON CONFLICT (admin_user_id, nickname_id) DO NOTHING
        `);
          }
          const assignedRows = await tx.execute(sql11`
        SELECT nickname_id
        FROM public.admin_visible_nicknames
        WHERE admin_user_id = ${adminUserId}
        ORDER BY nickname_id ASC
      `);
          return (assignedRows.rows || []).map((row) => String(row.nickname_id || "").trim()).filter(Boolean);
        });
      }
      async resolveNicknameNamesByIds(tx, nicknameIds) {
        const normalizedIds = Array.isArray(nicknameIds) ? nicknameIds.map((value) => String(value || "").trim()).filter((value, index, array) => Boolean(value) && array.indexOf(value) === index) : [];
        if (!normalizedIds.length) return [];
        const idSql = sql11.join(normalizedIds.map((value) => sql11`${value}::uuid`), sql11`, `);
        const result = await tx.execute(sql11`
      SELECT id, nickname, role_scope, is_active
      FROM public.collection_staff_nicknames
      WHERE id IN (${idSql})
      LIMIT 5000
    `);
        const rows = (result.rows || []).map((row) => ({
          id: String(row.id || "").trim(),
          nickname: String(row.nickname || "").trim(),
          roleScope: normalizeCollectionNicknameRoleScope(row.role_scope),
          isActive: Boolean(row.is_active)
        }));
        if (rows.length !== normalizedIds.length) {
          throw new Error("Invalid nickname ids.");
        }
        return rows;
      }
      async validateAdminGroupComposition(params) {
        const leaderLower = params.leaderNickname.toLowerCase();
        const uniqueMembers = Array.from(new Set(
          params.memberNicknames.map((value) => String(value || "").trim()).filter(Boolean)
        ));
        const memberLower = uniqueMembers.map((value) => value.toLowerCase());
        if (memberLower.includes(leaderLower)) {
          throw new Error("Leader nickname cannot be a member of the same group.");
        }
        const leaderRows = await params.tx.execute(sql11`
      SELECT id
      FROM public.admin_groups
      WHERE lower(leader_nickname) = lower(${params.leaderNickname})
        ${params.groupIdToExclude ? sql11`AND id <> ${params.groupIdToExclude}::uuid` : sql11``}
      LIMIT 1
    `);
        if (leaderRows.rows?.[0]) {
          throw new Error("Leader nickname already assigned.");
        }
        if (!memberLower.length) return;
        const membersSql = sql11.join(memberLower.map((value) => sql11`${value}`), sql11`, `);
        const memberConflict = await params.tx.execute(sql11`
      SELECT member_nickname
      FROM public.admin_group_members
      WHERE lower(member_nickname) IN (${membersSql})
        ${params.groupIdToExclude ? sql11`AND admin_group_id <> ${params.groupIdToExclude}::uuid` : sql11``}
      LIMIT 1
    `);
        if (memberConflict.rows?.[0]) {
          throw new Error("This nickname is already assigned to another admin group.");
        }
        const leaderConflict = await params.tx.execute(sql11`
      SELECT leader_nickname
      FROM public.admin_groups
      WHERE lower(leader_nickname) IN (${membersSql})
        ${params.groupIdToExclude ? sql11`AND id <> ${params.groupIdToExclude}::uuid` : sql11``}
      LIMIT 1
    `);
        if (leaderConflict.rows?.[0]) {
          throw new Error("Group member conflicts with another group leader.");
        }
      }
      async getCollectionAdminGroups() {
        const nicknameRows = await db.execute(sql11`
      SELECT id, nickname
      FROM public.collection_staff_nicknames
      LIMIT 5000
    `);
        const nicknameIdByLowerName = /* @__PURE__ */ new Map();
        for (const row of nicknameRows.rows || []) {
          const nickname = String(row.nickname || "").trim().toLowerCase();
          const id = String(row.id || "").trim();
          if (!nickname || !id || nicknameIdByLowerName.has(nickname)) continue;
          nicknameIdByLowerName.set(nickname, id);
        }
        const result = await db.execute(sql11`
      SELECT
        g.id,
        g.leader_nickname,
        g.created_by,
        g.created_at,
        g.updated_at,
        leader.id AS leader_nickname_id,
        leader.is_active AS leader_is_active,
        leader.role_scope AS leader_role_scope,
        COALESCE(
          array_agg(DISTINCT gm.member_nickname) FILTER (WHERE gm.member_nickname IS NOT NULL),
          ARRAY[]::text[]
        ) AS member_nicknames
      FROM public.admin_groups g
      LEFT JOIN public.collection_staff_nicknames leader
        ON lower(leader.nickname) = lower(g.leader_nickname)
      LEFT JOIN public.admin_group_members gm
        ON gm.admin_group_id = g.id
      GROUP BY
        g.id,
        g.leader_nickname,
        g.created_by,
        g.created_at,
        g.updated_at,
        leader.id,
        leader.is_active,
        leader.role_scope
      ORDER BY lower(g.leader_nickname) ASC
      LIMIT 5000
    `);
        return (result.rows || []).map((row) => this.mapCollectionAdminGroupRow(row, nicknameIdByLowerName));
      }
      async getCollectionAdminGroupById(groupId) {
        const normalizedGroupId = String(groupId || "").trim();
        if (!normalizedGroupId) return void 0;
        const groups = await this.getCollectionAdminGroups();
        return groups.find((item) => item.id === normalizedGroupId);
      }
      async createCollectionAdminGroup(params) {
        const createdBy = String(params.createdBy || "").trim();
        if (!createdBy) {
          throw new Error("createdBy is required.");
        }
        const createdGroupId = await db.transaction(async (tx) => {
          const leaderRows = await this.resolveNicknameNamesByIds(tx, [params.leaderNicknameId]);
          const leader = leaderRows[0];
          if (!leader || !leader.nickname) {
            throw new Error("Invalid leader nickname.");
          }
          if (!(leader.roleScope === "admin" || leader.roleScope === "both")) {
            throw new Error("Leader nickname must have admin scope.");
          }
          if (!leader.isActive) {
            throw new Error("Leader nickname must be active.");
          }
          const memberRows = await this.resolveNicknameNamesByIds(tx, params.memberNicknameIds || []);
          const memberNicknames = memberRows.map((item) => item.nickname).filter(Boolean);
          await this.validateAdminGroupComposition({
            tx,
            leaderNickname: leader.nickname,
            memberNicknames
          });
          const groupId = randomUUID();
          await tx.execute(sql11`
        INSERT INTO public.admin_groups (
          id,
          leader_nickname,
          created_by,
          created_at,
          updated_at
        )
        VALUES (
          ${groupId}::uuid,
          ${leader.nickname},
          ${createdBy},
          now(),
          now()
        )
      `);
          for (const memberNickname of memberNicknames) {
            if (!memberNickname || memberNickname.toLowerCase() === leader.nickname.toLowerCase()) continue;
            await tx.execute(sql11`
          INSERT INTO public.admin_group_members (
            id,
            admin_group_id,
            member_nickname,
            created_at
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${groupId}::uuid,
            ${memberNickname},
            now()
          )
          ON CONFLICT DO NOTHING
        `);
          }
          return groupId;
        });
        const created = await this.getCollectionAdminGroupById(createdGroupId);
        if (!created) {
          throw new Error("Failed to create admin group.");
        }
        return created;
      }
      async updateCollectionAdminGroup(params) {
        const groupId = String(params.groupId || "").trim();
        const updatedBy = String(params.updatedBy || "").trim();
        if (!groupId) {
          throw new Error("groupId is required.");
        }
        if (!updatedBy) {
          throw new Error("updatedBy is required.");
        }
        const updatedGroupId = await db.transaction(async (tx) => {
          const existingRow = await tx.execute(sql11`
        SELECT id, leader_nickname
        FROM public.admin_groups
        WHERE id = ${groupId}::uuid
        LIMIT 1
      `);
          const existing = existingRow.rows?.[0];
          if (!existing) {
            return null;
          }
          let leaderNickname = String(existing.leader_nickname || "").trim();
          if (params.leaderNicknameId) {
            const leaderRows = await this.resolveNicknameNamesByIds(tx, [params.leaderNicknameId]);
            const leader = leaderRows[0];
            if (!leader || !leader.nickname) {
              throw new Error("Invalid leader nickname.");
            }
            if (!(leader.roleScope === "admin" || leader.roleScope === "both")) {
              throw new Error("Leader nickname must have admin scope.");
            }
            if (!leader.isActive) {
              throw new Error("Leader nickname must be active.");
            }
            leaderNickname = leader.nickname;
          }
          let memberNicknames = [];
          if (params.memberNicknameIds !== void 0) {
            const memberRows = await this.resolveNicknameNamesByIds(tx, params.memberNicknameIds || []);
            memberNicknames = memberRows.map((item) => item.nickname).filter(Boolean);
          } else {
            const existingMembers = await tx.execute(sql11`
          SELECT member_nickname
          FROM public.admin_group_members
          WHERE admin_group_id = ${groupId}::uuid
          LIMIT 5000
        `);
            memberNicknames = (existingMembers.rows || []).map((row) => String(row.member_nickname || "").trim()).filter(Boolean);
          }
          await this.validateAdminGroupComposition({
            tx,
            groupIdToExclude: groupId,
            leaderNickname,
            memberNicknames
          });
          await tx.execute(sql11`
        UPDATE public.admin_groups
        SET
          leader_nickname = ${leaderNickname},
          created_by = COALESCE(NULLIF(trim(COALESCE(created_by, '')), ''), ${updatedBy}),
          updated_at = now()
        WHERE id = ${groupId}::uuid
      `);
          await tx.execute(sql11`
        DELETE FROM public.admin_group_members
        WHERE admin_group_id = ${groupId}::uuid
      `);
          for (const memberNickname of memberNicknames) {
            if (!memberNickname || memberNickname.toLowerCase() === leaderNickname.toLowerCase()) continue;
            await tx.execute(sql11`
          INSERT INTO public.admin_group_members (
            id,
            admin_group_id,
            member_nickname,
            created_at
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${groupId}::uuid,
            ${memberNickname},
            now()
          )
          ON CONFLICT DO NOTHING
        `);
          }
          return groupId;
        });
        if (!updatedGroupId) return void 0;
        return this.getCollectionAdminGroupById(updatedGroupId);
      }
      async deleteCollectionAdminGroup(groupId) {
        const normalizedGroupId = String(groupId || "").trim();
        if (!normalizedGroupId) return false;
        return db.transaction(async (tx) => {
          await tx.execute(sql11`
        DELETE FROM public.admin_group_members
        WHERE admin_group_id = ${normalizedGroupId}::uuid
      `);
          const result = await tx.execute(sql11`
        DELETE FROM public.admin_groups
        WHERE id = ${normalizedGroupId}::uuid
        RETURNING id
      `);
          return Boolean(result.rows?.[0]);
        });
      }
      async getCollectionAdminGroupVisibleNicknameValuesByLeader(leaderNickname) {
        const normalizedLeader = String(leaderNickname || "").trim();
        if (!normalizedLeader) return [];
        const rows = await db.execute(sql11`
      SELECT
        g.leader_nickname,
        COALESCE(
          array_agg(DISTINCT gm.member_nickname) FILTER (WHERE gm.member_nickname IS NOT NULL),
          ARRAY[]::text[]
        ) AS member_nicknames
      FROM public.admin_groups g
      LEFT JOIN public.admin_group_members gm
        ON gm.admin_group_id = g.id
      WHERE lower(g.leader_nickname) = lower(${normalizedLeader})
      GROUP BY g.id, g.leader_nickname
      LIMIT 1
    `);
        const row = rows.rows?.[0];
        if (!row) {
          return [normalizedLeader];
        }
        const members = Array.isArray(row.member_nicknames) ? row.member_nicknames.map((value) => String(value || "").trim()).filter(Boolean) : [];
        const uniqueMembers = Array.from(new Set(members.filter((value) => value.toLowerCase() !== normalizedLeader.toLowerCase()))).sort((a, b) => a.localeCompare(b, void 0, { sensitivity: "base" }));
        return [String(row.leader_nickname || normalizedLeader).trim(), ...uniqueMembers];
      }
      async setCollectionNicknameSession(params) {
        const activityId = String(params.activityId || "").trim();
        const username = String(params.username || "").trim();
        const userRole = String(params.userRole || "").trim();
        const nickname = String(params.nickname || "").trim();
        if (!activityId || !username || !userRole || !nickname) {
          throw new Error("Invalid collection nickname session payload.");
        }
        await db.execute(sql11`
      INSERT INTO public.collection_nickname_sessions (
        activity_id,
        username,
        user_role,
        nickname,
        verified_at,
        updated_at
      )
      VALUES (
        ${activityId},
        ${username},
        ${userRole},
        ${nickname},
        now(),
        now()
      )
      ON CONFLICT (activity_id) DO UPDATE
      SET
        username = EXCLUDED.username,
        user_role = EXCLUDED.user_role,
        nickname = EXCLUDED.nickname,
        updated_at = now()
    `);
      }
      async getCollectionNicknameSessionByActivity(activityId) {
        const normalizedActivityId = String(activityId || "").trim();
        if (!normalizedActivityId) return void 0;
        const result = await db.execute(sql11`
      SELECT
        activity_id,
        username,
        user_role,
        nickname,
        verified_at,
        updated_at
      FROM public.collection_nickname_sessions
      WHERE activity_id = ${normalizedActivityId}
      LIMIT 1
    `);
        const row = result.rows?.[0];
        if (!row) return void 0;
        return this.mapCollectionNicknameSessionRow(row);
      }
      async clearCollectionNicknameSessionByActivity(activityId) {
        const normalizedActivityId = String(activityId || "").trim();
        if (!normalizedActivityId) return;
        await db.execute(sql11`
      DELETE FROM public.collection_nickname_sessions
      WHERE activity_id = ${normalizedActivityId}
    `);
      }
      async getCollectionStaffNicknameById(id) {
        const result = await db.execute(sql11`
      SELECT
        id,
        nickname,
        is_active,
        role_scope,
        created_by,
        created_at
      FROM public.collection_staff_nicknames
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
        const row = result.rows?.[0];
        if (!row) return void 0;
        return this.mapCollectionStaffNicknameRow(row);
      }
      async getCollectionStaffNicknameByName(nickname) {
        const normalized = String(nickname || "").trim();
        if (!normalized) return void 0;
        const result = await db.execute(sql11`
      SELECT
        id,
        nickname,
        is_active,
        role_scope,
        created_by,
        created_at
      FROM public.collection_staff_nicknames
      WHERE lower(nickname) = lower(${normalized})
      LIMIT 1
    `);
        const row = result.rows?.[0];
        if (!row) return void 0;
        return this.mapCollectionStaffNicknameRow(row);
      }
      async getCollectionNicknameAuthProfileByName(nickname) {
        const normalized = String(nickname || "").trim();
        if (!normalized) return void 0;
        const result = await db.execute(sql11`
      SELECT
        id,
        nickname,
        is_active,
        role_scope,
        nickname_password_hash,
        must_change_password,
        password_reset_by_superuser,
        password_updated_at
      FROM public.collection_staff_nicknames
      WHERE lower(nickname) = lower(${normalized})
      LIMIT 1
    `);
        const row = result.rows?.[0];
        if (!row) return void 0;
        return this.mapCollectionNicknameAuthProfileRow(row);
      }
      async setCollectionNicknamePassword(params) {
        const nicknameId = String(params.nicknameId || "").trim();
        const passwordHash = String(params.passwordHash || "").trim();
        const mustChangePassword = params.mustChangePassword ?? false;
        const passwordResetBySuperuser = params.passwordResetBySuperuser ?? false;
        const passwordUpdatedAt = params.passwordUpdatedAt ?? /* @__PURE__ */ new Date();
        if (!nicknameId) {
          throw new Error("nicknameId is required.");
        }
        if (!passwordHash) {
          throw new Error("passwordHash is required.");
        }
        await db.execute(sql11`
      UPDATE public.collection_staff_nicknames
      SET
        nickname_password_hash = ${passwordHash},
        must_change_password = ${mustChangePassword},
        password_reset_by_superuser = ${passwordResetBySuperuser},
        password_updated_at = ${passwordUpdatedAt}
      WHERE id = ${nicknameId}::uuid
    `);
      }
      async createCollectionStaffNickname(data) {
        const result = await db.execute(sql11`
      INSERT INTO public.collection_staff_nicknames (
        id,
        nickname,
        is_active,
        role_scope,
        nickname_password_hash,
        must_change_password,
        password_reset_by_superuser,
        password_updated_at,
        created_by,
        created_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${data.nickname},
        true,
        ${normalizeCollectionNicknameRoleScope(data.roleScope)},
        NULL,
        true,
        false,
        NULL,
        ${data.createdBy},
        now()
      )
      RETURNING
        id,
        nickname,
        is_active,
        role_scope,
        created_by,
        created_at
    `);
        return this.mapCollectionStaffNicknameRow(result.rows[0]);
      }
      async updateCollectionStaffNickname(id, data) {
        const existing = await this.getCollectionStaffNicknameById(id);
        if (!existing) return void 0;
        const updates = [];
        if (data.nickname !== void 0) {
          updates.push(sql11`nickname = ${data.nickname}`);
        }
        if (data.isActive !== void 0) {
          updates.push(sql11`is_active = ${data.isActive}`);
        }
        if (data.roleScope !== void 0) {
          updates.push(sql11`role_scope = ${normalizeCollectionNicknameRoleScope(data.roleScope)}`);
        }
        if (!updates.length) {
          return existing;
        }
        return db.transaction(async (tx) => {
          const result = await tx.execute(sql11`
        UPDATE public.collection_staff_nicknames
        SET ${sql11.join(updates, sql11`, `)}
        WHERE id = ${id}::uuid
        RETURNING
          id,
          nickname,
          is_active,
          role_scope,
          created_by,
          created_at
      `);
          const row = result.rows?.[0];
          if (!row) return void 0;
          const updated = this.mapCollectionStaffNicknameRow(row);
          const oldNickname = String(existing.nickname || "").trim();
          const newNickname = String(updated.nickname || "").trim();
          if (oldNickname && newNickname && oldNickname.toLowerCase() !== newNickname.toLowerCase()) {
            await tx.execute(sql11`
          UPDATE public.admin_groups
          SET
            leader_nickname = ${newNickname},
            updated_at = now()
          WHERE lower(leader_nickname) = lower(${oldNickname})
        `);
            await tx.execute(sql11`
          UPDATE public.admin_group_members
          SET member_nickname = ${newNickname}
          WHERE lower(member_nickname) = lower(${oldNickname})
        `);
            await tx.execute(sql11`
          UPDATE public.collection_nickname_sessions
          SET
            nickname = ${newNickname},
            updated_at = now()
          WHERE lower(nickname) = lower(${oldNickname})
        `);
          }
          return updated;
        });
      }
      async deleteCollectionStaffNickname(id) {
        const existing = await this.getCollectionStaffNicknameById(id);
        if (!existing) {
          return { deleted: false, deactivated: false };
        }
        const usage = await db.execute(sql11`
      SELECT COUNT(*)::int AS total
      FROM public.collection_records
      WHERE lower(collection_staff_nickname) = lower(${existing.nickname})
      LIMIT 1
    `);
        const total = Number(usage.rows?.[0]?.total ?? 0);
        if (total > 0) {
          await db.execute(sql11`
        UPDATE public.collection_staff_nicknames
        SET is_active = false
        WHERE id = ${id}::uuid
      `);
          return { deleted: false, deactivated: true };
        }
        await db.execute(sql11`
      DELETE FROM public.admin_visible_nicknames
      WHERE nickname_id = ${id}::uuid
    `);
        await db.execute(sql11`
      DELETE FROM public.admin_group_members
      WHERE lower(member_nickname) = lower(${existing.nickname})
    `);
        await db.execute(sql11`
      DELETE FROM public.admin_groups
      WHERE lower(leader_nickname) = lower(${existing.nickname})
    `);
        await db.execute(sql11`
      DELETE FROM public.collection_nickname_sessions
      WHERE lower(nickname) = lower(${existing.nickname})
    `);
        await db.execute(sql11`
      DELETE FROM public.collection_staff_nicknames
      WHERE id = ${id}::uuid
    `);
        return { deleted: true, deactivated: false };
      }
      async isCollectionStaffNicknameActive(nickname) {
        const normalized = String(nickname || "").trim();
        if (!normalized) return false;
        const result = await db.execute(sql11`
      SELECT id
      FROM public.collection_staff_nicknames
      WHERE lower(nickname) = lower(${normalized})
        AND is_active = true
      LIMIT 1
    `);
        return Boolean(result.rows?.[0]);
      }
      async createCollectionRecord(data) {
        const id = randomUUID();
        const result = await db.execute(sql11`
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
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at
      )
      VALUES (
        ${id}::uuid,
        ${data.customerName},
        ${data.icNumber},
        ${data.customerPhone},
        ${data.accountNumber},
        ${data.batch},
        ${data.paymentDate}::date,
        ${data.amount},
        ${data.receiptFile ?? null},
        ${data.createdByLogin},
        ${data.collectionStaffNickname},
        ${data.collectionStaffNickname},
        now()
      )
      RETURNING
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at
    `);
        return this.mapCollectionRecordRow(result.rows[0]);
      }
      async listCollectionRecords(filters) {
        const conditions = [];
        if (filters?.from) {
          conditions.push(sql11`payment_date >= ${filters.from}::date`);
        }
        if (filters?.to) {
          conditions.push(sql11`payment_date <= ${filters.to}::date`);
        }
        const search = String(filters?.search || "").trim();
        if (search) {
          const like = `%${search}%`;
          conditions.push(sql11`(
        customer_name ILIKE ${like}
        OR ic_number ILIKE ${like}
        OR account_number ILIKE ${like}
        OR customer_phone ILIKE ${like}
        OR amount::text ILIKE ${like}
      )`);
        }
        const createdByLogin = String(filters?.createdByLogin || "").trim();
        if (createdByLogin) {
          conditions.push(sql11`created_by_login = ${createdByLogin}`);
        }
        const nicknameSource = filters?.nicknames;
        const nicknames = Array.isArray(nicknameSource) ? nicknameSource.map((value) => String(value || "").trim().toLowerCase()).filter((value, index, array) => Boolean(value) && array.indexOf(value) === index) : [];
        if (nicknames.length > 0) {
          const nicknameSql = sql11.join(nicknames.map((value) => sql11`${value}`), sql11`, `);
          conditions.push(sql11`lower(collection_staff_nickname) IN (${nicknameSql})`);
        }
        const whereSql = conditions.length ? sql11`WHERE ${sql11.join(conditions, sql11` AND `)}` : sql11``;
        const parsedLimit = Number(filters?.limit);
        const safeLimit = Number.isFinite(parsedLimit) ? Math.min(2e3, Math.max(1, Math.floor(parsedLimit))) : 500;
        const result = await db.execute(sql11`
      SELECT
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at
      FROM public.collection_records
      ${whereSql}
      ORDER BY payment_date DESC, created_at DESC
      LIMIT ${safeLimit}
    `);
        return (result.rows || []).map((row) => this.mapCollectionRecordRow(row));
      }
      async getCollectionMonthlySummary(filters) {
        const safeYear = Number.isFinite(filters.year) ? Math.min(2100, Math.max(2e3, Math.floor(filters.year))) : (/* @__PURE__ */ new Date()).getFullYear();
        const yearStart = `${safeYear}-01-01`;
        const yearEnd = `${safeYear}-12-31`;
        const createdByLogin = String(filters.createdByLogin || "").trim();
        const nicknameSource = filters.nicknames;
        const nicknames = Array.isArray(nicknameSource) ? nicknameSource.map((value) => String(value || "").trim().toLowerCase()).filter((value, index, array) => Boolean(value) && array.indexOf(value) === index) : [];
        const conditions = [
          sql11`payment_date >= ${yearStart}::date`,
          sql11`payment_date <= ${yearEnd}::date`
        ];
        if (nicknames.length > 0) {
          const nicknameSql = sql11.join(nicknames.map((value) => sql11`${value}`), sql11`, `);
          conditions.push(sql11`lower(collection_staff_nickname) IN (${nicknameSql})`);
        }
        if (createdByLogin) {
          conditions.push(sql11`created_by_login = ${createdByLogin}`);
        }
        const whereSql = sql11`WHERE ${sql11.join(conditions, sql11` AND `)}`;
        const result = await db.execute(sql11`
      SELECT
        EXTRACT(MONTH FROM payment_date)::int AS month,
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      ${whereSql}
      GROUP BY 1
      ORDER BY 1
      LIMIT 12
    `);
        const byMonth = /* @__PURE__ */ new Map();
        for (const row of result.rows || []) {
          const month = Number(row.month ?? 0);
          if (!Number.isFinite(month) || month < 1 || month > 12) continue;
          byMonth.set(month, {
            totalRecords: Number(row.total_records ?? 0),
            totalAmount: Number(row.total_amount ?? 0)
          });
        }
        return COLLECTION_MONTH_NAMES.map((monthName, index) => {
          const month = index + 1;
          const data = byMonth.get(month);
          return {
            month,
            monthName,
            totalRecords: data?.totalRecords ?? 0,
            totalAmount: data?.totalAmount ?? 0
          };
        });
      }
      async getCollectionRecordById(id) {
        const result = await db.execute(sql11`
      SELECT
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at
      FROM public.collection_records
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
        const row = result.rows?.[0];
        if (!row) return void 0;
        return this.mapCollectionRecordRow(row);
      }
      async updateCollectionRecord(id, data) {
        const updateChunks = [];
        if (data.customerName !== void 0) {
          updateChunks.push(sql11`customer_name = ${data.customerName}`);
        }
        if (data.icNumber !== void 0) {
          updateChunks.push(sql11`ic_number = ${data.icNumber}`);
        }
        if (data.customerPhone !== void 0) {
          updateChunks.push(sql11`customer_phone = ${data.customerPhone}`);
        }
        if (data.accountNumber !== void 0) {
          updateChunks.push(sql11`account_number = ${data.accountNumber}`);
        }
        if (data.batch !== void 0) {
          updateChunks.push(sql11`batch = ${data.batch}`);
        }
        if (data.paymentDate !== void 0) {
          updateChunks.push(sql11`payment_date = ${data.paymentDate}::date`);
        }
        if (data.amount !== void 0) {
          updateChunks.push(sql11`amount = ${data.amount}`);
        }
        if (Object.prototype.hasOwnProperty.call(data, "receiptFile")) {
          updateChunks.push(sql11`receipt_file = ${data.receiptFile ?? null}`);
        }
        if (data.collectionStaffNickname !== void 0) {
          updateChunks.push(sql11`collection_staff_nickname = ${data.collectionStaffNickname}`);
          updateChunks.push(sql11`staff_username = ${data.collectionStaffNickname}`);
        }
        if (!updateChunks.length) {
          return this.getCollectionRecordById(id);
        }
        const result = await db.execute(sql11`
      UPDATE public.collection_records
      SET ${sql11.join(updateChunks, sql11`, `)}
      WHERE id = ${id}::uuid
      RETURNING
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at
    `);
        const row = result.rows?.[0];
        if (!row) return void 0;
        return this.mapCollectionRecordRow(row);
      }
      async deleteCollectionRecord(id) {
        await db.execute(sql11`DELETE FROM public.collection_records WHERE id = ${id}::uuid`);
        return true;
      }
    };
  }
});

// server/repositories/settings.repository.ts
import { sql as sql12 } from "drizzle-orm";
var TRUTHY_SETTING_VALUES, SettingsRepository;
var init_settings_repository = __esm({
  "server/repositories/settings.repository.ts"() {
    "use strict";
    init_db_postgres();
    init_system_settings();
    TRUTHY_SETTING_VALUES = /* @__PURE__ */ new Set(["true", "1", "yes", "on"]);
    SettingsRepository = class {
      parseSettingType(raw) {
        const normalized = String(raw || "text").toLowerCase();
        if (normalized === "number" || normalized === "boolean" || normalized === "select" || normalized === "timestamp") {
          return normalized;
        }
        return "text";
      }
      normalizeSettingValue(type, value) {
        if (value === null || value === void 0) {
          return type === "timestamp" ? "" : null;
        }
        if (type === "boolean") {
          if (typeof value === "boolean") return value ? "true" : "false";
          const normalized = String(value).trim().toLowerCase();
          if (TRUTHY_SETTING_VALUES.has(normalized)) return "true";
          if (["false", "0", "no", "off"].includes(normalized)) return "false";
          return null;
        }
        if (type === "number") {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) return null;
          return String(numeric);
        }
        if (type === "timestamp") {
          const normalized = String(value).trim();
          if (!normalized) return "";
          const parsed = new Date(normalized);
          if (Number.isNaN(parsed.getTime())) return null;
          return parsed.toISOString();
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
        const result = await db.execute(sql12`
      SELECT value
      FROM public.system_settings
      WHERE key = 'admin_can_edit_maintenance_message'
      LIMIT 1
    `);
        const row = result.rows[0];
        return TRUTHY_SETTING_VALUES.has(String(row?.value ?? "").trim().toLowerCase());
      }
      async getSettingsForRole(role) {
        const rows = await db.execute(sql12`
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
        const settingIds = rows.rows.map((row) => String(row.setting_id)).filter((value) => value.length > 0);
        const optionsMap = /* @__PURE__ */ new Map();
        if (settingIds.length > 0) {
          const quoted = settingIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
          const optionsRows = await db.execute(sql12`
        SELECT DISTINCT ON (setting_id, value) setting_id, value, label
        FROM public.setting_options
        WHERE setting_id IN (${sql12.raw(quoted)})
        ORDER BY setting_id, value, label
      `);
          const seenOptionsBySetting = /* @__PURE__ */ new Map();
          for (const row of optionsRows.rows) {
            const settingId = String(row.setting_id);
            const optionValue = String(row.value);
            const seenOptions = seenOptionsBySetting.get(settingId) || /* @__PURE__ */ new Set();
            if (seenOptions.has(optionValue)) continue;
            seenOptions.add(optionValue);
            seenOptionsBySetting.set(settingId, seenOptions);
            const options = optionsMap.get(settingId) || [];
            options.push({ value: optionValue, label: String(row.label) });
            optionsMap.set(settingId, options);
          }
        }
        const adminMaintenanceEditingEnabled = role === "admin" ? await this.isAdminMaintenanceEditingEnabled() : true;
        const categories = /* @__PURE__ */ new Map();
        for (const row of rows.rows) {
          const categoryId = String(row.category_id);
          if (!categories.has(categoryId)) {
            categories.set(categoryId, {
              id: categoryId,
              name: String(row.category_name),
              description: row.category_description ? String(row.category_description) : null,
              settings: []
            });
          }
          const key = String(row.key);
          const canEditFromPermission = row.can_edit === true;
          const canEdit = role === "admin" && this.isAdminMaintenanceEditableKey(key) && !adminMaintenanceEditingEnabled ? false : canEditFromPermission;
          categories.get(categoryId).settings.push({
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
        return Array.from(categories.values());
      }
      async getBooleanSystemSetting(key, fallback = false) {
        const result = await db.execute(sql12`
      SELECT value
      FROM public.system_settings
      WHERE key = ${key}
      LIMIT 1
    `);
        const row = result.rows[0];
        if (!row) return fallback;
        const normalized = String(row.value ?? "").trim().toLowerCase();
        if (!normalized) return fallback;
        return TRUTHY_SETTING_VALUES.has(normalized);
      }
      async getRoleTabVisibility(role) {
        if (role === "superuser") {
          return {};
        }
        const roleKey = role === "admin" ? "admin" : role === "user" ? "user" : null;
        if (!roleKey) {
          return {};
        }
        const tabs = ROLE_TAB_SETTINGS[roleKey];
        const visibility = {};
        for (const tab of tabs) {
          visibility[tab.pageId] = tab.defaultEnabled;
        }
        const keys = tabs.map((tab) => roleTabSettingKey(roleKey, tab.suffix));
        if (keys.length === 0) {
          return visibility;
        }
        const keyList = keys.map((key) => `'${key.replace(/'/g, "''")}'`).join(",");
        const rows = await db.execute(sql12`
      SELECT key, value
      FROM public.system_settings
      WHERE key IN (${sql12.raw(keyList)})
    `);
        const pageIdByKey = /* @__PURE__ */ new Map();
        for (const tab of tabs) {
          pageIdByKey.set(roleTabSettingKey(roleKey, tab.suffix), tab.pageId);
        }
        for (const row of rows.rows) {
          const key = String(row.key || "");
          const pageId = pageIdByKey.get(key);
          if (!pageId) continue;
          visibility[pageId] = TRUTHY_SETTING_VALUES.has(String(row.value ?? "").trim().toLowerCase());
        }
        if (roleKey === "admin") {
          const result = await db.execute(sql12`
        SELECT value
        FROM public.system_settings
        WHERE key = 'canViewSystemPerformance'
        LIMIT 1
      `);
          const canViewSystemPerformance = TRUTHY_SETTING_VALUES.has(
            String(result.rows[0]?.value ?? "").trim().toLowerCase()
          );
          visibility.canViewSystemPerformance = canViewSystemPerformance;
          visibility.monitor = visibility.monitor === true && canViewSystemPerformance;
        }
        return visibility;
      }
      async updateSystemSetting(params) {
        const settingRes = await db.execute(sql12`
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
          const optionRes = await db.execute(sql12`
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
        await db.execute(sql12`
      UPDATE public.system_settings
      SET value = ${nextValue}, updated_at = now()
      WHERE id = ${current.id}
    `);
        await db.execute(sql12`
      INSERT INTO public.setting_versions (setting_key, old_value, new_value, changed_by, changed_at)
      VALUES (${params.settingKey}, ${previousValue}, ${nextValue}, ${params.updatedBy}, now())
    `);
        const latestRes = await db.execute(sql12`
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
        return {
          status: "updated",
          message: "Setting updated successfully.",
          shouldBroadcast: String(params.settingKey).startsWith("maintenance_"),
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
        const rows = await db.execute(sql12`
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
        const values = /* @__PURE__ */ new Map();
        for (const row of rows.rows) {
          values.set(String(row.key), String(row.value ?? ""));
        }
        const baseEnabled = TRUTHY_SETTING_VALUES.has((values.get("maintenance_mode") || "false").toLowerCase());
        const type = (values.get("maintenance_type") || "soft").toLowerCase() === "hard" ? "hard" : "soft";
        const message = values.get("maintenance_message") || "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.";
        const startTime = (values.get("maintenance_start_time") || "").trim() || null;
        const endTime = (values.get("maintenance_end_time") || "").trim() || null;
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
        const result = await db.execute(sql12`
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
        const values = /* @__PURE__ */ new Map();
        for (const row of result.rows) {
          values.set(String(row.key), String(row.value ?? ""));
        }
        const asNumber = (key, fallback, min, max) => {
          const raw = Number(values.get(key) ?? "");
          if (!Number.isFinite(raw)) return fallback;
          return Math.min(max, Math.max(min, Math.floor(raw)));
        };
        const asBool = (key, fallback) => {
          const raw = String(values.get(key) ?? "").trim().toLowerCase();
          if (!raw) return fallback;
          return TRUTHY_SETTING_VALUES.has(raw);
        };
        const systemName = String(values.get("system_name") ?? "").trim() || "SQR System";
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
    };
  }
});

// server/storage-postgres.ts
import { randomUUID as randomUUID2 } from "crypto";
import bcrypt2 from "bcrypt";
import { eq as eq5, and as and3, or, count as count2, sql as sql13, inArray as inArray2 } from "drizzle-orm";
import crypto6 from "crypto";
function detectValueType2(value) {
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
  const column = sql13`json_data_jsonb ->> ${field}`;
  const valueType = detectValueType2(value);
  switch (operator) {
    case "contains":
      return sql13`${column} ILIKE ${"%" + value + "%"}`;
    case "equals":
      return sql13`${column} = ${value}`;
    case "notEquals":
      return sql13`${column} <> ${value}`;
    case "startsWith":
      return sql13`${column} ILIKE ${value + "%"}`;
    case "endsWith":
      return sql13`${column} ILIKE ${"%" + value}`;
    case "greaterThan":
      if (valueType === "number") {
        return sql13`(${column})::numeric > ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql13`(${column})::date > ${value}`;
      }
      return sql13`false`;
    case "lessThan":
      if (valueType === "number") {
        return sql13`(${column})::numeric < ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql13`(${column})::date < ${value}`;
      }
      return sql13`false`;
    case "greaterThanOrEqual":
      if (valueType === "number") {
        return sql13`(${column})::numeric >= ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql13`(${column})::date >= ${value}`;
      }
      return sql13`false`;
    case "lessThanOrEqual":
      if (valueType === "number") {
        return sql13`(${column})::numeric <= ${Number(value)}`;
      }
      if (valueType === "date") {
        return sql13`(${column})::date <= ${value}`;
      }
      return sql13`false`;
  }
}
var MAX_SEARCH_LIMIT2, MAX_COLUMN_KEYS2, STORAGE_DEBUG_LOGS, BCRYPT_COST2, ALLOWED_OPERATORS2, PostgresStorage;
var init_storage_postgres = __esm({
  "server/storage-postgres.ts"() {
    "use strict";
    init_schema_postgres();
    init_db_postgres();
    init_security();
    init_backupsBootstrap();
    init_settingsBootstrap();
    init_spatialBootstrap();
    init_auth_repository();
    init_imports_repository();
    init_search_repository();
    init_activity_repository();
    init_audit_repository();
    init_backups_repository();
    init_analytics_repository();
    init_collection_repository();
    init_settings_repository();
    MAX_SEARCH_LIMIT2 = 200;
    MAX_COLUMN_KEYS2 = 500;
    STORAGE_DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";
    BCRYPT_COST2 = 12;
    ALLOWED_OPERATORS2 = /* @__PURE__ */ new Set([
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
    PostgresStorage = class {
      constructor() {
        this.authRepository = new AuthRepository();
        this.importsRepository = new ImportsRepository();
        this.searchRepository = new SearchRepository();
        this.activityRepository = new ActivityRepository({
          ensureBannedSessionsTable: () => this.ensureBannedSessionsTable()
        });
        this.auditRepository = new AuditRepository();
        this.backupsBootstrap = new BackupsBootstrap();
        this.backupsRepository = new BackupsRepository({
          ensureBackupsTable: () => this.backupsBootstrap.ensureTable(),
          parseBackupMetadataSafe: (raw) => this.parseBackupMetadataSafe(raw)
        });
        this.analyticsRepository = new AnalyticsRepository();
        this.collectionRepository = new CollectionRepository();
        this.settingsRepository = new SettingsRepository();
        this.settingsBootstrap = new SettingsBootstrap();
        this.spatialBootstrap = new SpatialBootstrap();
      }
      async init() {
        await this.ensureUsersTable();
        await this.ensureImportsTable();
        await this.ensureDataRowsTable();
        await this.ensureUserActivityTable();
        await this.ensureAuditLogsTable();
        await this.ensureCollectionRecordsTable();
        await this.ensureCollectionStaffNicknamesTable();
        await this.ensureCollectionAdminGroupsTables();
        await this.ensureCollectionNicknameSessionsTable();
        await this.ensureCollectionAdminVisibleNicknamesTable();
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
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
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
          await db.execute(sql13`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text`);
          await db.execute(sql13`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text`);
          await db.execute(sql13`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password text`);
          await db.execute(sql13`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false`);
          await db.execute(sql13`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
          await db.execute(sql13`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
          await db.execute(sql13`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamp`);
          await db.execute(sql13`
        UPDATE public.users
        SET password_hash = password
        WHERE password_hash IS NULL
          AND password IS NOT NULL
      `);
          const missingHashRows = await db.execute(sql13`
        SELECT id
        FROM public.users
        WHERE password_hash IS NULL
      `);
          for (const row of missingHashRows.rows) {
            const userId = String(row.id || "").trim();
            if (!userId) continue;
            const fallbackHash = await bcrypt2.hash(randomUUID2(), BCRYPT_COST2);
            await db.execute(sql13`
          UPDATE public.users
          SET password_hash = ${fallbackHash}
          WHERE id = ${userId}
        `);
          }
          await db.execute(sql13`
        UPDATE public.users
        SET
          role = COALESCE(NULLIF(role, ''), 'user'),
          created_at = COALESCE(created_at, now()),
          updated_at = COALESCE(updated_at, now()),
          is_banned = COALESCE(is_banned, false)
      `);
          await db.execute(sql13`ALTER TABLE public.users ALTER COLUMN username SET NOT NULL`);
          await db.execute(sql13`ALTER TABLE public.users ALTER COLUMN role SET NOT NULL`);
          await db.execute(sql13`ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL`);
          await db.execute(sql13`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON public.users (lower(username))`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_users_username_lower ON public.users (lower(username))`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role)`);
        } catch (err) {
          console.error("\u274C Failed to ensure users table:", err?.message || err);
          throw err;
        }
      }
      async ensureImportsTable() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.imports (
          id text PRIMARY KEY,
          name text NOT NULL,
          filename text NOT NULL,
          created_at timestamp DEFAULT now(),
          is_deleted boolean DEFAULT false,
          created_by text
        )
      `);
          await db.execute(sql13`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS name text`);
          await db.execute(sql13`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS filename text`);
          await db.execute(sql13`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
          await db.execute(sql13`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false`);
          await db.execute(sql13`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_by text`);
          await db.execute(sql13`
        UPDATE public.imports
        SET
          name = COALESCE(NULLIF(name, ''), NULLIF(filename, ''), 'Untitled Import'),
          filename = COALESCE(NULLIF(filename, ''), COALESCE(NULLIF(name, ''), 'unknown.csv')),
          created_at = COALESCE(created_at, now()),
          is_deleted = COALESCE(is_deleted, false)
      `);
          await db.execute(sql13`ALTER TABLE public.imports ALTER COLUMN name SET NOT NULL`);
          await db.execute(sql13`ALTER TABLE public.imports ALTER COLUMN filename SET NOT NULL`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_imports_created_at ON public.imports(created_at DESC)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON public.imports(is_deleted)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_imports_created_by ON public.imports(created_by)`);
        } catch (err) {
          console.error("Failed to ensure imports table:", err?.message || err);
          throw err;
        }
      }
      async ensureDataRowsTable() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.data_rows (
          id text PRIMARY KEY,
          import_id text NOT NULL,
          json_data jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `);
          await db.execute(sql13`ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS import_id text`);
          await db.execute(sql13`ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS json_data jsonb DEFAULT '{}'::jsonb`);
          await db.execute(sql13`
        UPDATE public.data_rows
        SET json_data = COALESCE(json_data, '{}'::jsonb)
      `);
          await db.execute(sql13`ALTER TABLE public.data_rows ALTER COLUMN import_id SET NOT NULL`);
          await db.execute(sql13`ALTER TABLE public.data_rows ALTER COLUMN json_data SET NOT NULL`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON public.data_rows(import_id)`);
        } catch (err) {
          console.error("Failed to ensure data_rows table:", err?.message || err);
          throw err;
        }
      }
      async ensureUserActivityTable() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.user_activity (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          username text NOT NULL,
          role text NOT NULL,
          pc_name text,
          browser text,
          fingerprint text,
          ip_address text,
          login_time timestamp,
          logout_time timestamp,
          last_activity_time timestamp,
          is_active boolean DEFAULT true,
          logout_reason text
        )
      `);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS user_id text`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS username text`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS role text`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS pc_name text`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS browser text`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS fingerprint text`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS ip_address text`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS login_time timestamp`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_time timestamp`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS last_activity_time timestamp`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
          await db.execute(sql13`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_reason text`);
          await db.execute(sql13`
        UPDATE public.user_activity
        SET
          is_active = COALESCE(is_active, true),
          login_time = COALESCE(login_time, now()),
          last_activity_time = COALESCE(last_activity_time, login_time, now())
      `);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_user_activity_username ON public.user_activity(username)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_user_activity_is_active ON public.user_activity(is_active)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON public.user_activity(login_time DESC)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_user_activity_last_activity_time ON public.user_activity(last_activity_time DESC)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_user_activity_fingerprint ON public.user_activity(fingerprint)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_user_activity_ip_address ON public.user_activity(ip_address)`);
        } catch (err) {
          console.error("Failed to ensure user_activity table:", err?.message || err);
          throw err;
        }
      }
      async ensureAuditLogsTable() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.audit_logs (
          id text PRIMARY KEY,
          action text NOT NULL,
          performed_by text NOT NULL,
          target_user text,
          target_resource text,
          details text,
          timestamp timestamp DEFAULT now()
        )
      `);
          await db.execute(sql13`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text`);
          await db.execute(sql13`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS performed_by text`);
          await db.execute(sql13`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_user text`);
          await db.execute(sql13`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_resource text`);
          await db.execute(sql13`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details text`);
          await db.execute(sql13`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS timestamp timestamp DEFAULT now()`);
          await db.execute(sql13`
        UPDATE public.audit_logs
        SET timestamp = COALESCE(timestamp, now())
      `);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by)`);
        } catch (err) {
          console.error("Failed to ensure audit_logs table:", err?.message || err);
          throw err;
        }
      }
      async ensureCollectionRecordsTable() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.collection_records (
          id uuid PRIMARY KEY,
          customer_name text NOT NULL,
          ic_number text NOT NULL,
          customer_phone text NOT NULL,
          account_number text NOT NULL,
          batch text NOT NULL,
          payment_date date NOT NULL,
          amount numeric(14,2) NOT NULL,
          receipt_file text,
          created_by_login text NOT NULL,
          collection_staff_nickname text NOT NULL,
          staff_username text NOT NULL,
          created_at timestamp DEFAULT now() NOT NULL
        )
      `);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name text`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number text`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone text`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number text`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS batch text`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS payment_date date`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS amount numeric(14,2)`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_file text`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_by_login text`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS collection_staff_nickname text`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS staff_username text`);
          await db.execute(sql13`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
          await db.execute(sql13`
        UPDATE public.collection_records
        SET customer_phone = COALESCE(NULLIF(customer_phone, ''), '-')
      `);
          await db.execute(sql13`
        UPDATE public.collection_records
        SET created_by_login = COALESCE(NULLIF(created_by_login, ''), NULLIF(staff_username, ''), 'unknown')
      `);
          await db.execute(sql13`
        UPDATE public.collection_records
        SET collection_staff_nickname = COALESCE(NULLIF(collection_staff_nickname, ''), NULLIF(staff_username, ''), NULLIF(created_by_login, ''), 'unknown')
      `);
          await db.execute(sql13`
        UPDATE public.collection_records
        SET staff_username = COALESCE(NULLIF(staff_username, ''), NULLIF(collection_staff_nickname, ''), NULLIF(created_by_login, ''), 'unknown')
      `);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_collection_records_payment_date ON public.collection_records(payment_date)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_collection_records_created_at ON public.collection_records(created_at DESC)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_username ON public.collection_records(staff_username)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_login ON public.collection_records(created_by_login)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_nickname ON public.collection_records(collection_staff_nickname)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_phone ON public.collection_records(customer_phone)`);
        } catch (err) {
          console.error("\u274C Failed to ensure collection_records table:", err?.message || err);
          throw err;
        }
      }
      async ensureCollectionStaffNicknamesTable() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.collection_staff_nicknames (
          id uuid PRIMARY KEY,
          nickname text NOT NULL,
          is_active boolean NOT NULL DEFAULT true,
          role_scope text NOT NULL DEFAULT 'both',
          nickname_password_hash text,
          must_change_password boolean NOT NULL DEFAULT true,
          password_reset_by_superuser boolean NOT NULL DEFAULT false,
          password_updated_at timestamp,
          created_by text,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
          await db.execute(sql13`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname text`);
          await db.execute(sql13`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
          await db.execute(sql13`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS role_scope text DEFAULT 'both'`);
          await db.execute(sql13`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname_password_hash text`);
          await db.execute(sql13`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true`);
          await db.execute(sql13`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_reset_by_superuser boolean DEFAULT false`);
          await db.execute(sql13`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_updated_at timestamp`);
          await db.execute(sql13`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_by text`);
          await db.execute(sql13`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
          await db.execute(sql13`
        UPDATE public.collection_staff_nicknames
        SET
          nickname = trim(COALESCE(nickname, '')),
          is_active = COALESCE(is_active, true),
          role_scope = CASE
            WHEN lower(trim(COALESCE(role_scope, ''))) IN ('admin', 'user', 'both')
              THEN lower(trim(COALESCE(role_scope, '')))
            ELSE 'both'
          END,
          nickname_password_hash = NULLIF(trim(COALESCE(nickname_password_hash, '')), ''),
          must_change_password = COALESCE(
            must_change_password,
            CASE
              WHEN NULLIF(trim(COALESCE(nickname_password_hash, '')), '') IS NULL THEN true
              ELSE false
            END
          ),
          password_reset_by_superuser = COALESCE(password_reset_by_superuser, false),
          created_at = COALESCE(created_at, now())
      `);
          await db.execute(sql13`DELETE FROM public.collection_staff_nicknames WHERE nickname = ''`);
          await db.execute(sql13`CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_staff_nicknames_lower_unique ON public.collection_staff_nicknames(lower(nickname))`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_active ON public.collection_staff_nicknames(is_active)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_role_scope ON public.collection_staff_nicknames(role_scope)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_must_change_password ON public.collection_staff_nicknames(must_change_password)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_password_reset ON public.collection_staff_nicknames(password_reset_by_superuser)`);
          const seedRows = await db.execute(sql13`
        SELECT DISTINCT trim(collection_staff_nickname) AS nickname
        FROM public.collection_records
        WHERE collection_staff_nickname IS NOT NULL
          AND trim(collection_staff_nickname) <> ''
        LIMIT 5000
      `);
          for (const row of seedRows.rows) {
            const nickname = String(row.nickname || "").trim();
            if (!nickname) continue;
            await db.execute(sql13`
          INSERT INTO public.collection_staff_nicknames (
            id,
            nickname,
            is_active,
            nickname_password_hash,
            must_change_password,
            password_reset_by_superuser,
            password_updated_at,
            created_by,
            created_at
          )
          VALUES (
            ${crypto6.randomUUID()}::uuid,
            ${nickname},
            true,
            NULL,
            true,
            false,
            NULL,
            'system-seed',
            now()
          )
          ON CONFLICT ((lower(nickname))) DO NOTHING
        `);
          }
        } catch (err) {
          console.error("\u274C Failed to ensure collection_staff_nicknames table:", err?.message || err);
          throw err;
        }
      }
      async ensureCollectionAdminGroupsTables() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.admin_groups (
          id uuid PRIMARY KEY,
          leader_nickname text NOT NULL,
          created_by text NOT NULL,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.admin_group_members (
          id uuid PRIMARY KEY,
          admin_group_id uuid NOT NULL,
          member_nickname text NOT NULL,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
          await db.execute(sql13`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS leader_nickname text`);
          await db.execute(sql13`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_by text`);
          await db.execute(sql13`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
          await db.execute(sql13`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
          await db.execute(sql13`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS admin_group_id uuid`);
          await db.execute(sql13`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS member_nickname text`);
          await db.execute(sql13`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
          await db.execute(sql13`
        UPDATE public.admin_groups
        SET
          leader_nickname = trim(COALESCE(leader_nickname, '')),
          created_by = COALESCE(NULLIF(trim(COALESCE(created_by, '')), ''), 'system-seed'),
          created_at = COALESCE(created_at, now()),
          updated_at = COALESCE(updated_at, now())
      `);
          await db.execute(sql13`DELETE FROM public.admin_groups WHERE trim(COALESCE(leader_nickname, '')) = ''`);
          await db.execute(sql13`
        UPDATE public.admin_group_members
        SET
          member_nickname = trim(COALESCE(member_nickname, '')),
          created_at = COALESCE(created_at, now())
      `);
          await db.execute(sql13`DELETE FROM public.admin_group_members WHERE trim(COALESCE(member_nickname, '')) = ''`);
          await db.execute(sql13`
        DELETE FROM public.admin_group_members m
        WHERE m.admin_group_id IS NULL
           OR NOT EXISTS (
            SELECT 1
            FROM public.admin_groups g
            WHERE g.id = m.admin_group_id
          )
      `);
          await db.execute(sql13`
        DELETE FROM public.admin_group_members m
        USING public.admin_groups g
        WHERE g.id = m.admin_group_id
          AND lower(g.leader_nickname) = lower(m.member_nickname)
      `);
          await db.execute(sql13`
        DELETE FROM public.admin_groups a
        USING public.admin_groups b
        WHERE lower(a.leader_nickname) = lower(b.leader_nickname)
          AND a.ctid > b.ctid
      `);
          await db.execute(sql13`
        DELETE FROM public.admin_group_members a
        USING public.admin_group_members b
        WHERE a.admin_group_id = b.admin_group_id
          AND lower(a.member_nickname) = lower(b.member_nickname)
          AND a.ctid > b.ctid
      `);
          await db.execute(sql13`
        DELETE FROM public.admin_group_members a
        USING public.admin_group_members b
        WHERE lower(a.member_nickname) = lower(b.member_nickname)
          AND a.ctid > b.ctid
      `);
          await db.execute(sql13`
        DELETE FROM public.admin_group_members m
        WHERE EXISTS (
          SELECT 1
          FROM public.admin_groups g
          WHERE lower(g.leader_nickname) = lower(m.member_nickname)
            AND g.id <> m.admin_group_id
        )
      `);
          await db.execute(sql13`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_groups_leader_nickname_unique
        ON public.admin_groups (lower(leader_nickname))
      `);
          await db.execute(sql13`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_group_member_unique
        ON public.admin_group_members (admin_group_id, lower(member_nickname))
      `);
          await db.execute(sql13`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_member_unique
        ON public.admin_group_members (lower(member_nickname))
      `);
          await db.execute(sql13`
        CREATE INDEX IF NOT EXISTS idx_admin_group_members_group
        ON public.admin_group_members (admin_group_id)
      `);
        } catch (err) {
          console.error("\u274C Failed to ensure admin group tables:", err?.message || err);
          throw err;
        }
      }
      async ensureCollectionNicknameSessionsTable() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.collection_nickname_sessions (
          activity_id text PRIMARY KEY,
          username text NOT NULL,
          user_role text NOT NULL,
          nickname text NOT NULL,
          verified_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
          await db.execute(sql13`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS username text`);
          await db.execute(sql13`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS user_role text`);
          await db.execute(sql13`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS nickname text`);
          await db.execute(sql13`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS verified_at timestamp DEFAULT now()`);
          await db.execute(sql13`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
          await db.execute(sql13`
        UPDATE public.collection_nickname_sessions
        SET
          username = trim(COALESCE(username, '')),
          user_role = trim(COALESCE(user_role, '')),
          nickname = trim(COALESCE(nickname, '')),
          verified_at = COALESCE(verified_at, now()),
          updated_at = COALESCE(updated_at, now())
      `);
          await db.execute(sql13`
        DELETE FROM public.collection_nickname_sessions
        WHERE trim(COALESCE(username, '')) = ''
          OR trim(COALESCE(user_role, '')) = ''
          OR trim(COALESCE(nickname, '')) = ''
      `);
          await db.execute(sql13`
        CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_username
        ON public.collection_nickname_sessions (username)
      `);
          await db.execute(sql13`
        CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_nickname
        ON public.collection_nickname_sessions (lower(nickname))
      `);
          await db.execute(sql13`
        CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_updated_at
        ON public.collection_nickname_sessions (updated_at DESC)
      `);
        } catch (err) {
          console.error("\u274C Failed to ensure collection nickname session table:", err?.message || err);
          throw err;
        }
      }
      async ensureCollectionAdminVisibleNicknamesTable() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.admin_visible_nicknames (
          id uuid PRIMARY KEY,
          admin_user_id text NOT NULL,
          nickname_id uuid NOT NULL,
          created_by_superuser text,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
          await db.execute(sql13`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS admin_user_id text`);
          await db.execute(sql13`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS nickname_id uuid`);
          await db.execute(sql13`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_by_superuser text`);
          await db.execute(sql13`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
          await db.execute(sql13`
        UPDATE public.admin_visible_nicknames
        SET created_at = COALESCE(created_at, now())
      `);
          await db.execute(sql13`
        DELETE FROM public.admin_visible_nicknames avn
        WHERE avn.admin_user_id IS NULL
          OR avn.nickname_id IS NULL
      `);
          await db.execute(sql13`
        DELETE FROM public.admin_visible_nicknames avn
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.users u
          WHERE u.id = avn.admin_user_id
            AND u.role = 'admin'
        )
      `);
          await db.execute(sql13`
        DELETE FROM public.admin_visible_nicknames avn
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.collection_staff_nicknames c
          WHERE c.id = avn.nickname_id
        )
      `);
          await db.execute(sql13`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_visible_nicknames_admin_nickname_unique
        ON public.admin_visible_nicknames(admin_user_id, nickname_id)
      `);
          await db.execute(sql13`
        CREATE INDEX IF NOT EXISTS idx_admin_visible_nicknames_admin
        ON public.admin_visible_nicknames(admin_user_id)
      `);
          await db.execute(sql13`
        CREATE INDEX IF NOT EXISTS idx_admin_visible_nicknames_nickname
        ON public.admin_visible_nicknames(nickname_id)
      `);
          const existingCount = await db.execute(sql13`
        SELECT COUNT(*)::int AS total
        FROM public.admin_visible_nicknames
        LIMIT 1
      `);
          const total = Number(existingCount.rows?.[0]?.total ?? 0);
          if (total === 0) {
            const admins = await db.execute(sql13`
          SELECT id
          FROM public.users
          WHERE role = 'admin'
          ORDER BY username ASC
          LIMIT 5000
        `);
            const nicknames = await db.execute(sql13`
          SELECT id
          FROM public.collection_staff_nicknames
          WHERE is_active = true
          ORDER BY lower(nickname) ASC
          LIMIT 5000
        `);
            const adminIds = (admins.rows || []).map((row) => String(row.id || "").trim()).filter(Boolean);
            const nicknameIds = (nicknames.rows || []).map((row) => String(row.id || "").trim()).filter(Boolean);
            for (const adminUserId of adminIds) {
              for (const nicknameId of nicknameIds) {
                await db.execute(sql13`
              INSERT INTO public.admin_visible_nicknames (
                id,
                admin_user_id,
                nickname_id,
                created_by_superuser,
                created_at
              )
              VALUES (
                ${randomUUID2()}::uuid,
                ${adminUserId},
                ${nicknameId}::uuid,
                'system-seed',
                now()
              )
              ON CONFLICT (admin_user_id, nickname_id) DO NOTHING
            `);
              }
            }
          }
        } catch (err) {
          console.error("\u274C Failed to ensure admin_visible_nicknames table:", err?.message || err);
          throw err;
        }
      }
      async ensurePerformanceIndexes() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON data_rows(import_id)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON imports(is_deleted)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON user_activity(login_time)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_user_activity_logout_time ON user_activity(logout_time)`);
          try {
            await db.execute(sql13`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_json_text_trgm
          ON data_rows
          USING GIN ((json_data::text) gin_trgm_ops)
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_mykad_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. MyKad',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_idno_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'ID No',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nopengenalan_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No Pengenalan',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_ic_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'IC',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_cardno_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Card No',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountno_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Account No',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountnumber_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Account Number',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_akaunpemohon_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Nombor Akaun Bank Pemohon',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_noakaun_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No Akaun',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telrumah_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. Telefon Rumah',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telbimbit_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'No. Telefon Bimbit',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_phone_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Phone',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_handphone_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'Handphone',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_officephone_digits
          ON data_rows ((regexp_replace(coalesce((json_data::jsonb)->>'OfficePhone',''), '[^0-9]', '', 'g')))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nob_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'NOB') gin_trgm_ops)
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_employer_name_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'EMPLOYER NAME') gin_trgm_ops)
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nature_business_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'NATURE OF BUSINESS') gin_trgm_ops)
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nama_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'Nama') gin_trgm_ops)
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_customer_name_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'Customer Name') gin_trgm_ops)
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_name_trgm
          ON data_rows
          USING GIN (((json_data::jsonb)->>'name') gin_trgm_ops)
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_mykad_exact
          ON data_rows (((json_data::jsonb)->>'No. MyKad'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_idno_exact
          ON data_rows (((json_data::jsonb)->>'ID No'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_nopengenalan_exact
          ON data_rows (((json_data::jsonb)->>'No Pengenalan'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_ic_exact
          ON data_rows (((json_data::jsonb)->>'IC'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountno_exact
          ON data_rows (((json_data::jsonb)->>'Account No'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_accountnumber_exact
          ON data_rows (((json_data::jsonb)->>'Account Number'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_cardno_exact
          ON data_rows (((json_data::jsonb)->>'Card No'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_noakaun_exact
          ON data_rows (((json_data::jsonb)->>'No Akaun'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_akaunpemohon_exact
          ON data_rows (((json_data::jsonb)->>'Nombor Akaun Bank Pemohon'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telrumah_exact
          ON data_rows (((json_data::jsonb)->>'No. Telefon Rumah'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_telbimbit_exact
          ON data_rows (((json_data::jsonb)->>'No. Telefon Bimbit'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_phone_exact
          ON data_rows (((json_data::jsonb)->>'Phone'))
        `);
            await db.execute(sql13`
          CREATE INDEX IF NOT EXISTS idx_data_rows_handphone_exact
          ON data_rows (((json_data::jsonb)->>'Handphone'))
        `);
            await db.execute(sql13`
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
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
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
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_banned_sessions_fingerprint ON public.banned_sessions(fingerprint)`);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_banned_sessions_ip ON public.banned_sessions(ip_address)`);
        } catch (err) {
          console.error("\u274C Failed to ensure banned_sessions table:", err?.message || err);
        }
      }
      async ensureAiTables() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          let vectorAvailable = true;
          try {
            await db.execute(sql13`CREATE EXTENSION IF NOT EXISTS vector`);
          } catch (err) {
            vectorAvailable = false;
            console.warn("\u26A0\uFE0F pgvector extension not available. Embeddings disabled until installed.");
          }
          if (vectorAvailable) {
            await db.execute(sql13`
          CREATE TABLE IF NOT EXISTS public.data_embeddings (
            id text PRIMARY KEY,
            import_id text NOT NULL,
            row_id text NOT NULL UNIQUE,
            content text NOT NULL,
            embedding vector(768) NOT NULL,
            created_at timestamp DEFAULT now()
          )
        `);
            await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_data_embeddings_import_id ON public.data_embeddings(import_id)`);
            try {
              await db.execute(sql13`
            CREATE INDEX IF NOT EXISTS idx_data_embeddings_vector
            ON public.data_embeddings
            USING ivfflat (embedding vector_cosine_ops)
          `);
            } catch (err) {
              console.warn("\u26A0\uFE0F Failed to create ivfflat index:", err?.message || err);
            }
          }
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.ai_conversations (
          id text PRIMARY KEY,
          created_by text NOT NULL,
          created_at timestamp DEFAULT now()
        )
      `);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.ai_messages (
          id text PRIMARY KEY,
          conversation_id text NOT NULL,
          role text NOT NULL,
          content text NOT NULL,
          created_at timestamp DEFAULT now()
        )
      `);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON public.ai_messages(conversation_id)`);
        } catch (err) {
          console.error("\u274C Failed to ensure AI tables:", err?.message || err);
        }
      }
      async ensureCategoryStatsTable() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.ai_category_stats (
          key text PRIMARY KEY,
          total integer NOT NULL,
          samples jsonb,
          updated_at timestamp DEFAULT now()
        )
      `);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_ai_category_stats_updated_at ON public.ai_category_stats(updated_at)`);
        } catch (err) {
          console.error("\u274C Failed to ensure ai_category_stats table:", err?.message || err);
        }
      }
      async ensureCategoryRulesTable() {
        try {
          await db.execute(sql13`SET search_path TO public`);
          await db.execute(sql13`
        CREATE TABLE IF NOT EXISTS public.ai_category_rules (
          key text PRIMARY KEY,
          terms text[] NOT NULL DEFAULT '{}',
          fields text[] NOT NULL DEFAULT '{}',
          match_mode text NOT NULL DEFAULT 'contains',
          enabled boolean NOT NULL DEFAULT true,
          updated_at timestamp DEFAULT now()
        )
      `);
          await db.execute(sql13`CREATE INDEX IF NOT EXISTS idx_ai_category_rules_updated_at ON public.ai_category_rules(updated_at)`);
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
            if (!values.length) return sql13`'{}'::text[]`;
            const joined = sql13.join(values.map((v) => sql13`${v}`), sql13`, `);
            return sql13`ARRAY[${joined}]::text[]`;
          };
          for (const rule of defaults) {
            const termsSql = toTextArray(rule.terms || []);
            const fieldsSql = toTextArray(rule.fields || []);
            await db.execute(sql13`
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
        await this.settingsBootstrap.ensureTables();
      }
      async ensureSpatialTables() {
        await this.spatialBootstrap.ensureTables();
      }
      async ensureBackupsTable() {
        await this.backupsBootstrap.ensureTable();
      }
      async ensureBackupsReady() {
        await this.ensureBackupsTable();
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
      parseBackupMetadata(raw) {
        return this.parseBackupMetadataSafe(raw);
      }
      async seedDefaultUsers() {
        const shouldSeedConfiguredUsers = shouldSeedDefaultUsers();
        const [{ value: existingUserCount }] = await db.select({ value: count2() }).from(users);
        const isFreshLocalBootstrap = !shouldSeedConfiguredUsers && Number(existingUserCount || 0) === 0 && process.env.NODE_ENV !== "production";
        const defaultUsers = [
          {
            username: process.env.SEED_SUPERUSER_USERNAME || "superuser",
            password: process.env.SEED_SUPERUSER_PASSWORD || "",
            role: "superuser"
          },
          {
            username: process.env.SEED_ADMIN_USERNAME || "admin1",
            password: process.env.SEED_ADMIN_PASSWORD || "",
            role: "admin"
          },
          {
            username: process.env.SEED_USER_USERNAME || "user1",
            password: process.env.SEED_USER_PASSWORD || "",
            role: "user"
          }
        ].filter((user) => user.password);
        if (isFreshLocalBootstrap) {
          defaultUsers.push({
            username: process.env.SEED_SUPERUSER_USERNAME || "superuser",
            password: process.env.SEED_SUPERUSER_PASSWORD || "0441024k",
            role: "superuser"
          });
          console.warn(
            "[AUTH] No users found. Bootstrapped local superuser account for first login."
          );
        } else if (!shouldSeedConfiguredUsers) {
          return;
        }
        for (const user of defaultUsers) {
          const existing = await this.getUserByUsername(user.username);
          if (!existing) {
            const now = /* @__PURE__ */ new Date();
            const hashedPassword = await bcrypt2.hash(user.password, BCRYPT_COST2);
            await db.insert(users).values({
              id: crypto6.randomUUID(),
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
        return this.authRepository.getUser(id);
      }
      async getUserByUsername(username) {
        return this.authRepository.getUserByUsername(username);
      }
      async createUser(user) {
        return this.authRepository.createUser(user);
      }
      async updateUserCredentials(params) {
        return this.authRepository.updateUserCredentials(params);
      }
      async getUsersByRoles(roles) {
        return this.authRepository.getUsersByRoles(roles);
      }
      async updateActivitiesUsername(oldUsername, newUsername) {
        return this.authRepository.updateActivitiesUsername(oldUsername, newUsername);
      }
      async searchGlobalDataRows(params) {
        const { search, limit, offset } = params;
        const rowsResult = await db.execute(sql13`
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
        const totalResult = await db.execute(sql13`
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
        return await db.execute(sql13`
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
        return this.authRepository.updateUserBan(username, isBanned);
      }
      async createImport(data) {
        return this.importsRepository.createImport(data);
      }
      async getImports() {
        return this.importsRepository.getImports();
      }
      async getImportById(id) {
        return this.importsRepository.getImportById(id);
      }
      async updateImportName(id, name) {
        return this.importsRepository.updateImportName(id, name);
      }
      async deleteImport(id) {
        return this.importsRepository.deleteImport(id);
      }
      async createDataRow(data) {
        return this.importsRepository.createDataRow(data);
      }
      async getDataRowsByImport(importId) {
        if (STORAGE_DEBUG_LOGS) {
          console.log("\u{1F9EA} VIEWER importId received:", importId);
        }
        const rows = await this.importsRepository.getDataRowsByImport(importId);
        if (STORAGE_DEBUG_LOGS) {
          console.log("\u{1F9EA} ROW COUNT:", rows.length);
        }
        return rows;
      }
      async getDataRowCountByImport(importId) {
        return this.importsRepository.getDataRowCountByImport(importId);
      }
      async searchDataRows(params) {
        const { importId, search, limit, offset } = params;
        const trimmedSearch = search && search.trim() ? search.trim() : null;
        if (STORAGE_DEBUG_LOGS) {
          console.log(`\u{1F50D} searchDataRows called: search="${search}" -> trimmed="${trimmedSearch}"`);
        }
        const safeLimit = Math.min(limit, MAX_SEARCH_LIMIT2);
        const safeOffset = Math.max(offset, 0);
        if (trimmedSearch && trimmedSearch.length < 2) {
          return { rows: [], total: 0 };
        }
        if (!trimmedSearch) {
          const rows = await db.select().from(dataRows).where(eq5(dataRows.importId, importId)).limit(safeLimit).offset(safeOffset);
          const [{ count: count3 }] = await db.select({ count: sql13`count(*)` }).from(dataRows).where(eq5(dataRows.importId, importId));
          if (STORAGE_DEBUG_LOGS) {
            console.log("\u{1F50D} searchDataRows (no search) - returned:", rows.length, "rows");
          }
          return { rows, total: Number(count3) };
        }
        if (STORAGE_DEBUG_LOGS) {
          console.log(`\u{1F50D} Executing search query for: "${trimmedSearch}"`);
        }
        const rowsResult = await db.execute(sql13`
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
        const totalResult = await db.execute(sql13`
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
          (f) => allowedColumns.has(f.field) && ALLOWED_OPERATORS2.has(f.operator)
        );
        if (safeFilters.length === 0) {
          return { rows: [], total: 0 };
        }
        const conditions = safeFilters.map(
          (filter) => buildSqlCondition(filter.field, filter.operator, filter.value)
        );
        const combinedCondition = logic === "AND" ? and3(...conditions) : or(...conditions);
        const safeLimit = Math.min(limit, MAX_SEARCH_LIMIT2);
        const safeOffset = Math.max(offset, 0);
        const rows = await db.select().from(dataRows).where(
          and3(
            inArray2(dataRows.importId, activeImportIds),
            combinedCondition
          )
        ).limit(safeLimit).offset(safeOffset);
        const [{ count: count3 }] = await db.select({ count: sql13`count(*)` }).from(dataRows).where(
          and3(
            inArray2(dataRows.importId, activeImportIds),
            combinedCondition
          )
        );
        return { rows, total: Number(count3) };
      }
      async getAllColumnNames() {
        const result = await db.execute(sql13`
      SELECT DISTINCT key AS column_name
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      CROSS JOIN LATERAL jsonb_object_keys(dr.json_data::jsonb) AS key
      WHERE i.is_deleted = false
        AND jsonb_typeof(dr.json_data::jsonb) = 'object'
      ORDER BY key
      LIMIT ${MAX_COLUMN_KEYS2}
    `);
        return (result.rows || []).map((row) => String(row.column_name || "").trim()).filter((name) => name.length > 0);
      }
      async createActivity(data) {
        return this.activityRepository.createActivity(data);
      }
      async touchActivity(activityId) {
        return this.activityRepository.touchActivity(activityId);
      }
      async getActiveActivitiesByUsername(username) {
        return this.activityRepository.getActiveActivitiesByUsername(username);
      }
      async updateActivity(id, data) {
        return this.activityRepository.updateActivity(id, data);
      }
      async getActivityById(id) {
        return this.activityRepository.getActivityById(id);
      }
      async getActiveActivities() {
        return this.activityRepository.getActiveActivities();
      }
      async getAllActivities() {
        return this.activityRepository.getAllActivities();
      }
      async deleteActivity(id) {
        return this.activityRepository.deleteActivity(id);
      }
      async getFilteredActivities(filters) {
        return this.activityRepository.getFilteredActivities(filters);
      }
      async deactivateUserActivities(username, reason) {
        return this.activityRepository.deactivateUserActivities(username, reason);
      }
      async deactivateUserSessionsByFingerprint(username, fingerprint) {
        return this.activityRepository.deactivateUserSessionsByFingerprint(username, fingerprint);
      }
      async getBannedUsers() {
        return this.activityRepository.getBannedUsers();
      }
      async isVisitorBanned(fingerprint, ipAddress) {
        return this.activityRepository.isVisitorBanned(fingerprint, ipAddress);
      }
      async banVisitor(params) {
        return this.activityRepository.banVisitor(params);
      }
      async unbanVisitor(banId) {
        return this.activityRepository.unbanVisitor(banId);
      }
      async getBannedSessions() {
        return this.activityRepository.getBannedSessions();
      }
      async createConversation(createdBy) {
        const id = crypto6.randomUUID();
        await db.execute(sql13`
      INSERT INTO public.ai_conversations (id, created_by, created_at)
      VALUES (${id}, ${createdBy}, ${/* @__PURE__ */ new Date()})
    `);
        return id;
      }
      async saveConversationMessage(conversationId, role, content) {
        await db.execute(sql13`
      INSERT INTO public.ai_messages (id, conversation_id, role, content, created_at)
      VALUES (${crypto6.randomUUID()}, ${conversationId}, ${role}, ${content}, ${/* @__PURE__ */ new Date()})
    `);
      }
      async getConversationMessages(conversationId, limit = 20) {
        const result = await db.execute(sql13`
      SELECT role, content
      FROM public.ai_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);
        return result.rows;
      }
      async saveEmbedding(params) {
        const embeddingLiteral = sql13.raw(`'[${params.embedding.join(",")}]'`);
        await db.execute(sql13`
      INSERT INTO public.data_embeddings (id, import_id, row_id, content, embedding, created_at)
      VALUES (${crypto6.randomUUID()}, ${params.importId}, ${params.rowId}, ${params.content}, ${embeddingLiteral}::vector, ${/* @__PURE__ */ new Date()})
      ON CONFLICT (row_id) DO UPDATE SET
        import_id = EXCLUDED.import_id,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding
    `);
      }
      async semanticSearch(params) {
        const embeddingLiteral = sql13.raw(`'[${params.embedding.join(",")}]'`);
        const importFilter = params.importId ? sql13`AND e.import_id = ${params.importId}` : sql13``;
        try {
          await db.execute(sql13`SET ivfflat.probes = 5`);
        } catch {
        }
        const result = await db.execute(sql13`
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
        const perFieldMatch = sql13.join(
          primaryFields.map(
            (key) => sql13`coalesce((dr.json_data::jsonb)->>${key}, '') = ${digits}`
          ),
          sql13` OR `
        );
        const result = await db.execute(sql13`
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
        const nameKeysMatch = sql13`
      (
        coalesce((dr.json_data::jsonb)->>'Nama','') ILIKE ${"%" + q + "%"} OR
        coalesce((dr.json_data::jsonb)->>'Customer Name','') ILIKE ${"%" + q + "%"} OR
        coalesce((dr.json_data::jsonb)->>'name','') ILIKE ${"%" + q + "%"} OR
        coalesce((dr.json_data::jsonb)->>'MAKLUMAT PEMOHON','') ILIKE ${"%" + q + "%"}
      )
    `;
        const result = await db.execute(sql13`
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
        const result = await db.execute(sql13`
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
          (t) => sql13`CASE WHEN dr.json_data::text ILIKE ${"%" + t + "%"} THEN 1 ELSE 0 END`
        );
        const whereParts = tokens.map(
          (t) => sql13`dr.json_data::text ILIKE ${"%" + t + "%"}`
        );
        const scoreSql = sql13.join(scoreParts, sql13` + `);
        const whereSql = sql13.join(whereParts, sql13` OR `);
        const result = await db.execute(sql13`
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
          const result = await db.execute(sql13`
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
          const result = await db.execute(sql13`
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
        let result = await db.execute(sql13`
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
          result = await db.execute(sql13`
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
            countSqls.push(sql13`0::int as "${sql13.raw(group.key)}"`);
            continue;
          }
          const termSql = matchMode === "exact" ? sql13.join(
            fields.map((f) => {
              const list = sql13.join(
                terms.map((v) => sql13`${v.toUpperCase()}`),
                sql13`, `
              );
              return sql13`upper(trim(coalesce((dr.json_data::jsonb)->>${f}, ''))) IN (${list})`;
            }),
            sql13` OR `
          ) : sql13.join(
            terms.map((t) => {
              const perField = sql13.join(
                fields.map((f) => sql13`coalesce((dr.json_data::jsonb)->>${f}, '') ILIKE ${"%" + t + "%"}`),
                sql13` OR `
              );
              return sql13`((${perField}) OR dr.json_data::text ILIKE ${"%" + t + "%"})`;
            }),
            sql13` OR `
          );
          matchSqlByKey.set(group.key, termSql);
          countSqls.push(
            sql13`COUNT(*) FILTER (WHERE (${termSql}))::int as "${sql13.raw(group.key)}"`
          );
        }
        const complementGroups = groups.filter((g) => String(g.matchMode || "").toLowerCase() === "complement");
        if (complementGroups.length > 0) {
          if (matchSqlByKey.size > 0) {
            const combined = sql13.join(Array.from(matchSqlByKey.values()).map((v) => sql13`(${v})`), sql13` OR `);
            for (const group of complementGroups) {
              countSqls.push(
                sql13`COUNT(*) FILTER (WHERE NOT (${combined}))::int as "${sql13.raw(group.key)}"`
              );
            }
          } else {
            for (const group of complementGroups) {
              countSqls.push(
                sql13`COUNT(*)::int as "${sql13.raw(group.key)}"`
              );
            }
          }
        }
        const selectParts = countSqls.length > 0 ? sql13.join(countSqls, sql13`, `) : sql13``;
        const res = await db.execute(sql13`
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
        const result = await db.execute(sql13`
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
        const result = await db.execute(sql13`
      SELECT MAX(updated_at) as updated_at
      FROM public.ai_category_rules
    `);
        const row = result.rows[0];
        return row?.updated_at ? new Date(row.updated_at) : null;
      }
      async getCategoryStats(keys) {
        if (!keys.length) return [];
        const quoted = keys.map((k) => `'${k.replace(/'/g, "''")}'`).join(",");
        const result = await db.execute(sql13`
      SELECT key, total, samples, updated_at
      FROM public.ai_category_stats
      WHERE key IN (${sql13.raw(quoted)})
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
            return sql13.join(
              terms.map((t) => sql13`dr.json_data::text ILIKE ${"%" + t + "%"}`),
              sql13` OR `
            );
          }
          if (matchMode === "exact") {
            return sql13.join(
              fields.map((f) => {
                const list = sql13.join(
                  terms.map((v) => sql13`${v.toUpperCase()}`),
                  sql13`, `
                );
                return sql13`upper(trim(coalesce((dr.json_data::jsonb)->>${f}, ''))) IN (${list})`;
              }),
              sql13` OR `
            );
          }
          return sql13.join(
            terms.map((t) => {
              const perField = sql13.join(
                fields.map((f) => sql13`(dr.json_data::jsonb)->>${f} ILIKE ${"%" + t + "%"}`),
                sql13` OR `
              );
              return sql13`(${perField})`;
            }),
            sql13` OR `
          );
        };
        if (uniqueKeys.includes("__all__")) {
          const totalRes = await db.execute(sql13`
        SELECT COUNT(*)::int as "count"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
      `);
          const totalRows = Number(totalRes.rows[0]?.count ?? 0);
          await db.execute(sql13`
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
            await db.execute(sql13`
          INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
          VALUES (${group.key}, 0, '[]'::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
        `);
            continue;
          }
          const countRes = await db.execute(sql13`
        SELECT COUNT(*)::int as "count"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
      `);
          const total = Number(countRes.rows[0]?.count ?? 0);
          let samples = [];
          if (total > 0) {
            const sampleRes = await db.execute(sql13`
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
          await db.execute(sql13`
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
        const totalRes = await db.execute(sql13`
      SELECT COUNT(*)::int as "count"
      FROM data_rows dr
      JOIN imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
    `);
        const totalRows = Number(totalRes.rows[0]?.count ?? 0);
        await db.execute(sql13`
      DELETE FROM public.ai_category_stats
      WHERE key <> '__all__'
    `);
        await db.execute(sql13`
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
            return sql13.join(
              terms.map((t) => sql13`dr.json_data::text ILIKE ${"%" + t + "%"}`),
              sql13` OR `
            );
          }
          if (matchMode === "exact") {
            return sql13.join(
              fields.map((f) => {
                const list = sql13.join(
                  terms.map((v) => sql13`${v.toUpperCase()}`),
                  sql13`, `
                );
                return sql13`upper(trim(coalesce((dr.json_data::jsonb)->>${f}, ''))) IN (${list})`;
              }),
              sql13` OR `
            );
          }
          return sql13.join(
            terms.map((t) => {
              const perField = sql13.join(
                fields.map((f) => sql13`(dr.json_data::jsonb)->>${f} ILIKE ${"%" + t + "%"}`),
                sql13` OR `
              );
              return sql13`(${perField})`;
            }),
            sql13` OR `
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
            await db.execute(sql13`
          INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
          VALUES (${group.key}, 0, '[]'::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
        `);
            continue;
          }
          matchSqlByKey.set(group.key, termSql);
          const countRes = await db.execute(sql13`
        SELECT COUNT(*)::int as "count"
        FROM data_rows dr
        JOIN imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND (${termSql})
      `);
          const total = Number(countRes.rows[0]?.count ?? 0);
          const sampleRes = await db.execute(sql13`
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
          await db.execute(sql13`
        INSERT INTO public.ai_category_stats (key, total, samples, updated_at)
        VALUES (${group.key}, ${total}, ${JSON.stringify(samples)}::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET total = EXCLUDED.total, samples = EXCLUDED.samples, updated_at = now()
      `);
        }
        if (complementGroups.length > 0) {
          const combined = matchSqlByKey.size > 0 ? sql13.join(Array.from(matchSqlByKey.values()).map((v) => sql13`(${v})`), sql13` OR `) : null;
          for (const group of complementGroups) {
            let total = totalRows;
            let samples = [];
            if (combined) {
              const countRes = await db.execute(sql13`
            SELECT COUNT(*)::int as "count"
            FROM data_rows dr
            JOIN imports i ON i.id = dr.import_id
            WHERE i.is_deleted = false
              AND NOT (${combined})
          `);
              total = Number(countRes.rows[0]?.count ?? 0);
              const sampleRes = await db.execute(sql13`
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
            await db.execute(sql13`
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
        const result = await db.execute(sql13`
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
          const result = await db.execute(sql13`
        SELECT lat, lng
        FROM public.aeon_branch_postcodes
        WHERE postcode = ${postcodeNorm}
        LIMIT 1
      `);
          return result.rows?.[0];
        };
        let row = await lookup();
        if (row) return { lat: Number(row.lat), lng: Number(row.lng) };
        const countRes = await db.execute(sql13`
      SELECT COUNT(*)::int as "count"
      FROM public.aeon_branch_postcodes
    `);
        const count3 = Number(countRes.rows[0]?.count ?? 0);
        if (count3 === 0) {
          const branches = await db.execute(sql13`
        SELECT name, branch_address, branch_lat, branch_lng
        FROM public.aeon_branches
      `);
          for (const b of branches.rows) {
            const address = String(b.branch_address || "");
            const match5 = address.match(/\b\d{5}\b/);
            const match4 = address.match(/\b\d{4}\b/);
            const pc = match5 ? match5[0] : match4 ? `0${match4[0]}` : null;
            if (!pc) continue;
            await db.execute(sql13`
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
        const rows = await db.execute(sql13`
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
          const id = crypto6.randomUUID();
          await db.execute(sql13`
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
            await db.execute(sql13`
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
        const result = await db.execute(sql13`
      SELECT id, json_data as "jsonDataJsonb"
      FROM data_rows
      WHERE import_id = ${importId}
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `);
        return result.rows;
      }
      async getSettingsForRole(role) {
        await this.ensureSettingsTables();
        return this.settingsRepository.getSettingsForRole(role);
      }
      async getBooleanSystemSetting(key, fallback = false) {
        await this.ensureSettingsTables();
        return this.settingsRepository.getBooleanSystemSetting(key, fallback);
      }
      async getRoleTabVisibility(role) {
        await this.ensureSettingsTables();
        return this.settingsRepository.getRoleTabVisibility(role);
      }
      async updateSystemSetting(params) {
        await this.ensureSettingsTables();
        return this.settingsRepository.updateSystemSetting(params);
      }
      async getMaintenanceState(now = /* @__PURE__ */ new Date()) {
        await this.ensureSettingsTables();
        return this.settingsRepository.getMaintenanceState(now);
      }
      async getAppConfig() {
        await this.ensureSettingsTables();
        return this.settingsRepository.getAppConfig();
      }
      async getAccounts() {
        return this.authRepository.getAccounts();
      }
      async getCollectionStaffNicknames(filters) {
        return this.collectionRepository.getCollectionStaffNicknames(filters);
      }
      async getCollectionAdminUsers() {
        return this.collectionRepository.getCollectionAdminUsers();
      }
      async getCollectionAdminUserById(adminUserId) {
        return this.collectionRepository.getCollectionAdminUserById(adminUserId);
      }
      async getCollectionAdminAssignedNicknameIds(adminUserId) {
        return this.collectionRepository.getCollectionAdminAssignedNicknameIds(adminUserId);
      }
      async getCollectionAdminVisibleNicknames(adminUserId, filters) {
        return this.collectionRepository.getCollectionAdminVisibleNicknames(adminUserId, filters);
      }
      async setCollectionAdminAssignedNicknameIds(params) {
        return this.collectionRepository.setCollectionAdminAssignedNicknameIds(params);
      }
      async getCollectionAdminGroups() {
        return this.collectionRepository.getCollectionAdminGroups();
      }
      async getCollectionAdminGroupById(groupId) {
        return this.collectionRepository.getCollectionAdminGroupById(groupId);
      }
      async createCollectionAdminGroup(params) {
        return this.collectionRepository.createCollectionAdminGroup(params);
      }
      async updateCollectionAdminGroup(params) {
        return this.collectionRepository.updateCollectionAdminGroup(params);
      }
      async deleteCollectionAdminGroup(groupId) {
        return this.collectionRepository.deleteCollectionAdminGroup(groupId);
      }
      async getCollectionAdminGroupVisibleNicknameValuesByLeader(leaderNickname) {
        return this.collectionRepository.getCollectionAdminGroupVisibleNicknameValuesByLeader(leaderNickname);
      }
      async setCollectionNicknameSession(params) {
        return this.collectionRepository.setCollectionNicknameSession(params);
      }
      async getCollectionNicknameSessionByActivity(activityId) {
        return this.collectionRepository.getCollectionNicknameSessionByActivity(activityId);
      }
      async clearCollectionNicknameSessionByActivity(activityId) {
        return this.collectionRepository.clearCollectionNicknameSessionByActivity(activityId);
      }
      async getCollectionStaffNicknameById(id) {
        return this.collectionRepository.getCollectionStaffNicknameById(id);
      }
      async getCollectionStaffNicknameByName(nickname) {
        return this.collectionRepository.getCollectionStaffNicknameByName(nickname);
      }
      async getCollectionNicknameAuthProfileByName(nickname) {
        return this.collectionRepository.getCollectionNicknameAuthProfileByName(nickname);
      }
      async setCollectionNicknamePassword(params) {
        return this.collectionRepository.setCollectionNicknamePassword(params);
      }
      async createCollectionStaffNickname(data) {
        return this.collectionRepository.createCollectionStaffNickname(data);
      }
      async updateCollectionStaffNickname(id, data) {
        return this.collectionRepository.updateCollectionStaffNickname(id, data);
      }
      async deleteCollectionStaffNickname(id) {
        return this.collectionRepository.deleteCollectionStaffNickname(id);
      }
      async isCollectionStaffNicknameActive(nickname) {
        return this.collectionRepository.isCollectionStaffNicknameActive(nickname);
      }
      async createCollectionRecord(data) {
        return this.collectionRepository.createCollectionRecord(data);
      }
      async listCollectionRecords(filters) {
        return this.collectionRepository.listCollectionRecords(filters);
      }
      async getCollectionMonthlySummary(filters) {
        return this.collectionRepository.getCollectionMonthlySummary(filters);
      }
      async getCollectionRecordById(id) {
        return this.collectionRepository.getCollectionRecordById(id);
      }
      async updateCollectionRecord(id, data) {
        return this.collectionRepository.updateCollectionRecord(id, data);
      }
      async deleteCollectionRecord(id) {
        return this.collectionRepository.deleteCollectionRecord(id);
      }
      async createAuditLog(data) {
        return this.auditRepository.createAuditLog(data);
      }
      async getAuditLogs() {
        return this.auditRepository.getAuditLogs();
      }
      async createBackup(data) {
        return this.backupsRepository.createBackup(data);
      }
      async getBackups() {
        return this.backupsRepository.getBackups();
      }
      async getBackupById(id) {
        return this.backupsRepository.getBackupById(id);
      }
      async deleteBackup(id) {
        return this.backupsRepository.deleteBackup(id);
      }
      async getBackupDataForExport() {
        return this.backupsRepository.getBackupDataForExport();
      }
      async restoreFromBackup(backupData) {
        return this.backupsRepository.restoreFromBackup(backupData);
      }
      async getDashboardSummary() {
        return this.analyticsRepository.getDashboardSummary();
      }
      async getLoginTrends(days = 7) {
        return this.analyticsRepository.getLoginTrends(days);
      }
      async getTopActiveUsers(limit = 10) {
        return this.analyticsRepository.getTopActiveUsers(limit);
      }
      async getPeakHours() {
        return this.analyticsRepository.getPeakHours();
      }
      async getRoleDistribution() {
        return this.analyticsRepository.getRoleDistribution();
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

// server/internal/frontend-static.ts
import express from "express";
import fs from "fs";
import path from "path";
function registerFrontendStatic(app2, options) {
  const cwd = options?.cwd || process.cwd();
  const possiblePaths = options?.paths || DEFAULT_FRONTEND_PATHS;
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
        const preview = files.slice(0, 5).join(", ");
        console.log(`    Found ${files.length} files: ${preview}${files.length > 5 ? "..." : ""}`);
        if (fs.existsSync(indexFile)) {
          foundPath = fullPath;
          foundIndex = indexFile;
          break;
        }
      }
    } catch (error) {
      console.log(`    Error: ${error.message}`);
    }
  }
  if (foundPath && foundIndex) {
    console.log(`  Frontend: Serving from ${foundPath}`);
    app2.use(express.static(foundPath));
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
        return next();
      }
      return res.sendFile(foundIndex);
    });
    console.log("  Frontend: OK");
    return;
  }
  console.log("");
  console.log("  ERROR: Frontend files not found!");
  console.log("  Please run: npm run build:local");
  console.log(`  Expected location: ${path.resolve(cwd, "dist-local/public")}`);
  app2.use((req, res) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/ws")) {
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
var DEFAULT_FRONTEND_PATHS;
var init_frontend_static = __esm({
  "server/internal/frontend-static.ts"() {
    "use strict";
    DEFAULT_FRONTEND_PATHS = [
      "dist-local/public",
      "dist-local\\public",
      "dist/public",
      "dist\\public"
    ];
  }
});

// server/internal/idle-session-sweeper.ts
import { WebSocket } from "ws";
function startIdleSessionSweeper(options) {
  const {
    storage: storage2,
    connectedClients: connectedClients2,
    getRuntimeSettingsCached: getRuntimeSettingsCached2,
    defaultSessionTimeoutMinutes,
    intervalMs = 6e4
  } = options;
  let running = false;
  const handle = setInterval(async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const now = Date.now();
      const activities = await storage2.getActiveActivities();
      const runtimeSettings = await getRuntimeSettingsCached2();
      const idleMinutes = Math.max(
        1,
        runtimeSettings.sessionTimeoutMinutes || runtimeSettings.wsIdleMinutes || defaultSessionTimeoutMinutes
      );
      const idleMs = idleMinutes * 60 * 1e3;
      for (const activity of activities) {
        if (!activity.lastActivityTime) {
          continue;
        }
        const last = new Date(activity.lastActivityTime).getTime();
        if (now - last <= idleMs) {
          continue;
        }
        const freshActivity = await storage2.getActivityById(activity.id);
        if (!freshActivity || freshActivity.isActive === false) {
          continue;
        }
        const freshLast = freshActivity.lastActivityTime ? new Date(freshActivity.lastActivityTime).getTime() : 0;
        if (!freshLast || now - freshLast <= idleMs) {
          continue;
        }
        console.log(`IDLE TIMEOUT: ${activity.username} (${activity.id})`);
        await storage2.updateActivity(activity.id, {
          isActive: false,
          logoutTime: /* @__PURE__ */ new Date(),
          logoutReason: "IDLE_TIMEOUT"
        });
        const socket = connectedClients2.get(activity.id);
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "idle_timeout",
            reason: "Session expired due to inactivity"
          }));
          socket.close();
        }
        connectedClients2.delete(activity.id);
        await storage2.clearCollectionNicknameSessionByActivity(activity.id);
        await storage2.createAuditLog({
          action: "SESSION_IDLE_TIMEOUT",
          performedBy: activity.username,
          details: `Auto logout after ${idleMinutes} minutes idle`
        });
      }
    } catch (error) {
      console.error("Idle session checker error:", error);
    } finally {
      running = false;
    }
  }, intervalMs);
  handle.unref();
  return handle;
}
var init_idle_session_sweeper = __esm({
  "server/internal/idle-session-sweeper.ts"() {
    "use strict";
  }
});

// server/internal/runtime-config-manager.ts
import jwt from "jsonwebtoken";
function createRuntimeConfigManager(options) {
  const {
    storage: storage2,
    secret,
    defaults,
    maintenanceCacheTtlMs,
    runtimeSettingsCacheTtlMs
  } = options;
  let maintenanceCache = null;
  let runtimeSettingsCache = null;
  const invalidateMaintenanceCache2 = () => {
    maintenanceCache = null;
  };
  const invalidateRuntimeSettingsCache2 = () => {
    runtimeSettingsCache = null;
  };
  const getRuntimeSettingsCached2 = async (force = false) => {
    const now = Date.now();
    if (!force && runtimeSettingsCache && now - runtimeSettingsCache.cachedAt < runtimeSettingsCacheTtlMs) {
      return runtimeSettingsCache.settings;
    }
    const config = await storage2.getAppConfig();
    const settings = {
      sessionTimeoutMinutes: Number.isFinite(config.sessionTimeoutMinutes) ? Math.max(1, config.sessionTimeoutMinutes) : defaults.sessionTimeoutMinutes,
      wsIdleMinutes: Number.isFinite(config.wsIdleMinutes) ? Math.max(1, config.wsIdleMinutes) : defaults.wsIdleMinutes,
      aiEnabled: config.aiEnabled !== false,
      semanticSearchEnabled: config.semanticSearchEnabled !== false,
      aiTimeoutMs: Number.isFinite(config.aiTimeoutMs) ? Math.max(1e3, config.aiTimeoutMs) : defaults.aiTimeoutMs,
      searchResultLimit: Number.isFinite(config.searchResultLimit) ? Math.min(5e3, Math.max(10, Math.floor(config.searchResultLimit))) : defaults.searchResultLimit,
      viewerRowsPerPage: Number.isFinite(config.viewerRowsPerPage) ? Math.min(500, Math.max(10, Math.floor(config.viewerRowsPerPage))) : defaults.viewerRowsPerPage
    };
    runtimeSettingsCache = { settings, cachedAt: now };
    return settings;
  };
  const getMaintenanceStateCached2 = async (force = false) => {
    const now = Date.now();
    if (!force && maintenanceCache && now - maintenanceCache.cachedAt < maintenanceCacheTtlMs) {
      return maintenanceCache.state;
    }
    const state = await storage2.getMaintenanceState(/* @__PURE__ */ new Date());
    maintenanceCache = { state, cachedAt: now };
    return state;
  };
  const extractRoleFromToken = (req) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    if (!token) return null;
    try {
      const decoded = jwt.verify(token, secret);
      return decoded?.role || null;
    } catch {
      return null;
    }
  };
  const isMaintenanceBypassPath = (pathname) => pathname.startsWith("/api/login") || pathname.startsWith("/api/auth/login") || pathname.startsWith("/api/health") || pathname.startsWith("/api/maintenance-status") || pathname.startsWith("/api/settings/maintenance") || pathname.startsWith("/internal/") || pathname.startsWith("/ws");
  const maintenanceGuard2 = async (req, res, next) => {
    try {
      if (isMaintenanceBypassPath(req.path)) {
        return next();
      }
      const state = await getMaintenanceStateCached2();
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
          if (!blockedSoftPrefixes.some((prefix) => req.path.startsWith(prefix))) {
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
  };
  return {
    invalidateMaintenanceCache: invalidateMaintenanceCache2,
    invalidateRuntimeSettingsCache: invalidateRuntimeSettingsCache2,
    getRuntimeSettingsCached: getRuntimeSettingsCached2,
    getMaintenanceStateCached: getMaintenanceStateCached2,
    maintenanceGuard: maintenanceGuard2
  };
}
var init_runtime_config_manager = __esm({
  "server/internal/runtime-config-manager.ts"() {
    "use strict";
  }
});

// server/internal/runtime-monitor-manager.ts
import { PerformanceObserver, monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(clamp(p, 0, 100) / 100 * (sorted.length - 1));
  return sorted[index];
}
function roundMetric(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}
function getRamPercent() {
  const total = Number(os.totalmem() || 0);
  const free = Number(os.freemem() || 0);
  if (total <= 0) return 0;
  return roundMetric((total - free) / total * 100, 2);
}
function createRuntimeMonitorManager(options) {
  const defaultControlState = {
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
  let controlState = defaultControlState;
  let preAllocatedBuffer = null;
  let activeRequests = 0;
  const latencySamples = [];
  let requestCounter = 0;
  let reqRatePerSec = 0;
  let lastCpuUsage = process.cpuUsage();
  let lastCpuTs = Date.now();
  let cpuPercent = 0;
  let gcCountWindow = 0;
  let gcPerMinute = 0;
  let lastDbLatencyMs = 0;
  let lastAiLatencyMs = 0;
  let lastAiLatencyObservedAt = 0;
  let intelligenceInFlight = false;
  let lastPgPoolWarningAt = 0;
  let lastPgPoolWarningSignature = "";
  const intelligenceHistory = {
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
  const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
  eventLoopHistogram.enable();
  const circuitAi = new CircuitBreaker({
    name: "ai",
    threshold: 0.4,
    minRequests: 10,
    cooldownMs: 8e3
  });
  const circuitDb = new CircuitBreaker({
    name: "db",
    threshold: 0.35,
    minRequests: 20,
    cooldownMs: 12e3
  });
  const circuitExport = new CircuitBreaker({
    name: "export",
    threshold: 0.4,
    minRequests: 8,
    cooldownMs: 15e3
  });
  let gcObserver = null;
  let gcObserverAttached = false;
  let processHandlersAttached = false;
  let runtimeLoopHandle = null;
  function getEventLoopLagMs() {
    const lagMs = Number(eventLoopHistogram.mean) / 1e6;
    return Number.isFinite(lagMs) ? lagMs : 0;
  }
  function recordLatency(ms) {
    if (!Number.isFinite(ms) || ms < 0) return;
    latencySamples.push(ms);
    if (latencySamples.length > LATENCY_WINDOW) {
      latencySamples.splice(0, latencySamples.length - LATENCY_WINDOW);
    }
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
    if (idleMs <= options.aiLatencyStaleAfterMs) {
      return Math.max(0, lastAiLatencyMs);
    }
    const decayWindowMs = idleMs - options.aiLatencyStaleAfterMs;
    const decayFactor = Math.exp(-Math.LN2 * decayWindowMs / options.aiLatencyDecayHalfLifeMs);
    return Math.max(0, lastAiLatencyMs * decayFactor);
  }
  function maybeWarnPgPoolPressure(source) {
    const total = Number(options.pool.totalCount || 0);
    const idle = Number(options.pool.idleCount || 0);
    const waiting = Number(options.pool.waitingCount || 0);
    const max = Number(options.pool?.options?.max || 0);
    const nearMax = max > 0 ? total >= Math.max(1, max - 1) : false;
    const hasPressure = waiting > 0 || idle === 0 || nearMax;
    if (!hasPressure) {
      lastPgPoolWarningSignature = "";
      return;
    }
    const signature = `${total}:${idle}:${waiting}:${max}`;
    const now = Date.now();
    if (signature === lastPgPoolWarningSignature && now - lastPgPoolWarningAt < options.pgPoolWarnCooldownMs) {
      return;
    }
    lastPgPoolWarningAt = now;
    lastPgPoolWarningSignature = signature;
    console.warn(
      `[PG_POOL] total=${total} idle=${idle} waiting=${waiting} max=${max} source=${source}`
    );
  }
  async function withDbCircuit2(operation) {
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
  async function withAiCircuit2(operation) {
    return circuitAi.execute(async () => {
      const start = Date.now();
      try {
        return await operation();
      } finally {
        observeAiLatency(Date.now() - start);
      }
    });
  }
  async function withExportCircuit2(operation) {
    return circuitExport.execute(operation);
  }
  function getControlState2() {
    return controlState;
  }
  function applyControlState(payload) {
    controlState = {
      ...defaultControlState,
      ...payload
    };
    const preAllocateMB = clamp(controlState.preAllocateMB, 0, options.lowMemoryMode ? 8 : 32);
    if (preAllocateMB > 0) {
      const targetBytes = preAllocateMB * 1024 * 1024;
      if (!preAllocatedBuffer || preAllocatedBuffer.length !== targetBytes) {
        preAllocatedBuffer = Buffer.alloc(targetBytes);
      }
    } else {
      preAllocatedBuffer = null;
    }
  }
  function getDbProtection2() {
    return controlState.dbProtection || lastDbLatencyMs > 1e3;
  }
  function computeInternalMonitorSnapshot2() {
    const workerSamples = controlState.workers || [];
    const maxWorkerP95 = workerSamples.reduce(
      (max, worker) => Math.max(max, Number(worker.latencyP95Ms || 0)),
      0
    );
    const p95LatencyMs = Math.max(percentile(latencySamples, 95), maxWorkerP95);
    const slowQueryCount = workerSamples.filter(
      (worker) => Number(worker.dbLatencyMs || 0) > 600
    ).length;
    const aiFailureRate = clamp(circuitAi.getSnapshot().failureRate * 100, 0, 100);
    const dbFailureRate = clamp(circuitDb.getSnapshot().failureRate * 100, 0, 100);
    const exportFailureRate = clamp(circuitExport.getSnapshot().failureRate * 100, 0, 100);
    const errorRate = Math.max(aiFailureRate, dbFailureRate, exportFailureRate);
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
      mode: controlState.mode,
      cpuPercent: cpu,
      ramPercent: ram,
      p95LatencyMs: roundMetric(p95LatencyMs, 2),
      errorRate: roundMetric(errorRate, 2),
      dbLatencyMs: dbLatency,
      aiLatencyMs: aiLatency,
      eventLoopLagMs: loopLag,
      requestRate: roundMetric(reqRatePerSec, 2),
      activeRequests,
      queueLength: options.getSearchQueueLength(),
      workerCount: controlState.workerCount,
      maxWorkers: controlState.maxWorkers,
      dbProtection: getDbProtection2(),
      slowQueryCount,
      dbConnections: Math.max(
        0,
        Number(options.pool.totalCount || 0) + Number(options.pool.waitingCount || 0)
      ),
      aiFailRate: roundMetric(aiFailureRate, 2),
      bottleneckType,
      updatedAt: controlState.updatedAt
    };
  }
  function buildInternalMonitorAlerts2(snapshot) {
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
      const monitorSnapshot = computeInternalMonitorSnapshot2();
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
      await options.evaluateSystem(snapshot, intelligenceHistory);
    } catch (err) {
      if (options.apiDebugLogs) {
        console.warn("Intelligence cycle error:", err);
      }
    } finally {
      intelligenceInFlight = false;
    }
  }
  function getRequestRate2() {
    return reqRatePerSec;
  }
  function getLatencyP952() {
    return percentile(latencySamples, 95);
  }
  function getLocalCircuitSnapshots2() {
    return {
      ai: circuitAi.getSnapshot(),
      db: circuitDb.getSnapshot(),
      export: circuitExport.getSnapshot()
    };
  }
  function recordGcEntries(entryCount) {
    if (entryCount > 0) {
      gcCountWindow += entryCount;
    }
  }
  function recordRequestStarted2() {
    activeRequests += 1;
    requestCounter += 1;
  }
  function recordRequestFinished2(elapsedMs) {
    activeRequests = Math.max(0, activeRequests - 1);
    recordLatency(elapsedMs);
  }
  function attachGcObserver2() {
    if (gcObserverAttached) return;
    gcObserverAttached = true;
    try {
      gcObserver = new PerformanceObserver((list) => {
        recordGcEntries(list.getEntries().length);
      });
      gcObserver.observe({ entryTypes: ["gc"] });
    } catch {
    }
  }
  function attachProcessMessageHandlers2({ onGracefulShutdown }) {
    if (processHandlersAttached || typeof process.on !== "function") {
      return;
    }
    processHandlersAttached = true;
    process.on("message", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type !== "control-state" || !msg.payload) return;
      applyControlState(msg.payload);
    });
    process.on("message", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type !== "graceful-shutdown") return;
      setTimeout(() => {
        onGracefulShutdown();
      }, 50);
    });
  }
  function startRuntimeLoops2({ clearSearchCache }) {
    if (runtimeLoopHandle) return;
    runtimeLoopHandle = setInterval(() => {
      reqRatePerSec = requestCounter / 5;
      requestCounter = 0;
      gcPerMinute = gcCountWindow * 12;
      gcCountWindow = 0;
      const now = Date.now();
      const currentCpu = process.cpuUsage();
      const cpuDeltaMicros = currentCpu.user - lastCpuUsage.user + (currentCpu.system - lastCpuUsage.system);
      const elapsedMs = Math.max(1, now - lastCpuTs);
      const cpuCorePercent = cpuDeltaMicros / 1e3 / elapsedMs * 100;
      cpuPercent = clamp(cpuCorePercent / Math.max(1, controlState.workerCount || 1), 0, 100);
      lastCpuUsage = currentCpu;
      lastCpuTs = now;
      if (typeof process.send === "function") {
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
            queueLength: options.getSearchQueueLength(),
            heapUsedMB: mem2.heapUsed / (1024 * 1024),
            heapTotalMB: mem2.heapTotal / (1024 * 1024),
            oldSpaceMB: mem2.heapUsed / (1024 * 1024),
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
        clearSearchCache();
        if (typeof process.send === "function") {
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
    }, 5e3);
    runtimeLoopHandle.unref();
    void runIntelligenceCycle();
  }
  return {
    attachGcObserver: attachGcObserver2,
    attachProcessMessageHandlers: attachProcessMessageHandlers2,
    buildInternalMonitorAlerts: buildInternalMonitorAlerts2,
    computeInternalMonitorSnapshot: computeInternalMonitorSnapshot2,
    getControlState: getControlState2,
    getDbProtection: getDbProtection2,
    getLatencyP95: getLatencyP952,
    getLocalCircuitSnapshots: getLocalCircuitSnapshots2,
    getRequestRate: getRequestRate2,
    recordRequestFinished: recordRequestFinished2,
    recordRequestStarted: recordRequestStarted2,
    startRuntimeLoops: startRuntimeLoops2,
    withAiCircuit: withAiCircuit2,
    withDbCircuit: withDbCircuit2,
    withExportCircuit: withExportCircuit2
  };
}
var LATENCY_WINDOW, MAX_INTELLIGENCE_HISTORY;
var init_runtime_monitor_manager = __esm({
  "server/internal/runtime-monitor-manager.ts"() {
    "use strict";
    init_circuitBreaker();
    LATENCY_WINDOW = 400;
    MAX_INTELLIGENCE_HISTORY = 300;
  }
});

// server/internal/wrapAsyncPrototypeMethods.ts
function wrapAsyncPrototypeMethods(target, options) {
  const prototype = Object.getPrototypeOf(target);
  if (!prototype || typeof prototype !== "object") {
    return;
  }
  const host = target;
  for (const methodName of Object.getOwnPropertyNames(prototype)) {
    if (options.exclude?.has(methodName)) {
      continue;
    }
    const candidate = Reflect.get(target, methodName);
    if (typeof candidate !== "function") {
      continue;
    }
    const method = candidate;
    if (method.constructor?.name !== "AsyncFunction") {
      continue;
    }
    const original = method.bind(target);
    host[methodName] = async (...args) => options.wrap(() => original(...args));
  }
}
var init_wrapAsyncPrototypeMethods = __esm({
  "server/internal/wrapAsyncPrototypeMethods.ts"() {
    "use strict";
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
import crypto7 from "crypto";
var DEFAULT_DURATION_MS, MAX_DURATION_MS, DEFAULT_MAGNITUDE, clamp2, ChaosEngine;
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
    clamp2 = (value, min, max) => Math.max(min, Math.min(max, value));
    ChaosEngine = class {
      constructor() {
        this.events = /* @__PURE__ */ new Map();
      }
      inject(input) {
        const now = Date.now();
        const magnitude = Number.isFinite(input.magnitude) ? Number(input.magnitude) : DEFAULT_MAGNITUDE[input.type];
        const durationMs = clamp2(
          Number.isFinite(input.durationMs) ? Number(input.durationMs) : DEFAULT_DURATION_MS,
          5e3,
          MAX_DURATION_MS
        );
        const event = {
          id: crypto7.randomUUID(),
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
              next.cpuPercent = clamp2(next.cpuPercent + event.magnitude, 0, 100);
              next.p95LatencyMs += event.magnitude * 2;
              break;
            case "db_latency_spike":
              next.dbLatencyMs = Math.max(0, next.dbLatencyMs + event.magnitude);
              next.p95LatencyMs += event.magnitude * 0.4;
              next.errorRate = clamp2(next.errorRate + 1.5, 0, 100);
              break;
            case "ai_delay":
              next.aiLatencyMs = Math.max(0, next.aiLatencyMs + event.magnitude);
              next.queueSize = Math.max(0, next.queueSize + Math.ceil(event.magnitude / 120));
              next.aiFailRate = clamp2(next.aiFailRate + 0.8, 0, 100);
              break;
            case "worker_crash": {
              const drop = Math.max(1, Math.floor(event.magnitude));
              next.workerCount = Math.max(1, next.workerCount - drop);
              next.p95LatencyMs += 80 * drop;
              next.activeRequests += 10 * drop;
              break;
            }
            case "memory_pressure":
              next.ramPercent = clamp2(next.ramPercent + event.magnitude, 0, 100);
              next.eventLoopLagMs += event.magnitude * 1.5;
              break;
            default:
              break;
          }
        }
        next.score = clamp2(next.score - 10, 0, 100);
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
          const count3 = Number(result.rows?.[0]?.count || 0);
          if (count3 > 5) return 0.85;
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
function clamp3(value, min, max) {
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
        const stabilityIndex = clamp3(100 - anomalySummary.score * 100, 0, 100);
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

// server/lib/logger.ts
function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (REDACT_KEYS.some((sensitive) => normalizedKey.includes(sensitive))) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = sanitize(nested);
  }
  return output;
}
function log(level, message, meta) {
  if (level === "debug" && !DEBUG_LOGS) return;
  const payload = meta ? sanitize(meta) : void 0;
  const line = payload ? `${message} ${JSON.stringify(payload)}` : message;
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
var DEBUG_LOGS, REDACT_KEYS, logger;
var init_logger = __esm({
  "server/lib/logger.ts"() {
    "use strict";
    DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";
    REDACT_KEYS = [
      "password",
      "passwordhash",
      "token",
      "authorization",
      "sessionsecret",
      "icnumber",
      "accountnumber",
      "fingerprint"
    ];
    logger = {
      info(message, meta) {
        log("info", message, meta);
      },
      warn(message, meta) {
        log("warn", message, meta);
      },
      error(message, meta) {
        log("error", message, meta);
      },
      debug(message, meta) {
        log("debug", message, meta);
      }
    };
  }
});

// server/auth/guards.ts
import jwt2 from "jsonwebtoken";
function createAuthGuards(options) {
  const storage2 = options.storage;
  const secret = options.secret || getSessionSecret();
  const tabVisibilityCache = /* @__PURE__ */ new Map();
  async function getRoleTabVisibilityCached(role) {
    if (role === "superuser") return {};
    const now = Date.now();
    const cached = tabVisibilityCache.get(role);
    if (cached && now - cached.cachedAt < TAB_VISIBILITY_CACHE_TTL_MS) {
      return cached.tabs;
    }
    const tabs = await storage2.getRoleTabVisibility(role);
    tabVisibilityCache.set(role, { tabs, cachedAt: now });
    return tabs;
  }
  const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token required" });
    }
    try {
      const decoded = jwt2.verify(token, secret);
      const activity = await storage2.getActivityById(decoded.activityId);
      if (!activity || activity.isActive === false || activity.logoutTime !== null) {
        return res.status(401).json({
          message: "Session expired. Please login again.",
          forceLogout: true
        });
      }
      const isVisitorBanned = await storage2.isVisitorBanned(
        activity.fingerprint ?? null,
        activity.ipAddress ?? null
      );
      if (isVisitorBanned) {
        return res.status(401).json({
          message: "Session banned. Please login again.",
          forceLogout: true
        });
      }
      await storage2.updateActivity(decoded.activityId, {
        lastActivityTime: /* @__PURE__ */ new Date(),
        isActive: true
      });
      req.user = {
        userId: activity.userId || decoded.userId,
        username: activity.username || decoded.username,
        role: activity.role || decoded.role,
        activityId: decoded.activityId
      };
      return next();
    } catch (error) {
      logger.debug("Token validation failed", {
        path: req.path,
        method: req.method,
        error: error?.message
      });
      return res.status(403).json({ message: "Invalid token" });
    }
  };
  const requireRole = (...roles) => {
    return (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      return next();
    };
  };
  const requireTabAccess = (tabId) => {
    return async (req, res, next) => {
      try {
        const role = req.user?.role;
        if (!role) {
          return res.status(401).json({ message: "Unauthenticated" });
        }
        if (role === "superuser") {
          return next();
        }
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
      } catch (error) {
        logger.error("Tab access guard error", {
          tabId,
          message: error?.message
        });
        return res.status(500).json({ message: "Failed to validate tab access" });
      }
    };
  };
  const requireMonitorAccess = async (req, res, next) => {
    try {
      const role = req.user?.role;
      if (!role) {
        return res.status(401).json({ message: "Unauthenticated" });
      }
      if (role === "superuser") {
        return next();
      }
      if (role !== "admin" && role !== "user") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const tabs = await getRoleTabVisibilityCached(role);
      if (tabs.monitor !== true) {
        return res.status(403).json({ message: "System Monitor access is disabled for this role." });
      }
      return next();
    } catch (error) {
      logger.error("Monitor access guard error", {
        message: error?.message
      });
      return res.status(500).json({ message: "Failed to validate monitor access" });
    }
  };
  return {
    authenticateToken,
    requireRole,
    requireTabAccess,
    requireMonitorAccess,
    clearTabVisibilityCache() {
      tabVisibilityCache.clear();
    }
  };
}
var TAB_VISIBILITY_CACHE_TTL_MS;
var init_guards = __esm({
  "server/auth/guards.ts"() {
    "use strict";
    init_security();
    init_logger();
    TAB_VISIBILITY_CACHE_TTL_MS = 5e3;
  }
});

// server/http/errors.ts
function badRequest(message, code) {
  return new HttpError(400, message, { code });
}
function unauthorized(message = "Authentication required.", code) {
  return new HttpError(401, message, { code });
}
function forbidden(message = "Insufficient permissions.", code) {
  return new HttpError(403, message, { code });
}
function notFound(message = "Resource not found.", code) {
  return new HttpError(404, message, { code });
}
function conflict(message, code) {
  return new HttpError(409, message, { code });
}
var HttpError;
var init_errors = __esm({
  "server/http/errors.ts"() {
    "use strict";
    HttpError = class extends Error {
      constructor(statusCode, message, options) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
        this.code = options?.code;
        this.expose = options?.expose ?? statusCode < 500;
      }
    };
  }
});

// server/middleware/error-handler.ts
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      ok: false,
      message: err.message,
      ...err.code ? { error: { code: err.code, message: err.message } } : {}
    });
  }
  const error = err;
  logger.error("Unhandled API error", {
    path: req.path,
    method: req.method,
    code: error?.code,
    message: error?.message
  });
  return res.status(500).json({
    ok: false,
    message: "Internal server error"
  });
}
var init_error_handler = __esm({
  "server/middleware/error-handler.ts"() {
    "use strict";
    init_errors();
    init_logger();
  }
});

// server/auth/credentials.ts
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
var CREDENTIAL_USERNAME_REGEX, CREDENTIAL_PASSWORD_MIN_LENGTH, CREDENTIAL_BCRYPT_COST;
var init_credentials = __esm({
  "server/auth/credentials.ts"() {
    "use strict";
    CREDENTIAL_USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
    CREDENTIAL_PASSWORD_MIN_LENGTH = 8;
    CREDENTIAL_BCRYPT_COST = 12;
  }
});

// server/http/async-handler.ts
function asyncHandler(fn) {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
var init_async_handler = __esm({
  "server/http/async-handler.ts"() {
    "use strict";
  }
});

// server/http/validation.ts
function ensureObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return null;
}
function readNonEmptyString(value) {
  return String(value ?? "").trim();
}
function readInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}
function readStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => readNonEmptyString(item)).filter(Boolean);
  }
  const normalized = readNonEmptyString(value);
  if (!normalized) return [];
  return normalized.split(",").map((part) => readNonEmptyString(part)).filter(Boolean);
}
function readDate(value) {
  const normalized = readNonEmptyString(value);
  if (!normalized) return void 0;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return void 0;
  }
  return parsed;
}
var init_validation = __esm({
  "server/http/validation.ts"() {
    "use strict";
  }
});

// server/lib/browser.ts
function parseBrowser(userAgent) {
  if (!userAgent) return "Unknown";
  const ua = userAgent;
  const uaLower = ua.toLowerCase();
  const extractVersion = (pattern) => {
    const match = ua.match(pattern);
    if (match && match[1]) {
      return match[1].split(".")[0];
    }
    return "";
  };
  if (uaLower.includes("edg/")) {
    const version = extractVersion(/Edg\/(\d+[\d.]*)/i);
    return version ? `Edge ${version}` : "Edge";
  }
  if (uaLower.includes("edge/")) {
    const version = extractVersion(/Edge\/(\d+[\d.]*)/i);
    return version ? `Edge ${version}` : "Edge";
  }
  if (uaLower.includes("opr/")) {
    const version = extractVersion(/OPR\/(\d+[\d.]*)/i);
    return version ? `Opera ${version}` : "Opera";
  }
  if (uaLower.includes("opera/")) {
    const version = extractVersion(/Opera\/(\d+[\d.]*)/i);
    return version ? `Opera ${version}` : "Opera";
  }
  if (uaLower.includes("brave")) {
    const version = extractVersion(/Brave\/(\d+[\d.]*)/i) || extractVersion(/Chrome\/(\d+[\d.]*)/i);
    return version ? `Brave ${version}` : "Brave";
  }
  if (uaLower.includes("duckduckgo")) {
    const version = extractVersion(/DuckDuckGo\/(\d+[\d.]*)/i);
    return version ? `DuckDuckGo ${version}` : "DuckDuckGo";
  }
  if (uaLower.includes("vivaldi")) {
    const version = extractVersion(/Vivaldi\/(\d+[\d.]*)/i);
    return version ? `Vivaldi ${version}` : "Vivaldi";
  }
  if (uaLower.includes("firefox/") || uaLower.includes("fxios/")) {
    const version = extractVersion(/Firefox\/(\d+[\d.]*)/i) || extractVersion(/FxiOS\/(\d+[\d.]*)/i);
    return version ? `Firefox ${version}` : "Firefox";
  }
  if (uaLower.includes("safari/") && !uaLower.includes("chrome/") && !uaLower.includes("chromium/")) {
    const version = extractVersion(/Version\/(\d+[\d.]*)/i);
    return version ? `Safari ${version}` : "Safari";
  }
  if (uaLower.includes("chrome/") || uaLower.includes("crios/") || uaLower.includes("chromium/")) {
    const version = extractVersion(/Chrome\/(\d+[\d.]*)/i) || extractVersion(/CriOS\/(\d+[\d.]*)/i);
    return version ? `Chrome ${version}` : "Chrome";
  }
  if (uaLower.includes("msie") || uaLower.includes("trident/")) {
    const version = extractVersion(/MSIE (\d+[\d.]*)/i) || extractVersion(/rv:(\d+[\d.]*)/i);
    return version ? `Internet Explorer ${version}` : "Internet Explorer";
  }
  return "Unknown";
}
var init_browser = __esm({
  "server/lib/browser.ts"() {
    "use strict";
  }
});

// server/routes/auth.routes.ts
import bcrypt3 from "bcrypt";
import jwt3 from "jsonwebtoken";
import { WebSocket as WebSocket2 } from "ws";
function registerAuthRoutes(app2, deps) {
  const { storage: storage2, authenticateToken, requireRole, connectedClients: connectedClients2 } = deps;
  const jwtSecret = getSessionSecret();
  const closeActivitySockets = (activityIds, reason) => {
    for (const activityId of activityIds) {
      const socket = connectedClients2.get(activityId);
      if (socket && socket.readyState === WebSocket2.OPEN) {
        socket.send(JSON.stringify({ type: "logout", reason }));
        socket.close();
      }
      connectedClients2.delete(activityId);
      void storage2.clearCollectionNicknameSessionByActivity(activityId);
    }
  };
  const handleLogin = asyncHandler(async (req, res) => {
    const body = ensureObject(req.body) || {};
    const username = normalizeUsernameInput(body.username);
    const password = String(body.password ?? "");
    const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : null;
    const pcName = typeof body.pcName === "string" ? body.pcName : null;
    const browser = typeof body.browser === "string" ? body.browser : null;
    const user = await storage2.getUserByUsername(username);
    if (!user) {
      await storage2.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: username || "unknown",
        details: "User not found"
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const visitorBanned = await storage2.isVisitorBanned(
      fingerprint,
      req.ip || req.socket.remoteAddress || null
    );
    if (visitorBanned || user.isBanned) {
      await storage2.createAuditLog({
        action: "LOGIN_FAILED_BANNED",
        performedBy: user.username,
        details: visitorBanned ? "Visitor is banned" : "User is banned"
      });
      return res.status(403).json({ message: "Account is banned", banned: true });
    }
    const validPassword = await bcrypt3.compare(password, user.passwordHash);
    if (!validPassword) {
      await storage2.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: user.username,
        details: "Invalid password"
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const browserName = parseBrowser(browser || req.headers["user-agent"]);
    if (user.role === "superuser") {
      const enforceSingleSession = await storage2.getBooleanSystemSetting(
        "enforce_superuser_single_session",
        false
      );
      if (enforceSingleSession) {
        const activeSessions = await storage2.getActiveActivitiesByUsername(user.username);
        if (activeSessions.length > 0) {
          await storage2.createAuditLog({
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
      await storage2.deactivateUserSessionsByFingerprint(user.username, fingerprint);
    }
    const activity = await storage2.createActivity({
      userId: user.id,
      username: user.username,
      role: user.role,
      pcName,
      browser: browserName,
      fingerprint,
      ipAddress: req.ip || req.socket.remoteAddress || null
    });
    const token = jwt3.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        activityId: activity.id
      },
      jwtSecret,
      { expiresIn: "24h" }
    );
    await storage2.createAuditLog({
      action: "LOGIN_SUCCESS",
      performedBy: user.username,
      details: `Login from ${browserName}`
    });
    return res.json({
      token,
      username: user.username,
      role: user.role,
      user: { username: user.username, role: user.role },
      activityId: activity.id
    });
  });
  app2.post("/api/login", handleLogin);
  app2.post("/api/auth/login", handleLogin);
  app2.get("/api/auth/me", authenticateToken, (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthenticated" });
    }
    return res.json({
      user: {
        username: req.user.username,
        role: req.user.role,
        activityId: req.user.activityId
      }
    });
  });
  app2.get("/api/me", authenticateToken, asyncHandler(async (req, res) => {
    if (!req.user) {
      return sendCredentialError(res, 401, "PERMISSION_DENIED", "Authentication required.");
    }
    const user = req.user.userId ? await storage2.getUser(req.user.userId) : await storage2.getUserByUsername(req.user.username);
    if (!user) {
      return sendCredentialError(res, 404, "USER_NOT_FOUND", "User not found.");
    }
    return res.json({
      id: user.id,
      username: user.username,
      role: user.role
    });
  }));
  app2.patch("/api/me/credentials", authenticateToken, asyncHandler(async (req, res) => {
    if (!req.user) {
      return sendCredentialError(res, 401, "PERMISSION_DENIED", "Authentication required.");
    }
    const actor = req.user.userId ? await storage2.getUser(req.user.userId) : await storage2.getUserByUsername(req.user.username);
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
        return sendCredentialError(res, 400, "USERNAME_TAKEN", "Username must match ^[a-zA-Z0-9._-]{3,32}$.");
      }
      const existing = await storage2.getUserByUsername(normalized);
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
      const currentPasswordMatch = await bcrypt3.compare(currentPasswordRaw, actor.passwordHash);
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
      const sameAsCurrent = await bcrypt3.compare(nextPasswordRaw, actor.passwordHash);
      if (sameAsCurrent) {
        return sendCredentialError(res, 400, "INVALID_PASSWORD", "New password must be different from current password.");
      }
      nextPasswordHash = await bcrypt3.hash(nextPasswordRaw, CREDENTIAL_BCRYPT_COST);
      passwordChanged = true;
    }
    if (!usernameChanged && !passwordChanged) {
      return res.json({
        ok: true,
        user: { id: actor.id, username: actor.username, role: actor.role }
      });
    }
    const activeSessions = passwordChanged ? await storage2.getActiveActivitiesByUsername(actor.username) : [];
    let updatedUser;
    try {
      updatedUser = await storage2.updateUserCredentials({
        userId: actor.id,
        newUsername: nextUsername,
        newPasswordHash: nextPasswordHash,
        passwordChangedAt: passwordChanged ? /* @__PURE__ */ new Date() : void 0
      });
    } catch (error) {
      if (String(error?.code || "") === "23505") {
        return sendCredentialError(res, 409, "USERNAME_TAKEN", "Username already exists.");
      }
      throw error;
    }
    if (!updatedUser) {
      return sendCredentialError(res, 404, "USER_NOT_FOUND", "User not found.");
    }
    if (usernameChanged && !passwordChanged && nextUsername) {
      await storage2.updateActivitiesUsername(actor.username, nextUsername);
    }
    if (usernameChanged) {
      await storage2.createAuditLog({
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
      await storage2.createAuditLog({
        action: "USER_PASSWORD_CHANGED",
        performedBy: actor.id,
        targetUser: updatedUser.id,
        details: buildCredentialAuditDetails({
          actor_user_id: actor.id,
          target_user_id: updatedUser.id,
          changedField: "password"
        })
      });
      await storage2.deactivateUserActivities(actor.username, "PASSWORD_CHANGED");
      if (updatedUser.username !== actor.username) {
        await storage2.deactivateUserActivities(updatedUser.username, "PASSWORD_CHANGED");
      }
      closeActivitySockets(
        activeSessions.map((activity) => activity.id),
        "Password changed. Please login again."
      );
    }
    return res.json({
      ok: true,
      forceLogout: passwordChanged,
      user: { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role }
    });
  }));
  app2.get("/api/admin/users", authenticateToken, asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== "superuser") {
      return sendCredentialError(res, 403, "PERMISSION_DENIED", "Only superuser can access this resource.");
    }
    const users3 = await storage2.getUsersByRoles(["admin", "user"]);
    return res.json({
      ok: true,
      users: users3.map((item) => ({
        id: item.id,
        username: item.username,
        role: item.role
      }))
    });
  }));
  app2.patch("/api/admin/users/:id/credentials", authenticateToken, asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== "superuser") {
      return sendCredentialError(res, 403, "PERMISSION_DENIED", "Only superuser can access this resource.");
    }
    const actor = req.user.userId ? await storage2.getUser(req.user.userId) : await storage2.getUserByUsername(req.user.username);
    if (!actor) {
      return sendCredentialError(res, 404, "USER_NOT_FOUND", "Actor user not found.");
    }
    const targetUserId = String(req.params.id || "").trim();
    if (!targetUserId) {
      return sendCredentialError(res, 404, "USER_NOT_FOUND", "Target user not found.");
    }
    const target = await storage2.getUser(targetUserId);
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
        return sendCredentialError(res, 400, "USERNAME_TAKEN", "Username must match ^[a-zA-Z0-9._-]{3,32}$.");
      }
      const existing = await storage2.getUserByUsername(normalized);
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
      const sameAsCurrent = await bcrypt3.compare(nextPasswordRaw, target.passwordHash);
      if (sameAsCurrent) {
        return sendCredentialError(res, 400, "INVALID_PASSWORD", "New password must be different from current password.");
      }
      nextPasswordHash = await bcrypt3.hash(nextPasswordRaw, CREDENTIAL_BCRYPT_COST);
      passwordChanged = true;
    }
    if (!usernameChanged && !passwordChanged) {
      return res.json({ ok: true });
    }
    const activeSessions = passwordChanged ? await storage2.getActiveActivitiesByUsername(target.username) : [];
    let updatedUser;
    try {
      updatedUser = await storage2.updateUserCredentials({
        userId: target.id,
        newUsername: nextUsername,
        newPasswordHash: nextPasswordHash,
        passwordChangedAt: passwordChanged ? /* @__PURE__ */ new Date() : void 0
      });
    } catch (error) {
      if (String(error?.code || "") === "23505") {
        return sendCredentialError(res, 409, "USERNAME_TAKEN", "Username already exists.");
      }
      throw error;
    }
    if (!updatedUser) {
      return sendCredentialError(res, 404, "USER_NOT_FOUND", "Target user not found.");
    }
    if (usernameChanged && !passwordChanged && nextUsername) {
      await storage2.updateActivitiesUsername(target.username, nextUsername);
    }
    if (usernameChanged) {
      await storage2.createAuditLog({
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
      await storage2.createAuditLog({
        action: "USER_PASSWORD_CHANGED",
        performedBy: actor.id,
        targetUser: updatedUser.id,
        details: buildCredentialAuditDetails({
          actor_user_id: actor.id,
          target_user_id: updatedUser.id,
          changedField: "password"
        })
      });
      await storage2.deactivateUserActivities(target.username, "PASSWORD_RESET_BY_SUPERUSER");
      if (updatedUser.username !== target.username) {
        await storage2.deactivateUserActivities(updatedUser.username, "PASSWORD_RESET_BY_SUPERUSER");
      }
      closeActivitySockets(
        activeSessions.map((activity) => activity.id),
        "Password reset by superuser. Please login again."
      );
    }
    return res.json({ ok: true });
  }));
  app2.get("/api/accounts", authenticateToken, requireRole("superuser"), asyncHandler(async (_req, res) => {
    const accounts = await storage2.getAccounts();
    return res.json(accounts);
  }));
  app2.post("/api/users", authenticateToken, requireRole("superuser"), asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const body = ensureObject(req.body) || {};
    const username = normalizeUsernameInput(body.username);
    const password = String(body.password ?? "");
    const role = String(body.role ?? "user").trim().toLowerCase();
    if (!CREDENTIAL_USERNAME_REGEX.test(username)) {
      return res.status(400).json({ message: "Invalid username format." });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: "Password does not meet minimum strength requirements." });
    }
    if (!["superuser", "admin", "user"].includes(role)) {
      return res.status(400).json({ message: "Invalid role." });
    }
    const existing = await storage2.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "Username already exists." });
    }
    const user = await storage2.createUser({ username, password, role });
    await storage2.createAuditLog({
      action: "CREATE_USER",
      performedBy: req.user.username,
      targetUser: user.id,
      details: `Created user with role: ${user.role}`
    });
    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      isBanned: user.isBanned
    });
  }));
}
var init_auth_routes = __esm({
  "server/routes/auth.routes.ts"() {
    "use strict";
    init_security();
    init_credentials();
    init_async_handler();
    init_validation();
    init_browser();
  }
});

// server/routes/activity.routes.ts
import { WebSocket as WebSocket3 } from "ws";
function buildActivityFilters(source) {
  return {
    status: readStringList(source.status),
    username: readNonEmptyString(source.username),
    ipAddress: readNonEmptyString(source.ipAddress),
    browser: readNonEmptyString(source.browser),
    dateFrom: readDate(source.dateFrom),
    dateTo: readDate(source.dateTo)
  };
}
function registerActivityRoutes(app2, deps) {
  const { storage: storage2, authenticateToken, requireRole, requireTabAccess, connectedClients: connectedClients2 } = deps;
  const closeSocket = async (activityId, payload) => {
    const socket = connectedClients2.get(activityId);
    if (socket && socket.readyState === WebSocket3.OPEN) {
      if (payload) {
        socket.send(JSON.stringify(payload));
      }
      socket.close();
    }
    connectedClients2.delete(activityId);
    await storage2.clearCollectionNicknameSessionByActivity(activityId);
  };
  app2.post("/api/activity/logout", authenticateToken, asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false });
    }
    const activityId = req.user.activityId;
    const activity = await storage2.getActivityById(activityId);
    if (!activity || activity.isActive === false) {
      return res.json({ success: true });
    }
    await storage2.updateActivity(activityId, {
      isActive: false,
      logoutTime: /* @__PURE__ */ new Date(),
      logoutReason: "USER_LOGOUT"
    });
    await closeSocket(activityId, {
      type: "logout",
      reason: "User logged out"
    });
    await storage2.createAuditLog({
      action: "LOGOUT",
      performedBy: req.user.username
    });
    return res.json({ success: true });
  }));
  app2.get(
    "/api/activity/all",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json({ activities: await storage2.getAllActivities() });
    })
  );
  app2.get(
    "/api/activity/filter",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      return res.json({ activities: await storage2.getFilteredActivities(buildActivityFilters(req.query)) });
    })
  );
  app2.delete(
    "/api/activity/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      const activityId = readNonEmptyString(req.params.id);
      if (!activityId) {
        return res.status(400).json({ success: false, message: "Invalid activityId" });
      }
      await storage2.deleteActivity(activityId);
      await closeSocket(activityId);
      return res.json({ success: true });
    })
  );
  app2.post(
    "/api/activity/kick",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      const body = ensureObject(req.body) || {};
      const activityId = readNonEmptyString(body.activityId);
      if (!activityId) {
        return res.status(400).json({ success: false, message: "Invalid activityId" });
      }
      const activity = await storage2.getActivityById(activityId);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }
      await storage2.updateActivity(activityId, {
        isActive: false,
        logoutTime: /* @__PURE__ */ new Date(),
        logoutReason: "KICKED"
      });
      await closeSocket(activityId, {
        type: "kicked",
        reason: "You have been logged out by an administrator."
      });
      await storage2.createAuditLog({
        action: "KICK_USER",
        performedBy: req.user.username,
        targetUser: activity.username,
        details: `Kicked activityId=${activityId}`
      });
      return res.json({ success: true });
    })
  );
  app2.post(
    "/api/activity/ban",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      const body = ensureObject(req.body) || {};
      const activityId = readNonEmptyString(body.activityId);
      if (!activityId) {
        return res.status(400).json({ success: false, message: "Invalid activityId" });
      }
      const activity = await storage2.getActivityById(activityId);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }
      const targetUser = await storage2.getUserByUsername(activity.username);
      if (targetUser?.role === "superuser") {
        return res.status(403).json({ message: "Cannot ban a superuser" });
      }
      await storage2.banVisitor({
        username: activity.username,
        role: activity.role,
        activityId: activity.id,
        fingerprint: activity.fingerprint ?? null,
        ipAddress: activity.ipAddress ?? null,
        browser: activity.browser ?? null,
        pcName: activity.pcName ?? null
      });
      await storage2.updateActivity(activityId, {
        isActive: false,
        logoutTime: /* @__PURE__ */ new Date(),
        logoutReason: "BANNED"
      });
      await closeSocket(activityId, {
        type: "banned",
        reason: "Your account has been banned."
      });
      await storage2.createAuditLog({
        action: "BAN_USER",
        performedBy: req.user.username,
        targetUser: activity.username,
        details: `Banned via activityId=${activityId}`
      });
      return res.json({ success: true });
    })
  );
  app2.post("/api/admin/ban", authenticateToken, requireRole("superuser"), asyncHandler(async (req, res) => {
    const body = ensureObject(req.body) || {};
    const username = readNonEmptyString(body.username);
    if (!username) {
      return res.status(400).json({ message: "Username required" });
    }
    const targetUser = await storage2.getUserByUsername(username);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }
    if (targetUser.role === "superuser") {
      return res.status(403).json({ message: "Cannot ban a superuser" });
    }
    const activeSessions = await storage2.getActiveActivitiesByUsername(username);
    await storage2.updateUserBan(username, true);
    await storage2.deactivateUserActivities(username, "BANNED");
    for (const activity of activeSessions) {
      await closeSocket(activity.id, {
        type: "banned",
        reason: "Your account has been banned."
      });
    }
    await storage2.createAuditLog({
      action: "BAN_USER",
      performedBy: req.user.username,
      targetUser: username,
      details: "Admin ban (account-level)"
    });
    return res.json({ success: true });
  }));
  app2.post(
    "/api/admin/unban",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      const body = ensureObject(req.body) || {};
      const banId = readNonEmptyString(body.banId);
      if (!banId) {
        return res.status(400).json({ message: "banId required" });
      }
      await storage2.unbanVisitor(banId);
      await storage2.createAuditLog({
        action: "UNBAN_USER",
        performedBy: req.user.username,
        details: `Unbanned banId=${banId}`
      });
      return res.json({ success: true });
    })
  );
  app2.get(
    "/api/users/banned",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      const bannedSessions = await storage2.getBannedSessions();
      return res.json({
        users: bannedSessions.map((session) => ({
          visitorId: session.banId,
          banId: session.banId,
          username: session.username,
          role: session.role,
          banInfo: {
            ipAddress: session.ipAddress ?? null,
            browser: session.browser ?? null,
            bannedAt: session.bannedAt ?? null
          }
        }))
      });
    })
  );
  app2.post("/api/activity/heartbeat", authenticateToken, asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: "Unauthenticated" });
    }
    await storage2.updateActivity(req.user.activityId, {
      lastActivityTime: /* @__PURE__ */ new Date(),
      isActive: true
    });
    return res.json({
      ok: true,
      status: "ONLINE",
      lastActivityTime: (/* @__PURE__ */ new Date()).toISOString()
    });
  }));
  app2.get(
    "/api/activities",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json(await storage2.getAllActivities());
    })
  );
  app2.get(
    "/api/activities/active",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (_req, res) => {
      return res.json(await storage2.getActiveActivities());
    })
  );
  app2.post(
    "/api/activities/filter",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("activity"),
    asyncHandler(async (req, res) => {
      const filters = buildActivityFilters(ensureObject(req.body) || {});
      return res.json(await storage2.getFilteredActivities(filters));
    })
  );
}
var init_activity_routes = __esm({
  "server/routes/activity.routes.ts"() {
    "use strict";
    init_async_handler();
    init_validation();
  }
});

// server/routes/imports.routes.ts
function registerImportRoutes(app2, deps) {
  const {
    storage: storage2,
    importsRepository: importsRepository2,
    importAnalysisService: importAnalysisService2,
    authenticateToken,
    requireRole,
    requireTabAccess,
    searchRateLimiter: searchRateLimiter2,
    getRuntimeSettingsCached: getRuntimeSettingsCached2,
    isDbProtected
  } = deps;
  app2.get("/api/data-rows", authenticateToken, asyncHandler(async (req, res) => {
    const importId = readNonEmptyString(req.query.importId);
    const limit = readInteger(req.query.limit, 10);
    const offset = readInteger(req.query.offset, 0);
    const search = String(req.query.q || "").trim();
    if (!importId) {
      return res.status(400).json({ error: "importId is required" });
    }
    const result = await storage2.searchDataRows({
      importId,
      search,
      limit,
      offset
    });
    return res.json(result);
  }));
  app2.get("/api/imports", authenticateToken, asyncHandler(async (_req, res) => {
    const imports3 = await importsRepository2.getImportsWithRowCounts();
    return res.json({ imports: imports3 });
  }));
  app2.post("/api/imports", authenticateToken, asyncHandler(async (req, res) => {
    const body = ensureObject(req.body) || {};
    const name = String(body.name ?? "");
    const filename = String(body.filename ?? "");
    const dataRows2 = Array.isArray(body.rows) ? body.rows : Array.isArray(body.data) ? body.data : [];
    if (!Array.isArray(dataRows2) || dataRows2.length === 0) {
      return res.status(400).json({ message: "No data rows provided" });
    }
    const importRecord = await storage2.createImport({
      name,
      filename,
      createdBy: req.user?.username
    });
    const insertChunkSize = 20;
    for (let index = 0; index < dataRows2.length; index += insertChunkSize) {
      const chunk = dataRows2.slice(index, index + insertChunkSize);
      await Promise.all(
        chunk.map(
          (row) => storage2.createDataRow({
            importId: importRecord.id,
            jsonDataJsonb: row
          })
        )
      );
    }
    if (req.user?.username) {
      await storage2.createAuditLog({
        action: "IMPORT_DATA",
        performedBy: req.user.username,
        targetResource: name,
        details: `Imported ${dataRows2.length} rows from ${filename}`
      });
    }
    return res.json(importRecord);
  }));
  app2.get("/api/imports/:id", authenticateToken, asyncHandler(async (req, res) => {
    const importId = readNonEmptyString(req.params.id);
    if (!importId) {
      return res.status(400).json({ message: "Import not found" });
    }
    const importRecord = await storage2.getImportById(importId);
    if (!importRecord) {
      return res.status(404).json({ message: "Import not found" });
    }
    const rows = await storage2.getDataRowsByImport(importId);
    return res.json({ import: importRecord, rows });
  }));
  app2.get("/api/imports/:id/data", authenticateToken, searchRateLimiter2, asyncHandler(async (req, res) => {
    const runtimeSettings = await getRuntimeSettingsCached2();
    const importId = readNonEmptyString(req.params.id);
    const page = Math.max(1, readInteger(req.query.page, 1));
    const requestedLimit = readInteger(req.query.limit, runtimeSettings.viewerRowsPerPage);
    const maxLimit = Math.min(isDbProtected() ? 120 : 500, runtimeSettings.viewerRowsPerPage);
    const limit = Math.max(10, Math.min(requestedLimit, maxLimit));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim();
    if (!importId) {
      return res.status(400).json({ message: "importId is required" });
    }
    const result = await storage2.searchDataRows({
      importId,
      search: search || null,
      limit,
      offset
    });
    const formattedRows = (result.rows || []).map((row) => ({
      id: row.id,
      importId: row.importId,
      jsonDataJsonb: row.jsonDataJsonb
    }));
    return res.json({
      rows: formattedRows,
      total: result.total || 0,
      page,
      limit
    });
  }));
  app2.get(
    "/api/imports/:id/analyze",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("analysis"),
    asyncHandler(async (req, res) => {
      const importRecord = await storage2.getImportById(req.params.id);
      if (!importRecord) {
        return res.status(404).json({ message: "Import not found" });
      }
      return res.json(await importAnalysisService2.analyzeImport(importRecord));
    })
  );
  app2.get("/api/analyze/all-summary", authenticateToken, asyncHandler(async (_req, res) => {
    const imports3 = await importsRepository2.getImportsWithRowCounts();
    return res.json(await importAnalysisService2.analyzeAll(imports3));
  }));
  app2.get(
    "/api/analyze/all",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("analysis"),
    asyncHandler(async (_req, res) => {
      const imports3 = await importsRepository2.getImportsWithRowCounts();
      return res.json(await importAnalysisService2.analyzeAll(imports3));
    })
  );
  app2.patch("/api/imports/:id", authenticateToken, asyncHandler(async (req, res) => {
    const body = ensureObject(req.body) || {};
    const name = String(body.name ?? "");
    const updated = await storage2.updateImportName(req.params.id, name);
    if (!updated) {
      return res.status(404).json({ message: "Import not found" });
    }
    if (req.user?.username) {
      await storage2.createAuditLog({
        action: "UPDATE_IMPORT",
        performedBy: req.user.username,
        targetResource: name
      });
    }
    return res.json(updated);
  }));
  app2.patch("/api/imports/:id/rename", authenticateToken, asyncHandler(async (req, res) => {
    const body = ensureObject(req.body) || {};
    const name = String(body.name ?? "");
    const updated = await storage2.updateImportName(req.params.id, name);
    if (!updated) {
      return res.status(404).json({ message: "Import not found" });
    }
    if (req.user?.username) {
      await storage2.createAuditLog({
        action: "UPDATE_IMPORT",
        performedBy: req.user.username,
        targetResource: name
      });
    }
    return res.json(updated);
  }));
  app2.delete(
    "/api/imports/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    asyncHandler(async (req, res) => {
      const importRecord = await storage2.getImportById(req.params.id);
      const deleted = await storage2.deleteImport(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Import not found" });
      }
      if (req.user?.username) {
        await storage2.createAuditLog({
          action: "DELETE_IMPORT",
          performedBy: req.user.username,
          targetResource: importRecord?.name || req.params.id
        });
      }
      return res.json({ success: true });
    })
  );
}
var init_imports_routes = __esm({
  "server/routes/imports.routes.ts"() {
    "use strict";
    init_async_handler();
    init_validation();
  }
});

// server/routes/search.routes.ts
function buildRowsWithSource(rows) {
  return rows.map((row) => {
    const base = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
    return {
      ...base,
      "Source File": row.importFilename || row.importName || ""
    };
  });
}
function collectColumns(rows) {
  return Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, /* @__PURE__ */ new Set())
  );
}
function registerSearchRoutes(app2, deps) {
  const {
    searchRepository: searchRepository2,
    authenticateToken,
    searchRateLimiter: searchRateLimiter2,
    getRuntimeSettingsCached: getRuntimeSettingsCached2,
    isDbProtected
  } = deps;
  app2.get("/api/search/columns", authenticateToken, asyncHandler(async (_req, res) => {
    return res.json(await searchRepository2.getAllColumnNames());
  }));
  app2.get("/api/columns", authenticateToken, asyncHandler(async (_req, res) => {
    return res.json(await searchRepository2.getAllColumnNames());
  }));
  app2.get("/api/search/global", authenticateToken, searchRateLimiter2, asyncHandler(async (req, res) => {
    const search = String(req.query.q || "").trim();
    const runtimeSettings = await getRuntimeSettingsCached2();
    const page = Math.max(1, readInteger(req.query.page, 1));
    const maxTotal = runtimeSettings.searchResultLimit;
    const maxLimit = isDbProtected() ? Math.min(maxTotal, 80) : maxTotal;
    const requestedLimit = readInteger(req.query.limit, 50);
    const limit = Math.max(10, Math.min(requestedLimit, maxLimit));
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
    if (search.length < 2) {
      return res.json({
        columns: [],
        rows: [],
        results: [],
        total: 0
      });
    }
    const effectiveLimit = Math.min(limit, Math.max(1, maxTotal - offset));
    const result = await searchRepository2.searchGlobalDataRows({
      search,
      limit: effectiveLimit,
      offset
    });
    const parsedRows = buildRowsWithSource(result.rows);
    const columns = collectColumns(parsedRows);
    return res.json({
      columns,
      rows: parsedRows,
      results: parsedRows,
      total: Math.min(result.total, maxTotal),
      page,
      limit: effectiveLimit
    });
  }));
  app2.get("/api/search", authenticateToken, searchRateLimiter2, asyncHandler(async (req, res) => {
    const search = String(req.query.q || "").trim();
    if (search.length < 2) {
      return res.json({ results: [], total: 0 });
    }
    const queryResult = await searchRepository2.searchSimpleDataRows(search);
    const rows = queryResult.rows || [];
    const results = rows.map((row) => ({
      ...row.jsonDataJsonb || {},
      _importId: row.importId,
      _importName: row.importName
    }));
    return res.json({
      results,
      total: results.length
    });
  }));
  app2.post("/api/search/advanced", authenticateToken, asyncHandler(async (req, res) => {
    const body = ensureObject(req.body) || {};
    const filters = Array.isArray(body.filters) ? body.filters : [];
    const logic = body.logic === "OR" ? "OR" : "AND";
    const runtimeSettings = await getRuntimeSettingsCached2();
    const page = Math.max(1, readInteger(body.page, 1));
    const maxTotal = runtimeSettings.searchResultLimit;
    const requestedLimit = readInteger(body.limit, 50);
    const limit = Math.max(10, Math.min(requestedLimit, maxTotal));
    const offset = (page - 1) * limit;
    if (offset >= maxTotal) {
      return res.json({
        results: [],
        headers: [],
        total: maxTotal,
        page,
        limit
      });
    }
    const effectiveLimit = Math.min(limit, Math.max(1, maxTotal - offset));
    const rawResult = await searchRepository2.advancedSearchDataRows(
      filters,
      logic,
      effectiveLimit,
      offset
    );
    const parsedResults = buildRowsWithSource(rawResult.rows);
    const headers = collectColumns(parsedResults);
    return res.json({
      results: parsedResults,
      headers,
      total: Math.min(rawResult.total || 0, maxTotal),
      page,
      limit: effectiveLimit
    });
  }));
}
var init_search_routes = __esm({
  "server/routes/search.routes.ts"() {
    "use strict";
    init_async_handler();
    init_validation();
  }
});

// server/routes/ai.routes.ts
function registerAiRoutes(app2, deps) {
  const {
    storage: storage2,
    authenticateToken,
    requireRole,
    withAiConcurrencyGate: withAiConcurrencyGate2,
    getRuntimeSettingsCached: getRuntimeSettingsCached2,
    aiSearchService: aiSearchService2,
    categoryStatsService: categoryStatsService2,
    aiChatService: aiChatService2,
    aiIndexService: aiIndexService2,
    getOllamaConfig: getOllamaConfig2,
    defaultAiTimeoutMs
  } = deps;
  app2.get(
    "/api/ai/config",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(async (_req, res) => {
      const runtimeSettings = await getRuntimeSettingsCached2();
      return res.json({
        ...getOllamaConfig2(),
        aiEnabled: runtimeSettings.aiEnabled,
        semanticSearchEnabled: runtimeSettings.semanticSearchEnabled,
        aiTimeoutMs: runtimeSettings.aiTimeoutMs
      });
    })
  );
  app2.post(
    "/api/ai/search",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    withAiConcurrencyGate2("search", async (req, res) => {
      try {
        const body = ensureObject(req.body) || {};
        const query = String(body.query || "").trim();
        if (!query) {
          return res.status(400).json({ message: "Query required" });
        }
        const runtimeSettings = await getRuntimeSettingsCached2();
        if (!runtimeSettings.aiEnabled) {
          return res.status(503).json({
            message: "AI assistant is disabled by system settings.",
            disabled: true
          });
        }
        const countSummary = await categoryStatsService2.resolveCountSummary(
          query,
          runtimeSettings.aiTimeoutMs || defaultAiTimeoutMs
        );
        if (countSummary) {
          return res.json({
            person: null,
            nearest_branch: null,
            decision: null,
            ai_explanation: countSummary.summary,
            processing: countSummary.processing,
            stats: countSummary.stats
          });
        }
        const result = await aiSearchService2.resolveSearchRequest({
          query,
          userKey: req.user.activityId || req.user.username,
          runtimeSettings: {
            semanticSearchEnabled: runtimeSettings.semanticSearchEnabled,
            aiTimeoutMs: runtimeSettings.aiTimeoutMs
          }
        });
        if (result.audit) {
          queueMicrotask(() => {
            storage2.createAuditLog({
              action: "AI_SEARCH",
              performedBy: req.user.username,
              targetResource: "ai_search",
              details: JSON.stringify(result.audit)
            }).catch((error) => {
              console.error("Audit log failed:", error?.message || error);
            });
          });
        }
        return res.status(result.statusCode).json(result.body);
      } catch (error) {
        console.error("AI search error:", error);
        return res.status(500).json({ message: error.message });
      }
    })
  );
  app2.post(
    "/api/ai/index/import/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(async (req, res) => {
      const runtimeSettings = await getRuntimeSettingsCached2();
      if (!runtimeSettings.aiEnabled) {
        return res.status(503).json({ message: "AI assistant is disabled by system settings." });
      }
      const body = ensureObject(req.body) || {};
      const batchSize = Math.max(1, Math.min(20, readInteger(body.batchSize, 5)));
      const maxRowsValue = readInteger(body.maxRows, 0);
      const maxRows = maxRowsValue > 0 ? Math.max(1, maxRowsValue) : null;
      const result = await aiIndexService2.indexImport({
        importId: req.params.id,
        username: req.user.username,
        batchSize,
        maxRows
      });
      return res.status(result.statusCode).json(result.body);
    })
  );
  app2.post(
    "/api/ai/branches/import/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    asyncHandler(async (req, res) => {
      const body = ensureObject(req.body) || {};
      const result = await aiIndexService2.importBranches({
        importId: req.params.id,
        username: req.user.username,
        nameKey: typeof body.nameKey === "string" ? body.nameKey : null,
        latKey: typeof body.latKey === "string" ? body.latKey : null,
        lngKey: typeof body.lngKey === "string" ? body.lngKey : null
      });
      return res.status(result.statusCode).json(result.body);
    })
  );
  app2.post(
    "/api/ai/chat",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    withAiConcurrencyGate2("chat", async (req, res) => {
      try {
        const body = ensureObject(req.body) || {};
        const message = String(body.message || "").trim();
        if (!message) {
          return res.status(400).json({ message: "Message required" });
        }
        const runtimeSettings = await getRuntimeSettingsCached2();
        if (!runtimeSettings.aiEnabled) {
          return res.status(503).json({ message: "AI assistant is disabled by system settings." });
        }
        const result = await aiChatService2.handleChat({
          message,
          username: req.user.username,
          existingConversationId: body.conversationId ? String(body.conversationId) : null,
          aiTimeoutMs: runtimeSettings.aiTimeoutMs
        });
        return res.status(result.statusCode).json(result.body);
      } catch (error) {
        console.error("AI chat error:", error);
        return res.status(500).json({ message: error.message });
      }
    })
  );
}
var init_ai_routes = __esm({
  "server/routes/ai.routes.ts"() {
    "use strict";
    init_async_handler();
    init_validation();
  }
});

// server/routes/system.routes.ts
function registerSystemRoutes(app2, deps) {
  const {
    authenticateToken,
    requireRole,
    requireMonitorAccess,
    getMaintenanceStateCached: getMaintenanceStateCached2,
    computeInternalMonitorSnapshot: computeInternalMonitorSnapshot2,
    buildInternalMonitorAlerts: buildInternalMonitorAlerts2,
    getControlState: getControlState2,
    getDbProtection: getDbProtection2,
    getRequestRate: getRequestRate2,
    getLatencyP95: getLatencyP952,
    getLocalCircuitSnapshots: getLocalCircuitSnapshots2,
    getIntelligenceExplainability: getIntelligenceExplainability2,
    injectChaos: injectChaos2,
    createAuditLog
  } = deps;
  app2.get("/api/health", (_req, res) => {
    res.json({ status: "ok", mode: "postgresql" });
  });
  app2.get("/api/maintenance-status", asyncHandler(async (_req, res) => {
    return res.json(await getMaintenanceStateCached2());
  }));
  app2.get(
    "/internal/system-health",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const snapshot = computeInternalMonitorSnapshot2();
      const alerts = buildInternalMonitorAlerts2(snapshot);
      res.json({
        ...snapshot,
        activeAlertCount: alerts.length
      });
    }
  );
  app2.get(
    "/internal/system-mode",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const controlState = getControlState2();
      res.json({
        mode: controlState.mode,
        throttleFactor: controlState.throttleFactor,
        rejectHeavyRoutes: controlState.rejectHeavyRoutes,
        dbProtection: getDbProtection2(),
        preAllocatedMB: controlState.preAllocateMB,
        updatedAt: controlState.updatedAt
      });
    }
  );
  app2.get(
    "/internal/workers",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const controlState = getControlState2();
      res.json({
        count: controlState.workerCount,
        maxWorkers: controlState.maxWorkers,
        workers: controlState.workers,
        updatedAt: controlState.updatedAt
      });
    }
  );
  app2.get(
    "/internal/alerts",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const snapshot = computeInternalMonitorSnapshot2();
      const alerts = buildInternalMonitorAlerts2(snapshot);
      res.json({
        alerts,
        updatedAt: snapshot.updatedAt
      });
    }
  );
  app2.get(
    "/internal/load-trend",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const controlState = getControlState2();
      res.json({
        predictor: controlState.predictor,
        queueLength: controlState.queueLength,
        requestRate: getRequestRate2(),
        p95LatencyMs: getLatencyP952(),
        updatedAt: controlState.updatedAt
      });
    }
  );
  app2.get(
    "/internal/circuit-status",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const controlState = getControlState2();
      res.json({
        local: getLocalCircuitSnapshots2(),
        cluster: controlState.circuits,
        updatedAt: controlState.updatedAt
      });
    }
  );
  app2.get(
    "/internal/intelligence/explain",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    (_req, res) => {
      const explain = getIntelligenceExplainability2();
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
  app2.post(
    "/internal/chaos/inject",
    authenticateToken,
    requireRole("admin", "superuser"),
    asyncHandler(async (req, res) => {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const type = body.type;
      const magnitude = body.magnitude;
      const durationMs = body.durationMs;
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
      const result = injectChaos2({
        type,
        magnitude: Number.isFinite(Number(magnitude)) ? Number(magnitude) : void 0,
        durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : void 0
      });
      await createAuditLog({
        action: "CHAOS_INJECTED",
        performedBy: req.user?.username || "system",
        details: `Chaos injected: ${type}`
      });
      return res.json({
        success: true,
        ...result
      });
    })
  );
}
var init_system_routes = __esm({
  "server/routes/system.routes.ts"() {
    "use strict";
    init_async_handler();
  }
});

// server/routes/settings.routes.ts
function registerSettingsRoutes(app2, deps) {
  const {
    storage: storage2,
    authenticateToken,
    requireRole,
    clearTabVisibilityCache,
    invalidateRuntimeSettingsCache: invalidateRuntimeSettingsCache2,
    invalidateMaintenanceCache: invalidateMaintenanceCache2,
    getMaintenanceStateCached: getMaintenanceStateCached2,
    broadcastWsMessage: broadcastWsMessage2,
    defaultAiTimeoutMs
  } = deps;
  app2.get("/api/app-config", authenticateToken, asyncHandler(async (_req, res) => {
    const config = await storage2.getAppConfig();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.json(config);
  }));
  app2.get("/api/settings/tab-visibility", authenticateToken, asyncHandler(async (req, res) => {
    const role = req.user?.role || "user";
    return res.json({
      role,
      tabs: await storage2.getRoleTabVisibility(role)
    });
  }));
  app2.get("/api/settings", authenticateToken, requireRole("admin", "superuser"), asyncHandler(async (req, res) => {
    const role = req.user?.role || "user";
    return res.json({
      categories: await storage2.getSettingsForRole(role)
    });
  }));
  app2.patch("/api/settings", authenticateToken, requireRole("admin", "superuser"), asyncHandler(async (req, res) => {
    const body = ensureObject(req.body) || {};
    const key = readNonEmptyString(body.key);
    if (!key) {
      return res.status(400).json({ message: "Invalid setting key" });
    }
    const role = req.user?.role || "user";
    const result = await storage2.updateSystemSetting({
      role,
      settingKey: key,
      value: body.value ?? null,
      confirmCritical: Boolean(body.confirmCritical),
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
      clearTabVisibilityCache();
      invalidateRuntimeSettingsCache2();
      await storage2.createAuditLog({
        action: result.setting?.isCritical ? "CRITICAL_SETTING_UPDATED" : "SETTING_UPDATED",
        performedBy: req.user?.username || "system",
        targetResource: key,
        details: `Updated setting ${key} to "${String(result.setting?.value ?? "")}"`
      });
      if (key === "ai_timeout_ms") {
        process.env.OLLAMA_TIMEOUT_MS = String(result.setting?.value ?? defaultAiTimeoutMs);
      }
      if (result.shouldBroadcast) {
        invalidateMaintenanceCache2();
        const maintenanceState = await getMaintenanceStateCached2(true);
        broadcastWsMessage2({
          type: "maintenance_update",
          maintenance: maintenanceState.maintenance,
          message: maintenanceState.message,
          mode: maintenanceState.type,
          startTime: maintenanceState.startTime,
          endTime: maintenanceState.endTime
        });
      } else {
        broadcastWsMessage2({
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
  }));
}
var init_settings_routes = __esm({
  "server/routes/settings.routes.ts"() {
    "use strict";
    init_async_handler();
    init_validation();
  }
});

// server/routes/operations.routes.ts
function registerOperationsRoutes(app2, deps) {
  const {
    storage: storage2,
    auditRepository: auditRepository2,
    backupsRepository: backupsRepository2,
    analyticsRepository: analyticsRepository2,
    authenticateToken,
    requireRole,
    requireTabAccess,
    withExportCircuit: withExportCircuit2,
    isExportCircuitOpenError,
    connectedClients: connectedClients2
  } = deps;
  app2.get(
    "/api/audit-logs",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("audit-logs"),
    asyncHandler(async (_req, res) => {
      return res.json({ logs: await auditRepository2.getAuditLogs() });
    })
  );
  app2.get(
    "/api/audit-logs/stats",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("audit-logs"),
    asyncHandler(async (_req, res) => {
      return res.json(await auditRepository2.getAuditLogStats());
    })
  );
  app2.delete(
    "/api/audit-logs/cleanup",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("audit-logs"),
    asyncHandler(async (req, res) => {
      const body = ensureObject(req.body) || {};
      const olderThanDays = Math.max(1, readInteger(body.olderThanDays, 30));
      const cutoffDate = /* @__PURE__ */ new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      const deletedCount = await auditRepository2.cleanupAuditLogsOlderThan(cutoffDate);
      await storage2.createAuditLog({
        action: "CLEANUP_AUDIT_LOGS",
        performedBy: req.user?.username || "system",
        details: `Cleanup requested for logs older than ${olderThanDays} days`
      });
      return res.json({
        success: true,
        deletedCount,
        message: "Cleanup completed"
      });
    })
  );
  app2.get(
    "/api/analytics/summary",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(async (_req, res) => {
      return res.json(await analyticsRepository2.getDashboardSummary());
    })
  );
  app2.get(
    "/api/analytics/login-trends",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(async (req, res) => {
      const days = Math.max(1, readInteger(req.query.days, 7));
      return res.json(await analyticsRepository2.getLoginTrends(days));
    })
  );
  app2.get(
    "/api/analytics/top-users",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(async (req, res) => {
      const limit = Math.max(1, readInteger(req.query.limit, 10));
      return res.json(await analyticsRepository2.getTopActiveUsers(limit));
    })
  );
  app2.get(
    "/api/analytics/peak-hours",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(async (_req, res) => {
      return res.json(await analyticsRepository2.getPeakHours());
    })
  );
  app2.get(
    "/api/analytics/role-distribution",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(async (_req, res) => {
      return res.json(await analyticsRepository2.getRoleDistribution());
    })
  );
  app2.get(
    "/api/backups",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("backup"),
    asyncHandler(async (_req, res) => {
      return res.json({ backups: await backupsRepository2.getBackups() });
    })
  );
  app2.post(
    "/api/backups",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("backup"),
    asyncHandler(async (req, res) => {
      const body = ensureObject(req.body) || {};
      const name = String(body.name || "");
      let backup;
      try {
        backup = await withExportCircuit2(async () => {
          const startTime = Date.now();
          const backupData = await backupsRepository2.getBackupDataForExport();
          const metadata = {
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            importsCount: backupData.imports.length,
            dataRowsCount: backupData.dataRows.length,
            usersCount: backupData.users.length,
            auditLogsCount: backupData.auditLogs.length
          };
          const created = await backupsRepository2.createBackup({
            name,
            createdBy: req.user.username,
            backupData: JSON.stringify(backupData),
            metadata: JSON.stringify(metadata)
          });
          await storage2.createAuditLog({
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
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        throw error;
      }
      return res.json(backup);
    })
  );
  app2.get(
    "/api/backups/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("backup"),
    asyncHandler(async (req, res) => {
      const backup = await backupsRepository2.getBackupById(req.params.id);
      if (!backup) {
        return res.status(404).json({ message: "Backup not found" });
      }
      return res.json(backup);
    })
  );
  app2.post(
    "/api/backups/:id/restore",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("backup"),
    asyncHandler(async (req, res) => {
      let backup;
      try {
        backup = await withExportCircuit2(() => backupsRepository2.getBackupById(req.params.id));
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        throw error;
      }
      if (!backup) {
        return res.status(404).json({ message: "Backup not found" });
      }
      let result;
      try {
        result = await withExportCircuit2(async () => {
          const startTime = Date.now();
          const backupData = JSON.parse(backup.backupData);
          const restored = await backupsRepository2.restoreFromBackup(backupData);
          await storage2.createAuditLog({
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
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        throw error;
      }
      return res.json({
        ...result.restored,
        message: `Restore completed in ${Math.round((Date.now() - result.startTime) / 1e3)}s`
      });
    })
  );
  app2.delete(
    "/api/backups/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("backup"),
    asyncHandler(async (req, res) => {
      let backup;
      let deleted;
      try {
        backup = await withExportCircuit2(() => backupsRepository2.getBackupById(req.params.id));
        deleted = await withExportCircuit2(() => backupsRepository2.deleteBackup(req.params.id));
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        throw error;
      }
      if (!deleted) {
        return res.status(404).json({ message: "Backup not found" });
      }
      await storage2.createAuditLog({
        action: "DELETE_BACKUP",
        performedBy: req.user.username,
        targetResource: backup?.name || req.params.id
      });
      return res.json({ success: true });
    })
  );
  app2.get("/api/debug/websocket-clients", authenticateToken, requireRole("superuser"), asyncHandler(async (_req, res) => {
    const clients = Array.from(connectedClients2.keys());
    return res.json({ count: clients.length, clients });
  }));
}
var init_operations_routes = __esm({
  "server/routes/operations.routes.ts"() {
    "use strict";
    init_async_handler();
    init_validation();
  }
});

// server/routes/collection.validation.ts
function ensureLooseObject(value) {
  if (value && typeof value === "object") {
    return value;
  }
  return null;
}
function normalizeCollectionText(value) {
  return String(value ?? "").trim();
}
function normalizeCollectionStringList(values) {
  return values.map((value) => normalizeCollectionText(value)).filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
}
function normalizeCollectionNicknameRoleScope2(value, fallback = "both") {
  const normalized = normalizeCollectionText(value).toLowerCase();
  if (COLLECTION_NICKNAME_ROLE_SCOPE_SET.has(normalized)) {
    return normalized;
  }
  return fallback;
}
function isNicknameScopeAllowedForRole(scope, role) {
  if (role === "superuser") return true;
  if (role === "admin") return scope === "admin" || scope === "both";
  if (role === "user") return scope === "user" || scope === "both";
  return false;
}
function isValidCollectionDate(value) {
  if (!COLLECTION_DATE_REGEX.test(value)) return false;
  const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime());
}
function parseCollectionAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return null;
  return Math.round(num * 100) / 100;
}
function isValidCollectionPhone(value) {
  const normalized = String(value || "").trim();
  if (normalized.length < 8 || normalized.length > 20) return false;
  return COLLECTION_PHONE_REGEX.test(normalized);
}
var COLLECTION_BATCHES, COLLECTION_STAFF_NICKNAME_MIN_LENGTH, COLLECTION_SUMMARY_MONTH_NAMES, COLLECTION_NICKNAME_TEMP_PASSWORD, COLLECTION_DATE_REGEX, COLLECTION_PHONE_REGEX, COLLECTION_NICKNAME_ROLE_SCOPE_SET;
var init_collection_validation = __esm({
  "server/routes/collection.validation.ts"() {
    "use strict";
    init_security();
    COLLECTION_BATCHES = /* @__PURE__ */ new Set(["P10", "P25", "MDD02", "MDD10", "MDD18", "MDD25"]);
    COLLECTION_STAFF_NICKNAME_MIN_LENGTH = 2;
    COLLECTION_SUMMARY_MONTH_NAMES = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    COLLECTION_NICKNAME_TEMP_PASSWORD = getCollectionNicknameTempPassword();
    COLLECTION_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    COLLECTION_PHONE_REGEX = /^[0-9+\-\s]{8,20}$/;
    COLLECTION_NICKNAME_ROLE_SCOPE_SET = /* @__PURE__ */ new Set(["admin", "user", "both"]);
  }
});

// server/routes/collection-access.ts
async function resolveCurrentCollectionNicknameFromSession(storage2, user) {
  const activityId = normalizeCollectionText(user.activityId);
  if (!activityId) return null;
  const session = await storage2.getCollectionNicknameSessionByActivity(activityId);
  if (!session) return null;
  if (normalizeCollectionText(session.username).toLowerCase() !== normalizeCollectionText(user.username).toLowerCase()) {
    return null;
  }
  if (normalizeCollectionText(session.userRole).toLowerCase() !== normalizeCollectionText(user.role).toLowerCase()) {
    return null;
  }
  const nickname = normalizeCollectionText(session.nickname);
  return nickname || null;
}
async function getAdminGroupNicknameValues(storage2, user) {
  const currentNickname = await resolveCurrentCollectionNicknameFromSession(storage2, user);
  if (!currentNickname) return [];
  const visibleFromGroup = await storage2.getCollectionAdminGroupVisibleNicknameValuesByLeader(currentNickname);
  const normalized = normalizeCollectionStringList(visibleFromGroup);
  if (normalized.length > 0) {
    const leaderLower = currentNickname.toLowerCase();
    const own = normalized.filter((value) => value.toLowerCase() === leaderLower);
    const others = normalized.filter((value) => value.toLowerCase() !== leaderLower).sort((a, b) => a.localeCompare(b, void 0, { sensitivity: "base" }));
    return [...own, ...others];
  }
  const ownProfile = await storage2.getCollectionStaffNicknameByName(currentNickname);
  if (ownProfile && ownProfile.isActive && isNicknameScopeAllowedForRole(ownProfile.roleScope, user.role)) {
    return [ownProfile.nickname];
  }
  return [];
}
async function getAdminVisibleNicknameValues(storage2, user) {
  return getAdminGroupNicknameValues(storage2, user);
}
function hasNicknameValue(values, target) {
  const normalizedTarget = normalizeCollectionText(target).toLowerCase();
  if (!normalizedTarget) return false;
  return values.some((value) => value.toLowerCase() === normalizedTarget);
}
async function canUserAccessCollectionRecord(storage2, user, record) {
  if (user.role === "superuser") return true;
  if (user.role === "user") {
    const owner = normalizeCollectionText(record.createdByLogin).toLowerCase();
    const current = normalizeCollectionText(user.username).toLowerCase();
    return Boolean(owner) && owner === current;
  }
  if (user.role === "admin") {
    const allowedNicknames = await getAdminVisibleNicknameValues(storage2, user);
    return hasNicknameValue(allowedNicknames, normalizeCollectionText(record.collectionStaffNickname));
  }
  return false;
}
function readNicknameFiltersFromQuery(query) {
  const candidates = [];
  const pushValue = (raw) => {
    if (Array.isArray(raw)) {
      for (const item of raw) pushValue(item);
      return;
    }
    const normalized = normalizeCollectionText(raw);
    if (!normalized) return;
    const parts = normalized.split(",").map((part) => normalizeCollectionText(part)).filter(Boolean);
    candidates.push(...parts);
  };
  pushValue(query.nickname);
  pushValue(query.staff);
  pushValue(query.nicknames);
  return normalizeCollectionStringList(candidates);
}
async function resolveCollectionNicknameAccessForUser(storage2, user, nicknameRaw) {
  const nickname = normalizeCollectionText(nicknameRaw);
  if (nickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
    return {
      ok: false,
      status: 400,
      message: "Staff nickname mesti sekurang-kurangnya 2 aksara."
    };
  }
  const profile = await storage2.getCollectionNicknameAuthProfileByName(nickname);
  if (!profile || !profile.isActive) {
    return {
      ok: false,
      status: 400,
      message: "Staff nickname tidak sah atau sudah inactive."
    };
  }
  if (!isNicknameScopeAllowedForRole(profile.roleScope, user.role)) {
    return {
      ok: false,
      status: 403,
      message: "Staff nickname tidak dibenarkan untuk role semasa."
    };
  }
  return { ok: true, profile };
}
var init_collection_access = __esm({
  "server/routes/collection-access.ts"() {
    "use strict";
    init_collection_validation();
  }
});

// server/services/collection/collection-service-support.ts
var CollectionServiceSupport;
var init_collection_service_support = __esm({
  "server/services/collection/collection-service-support.ts"() {
    "use strict";
    init_errors();
    init_collection_access();
    init_collection_validation();
    CollectionServiceSupport = class {
      constructor(storage2) {
        this.storage = storage2;
      }
      requireUser(user) {
        if (!user) {
          throw unauthorized("Unauthenticated");
        }
        return user;
      }
      buildEmptySummary(year) {
        return {
          ok: true,
          year,
          summary: COLLECTION_SUMMARY_MONTH_NAMES.map((monthName, index) => ({
            month: index + 1,
            monthName,
            totalRecords: 0,
            totalAmount: 0
          }))
        };
      }
      resolveAccessError(status, message) {
        if (status === 400) throw badRequest(message);
        if (status === 401) throw unauthorized(message);
        if (status === 403) throw forbidden(message);
        if (status === 404) throw notFound(message);
        if (status === 409) throw conflict(message);
        throw new Error(message);
      }
      async requireNicknameAccess(user, nicknameRaw) {
        const resolved = await resolveCollectionNicknameAccessForUser(this.storage, user, nicknameRaw);
        if (!resolved.ok) {
          this.resolveAccessError(resolved.status, resolved.message);
        }
        return resolved.profile;
      }
      throwAdminGroupError(err) {
        const message = String(err?.message || "");
        const lower = message.toLowerCase();
        if (lower.includes("already assigned")) {
          throw conflict("This nickname is already assigned to another admin group.");
        }
        if (lower.includes("invalid nickname ids") || lower.includes("invalid leader nickname")) {
          throw badRequest("Invalid nickname ids.");
        }
        if (lower.includes("must have admin scope")) {
          throw badRequest("Leader nickname must be admin scope.");
        }
        if (lower.includes("must be active")) {
          throw badRequest("Leader nickname must be active.");
        }
        if (lower.includes("cannot be a member")) {
          throw badRequest("Leader nickname cannot be included as member.");
        }
        throw err;
      }
      throwNicknameAssignmentError(err) {
        const message = String(err?.message || "");
        const lower = message.toLowerCase();
        if (lower.includes("admin user not found")) {
          throw notFound("Admin not found.");
        }
        if (lower.includes("invalid nickname ids")) {
          throw badRequest("Invalid nickname ids.");
        }
        throw err;
      }
    };
  }
});

// server/services/collection/collection-admin.service.ts
var CollectionAdminService;
var init_collection_admin_service = __esm({
  "server/services/collection/collection-admin.service.ts"() {
    "use strict";
    init_errors();
    init_collection_validation();
    init_collection_service_support();
    CollectionAdminService = class extends CollectionServiceSupport {
      async listAdmins() {
        const admins = await this.storage.getCollectionAdminUsers();
        return { ok: true, admins };
      }
      async listAdminGroups() {
        const groups = await this.storage.getCollectionAdminGroups();
        return { ok: true, groups };
      }
      async createAdminGroup(userInput, bodyRaw) {
        const user = this.requireUser(userInput);
        const body = ensureLooseObject(bodyRaw) || {};
        const leaderNicknameId = normalizeCollectionText(body.leaderNicknameId);
        if (!leaderNicknameId) {
          throw badRequest("leaderNicknameId is required.");
        }
        const memberNicknameIds = Array.isArray(body.memberNicknameIds) ? normalizeCollectionStringList(body.memberNicknameIds) : [];
        try {
          const group = await this.storage.createCollectionAdminGroup({
            leaderNicknameId,
            memberNicknameIds,
            createdBy: user.username
          });
          await this.storage.createAuditLog({
            action: "COLLECTION_ADMIN_GROUP_CREATED",
            performedBy: user.username,
            targetResource: group.id,
            details: `Admin group created for leader ${group.leaderNickname}. members=${group.memberNicknames.length}`
          });
          return { ok: true, group };
        } catch (err) {
          this.throwAdminGroupError(err);
        }
      }
      async updateAdminGroup(userInput, groupIdRaw, bodyRaw) {
        const user = this.requireUser(userInput);
        const groupId = normalizeCollectionText(groupIdRaw);
        if (!groupId) {
          throw badRequest("groupId is required.");
        }
        const body = ensureLooseObject(bodyRaw) || {};
        const hasLeader = Object.prototype.hasOwnProperty.call(body, "leaderNicknameId");
        const hasMembers = Object.prototype.hasOwnProperty.call(body, "memberNicknameIds");
        if (!hasLeader && !hasMembers) {
          throw badRequest("No admin group update payload provided.");
        }
        const leaderNicknameId = hasLeader ? normalizeCollectionText(body.leaderNicknameId) : void 0;
        if (hasLeader && !leaderNicknameId) {
          throw badRequest("leaderNicknameId is required.");
        }
        const memberNicknameIds = hasMembers ? Array.isArray(body.memberNicknameIds) ? normalizeCollectionStringList(body.memberNicknameIds) : [] : void 0;
        try {
          const group = await this.storage.updateCollectionAdminGroup({
            groupId,
            leaderNicknameId,
            memberNicknameIds,
            updatedBy: user.username
          });
          if (!group) {
            throw notFound("Admin group not found.");
          }
          await this.storage.createAuditLog({
            action: "COLLECTION_ADMIN_GROUP_UPDATED",
            performedBy: user.username,
            targetResource: group.id,
            details: `Admin group updated for leader ${group.leaderNickname}. members=${group.memberNicknames.length}`
          });
          return { ok: true, group };
        } catch (err) {
          this.throwAdminGroupError(err);
        }
      }
      async deleteAdminGroup(userInput, groupIdRaw) {
        const user = this.requireUser(userInput);
        const groupId = normalizeCollectionText(groupIdRaw);
        if (!groupId) {
          throw badRequest("groupId is required.");
        }
        const deleted = await this.storage.deleteCollectionAdminGroup(groupId);
        if (!deleted) {
          throw notFound("Admin group not found.");
        }
        await this.storage.createAuditLog({
          action: "COLLECTION_ADMIN_GROUP_DELETED",
          performedBy: user.username,
          targetResource: groupId,
          details: "Admin group deleted."
        });
        return { ok: true };
      }
      async getNicknameAssignments(adminIdRaw) {
        const adminId = normalizeCollectionText(adminIdRaw);
        if (!adminId) {
          throw badRequest("Admin id is required.");
        }
        const admin = await this.storage.getCollectionAdminUserById(adminId);
        if (!admin) {
          throw notFound("Admin not found.");
        }
        const nicknameIds = await this.storage.getCollectionAdminAssignedNicknameIds(adminId);
        return { ok: true, admin, nicknameIds };
      }
      async setNicknameAssignments(userInput, adminIdRaw, bodyRaw) {
        const user = this.requireUser(userInput);
        const adminId = normalizeCollectionText(adminIdRaw);
        if (!adminId) {
          throw badRequest("Admin id is required.");
        }
        const body = ensureLooseObject(bodyRaw) || {};
        if (!Array.isArray(body.nicknameIds)) {
          throw badRequest("nicknameIds must be an array.");
        }
        const nicknameIds = normalizeCollectionStringList(body.nicknameIds);
        try {
          const assignedNicknameIds = await this.storage.setCollectionAdminAssignedNicknameIds({
            adminUserId: adminId,
            nicknameIds,
            createdBySuperuser: user.username
          });
          await this.storage.createAuditLog({
            action: "COLLECTION_NICKNAME_ASSIGNMENTS_UPDATED",
            performedBy: user.username,
            targetResource: adminId,
            details: `Updated admin nickname assignments. total=${assignedNicknameIds.length}`
          });
          return {
            ok: true,
            adminId,
            nicknameIds: assignedNicknameIds
          };
        } catch (err) {
          this.throwNicknameAssignmentError(err);
        }
      }
    };
  }
});

// server/services/collection/collection-nickname.service.ts
import bcrypt4 from "bcrypt";
var CollectionNicknameService;
var init_collection_nickname_service = __esm({
  "server/services/collection/collection-nickname.service.ts"() {
    "use strict";
    init_credentials();
    init_errors();
    init_collection_access();
    init_collection_validation();
    init_collection_service_support();
    CollectionNicknameService = class extends CollectionServiceSupport {
      async listNicknames(userInput, includeInactiveRaw) {
        const user = this.requireUser(userInput);
        const includeInactive = normalizeCollectionText(includeInactiveRaw) === "1";
        let nicknames;
        if (user.role === "superuser") {
          nicknames = await this.storage.getCollectionStaffNicknames({ activeOnly: !includeInactive });
        } else if (user.role === "admin") {
          const allowedValues = await getAdminGroupNicknameValues(this.storage, user);
          if (allowedValues.length === 0) {
            nicknames = [];
          } else {
            const activeNicknames = await this.storage.getCollectionStaffNicknames({ activeOnly: true });
            const byName = /* @__PURE__ */ new Map();
            for (const item of activeNicknames) {
              const key = normalizeCollectionText(item.nickname).toLowerCase();
              if (key && !byName.has(key)) byName.set(key, item);
            }
            nicknames = allowedValues.map((value) => byName.get(value.toLowerCase())).filter(Boolean);
          }
        } else {
          nicknames = await this.storage.getCollectionStaffNicknames({
            activeOnly: true,
            allowedRole: "user"
          });
        }
        return { ok: true, nicknames };
      }
      async checkNicknameAuth(userInput, bodyRaw) {
        const user = this.requireUser(userInput);
        const body = ensureLooseObject(bodyRaw) || {};
        const profile = await this.requireNicknameAccess(user, body.nickname);
        const hasPassword = Boolean(normalizeCollectionText(profile.nicknamePasswordHash));
        const mustChangePassword = Boolean(profile.mustChangePassword || !hasPassword);
        const passwordResetBySuperuser = Boolean(profile.passwordResetBySuperuser);
        const requiresPasswordSetup = !hasPassword;
        const requiresPasswordLogin = hasPassword;
        const requiresForcedPasswordChange = hasPassword && (mustChangePassword || passwordResetBySuperuser);
        return {
          ok: true,
          nickname: {
            id: profile.id,
            nickname: profile.nickname,
            mustChangePassword,
            passwordResetBySuperuser,
            requiresPasswordSetup,
            requiresPasswordLogin,
            requiresForcedPasswordChange
          }
        };
      }
      async setupNicknamePassword(userInput, bodyRaw) {
        const user = this.requireUser(userInput);
        const body = ensureLooseObject(bodyRaw) || {};
        const profile = await this.requireNicknameAccess(user, body.nickname);
        const currentPassword = String(body.currentPassword || "");
        const newPassword = String(body.newPassword || "");
        const confirmPassword = String(body.confirmPassword || "");
        if (!newPassword || !confirmPassword) {
          throw badRequest("New password dan confirm password diperlukan.");
        }
        if (newPassword !== confirmPassword) {
          throw badRequest("Password dan confirm password tidak sepadan.");
        }
        if (!isStrongPassword(newPassword)) {
          throw badRequest(
            `Password mesti sekurang-kurangnya ${CREDENTIAL_PASSWORD_MIN_LENGTH} aksara dan mengandungi huruf serta nombor.`
          );
        }
        const existingHash = normalizeCollectionText(profile.nicknamePasswordHash);
        const hasExistingPassword = Boolean(existingHash);
        if (hasExistingPassword) {
          if (!currentPassword) {
            throw badRequest("Current password diperlukan untuk tukar password nickname.");
          }
          const validCurrentPassword = await bcrypt4.compare(currentPassword, existingHash);
          if (!validCurrentPassword) {
            throw unauthorized("Current password nickname tidak sah.");
          }
          const sameAsCurrent = await bcrypt4.compare(newPassword, existingHash);
          if (sameAsCurrent) {
            throw badRequest("Password baharu mesti berbeza daripada password semasa.");
          }
        }
        const passwordHash = await bcrypt4.hash(newPassword, CREDENTIAL_BCRYPT_COST);
        await this.storage.setCollectionNicknamePassword({
          nicknameId: profile.id,
          passwordHash,
          mustChangePassword: false,
          passwordResetBySuperuser: false,
          passwordUpdatedAt: /* @__PURE__ */ new Date()
        });
        await this.storage.createAuditLog({
          action: "COLLECTION_NICKNAME_PASSWORD_SET",
          performedBy: user.username,
          targetResource: profile.id,
          details: `Nickname password set for ${profile.nickname}`
        });
        if (user.activityId) {
          await this.storage.setCollectionNicknameSession({
            activityId: user.activityId,
            username: user.username,
            userRole: user.role,
            nickname: profile.nickname
          });
        }
        return {
          ok: true,
          nickname: {
            id: profile.id,
            nickname: profile.nickname,
            mustChangePassword: false,
            passwordResetBySuperuser: false
          }
        };
      }
      async loginNickname(userInput, bodyRaw) {
        const user = this.requireUser(userInput);
        const body = ensureLooseObject(bodyRaw) || {};
        const profile = await this.requireNicknameAccess(user, body.nickname);
        const password = String(body.password || "");
        if (!password) {
          throw badRequest("Password diperlukan.");
        }
        const hash = normalizeCollectionText(profile.nicknamePasswordHash);
        if (!hash) {
          throw badRequest("Sila tetapkan kata laluan baharu untuk nickname ini sebelum meneruskan.");
        }
        const valid = await bcrypt4.compare(password, hash);
        if (!valid) {
          throw unauthorized("Password nickname tidak sah.");
        }
        const requiresForcedPasswordChange = Boolean(profile.mustChangePassword) || Boolean(profile.passwordResetBySuperuser);
        if (requiresForcedPasswordChange) {
          return {
            ok: true,
            nickname: {
              id: profile.id,
              nickname: profile.nickname,
              mustChangePassword: true,
              passwordResetBySuperuser: Boolean(profile.passwordResetBySuperuser),
              requiresForcedPasswordChange: true
            }
          };
        }
        if (user.activityId) {
          await this.storage.setCollectionNicknameSession({
            activityId: user.activityId,
            username: user.username,
            userRole: user.role,
            nickname: profile.nickname
          });
        }
        return {
          ok: true,
          nickname: {
            id: profile.id,
            nickname: profile.nickname,
            mustChangePassword: false,
            passwordResetBySuperuser: false,
            requiresForcedPasswordChange: false
          }
        };
      }
      async createNickname(userInput, bodyRaw) {
        const user = this.requireUser(userInput);
        const body = ensureLooseObject(bodyRaw) || {};
        const nickname = normalizeCollectionText(body.nickname);
        const roleScope = normalizeCollectionNicknameRoleScope2(body.roleScope, "both");
        if (nickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
          throw badRequest("Nickname mesti sekurang-kurangnya 2 aksara.");
        }
        const existing = await this.storage.getCollectionStaffNicknameByName(nickname);
        if (existing) {
          throw conflict("Nickname already exists.");
        }
        try {
          const created = await this.storage.createCollectionStaffNickname({
            nickname,
            createdBy: user.username,
            roleScope
          });
          await this.storage.createAuditLog({
            action: "COLLECTION_NICKNAME_CREATED",
            performedBy: user.username,
            targetResource: created.id,
            details: `Collection nickname created: ${created.nickname} (scope=${created.roleScope})`
          });
          return { ok: true, nickname: created };
        } catch (err) {
          const rawMessage = String(err?.message || "").toLowerCase();
          if (rawMessage.includes("duplicate")) {
            throw conflict("Nickname already exists.");
          }
          throw err;
        }
      }
      async updateNickname(userInput, idRaw, bodyRaw) {
        const user = this.requireUser(userInput);
        const id = normalizeCollectionText(idRaw);
        const body = ensureLooseObject(bodyRaw) || {};
        const nickname = normalizeCollectionText(body.nickname);
        const roleScopeProvided = Object.prototype.hasOwnProperty.call(body, "roleScope");
        const roleScope = normalizeCollectionNicknameRoleScope2(body.roleScope, "both");
        if (!id) {
          throw badRequest("Nickname id is required.");
        }
        if (nickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
          throw badRequest("Nickname mesti sekurang-kurangnya 2 aksara.");
        }
        const existingByName = await this.storage.getCollectionStaffNicknameByName(nickname);
        if (existingByName && existingByName.id !== id) {
          throw conflict("Nickname already exists.");
        }
        try {
          const updated = await this.storage.updateCollectionStaffNickname(id, {
            nickname,
            ...roleScopeProvided ? { roleScope } : {}
          });
          if (!updated) {
            throw notFound("Nickname not found.");
          }
          await this.storage.createAuditLog({
            action: "COLLECTION_NICKNAME_UPDATED",
            performedBy: user.username,
            targetResource: updated.id,
            details: `Collection nickname updated to ${updated.nickname} (scope=${updated.roleScope})`
          });
          return { ok: true, nickname: updated };
        } catch (err) {
          const rawMessage = String(err?.message || "").toLowerCase();
          if (rawMessage.includes("duplicate")) {
            throw conflict("Nickname already exists.");
          }
          throw err;
        }
      }
      async updateNicknameStatus(userInput, idRaw, bodyRaw) {
        const user = this.requireUser(userInput);
        const id = normalizeCollectionText(idRaw);
        if (!id) {
          throw badRequest("Nickname id is required.");
        }
        const body = ensureLooseObject(bodyRaw) || {};
        if (!Object.prototype.hasOwnProperty.call(body, "isActive")) {
          throw badRequest("isActive is required.");
        }
        const isActive = Boolean(body.isActive);
        const updated = await this.storage.updateCollectionStaffNickname(id, { isActive });
        if (!updated) {
          throw notFound("Nickname not found.");
        }
        await this.storage.createAuditLog({
          action: "COLLECTION_NICKNAME_STATUS_UPDATED",
          performedBy: user.username,
          targetResource: updated.id,
          details: `Collection nickname ${updated.nickname} set active=${updated.isActive}`
        });
        return { ok: true, nickname: updated };
      }
      async resetNicknamePassword(userInput, idRaw) {
        const user = this.requireUser(userInput);
        const id = normalizeCollectionText(idRaw);
        if (!id) {
          throw badRequest("Nickname id is required.");
        }
        const nickname = await this.storage.getCollectionStaffNicknameById(id);
        if (!nickname) {
          throw notFound("Nickname not found.");
        }
        const passwordHash = await bcrypt4.hash(COLLECTION_NICKNAME_TEMP_PASSWORD, CREDENTIAL_BCRYPT_COST);
        await this.storage.setCollectionNicknamePassword({
          nicknameId: nickname.id,
          passwordHash,
          mustChangePassword: true,
          passwordResetBySuperuser: true,
          passwordUpdatedAt: /* @__PURE__ */ new Date()
        });
        await this.storage.createAuditLog({
          action: "COLLECTION_NICKNAME_PASSWORD_RESET",
          performedBy: user.username,
          targetResource: nickname.id,
          details: `Password nickname reset by superuser for ${nickname.nickname}`
        });
        return {
          ok: true,
          nickname: {
            id: nickname.id,
            nickname: nickname.nickname,
            mustChangePassword: true,
            passwordResetBySuperuser: true
          }
        };
      }
      async deleteNickname(userInput, idRaw) {
        const user = this.requireUser(userInput);
        const id = normalizeCollectionText(idRaw);
        if (!id) {
          throw badRequest("Nickname id is required.");
        }
        const result = await this.storage.deleteCollectionStaffNickname(id);
        if (!result.deleted && !result.deactivated) {
          throw notFound("Nickname not found.");
        }
        await this.storage.createAuditLog({
          action: result.deleted ? "COLLECTION_NICKNAME_DELETED" : "COLLECTION_NICKNAME_DEACTIVATED",
          performedBy: user.username,
          targetResource: id,
          details: result.deleted ? "Collection nickname deleted." : "Collection nickname deactivated due to existing usage."
        });
        return { ok: true, ...result };
      }
    };
  }
});

// server/routes/collection-receipt.service.ts
import fs2 from "fs";
import path2 from "path";
import { randomUUID as randomUUID3 } from "node:crypto";
function resolveReceiptExtension(receipt) {
  const originalFileName = String(receipt.fileName || "").trim();
  const mimeType = String(receipt.mimeType || "").trim().toLowerCase();
  const extFromName = path2.extname(originalFileName).toLowerCase();
  if (extFromName && COLLECTION_RECEIPT_ALLOWED_EXT.has(extFromName)) {
    return extFromName === ".jpeg" ? ".jpg" : extFromName;
  }
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "application/pdf") return ".pdf";
  return null;
}
function extractReceiptBuffer(receipt) {
  const rawBase64 = String(receipt.contentBase64 || "").trim();
  if (!rawBase64) return null;
  const sanitized = rawBase64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!sanitized) return null;
  try {
    const buffer = Buffer.from(sanitized, "base64");
    if (!buffer.length) return null;
    return buffer;
  } catch {
    return null;
  }
}
async function saveCollectionReceipt(receipt) {
  const mimeType = String(receipt.mimeType || "").trim().toLowerCase();
  if (mimeType && !COLLECTION_RECEIPT_ALLOWED_MIME.has(mimeType)) {
    throw new Error("Receipt file type is not allowed.");
  }
  const extension = resolveReceiptExtension(receipt);
  if (!extension) {
    throw new Error("Receipt file extension is not allowed.");
  }
  const buffer = extractReceiptBuffer(receipt);
  if (!buffer) {
    throw new Error("Invalid receipt payload.");
  }
  if (buffer.length > COLLECTION_RECEIPT_MAX_BYTES) {
    throw new Error("Receipt file exceeds 5MB.");
  }
  await fs2.promises.mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });
  const originalFileName = String(receipt.fileName || "receipt").trim();
  const stem = path2.basename(originalFileName, path2.extname(originalFileName)).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40) || "receipt";
  const storedFileName = `${Date.now()}-${randomUUID3()}-${stem}${extension}`;
  const absolutePath = path2.join(COLLECTION_RECEIPT_DIR, storedFileName);
  await fs2.promises.writeFile(absolutePath, buffer);
  return `${COLLECTION_RECEIPT_PUBLIC_PREFIX}/${storedFileName}`.replace(/\\/g, "/");
}
async function removeCollectionReceiptFile(receiptPath) {
  const normalized = String(receiptPath || "").trim().replace(/\\/g, "/");
  if (!normalized.startsWith(`${COLLECTION_RECEIPT_PUBLIC_PREFIX}/`)) return;
  const fileName = normalized.slice(`${COLLECTION_RECEIPT_PUBLIC_PREFIX}/`.length);
  if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) return;
  const absolutePath = path2.resolve(COLLECTION_RECEIPT_DIR, fileName);
  if (!absolutePath.startsWith(COLLECTION_RECEIPT_DIR)) return;
  try {
    await fs2.promises.unlink(absolutePath);
  } catch {
  }
}
function resolveCollectionReceiptMimeTypeFromFileName(fileName) {
  const extension = path2.extname(fileName).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}
function sanitizeReceiptDownloadName(fileName) {
  const sanitized = String(fileName || "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 120);
  return sanitized || "receipt";
}
function resolveCollectionReceiptFile(receiptPath) {
  const normalized = String(receiptPath || "").trim().replace(/\\/g, "/");
  if (!normalized.startsWith(`${COLLECTION_RECEIPT_PUBLIC_PREFIX}/`)) return null;
  const storedFileName = normalized.slice(`${COLLECTION_RECEIPT_PUBLIC_PREFIX}/`.length);
  if (!storedFileName) return null;
  if (storedFileName.includes("..") || storedFileName.includes("/") || storedFileName.includes("\\")) return null;
  if (path2.basename(storedFileName) !== storedFileName) return null;
  const absolutePath = path2.resolve(COLLECTION_RECEIPT_DIR, storedFileName);
  const relativePath = path2.relative(COLLECTION_RECEIPT_DIR, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || path2.isAbsolute(relativePath)) return null;
  const mimeType = resolveCollectionReceiptMimeTypeFromFileName(storedFileName);
  return {
    absolutePath,
    storedFileName,
    mimeType,
    isInlinePreviewSupported: COLLECTION_RECEIPT_INLINE_MIME.has(mimeType)
  };
}
async function serveCollectionReceipt(storage2, req, res, mode2) {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: "Unauthenticated" });
    }
    const id = normalizeCollectionText(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, message: "Collection id is required." });
    }
    const record = await storage2.getCollectionRecordById(id);
    if (!record) {
      return res.status(404).json({ ok: false, message: "Collection record not found." });
    }
    const canAccessRecord = await canUserAccessCollectionRecord(storage2, req.user, {
      createdByLogin: record.createdByLogin,
      collectionStaffNickname: record.collectionStaffNickname
    });
    if (!canAccessRecord) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }
    if (!record.receiptFile) {
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }
    const resolved = resolveCollectionReceiptFile(record.receiptFile);
    if (!resolved) {
      return res.status(404).json({ ok: false, message: "Receipt file path is invalid." });
    }
    try {
      await fs2.promises.access(resolved.absolutePath, fs2.constants.R_OK);
    } catch {
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }
    if (mode2 === "view" && !resolved.isInlinePreviewSupported) {
      return res.status(415).json({ ok: false, message: "Preview not available for this file type." });
    }
    const safeFileName = sanitizeReceiptDownloadName(resolved.storedFileName);
    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader(
      "Content-Disposition",
      `${mode2 === "download" ? "attachment" : "inline"}; filename="${safeFileName}"`
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(resolved.absolutePath, (err) => {
      if (!err || res.headersSent) return;
      const sendErr = err;
      const status = sendErr.code === "ENOENT" ? 404 : 500;
      const message = status === 404 ? "Receipt file not found." : "Failed to serve receipt file.";
      res.status(status).json({ ok: false, message });
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || "Failed to load receipt file." });
  }
}
var COLLECTION_RECEIPT_MAX_BYTES, COLLECTION_RECEIPT_ALLOWED_EXT, COLLECTION_RECEIPT_ALLOWED_MIME, COLLECTION_RECEIPT_INLINE_MIME, COLLECTION_RECEIPT_DIR, COLLECTION_RECEIPT_PUBLIC_PREFIX;
var init_collection_receipt_service = __esm({
  "server/routes/collection-receipt.service.ts"() {
    "use strict";
    init_collection_access();
    init_collection_validation();
    COLLECTION_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
    COLLECTION_RECEIPT_ALLOWED_EXT = /* @__PURE__ */ new Set([".jpg", ".jpeg", ".png", ".pdf"]);
    COLLECTION_RECEIPT_ALLOWED_MIME = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "application/pdf"]);
    COLLECTION_RECEIPT_INLINE_MIME = /* @__PURE__ */ new Set(["application/pdf", "image/png", "image/jpeg"]);
    COLLECTION_RECEIPT_DIR = path2.resolve(process.cwd(), "uploads", "collection-receipts");
    COLLECTION_RECEIPT_PUBLIC_PREFIX = "/uploads/collection-receipts";
  }
});

// server/services/collection/collection-record.service.ts
var CollectionRecordService;
var init_collection_record_service = __esm({
  "server/services/collection/collection-record.service.ts"() {
    "use strict";
    init_errors();
    init_collection_access();
    init_collection_receipt_service();
    init_collection_validation();
    init_collection_service_support();
    CollectionRecordService = class extends CollectionServiceSupport {
      async createRecord(userInput, bodyRaw) {
        const user = this.requireUser(userInput);
        let uploadedReceiptPath = null;
        try {
          const body = ensureLooseObject(bodyRaw) || {};
          const customerName = normalizeCollectionText(body.customerName);
          const icNumber = normalizeCollectionText(body.icNumber);
          const customerPhone = normalizeCollectionText(body.customerPhone);
          const accountNumber = normalizeCollectionText(body.accountNumber);
          const batch = normalizeCollectionText(body.batch).toUpperCase();
          const paymentDate = normalizeCollectionText(body.paymentDate);
          const collectionStaffNickname = normalizeCollectionText(body.collectionStaffNickname);
          const amount = parseCollectionAmount(body.amount);
          if (!customerName) throw badRequest("Customer Name is required.");
          if (!icNumber) throw badRequest("IC Number is required.");
          if (!isValidCollectionPhone(customerPhone)) throw badRequest("Customer Phone Number is invalid.");
          if (!accountNumber) throw badRequest("Account Number is required.");
          if (!COLLECTION_BATCHES.has(batch)) throw badRequest("Invalid batch value.");
          if (!paymentDate || !isValidCollectionDate(paymentDate)) throw badRequest("Invalid payment date.");
          if (amount === null) throw badRequest("Amount must be a positive number.");
          if (collectionStaffNickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
            throw badRequest("Staff nickname must be at least 2 characters.");
          }
          const staffNickname = await this.storage.getCollectionStaffNicknameByName(collectionStaffNickname);
          if (!staffNickname?.isActive) {
            throw badRequest("Staff nickname tidak sah atau sudah inactive.");
          }
          if (user.role === "admin") {
            const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
            if (!hasNicknameValue(allowedNicknames, collectionStaffNickname)) {
              throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
            }
          } else if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
            throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
          }
          const receiptPayload = ensureLooseObject(body.receipt);
          if (receiptPayload) {
            uploadedReceiptPath = await saveCollectionReceipt(receiptPayload);
          }
          const record = await this.storage.createCollectionRecord({
            customerName,
            icNumber,
            customerPhone,
            accountNumber,
            batch,
            paymentDate,
            amount,
            receiptFile: uploadedReceiptPath,
            createdByLogin: user.username,
            collectionStaffNickname
          });
          await this.storage.createAuditLog({
            action: "COLLECTION_RECORD_CREATED",
            performedBy: user.username,
            targetResource: record.id,
            details: `Collection record created by ${user.username}`
          });
          return { ok: true, record };
        } catch (err) {
          if (uploadedReceiptPath) {
            await removeCollectionReceiptFile(uploadedReceiptPath);
          }
          throw err;
        }
      }
      async getSummary(userInput, query) {
        const user = this.requireUser(userInput);
        const yearRaw = normalizeCollectionText(query.year);
        const requestedNicknameFilters = readNicknameFiltersFromQuery(query);
        const parsedYear = yearRaw ? Number.parseInt(yearRaw, 10) : (/* @__PURE__ */ new Date()).getFullYear();
        if (!Number.isInteger(parsedYear) || parsedYear < 2e3 || parsedYear > 2100) {
          throw badRequest("Invalid year.");
        }
        let nicknameFilters;
        if (user.role === "superuser") {
          if (requestedNicknameFilters.length > 0) {
            const activeNicknames = await this.storage.getCollectionStaffNicknames({ activeOnly: true });
            const activeSet = new Set(
              activeNicknames.map((item) => normalizeCollectionText(item.nickname).toLowerCase()).filter(Boolean)
            );
            const hasInvalid = requestedNicknameFilters.some((value) => !activeSet.has(value.toLowerCase()));
            if (hasInvalid) {
              throw badRequest("Invalid nickname filter.");
            }
            nicknameFilters = requestedNicknameFilters;
          }
        } else if (user.role === "admin") {
          const allowedNicknames = await getAdminGroupNicknameValues(this.storage, user);
          if (requestedNicknameFilters.length > 0) {
            const hasInvalid = requestedNicknameFilters.some((value) => !hasNicknameValue(allowedNicknames, value));
            if (hasInvalid) {
              throw badRequest("Invalid nickname filter.");
            }
            nicknameFilters = requestedNicknameFilters;
          } else if (allowedNicknames.length === 0) {
            return this.buildEmptySummary(parsedYear);
          } else {
            nicknameFilters = allowedNicknames;
          }
        }
        const summary = await this.storage.getCollectionMonthlySummary({
          year: parsedYear,
          nicknames: nicknameFilters,
          createdByLogin: user.role === "user" ? user.username : void 0
        });
        return {
          ok: true,
          year: parsedYear,
          summary
        };
      }
      async listRecords(userInput, query) {
        const user = this.requireUser(userInput);
        const from = normalizeCollectionText(query.from);
        const to = normalizeCollectionText(query.to);
        const search = normalizeCollectionText(query.search);
        const nickname = normalizeCollectionText(query.nickname);
        if (from && !isValidCollectionDate(from)) throw badRequest("Invalid from date.");
        if (to && !isValidCollectionDate(to)) throw badRequest("Invalid to date.");
        if (from && to && from > to) throw badRequest("From date cannot be later than To date.");
        let nicknameFilters;
        if (user.role === "superuser") {
          if (nickname) {
            const isActiveNickname = await this.storage.isCollectionStaffNicknameActive(nickname);
            if (!isActiveNickname) {
              throw badRequest("Invalid nickname filter.");
            }
            nicknameFilters = [nickname];
          }
        } else if (user.role === "admin") {
          const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
          if (nickname) {
            if (!hasNicknameValue(allowedNicknames, nickname)) {
              throw badRequest("Invalid nickname filter.");
            }
            nicknameFilters = [nickname];
          } else if (allowedNicknames.length === 0) {
            return { ok: true, records: [] };
          } else {
            nicknameFilters = allowedNicknames;
          }
        }
        const records = await this.storage.listCollectionRecords({
          from: from || void 0,
          to: to || void 0,
          search: search || void 0,
          createdByLogin: user.role === "user" ? user.username : void 0,
          nicknames: nicknameFilters,
          limit: 1e3
        });
        return { ok: true, records };
      }
      async updateRecord(userInput, idRaw, bodyRaw) {
        const user = this.requireUser(userInput);
        const id = normalizeCollectionText(idRaw);
        if (!id) {
          throw badRequest("Collection id is required.");
        }
        const existing = await this.storage.getCollectionRecordById(id);
        if (!existing) {
          throw notFound("Collection record not found.");
        }
        let uploadedReceiptPath = null;
        try {
          const body = ensureLooseObject(bodyRaw) || {};
          const updatePayload = {};
          const customerName = normalizeCollectionText(body.customerName);
          const icNumber = normalizeCollectionText(body.icNumber);
          const customerPhone = normalizeCollectionText(body.customerPhone);
          const accountNumber = normalizeCollectionText(body.accountNumber);
          const batch = normalizeCollectionText(body.batch).toUpperCase();
          const paymentDate = normalizeCollectionText(body.paymentDate);
          const collectionStaffNickname = normalizeCollectionText(body.collectionStaffNickname);
          const amount = body.amount !== void 0 ? parseCollectionAmount(body.amount) : null;
          if (body.customerName !== void 0) {
            if (!customerName) throw badRequest("Customer Name cannot be empty.");
            updatePayload.customerName = customerName;
          }
          if (body.icNumber !== void 0) {
            if (!icNumber) throw badRequest("IC Number cannot be empty.");
            updatePayload.icNumber = icNumber;
          }
          if (body.customerPhone !== void 0) {
            if (!isValidCollectionPhone(customerPhone)) throw badRequest("Customer Phone Number is invalid.");
            updatePayload.customerPhone = customerPhone;
          }
          if (body.accountNumber !== void 0) {
            if (!accountNumber) throw badRequest("Account Number cannot be empty.");
            updatePayload.accountNumber = accountNumber;
          }
          if (body.batch !== void 0) {
            if (!COLLECTION_BATCHES.has(batch)) throw badRequest("Invalid batch value.");
            updatePayload.batch = batch;
          }
          if (body.paymentDate !== void 0) {
            if (!paymentDate || !isValidCollectionDate(paymentDate)) throw badRequest("Invalid payment date.");
            updatePayload.paymentDate = paymentDate;
          }
          if (body.amount !== void 0) {
            if (amount === null) throw badRequest("Amount must be a positive number.");
            updatePayload.amount = amount;
          }
          if (body.collectionStaffNickname !== void 0) {
            if (collectionStaffNickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
              throw badRequest("Staff nickname must be at least 2 characters.");
            }
            const staffNickname = await this.storage.getCollectionStaffNicknameByName(collectionStaffNickname);
            if (!staffNickname?.isActive) {
              throw badRequest("Staff nickname tidak sah atau sudah inactive.");
            }
            if (user.role === "admin") {
              const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
              if (!hasNicknameValue(allowedNicknames, collectionStaffNickname)) {
                throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
              }
            } else if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
              throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
            }
            updatePayload.collectionStaffNickname = collectionStaffNickname;
          }
          const shouldRemoveReceipt = body.removeReceipt === true;
          const receiptPayload = ensureLooseObject(body.receipt);
          if (shouldRemoveReceipt && receiptPayload) {
            throw badRequest("Cannot remove and upload receipt at the same time.");
          }
          if (receiptPayload) {
            uploadedReceiptPath = await saveCollectionReceipt(receiptPayload);
            updatePayload.receiptFile = uploadedReceiptPath;
          } else if (shouldRemoveReceipt) {
            updatePayload.receiptFile = null;
          }
          if (Object.keys(updatePayload).length === 0) {
            return { ok: true, record: existing };
          }
          const updated = await this.storage.updateCollectionRecord(id, updatePayload);
          if (!updated) {
            if (uploadedReceiptPath) {
              await removeCollectionReceiptFile(uploadedReceiptPath);
            }
            throw notFound("Collection record not found.");
          }
          if ((receiptPayload || shouldRemoveReceipt) && existing.receiptFile) {
            await removeCollectionReceiptFile(existing.receiptFile);
          }
          await this.storage.createAuditLog({
            action: "COLLECTION_RECORD_UPDATED",
            performedBy: user.username,
            targetResource: updated.id,
            details: `Collection record updated by ${user.username}`
          });
          return { ok: true, record: updated };
        } catch (err) {
          if (uploadedReceiptPath) {
            await removeCollectionReceiptFile(uploadedReceiptPath);
          }
          throw err;
        }
      }
      async deleteRecord(userInput, idRaw) {
        const user = this.requireUser(userInput);
        const id = normalizeCollectionText(idRaw);
        if (!id) {
          throw badRequest("Collection id is required.");
        }
        const existing = await this.storage.getCollectionRecordById(id);
        if (!existing) {
          throw notFound("Collection record not found.");
        }
        await this.storage.deleteCollectionRecord(id);
        if (existing.receiptFile) {
          await removeCollectionReceiptFile(existing.receiptFile);
        }
        await this.storage.createAuditLog({
          action: "COLLECTION_RECORD_DELETED",
          performedBy: user.username,
          targetResource: existing.id,
          details: `Collection record deleted by ${user.username}`
        });
        return { ok: true };
      }
    };
  }
});

// server/services/collection.service.ts
var CollectionService;
var init_collection_service = __esm({
  "server/services/collection.service.ts"() {
    "use strict";
    init_collection_admin_service();
    init_collection_nickname_service();
    init_collection_record_service();
    CollectionService = class {
      constructor(storage2) {
        this.adminService = new CollectionAdminService(storage2);
        this.nicknameService = new CollectionNicknameService(storage2);
        this.recordService = new CollectionRecordService(storage2);
      }
      listNicknames(user, includeInactiveRaw) {
        return this.nicknameService.listNicknames(user, includeInactiveRaw);
      }
      checkNicknameAuth(user, bodyRaw) {
        return this.nicknameService.checkNicknameAuth(user, bodyRaw);
      }
      setupNicknamePassword(user, bodyRaw) {
        return this.nicknameService.setupNicknamePassword(user, bodyRaw);
      }
      loginNickname(user, bodyRaw) {
        return this.nicknameService.loginNickname(user, bodyRaw);
      }
      listAdmins() {
        return this.adminService.listAdmins();
      }
      listAdminGroups() {
        return this.adminService.listAdminGroups();
      }
      createAdminGroup(user, bodyRaw) {
        return this.adminService.createAdminGroup(user, bodyRaw);
      }
      updateAdminGroup(user, groupIdRaw, bodyRaw) {
        return this.adminService.updateAdminGroup(user, groupIdRaw, bodyRaw);
      }
      deleteAdminGroup(user, groupIdRaw) {
        return this.adminService.deleteAdminGroup(user, groupIdRaw);
      }
      getNicknameAssignments(adminIdRaw) {
        return this.adminService.getNicknameAssignments(adminIdRaw);
      }
      setNicknameAssignments(user, adminIdRaw, bodyRaw) {
        return this.adminService.setNicknameAssignments(user, adminIdRaw, bodyRaw);
      }
      createNickname(user, bodyRaw) {
        return this.nicknameService.createNickname(user, bodyRaw);
      }
      updateNickname(user, idRaw, bodyRaw) {
        return this.nicknameService.updateNickname(user, idRaw, bodyRaw);
      }
      updateNicknameStatus(user, idRaw, bodyRaw) {
        return this.nicknameService.updateNicknameStatus(user, idRaw, bodyRaw);
      }
      resetNicknamePassword(user, idRaw) {
        return this.nicknameService.resetNicknamePassword(user, idRaw);
      }
      deleteNickname(user, idRaw) {
        return this.nicknameService.deleteNickname(user, idRaw);
      }
      createRecord(user, bodyRaw) {
        return this.recordService.createRecord(user, bodyRaw);
      }
      getSummary(user, query) {
        return this.recordService.getSummary(user, query);
      }
      listRecords(user, query) {
        return this.recordService.listRecords(user, query);
      }
      updateRecord(user, idRaw, bodyRaw) {
        return this.recordService.updateRecord(user, idRaw, bodyRaw);
      }
      deleteRecord(user, idRaw) {
        return this.recordService.deleteRecord(user, idRaw);
      }
    };
  }
});

// server/routes/collection.routes.ts
function sendCollectionError(res, err, fallbackMessage) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      ok: false,
      message: err.message,
      ...err.code ? { error: { code: err.code, message: err.message } } : {}
    });
  }
  const message = err?.message || fallbackMessage;
  return res.status(500).json({ ok: false, message });
}
function jsonRoute(fallbackMessage, handler) {
  return async (req, res) => {
    try {
      return res.json(await handler(req));
    } catch (err) {
      return sendCollectionError(res, err, fallbackMessage);
    }
  };
}
function registerCollectionRoutes(app2, deps) {
  const { storage: storage2, authenticateToken, requireRole, requireTabAccess } = deps;
  const collectionService = new CollectionService(storage2);
  app2.get(
    "/api/collection/nicknames",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load staff nicknames.", (req) => collectionService.listNicknames(req.user, req.query.includeInactive))
  );
  app2.post(
    "/api/collection/nickname-auth/check",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to validate nickname.", (req) => collectionService.checkNicknameAuth(req.user, req.body))
  );
  app2.post(
    "/api/collection/nickname-auth/setup-password",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to set nickname password.", (req) => collectionService.setupNicknamePassword(req.user, req.body))
  );
  app2.post(
    "/api/collection/nickname-auth/login",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to login nickname.", (req) => collectionService.loginNickname(req.user, req.body))
  );
  app2.get(
    "/api/collection/admins",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load admin list.", async () => collectionService.listAdmins())
  );
  app2.get(
    "/api/collection/admin-groups",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load admin groups.", async () => collectionService.listAdminGroups())
  );
  app2.post(
    "/api/collection/admin-groups",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to create admin group.", (req) => collectionService.createAdminGroup(req.user, req.body))
  );
  app2.put(
    "/api/collection/admin-groups/:groupId",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to update admin group.", (req) => collectionService.updateAdminGroup(req.user, req.params.groupId, req.body))
  );
  app2.delete(
    "/api/collection/admin-groups/:groupId",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to delete admin group.", (req) => collectionService.deleteAdminGroup(req.user, req.params.groupId))
  );
  app2.get(
    "/api/collection/nickname-assignments/:adminId",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load nickname assignments.", (req) => collectionService.getNicknameAssignments(req.params.adminId))
  );
  app2.put(
    "/api/collection/nickname-assignments/:adminId",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to save nickname assignments.", (req) => collectionService.setNicknameAssignments(req.user, req.params.adminId, req.body))
  );
  app2.post(
    "/api/collection/nicknames",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to create nickname.", (req) => collectionService.createNickname(req.user, req.body))
  );
  app2.put(
    "/api/collection/nicknames/:id",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to update nickname.", (req) => collectionService.updateNickname(req.user, req.params.id, req.body))
  );
  app2.patch(
    "/api/collection/nicknames/:id",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to update nickname status.", (req) => collectionService.updateNicknameStatus(req.user, req.params.id, req.body))
  );
  app2.post(
    "/api/collection/nicknames/:id/reset-password",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to reset nickname password.", (req) => collectionService.resetNicknamePassword(req.user, req.params.id))
  );
  app2.delete(
    "/api/collection/nicknames/:id",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to delete nickname.", (req) => collectionService.deleteNickname(req.user, req.params.id))
  );
  app2.post(
    "/api/collection",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to create collection record.", (req) => collectionService.createRecord(req.user, req.body))
  );
  app2.get(
    "/api/collection/summary",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load collection summary.", (req) => collectionService.getSummary(req.user, req.query))
  );
  app2.get(
    "/api/collection/list",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load collection records.", (req) => collectionService.listRecords(req.user, req.query))
  );
  app2.get(
    "/api/collection/:id/receipt/view",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    async (req, res) => serveCollectionReceipt(storage2, req, res, "view")
  );
  app2.get(
    "/api/collection/:id/receipt/download",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    async (req, res) => serveCollectionReceipt(storage2, req, res, "download")
  );
  app2.get(
    "/api/receipts/:id/view",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    async (req, res) => serveCollectionReceipt(storage2, req, res, "view")
  );
  app2.get(
    "/api/receipts/:id/download",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    async (req, res) => serveCollectionReceipt(storage2, req, res, "download")
  );
  const handleUpdateCollectionRecord = jsonRoute("Failed to update collection record.", (req) => collectionService.updateRecord(req.user, req.params.id, req.body));
  app2.patch(
    "/api/collection/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    handleUpdateCollectionRecord
  );
  app2.put(
    "/api/collection/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    handleUpdateCollectionRecord
  );
  app2.delete(
    "/api/collection/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to delete collection record.", (req) => collectionService.deleteRecord(req.user, req.params.id))
  );
}
var init_collection_routes = __esm({
  "server/routes/collection.routes.ts"() {
    "use strict";
    init_errors();
    init_collection_service();
    init_collection_receipt_service();
  }
});

// server/services/ai-chat.service.ts
var AiChatService;
var init_ai_chat_service = __esm({
  "server/services/ai-chat.service.ts"() {
    "use strict";
    init_circuitBreaker();
    AiChatService = class {
      constructor(options) {
        this.options = options;
      }
      async handleChat(params) {
        const conversationId = params.existingConversationId || await this.options.storage.createConversation(params.username);
        const history = await this.options.storage.getConversationMessages(conversationId, 3);
        const countSummary = await this.options.categoryStatsService.resolveCountSummary(
          params.message,
          12e3
        );
        if (countSummary) {
          const reply2 = countSummary.summary;
          await this.persistConversation(conversationId, params.username, params.message, reply2);
          return {
            statusCode: 200,
            body: {
              conversationId,
              reply: reply2,
              processing: countSummary.processing,
              stats: countSummary.stats
            }
          };
        }
        const searchTerms = this.buildSearchTerms(params.message);
        const retrievalRows = await this.fetchRetrievalRows(searchTerms);
        const contextBlock = this.buildContextBlock(searchTerms, retrievalRows);
        const chatMessages = [
          {
            role: "system",
            content: "Anda ialah pembantu AI offline untuk sistem SQR. Jawab dalam Bahasa Melayu. Jawapan mestilah berdasarkan DATA SISTEM di bawah. Jika tiada data yang sepadan, katakan dengan jelas bahawa tiada data dijumpai. Jangan membuat andaian atau menambah fakta yang tiada dalam data."
          },
          { role: "system", content: contextBlock },
          ...history.map((entry) => ({
            role: entry.role,
            content: entry.content
          })),
          { role: "user", content: params.message }
        ];
        let reply = "";
        try {
          reply = await this.options.withAiCircuit(
            () => this.options.ollamaChat(chatMessages, {
              num_predict: 96,
              temperature: 0.2,
              top_p: 0.9,
              timeoutMs: params.aiTimeoutMs
            })
          );
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            return {
              statusCode: 503,
              body: {
                message: "AI circuit is OPEN. Please retry after cooldown.",
                circuit: "OPEN"
              }
            };
          }
          if (error?.name === "AbortError") {
            reply = this.buildQuickReply(retrievalRows);
          } else {
            throw error;
          }
        }
        await this.persistConversation(conversationId, params.username, params.message, reply);
        return {
          statusCode: 200,
          body: {
            conversationId,
            reply
          }
        };
      }
      async persistConversation(conversationId, username, message, reply) {
        await this.options.storage.saveConversationMessage(conversationId, "user", message);
        await this.options.storage.saveConversationMessage(conversationId, "assistant", reply);
        await this.options.storage.createAuditLog({
          action: "AI_CHAT",
          performedBy: username,
          details: `Conversation=${conversationId}`
        });
      }
      buildSearchTerms(message) {
        const raw = message.toLowerCase();
        const digitMatches = raw.match(/\d{4,}/g) || [];
        const wordMatches = raw.match(/\b[a-z0-9]{4,}\b/gi) || [];
        const combined = [...digitMatches, ...wordMatches].map((term) => term.replace(/[^a-z0-9]/gi, "")).filter((term) => term.length >= 4);
        const unique = Array.from(new Set(combined));
        unique.sort((a, b) => b.length - a.length);
        return unique.length > 0 ? unique.slice(0, 4) : [message];
      }
      async fetchRetrievalRows(searchTerms) {
        const resultMap = /* @__PURE__ */ new Map();
        for (const term of searchTerms) {
          const retrieval = await this.options.storage.searchGlobalDataRows({
            search: term,
            limit: 30,
            offset: 0
          });
          for (const row of retrieval.rows || []) {
            if (!resultMap.has(row.id)) {
              resultMap.set(row.id, row);
            }
          }
          if (resultMap.size >= 60) {
            break;
          }
        }
        const allRows = Array.from(resultMap.values());
        const matchedRows = allRows.filter(
          (row) => searchTerms.some((term) => this.rowMatchesTerm(row, term))
        );
        return (matchedRows.length > 0 ? matchedRows : allRows).map((row) => ({
          row,
          score: Math.max(...searchTerms.map((term) => this.scoreRowForTerm(row, term)))
        })).sort((left, right) => right.score - left.score).map((entry) => entry.row).slice(0, 5);
      }
      buildContextBlock(searchTerms, retrievalRows) {
        const contextRows = retrievalRows.map((row, index) => {
          const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
          const entries = Object.entries(data).slice(0, 20);
          const lines = entries.map(([key, value]) => `${key}: ${String(value ?? "")}`);
          const source = row.importFilename || row.importName || "Unknown";
          return `# Rekod ${index + 1} (Source: ${source}, RowId: ${row.id || row.rowId || "unknown"})
${lines.join("\n")}`;
        });
        if (contextRows.length === 0) {
          return "DATA SISTEM: TIADA REKOD DIJUMPAI UNTUK KATA KUNCI INI.";
        }
        return `DATA SISTEM (HASIL CARIAN KATA KUNCI: ${searchTerms.join(", ")}):
${contextRows.join("\n\n")}`;
      }
      buildQuickReply(retrievalRows) {
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
        const summaries = retrievalRows.slice(0, 3).map((row, index) => {
          const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
          const pairs = [];
          for (const key of Object.keys(data)) {
            const lower = key.toLowerCase();
            if (priorityKeys.some((term) => lower.includes(term))) {
              pairs.push(`${key}: ${String(data[key] ?? "")}`);
            }
            if (pairs.length >= 8) {
              break;
            }
          }
          if (pairs.length === 0) {
            pairs.push(
              ...Object.entries(data).slice(0, 6).map(([key, value]) => `${key}: ${String(value ?? "")}`)
            );
          }
          const source = row.importFilename || row.importName || "Unknown";
          return `Rekod ${index + 1} (Source: ${source})
${pairs.join("\n")}`;
        });
        return `Rekod dijumpai:
${summaries.join("\n\n")}`;
      }
      rowMatchesTerm(row, term) {
        const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
        return Object.values(data).some((value) => this.valueMatchesTerm(value, term));
      }
      valueMatchesTerm(value, term) {
        if (value === null || value === void 0) {
          return false;
        }
        const termLower = term.toLowerCase();
        const termDigits = term.replace(/\D/g, "");
        const asString = String(value);
        if (termDigits.length >= 6) {
          const valueDigits = asString.replace(/\D/g, "");
          if (valueDigits.includes(termDigits)) {
            return true;
          }
        }
        return asString.toLowerCase().includes(termLower);
      }
      scoreRowForTerm(row, term) {
        const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
        const termDigits = term.replace(/\D/g, "");
        let score = 0;
        for (const [key, value] of Object.entries(data)) {
          const keyLower = key.toLowerCase();
          const valueString = String(value ?? "");
          const valueDigits = valueString.replace(/\D/g, "");
          if (!termDigits) {
            if (valueString.toLowerCase().includes(term.toLowerCase())) {
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
      }
    };
  }
});

// server/services/ai-index.service.ts
var AiIndexService;
var init_ai_index_service = __esm({
  "server/services/ai-index.service.ts"() {
    "use strict";
    AiIndexService = class {
      constructor(options) {
        this.options = options;
      }
      async indexImport(params) {
        const importRecord = await this.options.storage.getImportById(params.importId);
        if (!importRecord) {
          return {
            statusCode: 404,
            body: { message: "Import not found" }
          };
        }
        const totalRows = await this.options.storage.getDataRowCountByImport(params.importId);
        const targetTotal = params.maxRows ? Math.min(params.maxRows, totalRows) : totalRows;
        let processed = 0;
        let offset = 0;
        while (processed < targetTotal) {
          const rows = await this.options.storage.getDataRowsForEmbedding(
            params.importId,
            params.batchSize,
            offset
          );
          if (rows.length === 0) {
            break;
          }
          for (const row of rows) {
            if (processed >= targetTotal) {
              break;
            }
            const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
            const content = this.buildEmbeddingText(data);
            if (!content) {
              processed += 1;
              continue;
            }
            const embedding = await this.options.ollamaEmbed(content);
            if (embedding.length === 0) {
              processed += 1;
              continue;
            }
            await this.options.storage.saveEmbedding({
              importId: params.importId,
              rowId: row.id,
              content,
              embedding
            });
            processed += 1;
          }
          offset += rows.length;
        }
        await this.options.storage.createAuditLog({
          action: "AI_INDEX_IMPORT",
          performedBy: params.username,
          targetResource: importRecord.name,
          details: `Indexed ${processed}/${targetTotal} rows`
        });
        return {
          statusCode: 200,
          body: {
            success: true,
            processed,
            total: targetTotal
          }
        };
      }
      async importBranches(params) {
        const importRecord = await this.options.storage.getImportById(params.importId);
        if (!importRecord) {
          return {
            statusCode: 404,
            body: { message: "Import not found" }
          };
        }
        const result = await this.options.storage.importBranchesFromRows({
          importId: params.importId,
          nameKey: params.nameKey || null,
          latKey: params.latKey || null,
          lngKey: params.lngKey || null
        });
        await this.options.storage.createAuditLog({
          action: "IMPORT_BRANCHES",
          performedBy: params.username,
          targetResource: importRecord.name,
          details: JSON.stringify({
            inserted: result.inserted,
            skipped: result.skipped,
            usedKeys: result.usedKeys
          })
        });
        return {
          statusCode: 200,
          body: {
            success: true,
            inserted: result.inserted,
            skipped: result.skipped,
            usedKeys: result.usedKeys
          }
        };
      }
      buildEmbeddingText(data) {
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
          if (!preferredKeys.some((term) => lower.includes(term))) {
            continue;
          }
          const normalizedValue = String(value ?? "").trim();
          if (!normalizedValue || /^\d+$/.test(normalizedValue)) {
            continue;
          }
          picked.push(`${key}: ${normalizedValue}`);
          if (picked.length >= 20) {
            break;
          }
        }
        if (picked.length === 0) {
          for (const [key, value] of entries) {
            const normalizedValue = String(value ?? "").trim();
            if (!normalizedValue || /^\d+$/.test(normalizedValue)) {
              continue;
            }
            picked.push(`${key}: ${normalizedValue}`);
            if (picked.length >= 15) {
              break;
            }
          }
        }
        const text2 = picked.join("\n");
        return text2.length > 2e3 ? text2.slice(0, 2e3) : text2;
      }
    };
  }
});

// server/services/ai-search.service.ts
var AiSearchService;
var init_ai_search_service = __esm({
  "server/services/ai-search.service.ts"() {
    "use strict";
    init_circuitBreaker();
    AiSearchService = class {
      constructor(options) {
        this.options = options;
        this.searchCache = /* @__PURE__ */ new Map();
        this.searchInflight = /* @__PURE__ */ new Map();
        this.lastAiPerson = /* @__PURE__ */ new Map();
        this.searchCacheMs = 6e4;
        this.searchFastTimeoutMs = 5500;
        this.maxSearchCacheEntries = Number(
          process.env.SQR_MAX_SEARCH_CACHE_ENTRIES ?? (options.lowMemoryMode ? "60" : "180")
        );
        this.maxLastAiPersonEntries = Number(
          process.env.SQR_MAX_AI_LAST_PERSON_ENTRIES ?? (options.lowMemoryMode ? "40" : "120")
        );
        this.lastAiPersonTtlMs = Number(process.env.SQR_AI_LAST_PERSON_TTL_MS ?? "1800000");
        global.__searchInflightMap = this.searchInflight;
      }
      sweepCaches(now = Date.now()) {
        for (const [key, entry] of this.searchCache.entries()) {
          if (now - entry.ts >= this.searchCacheMs) {
            this.searchCache.delete(key);
          }
        }
        this.trimCacheEntries(this.searchCache, Math.max(10, this.maxSearchCacheEntries));
        for (const [key, entry] of this.lastAiPerson.entries()) {
          if (now - entry.ts >= this.lastAiPersonTtlMs) {
            this.lastAiPerson.delete(key);
          }
        }
        this.trimCacheEntries(this.lastAiPerson, Math.max(10, this.maxLastAiPersonEntries));
      }
      clearSearchCache() {
        this.searchCache.clear();
      }
      async resolveSearchRequest(params) {
        const { query, userKey, runtimeSettings } = params;
        const cacheKey = `search:${query.toLowerCase()}`;
        const cached = this.searchCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < this.searchCacheMs) {
          return {
            statusCode: 200,
            body: cached.payload,
            audit: cached.audit
          };
        }
        if (cached) {
          this.searchCache.delete(cacheKey);
        }
        let inflight = this.searchInflight.get(cacheKey);
        if (!inflight) {
          inflight = this.options.withAiCircuit(
            () => this.computeAiSearch(
              query,
              userKey,
              runtimeSettings.semanticSearchEnabled,
              runtimeSettings.aiTimeoutMs
            )
          ).then((result) => {
            this.searchCache.set(cacheKey, {
              ts: Date.now(),
              payload: result.payload,
              audit: result.audit
            });
            this.trimCacheEntries(this.searchCache, Math.max(10, this.maxSearchCacheEntries));
            this.searchInflight.delete(cacheKey);
            return result;
          }).catch((error) => {
            this.searchInflight.delete(cacheKey);
            throw error;
          });
          this.searchInflight.set(cacheKey, inflight);
        }
        try {
          const configuredTimeout = runtimeSettings.aiTimeoutMs || this.searchFastTimeoutMs;
          const timeoutMs = Math.max(1e3, Math.min(configuredTimeout, configuredTimeout - 1200));
          const result = await this.withTimeout(inflight, timeoutMs);
          return {
            statusCode: 200,
            body: result.payload,
            audit: result.audit
          };
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            return {
              statusCode: 503,
              body: {
                person: null,
                nearest_branch: null,
                decision: null,
                ai_explanation: "AI service is temporarily throttled for system stability. Please retry in a few seconds.",
                processing: false,
                circuit: "OPEN"
              }
            };
          }
          if (error?.message && error.message !== "timeout") {
            console.error("AI search compute failed:", error?.message || error);
          }
          return {
            statusCode: 200,
            body: {
              person: null,
              nearest_branch: null,
              decision: null,
              ai_explanation: "Sedang proses carian. Sila tunggu beberapa saat dan cuba semula.",
              processing: true
            }
          };
        }
      }
      async computeAiSearch(query, userKey, semanticSearchEnabled, aiTimeoutMs) {
        const intent = await this.parseIntent(query, aiTimeoutMs);
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
        const keywordResults = hasDigitsQuery ? await this.options.storage.aiKeywordSearch({ query: keywordQuery, limit: 10 }) : await this.options.storage.aiNameSearch({ query: keywordQuery, limit: 10 });
        const queryDigits = keywordQuery.replace(/[^0-9]/g, "");
        let fallbackDigitsResults = [];
        if (!hasDigitsQuery && keywordResults.length === 0 && queryDigits.length >= 6) {
          fallbackDigitsResults = await this.options.storage.aiDigitsSearch({
            digits: queryDigits,
            limit: 25
          });
        }
        if (process.env.AI_DEBUG === "1") {
          console.log("AI_SEARCH DEBUG", {
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
            const embedding = await this.options.withAiCircuit(() => this.options.ollamaEmbed(query));
            if (embedding.length > 0) {
              vectorResults = await this.options.storage.semanticSearch({ embedding, limit: 10 });
            }
          } catch {
            vectorResults = [];
          }
        }
        let best = null;
        let bestScore = 0;
        if (hasDigitsQuery) {
          const candidates = [...keywordResults, ...fallbackDigitsResults];
          for (const row of candidates) {
            const scored = this.scoreRowDigits(row, queryDigits);
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
          const scored = Array.from(resultMap.values()).map((row) => {
            const normalized = this.ensureJson(row);
            return {
              row: normalized,
              score: this.rowScore(
                normalized,
                entities.ic,
                entities.name,
                entities.account_no,
                entities.phone
              )
            };
          }).sort((a, b) => b.score - a.score);
          best = scored.length > 0 ? scored[0].row : null;
          bestScore = scored.length > 0 ? scored[0].score : 0;
        }
        if (process.env.AI_DEBUG === "1" && best) {
          const keys = best.jsonDataJsonb && typeof best.jsonDataJsonb === "object" ? Object.keys(best.jsonDataJsonb) : [];
          console.log("AI_SEARCH BEST ROW", {
            rowId: best.rowId,
            jsonType: typeof best.jsonDataJsonb,
            sampleKeys: keys.slice(0, 10)
          });
        }
        if (best) {
          this.lastAiPerson.set(userKey, { ts: Date.now(), row: best });
          this.trimCacheEntries(this.lastAiPerson, Math.max(10, this.maxLastAiPersonEntries));
        }
        const fallbackPerson = this.getLastAiPerson(userKey);
        const hasPersonId = Boolean(entities.ic || entities.account_no || entities.phone);
        const shouldFindBranch = intent.need_nearest_branch || hasPersonId;
        const branchTextPreferred = shouldFindBranch && !hasPersonId;
        const personForBranch = branchTextPreferred ? null : best || (!hasPersonId ? fallbackPerson : null) || null;
        const branchTimeoutMs = Math.max(700, Math.min(2200, Math.floor(aiTimeoutMs * 0.35)));
        let nearestBranch = null;
        let missingCoords = false;
        let branchTextSearch = false;
        try {
          if (branchTextPreferred) {
            const locationHint = this.normalizeLocationHint(
              query.replace(/cawangan|branch|terdekat|nearest|lokasi|alamat|di|yang|paling|dekat/gi, " ")
            );
            if (locationHint.length >= 3) {
              branchTextSearch = true;
              const branches = await this.safeFindBranchesByText(locationHint, 3, branchTimeoutMs);
              nearestBranch = branches[0] || null;
            } else {
              branchTextSearch = true;
            }
          } else if (personForBranch && shouldFindBranch) {
            const coords = this.extractLatLng(personForBranch.jsonDataJsonb || {});
            if (this.isLatLng(coords)) {
              const branches = await this.safeNearestBranches(coords.lat, coords.lng, 1, branchTimeoutMs);
              nearestBranch = branches[0] || null;
            } else {
              let data = this.toObjectJson(personForBranch.jsonDataJsonb) || {};
              const basePostcode = this.extractCustomerPostcode(data);
              const baseHint = this.normalizeLocationHint(this.extractCustomerLocationHint(data));
              if (!basePostcode && baseHint.length < 3) {
                const locationCandidateRows = [best, ...keywordResults, ...fallbackDigitsResults];
                for (const candidate of locationCandidateRows) {
                  const candidateData = this.toObjectJson(candidate?.jsonDataJsonb);
                  if (!candidateData) continue;
                  const candidatePostcode = this.extractCustomerPostcode(candidateData);
                  const candidateHint = this.normalizeLocationHint(
                    this.extractCustomerLocationHint(candidateData)
                  );
                  if (candidatePostcode || candidateHint.length >= 3) {
                    data = candidateData;
                    break;
                  }
                }
              }
              let postcodeWasProvided = false;
              const postcode = this.extractCustomerPostcode(data);
              if (postcode) {
                postcodeWasProvided = true;
                if (this.isNonEmptyString(postcode)) {
                  const pc = await this.safePostcodeLatLng(postcode, branchTimeoutMs);
                  if (this.hasPostcodeCoord(pc)) {
                    const branches = await this.safeNearestBranches(pc.lat, pc.lng, 1, branchTimeoutMs);
                    nearestBranch = branches[0] || null;
                    if (process.env.AI_DEBUG === "1") {
                      console.log("AI_SEARCH POSTCODE_COORD", {
                        postcode,
                        lat: pc.lat,
                        lng: pc.lng,
                        branchCount: branches.length
                      });
                    }
                  } else {
                    let branches = await this.safeFindBranchesByPostcode(postcode, 1, branchTimeoutMs);
                    if (!branches.length) {
                      try {
                        branches = await this.options.storage.findBranchesByPostcode({
                          postcode,
                          limit: 1
                        });
                      } catch {
                        branches = [];
                      }
                    }
                    nearestBranch = branches[0] || null;
                    if (process.env.AI_DEBUG === "1") {
                      console.log("AI_SEARCH POSTCODE_TEXT", {
                        postcode,
                        branchCount: branches.length,
                        branch: branches[0]?.name || null
                      });
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
                const hint = this.normalizeLocationHint(this.extractCustomerLocationHint(data));
                if (hint.length >= 3) {
                  branchTextSearch = true;
                  const branches = await this.safeFindBranchesByText(hint, 1, branchTimeoutMs);
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
          } else {
            decision = "CALL";
          }
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
          const fuzzyResults = await this.options.storage.aiFuzzySearch({ query, limit: 5 });
          const tokens = this.tokenizeQuery(query);
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
            const hasAny = [name, ic, addr].some((value) => value && value !== "-" && String(value).trim() !== "");
            return hasAny ? `- ${name} | IC: ${ic} | Alamat: ${addr} | Keyakinan: ${confidence}%` : "";
          }).filter(Boolean);
        }
        const personSummary = this.buildPersonSummary(person);
        const branchSummary = this.buildBranchSummary(nearestBranch);
        const explanation = this.buildExplanation({
          decision,
          distanceKm: nearestBranch?.distanceKm ?? null,
          branch: nearestBranch?.name ?? null,
          personSummary,
          branchSummary,
          estimatedMinutes,
          travelMode,
          missingCoords,
          suggestions,
          matchFields: !hasDigitsQuery && person && typeof person === "object" ? this.buildFieldMatchSummary(person, query) : [],
          branchTextSearch
        });
        return {
          payload: {
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
          },
          audit: {
            query,
            intent,
            matched_profile_id: person?.id || null,
            branch: nearestBranch?.name || null,
            distance_km: nearestBranch?.distanceKm || null,
            decision,
            travel_mode: travelMode,
            estimated_minutes: estimatedMinutes,
            used_last_person: !best && !!fallbackPerson
          }
        };
      }
      getLastAiPerson(userKey) {
        const entry = this.lastAiPerson.get(userKey);
        if (!entry) return null;
        if (Date.now() - entry.ts >= this.lastAiPersonTtlMs) {
          this.lastAiPerson.delete(userKey);
          return null;
        }
        return entry.row;
      }
      buildPersonSummary(person) {
        const summary = [];
        if (person && typeof person === "object") {
          const pushIf = (label, key) => {
            const value = person[key];
            if (value !== void 0 && value !== null && String(value).trim() !== "") {
              summary.push({ label, value: String(value) });
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
        if (summary.length === 0 && person && typeof person === "object") {
          const entries = Object.entries(person).filter(([key]) => key !== "id").slice(0, 8);
          for (const [key, value] of entries) {
            if (value !== void 0 && value !== null && String(value).trim() !== "") {
              summary.push({ label: key, value: String(value) });
            }
          }
        }
        return summary;
      }
      buildBranchSummary(nearestBranch) {
        const summary = [];
        if (!nearestBranch) {
          return summary;
        }
        const push = (label, value) => {
          if (value !== void 0 && value !== null && String(value).trim() !== "") {
            summary.push({ label, value: String(value) });
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
        return summary;
      }
      buildExplanation(payload) {
        const personLines = payload.personSummary.length > 0 ? payload.personSummary.map((item) => `${item.label}: ${item.value}`).join("\n") : "Tiada maklumat pelanggan dijumpai.";
        const branchLines = payload.branchSummary.length > 0 ? payload.branchSummary.map((item) => `${item.label}: ${item.value}`).join("\n") : payload.missingCoords ? "Lokasi pelanggan tidak lengkap (tiada LAT/LNG atau Postcode)." : payload.branchTextSearch ? "Tiada padanan cawangan ditemui berdasarkan lokasi/teks." : "Tiada maklumat cawangan dijumpai.";
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
      }
      async parseIntent(query, timeoutMs = this.options.defaultAiTimeoutMs) {
        const intentMode = String(process.env.AI_INTENT_MODE || "fast").toLowerCase();
        if (intentMode === "fast") {
          return this.parseIntentFallback(query);
        }
        const system = 'Anda hanya keluarkan JSON SAHAJA. Tugas: kenalpasti intent carian dan entiti.\nFormat WAJIB:\n{"intent":"search_person","entities":{"name":null,"ic":null,"account_no":null,"phone":null,"address":null},"need_nearest_branch":false}\nJika IC/MyKad ada, isi "ic". Jika akaun, isi "account_no". Jika nombor telefon, isi "phone".';
        const messages = [
          { role: "system", content: system },
          { role: "user", content: query }
        ];
        try {
          const raw = await this.options.withAiCircuit(
            () => this.options.ollamaChat(messages, {
              num_predict: 160,
              temperature: 0.1,
              top_p: 0.9,
              timeoutMs
            })
          );
          const parsed = this.extractJsonObject(raw);
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
        return this.parseIntentFallback(query);
      }
      parseIntentFallback(query) {
        const digits = query.match(/\d{6,}/g) || [];
        const ic = digits.find((value) => value.length === 12) || null;
        const account = digits.find((value) => value.length >= 10 && value.length <= 16) || null;
        const phone = digits.find((value) => value.length >= 9 && value.length <= 11) || null;
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
      }
      extractJsonObject(text2) {
        const first = text2.indexOf("{");
        const last = text2.lastIndexOf("}");
        if (first === -1 || last === -1 || last <= first) {
          return null;
        }
        try {
          return JSON.parse(text2.slice(first, last + 1));
        } catch {
          return null;
        }
      }
      tokenizeQuery(text2) {
        return text2.toLowerCase().split(/\s+/).map((token) => token.replace(/[^a-z0-9]/gi, "")).filter((token) => token.length >= 3);
      }
      buildFieldMatchSummary(data, query) {
        const tokens = this.tokenizeQuery(query);
        if (tokens.length === 0) {
          return [];
        }
        const matches = [];
        for (const [key, value] of Object.entries(data || {}).slice(0, 80)) {
          if (key === "id") continue;
          const valueStr = String(value ?? "");
          const valueLower = valueStr.toLowerCase();
          let score = 0;
          for (const token of tokens) {
            if (valueLower.includes(token)) score += 1;
          }
          if (score > 0) {
            matches.push({ key, value: valueStr, score });
          }
        }
        return matches.sort((a, b) => b.score - a.score).slice(0, 6).map((match) => `${match.key}: ${match.value}`);
      }
      rowScore(row, ic, name, account, phone) {
        const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
        let score = 0;
        const icDigits = ic ? ic.replace(/\D/g, "") : "";
        const accountDigits = account ? account.replace(/\D/g, "") : "";
        const phoneDigits = phone ? phone.replace(/\D/g, "") : "";
        for (const [key, value] of Object.entries(data).slice(0, 80)) {
          const keyLower = key.toLowerCase();
          const valueStr = String(value ?? "");
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
      }
      scoreRowDigits(row, digits) {
        let data = row?.jsonDataJsonb;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch {
            data = {};
          }
        }
        if (!data || typeof data !== "object") {
          data = {};
        }
        const keyGroups = [
          { keys: ["No. MyKad", "ID No", "No Pengenalan", "IC", "NRIC", "MyKad"], score: 20 },
          {
            keys: [
              "Account No",
              "Account Number",
              "Card No",
              "No Akaun",
              "Nombor Akaun Bank Pemohon"
            ],
            score: 12
          },
          {
            keys: ["No. Telefon Rumah", "No. Telefon Bimbit", "Phone", "Handphone", "OfficePhone"],
            score: 8
          }
        ];
        let best = 0;
        for (const group of keyGroups) {
          for (const key of group.keys) {
            const value = data[key];
            if (!value) continue;
            if (String(value).replace(/\D/g, "") === digits) {
              best = Math.max(best, group.score);
            }
          }
        }
        return { score: best, parsed: data };
      }
      ensureJson(row) {
        if (row?.jsonDataJsonb && typeof row.jsonDataJsonb === "string") {
          try {
            row.jsonDataJsonb = JSON.parse(row.jsonDataJsonb);
          } catch {
          }
        }
        return row;
      }
      extractLatLng(data) {
        const keys = Object.keys(data);
        const findValue = (names) => {
          const key = keys.find((candidate) => names.includes(candidate.toLowerCase()));
          if (!key) return null;
          const value = Number(String(data[key]).replace(/[^0-9.\-]/g, ""));
          return Number.isFinite(value) ? value : null;
        };
        const lat = findValue(["lat", "latitude", "latitud"]);
        const lng = findValue(["lng", "long", "longitude", "longitud"]);
        if (lat === null || lng === null) {
          return null;
        }
        return { lat, lng };
      }
      isLatLng(value) {
        if (!value || typeof value !== "object") return false;
        const candidate = value;
        return typeof candidate.lat === "number" && Number.isFinite(candidate.lat) && typeof candidate.lng === "number" && Number.isFinite(candidate.lng);
      }
      isNonEmptyString(value) {
        return typeof value === "string" && value.trim().length > 0;
      }
      hasPostcodeCoord(value) {
        return this.isLatLng(value);
      }
      extractCustomerPostcode(data) {
        if (!data || typeof data !== "object") return null;
        const entries = Object.entries(data);
        const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
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
          return relationWordsNorm.some((word) => normalizedKey.includes(word));
        };
        const pickByKey = (matcher, valueMatcher) => {
          for (const [rawKey, rawValue] of entries) {
            const keyNorm = normalize(rawKey);
            if (!matcher(keyNorm, rawKey)) continue;
            if (valueMatcher && !valueMatcher(keyNorm, rawValue)) continue;
            const postcode = extractDigits(rawValue);
            if (postcode) return postcode;
          }
          return null;
        };
        const homePostcode = pickByKey(
          (key) => !isRelationKey(key) && key.includes("home") && (key.includes("postcode") || key.includes("postalcode") || key.includes("poskod"))
        );
        if (homePostcode) return homePostcode;
        const genericPostcode = pickByKey((key) => {
          const isGenericPostcode = key === "poskod" || key === "postcode" || key === "postalcode" || key.endsWith("postcode") || key.endsWith("poskod");
          if (!isGenericPostcode) return false;
          if (/[23]$/.test(key)) return false;
          if (key.includes("office")) return false;
          if (isRelationKey(key)) return false;
          return true;
        });
        if (genericPostcode) return genericPostcode;
        return pickByKey(
          (key) => {
            if (isRelationKey(key)) return false;
            if (key.includes("office")) return false;
            return key.includes("homeaddress") || key.includes("alamatsuratmenyurat") || key === "address" || key.includes("alamat");
          },
          (_key, rawValue) => this.isNonEmptyString(rawValue)
        );
      }
      extractCustomerLocationHint(data) {
        if (!data || typeof data !== "object") return "";
        const normalizeKey = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
        const relationWords = [
          "pasangan",
          "wakil",
          "hubungan",
          "spouse",
          "guardian",
          "waris",
          "ibu",
          "bapa",
          "suami",
          "isteri"
        ];
        const relationWordsNorm = relationWords.map(normalizeKey);
        const isRelationKey = (key) => relationWordsNorm.some((word) => key.includes(word));
        const parts = [];
        for (const [rawKey, rawValue] of Object.entries(data)) {
          if (!this.isNonEmptyString(rawValue)) continue;
          const key = normalizeKey(rawKey);
          if (isRelationKey(key)) continue;
          if (key.includes("office")) continue;
          const isLocationField = key.includes("homeaddress") || key.includes("alamatsuratmenyurat") || key === "address" || key.includes("alamat") || key === "bandar" || key === "city" || key.includes("citytown") || key === "negeri" || key === "state" || key.includes("postcode") || key.includes("poskod");
          if (!isLocationField) continue;
          const value = String(rawValue).trim();
          if (value) {
            parts.push(value);
          }
        }
        return Array.from(new Set(parts)).join(" ");
      }
      normalizeLocationHint(value) {
        return value.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
      }
      toObjectJson(value) {
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
      }
      async safeFindBranchesByText(text2, limit, timeoutMs) {
        try {
          return await this.withTimeout(
            this.options.storage.findBranchesByText({ query: text2, limit }),
            timeoutMs
          );
        } catch {
          return [];
        }
      }
      async safeFindBranchesByPostcode(postcode, limit, timeoutMs) {
        try {
          return await this.withTimeout(
            this.options.storage.findBranchesByPostcode({ postcode, limit }),
            timeoutMs
          );
        } catch {
          return [];
        }
      }
      async safeNearestBranches(lat, lng, limit, timeoutMs) {
        try {
          return await this.withTimeout(
            this.options.storage.getNearestBranches({ lat, lng, limit }),
            timeoutMs
          );
        } catch {
          return [];
        }
      }
      async safePostcodeLatLng(postcode, timeoutMs) {
        try {
          return await this.withTimeout(this.options.storage.getPostcodeLatLng(postcode), timeoutMs);
        } catch {
          return null;
        }
      }
      withTimeout(promise, ms) {
        return new Promise((resolve, reject) => {
          const id = setTimeout(() => reject(new Error("timeout")), ms);
          promise.then((value) => {
            clearTimeout(id);
            resolve(value);
          }).catch((error) => {
            clearTimeout(id);
            reject(error);
          });
        });
      }
      trimCacheEntries(cache, maxEntries) {
        if (cache.size <= maxEntries) return;
        const excess = cache.size - maxEntries;
        const keysByAge = Array.from(cache.entries()).sort((a, b) => a[1].ts - b[1].ts).slice(0, excess).map(([key]) => key);
        for (const key of keysByAge) {
          cache.delete(key);
        }
      }
    };
  }
});

// server/services/category-stats.service.ts
var CATEGORY_RULES_CACHE_MS, DEFAULT_COUNT_GROUPS, CategoryStatsService;
var init_category_stats_service = __esm({
  "server/services/category-stats.service.ts"() {
    "use strict";
    CATEGORY_RULES_CACHE_MS = 6e4;
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
    CategoryStatsService = class {
      constructor(storage2) {
        this.storage = storage2;
        this.categoryRulesCache = null;
        this.categoryStatsInflight = /* @__PURE__ */ new Map();
      }
      async resolveCountSummary(query, timeoutMs) {
        const rules = await this.loadCategoryRules();
        const countGroups = this.detectCountRequest(query, rules);
        if (!countGroups) {
          return null;
        }
        const keys = [...countGroups.map((group) => group.key), "__all__"];
        const rulesUpdatedAt = await this.storage.getCategoryRulesMaxUpdatedAt();
        let statsRows = await this.storage.getCategoryStats(keys);
        let statsMap = new Map(statsRows.map((row) => [row.key, row]));
        let totalRow = statsMap.get("__all__");
        const statsUpdatedAt = totalRow?.updatedAt ?? null;
        const missingKeys = keys.filter((key) => !statsMap.get(key));
        const staleStats = Boolean(rulesUpdatedAt && statsUpdatedAt && rulesUpdatedAt > statsUpdatedAt);
        if (!totalRow || missingKeys.length > 0 || staleStats) {
          const computeKeys = staleStats ? keys : Array.from(/* @__PURE__ */ new Set([...missingKeys, "__all__"]));
          let readyNow = false;
          try {
            await this.withTimeout(
              this.storage.computeCategoryStatsForKeys(computeKeys, rules),
              Math.max(3e3, timeoutMs)
            );
            statsRows = await this.storage.getCategoryStats(keys);
            statsMap = new Map(statsRows.map((row) => [row.key, row]));
            totalRow = statsMap.get("__all__");
            readyNow = Boolean(totalRow && keys.every((key) => statsMap.has(key)));
          } catch {
            readyNow = false;
          }
          if (!readyNow) {
            this.enqueueCategoryStatsCompute(computeKeys, rules);
            return {
              processing: true,
              summary: "Statistik sedang disediakan. Sila cuba semula dalam 10-20 saat.",
              stats: []
            };
          }
        }
        return {
          processing: false,
          summary: this.buildSummary(countGroups, statsMap, totalRow?.total ?? 0),
          stats: statsRows
        };
      }
      async warmCategoryStats() {
        const rules = await this.loadCategoryRules();
        const enabledRuleKeys = rules.filter((rule) => rule.enabled !== false).map((rule) => rule.key);
        const targetKeys = Array.from(/* @__PURE__ */ new Set(["__all__", ...enabledRuleKeys]));
        const rulesUpdatedAt = await this.storage.getCategoryRulesMaxUpdatedAt();
        const existing = await this.storage.getCategoryStats(targetKeys);
        const byKey = new Map(existing.map((row) => [row.key, row]));
        const statsUpdatedAt = byKey.get("__all__")?.updatedAt ?? null;
        const hasAllKeys = targetKeys.every((key) => byKey.has(key));
        const isStale = Boolean(rulesUpdatedAt && statsUpdatedAt && rulesUpdatedAt > statsUpdatedAt);
        if (hasAllKeys && !isStale) {
          return { skipped: true, computeKeys: 0 };
        }
        const missingKeys = targetKeys.filter((key) => !byKey.has(key));
        const computeKeys = isStale ? targetKeys : Array.from(/* @__PURE__ */ new Set([...missingKeys, "__all__"]));
        await this.storage.computeCategoryStatsForKeys(computeKeys, rules);
        return { skipped: false, computeKeys: computeKeys.length };
      }
      async loadCategoryRules() {
        if (this.categoryRulesCache && Date.now() - this.categoryRulesCache.ts < CATEGORY_RULES_CACHE_MS) {
          return this.categoryRulesCache.rules;
        }
        try {
          const rules = await this.storage.getCategoryRules();
          if (rules.length > 0) {
            this.categoryRulesCache = { ts: Date.now(), rules };
            return rules;
          }
        } catch {
        }
        return DEFAULT_COUNT_GROUPS;
      }
      detectCountRequest(query, rules) {
        const lower = query.toLowerCase();
        const trigger = /(berapa|jumlah|bilangan|ramai|count|how many|berapa orang)/i.test(lower);
        if (!trigger) {
          return null;
        }
        const enabledRules = rules.filter((rule) => rule.enabled !== false);
        const matched = enabledRules.filter(
          (group) => group.terms.some((term) => lower.includes(term.toLowerCase())) || lower.includes(group.key)
        );
        return matched.length > 0 ? matched : enabledRules;
      }
      enqueueCategoryStatsCompute(keys, rules) {
        const normalized = Array.from(new Set(keys)).filter(Boolean).sort();
        if (!normalized.length) {
          return;
        }
        const queueKey = normalized.join("|");
        if (this.categoryStatsInflight.has(queueKey)) {
          return;
        }
        const task = this.storage.computeCategoryStatsForKeys(normalized, rules).then(() => void 0).catch((error) => {
          console.error("Category stats compute failed:", error?.message || error);
        }).finally(() => {
          this.categoryStatsInflight.delete(queueKey);
        });
        this.categoryStatsInflight.set(queueKey, task);
      }
      buildSummary(countGroups, statsMap, total) {
        const summaryLines = [
          "Ringkasan Statistik (berdasarkan data import):",
          `Jumlah rekod dianalisis: ${total}`
        ];
        for (const group of countGroups) {
          const row = statsMap.get(group.key);
          const count3 = row?.total ?? 0;
          summaryLines.push(`- ${group.key}: ${count3}`);
          if (row?.samples?.length) {
            summaryLines.push("  Contoh rekod:");
            for (const sample of row.samples.slice(0, 10)) {
              const source = sample.source ? ` (${sample.source})` : "";
              summaryLines.push(`  - ${sample.name} | IC: ${sample.ic}${source}`);
            }
          }
        }
        return summaryLines.join("\n");
      }
      withTimeout(promise, ms) {
        return new Promise((resolve, reject) => {
          const id = setTimeout(() => reject(new Error("timeout")), ms);
          promise.then((value) => {
            clearTimeout(id);
            resolve(value);
          }).catch((error) => {
            clearTimeout(id);
            reject(error);
          });
        });
      }
    };
  }
});

// server/services/import-analysis.service.ts
function isValidMalaysianIC(ic) {
  if (!/^\d{12}$/.test(ic)) return false;
  if (ic.startsWith("01")) return false;
  const month = Number.parseInt(ic.substring(2, 4), 10);
  const day = Number.parseInt(ic.substring(4, 6), 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}
function splitCellValue(value) {
  const withoutLabels = value.replace(/\b(IC\d*|NRIC|NO\.?\s*IC|KAD PENGENALAN|KP)\s*[:=]/gi, " ");
  return withoutLabels.split(/[\/,;|\n\r\s]+/).map((item) => item.trim()).filter(Boolean);
}
function createAccumulator() {
  return {
    icLelakiSet: /* @__PURE__ */ new Set(),
    icPerempuanSet: /* @__PURE__ */ new Set(),
    noPolisSet: /* @__PURE__ */ new Set(),
    noTenteraSet: /* @__PURE__ */ new Set(),
    passportMYSet: /* @__PURE__ */ new Set(),
    passportLuarNegaraSet: /* @__PURE__ */ new Set(),
    valueCounts: {},
    processedValues: /* @__PURE__ */ new Set()
  };
}
function consumeRows(accumulator, rows) {
  const passportPattern = /^[A-Z]{1,2}\d{6,9}$/i;
  const malaysiaPassportPrefixes = ["A", "H", "K", "Q"];
  const excludePrefixes = ["LOT", "NO", "PT", "KM", "JLN", "BLK", "TMN", "KG", "SG", "BTU", "RM"];
  const isValidPolisNo = (value) => {
    if (/^P\d{3,}$/i.test(value)) return false;
    if (/^G\d{5,10}$/i.test(value)) return true;
    if (/^(RF|SW)\d{4,10}$/i.test(value)) return true;
    if (/^(RFT|PDRM|POLIS|POL)\d{3,10}$/i.test(value)) return true;
    return false;
  };
  const isValidTenteraNo = (value) => {
    if (/^M\d{3,}$/i.test(value)) return false;
    if (/^T\d{5,10}$/i.test(value)) return true;
    if (/^(TD|TA|TT)\d{4,10}$/i.test(value)) return true;
    if (/^(TLDM|TUDM|ARMY|ATM|MAF|TEN|MIL)\d{3,10}$/i.test(value)) return true;
    return false;
  };
  for (const row of rows) {
    const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
    for (const [key, rawValue] of Object.entries(data)) {
      if (typeof rawValue !== "string") continue;
      const keyUpper = key.toUpperCase();
      const isExcludedFromIC = EXCLUDE_COLUMNS_FROM_IC.some((value) => keyUpper.includes(value));
      const isExcludedFromPolice = EXCLUDE_COLUMNS_FROM_POLICE.some((value) => keyUpper.includes(value));
      for (const fragment of splitCellValue(rawValue)) {
        const cleaned = fragment.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!cleaned) continue;
        accumulator.valueCounts[cleaned] = (accumulator.valueCounts[cleaned] || 0) + 1;
        if (accumulator.processedValues.has(cleaned)) continue;
        accumulator.processedValues.add(cleaned);
        if (!isExcludedFromIC && isValidMalaysianIC(cleaned)) {
          const lastDigit = Number.parseInt(cleaned.charAt(11), 10);
          if (lastDigit % 2 === 1) accumulator.icLelakiSet.add(cleaned);
          else accumulator.icPerempuanSet.add(cleaned);
          continue;
        }
        if (!isExcludedFromPolice && isValidPolisNo(cleaned)) {
          accumulator.noPolisSet.add(cleaned);
          continue;
        }
        if (isValidTenteraNo(cleaned)) {
          accumulator.noTenteraSet.add(cleaned);
          continue;
        }
        if (!passportPattern.test(cleaned)) continue;
        if (excludePrefixes.some((prefix) => cleaned.startsWith(prefix))) continue;
        const firstChar = cleaned.charAt(0);
        if (malaysiaPassportPrefixes.includes(firstChar)) {
          accumulator.passportMYSet.add(cleaned);
        } else {
          accumulator.passportLuarNegaraSet.add(cleaned);
        }
      }
    }
  }
}
function finalizeAccumulator(accumulator) {
  const duplicateItems = Object.entries(accumulator.valueCounts).filter(([, count3]) => count3 > 1).map(([value, count3]) => ({ value, count: count3 })).sort((left, right) => right.count - left.count);
  const icLelaki = Array.from(accumulator.icLelakiSet);
  const icPerempuan = Array.from(accumulator.icPerempuanSet);
  const noPolis = Array.from(accumulator.noPolisSet);
  const noTentera = Array.from(accumulator.noTenteraSet);
  const passportMY = Array.from(accumulator.passportMYSet);
  const passportLuarNegara = Array.from(accumulator.passportLuarNegaraSet);
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
var ANALYSIS_BATCH_SIZE, EXCLUDE_COLUMNS_FROM_IC, EXCLUDE_COLUMNS_FROM_POLICE, ImportAnalysisService;
var init_import_analysis_service = __esm({
  "server/services/import-analysis.service.ts"() {
    "use strict";
    ANALYSIS_BATCH_SIZE = 500;
    EXCLUDE_COLUMNS_FROM_IC = [
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
    EXCLUDE_COLUMNS_FROM_POLICE = [
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
    ImportAnalysisService = class {
      constructor(importsRepository2) {
        this.importsRepository = importsRepository2;
      }
      async analyzeImport(importRecord) {
        const accumulator = createAccumulator();
        const totalRows = await this.importsRepository.getDataRowCountByImport(importRecord.id);
        for (let offset = 0; offset < totalRows; offset += ANALYSIS_BATCH_SIZE) {
          const rows = await this.importsRepository.getDataRowsByImportPage(
            importRecord.id,
            ANALYSIS_BATCH_SIZE,
            offset
          );
          consumeRows(accumulator, rows);
        }
        return {
          import: {
            id: importRecord.id,
            name: importRecord.name,
            filename: importRecord.filename
          },
          totalRows,
          analysis: finalizeAccumulator(accumulator)
        };
      }
      async analyzeAll(importsWithCounts) {
        if (importsWithCounts.length === 0) {
          return {
            totalImports: 0,
            totalRows: 0,
            imports: [],
            analysis: finalizeAccumulator(createAccumulator())
          };
        }
        const accumulator = createAccumulator();
        let totalRows = 0;
        for (const importRecord of importsWithCounts) {
          totalRows += Number(importRecord.rowCount || 0);
          for (let offset = 0; offset < Number(importRecord.rowCount || 0); offset += ANALYSIS_BATCH_SIZE) {
            const rows = await this.importsRepository.getDataRowsByImportPage(
              importRecord.id,
              ANALYSIS_BATCH_SIZE,
              offset
            );
            consumeRows(accumulator, rows);
          }
        }
        return {
          totalImports: importsWithCounts.length,
          totalRows,
          imports: importsWithCounts.map((importRecord) => ({
            id: importRecord.id,
            name: importRecord.name,
            filename: importRecord.filename,
            rowCount: importRecord.rowCount
          })),
          analysis: finalizeAccumulator(accumulator)
        };
      }
    };
  }
});

// server/ws/runtime-manager.ts
import jwt4 from "jsonwebtoken";
import { WebSocket as WebSocket4 } from "ws";
function createRuntimeWebSocketManager(options) {
  const { wss: wss2, storage: storage2, secret } = options;
  const connectedClients2 = /* @__PURE__ */ new Map();
  const broadcastWsMessage2 = (payload) => {
    const message = JSON.stringify(payload);
    for (const [activityId, ws] of connectedClients2.entries()) {
      if (!ws || ws.readyState !== WebSocket4.OPEN) {
        connectedClients2.delete(activityId);
        void storage2.clearCollectionNicknameSessionByActivity(activityId);
        continue;
      }
      try {
        ws.send(message);
      } catch {
        connectedClients2.delete(activityId);
        void storage2.clearCollectionNicknameSessionByActivity(activityId);
      }
    }
  };
  setInterval(() => {
    for (const [activityId, ws] of connectedClients2.entries()) {
      if (!ws || ws.readyState !== WebSocket4.OPEN && ws.readyState !== WebSocket4.CONNECTING) {
        connectedClients2.delete(activityId);
      }
    }
  }, 3e4).unref();
  wss2.on("connection", async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    if (!token) {
      ws.close();
      return;
    }
    try {
      const decoded = jwt4.verify(token, secret);
      const activityId = String(decoded.activityId || "");
      if (!activityId) {
        ws.close();
        return;
      }
      const activity = await storage2.getActivityById(activityId);
      if (!activity || activity.isActive === false || activity.logoutTime !== null) {
        console.log("WS rejected: invalid or expired session");
        ws.close();
        return;
      }
      const existingWs = connectedClients2.get(activityId);
      if (existingWs && existingWs.readyState === WebSocket4.OPEN) {
        existingWs.close();
      }
      connectedClients2.set(activityId, ws);
      console.log(`WS connected for activityId=${activityId}`);
      const cleanupSocket = () => {
        if (connectedClients2.get(activityId) === ws) {
          connectedClients2.delete(activityId);
        }
      };
      ws.on("close", () => {
        cleanupSocket();
        console.log(`WS closed for activityId=${activityId}`);
      });
      ws.on("error", cleanupSocket);
    } catch {
      console.log("WS handshake failed");
      ws.close();
    }
  });
  return {
    connectedClients: connectedClients2,
    broadcastWsMessage: broadcastWsMessage2
  };
}
var init_runtime_manager = __esm({
  "server/ws/runtime-manager.ts"() {
    "use strict";
  }
});

// server/index-local.ts
var index_local_exports = {};
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import path3 from "path";
import { WebSocketServer } from "ws";
function notifyMasterFatalStartup(reason, details) {
  if (startupFatalReason) return;
  startupFatalReason = reason;
  if (typeof process.send === "function") {
    try {
      process.send({
        type: "worker-fatal",
        payload: { reason, details: details || "" }
      });
    } catch {
    }
  }
}
function clamp4(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function isHeavyRoute(pathname) {
  return pathname.startsWith("/api/ai/") || pathname.startsWith("/api/imports") || pathname.startsWith("/api/search/advanced") || pathname.startsWith("/api/backups");
}
function getSearchQueueLength() {
  const map = global.__searchInflightMap;
  return map?.size ?? 0;
}
function resolveAdaptiveRateBucket(req) {
  const controlState = getControlState();
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const method = String(req.method || "GET").toUpperCase();
  const path5 = req.path || "/";
  let bucketScope = "api";
  let baseLimit = 40;
  let minLimit = 8;
  if (path5.startsWith("/api/ai/")) {
    bucketScope = "ai";
    baseLimit = 14;
    minLimit = 4;
  } else if (path5.startsWith("/api/activity/heartbeat")) {
    bucketScope = "heartbeat";
    baseLimit = 120;
    minLimit = 20;
  } else if (method === "GET" && (path5.startsWith("/api/collection/nicknames") || path5.startsWith("/api/collection/admin-groups"))) {
    bucketScope = "collection-meta";
    baseLimit = 120;
    minLimit = 24;
  }
  const modePenalty = controlState.mode === "PROTECTION" ? 0.5 : controlState.mode === "DEGRADED" ? 0.75 : 1;
  const throttle = clamp4(controlState.throttleFactor || 1, 0.2, 1.2);
  const dynamicLimit = Math.max(minLimit, Math.floor(baseLimit * modePenalty * throttle));
  return { bucketKey: `${ip}:${bucketScope}`, dynamicLimit };
}
function adaptiveRateLimit(req, res, next) {
  const controlState = getControlState();
  if (!req.path.startsWith("/api/")) return next();
  const windowMs = 1e4;
  const now = Date.now();
  const { bucketKey, dynamicLimit } = resolveAdaptiveRateBucket(req);
  const bucket = adaptiveRateState.get(bucketKey);
  if (!bucket || now >= bucket.resetAt) {
    adaptiveRateState.set(bucketKey, { count: 1, resetAt: now + windowMs });
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
  const controlState = getControlState();
  if (!req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/api/health") || req.path.startsWith("/api/maintenance-status")) {
    return next();
  }
  const dbProtection = getDbProtection();
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
  registerFrontendStatic(app);
  startIdleSessionSweeper({
    storage,
    connectedClients,
    getRuntimeSettingsCached,
    defaultSessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES
  });
  const PORT = parseInt(process.env.PORT || "5000", 10);
  const HOST = "0.0.0.0";
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      notifyMasterFatalStartup("EADDRINUSE", `Port ${PORT} is already in use`);
      console.error(`\xE2\x9D\u0152 Port ${PORT} is already in use.`);
      console.error(`   This usually means a previous server process hasn't fully released the port yet.`);
      console.error(`   Please wait a few seconds and try again, or use: lsof -i :${PORT} (or netstat -ano | findstr :${PORT} on Windows)`);
      setTimeout(() => process.exit(98), 10).unref();
    } else {
      notifyMasterFatalStartup("SERVER_STARTUP_ERROR", String(err?.message || err));
      console.error(`\xE2\x9D\u0152 Server error:`, err);
      setTimeout(() => process.exit(1), 10).unref();
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
        const result = await categoryStatsService.warmCategoryStats();
        if (result.skipped) {
          console.log("\xE2\u0153\u2026 Category stats already present. Skipping precompute.");
          return;
        }
        console.log(`\xE2\x8F\xB1\xEF\xB8\x8F Precomputing category stats (${result.computeKeys} key(s))...`);
        console.log("\xE2\u0153\u2026 Precomputed category stats.");
      } catch (err) {
        console.error("\xE2\x9D\u0152 Precompute stats failed:", err?.message || err);
      }
    }, 0);
  }
}
var storage, importsRepository, searchRepository, auditRepository, analyticsRepository, backupsRepository, importAnalysisService, app, server, wss, startupFatalReason, JWT_SECRET, websocketManager, connectedClients, broadcastWsMessage, modularAuthGuards, modularAuthenticateToken, modularRequireRole, modularRequireTabAccess, modularRequireMonitorAccess, clearModularTabVisibilityCache, DEFAULT_SESSION_TIMEOUT_MINUTES, DEFAULT_WS_IDLE_MINUTES, DEFAULT_AI_TIMEOUT_MS, DEFAULT_BODY_LIMIT, IMPORT_BODY_LIMIT, COLLECTION_BODY_LIMIT, UPLOADS_ROOT_DIR, PG_POOL_WARN_COOLDOWN_MS, AI_PRECOMPUTE_ON_START, API_DEBUG_LOGS, LOW_MEMORY_MODE, AI_GATE_GLOBAL_LIMIT, AI_GATE_QUEUE_LIMIT, AI_GATE_QUEUE_WAIT_MS, AI_GATE_ROLE_LIMITS, AI_LATENCY_STALE_AFTER_MS, AI_LATENCY_DECAY_HALF_LIFE_MS, MAINTENANCE_CACHE_TTL_MS, RUNTIME_SETTINGS_CACHE_TTL_MS, runtimeMonitorManager, attachGcObserver, attachProcessMessageHandlers, buildInternalMonitorAlerts, computeInternalMonitorSnapshot, getControlState, getDbProtection, getLatencyP95, getLocalCircuitSnapshots, getRequestRate, recordRequestFinished, recordRequestStarted, startRuntimeLoops, withAiCircuit, withDbCircuit, withExportCircuit, DB_METHOD_WRAP_EXCLUDE, aiSearchService, categoryStatsService, aiChatService, aiIndexService, adaptiveRateState, aiGateSeq, aiGateInflightGlobal, aiGateInflightByRole, aiGateQueue, runtimeConfigManager, invalidateMaintenanceCache, invalidateRuntimeSettingsCache, getRuntimeSettingsCached, getMaintenanceStateCached, maintenanceGuard;
var init_index_local = __esm({
  "server/index-local.ts"() {
    "use strict";
    init_storage_postgres();
    init_db_postgres();
    init_rate_limit();
    init_ai_ollama();
    init_circuitBreaker();
    init_frontend_static();
    init_idle_session_sweeper();
    init_runtime_config_manager();
    init_runtime_monitor_manager();
    init_wrapAsyncPrototypeMethods();
    init_intelligence();
    init_security();
    init_guards();
    init_error_handler();
    init_auth_routes();
    init_activity_routes();
    init_imports_routes();
    init_search_routes();
    init_ai_routes();
    init_system_routes();
    init_settings_routes();
    init_operations_routes();
    init_collection_routes();
    init_imports_repository();
    init_search_repository();
    init_audit_repository();
    init_analytics_repository();
    init_backups_repository();
    init_ai_chat_service();
    init_ai_index_service();
    init_ai_search_service();
    init_category_stats_service();
    init_import_analysis_service();
    init_runtime_manager();
    storage = new PostgresStorage();
    importsRepository = new ImportsRepository();
    searchRepository = new SearchRepository();
    auditRepository = new AuditRepository();
    analyticsRepository = new AnalyticsRepository();
    backupsRepository = new BackupsRepository({
      ensureBackupsTable: () => storage.ensureBackupsReady(),
      parseBackupMetadataSafe: (raw) => storage.parseBackupMetadata(raw)
    });
    importAnalysisService = new ImportAnalysisService(importsRepository);
    app = express2();
    server = createServer(app);
    wss = new WebSocketServer({ server, path: "/ws" });
    startupFatalReason = null;
    wss.on("error", (err) => {
      const code = String(err?.code || "");
      if (code === "EADDRINUSE") {
        notifyMasterFatalStartup("EADDRINUSE", "WebSocket server failed to bind address");
        console.error("\xE2\x9D\u0152 WebSocket startup failed: port already in use.");
        setTimeout(() => process.exit(98), 10).unref();
        return;
      }
      console.error("\xE2\x9D\u0152 WebSocket server error:", err);
    });
    JWT_SECRET = getSessionSecret();
    websocketManager = createRuntimeWebSocketManager({
      wss,
      storage,
      secret: JWT_SECRET
    });
    ({ connectedClients, broadcastWsMessage } = websocketManager);
    modularAuthGuards = createAuthGuards({ storage, secret: JWT_SECRET });
    modularAuthenticateToken = modularAuthGuards.authenticateToken;
    modularRequireRole = modularAuthGuards.requireRole;
    modularRequireTabAccess = modularAuthGuards.requireTabAccess;
    modularRequireMonitorAccess = modularAuthGuards.requireMonitorAccess;
    clearModularTabVisibilityCache = modularAuthGuards.clearTabVisibilityCache;
    DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
    DEFAULT_WS_IDLE_MINUTES = 3;
    DEFAULT_AI_TIMEOUT_MS = 6e3;
    DEFAULT_BODY_LIMIT = "2mb";
    IMPORT_BODY_LIMIT = process.env.IMPORT_BODY_LIMIT || "50mb";
    COLLECTION_BODY_LIMIT = process.env.COLLECTION_BODY_LIMIT || "8mb";
    UPLOADS_ROOT_DIR = path3.resolve(process.cwd(), "uploads");
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
    RUNTIME_SETTINGS_CACHE_TTL_MS = 3e3;
    runtimeMonitorManager = createRuntimeMonitorManager({
      pool,
      apiDebugLogs: API_DEBUG_LOGS,
      lowMemoryMode: LOW_MEMORY_MODE,
      pgPoolWarnCooldownMs: PG_POOL_WARN_COOLDOWN_MS,
      aiLatencyStaleAfterMs: AI_LATENCY_STALE_AFTER_MS,
      aiLatencyDecayHalfLifeMs: AI_LATENCY_DECAY_HALF_LIFE_MS,
      getSearchQueueLength: () => getSearchQueueLength(),
      evaluateSystem
    });
    ({
      attachGcObserver,
      attachProcessMessageHandlers,
      buildInternalMonitorAlerts,
      computeInternalMonitorSnapshot,
      getControlState,
      getDbProtection,
      getLatencyP95,
      getLocalCircuitSnapshots,
      getRequestRate,
      recordRequestFinished,
      recordRequestStarted,
      startRuntimeLoops,
      withAiCircuit,
      withDbCircuit,
      withExportCircuit
    } = runtimeMonitorManager);
    DB_METHOD_WRAP_EXCLUDE = /* @__PURE__ */ new Set([
      "constructor"
    ]);
    wrapAsyncPrototypeMethods(storage, {
      exclude: DB_METHOD_WRAP_EXCLUDE,
      wrap: withDbCircuit
    });
    aiSearchService = new AiSearchService({
      storage,
      withAiCircuit,
      ollamaChat,
      ollamaEmbed,
      defaultAiTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
      lowMemoryMode: LOW_MEMORY_MODE
    });
    categoryStatsService = new CategoryStatsService(storage);
    aiChatService = new AiChatService({
      storage,
      categoryStatsService,
      withAiCircuit,
      ollamaChat
    });
    aiIndexService = new AiIndexService({
      storage,
      ollamaEmbed
    });
    attachGcObserver();
    adaptiveRateState = /* @__PURE__ */ new Map();
    attachProcessMessageHandlers({
      onGracefulShutdown: () => {
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 25e3).unref();
      }
    });
    startRuntimeLoops({
      clearSearchCache: () => aiSearchService.clearSearchCache()
    });
    app.use("/api/imports", express2.json({ limit: IMPORT_BODY_LIMIT }));
    app.use("/api/imports", express2.urlencoded({ extended: true, limit: IMPORT_BODY_LIMIT }));
    app.use("/api/collection", express2.json({ limit: COLLECTION_BODY_LIMIT }));
    app.use("/api/collection", express2.urlencoded({ extended: true, limit: COLLECTION_BODY_LIMIT }));
    app.use(express2.json({ limit: DEFAULT_BODY_LIMIT }));
    app.use(express2.urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT }));
    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    });
    app.use("/uploads/collection-receipts", (_req, res) => {
      return res.status(404).json({ ok: false, message: "Not found." });
    });
    app.use("/uploads", express2.static(UPLOADS_ROOT_DIR));
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      recordRequestStarted();
      res.on("finish", () => {
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
        recordRequestFinished(elapsedMs);
      });
      next();
    });
    app.use(adaptiveRateLimit);
    app.use(systemProtectionMiddleware);
    aiGateSeq = 0;
    aiGateInflightGlobal = 0;
    aiGateInflightByRole = {
      user: 0,
      admin: 0,
      superuser: 0
    };
    aiGateQueue = [];
    runtimeConfigManager = createRuntimeConfigManager({
      storage,
      secret: JWT_SECRET,
      defaults: {
        sessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES,
        wsIdleMinutes: DEFAULT_WS_IDLE_MINUTES,
        aiTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
        searchResultLimit: 200,
        viewerRowsPerPage: 100
      },
      maintenanceCacheTtlMs: MAINTENANCE_CACHE_TTL_MS,
      runtimeSettingsCacheTtlMs: RUNTIME_SETTINGS_CACHE_TTL_MS
    });
    ({
      invalidateMaintenanceCache,
      invalidateRuntimeSettingsCache,
      getRuntimeSettingsCached,
      getMaintenanceStateCached,
      maintenanceGuard
    } = runtimeConfigManager);
    app.use(maintenanceGuard);
    registerSystemRoutes(app, {
      authenticateToken: modularAuthenticateToken,
      requireRole: modularRequireRole,
      requireMonitorAccess: modularRequireMonitorAccess,
      getMaintenanceStateCached,
      computeInternalMonitorSnapshot,
      buildInternalMonitorAlerts,
      getControlState,
      getDbProtection,
      getRequestRate,
      getLatencyP95,
      getLocalCircuitSnapshots,
      getIntelligenceExplainability,
      injectChaos,
      createAuditLog: (data) => storage.createAuditLog(data)
    });
    registerAuthRoutes(app, {
      storage,
      authenticateToken: modularAuthenticateToken,
      requireRole: modularRequireRole,
      connectedClients
    });
    registerActivityRoutes(app, {
      storage,
      authenticateToken: modularAuthenticateToken,
      requireRole: modularRequireRole,
      requireTabAccess: modularRequireTabAccess,
      connectedClients
    });
    registerImportRoutes(app, {
      storage,
      importsRepository,
      importAnalysisService,
      authenticateToken: modularAuthenticateToken,
      requireRole: modularRequireRole,
      requireTabAccess: modularRequireTabAccess,
      searchRateLimiter,
      getRuntimeSettingsCached,
      isDbProtected: getDbProtection
    });
    registerSearchRoutes(app, {
      storage,
      searchRepository,
      authenticateToken: modularAuthenticateToken,
      searchRateLimiter,
      getRuntimeSettingsCached,
      isDbProtected: getDbProtection
    });
    registerAiRoutes(app, {
      storage,
      authenticateToken: modularAuthenticateToken,
      requireRole: modularRequireRole,
      withAiConcurrencyGate,
      getRuntimeSettingsCached,
      aiSearchService,
      categoryStatsService,
      aiChatService,
      aiIndexService,
      getOllamaConfig,
      defaultAiTimeoutMs: DEFAULT_AI_TIMEOUT_MS
    });
    registerSettingsRoutes(app, {
      storage,
      authenticateToken: modularAuthenticateToken,
      requireRole: modularRequireRole,
      clearTabVisibilityCache: clearModularTabVisibilityCache,
      invalidateRuntimeSettingsCache,
      invalidateMaintenanceCache,
      getMaintenanceStateCached,
      broadcastWsMessage,
      defaultAiTimeoutMs: DEFAULT_AI_TIMEOUT_MS
    });
    registerOperationsRoutes(app, {
      storage,
      auditRepository,
      backupsRepository,
      analyticsRepository,
      authenticateToken: modularAuthenticateToken,
      requireRole: modularRequireRole,
      requireTabAccess: modularRequireTabAccess,
      withExportCircuit,
      isExportCircuitOpenError: (error) => error instanceof CircuitOpenError,
      connectedClients
    });
    registerCollectionRoutes(app, {
      storage,
      authenticateToken: modularAuthenticateToken,
      requireRole: modularRequireRole,
      requireTabAccess: modularRequireTabAccess
    });
    setInterval(() => {
      const now = Date.now();
      for (const [ip, bucket] of adaptiveRateState.entries()) {
        if (now >= bucket.resetAt + 6e4) {
          adaptiveRateState.delete(ip);
        }
      }
      aiSearchService.sweepCaches(now);
    }, 3e4).unref();
    app.use(errorHandler);
    startServer();
  }
});

// server/cluster-local.ts
import cluster from "node:cluster";
import os2 from "node:os";
import path4 from "node:path";
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
var RESTART_FAILURE_WINDOW_MS = 6e4;
var RESTART_BLOCK_MS = 6e4;
var predictor = new LoadPredictor({
  shortWindowSec: 30,
  longWindowSec: 90,
  trendThreshold: 0.2,
  sustainedMs: 3e4
});
var workerMetrics = /* @__PURE__ */ new Map();
var workerFatalReasons = /* @__PURE__ */ new Map();
var wiredWorkers = /* @__PURE__ */ new Set();
var intentionalExits = /* @__PURE__ */ new Set();
var drainingWorkers = /* @__PURE__ */ new Set();
var restartAttempts = /* @__PURE__ */ new Map();
var lastSpawnAttemptTime = -Infinity;
var lastBroadcast = null;
var lowLoadSince = null;
var mode = "NORMAL";
var preAllocBuffer = null;
var rollingRestartInProgress = false;
var lastScaleTime = 0;
var unexpectedExitTimestamps = [];
var restartBlockedUntil = 0;
var lastRestartBlockLogAt = 0;
var fatalStartupLockReason = null;
var fatalShutdownScheduled = false;
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
function shutdownMasterDueToFatalStartup(reason) {
  if (fatalShutdownScheduled) return;
  fatalShutdownScheduled = true;
  console.error(`\u{1F6D1} Cluster master shutting down due to unrecoverable startup error: ${reason}`);
  setTimeout(() => process.exit(1), 50).unref();
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
  const cpuPercent = samples.reduce((s, x) => s + x.cpuPercent, 0) / samples.length;
  const reqRate = samples.reduce((s, x) => s + x.reqRate, 0);
  const p95 = samples.reduce((m, x) => Math.max(m, x.latencyP95Ms), 0);
  const eventLoopLagMs = samples.reduce((m, x) => Math.max(m, x.eventLoopLagMs), 0);
  const activeRequests = samples.reduce((s, x) => s + x.activeRequests, 0);
  const queueLength = samples.reduce((s, x) => s + x.queueLength, 0);
  const dbLatencyMs = samples.reduce((m, x) => Math.max(m, x.dbLatencyMs), 0);
  const aiLatencyMs = samples.reduce((m, x) => Math.max(m, x.aiLatencyMs), 0);
  const heapUsedMB = samples.reduce((s, x) => s + x.heapUsedMB, 0);
  const oldSpaceMB = samples.reduce((s, x) => s + x.oldSpaceMB, 0);
  return {
    cpuPercent: round(cpuPercent),
    reqRate: round(reqRate),
    p95: round(p95),
    eventLoopLagMs: round(eventLoopLagMs),
    activeRequests,
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
  if (fatalStartupLockReason) {
    console.error(`\u26D4 Spawn blocked due to fatal startup condition: ${fatalStartupLockReason}`);
    return null;
  }
  const now = Date.now();
  if (now < restartBlockedUntil) {
    if (now - lastRestartBlockLogAt > 5e3) {
      const remainingMs = Math.max(0, restartBlockedUntil - now);
      console.error(
        `\u26D4 Restart temporarily blocked (${Math.ceil(remainingMs / 1e3)}s left). Skipping spawn for: ${reason}`
      );
      lastRestartBlockLogAt = now;
    }
    return null;
  }
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
  if (wiredWorkers.has(worker.id)) return;
  wiredWorkers.add(worker.id);
  worker.on("message", (msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "worker-fatal") {
      const reason = String(msg.payload?.reason || "UNKNOWN_FATAL");
      workerFatalReasons.set(worker.id, reason);
      if (reason === "EADDRINUSE") {
        fatalStartupLockReason = reason;
        restartBlockedUntil = Date.now() + RESTART_BLOCK_MS;
        lastRestartBlockLogAt = Date.now();
        console.error(
          "\u{1F6D1} Worker reported fatal startup error: EADDRINUSE. Auto-restart is disabled until process restart to prevent respawn loop."
        );
      } else {
        console.error(`\u{1F6D1} Worker reported fatal startup error: ${reason}`);
      }
      return;
    }
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
  const __dirname = path4.dirname(__filename);
  const workerExec = path4.join(__dirname, "index-local.js");
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
    wiredWorkers.delete(worker.id);
    drainingWorkers.delete(worker.id);
    const fatalReason = workerFatalReasons.get(worker.id);
    workerFatalReasons.delete(worker.id);
    if (fatalReason === "EADDRINUSE") {
      fatalStartupLockReason = "EADDRINUSE";
      console.error(
        `\u{1F6D1} Worker#${worker.id} exited due to EADDRINUSE (port already in use). Skipping automatic restart to prevent infinite respawn.`
      );
      if (getWorkers().length === 0) {
        shutdownMasterDueToFatalStartup("EADDRINUSE");
      }
      return;
    }
    const intentional = intentionalExits.has(worker.id);
    if (intentional) {
      intentionalExits.delete(worker.id);
      restartAttempts.delete(worker.id);
    } else {
      const now = Date.now();
      const timeSinceLastSpawn = now - lastSpawnAttemptTime;
      unexpectedExitTimestamps = unexpectedExitTimestamps.filter(
        (ts) => now - ts <= RESTART_FAILURE_WINDOW_MS
      );
      unexpectedExitTimestamps.push(now);
      if (unexpectedExitTimestamps.length > MAX_RESTART_ATTEMPTS) {
        restartBlockedUntil = now + RESTART_BLOCK_MS;
        lastRestartBlockLogAt = now;
        console.error(
          `\u274C CRASH LOOP DETECTED: Worker#${worker.id} failed (code=${code}). Exceeded max restart attempts (${MAX_RESTART_ATTEMPTS}) within ${Math.round(RESTART_FAILURE_WINDOW_MS / 1e3)}s. Pausing restarts for ${Math.round(RESTART_BLOCK_MS / 1e3)}s. Check root cause (for example, EADDRINUSE).`
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
    if (fatalStartupLockReason) {
      return;
    }
    if (Date.now() < restartBlockedUntil) {
      return;
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
