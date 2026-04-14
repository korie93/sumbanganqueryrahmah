-- 20260305_user_credentials.sql
-- Adds secure credential columns and case-insensitive username uniqueness.

SET search_path TO public;

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_changed_at timestamp;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;

-- Legacy compatibility: migrate old "password" column into "password_hash",
-- then immediately clear the legacy plain-text values.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'password'
  ) THEN
    EXECUTE $migrate$
      UPDATE users
      SET password_hash = password
      WHERE password_hash IS NULL
        AND password IS NOT NULL
    $migrate$;

    EXECUTE $clear$
      UPDATE users
      SET password = NULL
      WHERE password IS NOT NULL
    $clear$;
  END IF;
END $$;

UPDATE users
SET
  role = COALESCE(NULLIF(role, ''), 'user'),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now()),
  is_banned = COALESCE(is_banned, false)
WHERE
  role IS NULL
  OR role = ''
  OR created_at IS NULL
  OR updated_at IS NULL
  OR is_banned IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE is_banned IS NULL) THEN
    ALTER TABLE users ALTER COLUMN is_banned SET NOT NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON users (lower(username));
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
