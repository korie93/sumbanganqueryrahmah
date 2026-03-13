import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { count, sql } from "drizzle-orm";
import { users } from "../../shared/schema-postgres";
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
            role text NOT NULL DEFAULT 'user',
            password_hash text,
            password text,
            is_banned boolean DEFAULT false,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now(),
            password_changed_at timestamp
          )
        `);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password text`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
        await db.execute(sql`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamp`);

        await db.execute(sql`
          UPDATE public.users
          SET password_hash = password
          WHERE password_hash IS NULL
            AND password IS NOT NULL
        `);

        const missingHashRows = await db.execute(sql`
          SELECT id
          FROM public.users
          WHERE password_hash IS NULL
        `);
        for (const row of missingHashRows.rows as Array<{ id?: string }>) {
          const userId = String(row.id || "").trim();
          if (!userId) continue;
          const fallbackHash = await bcrypt.hash(randomUUID(), BCRYPT_COST);
          await db.execute(sql`
            UPDATE public.users
            SET password_hash = ${fallbackHash}
            WHERE id = ${userId}
          `);
        }

        await db.execute(sql`
          UPDATE public.users
          SET
            role = COALESCE(NULLIF(role, ''), 'user'),
            created_at = COALESCE(created_at, now()),
            updated_at = COALESCE(updated_at, now()),
            is_banned = COALESCE(is_banned, false)
        `);

        await db.execute(sql`ALTER TABLE public.users ALTER COLUMN username SET NOT NULL`);
        await db.execute(sql`ALTER TABLE public.users ALTER COLUMN role SET NOT NULL`);
        await db.execute(sql`ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL`);

        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON public.users (lower(username))`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_username_lower ON public.users (lower(username))`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role)`);

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

      const defaultUsers = [
        {
          username: process.env.SEED_SUPERUSER_USERNAME || "superuser",
          password: process.env.SEED_SUPERUSER_PASSWORD || "",
          role: "superuser",
        },
        {
          username: process.env.SEED_ADMIN_USERNAME || "admin1",
          password: process.env.SEED_ADMIN_PASSWORD || "",
          role: "admin",
        },
        {
          username: process.env.SEED_USER_USERNAME || "user1",
          password: process.env.SEED_USER_PASSWORD || "",
          role: "user",
        },
      ].filter((user) => user.password);

      if (isFreshLocalBootstrap) {
        defaultUsers.push({
          username: process.env.SEED_SUPERUSER_USERNAME || "superuser",
          password: process.env.SEED_SUPERUSER_PASSWORD || "0441024k",
          role: "superuser",
        });
        console.warn("[AUTH] No users found. Bootstrapped local superuser account for first login.");
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
          passwordHash: hashedPassword,
          role: user.role,
          createdAt: now,
          updatedAt: now,
          passwordChangedAt: now,
          isBanned: false,
        });
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
