import { badRequest, forbidden } from "../../http/errors";
import {
  getAdminGroupNicknameValues,
  getAdminVisibleNicknameValues,
  hasNicknameValue,
  readNicknameFiltersFromQuery,
  resolveCurrentCollectionNicknameFromSession,
} from "../../routes/collection-access";
import {
  ensureLooseObject,
  isValidCollectionDate,
  normalizeCollectionStringList,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import { CollectionServiceSupport, type ListQuery, type SummaryQuery } from "./collection-service-support";
import {
  buildCollectionPurgeCutoffDate,
  getCollectionPurgeRetentionMonths,
} from "./collection-record-runtime-utils";
import { CollectionRecordMutationOperations } from "./collection-record-mutation-operations";
import { CollectionDailyOperations } from "./collection-daily-operations";
import { getCollectionReportFreshness } from "./collection-report-freshness";
import {
  formatCollectionAmountFromCents,
  normalizeCollectionReceiptExtractionStatus,
} from "./collection-receipt-validation";

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

export class CollectionRecordService extends CollectionServiceSupport {
  private static readonly NICKNAME_SUMMARY_RECORD_LIMIT = 250;
  private readonly mutationOperations: CollectionRecordMutationOperations;
  private readonly dailyOperations: CollectionDailyOperations;

  constructor(storage: ConstructorParameters<typeof CollectionServiceSupport>[0]) {
    super(storage);
    this.mutationOperations = new CollectionRecordMutationOperations(
      this.storage,
      this.requireUser.bind(this),
    );
    this.dailyOperations = new CollectionDailyOperations(
      this.storage,
      this.requireUser.bind(this),
    );
  }

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

  async createRecord(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
    return this.mutationOperations.createRecord(userInput, bodyRaw);
  }

  async inspectReceipts(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
    this.requireUser(userInput);
    const body = ensureLooseObject(bodyRaw) || {};
    const inspectedReceipts = Array.isArray(body.inspectedReceipts)
      ? body.inspectedReceipts
          .map((item) => ensureLooseObject(item))
          .filter((item): item is Record<string, unknown> => Boolean(item))
      : [];

    const duplicateSummaries = await this.storage.findCollectionReceiptDuplicateSummaries(
      inspectedReceipts
        .map((receipt) => normalizeCollectionText(receipt.fileHash).toLowerCase())
        .filter(Boolean),
    );
    const duplicateSummaryByHash = new Map(
      duplicateSummaries.map((summary) => [summary.fileHash, summary] as const),
    );

    return {
      ok: true as const,
      receipts: inspectedReceipts.map((receipt) => {
        const fileHash = normalizeCollectionText(receipt.fileHash).toLowerCase() || null;
        const extractedAmountRaw = receipt.extractedAmountCents;
        const extractedAmountCents =
          extractedAmountRaw === null || extractedAmountRaw === undefined || extractedAmountRaw === ""
            ? null
            : Number(extractedAmountRaw);
        const extractionConfidenceRaw = receipt.extractionConfidence;
        const extractionConfidence =
          extractionConfidenceRaw === null || extractionConfidenceRaw === undefined || extractionConfidenceRaw === ""
            ? null
            : Number(extractionConfidenceRaw);

        return {
          fileName: normalizeCollectionText(receipt.fileName) || "receipt",
          fileHash,
          extractedAmount:
            Number.isFinite(extractedAmountCents) && extractedAmountCents !== null
              ? formatCollectionAmountFromCents(extractedAmountCents)
              : null,
          extractionStatus: normalizeCollectionReceiptExtractionStatus(receipt.extractionStatus ?? null),
          extractionConfidence: Number.isFinite(extractionConfidence) ? extractionConfidence : null,
          extractionMessage: normalizeCollectionText(receipt.extractionMessage) || null,
          duplicateSummary: fileHash ? duplicateSummaryByHash.get(fileHash) || null : null,
        };
      }),
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
    const receiptValidationStatus = parseCollectionReceiptValidationFilter(query.receiptValidationStatus);
    const duplicateOnly = parseCollectionBooleanQueryValue(query.duplicateOnly);
    const requestedNicknameFilters = readNicknameFiltersFromQuery(query);
    const limitRaw = Number.parseInt(normalizeCollectionText(query.limit), 10);
    const offsetRaw = Number.parseInt(normalizeCollectionText(query.offset), 10);
    const limit = Number.isInteger(limitRaw)
      ? Math.min(5000, Math.max(1, limitRaw))
      : 1000;
    const offset = Number.isInteger(offsetRaw)
      ? Math.max(0, offsetRaw)
      : 0;
    const userOwnedRecordFilters = await this.resolveUserOwnedRecordFilters(user);

    if (from && !isValidCollectionDate(from)) throw badRequest("Invalid from date.");
    if (to && !isValidCollectionDate(to)) throw badRequest("Invalid to date.");
    if (from && to && from > to) throw badRequest("From date cannot be later than To date.");
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
        return {
          ok: true as const,
          records: [],
          total: 0,
          totalAmount: 0,
          limit,
          offset,
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

    return {
      ok: true as const,
      records,
      total: aggregate.totalRecords,
      totalAmount: aggregate.totalAmount,
      limit,
      offset,
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
      return {
        ok: true as const,
        nicknames: [],
        totalRecords: 0,
        totalAmount: 0,
        nicknameTotals: [],
        records: [],
        freshness: await getCollectionReportFreshness(this.storage),
      };
    }

    const summaryOnlyRaw = normalizeCollectionText(query.summaryOnly).toLowerCase();
    const summaryOnly = summaryOnlyRaw === "1" || summaryOnlyRaw === "true" || summaryOnlyRaw === "yes";
    const limitRaw = Number.parseInt(normalizeCollectionText(query.limit), 10);
    const offsetRaw = Number.parseInt(normalizeCollectionText(query.offset), 10);
    const recordLimit = Number.isInteger(limitRaw)
      ? Math.min(CollectionRecordService.NICKNAME_SUMMARY_RECORD_LIMIT, Math.max(1, limitRaw))
      : CollectionRecordService.NICKNAME_SUMMARY_RECORD_LIMIT;
    const recordOffset = Number.isInteger(offsetRaw)
      ? Math.max(0, offsetRaw)
      : 0;

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

    return {
      ok: true as const,
      nicknames: nicknameFilters,
      totalRecords: totals.totalRecords,
      totalAmount: totals.totalAmount,
      nicknameTotals,
      records,
      freshness,
    };
  }

  async listDailyUsers(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0]) {
    return this.dailyOperations.listDailyUsers(userInput);
  }

  async upsertDailyTarget(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    bodyRaw: unknown,
  ) {
    return this.dailyOperations.upsertDailyTarget(userInput, bodyRaw);
  }

  async upsertDailyCalendar(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    bodyRaw: unknown,
  ) {
    return this.dailyOperations.upsertDailyCalendar(userInput, bodyRaw);
  }

  async getDailyOverview(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    return this.dailyOperations.getDailyOverview(userInput, query);
  }

  async getDailyDayDetails(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    return this.dailyOperations.getDailyDayDetails(userInput, query);
  }

  async purgeOldRecords(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    bodyRaw?: unknown,
  ) {
    return this.mutationOperations.purgeOldRecords(userInput, bodyRaw);
  }

  async updateRecord(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    idRaw: unknown,
    bodyRaw: unknown,
  ) {
    return this.mutationOperations.updateRecord(userInput, idRaw, bodyRaw);
  }

  async deleteRecord(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    idRaw: unknown,
    bodyRaw?: unknown,
  ) {
    return this.mutationOperations.deleteRecord(userInput, idRaw, bodyRaw);
  }
}
