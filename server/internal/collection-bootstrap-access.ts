import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";

export async function ensureCollectionStaffNicknamesTable(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
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
    )
  `);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname text`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS role_scope text DEFAULT 'both'`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname_password_hash text`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_reset_by_superuser boolean DEFAULT false`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_updated_at timestamp`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_by text`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
  await db.execute(sql`
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
      created_at = COALESCE(created_at, now())
  `);
  await db.execute(sql`DELETE FROM public.collection_staff_nicknames WHERE nickname = ''`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_staff_nicknames_lower_unique ON public.collection_staff_nicknames(lower(nickname))`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_active ON public.collection_staff_nicknames(is_active)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_role_scope ON public.collection_staff_nicknames(role_scope)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_must_change_password ON public.collection_staff_nicknames(must_change_password)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_collection_staff_nicknames_password_reset ON public.collection_staff_nicknames(password_reset_by_superuser)`);

  const seedRows = await db.execute(sql`
    SELECT DISTINCT trim(collection_staff_nickname) AS nickname
    FROM public.collection_records
    WHERE collection_staff_nickname IS NOT NULL
      AND trim(collection_staff_nickname) <> ''
    LIMIT 5000
  `);
  for (const row of seedRows.rows as Array<{ nickname?: string }>) {
    const nickname = String(row.nickname || "").trim();
    if (!nickname) continue;
    await db.execute(sql`
      INSERT INTO public.collection_staff_nicknames (
        id,
        nickname,
        is_active,
        nickname_password_hash,
        must_change_password,
        password_reset_by_superuser,
        password_updated_at,
        created_by,
        created_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${nickname},
        true,
        NULL,
        true,
        false,
        NULL,
        'system-seed',
        now()
      )
      ON CONFLICT ((lower(nickname))) DO NOTHING
    `);
  }
}

export async function ensureCollectionAdminGroupsTables(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.admin_groups (
      id uuid PRIMARY KEY,
      leader_nickname text NOT NULL,
      created_by text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.admin_group_members (
      id uuid PRIMARY KEY,
      admin_group_id uuid NOT NULL,
      member_nickname text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS leader_nickname text`);
  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_by text`);
  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);

  await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS admin_group_id uuid`);
  await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS member_nickname text`);
  await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);

  await db.execute(sql`
    UPDATE public.admin_groups
    SET
      leader_nickname = trim(COALESCE(leader_nickname, '')),
      created_by = COALESCE(NULLIF(trim(COALESCE(created_by, '')), ''), 'system-seed'),
      created_at = COALESCE(created_at, now()),
      updated_at = COALESCE(updated_at, now())
  `);
  await db.execute(sql`DELETE FROM public.admin_groups WHERE trim(COALESCE(leader_nickname, '')) = ''`);

  await db.execute(sql`
    UPDATE public.admin_group_members
    SET
      member_nickname = trim(COALESCE(member_nickname, '')),
      created_at = COALESCE(created_at, now())
  `);
  await db.execute(sql`DELETE FROM public.admin_group_members WHERE trim(COALESCE(member_nickname, '')) = ''`);
  await db.execute(sql`
    DELETE FROM public.admin_group_members m
    WHERE m.admin_group_id IS NULL
       OR NOT EXISTS (
        SELECT 1
        FROM public.admin_groups g
        WHERE g.id = m.admin_group_id
      )
  `);

  await db.execute(sql`
    DELETE FROM public.admin_group_members m
    USING public.admin_groups g
    WHERE g.id = m.admin_group_id
      AND lower(g.leader_nickname) = lower(m.member_nickname)
  `);

  await db.execute(sql`
    DELETE FROM public.admin_groups a
    USING public.admin_groups b
    WHERE lower(a.leader_nickname) = lower(b.leader_nickname)
      AND a.ctid > b.ctid
  `);

  await db.execute(sql`
    DELETE FROM public.admin_group_members a
    USING public.admin_group_members b
    WHERE a.admin_group_id = b.admin_group_id
      AND lower(a.member_nickname) = lower(b.member_nickname)
      AND a.ctid > b.ctid
  `);

  await db.execute(sql`
    DELETE FROM public.admin_group_members a
    USING public.admin_group_members b
    WHERE lower(a.member_nickname) = lower(b.member_nickname)
      AND a.ctid > b.ctid
  `);

  await db.execute(sql`
    DELETE FROM public.admin_group_members m
    WHERE EXISTS (
      SELECT 1
      FROM public.admin_groups g
      WHERE lower(g.leader_nickname) = lower(m.member_nickname)
        AND g.id <> m.admin_group_id
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_groups_leader_nickname_unique
    ON public.admin_groups (lower(leader_nickname))
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_group_member_unique
    ON public.admin_group_members (admin_group_id, lower(member_nickname))
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_member_unique
    ON public.admin_group_members (lower(member_nickname))
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_admin_group_members_group
    ON public.admin_group_members (admin_group_id)
  `);
}

export async function ensureCollectionNicknameSessionsTable(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.collection_nickname_sessions (
      activity_id text PRIMARY KEY,
      username text NOT NULL,
      user_role text NOT NULL,
      nickname text NOT NULL,
      verified_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS username text`);
  await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS user_role text`);
  await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS nickname text`);
  await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS verified_at timestamp DEFAULT now()`);
  await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
  await db.execute(sql`
    UPDATE public.collection_nickname_sessions
    SET
      username = trim(COALESCE(username, '')),
      user_role = trim(COALESCE(user_role, '')),
      nickname = trim(COALESCE(nickname, '')),
      verified_at = COALESCE(verified_at, now()),
      updated_at = COALESCE(updated_at, now())
  `);
  await db.execute(sql`
    DELETE FROM public.collection_nickname_sessions
    WHERE trim(COALESCE(username, '')) = ''
      OR trim(COALESCE(user_role, '')) = ''
      OR trim(COALESCE(nickname, '')) = ''
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_username
    ON public.collection_nickname_sessions (username)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_nickname
    ON public.collection_nickname_sessions (lower(nickname))
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_collection_nickname_sessions_updated_at
    ON public.collection_nickname_sessions (updated_at DESC)
  `);
}

export async function ensureCollectionAdminVisibleNicknamesTable(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.admin_visible_nicknames (
      id uuid PRIMARY KEY,
      admin_user_id text NOT NULL,
      nickname_id uuid NOT NULL,
      created_by_superuser text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS admin_user_id text`);
  await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS nickname_id uuid`);
  await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_by_superuser text`);
  await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
  await db.execute(sql`
    UPDATE public.admin_visible_nicknames
    SET created_at = COALESCE(created_at, now())
  `);
  await db.execute(sql`
    DELETE FROM public.admin_visible_nicknames avn
    WHERE avn.admin_user_id IS NULL
      OR avn.nickname_id IS NULL
  `);
  await db.execute(sql`
    DELETE FROM public.admin_visible_nicknames avn
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = avn.admin_user_id
        AND u.role = 'admin'
    )
  `);
  await db.execute(sql`
    DELETE FROM public.admin_visible_nicknames avn
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.collection_staff_nicknames c
      WHERE c.id = avn.nickname_id
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_visible_nicknames_admin_nickname_unique
    ON public.admin_visible_nicknames(admin_user_id, nickname_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_admin_visible_nicknames_admin
    ON public.admin_visible_nicknames(admin_user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_admin_visible_nicknames_nickname
    ON public.admin_visible_nicknames(nickname_id)
  `);

  const existingCount = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM public.admin_visible_nicknames
    LIMIT 1
  `);
  const total = Number(existingCount.rows?.[0]?.total ?? 0);
  if (total !== 0) {
    return;
  }

  const admins = await db.execute(sql`
    SELECT id
    FROM public.users
    WHERE role = 'admin'
    ORDER BY username ASC
    LIMIT 5000
  `);
  const nicknames = await db.execute(sql`
    SELECT id
    FROM public.collection_staff_nicknames
    WHERE is_active = true
    ORDER BY lower(nickname) ASC
    LIMIT 5000
  `);

  const adminIds = (admins.rows || [])
    .map((row: any) => String(row.id || "").trim())
    .filter(Boolean);
  const nicknameIds = (nicknames.rows || [])
    .map((row: any) => String(row.id || "").trim())
    .filter(Boolean);

  for (const adminUserId of adminIds) {
    for (const nicknameId of nicknameIds) {
      await db.execute(sql`
        INSERT INTO public.admin_visible_nicknames (
          id,
          admin_user_id,
          nickname_id,
          created_by_superuser,
          created_at
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${adminUserId},
          ${nicknameId}::uuid,
          'system-seed',
          now()
        )
        ON CONFLICT (admin_user_id, nickname_id) DO NOTHING
      `);
    }
  }
}
