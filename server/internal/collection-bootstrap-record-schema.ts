import { sql } from "drizzle-orm";
import {
  executeBootstrapStatements,
  type BootstrapSqlExecutor,
} from "./collection-bootstrap-records-shared";
import {
  backfillCollectionRecordEncryptedPii,
  backfillCollectionRecordPiiSearchHashes,
} from "./collection-bootstrap-record-schema-pii";
import {
  backfillLegacyCollectionReceipts,
  syncCollectionReceiptValidation,
} from "./collection-bootstrap-record-schema-receipts";

export async function ensureCollectionRecordBaseSchema(database: BootstrapSqlExecutor): Promise<void> {
  await executeBootstrapStatements(database, [
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_records (
        id uuid PRIMARY KEY,
        customer_name text,
        customer_name_encrypted text,
        customer_name_search_hash text,
        customer_name_search_hashes text[],
        ic_number text,
        ic_number_encrypted text,
        ic_number_search_hash text,
        customer_phone text,
        customer_phone_encrypted text,
        customer_phone_search_hash text,
        account_number text,
        account_number_encrypted text,
        account_number_search_hash text,
        batch text NOT NULL,
        payment_date date NOT NULL,
        amount numeric(14,2) NOT NULL,
        receipt_file text,
        receipt_total_amount bigint NOT NULL DEFAULT 0,
        receipt_validation_status text NOT NULL DEFAULT 'needs_review',
        receipt_validation_message text,
        receipt_count integer NOT NULL DEFAULT 0,
        duplicate_receipt_flag boolean NOT NULL DEFAULT false,
        created_by_login text NOT NULL,
        collection_staff_nickname text NOT NULL,
        staff_username text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name_encrypted text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name_search_hash text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name_search_hashes text[]`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number_encrypted text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number_search_hash text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone_encrypted text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone_search_hash text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number_encrypted text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number_search_hash text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS batch text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS payment_date date`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS amount numeric(14,2)`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_file text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_total_amount bigint DEFAULT 0`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_validation_status text DEFAULT 'needs_review'`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_validation_message text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_count integer DEFAULT 0`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS duplicate_receipt_flag boolean DEFAULT false`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_by_login text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS collection_staff_nickname text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS staff_username text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`,
    sql`ALTER TABLE public.collection_records ALTER COLUMN customer_name DROP NOT NULL`,
    sql`ALTER TABLE public.collection_records ALTER COLUMN ic_number DROP NOT NULL`,
    sql`ALTER TABLE public.collection_records ALTER COLUMN customer_phone DROP NOT NULL`,
    sql`ALTER TABLE public.collection_records ALTER COLUMN account_number DROP NOT NULL`,
    sql`
      UPDATE public.collection_records
      SET
        customer_name = NULLIF(trim(COALESCE(customer_name, '')), ''),
        ic_number = NULLIF(trim(COALESCE(ic_number, '')), ''),
        customer_phone = CASE
          WHEN trim(COALESCE(customer_phone, '')) IN ('', '-') THEN NULL
          ELSE trim(customer_phone)
        END,
        account_number = NULLIF(trim(COALESCE(account_number, '')), '')
    `,
    sql`
      UPDATE public.collection_records
      SET created_by_login = COALESCE(NULLIF(created_by_login, ''), NULLIF(staff_username, ''), 'unknown')
    `,
    sql`
      UPDATE public.collection_records
      SET collection_staff_nickname = COALESCE(NULLIF(collection_staff_nickname, ''), NULLIF(staff_username, ''), NULLIF(created_by_login, ''), 'unknown')
    `,
    sql`
      UPDATE public.collection_records
      SET staff_username = COALESCE(NULLIF(staff_username, ''), NULLIF(collection_staff_nickname, ''), NULLIF(created_by_login, ''), 'unknown')
    `,
    sql`UPDATE public.collection_records SET updated_at = COALESCE(updated_at, created_at, now())`,
    sql`
      UPDATE public.collection_records
      SET
        receipt_total_amount = COALESCE(receipt_total_amount, 0),
        receipt_validation_status = COALESCE(NULLIF(trim(COALESCE(receipt_validation_status, '')), ''), 'needs_review'),
        receipt_count = COALESCE(receipt_count, 0),
        duplicate_receipt_flag = COALESCE(duplicate_receipt_flag, false)
    `,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_payment_date ON public.collection_records(payment_date)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_at ON public.collection_records(created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_username ON public.collection_records(staff_username)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_login ON public.collection_records(created_by_login)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_nickname ON public.collection_records(collection_staff_nickname)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_phone ON public.collection_records(customer_phone)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_name_search_hash ON public.collection_records(customer_name_search_hash)`,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_customer_name_search_hashes
      ON public.collection_records USING gin (customer_name_search_hashes)
    `,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_ic_number_search_hash ON public.collection_records(ic_number_search_hash)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_phone_search_hash ON public.collection_records(customer_phone_search_hash)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_account_number_search_hash ON public.collection_records(account_number_search_hash)`,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_receipt_validation_status
      ON public.collection_records(receipt_validation_status)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_payment_created_id
      ON public.collection_records(payment_date, created_at, id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_payment_created_id
      ON public.collection_records(created_by_login, payment_date, created_at, id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_lower_staff_nickname_payment_created_id
      ON public.collection_records ((lower(collection_staff_nickname)), payment_date, created_at, id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_lower_created_by_payment_created_id
      ON public.collection_records ((lower(created_by_login)), payment_date, created_at, id)
    `,
    sql`
      COMMENT ON COLUMN public.collection_records.amount
      IS 'Stored in MYR as numeric(14,2).'
    `,
    sql`
      COMMENT ON COLUMN public.collection_records.receipt_total_amount
      IS 'Stored in sen/cents as a bigint integer. Divide by 100 to render MYR.'
    `,
  ]);

  await backfillCollectionRecordEncryptedPii(database);
  await backfillCollectionRecordPiiSearchHashes(database);
}

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
  ]);

  await backfillLegacyCollectionReceipts(database);
  await syncCollectionReceiptValidation(database);
}
