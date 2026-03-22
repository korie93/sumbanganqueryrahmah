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
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_record_receipts_record_storage_unique
  ON public.collection_record_receipts(collection_record_id, storage_path);

CREATE INDEX IF NOT EXISTS idx_collection_record_receipts_record_created_at
  ON public.collection_record_receipts(collection_record_id, created_at ASC);
