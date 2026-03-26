ALTER TABLE "collection_record_receipts" ADD COLUMN "extraction_status" text DEFAULT 'unprocessed' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN "duplicate_receipt_flag" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_collection_record_receipts_file_hash" ON "collection_record_receipts" USING btree ("file_hash");