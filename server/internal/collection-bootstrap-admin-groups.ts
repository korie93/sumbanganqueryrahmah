import { sql } from "drizzle-orm";
import { db } from "../db-postgres";

export async function ensureCollectionAdminGroupsTables(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.admin_groups (
      id uuid PRIMARY KEY,
      leader_nickname text NOT NULL,
      created_by text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.admin_group_members (
      id uuid PRIMARY KEY,
      admin_group_id uuid NOT NULL,
      member_nickname text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS leader_nickname text`);
  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_by text`);
  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await db.execute(sql`ALTER TABLE public.admin_groups ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);

  await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS admin_group_id uuid`);
  await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS member_nickname text`);
  await db.execute(sql`ALTER TABLE public.admin_group_members ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);

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
  await db.execute(sql`
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
  `);
}
