import { randomUUID } from "crypto";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";

type BootstrapSqlExecutor = Pick<typeof db, "execute">;

function inferMimeTypeFromReceiptPath(receiptPath: string): string {
  const extension = path.extname(String(receiptPath || "").trim()).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

export async function ensureCollectionRecordsTables(
  database: BootstrapSqlExecutor = db,
): Promise<void> {
  await database.execute(sql`SET search_path TO public`);
  await database.execute(sql`
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
      receipt_total_amount bigint NOT NULL DEFAULT 0,
      receipt_validation_status text NOT NULL DEFAULT 'needs_review',
      receipt_validation_message text,
      receipt_count integer NOT NULL DEFAULT 0,
      duplicate_receipt_flag boolean NOT NULL DEFAULT false,
      created_by_login text NOT NULL,
      collection_staff_nickname text NOT NULL,
      staff_username text NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name text`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number text`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone text`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number text`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS batch text`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS payment_date date`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS amount numeric(14,2)`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_file text`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_total_amount bigint DEFAULT 0`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_validation_status text DEFAULT 'needs_review'`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_validation_message text`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_count integer DEFAULT 0`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS duplicate_receipt_flag boolean DEFAULT false`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_by_login text`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS collection_staff_nickname text`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS staff_username text`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.collection_records
    SET customer_phone = COALESCE(NULLIF(customer_phone, ''), '-')
  `);
  await database.execute(sql`
    UPDATE public.collection_records
    SET created_by_login = COALESCE(NULLIF(created_by_login, ''), NULLIF(staff_username, ''), 'unknown')
  `);
  await database.execute(sql`
    UPDATE public.collection_records
    SET collection_staff_nickname = COALESCE(NULLIF(collection_staff_nickname, ''), NULLIF(staff_username, ''), NULLIF(created_by_login, ''), 'unknown')
  `);
  await database.execute(sql`
    UPDATE public.collection_records
    SET staff_username = COALESCE(NULLIF(staff_username, ''), NULLIF(collection_staff_nickname, ''), NULLIF(created_by_login, ''), 'unknown')
  `);
  await database.execute(sql`
    UPDATE public.collection_records
    SET updated_at = COALESCE(updated_at, created_at, now())
  `);
  await database.execute(sql`
    UPDATE public.collection_records
    SET
      receipt_total_amount = COALESCE(receipt_total_amount, 0),
      receipt_validation_status = COALESCE(NULLIF(trim(COALESCE(receipt_validation_status, '')), ''), 'needs_review'),
      receipt_count = COALESCE(receipt_count, 0),
      duplicate_receipt_flag = COALESCE(duplicate_receipt_flag, false)
  `);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_payment_date ON public.collection_records(payment_date)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_at ON public.collection_records(created_at DESC)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_username ON public.collection_records(staff_username)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_login ON public.collection_records(created_by_login)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_nickname ON public.collection_records(collection_staff_nickname)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_phone ON public.collection_records(customer_phone)`);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_records_payment_created_id
    ON public.collection_records(payment_date, created_at, id)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_payment_created_id
    ON public.collection_records(created_by_login, payment_date, created_at, id)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_records_lower_staff_nickname_payment_created_id
    ON public.collection_records ((lower(collection_staff_nickname)), payment_date, created_at, id)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_records_lower_created_by_payment_created_id
    ON public.collection_records ((lower(created_by_login)), payment_date, created_at, id)
  `);
  await database.execute(sql`
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
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS collection_record_id uuid`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS storage_path text`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_file_name text`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_mime_type text`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_extension text DEFAULT ''`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS file_size bigint DEFAULT 0`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS receipt_amount bigint`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS extracted_amount bigint`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS extraction_status text DEFAULT 'unprocessed'`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS extraction_confidence numeric(5,4)`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS receipt_date date`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS receipt_reference text`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS file_hash text`);
  await database.execute(sql`ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.collection_record_receipts
    SET
      original_file_name = COALESCE(NULLIF(trim(COALESCE(original_file_name, '')), ''), 'receipt'),
      original_mime_type = COALESCE(NULLIF(trim(COALESCE(original_mime_type, '')), ''), 'application/octet-stream'),
      original_extension = COALESCE(NULLIF(trim(COALESCE(original_extension, '')), ''), ''),
      file_size = COALESCE(file_size, 0),
      extraction_status = COALESCE(NULLIF(trim(COALESCE(extraction_status, '')), ''), 'unprocessed'),
      created_at = COALESCE(created_at, now())
  `);
  await database.execute(sql`DELETE FROM public.collection_record_receipts WHERE collection_record_id IS NULL OR trim(COALESCE(storage_path, '')) = ''`);
  await database.execute(sql`
    DELETE FROM public.collection_record_receipts receipt
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.collection_records record
      WHERE record.id = receipt.collection_record_id
    )
  `);
  await database.execute(sql`
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
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_receipts_record_storage_unique
    ON public.collection_record_receipts (collection_record_id, storage_path)
  `);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_receipts_record_file_hash_unique
    ON public.collection_record_receipts (collection_record_id, file_hash)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_record_receipts_file_hash
    ON public.collection_record_receipts (file_hash)
    WHERE file_hash IS NOT NULL
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_record_receipts_record_created_at
    ON public.collection_record_receipts (collection_record_id, created_at ASC)
  `);

  const legacyReceiptRows = await database.execute(sql`
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
    await database.execute(sql`
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

  await database.execute(sql`
    UPDATE public.collection_records record
    SET
      receipt_total_amount = COALESCE(stats.receipt_total_amount, 0),
      receipt_count = COALESCE(stats.receipt_count, 0),
      duplicate_receipt_flag = COALESCE(stats.duplicate_receipt_flag, false),
      receipt_validation_status = CASE
        WHEN COALESCE(stats.receipt_count, 0) = 0 THEN 'unverified'
        WHEN COALESCE(stats.missing_amount_count, 0) > 0 THEN 'unverified'
        WHEN COALESCE(stats.receipt_total_amount, 0) < ROUND(record.amount * 100)::bigint THEN 'underpaid'
        WHEN COALESCE(stats.receipt_total_amount, 0) > ROUND(record.amount * 100)::bigint THEN 'overpaid'
        ELSE 'matched'
      END,
      receipt_validation_message = CASE
        WHEN COALESCE(stats.receipt_count, 0) = 0 THEN 'Tiada resit dilampirkan untuk semakan jumlah.'
        WHEN COALESCE(stats.missing_amount_count, 0) > 0 THEN 'Setiap resit perlu disahkan jumlahnya sebelum rekod boleh disimpan.'
        WHEN COALESCE(stats.receipt_total_amount, 0) < ROUND(record.amount * 100)::bigint THEN 'Jumlah resit lebih rendah daripada jumlah bayaran yang dimasukkan.'
        WHEN COALESCE(stats.receipt_total_amount, 0) > ROUND(record.amount * 100)::bigint THEN 'Jumlah resit melebihi jumlah bayaran yang dimasukkan.'
        ELSE 'Jumlah resit sepadan dengan jumlah bayaran yang dimasukkan.'
      END
    FROM (
      SELECT
        collection_record_id,
        COUNT(*)::int AS receipt_count,
        COALESCE(SUM(receipt_amount), 0)::bigint AS receipt_total_amount,
        COUNT(*) FILTER (WHERE receipt_amount IS NULL)::int AS missing_amount_count,
        COALESCE(BOOL_OR(COALESCE(hash_stats.match_count, 0) > 1), false) AS duplicate_receipt_flag
      FROM public.collection_record_receipts
      LEFT JOIN (
        SELECT file_hash, COUNT(*)::int AS match_count
        FROM public.collection_record_receipts
        WHERE NULLIF(trim(COALESCE(file_hash, '')), '') IS NOT NULL
        GROUP BY file_hash
      ) hash_stats
        ON hash_stats.file_hash = public.collection_record_receipts.file_hash
      GROUP BY collection_record_id
    ) stats
    WHERE record.id = stats.collection_record_id
  `);
  await database.execute(sql`
    UPDATE public.collection_records
    SET
      receipt_total_amount = 0,
      receipt_count = 0,
      duplicate_receipt_flag = false,
      receipt_validation_status = 'unverified',
      receipt_validation_message = 'Tiada resit dilampirkan untuk semakan jumlah.'
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.collection_record_receipts receipt
      WHERE receipt.collection_record_id = public.collection_records.id
    )
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.collection_record_daily_rollups (
      payment_date date NOT NULL,
      created_by_login text NOT NULL,
      collection_staff_nickname text NOT NULL,
      total_records integer NOT NULL DEFAULT 0,
      total_amount numeric(14,2) NOT NULL,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS payment_date date`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS created_by_login text`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS collection_staff_nickname text`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS total_records integer DEFAULT 0`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS total_amount numeric(14,2)`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.collection_record_daily_rollups
    SET
      total_records = COALESCE(total_records, 0),
      total_amount = COALESCE(total_amount, 0),
      updated_at = COALESCE(updated_at, now())
  `);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_slice_unique
    ON public.collection_record_daily_rollups(payment_date, created_by_login, collection_staff_nickname)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_payment_date
    ON public.collection_record_daily_rollups(payment_date)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_created_by_payment_date
    ON public.collection_record_daily_rollups(created_by_login, payment_date)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_record_daily_rollups_lower_nickname_payment_date
    ON public.collection_record_daily_rollups((lower(collection_staff_nickname)), payment_date)
  `);
  await database.execute(sql`
    DELETE FROM public.collection_record_daily_rollups rollup
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.collection_records record
      WHERE record.payment_date = rollup.payment_date
        AND record.created_by_login = rollup.created_by_login
        AND record.collection_staff_nickname = rollup.collection_staff_nickname
    )
  `);
  await database.execute(sql`
    INSERT INTO public.collection_record_daily_rollups (
      payment_date,
      created_by_login,
      collection_staff_nickname,
      total_records,
      total_amount,
      updated_at
    )
    SELECT
      payment_date,
      created_by_login,
      collection_staff_nickname,
      COUNT(*)::int,
      COALESCE(SUM(amount), 0)::numeric(14,2),
      now()
    FROM public.collection_records
    GROUP BY payment_date, created_by_login, collection_staff_nickname
    ON CONFLICT (payment_date, created_by_login, collection_staff_nickname)
    DO UPDATE SET
      total_records = EXCLUDED.total_records,
      total_amount = EXCLUDED.total_amount,
      updated_at = now()
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.collection_record_monthly_rollups (
      year integer NOT NULL,
      month integer NOT NULL,
      created_by_login text NOT NULL,
      collection_staff_nickname text NOT NULL,
      total_records integer NOT NULL DEFAULT 0,
      total_amount numeric(14,2) NOT NULL,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await database.execute(sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS year integer`);
  await database.execute(sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS month integer`);
  await database.execute(sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS created_by_login text`);
  await database.execute(sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS collection_staff_nickname text`);
  await database.execute(sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS total_records integer DEFAULT 0`);
  await database.execute(sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS total_amount numeric(14,2)`);
  await database.execute(sql`ALTER TABLE public.collection_record_monthly_rollups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.collection_record_monthly_rollups
    SET
      total_records = COALESCE(total_records, 0),
      total_amount = COALESCE(total_amount, 0),
      updated_at = COALESCE(updated_at, now())
  `);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_slice_unique
    ON public.collection_record_monthly_rollups(year, month, created_by_login, collection_staff_nickname)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_year_month
    ON public.collection_record_monthly_rollups(year, month)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_created_by_year_month
    ON public.collection_record_monthly_rollups(created_by_login, year, month)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_record_monthly_rollups_lower_nickname_year_month
    ON public.collection_record_monthly_rollups((lower(collection_staff_nickname)), year, month)
  `);
  await database.execute(sql`
    DELETE FROM public.collection_record_monthly_rollups rollup
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.collection_record_daily_rollups daily
      WHERE daily.created_by_login = rollup.created_by_login
        AND daily.collection_staff_nickname = rollup.collection_staff_nickname
        AND EXTRACT(YEAR FROM daily.payment_date)::int = rollup.year
        AND EXTRACT(MONTH FROM daily.payment_date)::int = rollup.month
    )
  `);
  await database.execute(sql`
    INSERT INTO public.collection_record_monthly_rollups (
      year,
      month,
      created_by_login,
      collection_staff_nickname,
      total_records,
      total_amount,
      updated_at
    )
    SELECT
      EXTRACT(YEAR FROM payment_date)::int AS year,
      EXTRACT(MONTH FROM payment_date)::int AS month,
      created_by_login,
      collection_staff_nickname,
      COALESCE(SUM(total_records), 0)::int,
      COALESCE(SUM(total_amount), 0)::numeric(14,2),
      now()
    FROM public.collection_record_daily_rollups
    GROUP BY 1, 2, 3, 4
    ON CONFLICT (year, month, created_by_login, collection_staff_nickname)
    DO UPDATE SET
      total_records = EXCLUDED.total_records,
      total_amount = EXCLUDED.total_amount,
      updated_at = now()
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.collection_record_daily_rollup_refresh_queue (
      payment_date date NOT NULL,
      created_by_login text NOT NULL,
      collection_staff_nickname text NOT NULL,
      status text NOT NULL DEFAULT 'queued',
      requested_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      next_attempt_at timestamp NOT NULL DEFAULT now(),
      attempt_count integer NOT NULL DEFAULT 0,
      last_error text
    )
  `);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS payment_date date`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS created_by_login text`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS collection_staff_nickname text`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued'`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS requested_at timestamp DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS next_attempt_at timestamp DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0`);
  await database.execute(sql`ALTER TABLE public.collection_record_daily_rollup_refresh_queue ADD COLUMN IF NOT EXISTS last_error text`);
  await database.execute(sql`
    UPDATE public.collection_record_daily_rollup_refresh_queue
    SET
      status = COALESCE(NULLIF(status, ''), 'queued'),
      requested_at = COALESCE(requested_at, now()),
      updated_at = COALESCE(updated_at, requested_at, now()),
      next_attempt_at = COALESCE(next_attempt_at, updated_at, requested_at, now()),
      attempt_count = COALESCE(attempt_count, 0)
  `);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_slice_unique
    ON public.collection_record_daily_rollup_refresh_queue(payment_date, created_by_login, collection_staff_nickname)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_status_next_attempt
    ON public.collection_record_daily_rollup_refresh_queue(status, next_attempt_at)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_updated_at
    ON public.collection_record_daily_rollup_refresh_queue(updated_at DESC)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_rollup_refresh_queue_lower_nickname_payment_date
    ON public.collection_record_daily_rollup_refresh_queue((lower(collection_staff_nickname)), payment_date)
  `);
}
