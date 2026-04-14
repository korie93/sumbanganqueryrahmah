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

const SYSTEM_ACTOR_USER_ID = "system-user";
const SYSTEM_ACTOR_USERNAME = "system";
const SYSTEM_ACTOR_FULL_NAME = "System Actor";
const SYSTEM_ACTOR_PASSWORD_HASH = "$2b$12$jHDoINM4IPl88oSr7lb3Z.aVlpBWVraltDnPv1ibuuu2gd2vLxpAm";

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
      two_factor_configured_at timestamp with time zone,
      failed_login_attempts integer NOT NULL DEFAULT 0,
      locked_at timestamp with time zone,
      locked_reason text,
      locked_by_system boolean NOT NULL DEFAULT false,
      created_by text,
      is_banned boolean NOT NULL DEFAULT false,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now(),
      password_changed_at timestamp with time zone,
      activated_at timestamp with time zone,
      last_login_at timestamp with time zone
    )
  `);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.account_activation_tokens (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      token_hash text NOT NULL,
      expires_at timestamp with time zone NOT NULL,
      used_at timestamp with time zone,
      created_by text,
      created_at timestamp with time zone DEFAULT now()
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
      expires_at timestamp with time zone,
      used_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now()
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
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_configured_at timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_attempts integer DEFAULT 0`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_reason text`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_by_system boolean DEFAULT false`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by text`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS activated_at timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS created_by text`);
  await database.execute(sql`ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS requested_by_user text`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS approved_by text`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS reset_type text DEFAULT 'temporary_password'`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS token_hash text`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS used_at timestamp with time zone`);
  await database.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);

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
      failed_login_attempts = GREATEST(COALESCE(failed_login_attempts, 0), 0),
      locked_at = CASE
        WHEN locked_at IS NULL THEN NULL
        ELSE locked_at
      END,
      locked_reason = CASE
        WHEN locked_at IS NULL THEN NULL
        ELSE NULLIF(trim(COALESCE(locked_reason, '')), '')
      END,
      locked_by_system = CASE
        WHEN locked_at IS NULL THEN false
        ELSE COALESCE(locked_by_system, false)
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
  await database.execute(sql`
    INSERT INTO public.users (
      id,
      username,
      full_name,
      role,
      password_hash,
      status,
      must_change_password,
      password_reset_by_superuser,
      two_factor_enabled,
      failed_login_attempts,
      locked_by_system,
      created_by,
      is_banned,
      created_at,
      updated_at
    )
    SELECT
      ${SYSTEM_ACTOR_USER_ID},
      ${SYSTEM_ACTOR_USERNAME},
      ${SYSTEM_ACTOR_FULL_NAME},
      'user',
      ${SYSTEM_ACTOR_PASSWORD_HASH},
      'disabled',
      false,
      false,
      false,
      0,
      false,
      NULL,
      false,
      now(),
      now()
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users
      WHERE lower(username) = ${SYSTEM_ACTOR_USERNAME}
    )
  `);
  await database.execute(sql`
    UPDATE public.users
    SET
      username = ${SYSTEM_ACTOR_USERNAME},
      full_name = ${SYSTEM_ACTOR_FULL_NAME},
      role = 'user',
      password_hash = ${SYSTEM_ACTOR_PASSWORD_HASH},
      status = 'disabled',
      must_change_password = false,
      password_reset_by_superuser = false,
      two_factor_enabled = false,
      two_factor_secret_encrypted = NULL,
      two_factor_configured_at = NULL,
      failed_login_attempts = 0,
      locked_at = NULL,
      locked_reason = NULL,
      locked_by_system = false,
      created_by = NULL,
      is_banned = false,
      created_at = COALESCE(created_at, now()),
      updated_at = COALESCE(updated_at, now()),
      password_changed_at = NULL,
      activated_at = NULL,
      last_login_at = NULL
    WHERE lower(username) = ${SYSTEM_ACTOR_USERNAME}
  `);

  await database.execute(sql`ALTER TABLE public.users ALTER COLUMN username SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.users ALTER COLUMN role SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.users ALTER COLUMN status SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL`);
  await database.execute(sql`ALTER TABLE public.users ALTER COLUMN is_banned SET NOT NULL`);
  await database.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_users_role'
      ) THEN
        ALTER TABLE public.users
        ADD CONSTRAINT chk_users_role
        CHECK (role IN ('user', 'admin', 'superuser'));
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_users_status'
      ) THEN
        ALTER TABLE public.users
        ADD CONSTRAINT chk_users_status
        CHECK (status IN ('pending_activation', 'active', 'suspended', 'disabled'));
      END IF;
    END $$;
  `);
  await database.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON public.users (username)`);
  await database.execute(sql`
    UPDATE public.users
    SET created_by = NULLIF(trim(COALESCE(created_by, '')), '')
  `);
  await database.execute(sql`
    UPDATE public.users
    SET created_by = NULL
    WHERE lower(username) = ${SYSTEM_ACTOR_USERNAME}
      AND created_by IS NOT NULL
      AND lower(created_by) IN ('system-bootstrap', 'legacy-create-user')
  `);
  await database.execute(sql`
    UPDATE public.users
    SET created_by = ${SYSTEM_ACTOR_USERNAME}
    WHERE lower(username) <> ${SYSTEM_ACTOR_USERNAME}
      AND created_by IS NOT NULL
      AND lower(created_by) IN ('system-bootstrap', 'legacy-create-user')
  `);
  await database.execute(sql`
    UPDATE public.users account
    SET created_by = actor.username
    FROM public.users actor
    WHERE account.created_by IS NOT NULL
      AND lower(actor.username) = lower(account.created_by)
  `);
  await database.execute(sql`
    UPDATE public.users
    SET created_by = NULL
    WHERE created_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.users actor
        WHERE actor.username = public.users.created_by
      )
  `);

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
    UPDATE public.account_activation_tokens
    SET created_by = NULLIF(trim(COALESCE(created_by, '')), '')
  `);
  await database.execute(sql`
    UPDATE public.account_activation_tokens
    SET created_by = ${SYSTEM_ACTOR_USERNAME}
    WHERE created_by IS NOT NULL
      AND lower(created_by) IN ('system-bootstrap', 'legacy-create-user')
  `);
  await database.execute(sql`
    UPDATE public.account_activation_tokens token
    SET created_by = usr.username
    FROM public.users usr
    WHERE token.created_by IS NOT NULL
      AND lower(usr.username) = lower(token.created_by)
  `);
  await database.execute(sql`
    UPDATE public.account_activation_tokens
    SET created_by = NULL
    WHERE created_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.users usr
        WHERE usr.username = public.account_activation_tokens.created_by
      )
  `);
  await database.execute(sql`
    UPDATE public.password_reset_requests
    SET
      requested_by_user = NULLIF(trim(COALESCE(requested_by_user, '')), ''),
      approved_by = NULLIF(trim(COALESCE(approved_by, '')), '')
  `);
  await database.execute(sql`
    UPDATE public.password_reset_requests
    SET requested_by_user = ${SYSTEM_ACTOR_USERNAME}
    WHERE requested_by_user IS NOT NULL
      AND lower(requested_by_user) IN ('system-bootstrap', 'legacy-create-user')
  `);
  await database.execute(sql`
    UPDATE public.password_reset_requests
    SET approved_by = ${SYSTEM_ACTOR_USERNAME}
    WHERE approved_by IS NOT NULL
      AND lower(approved_by) IN ('system-bootstrap', 'legacy-create-user')
  `);
  await database.execute(sql`
    UPDATE public.password_reset_requests req
    SET requested_by_user = usr.username
    FROM public.users usr
    WHERE req.requested_by_user IS NOT NULL
      AND lower(usr.username) = lower(req.requested_by_user)
  `);
  await database.execute(sql`
    UPDATE public.password_reset_requests req
    SET approved_by = usr.username
    FROM public.users usr
    WHERE req.approved_by IS NOT NULL
      AND lower(usr.username) = lower(req.approved_by)
  `);
  await database.execute(sql`
    UPDATE public.password_reset_requests
    SET requested_by_user = NULL
    WHERE requested_by_user IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.users usr
        WHERE usr.username = public.password_reset_requests.requested_by_user
      )
  `);
  await database.execute(sql`
    UPDATE public.password_reset_requests
    SET approved_by = NULL
    WHERE approved_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.users usr
        WHERE usr.username = public.password_reset_requests.approved_by
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
        WHERE conname = 'fk_users_created_by_username'
      ) THEN
        ALTER TABLE public.users
        ADD CONSTRAINT fk_users_created_by_username
        FOREIGN KEY (created_by)
        REFERENCES public.users(username)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_account_activation_tokens_created_by_username'
      ) THEN
        ALTER TABLE public.account_activation_tokens
        ADD CONSTRAINT fk_account_activation_tokens_created_by_username
        FOREIGN KEY (created_by)
        REFERENCES public.users(username)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_password_reset_requests_requested_by_user_username'
      ) THEN
        ALTER TABLE public.password_reset_requests
        ADD CONSTRAINT fk_password_reset_requests_requested_by_user_username
        FOREIGN KEY (requested_by_user)
        REFERENCES public.users(username)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_password_reset_requests_approved_by_username'
      ) THEN
        ALTER TABLE public.password_reset_requests
        ADD CONSTRAINT fk_password_reset_requests_approved_by_username
        FOREIGN KEY (approved_by)
        REFERENCES public.users(username)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
      END IF;

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
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_created_by ON public.account_activation_tokens (created_by)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_password_reset_requests_requested_by_user ON public.password_reset_requests (requested_by_user)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_password_reset_requests_approved_by ON public.password_reset_requests (approved_by)`);
  await database.execute(sql`
    DO $$
    BEGIN
      IF to_regclass('public.collection_records') IS NOT NULL THEN
        UPDATE public.collection_records record
        SET created_by_login = usr.username
        FROM public.users usr
        WHERE lower(usr.username) = lower(trim(COALESCE(record.created_by_login, '')));

        UPDATE public.collection_records
        SET created_by_login = 'system'
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.users usr
          WHERE usr.username = public.collection_records.created_by_login
        );

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_collection_records_created_by_login_username'
        ) THEN
          ALTER TABLE public.collection_records
          ADD CONSTRAINT fk_collection_records_created_by_login_username
          FOREIGN KEY (created_by_login)
          REFERENCES public.users(username)
          ON DELETE RESTRICT
          ON UPDATE CASCADE;
        ELSIF EXISTS (
          SELECT 1
          FROM information_schema.referential_constraints rc
          WHERE rc.constraint_schema = 'public'
            AND rc.constraint_name = 'fk_collection_records_created_by_login_username'
            AND (
              rc.delete_rule <> 'RESTRICT'
              OR rc.update_rule <> 'CASCADE'
            )
        ) THEN
          ALTER TABLE public.collection_records
          DROP CONSTRAINT fk_collection_records_created_by_login_username;

          ALTER TABLE public.collection_records
          ADD CONSTRAINT fk_collection_records_created_by_login_username
          FOREIGN KEY (created_by_login)
          REFERENCES public.users(username)
          ON DELETE RESTRICT
          ON UPDATE CASCADE;
        END IF;
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
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_failed_login_attempts ON public.users (failed_login_attempts)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_locked_at ON public.users (locked_at)`);
  await database.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_locked_by_system ON public.users (locked_by_system)`);
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

