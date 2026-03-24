import { randomUUID } from "crypto";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";

function inferMimeTypeFromReceiptPath(receiptPath: string): string {
  const extension = path.extname(String(receiptPath || "").trim()).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

export async function ensureCollectionRecordsTables(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.collection_records (
      id uuid PRIMARY KEY,
      customer_name text NOT NULL,
      ic_number text NOT NULL,
      customer_phone text NOT NULL,
      account_number text NOT NULL,
      batch text NOT NULL,
      payment_date date NOT NULL,
      amount numeric(14,2) NOT NULL,
      receipt_file text,
      created_by_login text NOT NULL,
      collection_staff_nickname text NOT NULL,
      staff_username text NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name text`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number text`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone text`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number text`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS batch text`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS payment_date date`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS amount numeric(14,2)`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_file text`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_by_login text`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS collection_staff_nickname text`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS staff_username text`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
  await db.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
  await db.execute(sql`
    UPDATE public.collection_records
    SET customer_phone = COALESCE(NULLIF(customer_phone, ''), '-')
  `);
  await db.execute(sql`
    UPDATE public.collection_records
    SET created_by_login = COALESCE(NULLIF(created_by_login, ''), NULLIF(staff_username, ''), 'unknown')
  `);
  await db.execute(sql`
    UPDATE public.collection_records
    SET collection_staff_nickname = COALESCE(NULLIF(collection_staff_nickname, ''), NULLIF(staff_username, ''), NULLIF(created_by_login, ''), 'unknown')
  `);
  await db.execute(sql`
    UPDATE public.collection_records
    SET staff_username = COALESCE(NULLIF(staff_username, ''), NULLIF(collection_staff_nickname, ''), NULLIF(created_by_login, ''), 'unknown')
  `);
  await db.execute(sql`
    UPDATE public.collection_records
    SET updated_at = COALESCE(updated_at, created_at, now())
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_payment_date ON public.collection_records(payment_date)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_at ON public.collection_records(created_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_username ON public.collection_records(staff_username)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_login ON public.collection_records(created_by_login)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_nickname ON public.collection_records(collection_staff_nickname)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_phone ON public.collection_records(customer_phone)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.collection_record_receipts (
      id uuid PRIMARY KEY,
      collection_record_id uuid NOT NULL,
      storage_path text NOT NULL,
      original_file_name text NOT NULL,
      original_mime_type text NOT NULL,
      original_extension text NOT NULL DEFAULT '',
      file_size bigint NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS collection_record_id uuid`);
  await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS storage_path text`);
  await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_file_name text`);
  await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_mime_type text`);
  await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_extension text DEFAULT ''`);
  await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS file_size bigint DEFAULT 0`);
  await db.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
  await db.execute(sql`
    UPDATE public.collection_record_receipts
    SET
      original_file_name = COALESCE(NULLIF(trim(COALESCE(original_file_name, '')), ''), 'receipt'),
      original_mime_type = COALESCE(NULLIF(trim(COALESCE(original_mime_type, '')), ''), 'application/octet-stream'),
      original_extension = COALESCE(NULLIF(trim(COALESCE(original_extension, '')), ''), ''),
      file_size = COALESCE(file_size, 0),
      created_at = COALESCE(created_at, now())
  `);
  await db.execute(sql`DELETE FROM public.collection_record_receipts WHERE collection_record_id IS NULL OR trim(COALESCE(storage_path, '')) = ''`);
  await db.execute(sql`
    DELETE FROM public.collection_record_receipts receipt
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.collection_records record
      WHERE record.id = receipt.collection_record_id
    )
  `);
  await db.execute(sql`
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
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_receipts_record_storage_unique
    ON public.collection_record_receipts (collection_record_id, storage_path)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_record_receipts_record_created_at
    ON public.collection_record_receipts (collection_record_id, created_at ASC)
  `);

  const legacyReceiptRows = await db.execute(sql`
    SELECT
      id,
      receipt_file,
      created_at
    FROM public.collection_records cr
    WHERE trim(COALESCE(cr.receipt_file, '')) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM public.collection_record_receipts crr
        WHERE crr.collection_record_id = cr.id
          AND crr.storage_path = cr.receipt_file
      )
    LIMIT 10000
  `);

  for (const row of legacyReceiptRows.rows as Array<{ id?: string; receipt_file?: string; created_at?: Date | string }>) {
    const collectionRecordId = String(row.id || "").trim();
    const storagePath = String(row.receipt_file || "").trim();
    if (!collectionRecordId || !storagePath) continue;
    const fileName = path.basename(storagePath);
    const createdAt = row.created_at ? new Date(row.created_at) : new Date();
    const extension = path.extname(fileName).toLowerCase();
    await db.execute(sql`
      INSERT INTO public.collection_record_receipts (
        id,
        collection_record_id,
        storage_path,
        original_file_name,
        original_mime_type,
        original_extension,
        file_size,
        created_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${collectionRecordId}::uuid,
        ${storagePath},
        ${fileName || "receipt"},
        ${inferMimeTypeFromReceiptPath(storagePath)},
        ${extension},
        0,
        ${createdAt}
      )
      ON CONFLICT (collection_record_id, storage_path) DO NOTHING
    `);
  }
}
