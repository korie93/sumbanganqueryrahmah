-- Preserve the canonical logical-account identity when a Collection row moves
-- to minimal purge history. This lets General Search return complete history
-- across source-file replacements without retaining plaintext customer PII.
ALTER TABLE public.collection_record_purge_history
ADD COLUMN IF NOT EXISTS source_obligation_key text;
--> statement-breakpoint
UPDATE public.collection_record_purge_history history
SET source_obligation_key = source_row.canonical_obligation_key
FROM public.collection_source_rows source_row
WHERE history.source_obligation_key IS NULL
  AND history.source_import_id = source_row.source_import_id
  AND history.source_data_row_id = source_row.source_data_row_id
  AND source_row.canonical_obligation_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_record_purge_history_obligation_order
ON public.collection_record_purge_history(
  source_obligation_key,
  payment_date DESC,
  original_created_at DESC,
  original_record_id DESC
)
WHERE source_obligation_key IS NOT NULL;
--> statement-breakpoint
COMMENT ON COLUMN public.collection_record_purge_history.source_obligation_key IS
  'Opaque canonical logical-account identity retained for exact cross-import Collection history; contains no plaintext PII.';
