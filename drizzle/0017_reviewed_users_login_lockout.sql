ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_by_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_users_failed_login_attempts" ON "users" USING btree ("failed_login_attempts");--> statement-breakpoint
CREATE INDEX "idx_users_locked_at" ON "users" USING btree ("locked_at");--> statement-breakpoint
CREATE INDEX "idx_users_locked_by_system" ON "users" USING btree ("locked_by_system");