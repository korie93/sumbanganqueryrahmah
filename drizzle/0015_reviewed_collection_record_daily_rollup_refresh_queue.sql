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
);

ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS created_by_login text;
ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS collection_staff_nickname text;
ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued';
ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS requested_at timestamp DEFAULT now();
ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS next_attempt_at timestamp DEFAULT now();
ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0;
ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS last_error text;

UPDATE public.collection_record_daily_rollup_refresh_queue
SET
  status = COALESCE(NULLIF(status, ''), 'queued'),
  requested_at = COALESCE(requested_at, now()),
  updated_at = COALESCE(updated_at, requested_at, now()),
  next_attempt_at = COALESCE(next_attempt_at, updated_at, requested_at, now()),
  attempt_count = COALESCE(attempt_count, 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_slice_unique
ON public.collection_record_daily_rollup_refresh_queue(payment_date, created_by_login, collection_staff_nickname);

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

CREATE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_status_next_attempt
ON public.collection_record_daily_rollup_refresh_queue(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_updated_at
ON public.collection_record_daily_rollup_refresh_queue(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_lower_nickname_payment_date
ON public.collection_record_daily_rollup_refresh_queue((lower(collection_staff_nickname)), payment_date);
