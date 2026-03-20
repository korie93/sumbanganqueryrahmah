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
            created_at timestamp DEFAULT now(),
            created_by text NOT NULL,
            backup_data text NOT NULL,
            metadata text
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS backups (
            id text PRIMARY KEY,
            name text NOT NULL,
            created_at timestamp DEFAULT now(),
            created_by text NOT NULL,
            backup_data text NOT NULL,
            metadata text
          )
        `);
        await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS name text`);
        await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_at timestamp`);
        await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_by text`);
        await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS backup_data text`);
        await db.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS metadata text`);

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
              created_at timestamp DEFAULT now(),
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
