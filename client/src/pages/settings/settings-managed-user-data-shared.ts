import type { MutableRefObject } from "react";

export type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

export type UseSettingsManagedUserDataArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

export type ManagedUsersQueryState = {
  page: number;
  pageSize: number;
  search: string;
  role: "all" | "admin" | "user";
  status: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
};

export type ManagedUsersPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PendingResetRequestsQueryState = {
  page: number;
  pageSize: number;
  search: string;
  status: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
};

export type PendingResetRequestsPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const MANAGED_USERS_DEFAULT_PAGE_SIZE = 50;
export const MANAGED_USERS_MAX_PAGE_SIZE = 100;
export const PENDING_RESET_REQUESTS_DEFAULT_PAGE_SIZE = 50;
export const PENDING_RESET_REQUESTS_MAX_PAGE_SIZE = 100;

export const DEFAULT_MANAGED_USERS_QUERY: ManagedUsersQueryState = {
  page: 1,
  pageSize: MANAGED_USERS_DEFAULT_PAGE_SIZE,
  search: "",
  role: "all",
  status: "all",
};

export const DEFAULT_MANAGED_USERS_PAGINATION: ManagedUsersPaginationState = {
  page: 1,
  pageSize: MANAGED_USERS_DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

export const DEFAULT_PENDING_RESET_REQUESTS_QUERY: PendingResetRequestsQueryState = {
  page: 1,
  pageSize: PENDING_RESET_REQUESTS_DEFAULT_PAGE_SIZE,
  search: "",
  status: "all",
};

export const DEFAULT_PENDING_RESET_REQUESTS_PAGINATION: PendingResetRequestsPaginationState = {
  page: 1,
  pageSize: PENDING_RESET_REQUESTS_DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};
