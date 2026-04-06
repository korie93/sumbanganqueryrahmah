import { badRequest, forbidden } from "../../http/errors";
import {
  getAdminGroupNicknameValues,
  getAdminVisibleNicknameValues,
  hasNicknameValue,
  readNicknameFiltersFromQuery,
  resolveCurrentCollectionNicknameFromSession,
} from "../../routes/collection-access";
import {
  isValidCollectionDate,
  normalizeCollectionStringList,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import {
  CollectionServiceSupport,
  type ListQuery,
  type SummaryQuery,
} from "./collection-service-support";
import {
  buildCollectionPurgeCutoffDate,
  getCollectionPurgeRetentionMonths,
} from "./collection-record-runtime-utils";
import { getCollectionReportFreshness } from "./collection-report-freshness";

type CollectionListCursor = {
  offset: number;
};

type CollectionPaginationMeta = {
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

function encodeCollectionListCursor(cursor: CollectionListCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function parseCollectionListCursor(rawCursor: unknown): CollectionListCursor | null {
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

function parseCollectionBooleanQueryValue(value: unknown): boolean | undefined {
  const normalized = normalizeCollectionText(value).toLowerCase();
  if (!normalized || normalized === "all" || normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  return undefined;
}

function parseCollectionReceiptValidationFilter(
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

function buildCollectionPaginationMeta(params: {
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

export class CollectionRecordReadOperations extends CollectionServiceSupport {
  private static readonly NICKNAME_SUMMARY_RECORD_LIMIT = 250;

  private async resolveUserOwnedRecordFilters(
    user: { username: string; role: string; activityId?: string },
  ): Promise<{ createdByLogin?: string; nicknames?: string[] }> {
    if (user.role !== "user") {
      return {};
    }

    const currentNickname = normalizeCollectionText(
      await resolveCurrentCollectionNicknameFromSession(this.storage, user as any),
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

  async getSummary(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: SummaryQuery) {
    const user = this.requireUser(userInput);
    const yearRaw = normalizeCollectionText(query.year);
    const requestedNicknameFilters = readNicknameFiltersFromQuery(query);
    const parsedYear = yearRaw ? Number.parseInt(yearRaw, 10) : new Date().getFullYear();
    const userOwnedRecordFilters = await this.resolveUserOwnedRecordFilters(user);

    if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      throw badRequest("Invalid year.");
    }

    let nicknameFilters: string[] | undefined;
    if (user.role === "superuser") {
      if (requestedNicknameFilters.length > 0) {
        const activeNicknames = await this.storage.getCollectionStaffNicknames({ activeOnly: true });
        const activeSet = new Set(
          activeNicknames
            .map((item) => normalizeCollectionText(item.nickname).toLowerCase())
            .filter(Boolean),
        );
        const hasInvalid = requestedNicknameFilters.some((value) => !activeSet.has(value.toLowerCase()));
        if (hasInvalid) {
          throw badRequest("Invalid nickname filter.");
        }
        nicknameFilters = requestedNicknameFilters;
      }
    } else if (user.role === "admin") {
      const allowedNicknames = await getAdminGroupNicknameValues(this.storage, user);
      if (requestedNicknameFilters.length > 0) {
        const hasInvalid = requestedNicknameFilters.some((value) => !hasNicknameValue(allowedNicknames, value));
        if (hasInvalid) {
          throw badRequest("Invalid nickname filter.");
        }
        nicknameFilters = requestedNicknameFilters;
      } else if (allowedNicknames.length === 0) {
        const emptySummary = this.buildEmptySummary(parsedYear);
        return {
          ...emptySummary,
          freshness: await getCollectionReportFreshness(this.storage, {
            from: `${parsedYear}-01-01`,
            to: `${parsedYear}-12-31`,
          }),
        };
      } else {
        nicknameFilters = allowedNicknames;
      }
    }

    const summary = await this.storage.getCollectionMonthlySummary({
      year: parsedYear,
      nicknames: user.role === "user" ? userOwnedRecordFilters.nicknames : nicknameFilters,
      createdByLogin: user.role === "user" ? userOwnedRecordFilters.createdByLogin : undefined,
    });
    const freshness = await getCollectionReportFreshness(this.storage, {
      from: `${parsedYear}-01-01`,
      to: `${parsedYear}-12-31`,
      createdByLogin: user.role === "user" ? userOwnedRecordFilters.createdByLogin : undefined,
      nicknames: user.role === "user" ? userOwnedRecordFilters.nicknames : nicknameFilters,
    });

    return {
      ok: true as const,
      year: parsedYear,
      summary,
      freshness,
    };
  }

  async listRecords(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: ListQuery) {
    const user = this.requireUser(userInput);
    const from = normalizeCollectionText(query.from);
    const to = normalizeCollectionText(query.to);
    const search = normalizeCollectionText(query.search);
    const cursor = parseCollectionListCursor(query.cursor);
    const receiptValidationStatus = parseCollectionReceiptValidationFilter(query.receiptValidationStatus);
    const duplicateOnly = parseCollectionBooleanQueryValue(query.duplicateOnly);
    const requestedNicknameFilters = readNicknameFiltersFromQuery(query);
    const limitRaw = Number.parseInt(normalizeCollectionText(query.pageSize ?? query.limit), 10);
    const pageRaw = Number.parseInt(normalizeCollectionText(query.page), 10);
    const offsetRaw = Number.parseInt(normalizeCollectionText(query.offset), 10);
    const limit = Number.isInteger(limitRaw)
      ? Math.min(5000, Math.max(1, limitRaw))
      : 1000;
    const page = Number.isInteger(pageRaw)
      ? Math.max(1, pageRaw)
      : 1;
    const requestedOffset = Number.isInteger(offsetRaw)
      ? Math.max(0, offsetRaw)
      : (page - 1) * limit;
    const offset = cursor?.offset ?? requestedOffset;
    const resolvedPage = Math.floor(offset / limit) + 1;
    const userOwnedRecordFilters = await this.resolveUserOwnedRecordFilters(user);

    if (from && !isValidCollectionDate(from)) throw badRequest("Invalid from date.");
    if (to && !isValidCollectionDate(to)) throw badRequest("Invalid to date.");
    if (from && to && from > to) throw badRequest("From date cannot be later than To date.");
    if (normalizeCollectionText(query.cursor) && !cursor) {
      throw badRequest("Invalid collection cursor.");
    }
    const normalizedReceiptValidationStatus = normalizeCollectionText(query.receiptValidationStatus).toLowerCase();
    if (
      normalizedReceiptValidationStatus
      && normalizedReceiptValidationStatus !== "all"
      && !receiptValidationStatus
    ) {
      throw badRequest("Invalid receipt validation filter.");
    }
    if (normalizeCollectionText(query.duplicateOnly) && duplicateOnly === undefined) {
      throw badRequest("Invalid duplicate receipt filter.");
    }

    let nicknameFilters: string[] | undefined;
    if (user.role === "superuser") {
      if (requestedNicknameFilters.length > 0) {
        for (const requestedNickname of requestedNicknameFilters) {
          const isActiveNickname = await this.storage.isCollectionStaffNicknameActive(requestedNickname);
          if (!isActiveNickname) {
            throw badRequest("Invalid nickname filter.");
          }
        }
        nicknameFilters = requestedNicknameFilters;
      }
    } else if (user.role === "admin") {
      const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
      if (requestedNicknameFilters.length > 0) {
        const hasInvalid = requestedNicknameFilters.some((value) => !hasNicknameValue(allowedNicknames, value));
        if (hasInvalid) {
          throw badRequest("Invalid nickname filter.");
        }
        nicknameFilters = requestedNicknameFilters;
      } else if (allowedNicknames.length === 0) {
        const pagination = buildCollectionPaginationMeta({
          page: resolvedPage,
          pageSize: limit,
          total: 0,
          offset,
          nextCursor: null,
          hasNextPage: false,
        });
        return {
          ok: true as const,
          records: [],
          total: 0,
          totalAmount: 0,
          page: resolvedPage,
          pageSize: limit,
          limit,
          offset,
          nextCursor: null,
          pagination,
        };
      } else {
        nicknameFilters = allowedNicknames;
      }
    }

    const baseFilters = {
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
      receiptValidationStatus,
      duplicateOnly,
      createdByLogin: user.role === "user" ? userOwnedRecordFilters.createdByLogin : undefined,
      nicknames: user.role === "user" ? userOwnedRecordFilters.nicknames : nicknameFilters,
    };
    const [aggregate, records] = await Promise.all([
      this.storage.summarizeCollectionRecords(baseFilters),
      this.storage.listCollectionRecords({
        ...baseFilters,
        limit,
        offset,
      }),
    ]);
    const nextCursor =
      offset + records.length < aggregate.totalRecords
        ? encodeCollectionListCursor({ offset: offset + records.length })
        : null;
    const pagination = buildCollectionPaginationMeta({
      page: resolvedPage,
      pageSize: limit,
      total: aggregate.totalRecords,
      offset,
      nextCursor,
      hasNextPage: nextCursor !== null,
    });

    return {
      ok: true as const,
      records,
      total: aggregate.totalRecords,
      totalAmount: aggregate.totalAmount,
      page: resolvedPage,
      pageSize: limit,
      limit,
      offset,
      nextCursor,
      pagination,
    };
  }

  async getPurgeSummary(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0]) {
    const user = this.requireUser(userInput);
    if (user.role !== "superuser") {
      throw forbidden("Purge data collection hanya untuk superuser.");
    }

    const cutoffDate = buildCollectionPurgeCutoffDate();
    const aggregate = await this.storage.summarizeCollectionRecordsOlderThan(cutoffDate);

    return {
      ok: true as const,
      retentionMonths: getCollectionPurgeRetentionMonths(),
      cutoffDate,
      eligibleRecords: aggregate.totalRecords,
      totalAmount: aggregate.totalAmount,
    };
  }

  async getNicknameSummary(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    const user = this.requireUser(userInput);
    if (user.role !== "admin" && user.role !== "superuser") {
      throw forbidden("Nickname summary hanya untuk admin atau superuser.");
    }

    const from = normalizeCollectionText(query.from);
    const to = normalizeCollectionText(query.to);
    if (from && !isValidCollectionDate(from)) throw badRequest("Invalid from date.");
    if (to && !isValidCollectionDate(to)) throw badRequest("Invalid to date.");
    if (from && to && from > to) throw badRequest("From date cannot be later than To date.");

    const requestedNicknameFilters = readNicknameFiltersFromQuery(query);
    if (requestedNicknameFilters.length === 0) {
      const pagination = buildCollectionPaginationMeta({
        page: 1,
        pageSize: CollectionRecordReadOperations.NICKNAME_SUMMARY_RECORD_LIMIT,
        total: 0,
        offset: 0,
        nextCursor: null,
        hasNextPage: false,
      });
      return {
        ok: true as const,
        nicknames: [],
        totalRecords: 0,
        totalAmount: 0,
        nicknameTotals: [],
        records: [],
        page: 1,
        pageSize: CollectionRecordReadOperations.NICKNAME_SUMMARY_RECORD_LIMIT,
        limit: CollectionRecordReadOperations.NICKNAME_SUMMARY_RECORD_LIMIT,
        offset: 0,
        freshness: await getCollectionReportFreshness(this.storage),
        pagination,
      };
    }

    const summaryOnlyRaw = normalizeCollectionText(query.summaryOnly).toLowerCase();
    const summaryOnly = summaryOnlyRaw === "1" || summaryOnlyRaw === "true" || summaryOnlyRaw === "yes";
    const limitRaw = Number.parseInt(normalizeCollectionText(query.pageSize ?? query.limit), 10);
    const pageRaw = Number.parseInt(normalizeCollectionText(query.page), 10);
    const offsetRaw = Number.parseInt(normalizeCollectionText(query.offset), 10);
    const recordLimit = Number.isInteger(limitRaw)
      ? Math.min(CollectionRecordReadOperations.NICKNAME_SUMMARY_RECORD_LIMIT, Math.max(1, limitRaw))
      : CollectionRecordReadOperations.NICKNAME_SUMMARY_RECORD_LIMIT;
    const page = Number.isInteger(pageRaw)
      ? Math.max(1, pageRaw)
      : 1;
    const recordOffset = Number.isInteger(offsetRaw)
      ? Math.max(0, offsetRaw)
      : (page - 1) * recordLimit;
    const resolvedPage = Math.floor(recordOffset / recordLimit) + 1;

    let nicknameFilters = normalizeCollectionStringList(requestedNicknameFilters);
    if (user.role === "superuser") {
      for (const requestedNickname of nicknameFilters) {
        const isActiveNickname = await this.storage.isCollectionStaffNicknameActive(requestedNickname);
        if (!isActiveNickname) {
          throw badRequest("Invalid nickname filter.");
        }
      }
    } else {
      const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
      const hasInvalid = nicknameFilters.some((value) => !hasNicknameValue(allowedNicknames, value));
      if (hasInvalid) {
        throw badRequest("Invalid nickname filter.");
      }
    }

    const nicknameTotalsRaw = await this.storage.summarizeCollectionRecordsByNickname({
      from: from || undefined,
      to: to || undefined,
      nicknames: nicknameFilters,
    });
    const nicknameTotals = nicknameFilters.map((nickname) => {
      const matched = nicknameTotalsRaw.find(
        (item) => item.nickname.toLowerCase() === nickname.toLowerCase(),
      );
      return {
        nickname,
        totalRecords: matched?.totalRecords ?? 0,
        totalAmount: matched?.totalAmount ?? 0,
      };
    });
    const totals = nicknameTotals.reduce(
      (accumulator, item) => {
        accumulator.totalRecords += Number(item.totalRecords || 0);
        accumulator.totalAmount += Number(item.totalAmount || 0);
        return accumulator;
      },
      { totalRecords: 0, totalAmount: 0 },
    );
    const records = summaryOnly
      ? []
      : await this.storage.listCollectionRecords({
          from: from || undefined,
          to: to || undefined,
          nicknames: nicknameFilters,
          limit: recordLimit,
          offset: recordOffset,
        });
    const freshness = await getCollectionReportFreshness(this.storage, {
      from: from || undefined,
      to: to || undefined,
      nicknames: nicknameFilters,
    });
    const pagination = buildCollectionPaginationMeta({
      page: resolvedPage,
      pageSize: recordLimit,
      total: totals.totalRecords,
      offset: recordOffset,
      nextCursor: null,
      hasNextPage: !summaryOnly && recordOffset + records.length < totals.totalRecords,
    });

    return {
      ok: true as const,
      nicknames: nicknameFilters,
      totalRecords: totals.totalRecords,
      totalAmount: totals.totalAmount,
      nicknameTotals,
      records,
      page: resolvedPage,
      pageSize: recordLimit,
      limit: recordLimit,
      offset: recordOffset,
      freshness,
      pagination,
    };
  }
}
