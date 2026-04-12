import { sql, type SQL } from "drizzle-orm";
import type {
  ManagedUserListPageParams,
  PendingPasswordResetListPageParams,
} from "./auth-repository-types";
import {
  normalizeManagedUserListFilters,
  normalizePendingPasswordResetListFilters,
} from "./auth-managed-user-shared";
import { buildLikePattern } from "./sql-like-utils";

function isManagedUserStatusWithDirectMatch(value: string): value is
  | "active"
  | "pending_activation"
  | "suspended"
  | "disabled" {
  return (
    value === "active"
    || value === "pending_activation"
    || value === "suspended"
    || value === "disabled"
  );
}

export function buildManagedUsersWhereSql(params: ManagedUserListPageParams = {}): SQL {
  const filters = normalizeManagedUserListFilters(params);
  const whereClauses: SQL[] = [sql`role IN ('admin', 'user')`];

  if (filters.search) {
    const searchPattern = buildLikePattern(filters.search, "contains");
    whereClauses.push(sql`(
      username ILIKE ${searchPattern} ESCAPE '\'
      OR COALESCE(full_name, '') ILIKE ${searchPattern} ESCAPE '\'
      OR COALESCE(email, '') ILIKE ${searchPattern} ESCAPE '\'
    )`);
  }

  if (filters.role === "admin" || filters.role === "user") {
    whereClauses.push(sql`role = ${filters.role}`);
  }

  if (filters.status === "banned") {
    whereClauses.push(sql`COALESCE(is_banned, false) = true`);
  } else if (filters.status === "locked") {
    whereClauses.push(sql`locked_at IS NOT NULL`);
    whereClauses.push(sql`COALESCE(is_banned, false) = false`);
  } else if (isManagedUserStatusWithDirectMatch(filters.status)) {
    whereClauses.push(sql`status = ${filters.status}`);
    whereClauses.push(sql`COALESCE(is_banned, false) = false`);
  }

  return sql`WHERE ${sql.join(whereClauses, sql` AND `)}`;
}

export function buildPendingPasswordResetWhereSql(
  params: PendingPasswordResetListPageParams = {},
): SQL {
  const filters = normalizePendingPasswordResetListFilters(params);
  const whereClauses: SQL[] = [
    sql`r.approved_by IS NULL`,
    sql`r.used_at IS NULL`,
  ];

  if (filters.search) {
    const searchPattern = buildLikePattern(filters.search, "contains");
    whereClauses.push(sql`(
      u.username ILIKE ${searchPattern} ESCAPE '\'
      OR COALESCE(u.full_name, '') ILIKE ${searchPattern} ESCAPE '\'
      OR COALESCE(u.email, '') ILIKE ${searchPattern} ESCAPE '\'
      OR COALESCE(r.requested_by_user, '') ILIKE ${searchPattern} ESCAPE '\'
    )`);
  }

  if (filters.status === "banned") {
    whereClauses.push(sql`COALESCE(u.is_banned, false) = true`);
  } else if (isManagedUserStatusWithDirectMatch(filters.status)) {
    whereClauses.push(sql`u.status = ${filters.status}`);
    whereClauses.push(sql`COALESCE(u.is_banned, false) = false`);
  }

  return sql`WHERE ${sql.join(whereClauses, sql` AND `)}`;
}

export function readTotalRowCount(row: { total?: number | string } | undefined): number {
  return Number(row?.total || 0);
}
