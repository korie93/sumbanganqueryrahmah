import { sql } from "drizzle-orm";
import type { CoreSchemaSqlExecutor } from "./core-schema-bootstrap-utils";

export async function ensureCoreMutationIdempotencyTable(
  database: CoreSchemaSqlExecutor,
): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.mutation_idempotency_keys (
      id uuid PRIMARY KEY,
      scope text NOT NULL,
      actor text NOT NULL,
      idempotency_key text NOT NULL,
      request_fingerprint text,
      state text NOT NULL DEFAULT 'pending',
      response_status integer,
      response_body jsonb,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      completed_at timestamp with time zone
    )
  `);
  await database.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS scope text`);
  await database.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS actor text`);
  await database.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS idempotency_key text`);
  await database.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS request_fingerprint text`);
  await database.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS state text DEFAULT 'pending'`);
  await database.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS response_status integer`);
  await database.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS response_body jsonb`);
  await database.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone`);
  await database.execute(sql`
    UPDATE public.mutation_idempotency_keys
    SET
      state = COALESCE(NULLIF(state, ''), 'pending'),
      created_at = COALESCE(created_at, now()),
      updated_at = COALESCE(updated_at, created_at, now())
  `);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mutation_idempotency_scope_actor_key_unique
    ON public.mutation_idempotency_keys(scope, actor, idempotency_key)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_mutation_idempotency_updated_at
    ON public.mutation_idempotency_keys(updated_at DESC)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_mutation_idempotency_state
    ON public.mutation_idempotency_keys(state)
  `);
  await database.execute(sql`
    DELETE FROM public.mutation_idempotency_keys
    WHERE (state = 'pending' AND updated_at < now() - interval '15 minutes')
       OR (state = 'completed' AND updated_at < now() - interval '1 day')
  `);
}

export async function ensureCoreMonitorAlertHistoryTable(
  database: CoreSchemaSqlExecutor,
): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.monitor_alert_incidents (
      id uuid PRIMARY KEY,
      alert_key text NOT NULL,
      severity text NOT NULL,
      source text,
      message text NOT NULL,
      status text NOT NULL DEFAULT 'open',
      first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
      last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
      resolved_at timestamp with time zone,
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS alert_key text`);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS severity text`);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS source text`);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS message text`);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS status text DEFAULT 'open'`);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS first_seen_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.monitor_alert_incidents
    SET
      severity = CASE
        WHEN upper(trim(COALESCE(severity, ''))) IN ('CRITICAL', 'WARNING', 'INFO')
          THEN upper(trim(COALESCE(severity, '')))
        ELSE 'INFO'
      END,
      message = COALESCE(NULLIF(message, ''), 'Monitor alert'),
      status = CASE
        WHEN lower(trim(COALESCE(status, ''))) IN ('open', 'resolved')
          THEN lower(trim(COALESCE(status, '')))
        ELSE 'open'
      END,
      first_seen_at = COALESCE(first_seen_at, now()),
      last_seen_at = COALESCE(last_seen_at, first_seen_at, now()),
      updated_at = COALESCE(updated_at, last_seen_at, first_seen_at, now())
  `);
  await database.execute(sql`
    DO $$
    BEGIN
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
    END $$;
  `);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ALTER COLUMN severity SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.monitor_alert_incidents ALTER COLUMN status SET NOT NULL`);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_alert_incidents_open_key_unique
    ON public.monitor_alert_incidents(alert_key)
    WHERE status = 'open'
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_monitor_alert_incidents_status_updated_at
    ON public.monitor_alert_incidents(status, updated_at DESC)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_monitor_alert_incidents_resolved_at
    ON public.monitor_alert_incidents(resolved_at DESC)
  `);
}
