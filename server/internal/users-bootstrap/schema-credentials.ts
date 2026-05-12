import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import {
  isBcryptHash,
  normalizeAccountStatus,
} from "../../auth/account-lifecycle";
import { USERS_BOOTSTRAP_BCRYPT_COST } from "./constants";
import type { BootstrapSqlExecutor } from "./schema-types";

type UserCredentialRow = {
  id?: string;
  password_hash?: string | null;
  status?: string | null;
};

export async function hardenLegacyUserCredentials(
  database: BootstrapSqlExecutor,
): Promise<void> {
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
}
