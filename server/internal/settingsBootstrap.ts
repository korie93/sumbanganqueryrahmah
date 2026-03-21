import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";
import {
  type RoleTabSetting,
  type SettingInputType,
  ROLE_TAB_SETTINGS,
  roleTabSettingKey,
} from "../config/system-settings";

type SettingsSeedItem = {
  categoryName: string;
  key: string;
  label: string;
  description: string;
  type: SettingInputType;
  value: string;
  defaultValue: string;
  isCritical: boolean;
};

export class SettingsBootstrap {
  private ready = false;
  private initPromise: Promise<void> | null = null;

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
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

        // Cleanup legacy duplicate options, then enforce uniqueness per setting/value.
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
        } catch (dupCleanupErr: any) {
          logger.warn("setting_options duplicate cleanup skipped", { error: dupCleanupErr });
        }

        try {
          await db.execute(sql`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_options_unique_value
            ON public.setting_options (setting_id, value)
          `);
        } catch (idxErr: any) {
          logger.warn("setting_options unique index was not created", { error: idxErr });
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
          { name: "System Monitoring", description: "WebSocket and runtime diagnostics settings." },
        ];

        for (const category of categories) {
          await db.execute(sql`
            INSERT INTO public.setting_categories (name, description)
            VALUES (${category.name}, ${category.description})
            ON CONFLICT (name) DO UPDATE SET
              description = EXCLUDED.description
          `);
        }

        const settingsSeed: SettingsSeedItem[] = [
          {
            categoryName: "General",
            key: "system_name",
            label: "System Name",
            description: "Display name shown in application header.",
            type: "text",
            value: "SQR System",
            defaultValue: "SQR System",
            isCritical: false,
          },
          {
            categoryName: "General",
            key: "session_timeout_minutes",
            label: "Session Timeout (Minutes)",
            description: "Default idle timeout duration for authenticated sessions.",
            type: "number",
            value: "30",
            defaultValue: "30",
            isCritical: true,
          },
          {
            categoryName: "Security",
            key: "jwt_expiry_hours",
            label: "JWT Expiry (Hours)",
            description: "Token validity period used during login.",
            type: "number",
            value: "24",
            defaultValue: "24",
            isCritical: true,
          },
          {
            categoryName: "Security",
            key: "enforce_superuser_single_session",
            label: "Enforce Single Superuser Session",
            description: "Force single active session for superuser accounts.",
            type: "boolean",
            value: "true",
            defaultValue: "true",
            isCritical: false,
          },
          {
            categoryName: "AI & Search",
            key: "ai_enabled",
            label: "Enable AI Assistant",
            description: "Controls AI endpoints and chat behavior.",
            type: "boolean",
            value: "true",
            defaultValue: "true",
            isCritical: false,
          },
          {
            categoryName: "AI & Search",
            key: "semantic_search_enabled",
            label: "Enable Semantic Search",
            description: "Allow pgvector semantic retrieval for AI workflows.",
            type: "boolean",
            value: "true",
            defaultValue: "true",
            isCritical: false,
          },
          {
            categoryName: "AI & Search",
            key: "ai_timeout_ms",
            label: "AI Timeout (ms)",
            description: "Server timeout for AI requests before fallback response.",
            type: "number",
            value: "6000",
            defaultValue: "6000",
            isCritical: false,
          },
          {
            categoryName: "Data Management",
            key: "search_result_limit",
            label: "Search Result Limit",
            description: "Maximum records returned in search APIs.",
            type: "number",
            value: "200",
            defaultValue: "200",
            isCritical: false,
          },
          {
            categoryName: "Data Management",
            key: "viewer_rows_per_page",
            label: "Viewer Rows Per Page",
            description: "Default row count per viewer page.",
            type: "number",
            value: "100",
            defaultValue: "100",
            isCritical: false,
          },
          {
            categoryName: "Backup & Restore",
            key: "backup_retention_days",
            label: "Backup Retention (Days)",
            description: "Retention target for automated backup lifecycle policies.",
            type: "number",
            value: "30",
            defaultValue: "30",
            isCritical: false,
          },
          {
            categoryName: "Backup & Restore",
            key: "backup_auto_cleanup_enabled",
            label: "Enable Backup Auto Cleanup",
            description: "Automatically remove backups older than retention policy.",
            type: "boolean",
            value: "false",
            defaultValue: "false",
            isCritical: false,
          },
          {
            categoryName: "Roles & Permissions",
            key: "admin_can_edit_maintenance_message",
            label: "Admin Can Edit Maintenance Message",
            description: "Allow admin role to edit maintenance message and window only.",
            type: "boolean",
            value: "true",
            defaultValue: "true",
            isCritical: false,
          },
          {
            categoryName: "Roles & Permissions",
            key: "canViewSystemPerformance",
            label: "View System Performance",
            description: "Allow admin role to view System Performance in System Monitor.",
            type: "boolean",
            value: "false",
            defaultValue: "false",
            isCritical: false,
          },
          {
            categoryName: "System Monitoring",
            key: "ws_idle_minutes",
            label: "WebSocket Idle Timeout (Minutes)",
            description: "Idle timeout before websocket session termination.",
            type: "number",
            value: "3",
            defaultValue: "3",
            isCritical: false,
          },
          {
            categoryName: "System Monitoring",
            key: "debug_logs_enabled",
            label: "Enable Debug Logs",
            description: "Enable verbose API debug logging.",
            type: "boolean",
            value: "false",
            defaultValue: "false",
            isCritical: false,
          },
          {
            categoryName: "System Monitoring",
            key: "maintenance_mode",
            label: "Maintenance Mode",
            description: "Master switch for maintenance mode activation.",
            type: "boolean",
            value: "false",
            defaultValue: "false",
            isCritical: true,
          },
          {
            categoryName: "System Monitoring",
            key: "maintenance_message",
            label: "Maintenance Message",
            description: "Message shown to end users while maintenance is active.",
            type: "text",
            value: "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.",
            defaultValue: "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.",
            isCritical: false,
          },
          {
            categoryName: "System Monitoring",
            key: "maintenance_type",
            label: "Maintenance Type",
            description: "Soft mode limits selected modules. Hard mode blocks all protected routes.",
            type: "select",
            value: "soft",
            defaultValue: "soft",
            isCritical: true,
          },
          {
            categoryName: "System Monitoring",
            key: "maintenance_start_time",
            label: "Maintenance Start Time",
            description: "Optional ISO timestamp to schedule maintenance start.",
            type: "timestamp",
            value: "",
            defaultValue: "",
            isCritical: false,
          },
          {
            categoryName: "System Monitoring",
            key: "maintenance_end_time",
            label: "Maintenance End Time",
            description: "Optional ISO timestamp to auto-end maintenance.",
            type: "timestamp",
            value: "",
            defaultValue: "",
            isCritical: false,
          },
        ];

        for (const [role, tabSettings] of Object.entries(ROLE_TAB_SETTINGS) as Array<["admin" | "user", RoleTabSetting[]]>) {
          for (const tabSetting of tabSettings) {
            settingsSeed.push({
              categoryName: "Roles & Permissions",
              key: roleTabSettingKey(role, tabSetting.suffix),
              label: tabSetting.label,
              description: tabSetting.description,
              type: "boolean",
              value: tabSetting.defaultEnabled ? "true" : "false",
              defaultValue: tabSetting.defaultEnabled ? "true" : "false",
              isCritical: false,
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
        const maintenanceTypeId = String((maintenanceTypeRes.rows as any[])[0]?.id || "").trim();
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

        const adminEditable = new Set([
          "system_name",
          "ai_enabled",
          "semantic_search_enabled",
          "ai_timeout_ms",
          "search_result_limit",
          "viewer_rows_per_page",
          "maintenance_message",
          "maintenance_start_time",
          "maintenance_end_time",
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

        this.ready = true;
      } catch (err: any) {
        logger.error("Failed to ensure enterprise settings tables", { error: err });
      }
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }
}
