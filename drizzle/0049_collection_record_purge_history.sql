CREATE TABLE IF NOT EXISTS public.collection_record_purge_history (
  original_record_id uuid PRIMARY KEY,
  source_import_id text,
  source_data_row_id text,
  source_import_name text,
  source_filename text,
  ic_number_search_hash text,
  customer_phone_search_hash text,
  account_number_search_hash text,
  payment_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  created_by_login text NOT NULL,
  collection_staff_nickname text NOT NULL,
  original_created_at timestamp with time zone NOT NULL,
  purged_at timestamp with time zone NOT NULL DEFAULT now(),
  purged_by text NOT NULL,
  purge_reason text NOT NULL DEFAULT 'retention_policy',
  CONSTRAINT chk_collection_record_purge_history_reason
    CHECK (purge_reason IN ('retention_policy'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_record_purge_history_source_import_id
ON public.collection_record_purge_history(source_import_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_record_purge_history_source_data_row_id
ON public.collection_record_purge_history(source_data_row_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_record_purge_history_ic_search_hash
ON public.collection_record_purge_history(ic_number_search_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_record_purge_history_phone_search_hash
ON public.collection_record_purge_history(customer_phone_search_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_record_purge_history_account_search_hash
ON public.collection_record_purge_history(account_number_search_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_record_purge_history_created_by
ON public.collection_record_purge_history(created_by_login);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_record_purge_history_nickname_lower
ON public.collection_record_purge_history(lower(collection_staff_nickname));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collection_record_purge_history_purged_at
ON public.collection_record_purge_history(purged_at DESC);
--> statement-breakpoint
COMMENT ON TABLE public.collection_record_purge_history IS
'Minimal audit history without plaintext customer PII retained when old collection records are purged.';
