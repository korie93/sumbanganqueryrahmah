ALTER TABLE "collection_records" ADD COLUMN IF NOT EXISTS "customer_name_search_hashes" text[];--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collection_records_customer_name_search_hashes" ON "collection_records" USING gin ("customer_name_search_hashes");
