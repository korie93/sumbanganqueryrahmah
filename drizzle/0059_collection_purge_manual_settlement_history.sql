-- Retention purge must preserve the immutable classification and Manual
-- Verified/POOL evidence needed by General Search. All columns are nullable so
-- existing purge history and rolling deployment readers remain compatible.
ALTER TABLE public.collection_record_purge_history
  ADD COLUMN IF NOT EXISTS automatic_classification text,
  ADD COLUMN IF NOT EXISTS settlement_override_status text,
  ADD COLUMN IF NOT EXISTS pool_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS manual_settlement_date date,
  ADD COLUMN IF NOT EXISTS manual_settlement_reason text,
  ADD COLUMN IF NOT EXISTS manual_settlement_note text,
  ADD COLUMN IF NOT EXISTS manual_settlement_reference text,
  ADD COLUMN IF NOT EXISTS manual_settlement_version integer,
  ADD COLUMN IF NOT EXISTS manual_settlement_verified_by text,
  ADD COLUMN IF NOT EXISTS manual_settlement_verified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS manual_settlement_updated_by text,
  ADD COLUMN IF NOT EXISTS manual_settlement_updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS manual_settlement_revoked_by text,
  ADD COLUMN IF NOT EXISTS manual_settlement_revoked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS manual_settlement_revoked_reason text;
--> statement-breakpoint
COMMENT ON COLUMN public.collection_record_purge_history.pool_amount IS
  'Historical external/unassigned payment evidence; never user collection or receipt value.';
