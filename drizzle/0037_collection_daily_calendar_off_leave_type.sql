UPDATE public.collection_daily_calendar
SET leave_type = upper(trim(leave_type))
WHERE upper(trim(COALESCE(leave_type, ''))) = 'OFF';

DO $$
BEGIN
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
END $$;
