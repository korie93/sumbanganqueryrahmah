ALTER TABLE "collection_records" ADD COLUMN IF NOT EXISTS "customer_name_search_hash" text;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN IF NOT EXISTS "ic_number_search_hash" text;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN IF NOT EXISTS "customer_phone_search_hash" text;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN IF NOT EXISTS "account_number_search_hash" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collection_records_customer_name_search_hash" ON "collection_records" USING btree ("customer_name_search_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collection_records_ic_number_search_hash" ON "collection_records" USING btree ("ic_number_search_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collection_records_customer_phone_search_hash" ON "collection_records" USING btree ("customer_phone_search_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collection_records_account_number_search_hash" ON "collection_records" USING btree ("account_number_search_hash");
