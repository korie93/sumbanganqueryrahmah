-- TASK-04: Separate audit stream for operations debug route access.
-- Safe to re-run: YES (CREATE IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.debug_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  user_id text,
  ip_address text,
  method text NOT NULL,
  path text NOT NULL,
  user_agent text,
  query_params text NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_debug_audit_log_timestamp
  ON public.debug_audit_log ("timestamp");

CREATE INDEX IF NOT EXISTS idx_debug_audit_log_user_id
  ON public.debug_audit_log (user_id);

CREATE INDEX IF NOT EXISTS idx_debug_audit_log_ip_address
  ON public.debug_audit_log (ip_address);

CREATE INDEX IF NOT EXISTS idx_debug_audit_log_path
  ON public.debug_audit_log (path);

COMMENT ON TABLE public.debug_audit_log IS
  'Dedicated audit stream for operations debug route access attempts.';

COMMENT ON COLUMN public.debug_audit_log.query_params IS
  'Bounded JSON snapshot of query params with sensitive keys redacted by the application middleware.';
