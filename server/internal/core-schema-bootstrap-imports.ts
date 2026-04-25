import { sql } from "drizzle-orm";
import type { CoreSchemaSqlExecutor } from "./core-schema-bootstrap-utils";

function isLegacyImportsBackfillEnabled(): boolean {
  const value = process.env.SQR_ENABLE_LEGACY_IMPORTS_BACKFILL?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export async function ensureCoreImportsTable(
  database: CoreSchemaSqlExecutor,
): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.imports (
      id text PRIMARY KEY,
      name text NOT NULL,
      filename text NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      is_deleted boolean DEFAULT false,
      created_by text
    )
  `);
  await database.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS name text`);
  await database.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS filename text`);
  await database.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false`);
  await database.execute(sql`ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_by text`);
  if (isLegacyImportsBackfillEnabled()) {
    await database.execute(sql`
      DO $$
      DECLARE
        legacy_created_at_column text;
        legacy_created_at_type text;
        legacy_is_deleted_column text;
        legacy_created_by_column text;
      BEGIN
        SELECT column_name, data_type INTO legacy_created_at_column, legacy_created_at_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'imports'
          AND column_name IN ('createdAt', 'createdat')
        ORDER BY CASE column_name WHEN 'createdAt' THEN 0 ELSE 1 END
        LIMIT 1;

        IF legacy_created_at_column IS NOT NULL AND legacy_created_at_type = 'timestamp with time zone' THEN
          EXECUTE format(
            'UPDATE public.imports SET created_at = %1$I WHERE %1$I IS NOT NULL AND created_at IS DISTINCT FROM %1$I',
            legacy_created_at_column
          );
        ELSIF legacy_created_at_column IS NOT NULL THEN
          EXECUTE format(
            'UPDATE public.imports SET created_at = %1$I AT TIME ZONE ''UTC'' WHERE %1$I IS NOT NULL AND created_at IS DISTINCT FROM (%1$I AT TIME ZONE ''UTC'')',
            legacy_created_at_column
          );
        END IF;

        SELECT column_name INTO legacy_is_deleted_column
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'imports'
          AND column_name IN ('isDeleted', 'isdeleted')
        ORDER BY CASE column_name WHEN 'isDeleted' THEN 0 ELSE 1 END
        LIMIT 1;

        IF legacy_is_deleted_column IS NOT NULL THEN
          EXECUTE format(
            'UPDATE public.imports SET is_deleted = %1$I::boolean WHERE %1$I IS NOT NULL AND is_deleted IS DISTINCT FROM %1$I::boolean',
            legacy_is_deleted_column
          );
        END IF;

        SELECT column_name INTO legacy_created_by_column
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'imports'
          AND column_name IN ('createdBy', 'createdby')
        ORDER BY CASE column_name WHEN 'createdBy' THEN 0 ELSE 1 END
        LIMIT 1;

        IF legacy_created_by_column IS NOT NULL THEN
          EXECUTE format(
            'UPDATE public.imports SET created_by = NULLIF(%1$I::text, '''') WHERE NULLIF(%1$I::text, '''') IS NOT NULL AND (created_by IS NULL OR btrim(created_by) = '''')',
            legacy_created_by_column
          );
        END IF;
      END $$;
    `);
  }
  await database.execute(sql`
    UPDATE public.imports
    SET
      name = COALESCE(NULLIF(name, ''), NULLIF(filename, ''), 'Untitled Import'),
      filename = COALESCE(NULLIF(filename, ''), COALESCE(NULLIF(name, ''), 'unknown.csv')),
      created_at = COALESCE(created_at, now()),
      is_deleted = COALESCE(is_deleted, false)
    WHERE
      name IS NULL
      OR btrim(name) = ''
      OR filename IS NULL
      OR btrim(filename) = ''
      OR created_at IS NULL
      OR is_deleted IS NULL
  `);
  await database.execute(sql`ALTER TABLE public.imports ALTER COLUMN name SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.imports ALTER COLUMN filename SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.imports ALTER COLUMN created_at SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.imports ALTER COLUMN is_deleted SET NOT NULL`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_created_at ON public.imports(created_at DESC)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_is_deleted ON public.imports(is_deleted)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_imports_created_by ON public.imports(created_by)`);
}

export async function ensureCoreDataRowsTable(
  database: CoreSchemaSqlExecutor,
): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.data_rows (
      id text PRIMARY KEY,
      import_id text NOT NULL,
      json_data jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await database.execute(sql`ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS import_id text`);
  await database.execute(sql`ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS json_data jsonb DEFAULT '{}'::jsonb`);
  if (isLegacyImportsBackfillEnabled()) {
    await database.execute(sql`
      DO $$
      DECLARE
        legacy_import_id_column text;
        legacy_json_column text;
        legacy_json_type text;
      BEGIN
        SELECT column_name INTO legacy_import_id_column
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'data_rows'
          AND column_name IN ('importId', 'importid')
        ORDER BY CASE column_name WHEN 'importId' THEN 0 ELSE 1 END
        LIMIT 1;

        IF legacy_import_id_column IS NOT NULL THEN
          EXECUTE format(
            'UPDATE public.data_rows SET import_id = NULLIF(%1$I::text, '''') WHERE (import_id IS NULL OR btrim(import_id) = '''') AND NULLIF(%1$I::text, '''') IS NOT NULL',
            legacy_import_id_column
          );
        END IF;

        SELECT column_name, udt_name INTO legacy_json_column, legacy_json_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'data_rows'
          AND column_name IN ('jsonDataJsonb', 'jsondatajsonb', 'jsonData', 'jsondata')
        ORDER BY CASE column_name
          WHEN 'jsonDataJsonb' THEN 0
          WHEN 'jsondatajsonb' THEN 1
          WHEN 'jsonData' THEN 2
          ELSE 3
        END
        LIMIT 1;

        IF legacy_json_column IS NOT NULL AND legacy_json_type IN ('jsonb', 'json') THEN
          EXECUTE format(
            'UPDATE public.data_rows SET json_data = %1$I::jsonb WHERE (json_data IS NULL OR json_data = ''{}''::jsonb) AND %1$I IS NOT NULL',
            legacy_json_column
          );
        END IF;
      END $$;
    `);
  }
  await database.execute(sql`
    UPDATE public.data_rows
    SET json_data = COALESCE(json_data, '{}'::jsonb)
    WHERE json_data IS NULL
  `);
  await database.execute(sql`
    DELETE FROM public.data_rows row_data
    WHERE row_data.import_id IS NOT NULL
      AND btrim(row_data.import_id) <> ''
      AND NOT EXISTS (
      SELECT 1
      FROM public.imports imp
      WHERE imp.id = row_data.import_id
    )
  `);
  await database.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM public.data_rows
        WHERE import_id IS NULL OR btrim(import_id) = ''
        LIMIT 1
      ) THEN
        ALTER TABLE public.data_rows ALTER COLUMN import_id SET NOT NULL;
      END IF;
    END $$;
  `);
  await database.execute(sql`ALTER TABLE public.data_rows ALTER COLUMN json_data SET NOT NULL`);
  await database.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_data_rows_import_id'
      ) AND NOT EXISTS (
        SELECT 1
        FROM public.data_rows
        WHERE import_id IS NULL OR btrim(import_id) = ''
        LIMIT 1
      ) AND NOT EXISTS (
        SELECT 1
        FROM public.data_rows row_data
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.imports imp
          WHERE imp.id = row_data.import_id
        )
        LIMIT 1
      ) THEN
        ALTER TABLE public.data_rows
        ADD CONSTRAINT fk_data_rows_import_id
        FOREIGN KEY (import_id)
        REFERENCES public.imports(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id ON public.data_rows(import_id)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_data_rows_import_id_id ON public.data_rows(import_id, id)`);
}
