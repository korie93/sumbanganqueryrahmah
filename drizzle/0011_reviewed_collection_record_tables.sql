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
);

ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number text;
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS batch text;
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS amount numeric(14,2);
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_file text;
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_by_login text;
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS collection_staff_nickname text;
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS staff_username text;
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

UPDATE public.collection_records
SET
  customer_phone = COALESCE(NULLIF(customer_phone, ''), '-'),
  created_by_login = COALESCE(NULLIF(created_by_login, ''), NULLIF(staff_username, ''), 'unknown'),
  collection_staff_nickname = COALESCE(
    NULLIF(collection_staff_nickname, ''),
    NULLIF(staff_username, ''),
    NULLIF(created_by_login, ''),
    'unknown'
  ),
  staff_username = COALESCE(
    NULLIF(staff_username, ''),
    NULLIF(collection_staff_nickname, ''),
    NULLIF(created_by_login, ''),
    'unknown'
  ),
  updated_at = COALESCE(updated_at, created_at, now());

CREATE INDEX IF NOT EXISTS idx_collection_records_payment_date
ON public.collection_records(payment_date);

CREATE INDEX IF NOT EXISTS idx_collection_records_created_at
ON public.collection_records(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_records_staff_username
ON public.collection_records(staff_username);

CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_login
ON public.collection_records(created_by_login);

CREATE INDEX IF NOT EXISTS idx_collection_records_staff_nickname
ON public.collection_records(collection_staff_nickname);

CREATE INDEX IF NOT EXISTS idx_collection_records_customer_phone
ON public.collection_records(customer_phone);

CREATE INDEX IF NOT EXISTS idx_collection_records_payment_created_id
ON public.collection_records(payment_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_payment_created_id
ON public.collection_records(created_by_login, payment_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_collection_records_lower_staff_nickname_payment_created_id
ON public.collection_records((lower(collection_staff_nickname)), payment_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_collection_records_lower_created_by_payment_created_id
ON public.collection_records((lower(created_by_login)), payment_date, created_at, id);

CREATE TABLE IF NOT EXISTS public.collection_record_receipts (
  id uuid PRIMARY KEY,
  collection_record_id uuid NOT NULL,
  storage_path text NOT NULL,
  original_file_name text NOT NULL,
  original_mime_type text NOT NULL,
  original_extension text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS collection_record_id uuid;
ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_file_name text;
ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_mime_type text;
ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS original_extension text DEFAULT '';
ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS file_size bigint DEFAULT 0;
ALTER TABLE public.collection_record_receipts ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

UPDATE public.collection_record_receipts
SET
  original_file_name = COALESCE(NULLIF(trim(COALESCE(original_file_name, '')), ''), 'receipt'),
  original_mime_type = COALESCE(NULLIF(trim(COALESCE(original_mime_type, '')), ''), 'application/octet-stream'),
  original_extension = COALESCE(NULLIF(trim(COALESCE(original_extension, '')), ''), ''),
  file_size = COALESCE(file_size, 0),
  created_at = COALESCE(created_at, now());

DELETE FROM public.collection_record_receipts
WHERE collection_record_id IS NULL
  OR trim(COALESCE(storage_path, '')) = '';

DELETE FROM public.collection_record_receipts receipt
WHERE NOT EXISTS (
  SELECT 1
  FROM public.collection_records record
  WHERE record.id = receipt.collection_record_id
);

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
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_receipts_record_storage_unique
ON public.collection_record_receipts(collection_record_id, storage_path);

CREATE INDEX IF NOT EXISTS idx_collection_record_receipts_record_created_at
ON public.collection_record_receipts(collection_record_id, created_at ASC);

WITH legacy_receipts AS (
  SELECT
    cr.id AS collection_record_id,
    trim(cr.receipt_file) AS storage_path,
    COALESCE(cr.created_at, now()) AS created_at,
    md5(cr.id::text || trim(cr.receipt_file) || clock_timestamp()::text || random()::text) AS receipt_hash
  FROM public.collection_records cr
  WHERE trim(COALESCE(cr.receipt_file, '')) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM public.collection_record_receipts crr
      WHERE crr.collection_record_id = cr.id
        AND crr.storage_path = trim(cr.receipt_file)
    )
)
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
SELECT
  (
    substr(receipt_hash, 1, 8) || '-' ||
    substr(receipt_hash, 9, 4) || '-' ||
    substr(receipt_hash, 13, 4) || '-' ||
    substr(receipt_hash, 17, 4) || '-' ||
    substr(receipt_hash, 21, 12)
  )::uuid,
  collection_record_id,
  storage_path,
  COALESCE(NULLIF(regexp_replace(storage_path, '^.*[\\/]', ''), ''), 'receipt'),
  CASE
    WHEN lower(storage_path) ~ '\.pdf$' THEN 'application/pdf'
    WHEN lower(storage_path) ~ '\.png$' THEN 'image/png'
    WHEN lower(storage_path) ~ '\.jpe?g$' THEN 'image/jpeg'
    WHEN lower(storage_path) ~ '\.webp$' THEN 'image/webp'
    ELSE 'application/octet-stream'
  END,
  COALESCE((regexp_match(lower(regexp_replace(storage_path, '^.*[\\/]', '')), '(\.[a-z0-9]+)$'))[1], ''),
  0,
  created_at
FROM legacy_receipts
ON CONFLICT (collection_record_id, storage_path) DO NOTHING;
