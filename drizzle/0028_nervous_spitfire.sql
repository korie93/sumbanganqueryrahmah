CREATE TABLE IF NOT EXISTS "backup_payload_chunks" (
	"backup_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_data" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_payload_chunks" ADD COLUMN IF NOT EXISTS "backup_id" text;--> statement-breakpoint
ALTER TABLE "backup_payload_chunks" ADD COLUMN IF NOT EXISTS "chunk_index" integer;--> statement-breakpoint
ALTER TABLE "backup_payload_chunks" ADD COLUMN IF NOT EXISTS "chunk_data" text;--> statement-breakpoint
ALTER TABLE "backup_payload_chunks" ALTER COLUMN "backup_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "backup_payload_chunks" ALTER COLUMN "chunk_index" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "backup_payload_chunks" ALTER COLUMN "chunk_data" SET NOT NULL;--> statement-breakpoint
DO $$
DECLARE
  backup_id_attnum smallint;
BEGIN
  SELECT attnum
  INTO backup_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.backup_payload_chunks'::regclass
    AND attname = 'backup_id'
    AND NOT attisdropped;

  IF backup_id_attnum IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.backup_payload_chunks'::regclass
        AND conname = 'backup_payload_chunks_backup_id_backups_id_fk'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.backup_payload_chunks'::regclass
        AND contype = 'f'
        AND confrelid = 'public.backups'::regclass
        AND conkey = ARRAY[backup_id_attnum]::smallint[]
    )
  THEN
    ALTER TABLE "backup_payload_chunks"
    ADD CONSTRAINT "backup_payload_chunks_backup_id_backups_id_fk"
    FOREIGN KEY ("backup_id")
    REFERENCES "public"."backups"("id")
    ON DELETE cascade
    ON UPDATE cascade;
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_backup_payload_chunks_backup_chunk_unique" ON "backup_payload_chunks" USING btree ("backup_id","chunk_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_backup_payload_chunks_backup_id" ON "backup_payload_chunks" USING btree ("backup_id");
