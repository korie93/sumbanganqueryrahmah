ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS card_number_last4 text;
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS source_obligation_key text;
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS settlement_cycle_key text;
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS classification text;
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS cumulative_collected numeric(14,2);
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS remaining_amount numeric(14,2);
--> statement-breakpoint
ALTER TABLE public.collection_records
DROP CONSTRAINT IF EXISTS chk_collection_records_source_match_basis;
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD CONSTRAINT chk_collection_records_source_match_basis
CHECK (source_match_basis IS NULL OR source_match_basis IN (
  'ic',
  'phone_and_account',
  'account_number',
  'card_number',
  'account_and_card'
)) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.collection_records
VALIDATE CONSTRAINT chk_collection_records_source_match_basis;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_collection_records_card_number_last4'
      AND conrelid = 'public.collection_records'::regclass
  ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT chk_collection_records_card_number_last4
    CHECK (card_number_last4 IS NULL OR char_length(card_number_last4) <= 4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_collection_records_classification'
      AND conrelid = 'public.collection_records'::regclass
  ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT chk_collection_records_classification
    CHECK (classification IS NULL OR classification IN ('cp', 'abort_cp'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_collection_records_settlement_state'
      AND conrelid = 'public.collection_records'::regclass
  ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT chk_collection_records_settlement_state
    CHECK (
      (classification IS NULL AND cumulative_collected IS NULL AND remaining_amount IS NULL)
      OR (
        classification IN ('cp', 'abort_cp')
        AND settlement_cycle_key IS NOT NULL
        AND source_obligation_key IS NOT NULL
        AND cumulative_collected >= 0
        AND remaining_amount >= 0
      )
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_records_settlement_cycle_order
ON public.collection_records(settlement_cycle_key, payment_date, created_at, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_records_sole_abort_per_cycle
ON public.collection_records(settlement_cycle_key)
WHERE classification = 'abort_cp' AND settlement_cycle_key IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.collection_source_configs (
  source_import_id text PRIMARY KEY
    REFERENCES public.imports(id) ON DELETE CASCADE ON UPDATE CASCADE,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  cycle_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  compatibility_status text NOT NULL DEFAULT 'incompatible',
  compatibility_issues text[] NOT NULL DEFAULT ARRAY[]::text[],
  indexed_row_count integer NOT NULL DEFAULT 0,
  configured_by text NOT NULL
    REFERENCES public.users(username) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_collection_source_configs_validity CHECK (valid_from <= valid_to),
  CONSTRAINT chk_collection_source_configs_compatibility
    CHECK (compatibility_status IN ('compatible', 'incompatible')),
  CONSTRAINT chk_collection_source_configs_indexed_row_count CHECK (indexed_row_count >= 0),
  CONSTRAINT chk_collection_source_configs_enabled_compatibility
    CHECK (enabled = false OR compatibility_status = 'compatible')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_source_configs_enabled_validity
ON public.collection_source_configs(enabled, valid_from, valid_to);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_source_configs_cycle_key
ON public.collection_source_configs(cycle_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.collection_source_rows (
  source_import_id text NOT NULL
    REFERENCES public.imports(id) ON DELETE CASCADE ON UPDATE CASCADE,
  source_data_row_id text NOT NULL
    REFERENCES public.data_rows(id) ON DELETE CASCADE ON UPDATE CASCADE,
  account_number_hash text,
  card_number_hash text,
  card_number_last4 text,
  canonical_obligation_key text NOT NULL,
  total_due numeric(14,2) NOT NULL,
  billing_principal_osp numeric(14,2) NOT NULL,
  total_osb numeric(14,2),
  aging_bucket text NOT NULL,
  calling_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pk_collection_source_rows PRIMARY KEY (source_import_id, source_data_row_id),
  CONSTRAINT chk_collection_source_rows_identifier
    CHECK (account_number_hash IS NOT NULL OR card_number_hash IS NOT NULL),
  CONSTRAINT chk_collection_source_rows_aging CHECK (aging_bucket IN ('D3', 'D4', 'D5', 'D6')),
  CONSTRAINT chk_collection_source_rows_account_hash
    CHECK (account_number_hash IS NULL OR char_length(account_number_hash) = 64),
  CONSTRAINT chk_collection_source_rows_card_hash
    CHECK (card_number_hash IS NULL OR char_length(card_number_hash) = 64),
  CONSTRAINT chk_collection_source_rows_card_last4
    CHECK (card_number_last4 IS NULL OR char_length(card_number_last4) <= 4),
  CONSTRAINT chk_collection_source_rows_money
    CHECK (total_due > 0 AND billing_principal_osp >= 0 AND (total_osb IS NULL OR total_osb >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_source_rows_data_row_unique
ON public.collection_source_rows(source_data_row_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_source_rows_account_lookup
ON public.collection_source_rows(source_import_id, account_number_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_source_rows_card_lookup
ON public.collection_source_rows(source_import_id, card_number_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_source_rows_aging
ON public.collection_source_rows(source_import_id, aging_bucket);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_source_rows_obligation
ON public.collection_source_rows(canonical_obligation_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.collection_osp_targets (
  id uuid PRIMARY KEY,
  source_scope_hash text NOT NULL,
  source_import_ids text[] NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  aging_bucket text NOT NULL,
  total_osp_baseline numeric(16,2),
  target_percentage numeric(7,4) NOT NULL,
  configured_by text NOT NULL
    REFERENCES public.users(username) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_collection_osp_targets_period CHECK (period_from <= period_to),
  CONSTRAINT chk_collection_osp_targets_aging CHECK (aging_bucket IN ('D3', 'D4', 'D5', 'D6')),
  CONSTRAINT chk_collection_osp_targets_percentage
    CHECK (target_percentage >= 0 AND target_percentage <= 100),
  CONSTRAINT chk_collection_osp_targets_source_count
    CHECK (cardinality(source_import_ids) BETWEEN 1 AND 5),
  CONSTRAINT chk_collection_osp_targets_baseline
    CHECK (total_osp_baseline IS NULL OR total_osp_baseline >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_osp_targets_scope_period_aging_unique
ON public.collection_osp_targets(source_scope_hash, period_from, period_to, aging_bucket);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_osp_targets_period
ON public.collection_osp_targets(period_from, period_to);
--> statement-breakpoint
COMMENT ON TABLE public.collection_source_configs IS
'Superuser-governed Saved imports eligible for backend Collection matching.';
--> statement-breakpoint
COMMENT ON TABLE public.collection_source_rows IS
'Bounded normalized matching index; identifiers are stored only as deterministic hashes.';
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.settlement_cycle_key IS
'Non-PII canonical obligation and configured cycle key used for deterministic CP/ABORT ordering.';
