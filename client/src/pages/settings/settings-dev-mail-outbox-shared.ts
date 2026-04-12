import type { MutableRefObject } from "react";
import {
  SETTINGS_EMPTY_TOTAL,
  SETTINGS_FIRST_PAGE,
  SETTINGS_MIN_TOTAL_PAGES,
} from "@/pages/settings/settings-request-utils";

export type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

export type UseSettingsDevMailOutboxArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

export type DevMailOutboxQueryState = {
  page: number;
  pageSize: number;
  searchEmail: string;
  searchSubject: string;
  sortDirection: "asc" | "desc";
};

export type DevMailOutboxPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE = 25;
export const DEV_MAIL_OUTBOX_MAX_PAGE_SIZE = 100;

export const DEV_MAIL_OUTBOX_DEFAULT_QUERY: DevMailOutboxQueryState = {
  page: SETTINGS_FIRST_PAGE,
  pageSize: DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE,
  searchEmail: "",
  searchSubject: "",
  sortDirection: "desc",
};

export const DEV_MAIL_OUTBOX_DEFAULT_PAGINATION: DevMailOutboxPaginationState = {
  page: SETTINGS_FIRST_PAGE,
  pageSize: DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE,
  total: SETTINGS_EMPTY_TOTAL,
  totalPages: SETTINGS_MIN_TOTAL_PAGES,
};
