import { badRequest } from "../../http/errors";
import { readPageLimit } from "../../http/validation";
import { safeParseInteger } from "../../lib/safe-parse";
import {
  getAdminVisibleNicknameValues,
  hasNicknameValue,
  readNicknameFiltersFromQuery,
} from "../../routes/collection-access";
import { normalizeCollectionText } from "../../routes/collection.validation";
import {
  CollectionServiceSupport,
  type ListQuery,
} from "./collection-service-support";
import {
  assertValidCollectionDateRange,
  buildCollectionPaginationMeta,
  encodeCollectionListCursor,
  parseCollectionBooleanQueryValue,
  parseCollectionListCursor,
  parseCollectionReceiptValidationFilter,
  resolveUserOwnedCollectionRecordFilters,
} from "./collection-record-read-shared";
import { canViewAllStaff } from "../../../shared/user-roles";

function readBoundedList(value: unknown, maximum: number): string[] {
  const candidates = Array.isArray(value) ? value : [value];
  const values = candidates.flatMap((candidate) => String(candidate ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean));
  return Array.from(new Set(values)).slice(0, maximum);
}

export class CollectionRecordListReadOperations extends CollectionServiceSupport {
  async listRecords(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: ListQuery) {
    const user = this.requireUser(userInput);
    const from = normalizeCollectionText(query.from);
    const to = normalizeCollectionText(query.to);
    const search = normalizeCollectionText(query.search);
    const cursor = parseCollectionListCursor(query.cursor);
    const receiptValidationStatus = parseCollectionReceiptValidationFilter(query.receiptValidationStatus);
    const duplicateOnly = parseCollectionBooleanQueryValue(query.duplicateOnly);
    const requestedNicknameFilters = readNicknameFiltersFromQuery(query);
    const sourceImportIds = readBoundedList(
      query.sourceImportIds ?? query.sourceImportId ?? query.source,
      50,
    );
    const agingBucketsRaw = readBoundedList(query.agingBuckets ?? query.aging, 4)
      .map((value) => value.toUpperCase());
    const classificationsRaw = readBoundedList(
      query.classifications ?? query.classification,
      2,
    ).map((value) => value.toLowerCase());
    const sortByRaw = normalizeCollectionText(query.sortBy);
    const sortDirectionRaw = normalizeCollectionText(query.sortDirection).toLowerCase();
    const pageRaw = safeParseInteger(query.page);
    const offsetRaw = safeParseInteger(query.offset);
    const limit = readPageLimit(query.pageSize ?? query.limit, 1000, 5000);
    const page = pageRaw !== null
      ? Math.max(1, pageRaw)
      : 1;
    const requestedOffset = offsetRaw !== null
      ? Math.max(0, offsetRaw)
      : (page - 1) * limit;
    const offset = cursor?.offset ?? requestedOffset;
    const resolvedPage = Math.floor(offset / limit) + 1;
    const userOwnedRecordFilters = await resolveUserOwnedCollectionRecordFilters(this.storage, user);

    assertValidCollectionDateRange({ from, to });
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
    if (sourceImportIds.some((value) => value.length > 200)) {
      throw badRequest("Invalid Saved source filter.");
    }
    if (agingBucketsRaw.some((value) => !["D3", "D4", "D5", "D6"].includes(value))) {
      throw badRequest("Invalid aging filter.");
    }
    if (classificationsRaw.some((value) => value !== "cp" && value !== "abort_cp")) {
      throw badRequest("Invalid Collection classification filter.");
    }
    const allowedSortFields = new Set([
      "paymentDate",
      "amount",
      "customerName",
      "source",
      "aging",
      "classification",
    ]);
    if (sortByRaw && !allowedSortFields.has(sortByRaw)) {
      throw badRequest("Invalid Collection sort field.");
    }
    if (sortDirectionRaw && sortDirectionRaw !== "asc" && sortDirectionRaw !== "desc") {
      throw badRequest("Invalid Collection sort direction.");
    }

    let nicknameFilters: string[] | undefined;
    if (canViewAllStaff(user.role)) {
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
      sourceImportIds: sourceImportIds.length > 0 ? sourceImportIds : undefined,
      agingBuckets: agingBucketsRaw.length > 0
        ? agingBucketsRaw as Array<"D3" | "D4" | "D5" | "D6">
        : undefined,
      classifications: classificationsRaw.length > 0
        ? classificationsRaw as Array<"cp" | "abort_cp">
        : undefined,
      sortBy: sortByRaw
        ? sortByRaw as "paymentDate" | "amount" | "customerName" | "source" | "aging" | "classification"
        : undefined,
      sortDirection: sortDirectionRaw === "asc" ? "asc" as const : "desc" as const,
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

    await this.auditCollectionPiiAccess({
      action: "READ_COLLECTION_PII_LIST",
      user,
      targetResource: "collection:list",
      recordCount: records.length,
      totalRecords: aggregate.totalRecords,
      page: resolvedPage,
      pageSize: limit,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(Array.isArray(baseFilters.nicknames) ? { nicknameCount: baseFilters.nicknames.length } : {}),
      searchPresent: Boolean(search),
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
}
