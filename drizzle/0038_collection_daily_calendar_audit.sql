CREATE TABLE IF NOT EXISTS public.collection_daily_calendar_audit (
  id uuid PRIMARY KEY,
  calendar_id uuid,
  username text NOT NULL,
  calendar_date date NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL,
  day integer NOT NULL,
  action text NOT NULL,
  old_status text,
  new_status text,
  old_leave_type text,
  new_leave_type text,
  old_note text,
  new_note text,
  old_holiday_name text,
  new_holiday_name text,
  actor text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_daily_calendar_audit_lookup
  ON public.collection_daily_calendar_audit (lower(username), calendar_date, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_daily_calendar_audit_month
  ON public.collection_daily_calendar_audit (lower(username), year, month, day);

UPDATE public.collection_daily_calendar_audit
SET
  old_leave_type = CASE
    WHEN upper(trim(COALESCE(old_leave_type, ''))) IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')
      THEN upper(trim(old_leave_type))
    ELSE NULL
  END,
  new_leave_type = CASE
    WHEN upper(trim(COALESCE(new_leave_type, ''))) IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')
      THEN upper(trim(new_leave_type))
    ELSE NULL
  END
WHERE (
    old_leave_type IS NOT NULL
    AND (
      old_leave_type <> upper(trim(old_leave_type))
      OR upper(trim(old_leave_type)) NOT IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')
    )
  )
  OR (
    new_leave_type IS NOT NULL
    AND (
      new_leave_type <> upper(trim(new_leave_type))
      OR upper(trim(new_leave_type)) NOT IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF')
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_action'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      ADD CONSTRAINT chk_collection_daily_calendar_audit_action
      CHECK (action IN ('CREATE', 'UPDATE', 'DELETE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_old_status'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      ADD CONSTRAINT chk_collection_daily_calendar_audit_old_status
      CHECK (old_status IS NULL OR old_status IN ('WORKING', 'HOLIDAY'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_new_status'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      ADD CONSTRAINT chk_collection_daily_calendar_audit_new_status
      CHECK (new_status IS NULL OR new_status IN ('WORKING', 'HOLIDAY'));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_old_leave_type'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
      AND (
        pg_get_constraintdef(oid) NOT LIKE '%RL%'
        OR pg_get_constraintdef(oid) NOT LIKE '%OFF%'
      )
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      DROP CONSTRAINT chk_collection_daily_calendar_audit_old_leave_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_old_leave_type'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      ADD CONSTRAINT chk_collection_daily_calendar_audit_old_leave_type
      CHECK (old_leave_type IS NULL OR old_leave_type IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF'));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_new_leave_type'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
      AND (
        pg_get_constraintdef(oid) NOT LIKE '%RL%'
        OR pg_get_constraintdef(oid) NOT LIKE '%OFF%'
      )
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      DROP CONSTRAINT chk_collection_daily_calendar_audit_new_leave_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_daily_calendar_audit_new_leave_type'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      ADD CONSTRAINT chk_collection_daily_calendar_audit_new_leave_type
      CHECK (new_leave_type IS NULL OR new_leave_type IN ('AL', 'MC', 'EL', 'UL', 'RL', 'OFF'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_collection_daily_calendar_audit_actor_username'
      AND conrelid = 'public.collection_daily_calendar_audit'::regclass
  ) THEN
    ALTER TABLE public.collection_daily_calendar_audit
      ADD CONSTRAINT fk_collection_daily_calendar_audit_actor_username
      FOREIGN KEY (actor)
      REFERENCES public.users(username)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;
