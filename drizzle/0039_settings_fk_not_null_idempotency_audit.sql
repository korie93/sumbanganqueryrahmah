-- AUDIT-FIX [C3]: 0022 is historical; use a forward-only audit record instead of mutating applied migration SQL.
CREATE TABLE IF NOT EXISTS public.audit_migration_log (
  audit_key text PRIMARY KEY,
  migration_tag text NOT NULL,
  issue_id text NOT NULL,
  finding text NOT NULL,
  resolution text NOT NULL,
  audited_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (migration_tag, issue_id)
);
--> statement-breakpoint
-- AUDIT-FIX [C3]: idempotent audit insert documents why 0022 remains unchanged after release history.
INSERT INTO public.audit_migration_log (
  audit_key,
  migration_tag,
  issue_id,
  finding,
  resolution
)
VALUES (
  '0022_reviewed_settings_fk_not_null:C3',
  '0022_reviewed_settings_fk_not_null',
  'C3',
  'Historical migration cleanup DELETE statements precede NOT NULL enforcement for settings foreign keys.',
  'Forward-only audit record created; old migration SQL is not mutated after later migrations have entered release history.'
)
ON CONFLICT (audit_key) DO UPDATE
SET
  migration_tag = EXCLUDED.migration_tag,
  issue_id = EXCLUDED.issue_id,
  finding = EXCLUDED.finding,
  resolution = EXCLUDED.resolution,
  audited_at = now();
