import { sql } from "drizzle-orm";
import { db } from "../db-postgres";

export async function ensureCollectionNicknameSessionsTable(): Promise<void> {
  await db.execute(sql`SET search_path TO public`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.collection_nickname_sessions (
      activity_id text PRIMARY KEY,
      username text NOT NULL,
      user_role text NOT NULL,
      nickname text NOT NULL,
      verified_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS username text`);
  await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS user_role text`);
  await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS nickname text`);
  await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone DEFAULT now()`);
  await db.execute(sql`ALTER TABLE public.collection_nickname_sessions ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
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
    DELETE FROM public.collection_nickname_sessions session
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.user_activity activity
      WHERE activity.id = session.activity_id
    )
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
  await db.execute(sql`
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
  `);
}
