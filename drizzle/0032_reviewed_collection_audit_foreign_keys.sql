ALTER TABLE public.admin_groups
ALTER COLUMN created_by DROP NOT NULL;--> statement-breakpoint

UPDATE public.collection_staff_nicknames
SET created_by = NULLIF(trim(COALESCE(created_by, '')), '');--> statement-breakpoint
UPDATE public.collection_staff_nicknames nickname
SET created_by = usr.username
FROM public.users usr
WHERE nickname.created_by IS NOT NULL
  AND lower(usr.username) = lower(nickname.created_by);--> statement-breakpoint
UPDATE public.collection_staff_nicknames
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND (
    lower(created_by) = 'system-seed'
    OR NOT EXISTS (
      SELECT 1
      FROM public.users usr
      WHERE usr.username = public.collection_staff_nicknames.created_by
    )
  );--> statement-breakpoint

UPDATE public.admin_groups
SET created_by = NULLIF(trim(COALESCE(created_by, '')), '');--> statement-breakpoint
UPDATE public.admin_groups admin_group
SET created_by = usr.username
FROM public.users usr
WHERE admin_group.created_by IS NOT NULL
  AND lower(usr.username) = lower(admin_group.created_by);--> statement-breakpoint
UPDATE public.admin_groups
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND (
    lower(created_by) = 'system-seed'
    OR NOT EXISTS (
      SELECT 1
      FROM public.users usr
      WHERE usr.username = public.admin_groups.created_by
    )
  );--> statement-breakpoint

UPDATE public.collection_daily_targets
SET
  created_by = NULLIF(trim(COALESCE(created_by, '')), ''),
  updated_by = NULLIF(trim(COALESCE(updated_by, '')), '');--> statement-breakpoint
UPDATE public.collection_daily_targets target
SET created_by = usr.username
FROM public.users usr
WHERE target.created_by IS NOT NULL
  AND lower(usr.username) = lower(target.created_by);--> statement-breakpoint
UPDATE public.collection_daily_targets target
SET updated_by = usr.username
FROM public.users usr
WHERE target.updated_by IS NOT NULL
  AND lower(usr.username) = lower(target.updated_by);--> statement-breakpoint
UPDATE public.collection_daily_targets
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users usr
    WHERE usr.username = public.collection_daily_targets.created_by
  );--> statement-breakpoint
UPDATE public.collection_daily_targets
SET updated_by = NULL
WHERE updated_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users usr
    WHERE usr.username = public.collection_daily_targets.updated_by
  );--> statement-breakpoint

UPDATE public.collection_daily_calendar
SET
  created_by = NULLIF(trim(COALESCE(created_by, '')), ''),
  updated_by = NULLIF(trim(COALESCE(updated_by, '')), '');--> statement-breakpoint
UPDATE public.collection_daily_calendar calendar
SET created_by = usr.username
FROM public.users usr
WHERE calendar.created_by IS NOT NULL
  AND lower(usr.username) = lower(calendar.created_by);--> statement-breakpoint
UPDATE public.collection_daily_calendar calendar
SET updated_by = usr.username
FROM public.users usr
WHERE calendar.updated_by IS NOT NULL
  AND lower(usr.username) = lower(calendar.updated_by);--> statement-breakpoint
UPDATE public.collection_daily_calendar
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users usr
    WHERE usr.username = public.collection_daily_calendar.created_by
  );--> statement-breakpoint
UPDATE public.collection_daily_calendar
SET updated_by = NULL
WHERE updated_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users usr
    WHERE usr.username = public.collection_daily_calendar.updated_by
  );--> statement-breakpoint

DELETE FROM public.banned_sessions session
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_activity activity
  WHERE activity.id = session.activity_id
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_banned_sessions_activity_id
ON public.banned_sessions(activity_id);--> statement-breakpoint

UPDATE public.collection_record_receipts
SET extracted_amount = receipt_amount
WHERE extraction_status = 'suggested'
  AND extracted_amount IS NULL
  AND receipt_amount IS NOT NULL;--> statement-breakpoint
UPDATE public.collection_record_receipts
SET extraction_status = 'unprocessed'
WHERE extraction_status = 'suggested'
  AND extracted_amount IS NULL;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_collection_staff_nicknames_created_by_username'
  ) THEN
    ALTER TABLE public.collection_staff_nicknames
    ADD CONSTRAINT fk_collection_staff_nicknames_created_by_username
    FOREIGN KEY (created_by)
    REFERENCES public.users(username)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_admin_groups_created_by_username'
  ) THEN
    ALTER TABLE public.admin_groups
    ADD CONSTRAINT fk_admin_groups_created_by_username
    FOREIGN KEY (created_by)
    REFERENCES public.users(username)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;

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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_banned_sessions_activity_id'
  ) THEN
    ALTER TABLE public.banned_sessions
    ADD CONSTRAINT fk_banned_sessions_activity_id
    FOREIGN KEY (activity_id)
    REFERENCES public.user_activity(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_collection_record_receipts_suggested_extracted_amount'
  ) THEN
    ALTER TABLE public.collection_record_receipts
    ADD CONSTRAINT chk_collection_record_receipts_suggested_extracted_amount
    CHECK (extraction_status <> 'suggested' OR extracted_amount IS NOT NULL);
  END IF;
END
$$;
