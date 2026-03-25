ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS two_factor_secret_encrypted text;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS two_factor_configured_at timestamp;

UPDATE public.users
SET
  two_factor_enabled = COALESCE(two_factor_enabled, false),
  two_factor_configured_at = CASE
    WHEN COALESCE(two_factor_enabled, false) = false THEN NULL
    ELSE two_factor_configured_at
  END
WHERE true;

CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled
ON public.users (two_factor_enabled);
