ALTER TABLE "collection_records" ADD COLUMN IF NOT EXISTS "customer_name_encrypted" text;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN IF NOT EXISTS "ic_number_encrypted" text;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN IF NOT EXISTS "customer_phone_encrypted" text;--> statement-breakpoint
ALTER TABLE "collection_records" ADD COLUMN IF NOT EXISTS "account_number_encrypted" text;
