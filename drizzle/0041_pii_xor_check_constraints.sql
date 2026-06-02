-- AUDIT2-FIX [M5]: Add CHECK constraints to prevent plaintext/encrypted PII double storage.
-- Migration: 0041_pii_xor_check_constraints.sql
-- Generated: 2026-06-02
-- Safe to re-run: YES (guards constraint creation and normalizes legacy rows first).

DO $$
BEGIN
  IF to_regclass('public.collection_records') IS NOT NULL THEN
    EXECUTE $audit2_m5_cleanup$
      UPDATE public.collection_records
      SET
        customer_name_encrypted = NULLIF(trim(COALESCE(customer_name_encrypted, '')), ''),
        customer_name = CASE
          WHEN NULLIF(trim(COALESCE(customer_name_encrypted, '')), '') IS NOT NULL THEN NULL
          ELSE NULLIF(trim(COALESCE(customer_name, '')), '')
        END,
        ic_number_encrypted = NULLIF(trim(COALESCE(ic_number_encrypted, '')), ''),
        ic_number = CASE
          WHEN NULLIF(trim(COALESCE(ic_number_encrypted, '')), '') IS NOT NULL THEN NULL
          ELSE NULLIF(trim(COALESCE(ic_number, '')), '')
        END,
        customer_phone_encrypted = NULLIF(trim(COALESCE(customer_phone_encrypted, '')), ''),
        customer_phone = CASE
          WHEN NULLIF(trim(COALESCE(customer_phone_encrypted, '')), '') IS NOT NULL THEN NULL
          WHEN trim(COALESCE(customer_phone, '')) IN ('', '-') THEN NULL
          ELSE trim(customer_phone)
        END,
        account_number_encrypted = NULLIF(trim(COALESCE(account_number_encrypted, '')), ''),
        account_number = CASE
          WHEN NULLIF(trim(COALESCE(account_number_encrypted, '')), '') IS NOT NULL THEN NULL
          ELSE NULLIF(trim(COALESCE(account_number, '')), '')
        END
    $audit2_m5_cleanup$;

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
      RAISE NOTICE 'AUDIT2-FIX [M5]: Added chk_collection_records_customer_name_pii_xor constraint';
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
      RAISE NOTICE 'AUDIT2-FIX [M5]: Added chk_collection_records_ic_number_pii_xor constraint';
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
      RAISE NOTICE 'AUDIT2-FIX [M5]: Added chk_collection_records_customer_phone_pii_xor constraint';
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
      RAISE NOTICE 'AUDIT2-FIX [M5]: Added chk_collection_records_account_number_pii_xor constraint';
    END IF;
  END IF;
END;
$$;
