import { sql } from "drizzle-orm";
import type { CoreSchemaSqlExecutor } from "./core-schema-bootstrap-utils";

/** Equivalent to migration 0065; only used by explicit local bootstrap mode. */
export async function ensureViewerFilterPresetsTable(database: CoreSchemaSqlExecutor): Promise<void> {
  await database.execute(sql`CREATE TABLE IF NOT EXISTS public.viewer_filter_presets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    import_id text NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name text NOT NULL, column_filters jsonb NOT NULL, numeric_sort jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_viewer_presets_name CHECK (char_length(name) BETWEEN 1 AND 60 AND name = btrim(name) AND name !~ '[[:cntrl:]]'),
    CONSTRAINT chk_viewer_presets_payload CHECK (CASE WHEN jsonb_typeof(column_filters) = 'array' THEN jsonb_array_length(column_filters) <= 10 ELSE false END
      AND octet_length(column_filters::text) <= 131072
      AND (numeric_sort IS NULL OR (jsonb_typeof(numeric_sort) = 'object' AND octet_length(numeric_sort::text) <= 1024)))
  )`);
  await database.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_viewer_presets_owner_import_name ON public.viewer_filter_presets (owner_user_id, import_id, lower(name))`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_viewer_presets_import ON public.viewer_filter_presets (import_id)`);
}
