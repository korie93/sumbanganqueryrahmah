import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";

type IdRow = {
  id?: unknown;
};

function readIds(rows: unknown[] | undefined): string[] {
  return (Array.isArray(rows) ? (rows as IdRow[]) : [])
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
}

export async function ensureCollectionAdminVisibleNicknamesTable(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.admin_visible_nicknames (
      id uuid PRIMARY KEY,
      admin_user_id text NOT NULL,
      nickname_id uuid NOT NULL,
      created_by_superuser text,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS admin_user_id text`);
  await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS nickname_id uuid`);
  await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_by_superuser text`);
  await db.execute(sql`ALTER TABLE public.admin_visible_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
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
  await db.execute(sql`
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

  const adminIds = readIds(admins.rows);
  const nicknameIds = readIds(nicknames.rows);

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
