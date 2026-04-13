import { sql } from "drizzle-orm";
import { db } from "../db-postgres";

export async function ensureCollectionDailyTables(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.collection_daily_targets (
      id uuid PRIMARY KEY,
      username text NOT NULL,
      year integer NOT NULL,
      month integer NOT NULL,
      monthly_target numeric(14,2) NOT NULL DEFAULT 0,
      created_by text,
      updated_by text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS username text`);
  await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS year integer`);
  await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS month integer`);
  await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS monthly_target numeric(14,2) DEFAULT 0`);
  await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS created_by text`);
  await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS updated_by text`);
  await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await db.execute(sql`ALTER TABLE public.collection_daily_targets ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await db.execute(sql`
    UPDATE public.collection_daily_targets
    SET
      username = lower(trim(COALESCE(username, ''))),
      created_by = NULLIF(trim(COALESCE(created_by, '')), ''),
      updated_by = NULLIF(trim(COALESCE(updated_by, '')), ''),
      monthly_target = COALESCE(monthly_target, 0),
      created_at = COALESCE(created_at, now()),
      updated_at = COALESCE(updated_at, now())
  `);
  await db.execute(sql`
    UPDATE public.collection_daily_targets target
    SET created_by = usr.username
    FROM public.users usr
    WHERE target.created_by IS NOT NULL
      AND lower(usr.username) = lower(target.created_by)
  `);
  await db.execute(sql`
    UPDATE public.collection_daily_targets target
    SET updated_by = usr.username
    FROM public.users usr
    WHERE target.updated_by IS NOT NULL
      AND lower(usr.username) = lower(target.updated_by)
  `);
  await db.execute(sql`
    UPDATE public.collection_daily_targets
    SET created_by = NULL
    WHERE created_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.users usr
        WHERE usr.username = public.collection_daily_targets.created_by
      )
  `);
  await db.execute(sql`
    UPDATE public.collection_daily_targets
    SET updated_by = NULL
    WHERE updated_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.users usr
        WHERE usr.username = public.collection_daily_targets.updated_by
      )
  `);
  await db.execute(sql`DELETE FROM public.collection_daily_targets WHERE trim(COALESCE(username, '')) = ''`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_targets_user_month_unique
    ON public.collection_daily_targets (lower(username), year, month)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_daily_targets_year_month
    ON public.collection_daily_targets (year, month)
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_collection_daily_targets_created_by_username'
      ) THEN
        ALTER TABLE public.collection_daily_targets
        ADD CONSTRAINT fk_collection_daily_targets_created_by_username
        FOREIGN KEY (created_by)
        REFERENCES public.users(username)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_collection_daily_targets_updated_by_username'
      ) THEN
        ALTER TABLE public.collection_daily_targets
        ADD CONSTRAINT fk_collection_daily_targets_updated_by_username
        FOREIGN KEY (updated_by)
        REFERENCES public.users(username)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.collection_daily_calendar (
      id uuid PRIMARY KEY,
      year integer NOT NULL,
      month integer NOT NULL,
      day integer NOT NULL,
      is_working_day boolean NOT NULL DEFAULT true,
      is_holiday boolean NOT NULL DEFAULT false,
      holiday_name text,
      created_by text,
      updated_by text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS year integer`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS month integer`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS day integer`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS is_working_day boolean DEFAULT true`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS is_holiday boolean DEFAULT false`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS holiday_name text`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS created_by text`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS updated_by text`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await db.execute(sql`
    UPDATE public.collection_daily_calendar
    SET
      is_working_day = COALESCE(is_working_day, true),
      is_holiday = COALESCE(is_holiday, false),
      created_by = NULLIF(trim(COALESCE(created_by, '')), ''),
      updated_by = NULLIF(trim(COALESCE(updated_by, '')), ''),
      created_at = COALESCE(created_at, now()),
      updated_at = COALESCE(updated_at, now())
  `);
  await db.execute(sql`
    UPDATE public.collection_daily_calendar calendar
    SET created_by = usr.username
    FROM public.users usr
    WHERE calendar.created_by IS NOT NULL
      AND lower(usr.username) = lower(calendar.created_by)
  `);
  await db.execute(sql`
    UPDATE public.collection_daily_calendar calendar
    SET updated_by = usr.username
    FROM public.users usr
    WHERE calendar.updated_by IS NOT NULL
      AND lower(usr.username) = lower(calendar.updated_by)
  `);
  await db.execute(sql`
    UPDATE public.collection_daily_calendar
    SET created_by = NULL
    WHERE created_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.users usr
        WHERE usr.username = public.collection_daily_calendar.created_by
      )
  `);
  await db.execute(sql`
    UPDATE public.collection_daily_calendar
    SET updated_by = NULL
    WHERE updated_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.users usr
        WHERE usr.username = public.collection_daily_calendar.updated_by
      )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_calendar_unique
    ON public.collection_daily_calendar (year, month, day)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_daily_calendar_year_month
    ON public.collection_daily_calendar (year, month)
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_collection_daily_calendar_created_by_username'
      ) THEN
        ALTER TABLE public.collection_daily_calendar
        ADD CONSTRAINT fk_collection_daily_calendar_created_by_username
        FOREIGN KEY (created_by)
        REFERENCES public.users(username)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_collection_daily_calendar_updated_by_username'
      ) THEN
        ALTER TABLE public.collection_daily_calendar
        ADD CONSTRAINT fk_collection_daily_calendar_updated_by_username
        FOREIGN KEY (updated_by)
        REFERENCES public.users(username)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      END IF;
    END $$;
  `);
}
