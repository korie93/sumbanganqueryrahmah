import { readInteger, readOptionalString } from "../http/validation";

export type PaginatedListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function readPaginationMeta(
  query: Record<string, unknown> | undefined,
  defaults: { pageSize: number; maxPageSize: number },
): { page: number; pageSize: number } {
  const page = Math.max(1, readInteger(query?.page, 1));
  const pageSize = Math.max(
    1,
    Math.min(defaults.maxPageSize, readInteger(query?.pageSize, defaults.pageSize)),
  );
  return { page, pageSize };
}

export function buildLocalPaginationMeta(
  total: number,
  page = 1,
  pageSize = Math.max(1, total || 1),
): PaginatedListMeta {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}

export function parseManageableStatusFilter(raw: unknown):
  | "all"
  | "active"
  | "pending_activation"
  | "suspended"
  | "disabled"
  | "locked"
  | "banned" {
  const value = String(readOptionalString(raw) || "all").toLowerCase();
  return value === "active"
    || value === "pending_activation"
    || value === "suspended"
    || value === "disabled"
    || value === "locked"
    || value === "banned"
    ? value
    : "all";
}
