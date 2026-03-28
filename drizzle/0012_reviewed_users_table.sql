CREATE TABLE IF NOT EXISTS public.users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  full_name text,
  email text,
  role text NOT NULL DEFAULT 'user',
  password_hash text,
  status text NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT false,
  password_reset_by_superuser boolean NOT NULL DEFAULT false,
  created_by text,
  is_banned boolean DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  password_changed_at timestamp,
  activated_at timestamp,
  last_login_at timestamp
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_reset_by_superuser boolean DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamp;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS activated_at timestamp;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at timestamp;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'password'
  ) THEN
    UPDATE public.users
    SET password_hash = password
    WHERE password_hash IS NULL
      AND password IS NOT NULL;

    UPDATE public.users
    SET password = NULL
    WHERE password IS NOT NULL;
  END IF;
END
$$;

UPDATE public.users
SET
  full_name = NULLIF(trim(COALESCE(full_name, '')), ''),
  email = NULLIF(trim(COALESCE(email, '')), ''),
  role = CASE
    WHEN lower(trim(COALESCE(role, ''))) IN ('user', 'admin', 'superuser')
      THEN lower(trim(COALESCE(role, '')))
    ELSE 'user'
  END,
  status = CASE
    WHEN lower(trim(COALESCE(status, ''))) IN ('pending_activation', 'active', 'suspended', 'disabled')
      THEN lower(trim(COALESCE(status, '')))
    WHEN COALESCE(password_hash, '') ~ '^\\$2[aby]\\$'
      THEN 'active'
    ELSE 'pending_activation'
  END,
  must_change_password = COALESCE(must_change_password, false),
  password_reset_by_superuser = COALESCE(password_reset_by_superuser, false),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now()),
  activated_at = CASE
    WHEN activated_at IS NOT NULL THEN activated_at
    WHEN lower(trim(COALESCE(status, ''))) = 'active' AND password_changed_at IS NOT NULL THEN password_changed_at
    WHEN lower(trim(COALESCE(status, ''))) = 'active' THEN COALESCE(created_at, now())
    ELSE activated_at
  END,
  is_banned = COALESCE(is_banned, false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE username IS NULL) THEN
    ALTER TABLE public.users ALTER COLUMN username SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE role IS NULL) THEN
    ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE status IS NULL) THEN
    ALTER TABLE public.users ALTER COLUMN status SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE password_hash IS NULL) THEN
    ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.user_activity') IS NOT NULL THEN
    DELETE FROM public.user_activity activity
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users usr
      WHERE usr.id = activity.user_id
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_user_activity_user_id'
    ) THEN
      ALTER TABLE public.user_activity
      ADD CONSTRAINT fk_user_activity_user_id
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE;
    END IF;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique
ON public.users(lower(username));

CREATE INDEX IF NOT EXISTS idx_users_username_lower
ON public.users(lower(username));

CREATE INDEX IF NOT EXISTS idx_users_role
ON public.users(role);

CREATE INDEX IF NOT EXISTS idx_users_status
ON public.users(status);

CREATE INDEX IF NOT EXISTS idx_users_must_change_password
ON public.users(must_change_password);

CREATE INDEX IF NOT EXISTS idx_users_created_by
ON public.users(created_by);

CREATE INDEX IF NOT EXISTS idx_users_password_reset_by_superuser
ON public.users(password_reset_by_superuser);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique
ON public.users(lower(email))
WHERE email IS NOT NULL AND trim(email) <> '';
