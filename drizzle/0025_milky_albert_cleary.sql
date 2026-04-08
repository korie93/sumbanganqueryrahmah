ALTER TABLE "setting_options" DROP CONSTRAINT IF EXISTS "setting_options_setting_id_system_settings_id_fk";
--> statement-breakpoint
ALTER TABLE "setting_options" DROP CONSTRAINT IF EXISTS "setting_options_setting_id_fkey";
--> statement-breakpoint
ALTER TABLE "setting_options" DROP CONSTRAINT IF EXISTS "fk_setting_options_setting_id";
--> statement-breakpoint
ALTER TABLE "system_settings" DROP CONSTRAINT IF EXISTS "system_settings_category_id_setting_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "system_settings" DROP CONSTRAINT IF EXISTS "system_settings_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "system_settings" DROP CONSTRAINT IF EXISTS "fk_system_settings_category_id";
--> statement-breakpoint
UPDATE "imports" SET "is_deleted" = COALESCE("is_deleted", false);--> statement-breakpoint
ALTER TABLE "imports" ALTER COLUMN "is_deleted" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "setting_options" ADD CONSTRAINT "setting_options_setting_id_system_settings_id_fk" FOREIGN KEY ("setting_id") REFERENCES "public"."system_settings"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_category_id_setting_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."setting_categories"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collection_record_receipts_extraction_status" ON "collection_record_receipts" USING btree ("extraction_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collection_record_receipts_receipt_date" ON "collection_record_receipts" USING btree ("receipt_date") WHERE "collection_record_receipts"."receipt_date" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_collection_records_receipt_validation_status" ON "collection_records" USING btree ("receipt_validation_status");
