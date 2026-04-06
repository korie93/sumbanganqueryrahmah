import { sql } from "drizzle-orm";
import type { User } from "../../shared/schema-postgres";
import { users } from "../../shared/schema-postgres";
import { db } from "../db-postgres";

export async function getAuthUser(id: string): Promise<User | undefined> {
  const result = await db
    .select()
    .from(users)
    .where(sql`${users.id} = ${id}`)
    .limit(1);

  return result[0];
}

export async function getAuthUserByUsername(username: string): Promise<User | undefined> {
  const normalized = String(username || "").trim();
  if (!normalized) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${normalized})`)
    .limit(1);

  return result[0];
}

export async function getAuthUserByEmail(email: string): Promise<User | undefined> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${normalized})`)
    .limit(1);

  return result[0];
}
