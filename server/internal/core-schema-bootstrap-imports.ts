import { sql } from "drizzle-orm";
import type { CoreSchemaSqlExecutor } from "./core-schema-bootstrap-utils";

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
  await database.execute(sql`
    UPDATE public.imports
    SET
      name = COALESCE(NULLIF(name, ''), NULLIF(filename, ''), 'Untitled Import'),
      filename = COALESCE(NULLIF(filename, ''), COALESCE(NULLIF(name, ''), 'unknown.csv')),
      created_at = COALESCE(created_at, now()),
      is_deleted = COALESCE(is_deleted, false)
  `);
  await database.execute(sql`ALTER TABLE public.imports ALTER COLUMN name SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.imports ALTER COLUMN filename SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.imports ALTER COLUMN created_at SET NOT NULL`);
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
  await database.execute(sql`
    UPDATE public.data_rows
    SET json_data = COALESCE(json_data, '{}'::jsonb)
  `);
  await database.execute(sql`
    DELETE FROM public.data_rows row_data
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.imports imp
      WHERE imp.id = row_data.import_id
    )
  `);
  await database.execute(sql`ALTER TABLE public.data_rows ALTER COLUMN import_id SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.data_rows ALTER COLUMN json_data SET NOT NULL`);
  await database.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_data_rows_import_id'
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
}
