import { sql } from "drizzle-orm";
import {
  executeBootstrapStatements,
  type BootstrapSqlExecutor,
} from "./collection-bootstrap-records-shared";

export async function ensureCollectionRollupSchema(database: BootstrapSqlExecutor): Promise<void> {
  await ensureCollectionDailyRollupSchema(database);
  await ensureCollectionMonthlyRollupSchema(database);
  await ensureCollectionRollupRefreshQueueSchema(database);
}

async function ensureCollectionDailyRollupSchema(database: BootstrapSqlExecutor): Promise<void> {
  await executeBootstrapStatements(database, [
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_record_daily_rollups (
        payment_date date NOT NULL,
        created_by_login text NOT NULL,
        collection_staff_nickname text NOT NULL,
        total_records integer NOT NULL DEFAULT 0,
        total_amount numeric(14,2) NOT NULL,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `,
    sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS payment_date date`,
    sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS created_by_login text`,
    sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS collection_staff_nickname text`,
    sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS total_records integer DEFAULT 0`,
    sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS total_amount numeric(14,2)`,
    sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`,
    sql`
      UPDATE public.collection_record_daily_rollups
      SET
        total_records = COALESCE(total_records, 0),
        total_amount = COALESCE(total_amount, 0),
        updated_at = COALESCE(updated_at, now())
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_slice_unique
      ON public.collection_record_daily_rollups(payment_date, created_by_login, collection_staff_nickname)
    `,
    sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'idx_collection_record_daily_rollups_slice_unique'
        ) THEN
          ALTER TABLE public.collection_record_daily_rollups
          ADD CONSTRAINT idx_collection_record_daily_rollups_slice_unique
          PRIMARY KEY USING INDEX idx_collection_record_daily_rollups_slice_unique;
        END IF;
      END $$;
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_payment_date
      ON public.collection_record_daily_rollups(payment_date)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_created_by_payment_date
      ON public.collection_record_daily_rollups(created_by_login, payment_date)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_lower_nickname_payment_date
      ON public.collection_record_daily_rollups((lower(collection_staff_nickname)), payment_date)
    `,
    sql`
      DELETE FROM public.collection_record_daily_rollups rollup
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.collection_records record
        WHERE record.payment_date = rollup.payment_date
          AND record.created_by_login = rollup.created_by_login
          AND record.collection_staff_nickname = rollup.collection_staff_nickname
      )
    `,
    sql`
      INSERT INTO public.collection_record_daily_rollups (
        payment_date,
        created_by_login,
        collection_staff_nickname,
        total_records,
        total_amount,
        updated_at
      )
      SELECT
        payment_date,
        created_by_login,
        collection_staff_nickname,
        COUNT(*)::int,
        COALESCE(SUM(amount), 0)::numeric(14,2),
        now()
      FROM public.collection_records
      GROUP BY payment_date, created_by_login, collection_staff_nickname
      ON CONFLICT (payment_date, created_by_login, collection_staff_nickname)
      DO UPDATE SET
        total_records = EXCLUDED.total_records,
        total_amount = EXCLUDED.total_amount,
        updated_at = now()
    `,
  ]);
}

async function ensureCollectionMonthlyRollupSchema(database: BootstrapSqlExecutor): Promise<void> {
  await executeBootstrapStatements(database, [
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_record_monthly_rollups (
        year integer NOT NULL,
        month integer NOT NULL,
        created_by_login text NOT NULL,
        collection_staff_nickname text NOT NULL,
        total_records integer NOT NULL DEFAULT 0,
        total_amount numeric(14,2) NOT NULL,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `,
    sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS year integer`,
    sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS month integer`,
    sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS created_by_login text`,
    sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS collection_staff_nickname text`,
    sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS total_records integer DEFAULT 0`,
    sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS total_amount numeric(14,2)`,
    sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`,
    sql`
      UPDATE public.collection_record_monthly_rollups
      SET
        total_records = COALESCE(total_records, 0),
        total_amount = COALESCE(total_amount, 0),
        updated_at = COALESCE(updated_at, now())
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_slice_unique
      ON public.collection_record_monthly_rollups(year, month, created_by_login, collection_staff_nickname)
    `,
    sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'idx_collection_record_monthly_rollups_slice_unique'
        ) THEN
          ALTER TABLE public.collection_record_monthly_rollups
          ADD CONSTRAINT idx_collection_record_monthly_rollups_slice_unique
          PRIMARY KEY USING INDEX idx_collection_record_monthly_rollups_slice_unique;
        END IF;
      END $$;
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_year_month
      ON public.collection_record_monthly_rollups(year, month)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_created_by_year_month
      ON public.collection_record_monthly_rollups(created_by_login, year, month)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_lower_nickname_year_month
      ON public.collection_record_monthly_rollups((lower(collection_staff_nickname)), year, month)
    `,
    sql`
      DELETE FROM public.collection_record_monthly_rollups rollup
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.collection_record_daily_rollups daily
        WHERE daily.created_by_login = rollup.created_by_login
          AND daily.collection_staff_nickname = rollup.collection_staff_nickname
          AND EXTRACT(YEAR FROM daily.payment_date)::int = rollup.year
          AND EXTRACT(MONTH FROM daily.payment_date)::int = rollup.month
      )
    `,
    sql`
      INSERT INTO public.collection_record_monthly_rollups (
        year,
        month,
        created_by_login,
        collection_staff_nickname,
        total_records,
        total_amount,
        updated_at
      )
      SELECT
        EXTRACT(YEAR FROM payment_date)::int AS year,
        EXTRACT(MONTH FROM payment_date)::int AS month,
        created_by_login,
        collection_staff_nickname,
        COALESCE(SUM(total_records), 0)::int,
        COALESCE(SUM(total_amount), 0)::numeric(14,2),
        now()
      FROM public.collection_record_daily_rollups
      GROUP BY 1, 2, 3, 4
      ON CONFLICT (year, month, created_by_login, collection_staff_nickname)
      DO UPDATE SET
        total_records = EXCLUDED.total_records,
        total_amount = EXCLUDED.total_amount,
        updated_at = now()
    `,
  ]);
}

async function ensureCollectionRollupRefreshQueueSchema(database: BootstrapSqlExecutor): Promise<void> {
  await executeBootstrapStatements(database, [
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_record_daily_rollup_refresh_queue (
        payment_date date NOT NULL,
        created_by_login text NOT NULL,
        collection_staff_nickname text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        requested_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        next_attempt_at timestamp NOT NULL DEFAULT now(),
        attempt_count integer NOT NULL DEFAULT 0,
        last_error text
      )
    `,
    sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS payment_date date`,
    sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS created_by_login text`,
    sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS collection_staff_nickname text`,
    sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued'`,
    sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS requested_at timestamp DEFAULT now()`,
    sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`,
    sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS next_attempt_at timestamp DEFAULT now()`,
    sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0`,
    sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS last_error text`,
    sql`
      UPDATE public.collection_record_daily_rollup_refresh_queue
      SET
        status = COALESCE(NULLIF(status, ''), 'queued'),
        requested_at = COALESCE(requested_at, now()),
        updated_at = COALESCE(updated_at, requested_at, now()),
        next_attempt_at = COALESCE(next_attempt_at, updated_at, requested_at, now()),
        attempt_count = COALESCE(attempt_count, 0)
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_slice_unique
      ON public.collection_record_daily_rollup_refresh_queue(payment_date, created_by_login, collection_staff_nickname)
    `,
    sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'idx_collection_rollup_refresh_queue_slice_unique'
        ) THEN
          ALTER TABLE public.collection_record_daily_rollup_refresh_queue
          ADD CONSTRAINT idx_collection_rollup_refresh_queue_slice_unique
          PRIMARY KEY USING INDEX idx_collection_rollup_refresh_queue_slice_unique;
        END IF;
      END $$;
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_status_next_attempt
      ON public.collection_record_daily_rollup_refresh_queue(status, next_attempt_at)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_updated_at
      ON public.collection_record_daily_rollup_refresh_queue(updated_at DESC)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_lower_nickname_payment_date
      ON public.collection_record_daily_rollup_refresh_queue((lower(collection_staff_nickname)), payment_date)
    `,
  ]);
}
