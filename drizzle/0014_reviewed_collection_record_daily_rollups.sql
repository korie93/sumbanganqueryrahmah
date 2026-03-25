CREATE TABLE IF NOT EXISTS public.collection_record_daily_rollups (
  payment_date date NOT NULL,
  created_by_login text NOT NULL,
  collection_staff_nickname text NOT NULL,
  total_records integer NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS created_by_login text;
ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS collection_staff_nickname text;
ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS total_records integer DEFAULT 0;
ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS total_amount numeric(14,2);
ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

UPDATE public.collection_record_daily_rollups
SET
  total_records = COALESCE(total_records, 0),
  total_amount = COALESCE(total_amount, 0),
  updated_at = COALESCE(updated_at, now());

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_slice_unique
ON public.collection_record_daily_rollups(payment_date, created_by_login, collection_staff_nickname);

CREATE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_payment_date
ON public.collection_record_daily_rollups(payment_date);

CREATE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_created_by_payment_date
ON public.collection_record_daily_rollups(created_by_login, payment_date);

CREATE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_lower_nickname_payment_date
ON public.collection_record_daily_rollups((lower(collection_staff_nickname)), payment_date);

DELETE FROM public.collection_record_daily_rollups rollup
WHERE NOT EXISTS (
  SELECT 1
  FROM public.collection_records record
  WHERE record.payment_date = rollup.payment_date
    AND record.created_by_login = rollup.created_by_login
    AND record.collection_staff_nickname = rollup.collection_staff_nickname
);

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
  updated_at = now();
