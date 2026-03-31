DO $$
DECLARE
  vector_available boolean := false;
BEGIN
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping pgvector extension install because the current role lacks privilege.';
    WHEN undefined_file OR feature_not_supported THEN
      RAISE NOTICE 'Skipping pgvector extension install because the extension is not available on this server.';
  END;

  SELECT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'vector'
  ) INTO vector_available;

  IF NOT vector_available THEN
    RAISE NOTICE 'Skipping data_embeddings reviewed migration because pgvector is unavailable.';
    RETURN;
  END IF;

  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS public.data_embeddings (
      id text PRIMARY KEY,
      import_id text NOT NULL,
      row_id text NOT NULL UNIQUE,
      content text NOT NULL,
      embedding vector(768) NOT NULL,
      created_at timestamp DEFAULT now()
    )
  $sql$;

  EXECUTE 'ALTER TABLE public.data_embeddings ADD COLUMN IF NOT EXISTS import_id text';
  EXECUTE 'ALTER TABLE public.data_embeddings ADD COLUMN IF NOT EXISTS row_id text';
  EXECUTE 'ALTER TABLE public.data_embeddings ADD COLUMN IF NOT EXISTS content text';
  EXECUTE 'ALTER TABLE public.data_embeddings ADD COLUMN IF NOT EXISTS embedding vector(768)';
  EXECUTE 'ALTER TABLE public.data_embeddings ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()';
  EXECUTE 'UPDATE public.data_embeddings SET created_at = COALESCE(created_at, now())';
  IF to_regclass('public.imports') IS NOT NULL AND to_regclass('public.data_rows') IS NOT NULL THEN
    EXECUTE '
      DELETE FROM public.data_embeddings embedding
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.imports imp
        WHERE imp.id = embedding.import_id
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.data_rows row_data
        WHERE row_data.id = embedding.row_id
      )
    ';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_data_embeddings_import_id'
    ) THEN
      EXECUTE '
        ALTER TABLE public.data_embeddings
        ADD CONSTRAINT fk_data_embeddings_import_id
        FOREIGN KEY (import_id)
        REFERENCES public.imports(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
      ';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_data_embeddings_row_id'
    ) THEN
      EXECUTE '
        ALTER TABLE public.data_embeddings
        ADD CONSTRAINT fk_data_embeddings_row_id
        FOREIGN KEY (row_id)
        REFERENCES public.data_rows(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
      ';
    END IF;
  END IF;
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS data_embeddings_row_id_unique ON public.data_embeddings(row_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_data_embeddings_import_id ON public.data_embeddings(import_id)';

  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_data_embeddings_vector ON public.data_embeddings USING ivfflat (embedding vector_cosine_ops)';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Skipping ivfflat index creation for data_embeddings; pgvector indexing is not currently available.';
  END;
END
$$;
