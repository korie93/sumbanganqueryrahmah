export type ManagedUserRecord = {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  mustChangePassword: boolean;
  passwordResetBySuperuser: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  isBanned: boolean | null;
};

export type PendingPasswordResetRequestRecord = {
  id: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  requestedByUser: string | null;
  approvedBy: string | null;
  resetType: string;
  createdAt: Date;
  expiresAt: Date | null;
  usedAt: Date | null;
};

export type ActivationTokenRecord = {
  tokenId: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  activatedAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type PasswordResetTokenRecord = {
  requestId: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  activatedAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type ManagedUserListStatusFilter =
  | "all"
  | "active"
  | "pending_activation"
  | "suspended"
  | "disabled"
  | "banned";

export type ManagedUserListPageParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "all" | "admin" | "user";
  status?: ManagedUserListStatusFilter;
};

export type ManagedUserListPageResult = {
  users: ManagedUserRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PendingPasswordResetListPageParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ManagedUserListStatusFilter;
};

export type PendingPasswordResetListPageResult = {
  requests: PendingPasswordResetRequestRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const QUERY_PAGE_LIMIT = 1000;
export const MANAGED_USERS_DEFAULT_PAGE_SIZE = 50;
export const MANAGED_USERS_MAX_PAGE_SIZE = 100;
export const PENDING_PASSWORD_RESET_DEFAULT_PAGE_SIZE = 50;
export const PENDING_PASSWORD_RESET_MAX_PAGE_SIZE = 100;

export function resolvePageAndPageSize(
  pageRaw: number | undefined,
  pageSizeRaw: number | undefined,
  defaults: { pageSize: number; maxPageSize: number },
) {
  const safePage = Number.isFinite(pageRaw)
    ? Math.max(1, Math.floor(Number(pageRaw)))
    : 1;
  const safePageSize = Number.isFinite(pageSizeRaw)
    ? Math.max(1, Math.min(defaults.maxPageSize, Math.floor(Number(pageSizeRaw))))
    : defaults.pageSize;
  return {
    page: safePage,
    pageSize: safePageSize,
    offset: (safePage - 1) * safePageSize,
  };
}
