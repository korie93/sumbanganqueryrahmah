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
      password_updated_at timestamp with time zone,
      created_by text,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname text`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS role_scope text DEFAULT 'both'`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS nickname_password_hash text`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_reset_by_superuser boolean DEFAULT false`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS password_updated_at timestamp with time zone`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_by text`);
  await db.execute(sql`ALTER TABLE public.collection_staff_nicknames ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
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
