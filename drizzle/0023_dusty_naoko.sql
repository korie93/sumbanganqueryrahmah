UPDATE "ai_category_rules" SET "updated_at" = now() WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "ai_category_rules" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
UPDATE "ai_category_stats" SET "updated_at" = now() WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "ai_category_stats" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
UPDATE "ai_conversations" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "ai_conversations" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
UPDATE "ai_messages" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "ai_messages" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
UPDATE "audit_logs" SET "timestamp" = now() WHERE "timestamp" IS NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "timestamp" SET NOT NULL;--> statement-breakpoint
UPDATE "backups" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "backups" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
UPDATE "banned_sessions" SET "banned_at" = now() WHERE "banned_at" IS NULL;--> statement-breakpoint
ALTER TABLE "banned_sessions" ALTER COLUMN "banned_at" SET NOT NULL;--> statement-breakpoint
UPDATE "data_embeddings" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "data_embeddings" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
UPDATE "feature_flags" SET "updated_at" = now() WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "feature_flags" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
UPDATE "imports" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "imports" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
UPDATE "setting_categories" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "setting_categories" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
UPDATE "setting_versions" SET "changed_at" = now() WHERE "changed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "setting_versions" ALTER COLUMN "changed_at" SET NOT NULL;--> statement-breakpoint
UPDATE "system_settings" SET "updated_at" = now() WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ALTER COLUMN "updated_at" SET NOT NULL;
