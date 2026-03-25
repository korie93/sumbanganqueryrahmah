DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping pgcrypto extension install because the current role lacks privilege.';
    WHEN undefined_file THEN
      RAISE NOTICE 'Skipping pgcrypto extension install because the extension is not available on this server.';
  END;
END
$$;

CREATE TABLE IF NOT EXISTS public.setting_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.setting_categories(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  type text NOT NULL,
  value text NOT NULL,
  default_value text,
  is_critical boolean DEFAULT false,
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.setting_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id uuid REFERENCES public.system_settings(id) ON DELETE CASCADE,
  value text NOT NULL,
  label text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.role_setting_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  setting_key text NOT NULL,
  can_view boolean DEFAULT false,
  can_edit boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.setting_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamp DEFAULT now()
);

UPDATE public.setting_categories
SET
  name = trim(COALESCE(name, '')),
  description = NULLIF(trim(COALESCE(description, '')), ''),
  created_at = COALESCE(created_at, now());

DELETE FROM public.setting_categories
WHERE trim(COALESCE(name, '')) = '';

UPDATE public.system_settings
SET
  key = trim(COALESCE(key, '')),
  label = trim(COALESCE(label, '')),
  description = NULLIF(trim(COALESCE(description, '')), ''),
  type = trim(COALESCE(type, '')),
  value = COALESCE(value, ''),
  default_value = COALESCE(default_value, ''),
  is_critical = COALESCE(is_critical, false),
  updated_at = COALESCE(updated_at, now());

DELETE FROM public.system_settings
WHERE trim(COALESCE(key, '')) = ''
  OR trim(COALESCE(label, '')) = ''
  OR trim(COALESCE(type, '')) = '';

UPDATE public.setting_options
SET
  value = trim(COALESCE(value, '')),
  label = trim(COALESCE(label, ''));

DELETE FROM public.setting_options
WHERE trim(COALESCE(value, '')) = ''
  OR trim(COALESCE(label, '')) = ''
  OR setting_id IS NULL;

WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (PARTITION BY setting_id, value ORDER BY id) AS rn
  FROM public.setting_options
)
DELETE FROM public.setting_options so
USING ranked r
WHERE so.ctid = r.ctid
  AND r.rn > 1;

UPDATE public.role_setting_permissions
SET
  role = lower(trim(COALESCE(role, ''))),
  setting_key = trim(COALESCE(setting_key, '')),
  can_view = COALESCE(can_view, false),
  can_edit = COALESCE(can_edit, false);

DELETE FROM public.role_setting_permissions
WHERE trim(COALESCE(role, '')) = ''
  OR trim(COALESCE(setting_key, '')) = '';

UPDATE public.setting_versions
SET
  setting_key = trim(COALESCE(setting_key, '')),
  changed_by = trim(COALESCE(changed_by, '')),
  old_value = COALESCE(old_value, ''),
  new_value = COALESCE(new_value, ''),
  changed_at = COALESCE(changed_at, now());

DELETE FROM public.setting_versions
WHERE trim(COALESCE(setting_key, '')) = ''
  OR trim(COALESCE(changed_by, '')) = ''
  OR new_value IS NULL;

UPDATE public.feature_flags
SET
  key = trim(COALESCE(key, '')),
  description = NULLIF(trim(COALESCE(description, '')), ''),
  enabled = COALESCE(enabled, false),
  updated_at = COALESCE(updated_at, now());

DELETE FROM public.feature_flags
WHERE trim(COALESCE(key, '')) = '';

CREATE UNIQUE INDEX IF NOT EXISTS setting_categories_name_unique
ON public.setting_categories(name);

CREATE UNIQUE INDEX IF NOT EXISTS system_settings_key_unique
ON public.system_settings(key);

CREATE INDEX IF NOT EXISTS system_settings_category_id_idx
ON public.system_settings(category_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_options_unique_value
ON public.setting_options(setting_id, value);

CREATE INDEX IF NOT EXISTS idx_setting_options_setting_id
ON public.setting_options(setting_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_setting_permissions_unique
ON public.role_setting_permissions(role, setting_key);

CREATE INDEX IF NOT EXISTS idx_setting_versions_key_time
ON public.setting_versions(setting_key, changed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_key_unique
ON public.feature_flags(key);
