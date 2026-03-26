ALTER TABLE "collection_record_receipts" ADD COLUMN "receipt_amount" bigint;--> statement-breakpoint
ALTER TABLE "collection_record_receipts" ADD COLUMN "extracted_amount" bigint;--> statement-breakpoint
ALTER TABLE "collection_record_receipts" ADD COLUMN "extraction_confidence" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "collection_record_receipts" ADD COLUMN "receipt_date" date;--> statement-breakpoint
ALTER TABLE "collection_record_receipts" ADD COLUMN "receipt_reference" text;--> statement-breakpoint
ALTER TABLE "collection_record_receipts" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN "receipt_total_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN "receipt_validation_status" text DEFAULT 'needs_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN "receipt_validation_message" text;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN "receipt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_collection_record_receipts_record_file_hash_unique" ON "collection_record_receipts" USING btree ("collection_record_id","file_hash");