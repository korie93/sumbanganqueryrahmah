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
import { getCollectionDailyStatusMessage } from "./collection-daily-utils";
import { CollectionServiceSupport, type ListQuery, type SummaryQuery } from "./collection-service-support";
import {
  buildCollectionPurgeCutoffDate,
  getCollectionPurgeRetentionMonths,
} from "./collection-record-runtime-utils";
import { CollectionRecordMutationOperations } from "./collection-record-mutation-operations";
import { CollectionDailyOverviewService } from "./collection-daily-overview.service";

export class CollectionRecordService extends CollectionServiceSupport {
  private readonly mutationOperations: CollectionRecordMutationOperations;
  private readonly dailyOverviewService: CollectionDailyOverviewService;

  constructor(storage: ConstructorParameters<typeof CollectionServiceSupport>[0]) {
    super(storage);
    this.mutationOperations = new CollectionRecordMutationOperations(
      this.storage,
      this.requireUser.bind(this),
    );
    this.dailyOverviewService = new CollectionDailyOverviewService(this.storage);
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
        return this.buildEmptySummary(parsedYear);
      } else {
        nicknameFilters = allowedNicknames;
      }
    }

    const summary = await this.storage.getCollectionMonthlySummary({
      year: parsedYear,
      nicknames: user.role === "user" ? userOwnedRecordFilters.nicknames : nicknameFilters,
      createdByLogin: user.role === "user" ? userOwnedRecordFilters.createdByLogin : undefined,
    });

    return {
      ok: true as const,
      year: parsedYear,
      summary,
    };
  }

  async listRecords(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: ListQuery) {
    const user = this.requireUser(userInput);
    const from = normalizeCollectionText(query.from);
    const to = normalizeCollectionText(query.to);
    const search = normalizeCollectionText(query.search);
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
      };
    }

    const summaryOnlyRaw = normalizeCollectionText(query.summaryOnly).toLowerCase();
    const summaryOnly = summaryOnlyRaw === "1" || summaryOnlyRaw === "true" || summaryOnlyRaw === "yes";

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

    const aggregate = await this.storage.summarizeCollectionRecords({
      from: from || undefined,
      to: to || undefined,
      nicknames: nicknameFilters,
    });
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
    const records = summaryOnly
      ? []
      : await this.storage.listCollectionRecords({
          from: from || undefined,
          to: to || undefined,
          nicknames: nicknameFilters,
          limit: 5000,
        });

    return {
      ok: true as const,
      nicknames: nicknameFilters,
      totalRecords: aggregate.totalRecords,
      totalAmount: aggregate.totalAmount,
      nicknameTotals,
      records,
    };
  }

  async listDailyUsers(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0]) {
    const user = this.requireUser(userInput);
    if (user.role !== "admin" && user.role !== "superuser") {
      throw forbidden("Collection daily user list hanya untuk admin atau superuser.");
    }
    const users = await this.dailyOverviewService.listAvailableDailyUsers(user);
    return {
      ok: true as const,
      users,
    };
  }

  async upsertDailyTarget(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    if (user.role !== "admin" && user.role !== "superuser") {
      throw forbidden("Set target harian hanya untuk admin atau superuser.");
    }

    const body = ensureLooseObject(bodyRaw) || {};
    const username = normalizeCollectionText(body.nickname ?? body.username);
    const normalizedUsername = username.toLowerCase();
    const year = Number.parseInt(normalizeCollectionText(body.year), 10);
    const month = Number.parseInt(normalizeCollectionText(body.month), 10);
    const monthlyTarget = Number(body.monthlyTarget);

    if (!normalizedUsername) throw badRequest("Staff nickname is required.");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Invalid year.");
    if (!Number.isInteger(month) || month < 1 || month > 12) throw badRequest("Invalid month.");
    if (!Number.isFinite(monthlyTarget) || monthlyTarget < 0) {
      throw badRequest("Monthly target must be a non-negative number.");
    }

    const users = await this.listAvailableDailyUsers(user);
    const foundUser = users.some((item) => item.username.toLowerCase() === normalizedUsername);
    if (!foundUser) {
      throw badRequest("Staff nickname not found.");
    }

    const target = await this.storage.upsertCollectionDailyTarget({
      username: normalizedUsername,
      year,
      month,
      monthlyTarget,
      actor: user.username,
    });
    return {
      ok: true as const,
      target,
    };
  }

  async upsertDailyCalendar(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    if (user.role !== "admin" && user.role !== "superuser") {
      throw forbidden("Update daily calendar hanya untuk admin atau superuser.");
    }

    const body = ensureLooseObject(bodyRaw) || {};
    const year = Number.parseInt(normalizeCollectionText(body.year), 10);
    const month = Number.parseInt(normalizeCollectionText(body.month), 10);
    const rawDays = Array.isArray(body.days) ? body.days : [];

    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Invalid year.");
    if (!Number.isInteger(month) || month < 1 || month > 12) throw badRequest("Invalid month.");

    const maxDay = new Date(year, month, 0).getDate();
    const parsedDays = rawDays
      .map((item) => ensureLooseObject(item) || {})
      .map((item) => ({
        day: Number.parseInt(normalizeCollectionText(item.day), 10),
        isWorkingDay: item.isWorkingDay !== false,
        isHoliday: item.isHoliday === true,
        holidayName: normalizeCollectionText(item.holidayName) || null,
      }))
      .filter((item) => Number.isInteger(item.day) && item.day >= 1 && item.day <= maxDay);

    if (parsedDays.length === 0) {
      throw badRequest("At least one valid calendar day is required.");
    }

    const uniqueByDay = new Map<number, (typeof parsedDays)[number]>();
    for (const day of parsedDays) {
      uniqueByDay.set(day.day, day);
    }

    const calendar = await this.storage.upsertCollectionDailyCalendarDays({
      year,
      month,
      actor: user.username,
      days: Array.from(uniqueByDay.values()),
    });

    return {
      ok: true as const,
      calendar,
    };
  }

  async getDailyOverview(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    const user = this.requireUser(userInput);
    const year = Number.parseInt(normalizeCollectionText(query.year), 10);
    const month = Number.parseInt(normalizeCollectionText(query.month), 10);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Invalid year.");
    if (!Number.isInteger(month) || month < 1 || month > 12) throw badRequest("Invalid month.");
    const computation = await this.dailyOverviewService.buildDailyOverviewComputation(user, year, month, query);
    const selectedUsernames = computation.selectedUsers.map((item) => item.username);
    const currentNickname = await resolveCurrentCollectionNicknameFromSession(this.storage, user as any);

    return {
      ok: true as const,
      username: selectedUsernames[0] || normalizeCollectionText(currentNickname) || user.username.toLowerCase(),
      usernames: selectedUsernames,
      role: computation.selectedUsers.length === 1 ? computation.selectedUsers[0].role : "mixed",
      month: {
        year,
        month,
        daysInMonth: computation.daysInMonth,
      },
      summary: computation.summary,
      days: computation.days,
      carryForwardRule:
        "Daily requirement is calculated from remaining target divided by remaining working days, capped by the monthly target.",
    };
  }

  async getDailyDayDetails(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    const user = this.requireUser(userInput);
    const date = normalizeCollectionText(query.date);
    if (!date || !isValidCollectionDate(date)) throw badRequest("Invalid date.");

    const [yearText, monthText] = date.split("-");
    const year = Number.parseInt(yearText, 10);
    const month = Number.parseInt(monthText, 10);
    const pageRaw = Number.parseInt(normalizeCollectionText(query.page), 10);
    const pageSizeRaw = Number.parseInt(normalizeCollectionText(query.pageSize), 10);
    const pageSize = Number.isInteger(pageSizeRaw) ? Math.min(100, Math.max(1, pageSizeRaw)) : 10;
    const requestedPage = Number.isInteger(pageRaw) ? Math.max(1, pageRaw) : 1;

    const computation = await this.dailyOverviewService.buildDailyOverviewComputation(user, year, month, query);
    const selectedUsernames = computation.selectedUsers.map((item) => item.username);
    const dayOverview = computation.days.find((item) => item.date === date);
    if (!dayOverview) {
      throw badRequest("Date is outside selected month.");
    }

    const recordsByUser = await Promise.all(
      selectedUsernames.map((username) =>
        this.storage.listCollectionRecords({
          from: date,
          to: date,
          nicknames: [username],
          limit: 5000,
          offset: 0,
        })),
    );
    const mergedRecords = recordsByUser
      .flat()
      .sort((left, right) => {
        const leftTime = left.createdAt instanceof Date ? left.createdAt.getTime() : new Date(left.createdAt).getTime();
        const rightTime = right.createdAt instanceof Date ? right.createdAt.getTime() : new Date(right.createdAt).getTime();
        if (leftTime !== rightTime) return leftTime - rightTime;
        return left.id.localeCompare(right.id);
      });

    const totalRecords = mergedRecords.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const pagedRecords = mergedRecords.slice(offset, offset + pageSize);
    const pagedCustomers = pagedRecords.map((record) => ({
      id: record.id,
      customerName: record.customerName,
      accountNumber: record.accountNumber,
      amount: Number(record.amount || 0),
      collectionStaffNickname: record.collectionStaffNickname,
    }));

    const status = dayOverview.status;
    const message = getCollectionDailyStatusMessage(status);

    return {
      ok: true as const,
      username: selectedUsernames[0] || normalizeCollectionText(
        await resolveCurrentCollectionNicknameFromSession(this.storage, user as any),
      ) || user.username.toLowerCase(),
      usernames: selectedUsernames,
      date,
      status,
      message,
      amount: dayOverview.amount,
      dailyTarget: dayOverview.target,
      customers: pagedCustomers,
      summary: {
        monthlyTarget: computation.summary.monthlyTarget,
        collected: computation.summary.collectedAmount,
        balanced: computation.summary.balancedAmount,
        totalForDate: dayOverview.amount,
        targetForDate: dayOverview.target,
      },
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      records: pagedRecords.map((record) => ({
        id: record.id,
        customerName: record.customerName,
        accountNumber: record.accountNumber,
        paymentDate: record.paymentDate,
        amount: Number(record.amount || 0),
        batch: record.batch,
        paymentReference: record.accountNumber,
        username: record.createdByLogin,
        collectionStaffNickname: record.collectionStaffNickname,
        createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt),
        receiptFile: record.receiptFile,
        receipts: (record.receipts || []).map((receipt) => ({
          id: receipt.id,
          storagePath: receipt.storagePath,
          originalFileName: receipt.originalFileName,
          originalMimeType: receipt.originalMimeType,
          fileSize: receipt.fileSize,
          createdAt: receipt.createdAt instanceof Date ? receipt.createdAt.toISOString() : String(receipt.createdAt),
        })),
      })),
    };
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
