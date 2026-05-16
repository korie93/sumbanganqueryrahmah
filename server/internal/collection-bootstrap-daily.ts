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
      username text NOT NULL DEFAULT '',
      calendar_date date,
      year integer NOT NULL,
      month integer NOT NULL,
      day integer NOT NULL,
      status text NOT NULL DEFAULT 'WORKING',
      leave_type text,
      note text,
      is_working_day boolean NOT NULL DEFAULT true,
      is_holiday boolean NOT NULL DEFAULT false,
      holiday_name text,
      created_by text,
      updated_by text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS username text DEFAULT ''`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS calendar_date date`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS year integer`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS month integer`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS day integer`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS status text DEFAULT 'WORKING'`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS leave_type text`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ADD COLUMN IF NOT EXISTS note text`);
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
      username = lower(trim(COALESCE(username, ''))),
      calendar_date = COALESCE(calendar_date, make_date(year, month, day)),
      status = CASE
        WHEN upper(trim(COALESCE(status, ''))) = 'HOLIDAY' OR COALESCE(is_holiday, false) THEN 'HOLIDAY'
        ELSE 'WORKING'
      END,
      leave_type = CASE
        WHEN upper(trim(COALESCE(leave_type, ''))) IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')
          THEN upper(trim(leave_type))
        ELSE NULL
      END,
      note = NULLIF(trim(COALESCE(note, holiday_name, '')), ''),
      is_working_day = COALESCE(is_working_day, true),
      is_holiday = COALESCE(is_holiday, false),
      created_by = NULLIF(trim(COALESCE(created_by, '')), ''),
      updated_by = NULLIF(trim(COALESCE(updated_by, '')), ''),
      created_at = COALESCE(created_at, now()),
      updated_at = COALESCE(updated_at, now())
  `);
  await db.execute(sql`
    UPDATE public.collection_daily_calendar
    SET
      is_holiday = (status = 'HOLIDAY'),
      is_working_day = (status = 'WORKING'),
      holiday_name = CASE
        WHEN status = 'HOLIDAY' THEN COALESCE(leave_type, NULLIF(trim(COALESCE(note, '')), ''))
        ELSE NULL
      END,
      leave_type = CASE WHEN status = 'HOLIDAY' THEN leave_type ELSE NULL END,
      note = CASE WHEN status = 'HOLIDAY' THEN note ELSE NULL END
  `);
  await db.execute(sql`DROP INDEX IF EXISTS public.idx_collection_daily_calendar_unique`);
  await db.execute(sql`
    WITH legacy_calendar AS (
      SELECT DISTINCT ON (calendar_date)
        *
      FROM public.collection_daily_calendar
      WHERE lower(trim(COALESCE(username, ''))) = ''
        AND calendar_date IS NOT NULL
      ORDER BY calendar_date, updated_at DESC, created_at DESC, id DESC
    ),
    staff_nicknames AS (
      SELECT DISTINCT lower(trim(nickname)) AS username
      FROM public.collection_staff_nicknames
      WHERE lower(trim(COALESCE(nickname, ''))) <> ''
    )
    INSERT INTO public.collection_daily_calendar (
      id,
      username,
      calendar_date,
      year,
      month,
      day,
      status,
      leave_type,
      note,
      is_working_day,
      is_holiday,
      holiday_name,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      nickname.username,
      calendar.calendar_date,
      calendar.year,
      calendar.month,
      calendar.day,
      calendar.status,
      calendar.leave_type,
      calendar.note,
      calendar.is_working_day,
      calendar.is_holiday,
      calendar.holiday_name,
      calendar.created_by,
      calendar.updated_by,
      calendar.created_at,
      calendar.updated_at
    FROM legacy_calendar calendar
    CROSS JOIN staff_nicknames nickname
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.collection_daily_calendar existing
        WHERE lower(existing.username) = nickname.username
          AND existing.calendar_date = calendar.calendar_date
      )
  `);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ALTER COLUMN username SET DEFAULT ''`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ALTER COLUMN username SET NOT NULL`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ALTER COLUMN calendar_date SET NOT NULL`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ALTER COLUMN status SET DEFAULT 'WORKING'`);
  await db.execute(sql`ALTER TABLE public.collection_daily_calendar ALTER COLUMN status SET NOT NULL`);
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_calendar_username_date_unique
    ON public.collection_daily_calendar (lower(username), calendar_date)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_daily_calendar_year_month
    ON public.collection_daily_calendar (year, month)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_daily_calendar_username_year_month
    ON public.collection_daily_calendar (lower(username), year, month)
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_collection_daily_calendar_status'
      ) THEN
        ALTER TABLE public.collection_daily_calendar
        ADD CONSTRAINT chk_collection_daily_calendar_status
        CHECK (status IN ('WORKING', 'HOLIDAY'));
      END IF;

      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_collection_daily_calendar_leave_type'
          AND conrelid = 'public.collection_daily_calendar'::regclass
          AND pg_get_constraintdef(oid) NOT LIKE '%OFF%'
      ) THEN
        ALTER TABLE public.collection_daily_calendar
        DROP CONSTRAINT chk_collection_daily_calendar_leave_type;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_collection_daily_calendar_leave_type'
          AND conrelid = 'public.collection_daily_calendar'::regclass
      ) THEN
        ALTER TABLE public.collection_daily_calendar
        ADD CONSTRAINT chk_collection_daily_calendar_leave_type
        CHECK (leave_type IS NULL OR leave_type IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF'));
      END IF;

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
