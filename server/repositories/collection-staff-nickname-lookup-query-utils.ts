import { sql, type SQL } from "drizzle-orm";

export function buildCollectionStaffNicknameListWhereSql(filters?: {
  activeOnly?: boolean;
  allowedRole?: "admin" | "user";
}): SQL {
  const conditions: SQL[] = [];

  if (filters?.activeOnly === true) {
    conditions.push(sql`is_active = true`);
  }
  if (filters?.allowedRole === "admin") {
    conditions.push(sql`role_scope IN ('admin', 'both')`);
  } else if (filters?.allowedRole === "user") {
    conditions.push(sql`role_scope IN ('user', 'both')`);
  }

  return conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;
}
