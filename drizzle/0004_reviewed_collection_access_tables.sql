CREATE TABLE IF NOT EXISTS public.collection_staff_nicknames (
  id uuid PRIMARY KEY,
  nickname text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  role_scope text NOT NULL DEFAULT 'both',
  nickname_password_hash text,
  must_change_password boolean NOT NULL DEFAULT true,
  password_reset_by_superuser boolean NOT NULL DEFAULT false,
  password_updated_at timestamp,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS role_scope text DEFAULT 'both';
ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname_password_hash text;
ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true;
ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_reset_by_superuser boolean DEFAULT false;
ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_updated_at timestamp;
ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

UPDATE public.collection_staff_nicknames
SET
  nickname = trim(COALESCE(nickname, '')),
  is_active = COALESCE(is_active, true),
  role_scope = CASE
    WHEN lower(trim(COALESCE(role_scope, ''))) IN ('admin', 'user', 'both')
      THEN lower(trim(COALESCE(role_scope, '')))
    ELSE 'both'
  END,
  nickname_password_hash = NULLIF(trim(COALESCE(nickname_password_hash, '')), ''),
  must_change_password = COALESCE(
    must_change_password,
    CASE
      WHEN NULLIF(trim(COALESCE(nickname_password_hash, '')), '') IS NULL THEN true
      ELSE false
    END
  ),
  password_reset_by_superuser = COALESCE(password_reset_by_superuser, false),
  created_at = COALESCE(created_at, now());

DELETE FROM public.collection_staff_nicknames
WHERE nickname = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_staff_nicknames_lower_unique
ON public.collection_staff_nicknames(lower(nickname));

CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_active
ON public.collection_staff_nicknames(is_active);

CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_role_scope
ON public.collection_staff_nicknames(role_scope);

CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_must_change_password
ON public.collection_staff_nicknames(must_change_password);

CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_password_reset
ON public.collection_staff_nicknames(password_reset_by_superuser);

CREATE TABLE IF NOT EXISTS public.admin_groups (
  id uuid PRIMARY KEY,
  leader_nickname text NOT NULL,
  created_by text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_group_members (
  id uuid PRIMARY KEY,
  admin_group_id uuid NOT NULL,
  member_nickname text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS leader_nickname text;
ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS admin_group_id uuid;
ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS member_nickname text;
ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

UPDATE public.admin_groups
SET
  leader_nickname = trim(COALESCE(leader_nickname, '')),
  created_by = COALESCE(NULLIF(trim(COALESCE(created_by, '')), ''), 'system-seed'),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

DELETE FROM public.admin_groups
WHERE trim(COALESCE(leader_nickname, '')) = '';

UPDATE public.admin_group_members
SET
  member_nickname = trim(COALESCE(member_nickname, '')),
  created_at = COALESCE(created_at, now());

DELETE FROM public.admin_group_members
WHERE trim(COALESCE(member_nickname, '')) = '';

DELETE FROM public.admin_group_members m
WHERE m.admin_group_id IS NULL
   OR NOT EXISTS (
    SELECT 1
    FROM public.admin_groups g
    WHERE g.id = m.admin_group_id
  );

DELETE FROM public.admin_group_members m
USING public.admin_groups g
WHERE g.id = m.admin_group_id
  AND lower(g.leader_nickname) = lower(m.member_nickname);

DELETE FROM public.admin_groups a
USING public.admin_groups b
WHERE lower(a.leader_nickname) = lower(b.leader_nickname)
  AND a.ctid > b.ctid;

DELETE FROM public.admin_group_members a
USING public.admin_group_members b
WHERE a.admin_group_id = b.admin_group_id
  AND lower(a.member_nickname) = lower(b.member_nickname)
  AND a.ctid > b.ctid;

DELETE FROM public.admin_group_members a
USING public.admin_group_members b
WHERE lower(a.member_nickname) = lower(b.member_nickname)
  AND a.ctid > b.ctid;

DELETE FROM public.admin_group_members m
WHERE EXISTS (
  SELECT 1
  FROM public.admin_groups g
  WHERE lower(g.leader_nickname) = lower(m.member_nickname)
    AND g.id <> m.admin_group_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_groups_leader_nickname_unique
ON public.admin_groups(lower(leader_nickname));

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_group_member_unique
ON public.admin_group_members(admin_group_id, lower(member_nickname));

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_member_unique
ON public.admin_group_members(lower(member_nickname));

CREATE INDEX IF NOT EXISTS idx_admin_group_members_group
ON public.admin_group_members(admin_group_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_admin_group_members_admin_group_id'
  ) THEN
    ALTER TABLE public.admin_group_members
    ADD CONSTRAINT fk_admin_group_members_admin_group_id
    FOREIGN KEY (admin_group_id)
    REFERENCES public.admin_groups(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.collection_nickname_sessions (
  activity_id text PRIMARY KEY,
  username text NOT NULL,
  user_role text NOT NULL,
  nickname text NOT NULL,
  verified_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS user_role text;
ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS verified_at timestamp DEFAULT now();
ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

UPDATE public.collection_nickname_sessions
SET
  username = trim(COALESCE(username, '')),
  user_role = trim(COALESCE(user_role, '')),
  nickname = trim(COALESCE(nickname, '')),
  verified_at = COALESCE(verified_at, now()),
  updated_at = COALESCE(updated_at, now());

DELETE FROM public.collection_nickname_sessions
WHERE trim(COALESCE(username, '')) = ''
  OR trim(COALESCE(user_role, '')) = ''
  OR trim(COALESCE(nickname, '')) = '';

DELETE FROM public.collection_nickname_sessions session
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_activity activity
  WHERE activity.id = session.activity_id
);

CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_username
ON public.collection_nickname_sessions(username);

CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_nickname
ON public.collection_nickname_sessions(lower(nickname));

CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_updated_at
ON public.collection_nickname_sessions(updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_collection_nickname_sessions_activity_id'
  ) THEN
    ALTER TABLE public.collection_nickname_sessions
    ADD CONSTRAINT fk_collection_nickname_sessions_activity_id
    FOREIGN KEY (activity_id)
    REFERENCES public.user_activity(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_visible_nicknames (
  id uuid PRIMARY KEY,
  admin_user_id text NOT NULL,
  nickname_id uuid NOT NULL,
  created_by_superuser text,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS admin_user_id text;
ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS nickname_id uuid;
ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_by_superuser text;
ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();

UPDATE public.admin_visible_nicknames
SET created_at = COALESCE(created_at, now());

DELETE FROM public.admin_visible_nicknames avn
WHERE avn.admin_user_id IS NULL
  OR avn.nickname_id IS NULL;

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    DELETE FROM public.admin_visible_nicknames avn
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = avn.admin_user_id
        AND u.role = 'admin'
    );
  END IF;
END $$;

DELETE FROM public.admin_visible_nicknames avn
WHERE NOT EXISTS (
  SELECT 1
  FROM public.collection_staff_nicknames c
  WHERE c.id = avn.nickname_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_visible_nicknames_admin_nickname_unique
ON public.admin_visible_nicknames(admin_user_id, nickname_id);

CREATE INDEX IF NOT EXISTS idx_admin_visible_nicknames_admin
ON public.admin_visible_nicknames(admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_visible_nicknames_nickname
ON public.admin_visible_nicknames(nickname_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_admin_visible_nicknames_nickname_id'
  ) THEN
    ALTER TABLE public.admin_visible_nicknames
    ADD CONSTRAINT fk_admin_visible_nicknames_nickname_id
    FOREIGN KEY (nickname_id)
    REFERENCES public.collection_staff_nicknames(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.users') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_admin_visible_nicknames_admin_user_id'
    ) THEN
    ALTER TABLE public.admin_visible_nicknames
    ADD CONSTRAINT fk_admin_visible_nicknames_admin_user_id
    FOREIGN KEY (admin_user_id)
    REFERENCES public.users(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE;
  END IF;
END $$;
