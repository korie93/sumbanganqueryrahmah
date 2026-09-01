ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS calling_date date;
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS calling_window_end_exclusive date;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_collection_records_calling_window'
      AND conrelid = 'public.collection_records'::regclass
  ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT chk_collection_records_calling_window
    CHECK (
      (calling_date IS NULL AND calling_window_end_exclusive IS NULL)
      OR (
        calling_date IS NOT NULL
        AND calling_window_end_exclusive = (calling_date + INTERVAL '1 month')::date
      )
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_records_source_settlement_window
ON public.collection_records(source_import_id, source_data_row_id, payment_date);
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.calling_date IS
'Trusted Calling Date snapshot from the exact matched Saved source row.';
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.calling_window_end_exclusive IS
'Exclusive end of the one-calendar-month settlement window derived from Calling Date.';
