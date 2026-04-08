import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";

export class BackupsBootstrap {
  private ready = false;
  private initPromise: Promise<void> | null = null;

  async ensureTable(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.backups (
            id text PRIMARY KEY,
            name text NOT NULL,
            created_at timestamp with time zone DEFAULT now() NOT NULL,
            created_by text NOT NULL,
            backup_data text NOT NULL,
            metadata text
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS backups (
            id text PRIMARY KEY,
            name text NOT NULL,
            created_at timestamp with time zone DEFAULT now() NOT NULL,
            created_by text NOT NULL,
            backup_data text NOT NULL,
            metadata text
          )
        `);
        await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS name text`);
        await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_by text`);
        await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS backup_data text`);
        await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS metadata text`);
        await db.execute(sql`
          UPDATE public.backups
          SET created_at = COALESCE(created_at, now())
        `);
        await db.execute(sql`ALTER TABLE public.backups ALTER COLUMN created_at SET NOT NULL`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.backup_jobs (
            id uuid PRIMARY KEY,
            type text NOT NULL,
            status text NOT NULL DEFAULT 'queued',
            requested_by text NOT NULL,
            requested_at timestamp with time zone DEFAULT now() NOT NULL,
            started_at timestamp with time zone,
            finished_at timestamp with time zone,
            updated_at timestamp with time zone DEFAULT now() NOT NULL,
            backup_id text,
            backup_name text,
            result jsonb,
            error jsonb
          )
        `);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS type text`);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued'`);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS requested_by text`);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS requested_at timestamp with time zone DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS started_at timestamp with time zone`);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS finished_at timestamp with time zone`);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS backup_id text`);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS backup_name text`);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS result jsonb`);
        await db.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS error jsonb`);
        await db.execute(sql`
          UPDATE public.backup_jobs
          SET
            status = COALESCE(NULLIF(status, ''), 'queued'),
            requested_at = COALESCE(requested_at, now()),
            updated_at = COALESCE(updated_at, requested_at, now())
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_backup_jobs_status_requested_at
          ON public.backup_jobs(status, requested_at)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_backup_jobs_updated_at
          ON public.backup_jobs(updated_at DESC)
        `);

        const idTypeResult = await db.execute(sql`
          SELECT data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'backups'
            AND column_name = 'id'
          LIMIT 1
        `);
        const idType = (idTypeResult.rows?.[0] as { data_type?: string } | undefined)?.data_type;
        if (idType && idType !== "text") {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS public.backups_new (
              id text PRIMARY KEY,
              name text NOT NULL,
              created_at timestamp with time zone DEFAULT now() NOT NULL,
              created_by text NOT NULL,
              backup_data text NOT NULL,
              metadata text
            )
          `);
          await db.execute(sql`
            INSERT INTO public.backups_new (id, name, created_at, created_by, backup_data, metadata)
            SELECT
              id::text,
              COALESCE(name, 'backup')::text,
              COALESCE(created_at, now()),
              COALESCE(created_by, 'system')::text,
              COALESCE(backup_data, '{}')::text,
              metadata
            FROM public.backups
            ON CONFLICT (id) DO NOTHING
          `);
          await db.execute(sql`DROP TABLE public.backups`);
          await db.execute(sql`ALTER TABLE public.backups_new RENAME TO backups`);
        }

        const info = await db.execute(sql`SELECT current_database() AS db, current_schema() AS schema`);
        const row = info.rows?.[0] as { db?: string; schema?: string } | undefined;
        logger.info("Backups table ready", {
          database: row?.db ?? "unknown",
          schema: row?.schema ?? "unknown",
        });

        this.ready = true;
      } catch (err: any) {
        logger.error("Failed to ensure backups table", { error: err });
      }
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }
}
