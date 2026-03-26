ALTER TABLE "collection_record_receipts" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
DROP INDEX IF EXISTS "idx_collection_record_receipts_record_file_hash_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_collection_record_receipts_record_file_hash_unique" ON "collection_record_receipts" USING btree ("collection_record_id","file_hash") WHERE "file_hash" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_collection_record_receipts_record_active_created_at" ON "collection_record_receipts" USING btree ("collection_record_id","created_at") WHERE "deleted_at" IS NULL;
