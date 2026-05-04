import type { ApiPaginationMeta } from "../../shared/api-contracts";

export type OffsetPaginationMeta = Extract<ApiPaginationMeta, { mode: "offset" }>;
export type HybridPaginationMeta = Extract<ApiPaginationMeta, { mode: "hybrid" }>;

function toSafeInteger(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export function buildOffsetPaginationMeta(params: {
  page: number;
  limit: number;
  total: number;
  offset?: number;
}): OffsetPaginationMeta {
  const page = Math.max(1, toSafeInteger(params.page, 1));
  const limit = Math.max(1, toSafeInteger(params.limit, 1));
  const total = Math.max(0, toSafeInteger(params.total, 0));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = Math.max(0, toSafeInteger(params.offset ?? ((page - 1) * limit), 0));

  return {
    mode: "offset",
    page,
    pageSize: limit,
    limit,
    offset,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: offset > 0,
  };
}

export function buildHybridPaginationMeta(params: {
  page: number;
  pageSize: number;
  total: number;
  offset: number;
  nextCursor?: string | null;
  hasNextPage?: boolean;
}): HybridPaginationMeta {
  const pageSize = Math.max(1, toSafeInteger(params.pageSize, 1));
  const total = Math.max(0, toSafeInteger(params.total, 0));
  const offset = Math.max(0, toSafeInteger(params.offset, 0));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const nextCursor = params.nextCursor ?? null;

  return {
    mode: "hybrid",
    page: Math.max(1, toSafeInteger(params.page, 1)),
    pageSize,
    limit: pageSize,
    offset,
    total,
    totalPages,
    nextCursor,
    hasNextPage: params.hasNextPage ?? nextCursor !== null,
    hasPreviousPage: offset > 0,
  };
}
