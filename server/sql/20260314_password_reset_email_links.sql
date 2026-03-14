-- 20260314_password_reset_email_links.sql
-- Hardens password reset email-link flow with indexed hashed tokens.

SET search_path TO public;

ALTER TABLE IF EXISTS password_reset_requests
  ALTER COLUMN reset_type SET DEFAULT 'email_link';

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_requests_token_hash_unique
  ON password_reset_requests (token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_expires_at
  ON password_reset_requests (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_pending_review
  ON password_reset_requests (user_id, created_at DESC)
  WHERE approved_by IS NULL AND used_at IS NULL;
