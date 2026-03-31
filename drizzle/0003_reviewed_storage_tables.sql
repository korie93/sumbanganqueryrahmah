CREATE TABLE IF NOT EXISTS public.imports (
  id text PRIMARY KEY,
  name text NOT NULL,
  filename text NOT NULL,
  created_at timestamp DEFAULT now(),
  is_deleted boolean DEFAULT false,
  created_by text
);

ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS filename text;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS created_by text;

UPDATE public.imports
SET
  name = COALESCE(NULLIF(name, ''), NULLIF(filename, ''), 'Untitled Import'),
  filename = COALESCE(NULLIF(filename, ''), COALESCE(NULLIF(name, ''), 'unknown.csv')),
  created_at = COALESCE(created_at, now()),
  is_deleted = COALESCE(is_deleted, false);

ALTER TABLE public.imports ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.imports ALTER COLUMN filename SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_imports_created_at
ON public.imports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_imports_is_deleted
ON public.imports(is_deleted);

CREATE INDEX IF NOT EXISTS idx_imports_created_by
ON public.imports(created_by);

CREATE TABLE IF NOT EXISTS public.data_rows (
  id text PRIMARY KEY,
  import_id text NOT NULL,
  json_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS import_id text;
ALTER TABLE public.data_rows ADD COLUMN IF NOT EXISTS json_data jsonb DEFAULT '{}'::jsonb;

UPDATE public.data_rows
SET json_data = COALESCE(json_data, '{}'::jsonb);

DELETE FROM public.data_rows row_data
WHERE NOT EXISTS (
  SELECT 1
  FROM public.imports imp
  WHERE imp.id = row_data.import_id
);

ALTER TABLE public.data_rows ALTER COLUMN import_id SET NOT NULL;
ALTER TABLE public.data_rows ALTER COLUMN json_data SET NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_data_rows_import_id
ON public.data_rows(import_id);

CREATE TABLE IF NOT EXISTS public.user_activity (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  username text NOT NULL,
  role text NOT NULL,
  pc_name text,
  browser text,
  fingerprint text,
  ip_address text,
  login_time timestamp,
  logout_time timestamp,
  last_activity_time timestamp,
  is_active boolean DEFAULT true,
  logout_reason text
);

ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS pc_name text;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS browser text;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS fingerprint text;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS login_time timestamp;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_time timestamp;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS last_activity_time timestamp;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.user_activity ADD COLUMN IF NOT EXISTS logout_reason text;

UPDATE public.user_activity
SET
  is_active = COALESCE(is_active, true),
  login_time = COALESCE(login_time, now()),
  last_activity_time = COALESCE(last_activity_time, login_time, now());

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    DELETE FROM public.user_activity activity
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users usr
      WHERE usr.id = activity.user_id
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_user_activity_user_id'
    ) THEN
      ALTER TABLE public.user_activity
      ADD CONSTRAINT fk_user_activity_user_id
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_activity_user_id
ON public.user_activity(user_id);

CREATE INDEX IF NOT EXISTS idx_user_activity_username
ON public.user_activity(username);

CREATE INDEX IF NOT EXISTS idx_user_activity_is_active
ON public.user_activity(is_active);

CREATE INDEX IF NOT EXISTS idx_user_activity_login_time
ON public.user_activity(login_time DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_logout_time
ON public.user_activity(logout_time DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_last_activity_time
ON public.user_activity(last_activity_time DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_fingerprint
ON public.user_activity(fingerprint);

CREATE INDEX IF NOT EXISTS idx_user_activity_ip_address
ON public.user_activity(ip_address);

CREATE TABLE IF NOT EXISTS public.backups (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp DEFAULT now(),
  created_by text NOT NULL,
  backup_data text NOT NULL,
  metadata text
);

ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_at timestamp;
ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS backup_data text;
ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS metadata text;
