ALTER TABLE public.imports
ADD COLUMN IF NOT EXISTS content_hash_sha256 text;

ALTER TABLE public.imports
ADD COLUMN IF NOT EXISTS source_size_bytes bigint;

CREATE INDEX IF NOT EXISTS idx_imports_content_hash_sha256
ON public.imports(content_hash_sha256);

CREATE UNIQUE INDEX IF NOT EXISTS idx_imports_active_creator_hash_unique
ON public.imports(created_by, content_hash_sha256)
WHERE is_deleted = false
  AND created_by IS NOT NULL
  AND content_hash_sha256 IS NOT NULL;
