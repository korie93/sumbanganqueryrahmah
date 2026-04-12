ALTER TABLE "backup_payload_chunks" ADD COLUMN IF NOT EXISTS "id" uuid;
--> statement-breakpoint
UPDATE "backup_payload_chunks"
SET "id" = (
  substr(md5(COALESCE("backup_id", '') || ':' || COALESCE("chunk_index", 0)::text), 1, 8) || '-' ||
  substr(md5(COALESCE("backup_id", '') || ':' || COALESCE("chunk_index", 0)::text), 9, 4) || '-' ||
  substr(md5(COALESCE("backup_id", '') || ':' || COALESCE("chunk_index", 0)::text), 13, 4) || '-' ||
  substr(md5(COALESCE("backup_id", '') || ':' || COALESCE("chunk_index", 0)::text), 17, 4) || '-' ||
  substr(md5(COALESCE("backup_id", '') || ':' || COALESCE("chunk_index", 0)::text), 21, 12)
)::uuid
WHERE "id" IS NULL;
--> statement-breakpoint
ALTER TABLE "backup_payload_chunks" ALTER COLUMN "id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.backup_payload_chunks'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE "backup_payload_chunks"
    ADD CONSTRAINT "backup_payload_chunks_pkey" PRIMARY KEY ("id");
  END IF;
END
$$;
