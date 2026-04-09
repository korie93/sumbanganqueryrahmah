import { badRequest, forbidden } from "../../http/errors";
import {
  getAdminVisibleNicknameValues,
  hasNicknameValue,
  readNicknameFiltersFromQuery,
} from "../../routes/collection-access";
import {
  normalizeCollectionStringList,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import { parseCollectionAmountMyrNumber } from "../../../shared/collection-amount-types";
import {
  CollectionServiceSupport,
  type ListQuery,
} from "./collection-service-support";
import { getCollectionReportFreshness } from "./collection-report-freshness";
import {
  assertValidCollectionDateRange,
  buildCollectionPaginationMeta,
  COLLECTION_NICKNAME_SUMMARY_RECORD_LIMIT,
} from "./collection-record-read-shared";

export class CollectionRecordNicknameSummaryOperations extends CollectionServiceSupport {
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
    assertValidCollectionDateRange({ from, to });

    const requestedNicknameFilters = readNicknameFiltersFromQuery(query);
    if (requestedNicknameFilters.length === 0) {
      const pagination = buildCollectionPaginationMeta({
        page: 1,
        pageSize: COLLECTION_NICKNAME_SUMMARY_RECORD_LIMIT,
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
        pageSize: COLLECTION_NICKNAME_SUMMARY_RECORD_LIMIT,
        limit: COLLECTION_NICKNAME_SUMMARY_RECORD_LIMIT,
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
      ? Math.min(COLLECTION_NICKNAME_SUMMARY_RECORD_LIMIT, Math.max(1, limitRaw))
      : COLLECTION_NICKNAME_SUMMARY_RECORD_LIMIT;
    const page = Number.isInteger(pageRaw)
      ? Math.max(1, pageRaw)
      : 1;
    const recordOffset = Number.isInteger(offsetRaw)
      ? Math.max(0, offsetRaw)
      : (page - 1) * recordLimit;
    const resolvedPage = Math.floor(recordOffset / recordLimit) + 1;

    const nicknameFilters = normalizeCollectionStringList(requestedNicknameFilters);
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

    const fromFilter = from || undefined;
    const toFilter = to || undefined;
    const nicknameTotalsRaw = await this.storage.summarizeCollectionRecordsByNickname({
      ...(fromFilter !== undefined ? { from: fromFilter } : {}),
      ...(toFilter !== undefined ? { to: toFilter } : {}),
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
        accumulator.totalAmount += parseCollectionAmountMyrNumber(item.totalAmount || 0);
        return accumulator;
      },
      { totalRecords: 0, totalAmount: 0 },
    );
    const records = summaryOnly
      ? []
      : await this.storage.listCollectionRecords({
          ...(fromFilter !== undefined ? { from: fromFilter } : {}),
          ...(toFilter !== undefined ? { to: toFilter } : {}),
          nicknames: nicknameFilters,
          limit: recordLimit,
          offset: recordOffset,
        });
    const freshness = await getCollectionReportFreshness(this.storage, {
      ...(fromFilter !== undefined ? { from: fromFilter } : {}),
      ...(toFilter !== undefined ? { to: toFilter } : {}),
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

    await this.auditCollectionPiiAccess({
      action: "READ_COLLECTION_PII_NICKNAME_SUMMARY",
      user,
      targetResource: "collection:nickname-summary",
      recordCount: records.length,
      totalRecords: totals.totalRecords,
      page: resolvedPage,
      pageSize: recordLimit,
      ...(fromFilter ? { from: fromFilter } : {}),
      ...(toFilter ? { to: toFilter } : {}),
      nicknameCount: nicknameFilters.length,
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
