DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE public.users
    SET
      role = CASE
        WHEN lower(trim(COALESCE(role, ''))) IN ('user', 'admin', 'superuser')
          THEN lower(trim(COALESCE(role, '')))
        ELSE 'user'
      END,
      status = CASE
        WHEN lower(trim(COALESCE(status, ''))) IN ('pending_activation', 'active', 'suspended', 'disabled')
          THEN lower(trim(COALESCE(status, '')))
        WHEN password_hash ~ '^\\$2[aby]\\$'
          THEN 'active'
        ELSE 'pending_activation'
      END;

    ALTER TABLE public.users
    ALTER COLUMN role SET NOT NULL;

    ALTER TABLE public.users
    ALTER COLUMN status SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_users_role'
    ) THEN
      ALTER TABLE public.users
      ADD CONSTRAINT chk_users_role
      CHECK (role IN ('user', 'admin', 'superuser'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_users_status'
    ) THEN
      ALTER TABLE public.users
      ADD CONSTRAINT chk_users_status
      CHECK (status IN ('pending_activation', 'active', 'suspended', 'disabled'));
    END IF;

    CREATE INDEX IF NOT EXISTS idx_users_created_by
    ON public.users(created_by);
  END IF;
END
$$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.user_activity') IS NOT NULL THEN
    UPDATE public.user_activity
    SET role = CASE
      WHEN lower(trim(COALESCE(role, ''))) IN ('user', 'admin', 'superuser')
        THEN lower(trim(COALESCE(role, '')))
      ELSE 'user'
    END;

    ALTER TABLE public.user_activity
    ALTER COLUMN role SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_user_activity_role'
    ) THEN
      ALTER TABLE public.user_activity
      ADD CONSTRAINT chk_user_activity_role
      CHECK (role IN ('user', 'admin', 'superuser'));
    END IF;
  END IF;
END
$$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.banned_sessions') IS NOT NULL THEN
    UPDATE public.banned_sessions
    SET role = CASE
      WHEN lower(trim(COALESCE(role, ''))) IN ('user', 'admin', 'superuser')
        THEN lower(trim(COALESCE(role, '')))
      ELSE 'user'
    END;

    ALTER TABLE public.banned_sessions
    ALTER COLUMN role SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_banned_sessions_role'
    ) THEN
      ALTER TABLE public.banned_sessions
      ADD CONSTRAINT chk_banned_sessions_role
      CHECK (role IN ('user', 'admin', 'superuser'));
    END IF;
  END IF;
END
$$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.backup_jobs') IS NOT NULL THEN
    UPDATE public.backup_jobs
    SET status = CASE
      WHEN lower(trim(COALESCE(status, ''))) IN ('queued', 'running', 'completed', 'failed')
        THEN lower(trim(COALESCE(status, '')))
      ELSE 'queued'
    END;

    ALTER TABLE public.backup_jobs
    ALTER COLUMN status SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_backup_jobs_status'
    ) THEN
      ALTER TABLE public.backup_jobs
      ADD CONSTRAINT chk_backup_jobs_status
      CHECK (status IN ('queued', 'running', 'completed', 'failed'));
    END IF;

    CREATE INDEX IF NOT EXISTS idx_backup_jobs_requested_by
    ON public.backup_jobs(requested_by);
  END IF;
END
$$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.monitor_alert_incidents') IS NOT NULL THEN
    UPDATE public.monitor_alert_incidents
    SET
      severity = CASE
        WHEN upper(trim(COALESCE(severity, ''))) IN ('CRITICAL', 'WARNING', 'INFO')
          THEN upper(trim(COALESCE(severity, '')))
        ELSE 'INFO'
      END,
      status = CASE
        WHEN lower(trim(COALESCE(status, ''))) IN ('open', 'resolved')
          THEN lower(trim(COALESCE(status, '')))
        ELSE 'open'
      END;

    ALTER TABLE public.monitor_alert_incidents
    ALTER COLUMN severity SET NOT NULL;

    ALTER TABLE public.monitor_alert_incidents
    ALTER COLUMN status SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_monitor_alert_incidents_severity'
    ) THEN
      ALTER TABLE public.monitor_alert_incidents
      ADD CONSTRAINT chk_monitor_alert_incidents_severity
      CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_monitor_alert_incidents_status'
    ) THEN
      ALTER TABLE public.monitor_alert_incidents
      ADD CONSTRAINT chk_monitor_alert_incidents_status
      CHECK (status IN ('open', 'resolved'));
    END IF;
  END IF;
END
$$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.backups') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_backups_created_by
    ON public.backups(created_by);
  END IF;
END
$$;
