import { badRequest, forbidden } from "../../http/errors";
import { safeParseInteger } from "../../lib/safe-parse";
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
import { canViewAllStaff } from "../../../shared/user-roles";
import { getCollectionDashboardSummary } from "./collection-dashboard-summary";

export class CollectionRecordSummaryReadOperations extends CollectionServiceSupport {
  async getSummary(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: SummaryQuery) {
    const user = this.requireUser(userInput);
    const yearRaw = normalizeCollectionText(query.year);
    const requestedNicknameFilters = readNicknameFiltersFromQuery(query);
    const parsedYear = yearRaw
      ? safeParseInteger(yearRaw, { min: 2000, max: 2100 })
      : new Date().getFullYear();
    const userOwnedRecordFilters = await resolveUserOwnedCollectionRecordFilters(this.storage, user);

    if (parsedYear === null) {
      throw badRequest("Invalid year.");
    }

    const includeDashboard = normalizeCollectionText(query.includeDashboard) === "1";
    const dashboardMonth = includeDashboard
      ? safeParseInteger(query.month, { min: 1, max: 12 })
      : null;
    if (includeDashboard && dashboardMonth === null) throw badRequest("Invalid dashboard month.");
    const dashboardOptions = {
      year: parsedYear,
      month: dashboardMonth ?? 1,
      canViewLeaderBreakdown: canViewAllStaff(user.role) && requestedNicknameFilters.length === 0,
      scopeLabel: canViewAllStaff(user.role) && requestedNicknameFilters.length === 0
        ? "All Collection records"
        : "Your authorized Collection scope",
    };

    let nicknameFilters: string[] | undefined;
    if (canViewAllStaff(user.role)) {
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
          ...(includeDashboard ? {
            dashboard: await getCollectionDashboardSummary(this.storage, dashboardOptions),
          } : {}),
          freshness: await getCollectionReportFreshness(this.storage, {
            from: `${parsedYear}-01-01`,
            to: `${parsedYear}-12-31`,
          }),
        };
      } else {
        nicknameFilters = allowedNicknames;
      }
    }

    const createdByLogin = user.role === "user" ? userOwnedRecordFilters.createdByLogin : undefined;
    const reportNicknames = user.role === "user" ? userOwnedRecordFilters.nicknames : nicknameFilters;
    const summary = await this.storage.getCollectionMonthlySummary({
      year: parsedYear,
      ...(reportNicknames !== undefined ? { nicknames: reportNicknames } : {}),
      ...(createdByLogin !== undefined ? { createdByLogin } : {}),
    });
    const freshness = await getCollectionReportFreshness(this.storage, {
      from: `${parsedYear}-01-01`,
      to: `${parsedYear}-12-31`,
      ...(createdByLogin !== undefined ? { createdByLogin } : {}),
      ...(reportNicknames !== undefined ? { nicknames: reportNicknames } : {}),
    });

    return {
      ok: true as const,
      year: parsedYear,
      summary,
      freshness,
      ...(includeDashboard ? {
        dashboard: await getCollectionDashboardSummary(this.storage, dashboardOptions),
      } : {}),
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
