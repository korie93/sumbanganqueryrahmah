import { badRequest, forbidden } from "../../http/errors";
import {
  getAdminGroupNicknameValues,
  hasNicknameValue,
  readNicknameFiltersFromQuery,
} from "../../routes/collection-access";
import { normalizeCollectionText } from "../../routes/collection.validation";
import {
  CollectionServiceSupport,
  type SummaryQuery,
} from "./collection-service-support";
import {
  buildCollectionPurgeCutoffDate,
  getCollectionPurgeRetentionMonths,
} from "./collection-record-runtime-utils";
import { getCollectionReportFreshness } from "./collection-report-freshness";
import { resolveUserOwnedCollectionRecordFilters } from "./collection-record-read-shared";

export class CollectionRecordSummaryReadOperations extends CollectionServiceSupport {
  async getSummary(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: SummaryQuery) {
    const user = this.requireUser(userInput);
    const yearRaw = normalizeCollectionText(query.year);
    const requestedNicknameFilters = readNicknameFiltersFromQuery(query);
    const parsedYear = yearRaw ? Number.parseInt(yearRaw, 10) : new Date().getFullYear();
    const userOwnedRecordFilters = await resolveUserOwnedCollectionRecordFilters(this.storage, user);

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
}
