ALTER TABLE "collection_records" ALTER COLUMN "customer_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_records" ALTER COLUMN "ic_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_records" ALTER COLUMN "customer_phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_records" ALTER COLUMN "account_number" DROP NOT NULL;--> statement-breakpoint
UPDATE "collection_records"
SET
  "customer_name" = NULLIF(trim(COALESCE("customer_name", '')), ''),
  "ic_number" = NULLIF(trim(COALESCE("ic_number", '')), ''),
  "customer_phone" = CASE
    WHEN trim(COALESCE("customer_phone", '')) IN ('', '-') THEN NULL
    ELSE trim("customer_phone")
  END,
  "account_number" = NULLIF(trim(COALESCE("account_number", '')), '');
