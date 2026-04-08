import { sql } from "drizzle-orm";
import type { CoreSchemaSqlExecutor } from "./core-schema-bootstrap-utils";

export async function ensureCoreUserActivityTable(
  database: CoreSchemaSqlExecutor,
): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.user_activity (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      username text NOT NULL,
      role text NOT NULL,
      pc_name text,
      browser text,
      fingerprint text,
      ip_address text,
      login_time timestamp with time zone,
      logout_time timestamp with time zone,
      last_activity_time timestamp with time zone,
      is_active boolean DEFAULT true,
      logout_reason text
    )
  `);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS user_id text`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS username text`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS role text`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS pc_name text`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS browser text`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS fingerprint text`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS ip_address text`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS login_time timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_time timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS last_activity_time timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
  await database.execute(sql`ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_reason text`);
  await database.execute(sql`
    UPDATE public.user_activity
    SET
      is_active = COALESCE(is_active, true),
      login_time = COALESCE(login_time, now()),
      last_activity_time = COALESCE(last_activity_time, login_time, now())
  `);
  await database.execute(sql`
    DELETE FROM public.user_activity activity
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users usr
      WHERE usr.id = activity.user_id
    )
  `);
  await database.execute(sql`
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
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON public.user_activity(user_id)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_username ON public.user_activity(username)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_is_active ON public.user_activity(is_active)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_login_time ON public.user_activity(login_time DESC)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_last_activity_time ON public.user_activity(last_activity_time DESC)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_fingerprint ON public.user_activity(fingerprint)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_activity_ip_address ON public.user_activity(ip_address)`);
}

export async function ensureCoreAuditLogsTable(
  database: CoreSchemaSqlExecutor,
): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.audit_logs (
      id text PRIMARY KEY,
      action text NOT NULL,
      performed_by text NOT NULL,
      request_id text,
      target_user text,
      target_resource text,
      details text,
      timestamp timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await database.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text`);
  await database.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS performed_by text`);
  await database.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS request_id text`);
  await database.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_user text`);
  await database.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_resource text`);
  await database.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details text`);
  await database.execute(sql`ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS timestamp timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.audit_logs
    SET timestamp = COALESCE(timestamp, now())
  `);
  await database.execute(sql`ALTER TABLE public.audit_logs ALTER COLUMN timestamp SET NOT NULL`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON public.audit_logs(request_id)`);
}

export async function ensureCoreBannedSessionsTable(
  database: CoreSchemaSqlExecutor,
): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.banned_sessions (
      id text PRIMARY KEY,
      username text NOT NULL,
      role text NOT NULL,
      activity_id text NOT NULL,
      fingerprint text,
      ip_address text,
      browser text,
      pc_name text,
      banned_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await database.execute(sql`ALTER TABLE public.banned_sessions ADD COLUMN IF NOT EXISTS banned_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.banned_sessions
    SET banned_at = COALESCE(banned_at, now())
  `);
  await database.execute(sql`ALTER TABLE public.banned_sessions ALTER COLUMN banned_at SET NOT NULL`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_banned_sessions_fingerprint ON public.banned_sessions(fingerprint)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_banned_sessions_ip ON public.banned_sessions(ip_address)`);
}
