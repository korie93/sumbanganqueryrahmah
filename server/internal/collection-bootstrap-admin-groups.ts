import { sql } from "drizzle-orm";
import { db } from "../db-postgres";

export async function ensureCollectionAdminGroupsTables(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.admin_groups (
      id uuid PRIMARY KEY,
      leader_nickname_id uuid,
      leader_nickname text NOT NULL,
      created_by text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.admin_group_members (
      id uuid PRIMARY KEY,
      admin_group_id uuid NOT NULL,
      member_nickname_id uuid,
      member_nickname text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS leader_nickname text`);
  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS leader_nickname_id uuid`);
  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_by text`);
  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await db.execute(sql`ALTER TABLE public.admin_groups ALTER COLUMN created_by DROP NOT NULL`);

  await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS admin_group_id uuid`);
  await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS member_nickname text`);
  await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS member_nickname_id uuid`);
  await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);

  await db.execute(sql`
    UPDATE public.admin_groups
    SET
      leader_nickname = trim(COALESCE(leader_nickname, '')),
      created_by = NULLIF(trim(COALESCE(created_by, '')), ''),
      created_at = COALESCE(created_at, now()),
      updated_at = COALESCE(updated_at, now())
  `);
  await db.execute(sql`
    UPDATE public.admin_groups admin_group
    SET created_by = usr.username
    FROM public.users usr
    WHERE admin_group.created_by IS NOT NULL
      AND lower(usr.username) = lower(admin_group.created_by)
  `);
  await db.execute(sql`
    UPDATE public.admin_groups
    SET created_by = NULL
    WHERE created_by IS NOT NULL
      AND (
        lower(created_by) = 'system-seed'
        OR NOT EXISTS (
          SELECT 1
          FROM public.users usr
          WHERE usr.username = public.admin_groups.created_by
        )
      )
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
    UPDATE public.admin_groups admin_group
    SET leader_nickname_id = nickname.id
    FROM public.collection_staff_nicknames nickname
    WHERE admin_group.leader_nickname_id IS NULL
      AND lower(nickname.nickname) = lower(admin_group.leader_nickname)
  `);
  await db.execute(sql`
    UPDATE public.admin_group_members member
    SET member_nickname_id = nickname.id
    FROM public.collection_staff_nicknames nickname
    WHERE member.member_nickname_id IS NULL
      AND lower(nickname.nickname) = lower(member.member_nickname)
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.admin_groups WHERE leader_nickname_id IS NULL) THEN
        RAISE EXCEPTION 'Admin group leader lacks a stable collection nickname identity.';
      END IF;
      IF EXISTS (SELECT 1 FROM public.admin_group_members WHERE member_nickname_id IS NULL) THEN
        RAISE EXCEPTION 'Admin group member lacks a stable collection nickname identity.';
      END IF;
    END $$
  `);
  await db.execute(sql`
    UPDATE public.admin_groups admin_group
    SET leader_nickname = nickname.nickname
    FROM public.collection_staff_nicknames nickname
    WHERE nickname.id = admin_group.leader_nickname_id
      AND admin_group.leader_nickname IS DISTINCT FROM nickname.nickname
  `);
  await db.execute(sql`
    UPDATE public.admin_group_members member
    SET member_nickname = nickname.nickname
    FROM public.collection_staff_nicknames nickname
    WHERE nickname.id = member.member_nickname_id
      AND member.member_nickname IS DISTINCT FROM nickname.nickname
  `);
  await db.execute(sql`ALTER TABLE public.admin_groups ALTER COLUMN leader_nickname_id SET NOT NULL`);
  await db.execute(sql`ALTER TABLE public.admin_group_members ALTER COLUMN member_nickname_id SET NOT NULL`);

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
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_groups_leader_nickname_id_unique
    ON public.admin_groups (leader_nickname_id)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_group_member_nickname_id_unique
    ON public.admin_group_members (admin_group_id, member_nickname_id)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_member_nickname_id_unique
    ON public.admin_group_members (member_nickname_id)
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_admin_groups_created_by_username'
      ) THEN
        ALTER TABLE public.admin_groups
        ADD CONSTRAINT fk_admin_groups_created_by_username
        FOREIGN KEY (created_by)
        REFERENCES public.users(username)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      END IF;

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

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_admin_groups_leader_nickname_id'
      ) THEN
        ALTER TABLE public.admin_groups
        ADD CONSTRAINT fk_admin_groups_leader_nickname_id
        FOREIGN KEY (leader_nickname_id)
        REFERENCES public.collection_staff_nicknames(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_admin_group_members_member_nickname_id'
      ) THEN
        ALTER TABLE public.admin_group_members
        ADD CONSTRAINT fk_admin_group_members_member_nickname_id
        FOREIGN KEY (member_nickname_id)
        REFERENCES public.collection_staff_nicknames(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT;
      END IF;
    END $$;
  `);
}
