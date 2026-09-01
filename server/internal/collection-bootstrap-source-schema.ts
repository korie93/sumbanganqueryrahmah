import { sql } from "drizzle-orm";
import {
  executeBootstrapStatements,
  type BootstrapSqlExecutor,
} from "./collection-bootstrap-records-shared";

export async function ensureCollectionSourceGovernanceSchema(
  database: BootstrapSqlExecutor,
): Promise<void> {
  await executeBootstrapStatements(database, [
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_source_configs (
        source_import_id text PRIMARY KEY,
        valid_from date NOT NULL,
        valid_to date NOT NULL,
        cycle_key text NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        compatibility_status text NOT NULL DEFAULT 'incompatible',
        compatibility_issues text[] NOT NULL DEFAULT ARRAY[]::text[],
        indexed_row_count integer NOT NULL DEFAULT 0,
        configured_by text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT chk_collection_source_configs_validity CHECK (valid_from <= valid_to),
        CONSTRAINT chk_collection_source_configs_compatibility
          CHECK (compatibility_status IN ('compatible', 'incompatible')),
        CONSTRAINT chk_collection_source_configs_indexed_row_count CHECK (indexed_row_count >= 0),
        CONSTRAINT chk_collection_source_configs_enabled_compatibility
          CHECK (enabled = false OR compatibility_status = 'compatible')
      )
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_source_configs_enabled_validity
      ON public.collection_source_configs(enabled, valid_from, valid_to)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_source_configs_cycle_key
      ON public.collection_source_configs(cycle_key)
    `,
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_source_rows (
        source_import_id text NOT NULL,
        source_data_row_id text NOT NULL,
        account_number_hash text,
        card_number_hash text,
        card_number_last4 text,
        canonical_obligation_key text NOT NULL,
        total_due numeric(14,2) NOT NULL,
        billing_principal_osp numeric(14,2) NOT NULL,
        total_osb numeric(14,2),
        aging_bucket text NOT NULL,
        calling_date date NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT pk_collection_source_rows PRIMARY KEY (source_import_id, source_data_row_id),
        CONSTRAINT chk_collection_source_rows_identifier
          CHECK (account_number_hash IS NOT NULL OR card_number_hash IS NOT NULL),
        CONSTRAINT chk_collection_source_rows_aging
          CHECK (aging_bucket IN ('D3', 'D4', 'D5', 'D6')),
        CONSTRAINT chk_collection_source_rows_account_hash
          CHECK (account_number_hash IS NULL OR char_length(account_number_hash) = 64),
        CONSTRAINT chk_collection_source_rows_card_hash
          CHECK (card_number_hash IS NULL OR char_length(card_number_hash) = 64),
        CONSTRAINT chk_collection_source_rows_card_last4
          CHECK (card_number_last4 IS NULL OR char_length(card_number_last4) <= 4),
        CONSTRAINT chk_collection_source_rows_money
          CHECK (total_due > 0 AND billing_principal_osp >= 0 AND (total_osb IS NULL OR total_osb >= 0))
      )
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_source_rows_data_row_unique
      ON public.collection_source_rows(source_data_row_id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_source_rows_account_lookup
      ON public.collection_source_rows(source_import_id, account_number_hash)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_source_rows_card_lookup
      ON public.collection_source_rows(source_import_id, card_number_hash)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_source_rows_aging
      ON public.collection_source_rows(source_import_id, aging_bucket)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_source_rows_obligation
      ON public.collection_source_rows(canonical_obligation_key)
    `,
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_osp_targets (
        id uuid PRIMARY KEY,
        source_scope_hash text NOT NULL,
        source_import_ids text[] NOT NULL,
        period_from date NOT NULL,
        period_to date NOT NULL,
        aging_bucket text NOT NULL,
        total_osp_baseline numeric(16,2),
        target_percentage numeric(7,4) NOT NULL,
        configured_by text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT chk_collection_osp_targets_period CHECK (period_from <= period_to),
        CONSTRAINT chk_collection_osp_targets_aging
          CHECK (aging_bucket IN ('D3', 'D4', 'D5', 'D6')),
        CONSTRAINT chk_collection_osp_targets_percentage
          CHECK (target_percentage >= 0 AND target_percentage <= 100),
        CONSTRAINT chk_collection_osp_targets_source_count
          CHECK (cardinality(source_import_ids) BETWEEN 1 AND 5),
        CONSTRAINT chk_collection_osp_targets_baseline
          CHECK (total_osp_baseline IS NULL OR total_osp_baseline >= 0)
      )
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_osp_targets_scope_period_aging_unique
      ON public.collection_osp_targets(source_scope_hash, period_from, period_to, aging_bucket)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_targets_period
      ON public.collection_osp_targets(period_from, period_to)
    `,
  ]);

  await ensureCollectionSourceGovernanceForeignKeys(database);
}

/**
 * Restores governance foreign keys after whichever dependency bootstrap runs last.
 */
export async function ensureCollectionSourceGovernanceForeignKeys(
  database: BootstrapSqlExecutor,
): Promise<void> {
  await database.execute(sql`
    DO $$
    BEGIN
      IF to_regclass('public.collection_source_configs') IS NOT NULL
        AND to_regclass('public.imports') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'collection_source_configs_source_import_id_fkey'
            AND conrelid = to_regclass('public.collection_source_configs')
            AND contype = 'f'
        ) THEN
        DELETE FROM public.collection_source_configs config
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.imports imp
          WHERE imp.id = config.source_import_id
        );

        ALTER TABLE public.collection_source_configs
        ADD CONSTRAINT collection_source_configs_source_import_id_fkey
        FOREIGN KEY (source_import_id)
        REFERENCES public.imports(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_source_configs') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'collection_source_configs_configured_by_fkey'
            AND conrelid = to_regclass('public.collection_source_configs')
            AND contype = 'f'
        ) THEN
        DELETE FROM public.collection_source_configs config
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.users usr
          WHERE usr.username = config.configured_by
        );

        ALTER TABLE public.collection_source_configs
        ADD CONSTRAINT collection_source_configs_configured_by_fkey
        FOREIGN KEY (configured_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_source_rows') IS NOT NULL
        AND to_regclass('public.imports') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'collection_source_rows_source_import_id_fkey'
            AND conrelid = to_regclass('public.collection_source_rows')
            AND contype = 'f'
        ) THEN
        DELETE FROM public.collection_source_rows source_row
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.imports imp
          WHERE imp.id = source_row.source_import_id
        );

        ALTER TABLE public.collection_source_rows
        ADD CONSTRAINT collection_source_rows_source_import_id_fkey
        FOREIGN KEY (source_import_id)
        REFERENCES public.imports(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_source_rows') IS NOT NULL
        AND to_regclass('public.data_rows') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'collection_source_rows_source_data_row_id_fkey'
            AND conrelid = to_regclass('public.collection_source_rows')
            AND contype = 'f'
        ) THEN
        DELETE FROM public.collection_source_rows source_row
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.data_rows data_row
          WHERE data_row.id = source_row.source_data_row_id
        );

        ALTER TABLE public.collection_source_rows
        ADD CONSTRAINT collection_source_rows_source_data_row_id_fkey
        FOREIGN KEY (source_data_row_id)
        REFERENCES public.data_rows(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_osp_targets') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'collection_osp_targets_configured_by_fkey'
            AND conrelid = to_regclass('public.collection_osp_targets')
            AND contype = 'f'
        ) THEN
        DELETE FROM public.collection_osp_targets osp_target
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.users usr
          WHERE usr.username = osp_target.configured_by
        );

        ALTER TABLE public.collection_osp_targets
        ADD CONSTRAINT collection_osp_targets_configured_by_fkey
        FOREIGN KEY (configured_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
}
