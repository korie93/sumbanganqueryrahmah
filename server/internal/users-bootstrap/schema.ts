import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import {
  isBcryptHash,
  normalizeAccountStatus,
} from "../../auth/account-lifecycle";
import { db } from "../../db-postgres";
import { USERS_BOOTSTRAP_BCRYPT_COST } from "./constants";

type BootstrapSqlExecutor = Pick<typeof db, "execute">;

type UserCredentialRow = {
  id?: string;
  password_hash?: string | null;
  status?: string | null;
};

export async function ensureUsersBootstrapSchema(
  database: BootstrapSqlExecutor = db,
): Promise<void> {
  await database.execute(sql`SET search_path TO public`);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.users (
      id text PRIMARY KEY,
      username text NOT NULL,
      full_name text,
      email text,
      role text NOT NULL DEFAULT 'user',
      password_hash text,
      status text NOT NULL DEFAULT 'active',
      must_change_password boolean NOT NULL DEFAULT false,
      password_reset_by_superuser boolean NOT NULL DEFAULT false,
      two_factor_enabled boolean NOT NULL DEFAULT false,
      two_factor_secret_encrypted text,
      two_factor_configured_at timestamp,
      created_by text,
      is_banned boolean DEFAULT false,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now(),
      password_changed_at timestamp,
      activated_at timestamp,
      last_login_at timestamp
    )
  `);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.account_activation_tokens (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      token_hash text NOT NULL,
      expires_at timestamp NOT NULL,
      used_at timestamp,
      created_by text,
      created_at timestamp DEFAULT now()
    )
  `);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.password_reset_requests (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      requested_by_user text,
      approved_by text,
      reset_type text NOT NULL DEFAULT 'temporary_password',
      token_hash text,
      expires_at timestamp,
      used_at timestamp,
      created_at timestamp DEFAULT now()
    )
  `);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name text`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_reset_by_superuser boolean DEFAULT false`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_enabled boolean DEFAULT false`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_secret_encrypted text`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_configured_at timestamp`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by text`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamp`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS activated_at timestamp`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at timestamp`);
  await database.execute(sql`ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS created_by text`);
  await database.execute(sql`ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS requested_by_user text`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS approved_by text`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS reset_type text DEFAULT 'temporary_password'`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS token_hash text`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS expires_at timestamp`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS used_at timestamp`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);

  const legacyPasswordColumn = await database.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'password'
    ) AS present
  `);
  const hasLegacyPasswordColumn = Boolean(
    (legacyPasswordColumn.rows[0] as { present?: boolean } | undefined)?.present,
  );

  if (hasLegacyPasswordColumn) {
    await database.execute(sql`
      UPDATE public.users
      SET password_hash = password
      WHERE password_hash IS NULL
        AND password IS NOT NULL
    `);
    await database.execute(sql`
      UPDATE public.users
      SET password = NULL
      WHERE password IS NOT NULL
    `);
  }

  const credentialRows = await database.execute(sql`
    SELECT id, password_hash, status
    FROM public.users
  `);

  for (const row of credentialRows.rows as UserCredentialRow[]) {
    const userId = String(row.id || "").trim();
    if (!userId) continue;

    const currentHash = String(row.password_hash || "").trim();
    const currentStatus = normalizeAccountStatus(
      row.status,
      isBcryptHash(currentHash) ? "active" : "pending_activation",
    );

    if (!isBcryptHash(currentHash)) {
      const fallbackHash = await bcrypt.hash(randomUUID(), USERS_BOOTSTRAP_BCRYPT_COST);
      await database.execute(sql`
        UPDATE public.users
        SET
          password_hash = ${fallbackHash},
          status = ${currentStatus === "active" ? "pending_activation" : currentStatus},
          must_change_password = false,
          password_reset_by_superuser = false
        WHERE id = ${userId}
      `);
    }
  }

  await database.execute(sql`
    UPDATE public.users
    SET
      role = CASE
        WHEN lower(trim(COALESCE(role, ''))) IN ('user', 'admin', 'superuser')
          THEN lower(trim(COALESCE(role, '')))
        ELSE 'user'
      END,
      status = CASE
        WHEN lower(trim(COALESCE(status, ''))) IN ('pending_activation', 'active', 'suspended', 'disabled')
          THEN lower(trim(COALESCE(status, '')))
        WHEN password_hash ~ '^\\$2[aby]\\$'
          THEN 'active'
        ELSE 'pending_activation'
      END,
      must_change_password = COALESCE(must_change_password, false),
      password_reset_by_superuser = COALESCE(password_reset_by_superuser, false),
      two_factor_enabled = COALESCE(two_factor_enabled, false),
      two_factor_configured_at = CASE
        WHEN COALESCE(two_factor_enabled, false) = false THEN NULL
        ELSE two_factor_configured_at
      END,
      created_at = COALESCE(created_at, now()),
      updated_at = COALESCE(updated_at, now()),
      activated_at = CASE
        WHEN activated_at IS NOT NULL THEN activated_at
        WHEN status = 'active' AND password_changed_at IS NOT NULL THEN password_changed_at
        WHEN status = 'active' THEN created_at
        ELSE activated_at
      END,
      is_banned = COALESCE(is_banned, false)
  `);

  await database.execute(sql`ALTER TABLE public.users ALTER COLUMN username SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.users ALTER COLUMN role SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.users ALTER COLUMN status SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL`);

  await database.execute(sql`
    DELETE FROM public.account_activation_tokens token
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users usr
      WHERE usr.id = token.user_id
    )
  `);
  await database.execute(sql`
    DELETE FROM public.password_reset_requests req
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users usr
      WHERE usr.id = req.user_id
    )
  `);
  await database.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_account_activation_tokens_user_id'
      ) THEN
        ALTER TABLE public.account_activation_tokens
        ADD CONSTRAINT fk_account_activation_tokens_user_id
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);
  await database.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_password_reset_requests_user_id'
      ) THEN
        ALTER TABLE public.password_reset_requests
        ADD CONSTRAINT fk_password_reset_requests_user_id
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await database.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON public.users (lower(username))`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_username_lower ON public.users (lower(username))`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_status ON public.users (status)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_must_change_password ON public.users (must_change_password)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_created_by ON public.users (created_by)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_password_reset_by_superuser ON public.users (password_reset_by_superuser)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON public.users (two_factor_enabled)`);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique
    ON public.users (lower(email))
    WHERE email IS NOT NULL AND trim(email) <> ''
  `);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_account_activation_tokens_hash_unique
    ON public.account_activation_tokens (token_hash)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_user_id
    ON public.account_activation_tokens (user_id)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_expires_at
    ON public.account_activation_tokens (expires_at)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id
    ON public.password_reset_requests (user_id)
  `);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_password_reset_requests_created_at
    ON public.password_reset_requests (created_at DESC)
  `);
}

