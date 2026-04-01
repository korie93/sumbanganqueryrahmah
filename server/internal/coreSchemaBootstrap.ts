import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";
import {
  ensureCorePerformanceIndexes,
  ensureCorePerformanceTrigramIndexes,
  runCoreSchemaBootstrapTask,
} from "./core-schema-bootstrap-utils";

export class CoreSchemaBootstrap {
  private importsReady = false;
  private importsInitPromise: Promise<void> | null = null;
  private dataRowsReady = false;
  private dataRowsInitPromise: Promise<void> | null = null;
  private userActivityReady = false;
  private userActivityInitPromise: Promise<void> | null = null;
  private auditLogsReady = false;
  private auditLogsInitPromise: Promise<void> | null = null;
  private mutationIdempotencyReady = false;
  private mutationIdempotencyInitPromise: Promise<void> | null = null;
  private monitorAlertHistoryReady = false;
  private monitorAlertHistoryInitPromise: Promise<void> | null = null;
  private performanceIndexesReady = false;
  private performanceIndexesInitPromise: Promise<void> | null = null;
  private bannedSessionsReady = false;
  private bannedSessionsInitPromise: Promise<void> | null = null;

  async ensureImportsTable(): Promise<void> {
    await runCoreSchemaBootstrapTask({
      initPromise: this.importsInitPromise,
      isReady: this.importsReady,
      options: { errorMessage: "Failed to ensure imports table" },
      setInitPromise: (promise) => {
        this.importsInitPromise = promise;
      },
      setReady: () => {
        this.importsReady = true;
      },
      task: async () => {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.imports (
            id text PRIMARY KEY,
            name text NOT NULL,
            filename text NOT NULL,
            created_at timestamp DEFAULT now(),
            is_deleted boolean DEFAULT false,
            created_by text
          )
        `);
        await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS name text`);
        await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS filename text`);
        await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false`);
        await db.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_by text`);
        await db.execute(sql`
          UPDATE public.imports
          SET
            name = COALESCE(NULLIF(name, ''), NULLIF(filename, ''), 'Untitled Import'),
            filename = COALESCE(NULLIF(filename, ''), COALESCE(NULLIF(name, ''), 'unknown.csv')),
            created_at = COALESCE(created_at, now()),
            is_deleted = COALESCE(is_deleted, false)
        `);
        await db.execute(sql`ALTER TABLE public.imports ALTER COLUMN name SET NOT NULL`);
        await db.execute(sql`ALTER TABLE public.imports ALTER COLUMN filename SET NOT NULL`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_created_at ON public.imports(created_at DESC)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON public.imports(is_deleted)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_created_by ON public.imports(created_by)`);
      },
    });
  }

  async ensureDataRowsTable(): Promise<void> {
    if (this.dataRowsReady) return;
    if (this.dataRowsInitPromise) {
      await this.dataRowsInitPromise;
      return;
    }

    this.dataRowsInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.data_rows (
            id text PRIMARY KEY,
            import_id text NOT NULL,
            json_data jsonb NOT NULL DEFAULT '{}'::jsonb
          )
        `);
        await db.execute(sql`ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS import_id text`);
        await db.execute(sql`ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS json_data jsonb DEFAULT '{}'::jsonb`);
        await db.execute(sql`
          UPDATE public.data_rows
          SET json_data = COALESCE(json_data, '{}'::jsonb)
        `);
        await db.execute(sql`
          DELETE FROM public.data_rows row_data
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.imports imp
            WHERE imp.id = row_data.import_id
          )
        `);
        await db.execute(sql`ALTER TABLE public.data_rows ALTER COLUMN import_id SET NOT NULL`);
        await db.execute(sql`ALTER TABLE public.data_rows ALTER COLUMN json_data SET NOT NULL`);
        await db.execute(sql`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname = 'fk_data_rows_import_id'
            ) THEN
              ALTER TABLE public.data_rows
              ADD CONSTRAINT fk_data_rows_import_id
              FOREIGN KEY (import_id)
              REFERENCES public.imports(id)
              ON UPDATE CASCADE
              ON DELETE CASCADE;
            END IF;
          END $$;
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON public.data_rows(import_id)`);
        this.dataRowsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure data rows table", { error: err });
        throw err;
      }
    })();

    try {
      await this.dataRowsInitPromise;
    } finally {
      this.dataRowsInitPromise = null;
    }
  }

  async ensureUserActivityTable(): Promise<void> {
    if (this.userActivityReady) return;
    if (this.userActivityInitPromise) {
      await this.userActivityInitPromise;
      return;
    }

    this.userActivityInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
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
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS user_id text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS username text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS role text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS pc_name text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS browser text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS fingerprint text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS ip_address text`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS login_time timestamp`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_time timestamp`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS last_activity_time timestamp`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
        await db.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_reason text`);
        await db.execute(sql`
          UPDATE public.user_activity
          SET
            is_active = COALESCE(is_active, true),
            login_time = COALESCE(login_time, now()),
            last_activity_time = COALESCE(last_activity_time, login_time, now())
        `);
        await db.execute(sql`
          DELETE FROM public.user_activity activity
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.users usr
            WHERE usr.id = activity.user_id
          )
        `);
        await db.execute(sql`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname = 'fk_user_activity_user_id'
            ) THEN
              ALTER TABLE public.user_activity
              ADD CONSTRAINT fk_user_activity_user_id
              FOREIGN KEY (user_id)
              REFERENCES public.users(id)
              ON UPDATE CASCADE
              ON DELETE CASCADE;
            END IF;
          END $$;
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON public.user_activity(user_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_username ON public.user_activity(username)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_is_active ON public.user_activity(is_active)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON public.user_activity(login_time DESC)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_last_activity_time ON public.user_activity(last_activity_time DESC)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_fingerprint ON public.user_activity(fingerprint)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_ip_address ON public.user_activity(ip_address)`);
        this.userActivityReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure user activity table", { error: err });
        throw err;
      }
    })();

    try {
      await this.userActivityInitPromise;
    } finally {
      this.userActivityInitPromise = null;
    }
  }

  async ensureAuditLogsTable(): Promise<void> {
    if (this.auditLogsReady) return;
    if (this.auditLogsInitPromise) {
      await this.auditLogsInitPromise;
      return;
    }

    this.auditLogsInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.audit_logs (
            id text PRIMARY KEY,
            action text NOT NULL,
            performed_by text NOT NULL,
            request_id text,
            target_user text,
            target_resource text,
            details text,
            timestamp timestamp DEFAULT now()
          )
        `);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS performed_by text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS request_id text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_user text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_resource text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details text`);
        await db.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS timestamp timestamp DEFAULT now()`);
        await db.execute(sql`
          UPDATE public.audit_logs
          SET timestamp = COALESCE(timestamp, now())
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON public.audit_logs(request_id)`);
        this.auditLogsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure audit logs table", { error: err });
        throw err;
      }
    })();

    try {
      await this.auditLogsInitPromise;
    } finally {
      this.auditLogsInitPromise = null;
    }
  }

  async ensureMutationIdempotencyTable(): Promise<void> {
    if (this.mutationIdempotencyReady) return;
    if (this.mutationIdempotencyInitPromise) {
      await this.mutationIdempotencyInitPromise;
      return;
    }

    this.mutationIdempotencyInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.mutation_idempotency_keys (
            id uuid PRIMARY KEY,
            scope text NOT NULL,
            actor text NOT NULL,
            idempotency_key text NOT NULL,
            request_fingerprint text,
            state text NOT NULL DEFAULT 'pending',
            response_status integer,
            response_body jsonb,
            created_at timestamp DEFAULT now() NOT NULL,
            updated_at timestamp DEFAULT now() NOT NULL,
            completed_at timestamp
          )
        `);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS scope text`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS actor text`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS idempotency_key text`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS request_fingerprint text`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS state text DEFAULT 'pending'`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS response_status integer`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS response_body jsonb`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS completed_at timestamp`);
        await db.execute(sql`
          UPDATE public.mutation_idempotency_keys
          SET
            state = COALESCE(NULLIF(state, ''), 'pending'),
            created_at = COALESCE(created_at, now()),
            updated_at = COALESCE(updated_at, created_at, now())
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_mutation_idempotency_scope_actor_key_unique
          ON public.mutation_idempotency_keys(scope, actor, idempotency_key)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_mutation_idempotency_updated_at
          ON public.mutation_idempotency_keys(updated_at DESC)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_mutation_idempotency_state
          ON public.mutation_idempotency_keys(state)
        `);
        await db.execute(sql`
          DELETE FROM public.mutation_idempotency_keys
          WHERE (state = 'pending' AND updated_at < now() - interval '15 minutes')
             OR (state = 'completed' AND updated_at < now() - interval '1 day')
        `);
        this.mutationIdempotencyReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure mutation idempotency table", { error: err });
        throw err;
      }
    })();

    try {
      await this.mutationIdempotencyInitPromise;
    } finally {
      this.mutationIdempotencyInitPromise = null;
    }
  }

  async ensureMonitorAlertHistoryTable(): Promise<void> {
    if (this.monitorAlertHistoryReady) return;
    if (this.monitorAlertHistoryInitPromise) {
      await this.monitorAlertHistoryInitPromise;
      return;
    }

    this.monitorAlertHistoryInitPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.monitor_alert_incidents (
            id uuid PRIMARY KEY,
            alert_key text NOT NULL,
            severity text NOT NULL,
            source text,
            message text NOT NULL,
            status text NOT NULL DEFAULT 'open',
            first_seen_at timestamp NOT NULL DEFAULT now(),
            last_seen_at timestamp NOT NULL DEFAULT now(),
            resolved_at timestamp,
            updated_at timestamp NOT NULL DEFAULT now()
          )
        `);
        await db.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS alert_key text`);
        await db.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS severity text`);
        await db.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS source text`);
        await db.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS message text`);
        await db.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS status text DEFAULT 'open'`);
        await db.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS first_seen_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS last_seen_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS resolved_at timestamp`);
        await db.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
        await db.execute(sql`
          UPDATE public.monitor_alert_incidents
          SET
            severity = COALESCE(NULLIF(severity, ''), 'INFO'),
            message = COALESCE(NULLIF(message, ''), 'Monitor alert'),
            status = COALESCE(NULLIF(status, ''), 'open'),
            first_seen_at = COALESCE(first_seen_at, now()),
            last_seen_at = COALESCE(last_seen_at, first_seen_at, now()),
            updated_at = COALESCE(updated_at, last_seen_at, first_seen_at, now())
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_alert_incidents_open_key_unique
          ON public.monitor_alert_incidents(alert_key)
          WHERE status = 'open'
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_monitor_alert_incidents_status_updated_at
          ON public.monitor_alert_incidents(status, updated_at DESC)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_monitor_alert_incidents_resolved_at
          ON public.monitor_alert_incidents(resolved_at DESC)
        `);
        this.monitorAlertHistoryReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure monitor alert incidents table", { error: err });
        throw err;
      }
    })();

    try {
      await this.monitorAlertHistoryInitPromise;
    } finally {
      this.monitorAlertHistoryInitPromise = null;
    }
  }

  async ensurePerformanceIndexes(): Promise<void> {
    await runCoreSchemaBootstrapTask({
      initPromise: this.performanceIndexesInitPromise,
      isReady: this.performanceIndexesReady,
      options: { errorMessage: "Failed to ensure performance indexes" },
      setInitPromise: (promise) => {
        this.performanceIndexesInitPromise = promise;
      },
      setReady: () => {
        this.performanceIndexesReady = true;
      },
      task: async () => {
        await ensureCorePerformanceIndexes();
        try {
          await ensureCorePerformanceTrigramIndexes();
        } catch (err: any) {
          logger.warn("pg_trgm is not available; skipping trigram index creation", { error: err });
        }
      },
    });
  }

  async ensureBannedSessionsTable(): Promise<void> {
    if (this.bannedSessionsReady) return;
    if (this.bannedSessionsInitPromise) {
      await this.bannedSessionsInitPromise;
      return;
    }

    this.bannedSessionsInitPromise = (async () => {
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
        this.bannedSessionsReady = true;
      } catch (err: any) {
        logger.error("Failed to ensure banned sessions table", { error: err });
      }
    })();

    try {
      await this.bannedSessionsInitPromise;
    } finally {
      this.bannedSessionsInitPromise = null;
    }
  }
}
