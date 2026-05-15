ALTER TABLE public.collection_daily_calendar
  ADD COLUMN IF NOT EXISTS username text DEFAULT '',
  ADD COLUMN IF NOT EXISTS calendar_date date,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'WORKING',
  ADD COLUMN IF NOT EXISTS leave_type text,
  ADD COLUMN IF NOT EXISTS note text;

UPDATE public.collection_daily_calendar
SET
  username = lower(trim(COALESCE(username, ''))),
  calendar_date = COALESCE(calendar_date, make_date(year, month, day)),
  status = CASE
    WHEN upper(trim(COALESCE(status, ''))) = 'HOLIDAY' OR COALESCE(is_holiday, false) THEN 'HOLIDAY'
    ELSE 'WORKING'
  END,
  leave_type = CASE
    WHEN upper(trim(COALESCE(leave_type, ''))) IN ('AL', 'MC', 'EL', 'UL', 'RL') THEN upper(trim(leave_type))
    ELSE NULL
  END,
  note = NULLIF(trim(COALESCE(note, holiday_name, '')), ''),
  is_working_day = COALESCE(is_working_day, true),
  is_holiday = COALESCE(is_holiday, false),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

UPDATE public.collection_daily_calendar
SET
  is_holiday = (status = 'HOLIDAY'),
  is_working_day = (status = 'WORKING'),
  holiday_name = CASE
    WHEN status = 'HOLIDAY' THEN COALESCE(leave_type, NULLIF(trim(COALESCE(note, '')), ''))
    ELSE NULL
  END,
  leave_type = CASE WHEN status = 'HOLIDAY' THEN leave_type ELSE NULL END,
  note = CASE WHEN status = 'HOLIDAY' THEN note ELSE NULL END;

ALTER TABLE public.collection_daily_calendar
  ALTER COLUMN username SET DEFAULT '',
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN calendar_date SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'WORKING',
  ALTER COLUMN status SET NOT NULL;

DROP INDEX IF EXISTS public.idx_collection_daily_calendar_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_daily_calendar_username_date_unique
  ON public.collection_daily_calendar (lower(username), calendar_date);

CREATE INDEX IF NOT EXISTS idx_collection_daily_calendar_username_year_month
  ON public.collection_daily_calendar (lower(username), year, month);

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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_leave_type'
  ) THEN
    ALTER TABLE public.collection_daily_calendar
      ADD CONSTRAINT chk_collection_daily_calendar_leave_type
      CHECK (leave_type IS NULL OR leave_type IN ('AL', 'MC', 'EL', 'UL', 'RL'));
  END IF;
END $$;
