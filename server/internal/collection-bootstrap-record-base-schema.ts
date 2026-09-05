import { sql } from "drizzle-orm";
import {
  executeBootstrapStatements,
  type BootstrapSqlExecutor,
} from "./collection-bootstrap-records-shared";
import {
  backfillCollectionRecordEncryptedPii,
  backfillCollectionRecordPiiSearchHashes,
} from "./collection-bootstrap-record-schema-pii";

export async function ensureCollectionRecordBaseSchema(database: BootstrapSqlExecutor): Promise<void> {
  await executeBootstrapStatements(database, [
    sql`
      CREATE TABLE IF NOT EXISTS public.collection_records (
        id uuid PRIMARY KEY,
        customer_name text,
        customer_name_encrypted text,
        customer_name_search_hash text,
        customer_name_search_hashes text[],
        ic_number text,
        ic_number_encrypted text,
        ic_number_search_hash text,
        customer_phone text,
        customer_phone_encrypted text,
        customer_phone_search_hash text,
        account_number text,
        account_number_encrypted text,
        account_number_search_hash text,
        card_number_last4 text,
        source_import_id text,
        source_data_row_id text,
        source_import_name text,
        source_filename text,
        aging_bucket text,
        calling_date date,
        calling_window_end_exclusive date,
        total_due numeric(14,2),
        billing_principal_osp numeric(14,2),
        source_match_basis text,
        source_match_accuracy integer,
        source_obligation_key text,
        settlement_cycle_key text,
        classification text,
        cumulative_collected numeric(14,2),
        remaining_amount numeric(14,2),
        settlement_override_status text,
        pool_amount numeric(14,2),
        manual_settlement_date date,
        manual_settlement_reason text,
        manual_settlement_note text,
        manual_settlement_reference text,
        manual_settlement_version integer,
        manual_settlement_verified_by text,
        manual_settlement_verified_at timestamp with time zone,
        manual_settlement_updated_by text,
        manual_settlement_updated_at timestamp with time zone,
        manual_settlement_revoked_by text,
        manual_settlement_revoked_at timestamp with time zone,
        manual_settlement_revoked_reason text,
        batch text NOT NULL,
        payment_date date NOT NULL,
        amount numeric(14,2) NOT NULL,
        receipt_file text,
        receipt_total_amount bigint NOT NULL DEFAULT 0,
        receipt_validation_status text NOT NULL DEFAULT 'needs_review',
        receipt_validation_message text,
        receipt_count integer NOT NULL DEFAULT 0,
        duplicate_receipt_flag boolean NOT NULL DEFAULT false,
        created_by_login text NOT NULL,
        collection_staff_nickname text NOT NULL,
        staff_username text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name_encrypted text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name_search_hash text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_name_search_hashes text[]`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number_encrypted text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS ic_number_search_hash text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone_encrypted text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS customer_phone_search_hash text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number_encrypted text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS account_number_search_hash text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS card_number_last4 text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS source_import_id text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS source_data_row_id text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS source_import_name text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS source_filename text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS aging_bucket text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS calling_date date`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS calling_window_end_exclusive date`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS total_due numeric(14,2)`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS billing_principal_osp numeric(14,2)`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS source_match_basis text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS source_match_accuracy integer`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS source_obligation_key text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS settlement_cycle_key text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS classification text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS cumulative_collected numeric(14,2)`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS remaining_amount numeric(14,2)`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS settlement_override_status text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS pool_amount numeric(14,2)`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_date date`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_reason text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_note text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_reference text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_version integer`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_verified_by text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_verified_at timestamp with time zone`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_updated_by text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_updated_at timestamp with time zone`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_revoked_by text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_revoked_at timestamp with time zone`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS manual_settlement_revoked_reason text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS batch text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS payment_date date`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS amount numeric(14,2)`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_file text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_total_amount bigint DEFAULT 0`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_validation_status text DEFAULT 'needs_review'`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_validation_message text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS receipt_count integer DEFAULT 0`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS duplicate_receipt_flag boolean DEFAULT false`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_by_login text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS collection_staff_nickname text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS staff_username text`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`,
    sql`ALTER TABLE public.collection_records ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`,
    sql`ALTER TABLE public.collection_records ALTER COLUMN customer_name DROP NOT NULL`,
    sql`ALTER TABLE public.collection_records ALTER COLUMN ic_number DROP NOT NULL`,
    sql`ALTER TABLE public.collection_records ALTER COLUMN customer_phone DROP NOT NULL`,
    sql`ALTER TABLE public.collection_records ALTER COLUMN account_number DROP NOT NULL`,
    sql`
      UPDATE public.collection_records
      SET
        customer_name = NULLIF(trim(COALESCE(customer_name, '')), ''),
        ic_number = NULLIF(trim(COALESCE(ic_number, '')), ''),
        customer_phone = CASE
          WHEN trim(COALESCE(customer_phone, '')) IN ('', '-') THEN NULL
          ELSE trim(customer_phone)
        END,
        account_number = NULLIF(trim(COALESCE(account_number, '')), '')
    `,
    sql`
      UPDATE public.collection_records
      SET created_by_login = COALESCE(
        NULLIF(trim(COALESCE(created_by_login, '')), ''),
        NULLIF(trim(COALESCE(staff_username, '')), ''),
        'unknown'
      )
    `,
    sql`
      UPDATE public.collection_records
      SET collection_staff_nickname = COALESCE(
        NULLIF(trim(COALESCE(collection_staff_nickname, '')), ''),
        NULLIF(trim(COALESCE(staff_username, '')), ''),
        NULLIF(trim(COALESCE(created_by_login, '')), ''),
        'unknown'
      )
    `,
    sql`
      UPDATE public.collection_records
      SET staff_username = COALESCE(
        NULLIF(trim(COALESCE(staff_username, '')), ''),
        NULLIF(trim(COALESCE(collection_staff_nickname, '')), ''),
        NULLIF(trim(COALESCE(created_by_login, '')), ''),
        'unknown'
      )
    `,
    sql`
      DO $$
      BEGIN
        IF to_regclass('public.users') IS NOT NULL THEN
          EXECUTE $canonicalize_created_by_login$
            UPDATE public.collection_records record
            SET created_by_login = usr.username
            FROM public.users usr
            WHERE lower(usr.username) = lower(trim(COALESCE(record.created_by_login, '')))
          $canonicalize_created_by_login$;

          IF EXISTS (
            SELECT 1
            FROM public.users
            WHERE username = 'system'
          ) THEN
            EXECUTE $fallback_created_by_login$
              UPDATE public.collection_records record
              SET created_by_login = 'system'
              WHERE NOT EXISTS (
                SELECT 1
                FROM public.users usr
                WHERE usr.username = record.created_by_login
              )
            $fallback_created_by_login$;

            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname = 'fk_collection_records_created_by_login_username'
            ) THEN
              ALTER TABLE public.collection_records
              ADD CONSTRAINT fk_collection_records_created_by_login_username
              FOREIGN KEY (created_by_login)
              REFERENCES public.users(username)
              ON DELETE RESTRICT
              ON UPDATE CASCADE;
            ELSIF EXISTS (
              SELECT 1
              FROM information_schema.referential_constraints rc
              WHERE rc.constraint_schema = 'public'
                AND rc.constraint_name = 'fk_collection_records_created_by_login_username'
                AND (
                  rc.delete_rule <> 'RESTRICT'
                  OR rc.update_rule <> 'CASCADE'
                )
            ) THEN
              ALTER TABLE public.collection_records
              DROP CONSTRAINT fk_collection_records_created_by_login_username;

              ALTER TABLE public.collection_records
              ADD CONSTRAINT fk_collection_records_created_by_login_username
              FOREIGN KEY (created_by_login)
              REFERENCES public.users(username)
              ON DELETE RESTRICT
              ON UPDATE CASCADE;
            END IF;
          END IF;
        END IF;
      END $$;
    `,
    sql`
      UPDATE public.collection_records
      SET
        collection_staff_nickname = trim(COALESCE(collection_staff_nickname, '')),
        staff_username = trim(COALESCE(staff_username, ''))
    `,
    sql`
      UPDATE public.collection_records
      SET
        collection_staff_nickname = COALESCE(NULLIF(collection_staff_nickname, ''), 'unknown'),
        staff_username = COALESCE(NULLIF(collection_staff_nickname, ''), 'unknown')
    `,
    sql`UPDATE public.collection_records SET updated_at = COALESCE(updated_at, created_at, now())`,
    sql`
      UPDATE public.collection_records
      SET
        receipt_total_amount = COALESCE(receipt_total_amount, 0),
        receipt_validation_status = COALESCE(NULLIF(trim(COALESCE(receipt_validation_status, '')), ''), 'needs_review'),
        receipt_count = COALESCE(receipt_count, 0),
        duplicate_receipt_flag = COALESCE(duplicate_receipt_flag, false)
    `,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_payment_date ON public.collection_records(payment_date)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_at ON public.collection_records(created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_username ON public.collection_records(staff_username)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_login ON public.collection_records(created_by_login)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_staff_nickname ON public.collection_records(collection_staff_nickname)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_source_import_id ON public.collection_records(source_import_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_source_data_row_id ON public.collection_records(source_data_row_id)`,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_source_settlement_window
      ON public.collection_records(source_import_id, source_data_row_id, payment_date)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_settlement_cycle_order
      ON public.collection_records(settlement_cycle_key, payment_date, created_at, id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_obligation_history_order
      ON public.collection_records(
        source_obligation_key,
        payment_date DESC,
        created_at DESC,
        id DESC
      )
      WHERE source_obligation_key IS NOT NULL
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_records_sole_abort_per_cycle
      ON public.collection_records(settlement_cycle_key)
      WHERE classification = 'abort_cp' AND settlement_cycle_key IS NOT NULL
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_records_sole_active_manual_settlement_per_cycle
      ON public.collection_records(settlement_cycle_key)
      WHERE settlement_override_status = 'ACTIVE' AND settlement_cycle_key IS NOT NULL
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_records_active_pool_evidence_unique
      ON public.collection_records(
        source_obligation_key,
        manual_settlement_date,
        pool_amount,
        COALESCE(lower(trim(manual_settlement_reference)), '')
      )
      WHERE settlement_override_status = 'ACTIVE'
        AND source_obligation_key IS NOT NULL
        AND manual_settlement_date IS NOT NULL
        AND pool_amount IS NOT NULL
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_manual_settlement_date
      ON public.collection_records(manual_settlement_date)
      WHERE settlement_override_status = 'ACTIVE'
    `,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_phone ON public.collection_records(customer_phone)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_name_search_hash ON public.collection_records(customer_name_search_hash)`,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_customer_name_search_hashes
      ON public.collection_records USING gin (customer_name_search_hashes)
    `,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_ic_number_search_hash ON public.collection_records(ic_number_search_hash)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_customer_phone_search_hash ON public.collection_records(customer_phone_search_hash)`,
    sql`CREATE INDEX IF NOT EXISTS idx_collection_records_account_number_search_hash ON public.collection_records(account_number_search_hash)`,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_receipt_validation_status
      ON public.collection_records(receipt_validation_status)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_payment_created_id
      ON public.collection_records(payment_date, created_at, id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_created_by_payment_created_id
      ON public.collection_records(created_by_login, payment_date, created_at, id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_lower_staff_nickname_payment_created_id
      ON public.collection_records ((lower(collection_staff_nickname)), payment_date, created_at, id)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS idx_collection_records_lower_created_by_payment_created_id
      ON public.collection_records ((lower(created_by_login)), payment_date, created_at, id)
    `,
    sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_collection_records_classification'
            AND conrelid = 'public.collection_records'::regclass
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_classification
          CHECK (classification IS NULL OR classification IN ('cp', 'abort_cp'));
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_collection_records_settlement_state'
            AND conrelid = 'public.collection_records'::regclass
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_settlement_state
          CHECK (
            (classification IS NULL AND cumulative_collected IS NULL AND remaining_amount IS NULL)
            OR (
              classification IN ('cp', 'abort_cp')
              AND settlement_cycle_key IS NOT NULL
              AND source_obligation_key IS NOT NULL
              AND cumulative_collected >= 0
              AND remaining_amount >= 0
            )
          );
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_collection_records_card_number_last4'
            AND conrelid = 'public.collection_records'::regclass
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_card_number_last4
          CHECK (card_number_last4 IS NULL OR char_length(card_number_last4) <= 4);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_collection_records_aging_bucket'
            AND conrelid = 'public.collection_records'::regclass
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_aging_bucket
          CHECK (aging_bucket IS NULL OR aging_bucket IN ('D3', 'D4', 'D5', 'D6'));
        END IF;

        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_collection_records_source_match_basis'
            AND conrelid = 'public.collection_records'::regclass
            AND (
              pg_get_constraintdef(oid) NOT LIKE '%account_number%'
              OR pg_get_constraintdef(oid) NOT LIKE '%card_number%'
              OR pg_get_constraintdef(oid) NOT LIKE '%account_and_card%'
            )
        ) THEN
          ALTER TABLE public.collection_records
          DROP CONSTRAINT chk_collection_records_source_match_basis;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_collection_records_source_match_basis'
            AND conrelid = 'public.collection_records'::regclass
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_source_match_basis
          CHECK (source_match_basis IS NULL OR source_match_basis IN (
            'ic',
            'phone_and_account',
            'account_number',
            'card_number',
            'account_and_card'
          )) NOT VALID;

          ALTER TABLE public.collection_records
          VALIDATE CONSTRAINT chk_collection_records_source_match_basis;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_collection_records_source_match_accuracy'
            AND conrelid = 'public.collection_records'::regclass
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_source_match_accuracy
          CHECK (
            source_match_accuracy IS NULL
            OR (source_match_accuracy >= 0 AND source_match_accuracy <= 100)
          );
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_collection_records_calling_window'
            AND conrelid = 'public.collection_records'::regclass
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_calling_window
          CHECK (
            (calling_date IS NULL AND calling_window_end_exclusive IS NULL)
            OR (
              calling_date IS NOT NULL
              AND calling_window_end_exclusive = (calling_date + INTERVAL '1 month')::date
            )
          );
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_collection_records_manual_settlement_state'
            AND conrelid = 'public.collection_records'::regclass
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_manual_settlement_state
          CHECK (
            (
              settlement_override_status IS NULL
              AND pool_amount IS NULL
              AND manual_settlement_date IS NULL
              AND manual_settlement_reason IS NULL
              AND manual_settlement_note IS NULL
              AND manual_settlement_reference IS NULL
              AND manual_settlement_version IS NULL
              AND manual_settlement_verified_by IS NULL
              AND manual_settlement_verified_at IS NULL
              AND manual_settlement_updated_by IS NULL
              AND manual_settlement_updated_at IS NULL
              AND manual_settlement_revoked_by IS NULL
              AND manual_settlement_revoked_at IS NULL
              AND manual_settlement_revoked_reason IS NULL
            ) OR (
              settlement_override_status IN ('ACTIVE', 'REVOKED')
              AND settlement_cycle_key IS NOT NULL
              AND source_import_id IS NOT NULL
              AND source_data_row_id IS NOT NULL
              AND source_obligation_key IS NOT NULL
              AND total_due > 0
              AND pool_amount > 0
              AND manual_settlement_date IS NOT NULL
              AND calling_date IS NOT NULL
              AND calling_window_end_exclusive IS NOT NULL
              AND manual_settlement_date >= calling_date
              AND manual_settlement_date < calling_window_end_exclusive
              AND char_length(trim(manual_settlement_reason)) BETWEEN 1 AND 64
              AND manual_settlement_reason IN (
                'EXTERNAL_UNASSIGNED_PAYMENT',
                'CLIENT_CONFIRMED_PAYMENT',
                'HISTORICAL_PAYMENT_NOT_CAPTURED',
                'OTHER_WITH_REQUIRED_NOTE'
              )
              AND (
                manual_settlement_reason <> 'OTHER_WITH_REQUIRED_NOTE'
                OR char_length(trim(COALESCE(manual_settlement_note, ''))) > 0
              )
              AND (manual_settlement_note IS NULL OR char_length(manual_settlement_note) <= 2000)
              AND (manual_settlement_reference IS NULL OR char_length(manual_settlement_reference) <= 200)
              AND manual_settlement_version >= 1
              AND manual_settlement_verified_by IS NOT NULL
              AND manual_settlement_verified_at IS NOT NULL
              AND manual_settlement_updated_by IS NOT NULL
              AND manual_settlement_updated_at IS NOT NULL
              AND (
                (
                  settlement_override_status = 'ACTIVE'
                  AND manual_settlement_revoked_by IS NULL
                  AND manual_settlement_revoked_at IS NULL
                  AND manual_settlement_revoked_reason IS NULL
                ) OR (
                  settlement_override_status = 'REVOKED'
                  AND manual_settlement_revoked_by IS NOT NULL
                  AND manual_settlement_revoked_at IS NOT NULL
                  AND char_length(trim(manual_settlement_revoked_reason)) BETWEEN 1 AND 500
                )
              )
            )
          );
        END IF;
      END $$;
    `,
    sql`
      DO $$
      BEGIN
        IF to_regclass('public.imports') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_collection_records_source_import_id'
              AND conrelid = 'public.collection_records'::regclass
              AND contype = 'f'
          ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT fk_collection_records_source_import_id
          FOREIGN KEY (source_import_id)
          REFERENCES public.imports(id)
          ON DELETE SET NULL
          ON UPDATE CASCADE;
        END IF;
      END $$;
    `,
    sql`
      DO $$
      BEGIN
        IF to_regclass('public.data_rows') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_collection_records_source_data_row_id'
              AND conrelid = 'public.collection_records'::regclass
              AND contype = 'f'
          ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT fk_collection_records_source_data_row_id
          FOREIGN KEY (source_data_row_id)
          REFERENCES public.data_rows(id)
          ON DELETE SET NULL
          ON UPDATE CASCADE;
        END IF;
      END $$;
    `,
    sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_collection_records_staff_username_matches_nickname'
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_staff_username_matches_nickname
          CHECK (lower(staff_username) = lower(collection_staff_nickname));
        END IF;
      END $$;
    `,
    sql`
      COMMENT ON COLUMN public.collection_records.amount
      IS 'Stored in MYR as numeric(14,2).'
    `,
    sql`
      COMMENT ON COLUMN public.collection_records.receipt_total_amount
      IS 'Stored in sen/cents as a bigint integer. Divide by 100 to render MYR.'
    `,
    sql`
      COMMENT ON COLUMN public.collection_records.pool_amount
      IS 'Verified external/unassigned payment in MYR; excluded from staff collection, receipts, and performance totals.'
    `,
  ]);

  await backfillCollectionRecordEncryptedPii(database);
  await backfillCollectionRecordPiiSearchHashes(database);
  await executeBootstrapStatements(database, [
    sql`
      DO $$
      BEGIN
        -- AUDIT2-FIX [M5]: Runtime bootstrap mirrors migration 0041 PII double-storage guards.
        UPDATE public.collection_records
        SET
          customer_name = CASE
            WHEN NULLIF(trim(COALESCE(customer_name_encrypted, '')), '') IS NOT NULL THEN NULL
            ELSE NULLIF(trim(COALESCE(customer_name, '')), '')
          END,
          ic_number = CASE
            WHEN NULLIF(trim(COALESCE(ic_number_encrypted, '')), '') IS NOT NULL THEN NULL
            ELSE NULLIF(trim(COALESCE(ic_number, '')), '')
          END,
          customer_phone = CASE
            WHEN NULLIF(trim(COALESCE(customer_phone_encrypted, '')), '') IS NOT NULL THEN NULL
            WHEN trim(COALESCE(customer_phone, '')) IN ('', '-') THEN NULL
            ELSE trim(customer_phone)
          END,
          account_number = CASE
            WHEN NULLIF(trim(COALESCE(account_number_encrypted, '')), '') IS NOT NULL THEN NULL
            ELSE NULLIF(trim(COALESCE(account_number, '')), '')
          END;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_collection_records_customer_name_pii_xor'
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_customer_name_pii_xor
          CHECK (
            NULLIF(trim(COALESCE(customer_name, '')), '') IS NULL
            OR NULLIF(trim(COALESCE(customer_name_encrypted, '')), '') IS NULL
          );
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_collection_records_ic_number_pii_xor'
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_ic_number_pii_xor
          CHECK (
            NULLIF(trim(COALESCE(ic_number, '')), '') IS NULL
            OR NULLIF(trim(COALESCE(ic_number_encrypted, '')), '') IS NULL
          );
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_collection_records_customer_phone_pii_xor'
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_customer_phone_pii_xor
          CHECK (
            CASE
              WHEN trim(COALESCE(customer_phone, '')) IN ('', '-') THEN NULL
              ELSE trim(customer_phone)
            END IS NULL
            OR NULLIF(trim(COALESCE(customer_phone_encrypted, '')), '') IS NULL
          );
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_collection_records_account_number_pii_xor'
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT chk_collection_records_account_number_pii_xor
          CHECK (
            NULLIF(trim(COALESCE(account_number, '')), '') IS NULL
            OR NULLIF(trim(COALESCE(account_number_encrypted, '')), '') IS NULL
          );
        END IF;
      END $$;
    `,
  ]);
}
