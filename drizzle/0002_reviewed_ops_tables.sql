CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY,
  action text NOT NULL,
  performed_by text NOT NULL,
  request_id text,
  target_user text,
  target_resource text,
  details text,
  "timestamp" timestamp DEFAULT now()
);

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS performed_by text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_user text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_resource text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS "timestamp" timestamp DEFAULT now();

UPDATE public.audit_logs
SET "timestamp" = COALESCE("timestamp", now());

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
ON public.audit_logs("timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON public.audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by
ON public.audit_logs(performed_by);

CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id
ON public.audit_logs(request_id);

CREATE TABLE IF NOT EXISTS public.mutation_idempotency_keys (
  id uuid PRIMARY KEY,
  scope text NOT NULL,
  actor text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text,
  state text NOT NULL DEFAULT 'pending',
  response_status integer,
  response_body jsonb,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  completed_at timestamp
);

ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS scope text;
ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS actor text;
ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS request_fingerprint text;
ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS state text DEFAULT 'pending';
ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS response_status integer;
ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS response_body jsonb;
ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
ALTER TABLE public.mutation_idempotency_keys ADD COLUMN IF NOT EXISTS completed_at timestamp;

UPDATE public.mutation_idempotency_keys
SET
  state = COALESCE(NULLIF(state, ''), 'pending'),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now());

CREATE UNIQUE INDEX IF NOT EXISTS idx_mutation_idempotency_scope_actor_key_unique
ON public.mutation_idempotency_keys(scope, actor, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_mutation_idempotency_updated_at
ON public.mutation_idempotency_keys(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mutation_idempotency_state
ON public.mutation_idempotency_keys(state);

CREATE TABLE IF NOT EXISTS public.backup_jobs (
  id uuid PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  requested_by text NOT NULL,
  requested_at timestamp DEFAULT now() NOT NULL,
  started_at timestamp,
  finished_at timestamp,
  updated_at timestamp DEFAULT now() NOT NULL,
  backup_id text,
  backup_name text,
  result jsonb,
  error jsonb
);

ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued';
ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS requested_by text;
ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS requested_at timestamp DEFAULT now();
ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS started_at timestamp;
ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS finished_at timestamp;
ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS backup_id text;
ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS backup_name text;
ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS error jsonb;

UPDATE public.backup_jobs
SET
  status = COALESCE(NULLIF(status, ''), 'queued'),
  requested_at = COALESCE(requested_at, now()),
  updated_at = COALESCE(updated_at, requested_at, now());

CREATE INDEX IF NOT EXISTS idx_backup_jobs_status_requested_at
ON public.backup_jobs(status, requested_at);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_updated_at
ON public.backup_jobs(updated_at DESC);
