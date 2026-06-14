ALTER TABLE "imports" ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_imports_last_opened_at"
  ON "imports" USING btree ("last_opened_at" DESC NULLS LAST);
