ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS source_data_row_id text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_records_source_data_row_id
ON public.collection_records(source_data_row_id);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.data_rows') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_collection_records_source_data_row_id'
        AND conrelid = 'public.collection_records'::regclass
        AND contype = 'f'
    ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT fk_collection_records_source_data_row_id
    FOREIGN KEY (source_data_row_id)
    REFERENCES public.data_rows(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.source_data_row_id
IS 'Server-resolved link to the exact active Saved data row used for collection provenance.';
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.source_import_id
IS 'Server-resolved Saved import link retained with immutable display-name and filename snapshots.';
