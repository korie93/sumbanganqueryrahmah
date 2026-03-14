import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { count, sql } from "drizzle-orm";
import { users } from "../../shared/schema-postgres";
import {
  ACCOUNT_STATUSES,
  isBcryptHash,
  normalizeAccountStatus,
  normalizeUserRole,
} from "../auth/account-lifecycle";
import { generateTemporaryPassword } from "../auth/passwords";
import { shouldSeedDefaultUsers } from "../config/security";
import { db } from "../db-postgres";

const BCRYPT_COST = 12;

export class UsersBootstrap {
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private seedCompleted = false;
  private seedPromise: Promise<void> | null = null;

  async ensureTable(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`
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
            created_by text,
            is_banned boolean DEFAULT false,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now(),
            password_changed_at timestamp,
            activated_at timestamp,
            last_login_at timestamp
          )
        `);
        await db.execute(sql`
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
        await db.execute(sql`
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
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name text`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_reset_by_superuser boolean DEFAULT false`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by text`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamp`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS activated_at timestamp`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at timestamp`);
        await db.execute(sql`ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS created_by text`);
        await db.execute(sql`ALTER TABLE public.account_activation_tokens ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS requested_by_user text`);
        await db.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS approved_by text`);
        await db.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS reset_type text DEFAULT 'temporary_password'`);
        await db.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS token_hash text`);
        await db.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS expires_at timestamp`);
        await db.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS used_at timestamp`);
        await db.execute(sql`ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);

        const legacyPasswordColumn = await db.execute(sql`
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
          await db.execute(sql`
            UPDATE public.users
            SET password_hash = password
            WHERE password_hash IS NULL
              AND password IS NOT NULL
          `);
          await db.execute(sql`
            UPDATE public.users
            SET password = NULL
            WHERE password IS NOT NULL
          `);
        }

        const credentialRows = await db.execute(sql`
          SELECT id, password_hash, status
          FROM public.users
        `);

        for (const row of credentialRows.rows as Array<{ id?: string; password_hash?: string | null; status?: string | null }>) {
          const userId = String(row.id || "").trim();
          if (!userId) continue;

          const currentHash = String(row.password_hash || "").trim();
          const currentStatus = normalizeAccountStatus(
            row.status,
            isBcryptHash(currentHash) ? "active" : "pending_activation",
          );

          if (!isBcryptHash(currentHash)) {
            const fallbackHash = await bcrypt.hash(randomUUID(), BCRYPT_COST);
            await db.execute(sql`
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

        await db.execute(sql`
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

        await db.execute(sql`ALTER TABLE public.users ALTER COLUMN username SET NOT NULL`);
        await db.execute(sql`ALTER TABLE public.users ALTER COLUMN role SET NOT NULL`);
        await db.execute(sql`ALTER TABLE public.users ALTER COLUMN status SET NOT NULL`);
        await db.execute(sql`ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL`);

        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON public.users (lower(username))`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_username_lower ON public.users (lower(username))`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_status ON public.users (status)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_must_change_password ON public.users (must_change_password)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_created_by ON public.users (created_by)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_password_reset_by_superuser ON public.users (password_reset_by_superuser)`);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique
          ON public.users (lower(email))
          WHERE email IS NOT NULL AND trim(email) <> ''
        `);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_account_activation_tokens_hash_unique
          ON public.account_activation_tokens (token_hash)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_user_id
          ON public.account_activation_tokens (user_id)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_account_activation_tokens_expires_at
          ON public.account_activation_tokens (expires_at)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id
          ON public.password_reset_requests (user_id)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_password_reset_requests_created_at
          ON public.password_reset_requests (created_at DESC)
        `);

        this.ready = true;
      } catch (err: any) {
        console.error("ERROR Failed to ensure users table:", err?.message || err);
        throw err;
      }
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  async seedDefaultUsers(): Promise<void> {
    if (this.seedCompleted) return;
    if (this.seedPromise) {
      await this.seedPromise;
      return;
    }

    this.seedPromise = (async () => {
      const shouldSeedConfiguredUsers = shouldSeedDefaultUsers();
      const [{ value: existingUserCount }] = await db.select({ value: count() }).from(users);
      const isFreshLocalBootstrap =
        !shouldSeedConfiguredUsers
        && Number(existingUserCount || 0) === 0
        && process.env.NODE_ENV !== "production";
      let generatedLocalSuperuserPassword: string | null = null;

      const defaultUsers = [
        {
          username: process.env.SEED_SUPERUSER_USERNAME || "superuser",
          password: process.env.SEED_SUPERUSER_PASSWORD || "",
          fullName: process.env.SEED_SUPERUSER_FULL_NAME || "Superuser",
          role: "superuser",
        },
        {
          username: process.env.SEED_ADMIN_USERNAME || "admin1",
          password: process.env.SEED_ADMIN_PASSWORD || "",
          fullName: process.env.SEED_ADMIN_FULL_NAME || "Admin",
          role: "admin",
        },
        {
          username: process.env.SEED_USER_USERNAME || "user1",
          password: process.env.SEED_USER_PASSWORD || "",
          fullName: process.env.SEED_USER_FULL_NAME || "User",
          role: "user",
        },
      ].filter((user) => user.password);

      if (isFreshLocalBootstrap) {
        generatedLocalSuperuserPassword = generateTemporaryPassword();
        defaultUsers.push({
          username: process.env.SEED_SUPERUSER_USERNAME || "superuser",
          password: process.env.SEED_SUPERUSER_PASSWORD || generatedLocalSuperuserPassword,
          fullName: process.env.SEED_SUPERUSER_FULL_NAME || "Local Superuser",
          role: "superuser",
        });
      } else if (!shouldSeedConfiguredUsers) {
        this.seedCompleted = true;
        return;
      }

      for (const user of defaultUsers) {
        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.username}) = lower(${user.username})`)
          .limit(1);

        if (existing[0]) {
          continue;
        }

        const now = new Date();
        const hashedPassword = await bcrypt.hash(user.password, BCRYPT_COST);
        await db.insert(users).values({
          id: randomUUID(),
          username: user.username,
          fullName: user.fullName,
          passwordHash: hashedPassword,
          role: normalizeUserRole(user.role),
          status: "active",
          mustChangePassword: isFreshLocalBootstrap && user.role === "superuser",
          passwordResetBySuperuser: isFreshLocalBootstrap && user.role === "superuser",
          createdBy: "system-bootstrap",
          createdAt: now,
          updatedAt: now,
          passwordChangedAt: now,
          activatedAt: now,
          isBanned: false,
        });
      }

      if (generatedLocalSuperuserPassword) {
        console.warn("[AUTH] No users found. Bootstrapped a local superuser account with a random temporary password.");
        console.warn(`[AUTH] Local superuser username: ${process.env.SEED_SUPERUSER_USERNAME || "superuser"}`);
        console.warn(`[AUTH] Local superuser temporary password: ${generatedLocalSuperuserPassword}`);
        console.warn("[AUTH] Change the password immediately after first login.");
      }

      this.seedCompleted = true;
    })();

    try {
      await this.seedPromise;
    } finally {
      this.seedPromise = null;
    }
  }
}
