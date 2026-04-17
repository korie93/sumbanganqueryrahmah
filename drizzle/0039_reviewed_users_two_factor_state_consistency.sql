UPDATE public.users
SET two_factor_secret_encrypted = NULLIF(btrim(COALESCE(two_factor_secret_encrypted, '')), '');
--> statement-breakpoint

UPDATE public.users
SET
  two_factor_enabled = false,
  two_factor_configured_at = NULL
WHERE COALESCE(two_factor_enabled, false) = true
  AND two_factor_secret_encrypted IS NULL;
--> statement-breakpoint

UPDATE public.users
SET two_factor_configured_at = NULL
WHERE COALESCE(two_factor_enabled, false) = false
  OR two_factor_secret_encrypted IS NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_users_two_factor_secret_not_blank'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT chk_users_two_factor_secret_not_blank
    CHECK (two_factor_secret_encrypted IS NULL OR btrim(two_factor_secret_encrypted) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_users_two_factor_enabled_secret'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT chk_users_two_factor_enabled_secret
    CHECK (
      two_factor_enabled = false
      OR (two_factor_secret_encrypted IS NOT NULL AND btrim(two_factor_secret_encrypted) <> '')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_users_two_factor_configured_state'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT chk_users_two_factor_configured_state
    CHECK (
      two_factor_configured_at IS NULL
      OR (
        two_factor_enabled = true
        AND two_factor_secret_encrypted IS NOT NULL
        AND btrim(two_factor_secret_encrypted) <> ''
      )
    );
  END IF;
END
$$;
