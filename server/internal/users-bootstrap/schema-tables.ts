import { sql } from "drizzle-orm";
import type { BootstrapSqlExecutor } from "./schema-types";

export async function ensureUsersBootstrapTablesAndColumns(
  database: BootstrapSqlExecutor,
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
      is_banned boolean DEFAULT false,
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
}
