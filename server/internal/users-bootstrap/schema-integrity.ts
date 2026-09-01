import { sql } from "drizzle-orm";
import { ensureCollectionSourceGovernanceForeignKeys } from "../collection-bootstrap-source-schema";
import type { BootstrapSqlExecutor } from "./schema-types";

export async function ensureUsersBootstrapIntegrity(
  database: BootstrapSqlExecutor,
): Promise<void> {
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
  await database.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON public.users (username)`);
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
  await ensureCollectionSourceGovernanceForeignKeys(database);
}
