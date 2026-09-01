-- Restore Collection source-governance foreign keys when runtime bootstrap created
-- the governance tables before one or more legacy dependency tables existed.
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
