import { sql } from "drizzle-orm";
import { executeBootstrapStatements, type BootstrapSqlExecutor } from "./collection-bootstrap-records-shared";

/** Additive counterpart of migration 0062; never reinterpret shared legacy data. */
export async function ensureCollectionOspPrivateSchema(database: BootstrapSqlExecutor): Promise<void> {
  await executeBootstrapStatements(database, [
    sql`ALTER TABLE public.collection_osp_saved_targets
      ADD COLUMN IF NOT EXISTS assigned_admin_user_id text`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_osp_saved_targets_assigned_admin_active
      ON public.collection_osp_saved_targets(assigned_admin_user_id, updated_at DESC, id)
      WHERE status = 'ACTIVE'`,
    sql`ALTER TABLE public.collection_osp_target_source_rows
      ADD COLUMN IF NOT EXISTS card_number_encrypted text,
      ADD COLUMN IF NOT EXISTS identification_number_encrypted text,
      ADD COLUMN IF NOT EXISTS phone_encrypted text`,
    sql`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.collection_osp_target_source_rows'::regclass
          AND conname = 'chk_collection_osp_target_source_rows_detail_encryption') THEN
        ALTER TABLE public.collection_osp_target_source_rows
          ADD CONSTRAINT chk_collection_osp_target_source_rows_detail_encryption CHECK (
            (card_number_encrypted IS NULL OR char_length(card_number_encrypted) > 0)
            AND (identification_number_encrypted IS NULL OR char_length(identification_number_encrypted) > 0)
            AND (phone_encrypted IS NULL OR char_length(phone_encrypted) > 0)
          );
      END IF;
    END $$`,
    sql`CREATE TABLE IF NOT EXISTS public.collection_osp_private_client_results (
      id uuid PRIMARY KEY,
      target_id uuid NOT NULL,
      target_revision_id uuid NOT NULL,
      owner_user_id text NOT NULL,
      aging_bucket text NOT NULL,
      target_percentage numeric(7,4) NOT NULL,
      result_percentage numeric(9,4) NOT NULL,
      osp_closed numeric(16,2) NOT NULL,
      as_of_date date NOT NULL,
      client_reference text,
      note text,
      version integer NOT NULL DEFAULT 1,
      created_by text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_by text NOT NULL,
      updated_at timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT collection_osp_private_client_results_target_revision_fkey
        FOREIGN KEY (target_id, target_revision_id)
        REFERENCES public.collection_osp_target_revisions(target_id, id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT chk_collection_osp_private_client_results_aging
        CHECK (aging_bucket IN ('D3', 'D4', 'D5', 'D6')),
      CONSTRAINT chk_collection_osp_private_client_results_percentage
        CHECK (target_percentage BETWEEN 0 AND 100 AND result_percentage BETWEEN 0 AND 100),
      CONSTRAINT chk_collection_osp_private_client_results_amount CHECK (osp_closed >= 0),
      CONSTRAINT chk_collection_osp_private_client_results_text CHECK (
        (client_reference IS NULL OR char_length(client_reference) <= 300)
        AND (note IS NULL OR char_length(note) <= 2000)
      ),
      CONSTRAINT chk_collection_osp_private_client_results_version CHECK (version >= 1)
    )`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_osp_private_client_results_owner_aging_unique
      ON public.collection_osp_private_client_results(target_revision_id, owner_user_id, aging_bucket)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_osp_private_client_results_owner_target
      ON public.collection_osp_private_client_results(owner_user_id, target_id)`,
  ]);
}

/** Bootstrap order may create Collection tables before users. Fail closed on
 * invalid existing ownership instead of deleting records to install the FKs. */
export async function ensureCollectionOspPrivateForeignKeys(database: BootstrapSqlExecutor): Promise<void> {
  await database.execute(sql`DO $$ BEGIN
    IF to_regclass('public.users') IS NULL THEN RETURN; END IF;
    IF to_regclass('public.collection_osp_saved_targets') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'collection_osp_saved_targets'
          AND column_name = 'assigned_admin_user_id')
      AND NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('public.collection_osp_saved_targets')
          AND conname = 'collection_osp_saved_targets_assigned_admin_user_id_fkey') THEN
      ALTER TABLE public.collection_osp_saved_targets
        ADD CONSTRAINT collection_osp_saved_targets_assigned_admin_user_id_fkey
        FOREIGN KEY (assigned_admin_user_id) REFERENCES public.users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF to_regclass('public.collection_osp_private_client_results') IS NULL THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass('public.collection_osp_private_client_results')
        AND conname = 'collection_osp_private_client_results_owner_user_id_fkey') THEN
      ALTER TABLE public.collection_osp_private_client_results
        ADD CONSTRAINT collection_osp_private_client_results_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass('public.collection_osp_private_client_results')
        AND conname = 'collection_osp_private_client_results_created_by_fkey') THEN
      ALTER TABLE public.collection_osp_private_client_results
        ADD CONSTRAINT collection_osp_private_client_results_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users(username) ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass('public.collection_osp_private_client_results')
        AND conname = 'collection_osp_private_client_results_updated_by_fkey') THEN
      ALTER TABLE public.collection_osp_private_client_results
        ADD CONSTRAINT collection_osp_private_client_results_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES public.users(username) ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END $$`);
}
