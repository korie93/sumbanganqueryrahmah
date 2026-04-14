INSERT INTO public.users (
  id,
  username,
  full_name,
  role,
  password_hash,
  status,
  must_change_password,
  password_reset_by_superuser,
  two_factor_enabled,
  failed_login_attempts,
  locked_by_system,
  created_by,
  is_banned,
  created_at,
  updated_at
)
SELECT
  'system-user',
  'system',
  'System Actor',
  'user',
  '$2b$12$jHDoINM4IPl88oSr7lb3Z.aVlpBWVraltDnPv1ibuuu2gd2vLxpAm',
  'disabled',
  false,
  false,
  false,
  0,
  false,
  NULL,
  false,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.users
  WHERE lower(username) = 'system'
);--> statement-breakpoint

UPDATE public.users
SET
  username = 'system',
  full_name = 'System Actor',
  role = 'user',
  password_hash = '$2b$12$jHDoINM4IPl88oSr7lb3Z.aVlpBWVraltDnPv1ibuuu2gd2vLxpAm',
  status = 'disabled',
  must_change_password = false,
  password_reset_by_superuser = false,
  two_factor_enabled = false,
  two_factor_secret_encrypted = NULL,
  two_factor_configured_at = NULL,
  failed_login_attempts = 0,
  locked_at = NULL,
  locked_reason = NULL,
  locked_by_system = false,
  created_by = NULL,
  is_banned = false,
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now()),
  password_changed_at = NULL,
  activated_at = NULL,
  last_login_at = NULL
WHERE lower(username) = 'system';--> statement-breakpoint

UPDATE public.users
SET created_by = NULLIF(trim(COALESCE(created_by, '')), '');--> statement-breakpoint
UPDATE public.users
SET created_by = NULL
WHERE lower(username) = 'system'
  AND created_by IS NOT NULL
  AND lower(created_by) IN ('system-bootstrap', 'legacy-create-user');--> statement-breakpoint
UPDATE public.users
SET created_by = 'system'
WHERE lower(username) <> 'system'
  AND created_by IS NOT NULL
  AND lower(created_by) IN ('system-bootstrap', 'legacy-create-user');--> statement-breakpoint
UPDATE public.users account
SET created_by = actor.username
FROM public.users actor
WHERE account.created_by IS NOT NULL
  AND lower(actor.username) = lower(account.created_by);--> statement-breakpoint
UPDATE public.users
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users actor
    WHERE actor.username = public.users.created_by
  );--> statement-breakpoint

UPDATE public.account_activation_tokens
SET created_by = NULLIF(trim(COALESCE(created_by, '')), '');--> statement-breakpoint
UPDATE public.account_activation_tokens
SET created_by = 'system'
WHERE created_by IS NOT NULL
  AND lower(created_by) IN ('system-bootstrap', 'legacy-create-user');--> statement-breakpoint
UPDATE public.account_activation_tokens token
SET created_by = usr.username
FROM public.users usr
WHERE token.created_by IS NOT NULL
  AND lower(usr.username) = lower(token.created_by);--> statement-breakpoint
UPDATE public.account_activation_tokens
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users usr
    WHERE usr.username = public.account_activation_tokens.created_by
  );--> statement-breakpoint

UPDATE public.password_reset_requests
SET
  requested_by_user = NULLIF(trim(COALESCE(requested_by_user, '')), ''),
  approved_by = NULLIF(trim(COALESCE(approved_by, '')), '');--> statement-breakpoint
UPDATE public.password_reset_requests
SET requested_by_user = 'system'
WHERE requested_by_user IS NOT NULL
  AND lower(requested_by_user) IN ('system-bootstrap', 'legacy-create-user');--> statement-breakpoint
UPDATE public.password_reset_requests
SET approved_by = 'system'
WHERE approved_by IS NOT NULL
  AND lower(approved_by) IN ('system-bootstrap', 'legacy-create-user');--> statement-breakpoint
UPDATE public.password_reset_requests req
SET requested_by_user = usr.username
FROM public.users usr
WHERE req.requested_by_user IS NOT NULL
  AND lower(usr.username) = lower(req.requested_by_user);--> statement-breakpoint
UPDATE public.password_reset_requests req
SET approved_by = usr.username
FROM public.users usr
WHERE req.approved_by IS NOT NULL
  AND lower(usr.username) = lower(req.approved_by);--> statement-breakpoint
UPDATE public.password_reset_requests
SET requested_by_user = NULL
WHERE requested_by_user IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users usr
    WHERE usr.username = public.password_reset_requests.requested_by_user
  );--> statement-breakpoint
