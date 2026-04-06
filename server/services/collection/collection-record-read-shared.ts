import { badRequest } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import { resolveCurrentCollectionNicknameFromSession } from "../../routes/collection-access";
import {
  isValidCollectionDate,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";

export const COLLECTION_NICKNAME_SUMMARY_RECORD_LIMIT = 250;

export type CollectionListCursor = {
  offset: number;
};

export type CollectionPaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  limit: number;
  offset: number;
  nextCursor: string | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export function encodeCollectionListCursor(cursor: CollectionListCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function parseCollectionListCursor(rawCursor: unknown): CollectionListCursor | null {
  const normalized = normalizeCollectionText(rawCursor);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(normalized, "base64url").toString("utf8")) as Partial<CollectionListCursor>;
    const offset = Number(parsed.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      return null;
    }
    return { offset };
  } catch {
    return null;
  }
}

export function parseCollectionBooleanQueryValue(value: unknown): boolean | undefined {
  const normalized = normalizeCollectionText(value).toLowerCase();
  if (!normalized || normalized === "all" || normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  return undefined;
}

export function parseCollectionReceiptValidationFilter(
  value: unknown,
): "matched" | "underpaid" | "overpaid" | "unverified" | "needs_review" | "flagged" | undefined {
  const normalized = normalizeCollectionText(value).toLowerCase();
  if (!normalized || normalized === "all") {
    return undefined;
  }
  if (
    normalized === "matched"
    || normalized === "underpaid"
    || normalized === "overpaid"
    || normalized === "unverified"
    || normalized === "needs_review"
    || normalized === "flagged"
  ) {
    return normalized;
  }
  return undefined;
}

export function buildCollectionPaginationMeta(params: {
  page: number;
  pageSize: number;
  total: number;
  offset: number;
  nextCursor?: string | null;
  hasNextPage?: boolean;
}): CollectionPaginationMeta {
  const pageSize = Math.max(1, params.pageSize);
  const nextCursor = params.nextCursor ?? null;
  const totalPages = Math.max(1, Math.ceil(Math.max(0, params.total) / pageSize));

  return {
    page: Math.max(1, params.page),
    pageSize,
    total: Math.max(0, params.total),
    totalPages,
    limit: pageSize,
    offset: Math.max(0, params.offset),
    nextCursor,
    hasNextPage: params.hasNextPage ?? nextCursor !== null,
    hasPreviousPage: params.offset > 0,
  };
}

export function assertValidCollectionDateRange(params: {
  from?: string;
  to?: string;
}) {
  if (params.from && !isValidCollectionDate(params.from)) {
    throw badRequest("Invalid from date.");
  }
  if (params.to && !isValidCollectionDate(params.to)) {
    throw badRequest("Invalid to date.");
  }
  if (params.from && params.to && params.from > params.to) {
    throw badRequest("From date cannot be later than To date.");
  }
}

export async function resolveUserOwnedCollectionRecordFilters(
  storage: CollectionStoragePort,
  user: Pick<AuthenticatedUser, "username" | "role" | "activityId">,
): Promise<{ createdByLogin?: string; nicknames?: string[] }> {
  if (user.role !== "user") {
    return {};
  }

  const currentNickname = normalizeCollectionText(
    await resolveCurrentCollectionNicknameFromSession(storage, user as AuthenticatedUser),
  );
  if (currentNickname) {
    return {
      nicknames: [currentNickname],
    };
  }

  return {
    createdByLogin: user.username,
  };
}
