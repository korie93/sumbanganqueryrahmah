-- Collection V9: a verified external/unassigned payment (POOL) is settlement
-- evidence only. It must never be folded into collection_records.amount.
ALTER TABLE public.collection_records
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
ALTER TABLE public.collection_records
  DROP CONSTRAINT IF EXISTS chk_collection_records_manual_settlement_state;
--> statement-breakpoint
ALTER TABLE public.collection_records
  ADD CONSTRAINT chk_collection_records_manual_settlement_state
  CHECK (
    (
      settlement_override_status IS NULL
      AND pool_amount IS NULL
      AND manual_settlement_date IS NULL
      AND manual_settlement_reason IS NULL
      AND manual_settlement_note IS NULL
      AND manual_settlement_reference IS NULL
      AND manual_settlement_version IS NULL
      AND manual_settlement_verified_by IS NULL
      AND manual_settlement_verified_at IS NULL
      AND manual_settlement_updated_by IS NULL
      AND manual_settlement_updated_at IS NULL
      AND manual_settlement_revoked_by IS NULL
      AND manual_settlement_revoked_at IS NULL
      AND manual_settlement_revoked_reason IS NULL
    ) OR (
      settlement_override_status IN ('ACTIVE', 'REVOKED')
      AND settlement_cycle_key IS NOT NULL
      AND source_import_id IS NOT NULL
      AND source_data_row_id IS NOT NULL
      AND source_obligation_key IS NOT NULL
      AND total_due > 0
      AND pool_amount > 0
      AND manual_settlement_date IS NOT NULL
      AND calling_date IS NOT NULL
      AND calling_window_end_exclusive IS NOT NULL
      AND manual_settlement_date >= calling_date
      AND manual_settlement_date < calling_window_end_exclusive
      AND char_length(trim(manual_settlement_reason)) BETWEEN 1 AND 64
      AND manual_settlement_reason IN (
        'EXTERNAL_UNASSIGNED_PAYMENT',
        'CLIENT_CONFIRMED_PAYMENT',
        'HISTORICAL_PAYMENT_NOT_CAPTURED',
        'OTHER_WITH_REQUIRED_NOTE'
      )
      AND (
        manual_settlement_reason <> 'OTHER_WITH_REQUIRED_NOTE'
        OR char_length(trim(COALESCE(manual_settlement_note, ''))) > 0
      )
      AND (manual_settlement_note IS NULL OR char_length(manual_settlement_note) <= 2000)
      AND (manual_settlement_reference IS NULL OR char_length(manual_settlement_reference) <= 200)
      AND manual_settlement_version >= 1
      AND manual_settlement_verified_by IS NOT NULL
      AND manual_settlement_verified_at IS NOT NULL
      AND manual_settlement_updated_by IS NOT NULL
      AND manual_settlement_updated_at IS NOT NULL
      AND (
        (
          settlement_override_status = 'ACTIVE'
          AND manual_settlement_revoked_by IS NULL
          AND manual_settlement_revoked_at IS NULL
          AND manual_settlement_revoked_reason IS NULL
        ) OR (
          settlement_override_status = 'REVOKED'
          AND manual_settlement_revoked_by IS NOT NULL
          AND manual_settlement_revoked_at IS NOT NULL
          AND char_length(trim(manual_settlement_revoked_reason)) BETWEEN 1 AND 500
        )
      )
    )
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_records_sole_active_manual_settlement_per_cycle
  ON public.collection_records(settlement_cycle_key)
  WHERE settlement_override_status = 'ACTIVE' AND settlement_cycle_key IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_records_active_pool_evidence_unique
  ON public.collection_records(
    source_obligation_key,
    manual_settlement_date,
    pool_amount,
    COALESCE(lower(trim(manual_settlement_reference)), '')
  )
  WHERE settlement_override_status = 'ACTIVE'
    AND source_obligation_key IS NOT NULL
    AND manual_settlement_date IS NOT NULL
    AND pool_amount IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_records_manual_settlement_date
  ON public.collection_records(manual_settlement_date)
  WHERE settlement_override_status = 'ACTIVE';
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.pool_amount IS
  'Verified external/unassigned payment in MYR. Excluded from staff collection, receipts, and performance totals.';
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.classification IS
  'Automatic CP/ABORT CP result only. Manual Verified ABORT is derived separately from settlement override fields.';
--> statement-breakpoint
COMMENT ON TABLE public.collection_osp_manual_reconciliations IS
  'Deprecated Billing V7 audit-only data. Must not contribute to active Billing OSP results.';
