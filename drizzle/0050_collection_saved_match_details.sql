ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS aging_bucket text;
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS total_due numeric(14, 2);
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS billing_principal_osp numeric(14, 2);
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS source_match_basis text;
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS source_match_accuracy integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_collection_records_aging_bucket'
      AND conrelid = 'public.collection_records'::regclass
  ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT chk_collection_records_aging_bucket
    CHECK (aging_bucket IS NULL OR aging_bucket IN ('D3', 'D4', 'D5', 'D6'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_collection_records_source_match_basis'
      AND conrelid = 'public.collection_records'::regclass
  ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT chk_collection_records_source_match_basis
    CHECK (source_match_basis IS NULL OR source_match_basis IN ('ic', 'phone_and_account'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_collection_records_source_match_accuracy'
      AND conrelid = 'public.collection_records'::regclass
  ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT chk_collection_records_source_match_accuracy
    CHECK (
      source_match_accuracy IS NULL
      OR (source_match_accuracy >= 0 AND source_match_accuracy <= 100)
    );
  END IF;
END $$;
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.total_due IS
'Server-derived TOTAL DUE snapshot from the verified Saved source row.';
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.billing_principal_osp IS
'Server-derived Billing Principal (OSP) snapshot from the verified Saved source row.';
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.source_match_accuracy IS
'Percentage of comparable identity fields that matched the verified Saved source row.';
