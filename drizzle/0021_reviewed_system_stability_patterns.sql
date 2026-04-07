CREATE TABLE IF NOT EXISTS "system_stability_patterns" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"metric_signature" text NOT NULL,
	"hour" integer NOT NULL,
	"weekday" integer NOT NULL,
	"severity" text NOT NULL,
	"action_taken" text NOT NULL,
	"duration_ms" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stability_patterns_signature_window" ON "system_stability_patterns" USING btree ("metric_signature","hour","weekday","severity");
