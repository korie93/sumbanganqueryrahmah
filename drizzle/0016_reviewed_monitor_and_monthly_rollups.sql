CREATE TABLE IF NOT EXISTS public.collection_record_monthly_rollups (
  year integer NOT NULL,
  month integer NOT NULL,
  created_by_login text NOT NULL,
  collection_staff_nickname text NOT NULL,
  total_records integer NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS year integer;
ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS month integer;
ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS created_by_login text;
ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS collection_staff_nickname text;
ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS total_records integer DEFAULT 0;
ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS total_amount numeric(14,2);
ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

UPDATE public.collection_record_monthly_rollups
SET
  total_records = COALESCE(total_records, 0),
  total_amount = COALESCE(total_amount, 0),
  updated_at = COALESCE(updated_at, now());

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_slice_unique
ON public.collection_record_monthly_rollups(year, month, created_by_login, collection_staff_nickname);

CREATE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_year_month
ON public.collection_record_monthly_rollups(year, month);

CREATE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_created_by_year_month
ON public.collection_record_monthly_rollups(created_by_login, year, month);

CREATE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_lower_nickname_year_month
ON public.collection_record_monthly_rollups((lower(collection_staff_nickname)), year, month);

DELETE FROM public.collection_record_monthly_rollups rollup
WHERE NOT EXISTS (
  SELECT 1
  FROM public.collection_record_daily_rollups daily
  WHERE daily.created_by_login = rollup.created_by_login
    AND daily.collection_staff_nickname = rollup.collection_staff_nickname
    AND EXTRACT(YEAR FROM daily.payment_date)::int = rollup.year
    AND EXTRACT(MONTH FROM daily.payment_date)::int = rollup.month
);

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
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.monitor_alert_incidents (
  id uuid PRIMARY KEY,
  alert_key text NOT NULL,
  severity text NOT NULL,
  source text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  first_seen_at timestamp NOT NULL DEFAULT now(),
  last_seen_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp,
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS alert_key text;
ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS severity text;
ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';
ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS first_seen_at timestamp DEFAULT now();
ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS last_seen_at timestamp DEFAULT now();
ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS resolved_at timestamp;
ALTER TABLE public.monitor_alert_incidents ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

UPDATE public.monitor_alert_incidents
SET
  severity = COALESCE(NULLIF(BTRIM(COALESCE(severity, '')), ''), 'INFO'),
  status = COALESCE(NULLIF(BTRIM(COALESCE(status, '')), ''), 'open'),
  message = COALESCE(NULLIF(BTRIM(COALESCE(message, '')), ''), 'Monitor alert'),
  first_seen_at = COALESCE(first_seen_at, now()),
  last_seen_at = COALESCE(last_seen_at, first_seen_at, now()),
  updated_at = COALESCE(updated_at, last_seen_at, first_seen_at, now());

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_alert_incidents_open_key_unique
ON public.monitor_alert_incidents(alert_key)
WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_monitor_alert_incidents_status_updated_at
ON public.monitor_alert_incidents(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitor_alert_incidents_resolved_at
ON public.monitor_alert_incidents(resolved_at DESC);
