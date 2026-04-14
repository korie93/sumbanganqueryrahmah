import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";

type BackupsBootstrapSqlExecutor = Pick<typeof db, "execute">;

export async function ensureBackupsBootstrapSchema(
  database: BackupsBootstrapSqlExecutor = db,
): Promise<void> {
  await database.execute(sql`SET search_path TO public`);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.backups (
      id text PRIMARY KEY,
      name text NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      created_by text NOT NULL,
      backup_data text NOT NULL,
      metadata text
    )
  `);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS backups (
      id text PRIMARY KEY,
      name text NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      created_by text NOT NULL,
      backup_data text NOT NULL,
      metadata text
    )
  `);
  await database.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS name text`);
  await database.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_by text`);
  await database.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS backup_data text`);
  await database.execute(sql`ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS metadata text`);
  await database.execute(sql`
    UPDATE public.backups
    SET created_at = COALESCE(created_at, now())
  `);
  await database.execute(sql`ALTER TABLE public.backups ALTER COLUMN created_at SET NOT NULL`);
  await database.execute(sql`
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
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS type text`);
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued'`);
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS requested_by text`);
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS requested_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS started_at timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS finished_at timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS backup_id text`);
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS backup_name text`);
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS result jsonb`);
  await database.execute(sql`ALTER TABLE public.backup_jobs ADD COLUMN IF NOT EXISTS error jsonb`);
  await database.execute(sql`
    UPDATE public.backup_jobs
    SET
      status = COALESCE(NULLIF(status, ''), 'queued'),
      requested_at = COALESCE(requested_at, now()),
      updated_at = COALESCE(updated_at, requested_at, now())
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_backup_jobs_status_requested_at
    ON public.backup_jobs(status, requested_at)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_backup_jobs_updated_at
    ON public.backup_jobs(updated_at DESC)
  `);

  const idTypeResult = await database.execute(sql`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'backups'
      AND column_name = 'id'
    LIMIT 1
  `);
  const idType = (idTypeResult.rows?.[0] as { data_type?: string } | undefined)?.data_type;
  if (idType && idType !== "text") {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS public.backups_new (
        id text PRIMARY KEY,
        name text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        created_by text NOT NULL,
        backup_data text NOT NULL,
        metadata text
      )
    `);
    await database.execute(sql`
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
    await database.execute(sql`DROP TABLE public.backups`);
    await database.execute(sql`ALTER TABLE public.backups_new RENAME TO backups`);
  }

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.backup_payload_chunks (
      id uuid PRIMARY KEY,
      backup_id text NOT NULL REFERENCES public.backups(id) ON DELETE CASCADE ON UPDATE CASCADE,
      chunk_index integer NOT NULL,
      chunk_data text NOT NULL
    )
  `);
  await database.execute(sql`ALTER TABLE public.backup_payload_chunks ADD COLUMN IF NOT EXISTS id uuid`);
  await database.execute(sql`ALTER TABLE public.backup_payload_chunks ADD COLUMN IF NOT EXISTS backup_id text`);
  await database.execute(sql`ALTER TABLE public.backup_payload_chunks ADD COLUMN IF NOT EXISTS chunk_index integer`);
  await database.execute(sql`ALTER TABLE public.backup_payload_chunks ADD COLUMN IF NOT EXISTS chunk_data text`);
  await database.execute(sql`
    UPDATE public.backup_payload_chunks
    SET id = (
      substr(md5(COALESCE(backup_id, '') || ':' || COALESCE(chunk_index, 0)::text), 1, 8) || '-' ||
      substr(md5(COALESCE(backup_id, '') || ':' || COALESCE(chunk_index, 0)::text), 9, 4) || '-' ||
      substr(md5(COALESCE(backup_id, '') || ':' || COALESCE(chunk_index, 0)::text), 13, 4) || '-' ||
      substr(md5(COALESCE(backup_id, '') || ':' || COALESCE(chunk_index, 0)::text), 17, 4) || '-' ||
      substr(md5(COALESCE(backup_id, '') || ':' || COALESCE(chunk_index, 0)::text), 21, 12)
    )::uuid
    WHERE id IS NULL
  `);
  await database.execute(sql`ALTER TABLE public.backup_payload_chunks ALTER COLUMN id SET NOT NULL`);
  await database.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.backup_payload_chunks'::regclass
          AND contype = 'p'
      ) THEN
        ALTER TABLE public.backup_payload_chunks
        ADD CONSTRAINT backup_payload_chunks_pkey PRIMARY KEY (id);
      END IF;
    END $$;
  `);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_backup_payload_chunks_backup_chunk_unique
    ON public.backup_payload_chunks(backup_id, chunk_index)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_backup_payload_chunks_backup_id
    ON public.backup_payload_chunks(backup_id)
  `);
  await database.execute(sql`
    DO $$
    BEGIN
      IF to_regclass('public.users') IS NOT NULL THEN
        UPDATE public.backups
        SET created_by = NULLIF(trim(COALESCE(created_by, '')), '');

        UPDATE public.backups
        SET created_by = 'system'
        WHERE created_by IS NULL
           OR lower(created_by) IN ('system-bootstrap', 'legacy-create-user');

        UPDATE public.backups backup_row
        SET created_by = usr.username
        FROM public.users usr
        WHERE lower(usr.username) = lower(backup_row.created_by);

        UPDATE public.backups
        SET created_by = 'system'
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.users usr
          WHERE usr.username = public.backups.created_by
        );

        ALTER TABLE public.backups
        ALTER COLUMN created_by SET NOT NULL;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_backups_created_by_username'
        ) THEN
          ALTER TABLE public.backups
          ADD CONSTRAINT fk_backups_created_by_username
          FOREIGN KEY (created_by)
          REFERENCES public.users(username)
          ON UPDATE CASCADE
          ON DELETE RESTRICT;
        END IF;

        UPDATE public.backup_jobs
        SET requested_by = NULLIF(trim(COALESCE(requested_by, '')), '');

        UPDATE public.backup_jobs
        SET requested_by = 'system'
        WHERE requested_by IS NULL
           OR lower(requested_by) IN ('system-bootstrap', 'legacy-create-user');

        UPDATE public.backup_jobs job
        SET requested_by = usr.username
        FROM public.users usr
        WHERE lower(usr.username) = lower(job.requested_by);

        UPDATE public.backup_jobs
        SET requested_by = 'system'
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.users usr
          WHERE usr.username = public.backup_jobs.requested_by
        );

        ALTER TABLE public.backup_jobs
        ALTER COLUMN requested_by SET NOT NULL;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_backup_jobs_requested_by_username'
        ) THEN
          ALTER TABLE public.backup_jobs
          ADD CONSTRAINT fk_backup_jobs_requested_by_username
          FOREIGN KEY (requested_by)
          REFERENCES public.users(username)
          ON UPDATE CASCADE
          ON DELETE RESTRICT;
        END IF;
      END IF;
    END $$;
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_backups_created_at
    ON public.backups(created_at DESC)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_backups_created_by
    ON public.backups(created_by)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_backup_jobs_requested_by
    ON public.backup_jobs(requested_by)
  `);
}

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
        await ensureBackupsBootstrapSchema(db);

        const info = await db.execute(sql`SELECT current_database() AS db, current_schema() AS schema`);
        const row = info.rows?.[0] as { db?: string; schema?: string } | undefined;
        logger.info("Backups table ready", {
          database: row?.db ?? "unknown",
          schema: row?.schema ?? "unknown",
        });

        this.ready = true;
      } catch (err) {
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
