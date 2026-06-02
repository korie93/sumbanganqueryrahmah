import { z } from "zod";

// AUDIT2-FIX [M6]: Canonical pagination utility for server route/query handling.
export const DEFAULT_OFFSET_PAGE = 1;
export const DEFAULT_OFFSET_LIMIT = 20;
export const DEFAULT_MAX_OFFSET_LIMIT = 100;

const optionalPositiveInteger = z.preprocess((value) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === null || raw === undefined || raw === "") {
    return undefined;
  }
  return Number(raw);
}, z.number().int().min(1).optional());

export const OffsetPaginationSchema = z.object({
  page: optionalPositiveInteger.catch(DEFAULT_OFFSET_PAGE).default(DEFAULT_OFFSET_PAGE),
  limit: optionalPositiveInteger.catch(DEFAULT_OFFSET_LIMIT).default(DEFAULT_OFFSET_LIMIT),
});

export const CursorPaginationSchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: optionalPositiveInteger.catch(DEFAULT_OFFSET_LIMIT).default(DEFAULT_OFFSET_LIMIT),
  direction: z.enum(["forward", "backward"]).catch("forward").default("forward"),
});

export type OffsetPagination = z.infer<typeof OffsetPaginationSchema>;
export type CursorPagination = z.infer<typeof CursorPaginationSchema>;

export type OffsetPaginationOptions = {
  defaultLimit?: number;
  maxLimit?: number;
};

export type NormalizedOffsetPagination = OffsetPagination & {
  pageSize: number;
};

export interface PaginationMetadata {
  page: number;
  pageSize: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMetadata;
}

function clampPositiveInteger(value: number, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.floor(value)));
}

export function parseOffsetPaginationQuery(
  query: Record<string, unknown> | undefined,
  options: OffsetPaginationOptions = {},
): NormalizedOffsetPagination {
  const maxLimit = clampPositiveInteger(
    options.maxLimit ?? DEFAULT_MAX_OFFSET_LIMIT,
    DEFAULT_MAX_OFFSET_LIMIT,
  );
  const defaultLimit = clampPositiveInteger(
    options.defaultLimit ?? DEFAULT_OFFSET_LIMIT,
    DEFAULT_OFFSET_LIMIT,
    maxLimit,
  );
  const paginationSchema = z.object({
    page: optionalPositiveInteger.catch(DEFAULT_OFFSET_PAGE).default(DEFAULT_OFFSET_PAGE),
    limit: optionalPositiveInteger.catch(defaultLimit).default(defaultLimit),
  });
  const parsed = paginationSchema.parse({
    page: query?.page,
    limit: query?.limit ?? query?.pageSize,
  });
  const limit = clampPositiveInteger(parsed.limit, defaultLimit, maxLimit);
  return {
    page: parsed.page,
    limit,
    pageSize: limit,
  };
}

export function toDbOffset(pagination: OffsetPagination): { offset: number; limit: number } {
  return {
    offset: (pagination.page - 1) * pagination.limit,
    limit: pagination.limit,
  };
}

export function clampOffsetPaginationToTotal(
  pagination: NormalizedOffsetPagination,
  total: number,
): NormalizedOffsetPagination {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / pagination.limit));
  const page = Math.min(Math.max(1, pagination.page), totalPages);
  return {
    page,
    limit: pagination.limit,
    pageSize: pagination.limit,
  };
}

export function buildPaginationMetadata(
  total: number,
  pagination: OffsetPagination,
): PaginationMetadata {
  const safeTotal = Math.max(0, Math.floor(total));
  const totalPages = Math.max(1, Math.ceil(safeTotal / pagination.limit));
  const page = Math.min(Math.max(1, pagination.page), totalPages);
  return {
    page,
    pageSize: pagination.limit,
    limit: pagination.limit,
    total: safeTotal,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  pagination: OffsetPagination,
): PaginatedResponse<T> {
  return {
    data,
    pagination: buildPaginationMetadata(total, pagination),
  };
}
