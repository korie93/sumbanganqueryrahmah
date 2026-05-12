import { sql } from "drizzle-orm";
import {
  executeBootstrapStatements,
  type BootstrapSqlExecutor,
} from "./collection-bootstrap-records-shared";
import {
  backfillLegacyCollectionReceipts,
  syncCollectionReceiptValidation,
} from "./collection-bootstrap-record-schema-receipts";

export async function ensureCollectionReceiptSchema(database: BootstrapSqlExecutor): Promise<void> {
  await executeBootstrapStatements(database, [
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_record_receipts (
        id uuid PRIMARY KEY,
        collection_record_id uuid NOT NULL,
        storage_path text NOT NULL,
        original_file_name text NOT NULL,
        original_mime_type text NOT NULL,
        original_extension text NOT NULL DEFAULT '',
        file_size bigint NOT NULL DEFAULT 0,
        receipt_amount bigint,
        extracted_amount bigint,
        extraction_status text NOT NULL DEFAULT 'unprocessed',
        extraction_confidence numeric(5,4),
        receipt_date date,
        receipt_reference text,
        file_hash text,
        deleted_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS collection_record_id uuid`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS storage_path text`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_file_name text`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_mime_type text`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_extension text DEFAULT ''`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS file_size bigint DEFAULT 0`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS receipt_amount bigint`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS extracted_amount bigint`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS extraction_status text DEFAULT 'unprocessed'`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS extraction_confidence numeric(5,4)`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS receipt_date date`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS receipt_reference text`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS file_hash text`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone`,
    sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`,
    sql`
      UPDATE public.collection_record_receipts
      SET
        original_file_name = COALESCE(NULLIF(trim(COALESCE(original_file_name, '')), ''), 'receipt'),
        original_mime_type = COALESCE(NULLIF(trim(COALESCE(original_mime_type, '')), ''), 'application/octet-stream'),
        original_extension = COALESCE(NULLIF(trim(COALESCE(original_extension, '')), ''), ''),
        file_size = COALESCE(file_size, 0),
        extraction_status = COALESCE(NULLIF(trim(COALESCE(extraction_status, '')), ''), 'unprocessed'),
        created_at = COALESCE(created_at, now())
    `,
    sql`
      UPDATE public.collection_record_receipts
      SET extracted_amount = receipt_amount
      WHERE extraction_status = 'suggested'
        AND extracted_amount IS NULL
        AND receipt_amount IS NOT NULL
    `,
    sql`
      UPDATE public.collection_record_receipts
      SET extraction_status = 'unprocessed'
      WHERE extraction_status = 'suggested'
        AND extracted_amount IS NULL
    `,
    sql`DELETE FROM public.collection_record_receipts WHERE collection_record_id IS NULL OR trim(COALESCE(storage_path, '')) = ''`,
    sql`
      DELETE FROM public.collection_record_receipts receipt
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.collection_records record
        WHERE record.id = receipt.collection_record_id
      )
    `,
    sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_collection_record_receipts_record_id'
        ) THEN
          ALTER TABLE public.collection_record_receipts
          ADD CONSTRAINT fk_collection_record_receipts_record_id
          FOREIGN KEY (collection_record_id)
          REFERENCES public.collection_records(id)
          ON UPDATE CASCADE
          ON DELETE CASCADE;
        END IF;
      END $$;
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_receipts_record_storage_unique
      ON public.collection_record_receipts (collection_record_id, storage_path)
    `,
    sql`DROP INDEX IF EXISTS idx_collection_record_receipts_record_file_hash_unique`,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_receipts_record_file_hash_unique
      ON public.collection_record_receipts (collection_record_id, file_hash)
      WHERE file_hash IS NOT NULL AND deleted_at IS NULL
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_record_receipts_file_hash
      ON public.collection_record_receipts (file_hash)
      WHERE file_hash IS NOT NULL
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_record_receipts_extraction_status
      ON public.collection_record_receipts (extraction_status)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_record_receipts_receipt_date
      ON public.collection_record_receipts (receipt_date)
      WHERE receipt_date IS NOT NULL
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_record_receipts_record_created_at
      ON public.collection_record_receipts (collection_record_id, created_at ASC)
    `,
    sql`
      COMMENT ON COLUMN public.collection_record_receipts.receipt_amount
      IS 'Stored in sen/cents as a bigint integer when receipt totals are extracted or confirmed.'
    `,
    sql`
      COMMENT ON COLUMN public.collection_record_receipts.extracted_amount
      IS 'Stored in sen/cents as a bigint integer when OCR extraction returns a candidate amount.'
    `,
    sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_collection_record_receipts_suggested_extracted_amount'
        ) THEN
          ALTER TABLE public.collection_record_receipts
          ADD CONSTRAINT chk_collection_record_receipts_suggested_extracted_amount
          CHECK (extraction_status <> 'suggested' OR extracted_amount IS NOT NULL);
        END IF;
      END $$;
    `,
  ]);

  await backfillLegacyCollectionReceipts(database);
  await syncCollectionReceiptValidation(database);
}
