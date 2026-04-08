import { readOptionalString } from "../http/validation";
import type {
  ManagedUserAccount,
  PendingPasswordResetRequestSummary,
  PostgresStorage,
} from "../storage-postgres";
import {
  buildLocalPaginationMeta,
  parseManageableStatusFilter,
  readPaginationMeta,
  type PaginatedListMeta,
} from "./auth-account-pagination-utils";
import { hasManagedAccountsQueryFilters } from "./auth-account-managed-utils";

type ManagedUsersListStorage = Pick<
  PostgresStorage,
  "getManagedUsers" | "listManagedUsersPage"
>;

type PendingPasswordResetListStorage = Pick<
  PostgresStorage,
  "listPendingPasswordResetRequests" | "listPendingPasswordResetRequestsPage"
>;

export async function listManagedUsersPageOrAll(
  storage: ManagedUsersListStorage,
  query: Record<string, unknown> = {},
): Promise<{ users: ManagedUserAccount[]; pagination: PaginatedListMeta }> {
  const hasQueryFilters = hasManagedAccountsQueryFilters(query, [
    "page",
    "pageSize",
    "search",
    "role",
    "status",
  ]);

  if (!hasQueryFilters) {
    const users = await storage.getManagedUsers();
    return {
      users,
      pagination: buildLocalPaginationMeta(users.length),
    };
  }

  const { page, pageSize } = readPaginationMeta(query, {
    pageSize: 50,
    maxPageSize: 100,
  });

  const search = readOptionalString(query.search);
  const result = await storage.listManagedUsersPage({
    page,
    pageSize,
    ...(search !== undefined ? { search } : {}),
    role: (() => {
      const value = String(readOptionalString(query.role) || "all").toLowerCase();
      return value === "admin" || value === "user" ? value : "all";
    })(),
    status: parseManageableStatusFilter(query.status),
  });

  return {
    users: result.users,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
}

export async function listPendingPasswordResetRequestsPageOrAll(
  storage: PendingPasswordResetListStorage,
  query: Record<string, unknown> = {},
): Promise<{ requests: PendingPasswordResetRequestSummary[]; pagination: PaginatedListMeta }> {
  const hasQueryFilters = hasManagedAccountsQueryFilters(query, [
    "page",
    "pageSize",
    "search",
    "status",
  ]);

  if (!hasQueryFilters) {
    const requests = await storage.listPendingPasswordResetRequests();
    return {
      requests,
      pagination: buildLocalPaginationMeta(requests.length),
    };
  }

  const { page, pageSize } = readPaginationMeta(query, {
    pageSize: 50,
    maxPageSize: 100,
  });
  const search = readOptionalString(query.search);
  const result = await storage.listPendingPasswordResetRequestsPage({
    page,
    pageSize,
    ...(search !== undefined ? { search } : {}),
    status: parseManageableStatusFilter(query.status),
  });

  return {
    requests: result.requests,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
}
