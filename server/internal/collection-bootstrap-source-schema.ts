import { sql } from "drizzle-orm";
import { ensureCollectionOspPrivateForeignKeys, ensureCollectionOspPrivateSchema } from "./collection-bootstrap-osp-private-schema";
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
          CHECK (card_number_last4 IS NULL OR card_number_last4 ~ '^[0-9]{4}$'),
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
    sql`
      DO $$
      BEGIN
        IF to_regclass('public.collection_records') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'chk_collection_records_card_number_last4'
              AND conrelid = to_regclass('public.collection_records')
              AND position('^[0-9]{4}$' in pg_get_constraintdef(oid)) > 0
          ) THEN
          UPDATE public.collection_records
          SET card_number_last4 = NULL
          WHERE card_number_last4 IS NOT NULL
            AND card_number_last4 !~ '^[0-9]{4}$';

          ALTER TABLE public.collection_records
          DROP CONSTRAINT IF EXISTS chk_collection_records_card_number_last4;

          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_card_number_last4
          CHECK (card_number_last4 IS NULL OR card_number_last4 ~ '^[0-9]{4}$');
        END IF;

        IF to_regclass('public.collection_source_rows') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'chk_collection_source_rows_card_last4'
              AND conrelid = to_regclass('public.collection_source_rows')
              AND position('^[0-9]{4}$' in pg_get_constraintdef(oid)) > 0
          ) THEN
          UPDATE public.collection_source_rows
          SET card_number_last4 = NULL
          WHERE card_number_last4 IS NOT NULL
            AND card_number_last4 !~ '^[0-9]{4}$';

          ALTER TABLE public.collection_source_rows
          DROP CONSTRAINT IF EXISTS chk_collection_source_rows_card_last4;

          ALTER TABLE public.collection_source_rows
          ADD CONSTRAINT chk_collection_source_rows_card_last4
          CHECK (card_number_last4 IS NULL OR card_number_last4 ~ '^[0-9]{4}$');
        END IF;
      END $$
    `,
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_osp_saved_targets (
        id uuid PRIMARY KEY,
        target_name text NOT NULL,
        normalized_name text NOT NULL,
        description text,
        status text NOT NULL DEFAULT 'ACTIVE',
        version integer NOT NULL DEFAULT 1,
        created_by text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_by text NOT NULL,
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        deleted_by text,
        deleted_at timestamp with time zone,
        CONSTRAINT chk_collection_osp_saved_targets_name CHECK (
          char_length(target_name) BETWEEN 1 AND 120
          AND target_name = trim(target_name)
          AND target_name !~ '[[:cntrl:]]'
        ),
        CONSTRAINT chk_collection_osp_saved_targets_normalized_name CHECK (
          char_length(normalized_name) BETWEEN 1 AND 120
          AND normalized_name = lower(trim(normalized_name))
          AND normalized_name !~ '[[:cntrl:]]'
        ),
        CONSTRAINT chk_collection_osp_saved_targets_description
          CHECK (description IS NULL OR char_length(description) <= 1000),
        CONSTRAINT chk_collection_osp_saved_targets_status
          CHECK (status IN ('ACTIVE', 'DELETED')),
        CONSTRAINT chk_collection_osp_saved_targets_version CHECK (version >= 1),
        CONSTRAINT chk_collection_osp_saved_targets_deletion_state CHECK (
          (status = 'ACTIVE' AND deleted_at IS NULL AND deleted_by IS NULL)
          OR (status = 'DELETED' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
        )
      )
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_osp_saved_targets_active_name_unique
      ON public.collection_osp_saved_targets(normalized_name)
      WHERE status = 'ACTIVE'
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_saved_targets_updated_at
      ON public.collection_osp_saved_targets(updated_at DESC)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_saved_targets_created_by
      ON public.collection_osp_saved_targets(created_by)
    `,
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_osp_target_revisions (
        id uuid PRIMARY KEY,
        target_id uuid NOT NULL,
        revision_number integer NOT NULL,
        source_scope_hash text NOT NULL,
        period_from date NOT NULL,
        period_to date NOT NULL,
        tracking_start_date date NOT NULL,
        tracking_end_date date,
        timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
        nickname_scope text[] NOT NULL DEFAULT ARRAY[]::text[],
        aging_scope text[] NOT NULL DEFAULT ARRAY['D3', 'D4', 'D5', 'D6']::text[],
        calculation_version text NOT NULL DEFAULT 'osp-effective-settlement-v9',
        created_by text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT collection_osp_target_revisions_target_id_fkey
          FOREIGN KEY (target_id)
          REFERENCES public.collection_osp_saved_targets(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT chk_collection_osp_target_revisions_number CHECK (revision_number >= 1),
        CONSTRAINT chk_collection_osp_target_revisions_source_scope_hash
          CHECK (source_scope_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT chk_collection_osp_target_revisions_period CHECK (period_from <= period_to),
        CONSTRAINT chk_collection_osp_target_revisions_tracking_period CHECK (
          tracking_start_date BETWEEN period_from AND period_to
          AND (
            tracking_end_date IS NULL
            OR tracking_end_date BETWEEN tracking_start_date AND period_to
          )
        ),
        CONSTRAINT chk_collection_osp_target_revisions_timezone CHECK (
          char_length(trim(timezone)) BETWEEN 1 AND 80
          AND timezone !~ '[[:cntrl:]]'
        ),
        CONSTRAINT chk_collection_osp_target_revisions_nickname_scope
          CHECK (cardinality(nickname_scope) <= 200),
        CONSTRAINT chk_collection_osp_target_revisions_aging_scope CHECK (
          cardinality(aging_scope) BETWEEN 1 AND 4
          AND aging_scope <@ ARRAY['D3', 'D4', 'D5', 'D6']::text[]
          AND cardinality(aging_scope) = (
            CASE WHEN 'D3' = ANY(aging_scope) THEN 1 ELSE 0 END
            + CASE WHEN 'D4' = ANY(aging_scope) THEN 1 ELSE 0 END
            + CASE WHEN 'D5' = ANY(aging_scope) THEN 1 ELSE 0 END
            + CASE WHEN 'D6' = ANY(aging_scope) THEN 1 ELSE 0 END
          )
        ),
        CONSTRAINT chk_collection_osp_target_revisions_calculation_version
          CHECK (char_length(trim(calculation_version)) BETWEEN 1 AND 80)
      )
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_osp_target_revisions_target_number_unique
      ON public.collection_osp_target_revisions(target_id, revision_number)
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_osp_target_revisions_target_id_id_unique
      ON public.collection_osp_target_revisions(target_id, id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_target_revisions_target_created_at
      ON public.collection_osp_target_revisions(target_id, created_at DESC)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_target_revisions_period
      ON public.collection_osp_target_revisions(period_from, period_to)
    `,
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_osp_target_sources (
        target_revision_id uuid NOT NULL,
        source_import_id text NOT NULL,
        source_name_snapshot text NOT NULL,
        source_filename_snapshot text NOT NULL,
        source_version_snapshot text,
        source_content_hash_snapshot text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT pk_collection_osp_target_sources
          PRIMARY KEY (target_revision_id, source_import_id),
        CONSTRAINT collection_osp_target_sources_revision_id_fkey
          FOREIGN KEY (target_revision_id)
          REFERENCES public.collection_osp_target_revisions(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT chk_collection_osp_target_sources_text CHECK (
          char_length(trim(source_import_id)) BETWEEN 1 AND 200
          AND char_length(source_name_snapshot) BETWEEN 1 AND 300
          AND char_length(source_filename_snapshot) BETWEEN 1 AND 500
          AND source_name_snapshot !~ '[[:cntrl:]]'
          AND source_filename_snapshot !~ '[[:cntrl:]]'
        ),
        CONSTRAINT chk_collection_osp_target_sources_content_hash CHECK (
          source_content_hash_snapshot IS NULL
          OR source_content_hash_snapshot ~ '^[0-9a-f]{64}$'
        )
      )
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_target_sources_import_id
      ON public.collection_osp_target_sources(source_import_id)
    `,
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_osp_target_source_rows (
        target_revision_id uuid NOT NULL,
        source_import_id text NOT NULL,
        source_data_row_id text NOT NULL,
        canonical_obligation_key text NOT NULL,
        cycle_key text NOT NULL,
        account_number_encrypted text,
        account_number_search_hash text,
        card_number_last4 text,
        customer_name_encrypted text,
        customer_name_search_hashes text[],
        aging_bucket text NOT NULL,
        calling_date date NOT NULL,
        calling_window_end_exclusive date NOT NULL,
        total_due numeric(16,2) NOT NULL,
        billing_principal_osp numeric(16,2) NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT pk_collection_osp_target_source_rows
          PRIMARY KEY (target_revision_id, source_import_id, source_data_row_id),
        CONSTRAINT collection_osp_target_source_rows_target_source_fkey
          FOREIGN KEY (target_revision_id, source_import_id)
          REFERENCES public.collection_osp_target_sources(target_revision_id, source_import_id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT chk_collection_osp_target_source_rows_identity CHECK (
          char_length(trim(source_import_id)) BETWEEN 1 AND 200
          AND char_length(trim(source_data_row_id)) BETWEEN 1 AND 200
          AND char_length(canonical_obligation_key) BETWEEN 1 AND 160
          AND char_length(cycle_key) BETWEEN 1 AND 192
          AND (account_number_encrypted IS NOT NULL OR card_number_last4 IS NOT NULL)
          AND (
            (account_number_encrypted IS NULL AND account_number_search_hash IS NULL)
            OR (
              char_length(account_number_encrypted) > 0
              AND account_number_search_hash ~ '^[0-9a-f]{64}$'
            )
          )
          AND (card_number_last4 IS NULL OR card_number_last4 ~ '^[0-9]{4}$')
          AND (customer_name_encrypted IS NULL OR char_length(customer_name_encrypted) > 0)
        ),
        CONSTRAINT chk_collection_osp_target_source_rows_customer_hashes CHECK (
          customer_name_search_hashes IS NULL
          OR (
            cardinality(customer_name_search_hashes) BETWEEN 0 AND 128
            AND array_position(customer_name_search_hashes, NULL) IS NULL
          )
        ),
        CONSTRAINT chk_collection_osp_target_source_rows_snapshot CHECK (
          aging_bucket IN ('D3', 'D4', 'D5', 'D6')
          AND total_due > 0
          AND billing_principal_osp >= 0
          AND calling_window_end_exclusive = (calling_date + INTERVAL '1 month')::date
        )
      )
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_osp_target_source_rows_revision_cycle_unique
      ON public.collection_osp_target_source_rows(target_revision_id, cycle_key)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_target_source_rows_revision_aging_calling
      ON public.collection_osp_target_source_rows(target_revision_id, aging_bucket, calling_date)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_target_source_rows_account_search_hash
      ON public.collection_osp_target_source_rows(account_number_search_hash)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_target_source_rows_customer_search_hashes
      ON public.collection_osp_target_source_rows USING gin(customer_name_search_hashes)
    `,
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_osp_target_aging_rows (
        target_revision_id uuid NOT NULL,
        aging_bucket text NOT NULL,
        total_osp_baseline numeric(16,2) NOT NULL,
        target_percentage numeric(7,4) NOT NULL,
        target_osp numeric(16,2) NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT pk_collection_osp_target_aging_rows
          PRIMARY KEY (target_revision_id, aging_bucket),
        CONSTRAINT collection_osp_target_aging_rows_revision_id_fkey
          FOREIGN KEY (target_revision_id)
          REFERENCES public.collection_osp_target_revisions(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT chk_collection_osp_target_aging_rows_aging
          CHECK (aging_bucket IN ('D3', 'D4', 'D5', 'D6')),
        CONSTRAINT chk_collection_osp_target_aging_rows_money
          CHECK (total_osp_baseline >= 0 AND target_osp >= 0),
        CONSTRAINT chk_collection_osp_target_aging_rows_percentage
          CHECK (target_percentage >= 0 AND target_percentage <= 100),
        CONSTRAINT chk_collection_osp_target_aging_rows_consistency
          CHECK (target_osp = round(total_osp_baseline * target_percentage / 100, 2))
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_osp_client_results (
        id uuid PRIMARY KEY,
        target_id uuid NOT NULL,
        target_revision_id uuid NOT NULL,
        as_of_date date NOT NULL,
        aging_bucket text NOT NULL,
        result_percentage numeric(9,4) NOT NULL,
        osp_closed numeric(16,2) NOT NULL,
        client_reference text,
        note text,
        version integer NOT NULL DEFAULT 1,
        created_by text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_by text NOT NULL,
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT collection_osp_client_results_target_revision_fkey
          FOREIGN KEY (target_id, target_revision_id)
          REFERENCES public.collection_osp_target_revisions(target_id, id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT chk_collection_osp_client_results_aging
          CHECK (aging_bucket IN ('D3', 'D4', 'D5', 'D6', 'ALL')),
        CONSTRAINT chk_collection_osp_client_results_amount CHECK (
          osp_closed >= 0
          AND result_percentage >= 0
          AND result_percentage <= 100
        ),
        CONSTRAINT chk_collection_osp_client_results_text CHECK (
          (client_reference IS NULL OR char_length(client_reference) <= 300)
          AND (note IS NULL OR char_length(note) <= 2000)
        ),
        CONSTRAINT chk_collection_osp_client_results_version CHECK (version >= 1)
      )
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_osp_client_results_revision_date_aging_unique
      ON public.collection_osp_client_results(target_revision_id, as_of_date, aging_bucket)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_client_results_target_date
      ON public.collection_osp_client_results(target_id, as_of_date DESC)
    `,
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_osp_manual_reconciliations (
        id uuid PRIMARY KEY,
        target_id uuid NOT NULL,
        target_revision_id uuid NOT NULL,
        source_import_id text NOT NULL,
        source_data_row_id text NOT NULL,
        canonical_obligation_key text NOT NULL,
        cycle_key text NOT NULL,
        account_number_encrypted text,
        account_number_search_hash text,
        card_number_last4 text,
        customer_name_encrypted text,
        aging_bucket text NOT NULL,
        calling_date date NOT NULL,
        calling_window_end_exclusive date NOT NULL,
        total_due numeric(16,2) NOT NULL,
        billing_principal_osp numeric(16,2) NOT NULL,
        manual_prior_amount numeric(16,2) NOT NULL,
        manual_as_of_date date NOT NULL,
        actual_payment_date date,
        date_source text NOT NULL,
        reason_code text NOT NULL,
        note text,
        evidence_reference text,
        status text NOT NULL DEFAULT 'ACTIVE',
        version integer NOT NULL DEFAULT 1,
        created_by text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_by text NOT NULL,
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        voided_by text,
        voided_at timestamp with time zone,
        void_reason text,
        CONSTRAINT collection_osp_manual_reconciliations_target_revision_fkey
          FOREIGN KEY (target_id, target_revision_id)
          REFERENCES public.collection_osp_target_revisions(target_id, id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT collection_osp_manual_reconciliations_target_source_fkey
          FOREIGN KEY (target_revision_id, source_import_id)
          REFERENCES public.collection_osp_target_sources(target_revision_id, source_import_id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT collection_osp_manual_reconciliations_source_row_fkey
          FOREIGN KEY (target_revision_id, source_import_id, source_data_row_id)
          REFERENCES public.collection_osp_target_source_rows(
            target_revision_id,
            source_import_id,
            source_data_row_id
          )
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT chk_collection_osp_manual_reconciliations_identity CHECK (
          char_length(canonical_obligation_key) BETWEEN 1 AND 160
          AND char_length(cycle_key) BETWEEN 1 AND 192
          AND char_length(trim(source_data_row_id)) BETWEEN 1 AND 200
          AND (account_number_encrypted IS NOT NULL OR card_number_last4 IS NOT NULL)
          AND (
            (account_number_encrypted IS NULL AND account_number_search_hash IS NULL)
            OR (
              char_length(account_number_encrypted) > 0
              AND account_number_search_hash ~ '^[0-9a-f]{64}$'
            )
          )
          AND (card_number_last4 IS NULL OR card_number_last4 ~ '^[0-9]{4}$')
        ),
        CONSTRAINT chk_collection_osp_manual_reconciliations_trusted_snapshot CHECK (
          aging_bucket IN ('D3', 'D4', 'D5', 'D6')
          AND total_due > 0
          AND billing_principal_osp >= 0
          AND calling_window_end_exclusive = (calling_date + INTERVAL '1 month')::date
        ),
        CONSTRAINT chk_collection_osp_manual_reconciliations_manual_amount
          CHECK (manual_prior_amount > 0),
        CONSTRAINT chk_collection_osp_manual_reconciliations_manual_date CHECK (
          manual_as_of_date >= calling_date
          AND manual_as_of_date < calling_window_end_exclusive
          AND (
            actual_payment_date IS NULL
            OR (
              actual_payment_date >= calling_date
              AND actual_payment_date < calling_window_end_exclusive
              AND actual_payment_date <= manual_as_of_date
            )
          )
        ),
        CONSTRAINT chk_collection_osp_manual_reconciliations_date_source CHECK (
          (date_source = 'ACTUAL_PAYMENT_DATE' AND actual_payment_date IS NOT NULL)
          OR (
            date_source IN ('CLIENT_AS_OF', 'MANUAL_AS_OF')
            AND actual_payment_date IS NULL
          )
        ),
        CONSTRAINT chk_collection_osp_manual_reconciliations_reason_code CHECK (
          reason_code IN (
            'PRIOR_PAYMENT_NOT_IN_SYSTEM',
            'CLIENT_CONFIRMED_PRIOR_PAYMENT',
            'HISTORICAL_PAYMENT_MISSING',
            'MIGRATED_HISTORY_GAP',
            'OTHER_WITH_REQUIRED_NOTE'
          )
          AND (
            reason_code <> 'OTHER_WITH_REQUIRED_NOTE'
            OR char_length(trim(COALESCE(note, ''))) > 0
          )
        ),
        CONSTRAINT chk_collection_osp_manual_reconciliations_text CHECK (
          (note IS NULL OR char_length(note) <= 2000)
          AND (evidence_reference IS NULL OR char_length(evidence_reference) <= 300)
          AND (void_reason IS NULL OR char_length(void_reason) <= 500)
        ),
        CONSTRAINT chk_collection_osp_manual_reconciliations_version CHECK (version >= 1),
        CONSTRAINT chk_collection_osp_manual_reconciliations_status
          CHECK (status IN ('ACTIVE', 'VOIDED')),
        CONSTRAINT chk_collection_osp_manual_reconciliations_void_state CHECK (
          (
            status = 'ACTIVE'
            AND voided_at IS NULL
            AND voided_by IS NULL
            AND void_reason IS NULL
          )
          OR (
            status = 'VOIDED'
            AND voided_at IS NOT NULL
            AND voided_by IS NOT NULL
            AND char_length(trim(COALESCE(void_reason, ''))) BETWEEN 1 AND 500
          )
        )
      )
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_osp_manual_reconciliations_active_account_unique
      ON public.collection_osp_manual_reconciliations(
        target_revision_id,
        canonical_obligation_key,
        cycle_key
      )
      WHERE status = 'ACTIVE'
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_manual_reconciliations_target_status_date
      ON public.collection_osp_manual_reconciliations(target_revision_id, status, manual_as_of_date)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_manual_reconciliations_target_aging_date
      ON public.collection_osp_manual_reconciliations(target_revision_id, aging_bucket, manual_as_of_date)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_manual_reconciliations_source_row
      ON public.collection_osp_manual_reconciliations(source_import_id, source_data_row_id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_manual_reconciliations_account_search_hash
      ON public.collection_osp_manual_reconciliations(account_number_search_hash)
    `,
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_osp_manual_reconciliation_audit (
        id uuid PRIMARY KEY,
        reconciliation_id uuid NOT NULL,
        target_id uuid NOT NULL,
        target_revision_id uuid NOT NULL,
        operation text NOT NULL,
        from_version integer,
        to_version integer NOT NULL,
        before_state jsonb,
        after_state jsonb,
        actor_username text NOT NULL,
        actor_role text NOT NULL,
        request_id text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT collection_osp_manual_reconciliation_audit_reconciliation_fkey
          FOREIGN KEY (reconciliation_id)
          REFERENCES public.collection_osp_manual_reconciliations(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT collection_osp_manual_reconciliation_audit_target_revision_fkey
          FOREIGN KEY (target_id, target_revision_id)
          REFERENCES public.collection_osp_target_revisions(target_id, id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT chk_collection_osp_manual_reconciliation_audit_operation
          CHECK (operation IN ('CREATE', 'UPDATE', 'VOID', 'RESTORE')),
        CONSTRAINT chk_collection_osp_manual_reconciliation_audit_version CHECK (
          to_version >= 1
          AND (from_version IS NULL OR from_version >= 1)
          AND (
            (operation = 'CREATE' AND from_version IS NULL AND to_version = 1)
            OR (
              operation <> 'CREATE'
              AND from_version IS NOT NULL
              AND to_version = from_version + 1
            )
          )
        ),
        CONSTRAINT chk_collection_osp_manual_reconciliation_audit_state CHECK (
          (operation = 'CREATE' AND before_state IS NULL AND after_state IS NOT NULL)
          OR (operation <> 'CREATE' AND before_state IS NOT NULL AND after_state IS NOT NULL)
        ),
        CONSTRAINT chk_collection_osp_manual_reconciliation_audit_actor_role
          CHECK (actor_role = 'superuser'),
        CONSTRAINT chk_collection_osp_manual_reconciliation_audit_request_id
          CHECK (request_id IS NULL OR char_length(request_id) <= 160)
      )
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_manual_reconciliation_audit_reconciliation_created
      ON public.collection_osp_manual_reconciliation_audit(reconciliation_id, created_at DESC)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_osp_manual_reconciliation_audit_target_created
      ON public.collection_osp_manual_reconciliation_audit(target_revision_id, created_at DESC)
    `,
    sql`
      CREATE OR REPLACE FUNCTION public.reject_collection_osp_manual_reconciliation_audit_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'collection_osp_manual_reconciliation_audit is append-only'
          USING ERRCODE = '55000';
      END;
      $$
    `,
    sql`
      DROP TRIGGER IF EXISTS trg_collection_osp_manual_reconciliation_audit_no_update_delete
      ON public.collection_osp_manual_reconciliation_audit
    `,
    sql`
      CREATE TRIGGER trg_collection_osp_manual_reconciliation_audit_no_update_delete
      BEFORE UPDATE OR DELETE ON public.collection_osp_manual_reconciliation_audit
      FOR EACH ROW
      EXECUTE FUNCTION public.reject_collection_osp_manual_reconciliation_audit_mutation()
    `,
    sql`
      DROP TRIGGER IF EXISTS trg_collection_osp_manual_reconciliation_audit_no_truncate
      ON public.collection_osp_manual_reconciliation_audit
    `,
    sql`
      CREATE TRIGGER trg_collection_osp_manual_reconciliation_audit_no_truncate
      BEFORE TRUNCATE ON public.collection_osp_manual_reconciliation_audit
      FOR EACH STATEMENT
      EXECUTE FUNCTION public.reject_collection_osp_manual_reconciliation_audit_mutation()
    `,
  ]);

  await ensureCollectionOspPrivateSchema(database);
  await ensureCollectionSourceGovernanceForeignKeys(database);
}

/**
 * Restores governance foreign keys after whichever dependency bootstrap runs last.
 */
export async function ensureCollectionSourceGovernanceForeignKeys(
  database: BootstrapSqlExecutor,
): Promise<void> {
  await ensureCollectionOspPrivateForeignKeys(database);
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

      IF to_regclass('public.collection_osp_saved_targets') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'collection_osp_saved_targets_created_by_fkey'
            AND conrelid = to_regclass('public.collection_osp_saved_targets')
            AND contype = 'f'
        ) THEN
        ALTER TABLE public.collection_osp_saved_targets
        ADD CONSTRAINT collection_osp_saved_targets_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_osp_saved_targets') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'collection_osp_saved_targets_updated_by_fkey'
            AND conrelid = to_regclass('public.collection_osp_saved_targets')
            AND contype = 'f'
        ) THEN
        ALTER TABLE public.collection_osp_saved_targets
        ADD CONSTRAINT collection_osp_saved_targets_updated_by_fkey
        FOREIGN KEY (updated_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_osp_saved_targets') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'collection_osp_saved_targets_deleted_by_fkey'
            AND conrelid = to_regclass('public.collection_osp_saved_targets')
            AND contype = 'f'
        ) THEN
        ALTER TABLE public.collection_osp_saved_targets
        ADD CONSTRAINT collection_osp_saved_targets_deleted_by_fkey
        FOREIGN KEY (deleted_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_osp_target_revisions') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'collection_osp_target_revisions_created_by_fkey'
            AND conrelid = to_regclass('public.collection_osp_target_revisions')
            AND contype = 'f'
        ) THEN
        ALTER TABLE public.collection_osp_target_revisions
        ADD CONSTRAINT collection_osp_target_revisions_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_osp_client_results') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'collection_osp_client_results_created_by_fkey'
            AND conrelid = to_regclass('public.collection_osp_client_results')
            AND contype = 'f'
        ) THEN
        ALTER TABLE public.collection_osp_client_results
        ADD CONSTRAINT collection_osp_client_results_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_osp_client_results') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'collection_osp_client_results_updated_by_fkey'
            AND conrelid = to_regclass('public.collection_osp_client_results')
            AND contype = 'f'
        ) THEN
        ALTER TABLE public.collection_osp_client_results
        ADD CONSTRAINT collection_osp_client_results_updated_by_fkey
        FOREIGN KEY (updated_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_osp_manual_reconciliations') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'collection_osp_manual_reconciliations_created_by_fkey'
            AND conrelid = to_regclass('public.collection_osp_manual_reconciliations')
            AND contype = 'f'
        ) THEN
        ALTER TABLE public.collection_osp_manual_reconciliations
        ADD CONSTRAINT collection_osp_manual_reconciliations_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_osp_manual_reconciliations') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'collection_osp_manual_reconciliations_updated_by_fkey'
            AND conrelid = to_regclass('public.collection_osp_manual_reconciliations')
            AND contype = 'f'
        ) THEN
        ALTER TABLE public.collection_osp_manual_reconciliations
        ADD CONSTRAINT collection_osp_manual_reconciliations_updated_by_fkey
        FOREIGN KEY (updated_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_osp_manual_reconciliations') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'collection_osp_manual_reconciliations_voided_by_fkey'
            AND conrelid = to_regclass('public.collection_osp_manual_reconciliations')
            AND contype = 'f'
        ) THEN
        ALTER TABLE public.collection_osp_manual_reconciliations
        ADD CONSTRAINT collection_osp_manual_reconciliations_voided_by_fkey
        FOREIGN KEY (voided_by)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;

      IF to_regclass('public.collection_osp_manual_reconciliation_audit') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'collection_osp_manual_recon_audit_actor_username_fkey'
            AND conrelid = to_regclass('public.collection_osp_manual_reconciliation_audit')
            AND contype = 'f'
        ) THEN
        ALTER TABLE public.collection_osp_manual_reconciliation_audit
        ADD CONSTRAINT collection_osp_manual_recon_audit_actor_username_fkey
        FOREIGN KEY (actor_username)
        REFERENCES public.users(username)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
}
