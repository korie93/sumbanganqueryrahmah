ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS source_import_id text;
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS source_import_name text;
--> statement-breakpoint
ALTER TABLE public.collection_records
ADD COLUMN IF NOT EXISTS source_filename text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_records_source_import_id
ON public.collection_records(source_import_id);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.imports') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_collection_records_source_import_id'
        AND conrelid = 'public.collection_records'::regclass
        AND contype = 'f'
    ) THEN
    ALTER TABLE public.collection_records
    ADD CONSTRAINT fk_collection_records_source_import_id
    FOREIGN KEY (source_import_id)
    REFERENCES public.imports(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.source_import_id
IS 'Active Saved import selected when the collection record was created.';
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.source_import_name
IS 'Immutable display-name snapshot of the selected Saved import.';
--> statement-breakpoint
COMMENT ON COLUMN public.collection_records.source_filename
IS 'Immutable original filename snapshot of the selected Saved import.';
