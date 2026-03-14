-- 20260313_auth_account_lifecycle.sql
-- Hardens closed-account authentication with lifecycle fields,
-- activation tokens, and audited password reset requests.

SET search_path TO public;

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_reset_by_superuser boolean DEFAULT false;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS activated_at timestamp;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_login_at timestamp;

CREATE TABLE IF NOT EXISTS account_activation_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_by text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  requested_by_user text,
  approved_by text,
  reset_type text NOT NULL DEFAULT 'temporary_password',
  token_hash text,
  expires_at timestamp,
  used_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_must_change_password ON users (must_change_password);
CREATE INDEX IF NOT EXISTS idx_users_password_reset_by_superuser ON users (password_reset_by_superuser);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique
  ON users (lower(email))
  WHERE email IS NOT NULL AND trim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_activation_tokens_hash_unique
  ON account_activation_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_user_id
  ON account_activation_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_expires_at
  ON account_activation_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id
  ON password_reset_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_created_at
  ON password_reset_requests (created_at DESC);