UPDATE public.password_reset_requests
SET approved_by = NULL
WHERE approved_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users usr
    WHERE usr.username = public.password_reset_requests.approved_by
  );--> statement-breakpoint

UPDATE public.imports
SET created_by = NULLIF(trim(COALESCE(created_by, '')), '');--> statement-breakpoint
UPDATE public.imports
SET created_by = 'system'
WHERE created_by IS NOT NULL
  AND lower(created_by) IN ('system-bootstrap', 'legacy-create-user');--> statement-breakpoint
UPDATE public.imports import_row
SET created_by = usr.username
FROM public.users usr
WHERE import_row.created_by IS NOT NULL
  AND lower(usr.username) = lower(import_row.created_by);--> statement-breakpoint
UPDATE public.imports
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.users usr
    WHERE usr.username = public.imports.created_by
  );--> statement-breakpoint

UPDATE public.backups
SET created_by = NULLIF(trim(COALESCE(created_by, '')), '');--> statement-breakpoint
UPDATE public.backups
SET created_by = 'system'
WHERE created_by IS NULL
   OR lower(created_by) IN ('system-bootstrap', 'legacy-create-user');--> statement-breakpoint
UPDATE public.backups backup_row
SET created_by = usr.username
FROM public.users usr
WHERE lower(usr.username) = lower(backup_row.created_by);--> statement-breakpoint
UPDATE public.backups
SET created_by = 'system'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.users usr
  WHERE usr.username = public.backups.created_by
);--> statement-breakpoint
ALTER TABLE public.backups
ALTER COLUMN created_by SET NOT NULL;--> statement-breakpoint

UPDATE public.backup_jobs
SET requested_by = NULLIF(trim(COALESCE(requested_by, '')), '');--> statement-breakpoint
UPDATE public.backup_jobs
SET requested_by = 'system'
WHERE requested_by IS NULL
   OR lower(requested_by) IN ('system-bootstrap', 'legacy-create-user');--> statement-breakpoint
UPDATE public.backup_jobs job
SET requested_by = usr.username
FROM public.users usr
WHERE lower(usr.username) = lower(job.requested_by);--> statement-breakpoint
UPDATE public.backup_jobs
SET requested_by = 'system'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.users usr
  WHERE usr.username = public.backup_jobs.requested_by
);--> statement-breakpoint
ALTER TABLE public.backup_jobs
ALTER COLUMN requested_by SET NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_created_by
ON public.account_activation_tokens(created_by);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_requested_by_user
ON public.password_reset_requests(requested_by_user);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_approved_by
ON public.password_reset_requests(approved_by);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_imports_created_by
ON public.imports(created_by);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_backups_created_at
ON public.backups(created_at DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_backups_created_by
ON public.backups(created_by);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_backup_jobs_requested_by
ON public.backup_jobs(requested_by);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_users_created_by_username'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT fk_users_created_by_username
    FOREIGN KEY (created_by)
    REFERENCES public.users(username)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_account_activation_tokens_created_by_username'
  ) THEN
    ALTER TABLE public.account_activation_tokens
    ADD CONSTRAINT fk_account_activation_tokens_created_by_username
    FOREIGN KEY (created_by)
    REFERENCES public.users(username)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_password_reset_requests_requested_by_user_username'
  ) THEN
    ALTER TABLE public.password_reset_requests
    ADD CONSTRAINT fk_password_reset_requests_requested_by_user_username
    FOREIGN KEY (requested_by_user)
    REFERENCES public.users(username)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_password_reset_requests_approved_by_username'
  ) THEN
    ALTER TABLE public.password_reset_requests
    ADD CONSTRAINT fk_password_reset_requests_approved_by_username
    FOREIGN KEY (approved_by)
    REFERENCES public.users(username)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_imports_created_by_username'
  ) THEN
    ALTER TABLE public.imports
    ADD CONSTRAINT fk_imports_created_by_username
    FOREIGN KEY (created_by)
    REFERENCES public.users(username)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_backups_created_by_username'
  ) THEN
    ALTER TABLE public.backups
    ADD CONSTRAINT fk_backups_created_by_username
    FOREIGN KEY (created_by)
    REFERENCES public.users(username)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_backup_jobs_requested_by_username'
  ) THEN
    ALTER TABLE public.backup_jobs
    ADD CONSTRAINT fk_backup_jobs_requested_by_username
    FOREIGN KEY (requested_by)
    REFERENCES public.users(username)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
  END IF;
END
$$;
