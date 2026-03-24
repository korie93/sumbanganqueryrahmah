import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  accountActivationTokens,
  passwordResetRequests,
  userActivity,
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

  const results: Array<{
    id: string;
    username: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    passwordChangedAt: Date | null;
    isBanned: boolean | null;
  }> = [];

  let offset = 0;
  while (true) {
    const chunk = await db
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
      .offset(offset);

    if (!chunk.length) break;
    results.push(...chunk);
    if (chunk.length < QUERY_PAGE_LIMIT) break;
    offset += chunk.length;
  }

  return results;
}

export async function getManagedUsers(): Promise<ManagedUserRecord[]> {
  const rows: ManagedUserRecord[] = [];
  let page = 1;
  while (true) {
    const pageResult = await listManagedUsersPage({
      page,
      pageSize: MANAGED_USERS_MAX_PAGE_SIZE,
    });
    rows.push(...pageResult.users);
    if (rows.length >= pageResult.total || pageResult.users.length < pageResult.pageSize) {
      break;
    }
    page += 1;
  }
  return rows;
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

  const whereClauses: any[] = [sql`role IN ('admin', 'user')`];
  const search = String(params.search || "").trim();
  if (search) {
    whereClauses.push(sql`(
      username ILIKE ${`%${search}%`}
      OR COALESCE(full_name, '') ILIKE ${`%${search}%`}
      OR COALESCE(email, '') ILIKE ${`%${search}%`}
    )`);
  }

  const roleFilter = String(params.role || "all").trim().toLowerCase();
  if (roleFilter === "admin" || roleFilter === "user") {
    whereClauses.push(sql`role = ${roleFilter}`);
  }

  const statusFilter = String(params.status || "all").trim().toLowerCase();
  if (statusFilter === "banned") {
    whereClauses.push(sql`COALESCE(is_banned, false) = true`);
  } else if (
    statusFilter === "active"
    || statusFilter === "pending_activation"
    || statusFilter === "suspended"
    || statusFilter === "disabled"
  ) {
    whereClauses.push(sql`status = ${statusFilter}`);
    whereClauses.push(sql`COALESCE(is_banned, false) = false`);
  }

  const whereSql = sql`WHERE ${sql.join(whereClauses, sql` AND `)}`;

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
        is_banned as "isBanned"
      FROM public.users
      ${whereSql}
      ORDER BY role ASC, username ASC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `),
  ]);

  const total = Number((countResult.rows?.[0] as { total?: number } | undefined)?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    users: (rowsResult.rows || []) as ManagedUserRecord[],
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function deleteManagedUserAccount(userId: string): Promise<boolean> {
  const normalizedId = String(userId || "").trim();
  if (!normalizedId) {
    return false;
  }

  await db.delete(accountActivationTokens).where(eq(accountActivationTokens.userId, normalizedId));
  await db.delete(passwordResetRequests).where(eq(passwordResetRequests.userId, normalizedId));

  const deleted = await db
    .delete(users)
    .where(and(eq(users.id, normalizedId), inArray(users.role, ["admin", "user"])))
    .returning({ id: users.id });

  return deleted.length > 0;
}

export async function updateActivitiesUsername(oldUsername: string, newUsername: string): Promise<void> {
  await db
    .update(userActivity)
    .set({ username: newUsername })
    .where(sql`${userActivity.username} = ${oldUsername}`);
}

export async function updateUserBan(username: string, isBanned: boolean) {
  await db
    .update(users)
    .set({ isBanned, updatedAt: new Date() })
    .where(sql`${users.username} = ${username}`);

  const result = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${String(username || "").trim()})`)
    .limit(1);

  return result[0];
}

export async function touchLastLogin(userId: string, timestamp = new Date()): Promise<void> {
  await db
    .update(users)
    .set({
      lastLoginAt: timestamp,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function listPendingPasswordResetRequests(): Promise<PendingPasswordResetRequestRecord[]> {
  const rows: PendingPasswordResetRequestRecord[] = [];
  let page = 1;
  while (true) {
    const pageResult = await listPendingPasswordResetRequestsPage({
      page,
      pageSize: PENDING_PASSWORD_RESET_MAX_PAGE_SIZE,
    });
    rows.push(...pageResult.requests);
    if (rows.length >= pageResult.total || pageResult.requests.length < pageResult.pageSize) {
      break;
    }
    page += 1;
  }
  return rows;
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

  const whereClauses: any[] = [
    sql`r.approved_by IS NULL`,
    sql`r.used_at IS NULL`,
  ];

  const search = String(params.search || "").trim();
  if (search) {
    whereClauses.push(sql`(
      u.username ILIKE ${`%${search}%`}
      OR COALESCE(u.full_name, '') ILIKE ${`%${search}%`}
      OR COALESCE(u.email, '') ILIKE ${`%${search}%`}
      OR COALESCE(r.requested_by_user, '') ILIKE ${`%${search}%`}
    )`);
  }

  const statusFilter = String(params.status || "all").trim().toLowerCase();
  if (statusFilter === "banned") {
    whereClauses.push(sql`COALESCE(u.is_banned, false) = true`);
  } else if (
    statusFilter === "active"
    || statusFilter === "pending_activation"
    || statusFilter === "suspended"
    || statusFilter === "disabled"
  ) {
    whereClauses.push(sql`u.status = ${statusFilter}`);
    whereClauses.push(sql`COALESCE(u.is_banned, false) = false`);
  }

  const whereSql = sql`WHERE ${sql.join(whereClauses, sql` AND `)}`;

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

  const total = Number((countResult.rows?.[0] as { total?: number } | undefined)?.total || 0);
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
  const rows: Array<{
    username: string;
    role: string;
    isBanned: boolean | null;
  }> = [];

  let offset = 0;
  while (true) {
    const chunk = await db
      .select({
        username: users.username,
        role: users.role,
        isBanned: users.isBanned,
      })
      .from(users)
      .orderBy(users.role, users.username)
      .limit(QUERY_PAGE_LIMIT)
      .offset(offset);

    if (!chunk.length) break;
    rows.push(...chunk);
    if (chunk.length < QUERY_PAGE_LIMIT) break;
    offset += chunk.length;
  }

  return rows;
}
