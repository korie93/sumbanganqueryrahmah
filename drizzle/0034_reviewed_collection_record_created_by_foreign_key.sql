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
  'system',
  false,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.users
  WHERE lower(username) = 'system'
);

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
  created_by = CASE
    WHEN lower(trim(COALESCE(created_by, ''))) IN ('', 'system-bootstrap') THEN 'system'
    ELSE created_by
  END,
  is_banned = false,
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now()),
  password_changed_at = NULL,
  activated_at = NULL,
  last_login_at = NULL
WHERE lower(username) = 'system';

UPDATE public.users
SET created_by = 'system'
WHERE lower(trim(COALESCE(created_by, ''))) = 'system-bootstrap';

UPDATE public.collection_records record
SET created_by_login = usr.username
FROM public.users usr
WHERE lower(usr.username) = lower(trim(COALESCE(record.created_by_login, '')));

UPDATE public.collection_records
SET created_by_login = 'system'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.users usr
  WHERE usr.username = public.collection_records.created_by_login
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_collection_records_created_by_login_username'
  ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT fk_collection_records_created_by_login_username
    FOREIGN KEY (created_by_login)
    REFERENCES public.users(username)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
  END IF;
END $$;
