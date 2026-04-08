CREATE TABLE "backup_payload_chunks" (
	"backup_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_data" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_payload_chunks" ADD CONSTRAINT "backup_payload_chunks_backup_id_backups_id_fk" FOREIGN KEY ("backup_id") REFERENCES "public"."backups"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_backup_payload_chunks_backup_chunk_unique" ON "backup_payload_chunks" USING btree ("backup_id","chunk_index");--> statement-breakpoint
CREATE INDEX "idx_backup_payload_chunks_backup_id" ON "backup_payload_chunks" USING btree ("backup_id");