import { badRequest } from "../../http/errors";
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
}
