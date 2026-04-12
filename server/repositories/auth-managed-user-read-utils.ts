import { sql, inArray } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  users,
} from "../../shared/schema-postgres";
import {
  MANAGED_USERS_DEFAULT_PAGE_SIZE,
  MANAGED_USERS_MAX_PAGE_SIZE,
  PENDING_PASSWORD_RESET_DEFAULT_PAGE_SIZE,
  PENDING_PASSWORD_RESET_MAX_PAGE_SIZE,
  QUERY_PAGE_LIMIT,
  resolvePageAndPageSize,
  type ManagedUserListPageParams,
  type ManagedUserListPageResult,
  type ManagedUserRecord,
  type PendingPasswordResetListPageParams,
  type PendingPasswordResetListPageResult,
  type PendingPasswordResetRequestRecord,
} from "./auth-repository-types";
import {
  buildManagedUsersWhereSql,
  buildPendingPasswordResetWhereSql,
  readTotalRowCount,
} from "./auth-managed-user-read-query-utils";
import {
  collectOffsetChunkRows,
  collectPagedResults,
} from "./auth-managed-user-read-pagination-utils";

export async function getUsersByRoles(roles: string[]): Promise<Array<{
  id: string;
  username: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  passwordChangedAt: Date | null;
  isBanned: boolean | null;
}>> {
  if (!Array.isArray(roles) || roles.length === 0) return [];
  return collectOffsetChunkRows(
    async (offset) => db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        passwordChangedAt: users.passwordChangedAt,
        isBanned: users.isBanned,
      })
      .from(users)
      .where(inArray(users.role, roles))
      .orderBy(users.role, users.username)
      .limit(QUERY_PAGE_LIMIT)
      .offset(offset),
    QUERY_PAGE_LIMIT,
  );
}

export async function getManagedUsers(): Promise<ManagedUserRecord[]> {
  return collectPagedResults(
    (page) => listManagedUsersPage({
      page,
      pageSize: MANAGED_USERS_MAX_PAGE_SIZE,
    }),
    (pageResult) => pageResult.users,
  );
}

export async function listManagedUsersPage(
  params: ManagedUserListPageParams = {},
): Promise<ManagedUserListPageResult> {
  const { page, pageSize, offset } = resolvePageAndPageSize(
    params.page,
    params.pageSize,
    {
      pageSize: MANAGED_USERS_DEFAULT_PAGE_SIZE,
      maxPageSize: MANAGED_USERS_MAX_PAGE_SIZE,
    },
  );
  const whereSql = buildManagedUsersWhereSql(params);

  const [countResult, rowsResult] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.users
      ${whereSql}
    `),
    db.execute(sql`
      SELECT
        id,
        username,
        full_name as "fullName",
        email,
        role,
        status,
        must_change_password as "mustChangePassword",
        password_reset_by_superuser as "passwordResetBySuperuser",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt",
        activated_at as "activatedAt",
        last_login_at as "lastLoginAt",
        password_changed_at as "passwordChangedAt",
        is_banned as "isBanned",
        failed_login_attempts as "failedLoginAttempts",
        locked_at as "lockedAt",
        locked_reason as "lockedReason",
        locked_by_system as "lockedBySystem"
      FROM public.users
      ${whereSql}
      ORDER BY role ASC, username ASC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `),
  ]);

  const total = readTotalRowCount(countResult.rows?.[0] as { total?: number | string } | undefined);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    users: (rowsResult.rows || []) as ManagedUserRecord[],
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function listPendingPasswordResetRequests(): Promise<PendingPasswordResetRequestRecord[]> {
  return collectPagedResults(
    (page) => listPendingPasswordResetRequestsPage({
      page,
      pageSize: PENDING_PASSWORD_RESET_MAX_PAGE_SIZE,
    }),
    (pageResult) => pageResult.requests,
  );
}

export async function listPendingPasswordResetRequestsPage(
  params: PendingPasswordResetListPageParams = {},
): Promise<PendingPasswordResetListPageResult> {
  const { page, pageSize, offset } = resolvePageAndPageSize(
    params.page,
    params.pageSize,
    {
      pageSize: PENDING_PASSWORD_RESET_DEFAULT_PAGE_SIZE,
      maxPageSize: PENDING_PASSWORD_RESET_MAX_PAGE_SIZE,
    },
  );
  const whereSql = buildPendingPasswordResetWhereSql(params);

  const [countResult, rowsResult] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.password_reset_requests r
      INNER JOIN public.users u ON u.id = r.user_id
      ${whereSql}
    `),
    db.execute(sql`
      SELECT
        r.id,
        r.user_id as "userId",
        r.requested_by_user as "requestedByUser",
        r.approved_by as "approvedBy",
        r.reset_type as "resetType",
        r.created_at as "createdAt",
        r.expires_at as "expiresAt",
        r.used_at as "usedAt",
        u.username,
        u.full_name as "fullName",
        u.email,
        u.role,
        u.status,
        u.is_banned as "isBanned"
      FROM public.password_reset_requests r
      INNER JOIN public.users u ON u.id = r.user_id
      ${whereSql}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `),
  ]);

  const total = readTotalRowCount(countResult.rows?.[0] as { total?: number | string } | undefined);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    requests: (rowsResult.rows || []) as PendingPasswordResetRequestRecord[],
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function getAccounts(): Promise<Array<{
  username: string;
  role: string;
  isBanned: boolean | null;
}>> {
  return collectOffsetChunkRows(
    async (offset) => db
      .select({
        username: users.username,
        role: users.role,
        isBanned: users.isBanned,
      })
      .from(users)
      .orderBy(users.role, users.username)
      .limit(QUERY_PAGE_LIMIT)
      .offset(offset),
    QUERY_PAGE_LIMIT,
  );
}
