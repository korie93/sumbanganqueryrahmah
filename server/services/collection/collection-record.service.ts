import { badRequest, forbidden, notFound } from "../../http/errors";
import { verifyPassword } from "../../auth/passwords";
import {
  canUserAccessCollectionRecord,
  getAdminGroupNicknameValues,
  getAdminVisibleNicknameValues,
  hasNicknameValue,
  readNicknameFiltersFromQuery,
  resolveCurrentCollectionNicknameFromSession,
} from "../../routes/collection-access";
import { removeCollectionReceiptFile, saveCollectionReceipt } from "../../routes/collection-receipt.service";
import {
  COLLECTION_BATCHES,
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
  ensureLooseObject,
  isFutureCollectionDate,
  isNicknameScopeAllowedForRole,
  isValidCollectionDate,
  isValidCollectionPhone,
  normalizeCollectionStringList,
  normalizeCollectionText,
  parseCollectionAmount,
  type CollectionBatchValue,
  type CollectionCreatePayload,
  type CollectionReceiptPayload,
  type CollectionUpdatePayload,
} from "../../routes/collection.validation";
import {
  aggregateCollectionDailyTimelines,
  computeCollectionDailyTimeline,
  getCollectionDailyStatusMessage,
} from "./collection-daily-utils";
import { CollectionServiceSupport, type ListQuery, type SummaryQuery } from "./collection-service-support";

const COLLECTION_PURGE_RETENTION_MONTHS = 6;

type DailyResolvedUser = {
  id: string;
  username: string;
  role: string;
};

type DailyOverviewBundle = {
  user: DailyResolvedUser;
  timeline: ReturnType<typeof computeCollectionDailyTimeline>;
};

type DailyOverviewComputation = {
  selectedUsers: DailyResolvedUser[];
  summary: {
    monthlyTarget: number;
    collectedAmount: number;
    balancedAmount: number;
    workingDays: number;
    elapsedWorkingDays: number;
    remainingWorkingDays: number;
    completedDays: number;
    incompleteDays: number;
    noCollectionDays: number;
    neutralDays: number;
    baseDailyTarget: number;
    dailyTarget: number;
    expectedProgressAmount: number;
    progressVarianceAmount: number;
    achievedAmount: number;
    remainingAmount: number;
    metDays: number;
    yellowDays: number;
    redDays: number;
  };
  daysInMonth: number;
  days: Array<{
    day: number;
    date: string;
    amount: number;
    target: number;
    isWorkingDay: boolean;
    isHoliday: boolean;
    holidayName: string | null;
    customerCount: number;
    status: "green" | "yellow" | "red" | "neutral";
  }>;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildCollectionPurgeCutoffDate(referenceDate = new Date()): string {
  const utcYear = referenceDate.getUTCFullYear();
  const utcMonth = referenceDate.getUTCMonth();
  const utcDay = referenceDate.getUTCDate();

  const monthAnchor = new Date(Date.UTC(utcYear, utcMonth, 1));
  monthAnchor.setUTCMonth(monthAnchor.getUTCMonth() - COLLECTION_PURGE_RETENTION_MONTHS);

  const maxDayInTargetMonth = new Date(
    Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const safeDay = Math.min(utcDay, maxDayInTargetMonth);

  return new Date(
    Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth(), safeDay),
  )
    .toISOString()
    .slice(0, 10);
}

export class CollectionRecordService extends CollectionServiceSupport {
  private async logRejectedPurgeAttempt(username: string, details: string) {
    try {
      await this.storage.createAuditLog({
        action: "COLLECTION_RECORDS_PURGE_REJECTED",
        performedBy: username,
        targetResource: "collection-records",
        details,
      });
    } catch {
      // best effort audit only
    }
  }

  private parseRequestedDailyUsernames(query: ListQuery): string[] {
    const rawValues: unknown[] = [];
    const appendValues = (raw: unknown) => {
      if (Array.isArray(raw)) {
        for (const value of raw) appendValues(value);
        return;
      }
      const normalized = normalizeCollectionText(raw);
      if (!normalized) return;
      const parts = normalized
        .split(",")
        .map((value) => normalizeCollectionText(value))
        .filter(Boolean);
      rawValues.push(...parts);
    };

    appendValues(query.usernames);
    appendValues(query.username);
    appendValues(query.nicknames);
    appendValues(query.nickname);
    appendValues(query.staff);
    const normalized = normalizeCollectionStringList(rawValues)
      .map((value) => value.toLowerCase());
    return Array.from(new Set(normalized));
  }

  private async listAvailableDailyUsers(user: { username: string; role: string }): Promise<DailyResolvedUser[]> {
    const normalizeDailyUser = (
      id: string | null | undefined,
      username: string | null | undefined,
      role: string | null | undefined,
    ): DailyResolvedUser | null => {
      const normalizedUsername = normalizeCollectionText(username);
      if (!normalizedUsername) return null;
      return {
        id: normalizeCollectionText(id) || normalizedUsername.toLowerCase(),
        username: normalizedUsername,
        role: normalizeCollectionText(role) || "user",
      };
    };

    if (user.role === "user") {
      const currentNickname = await resolveCurrentCollectionNicknameFromSession(this.storage, user as any);
      if (!currentNickname) {
        return [];
      }
      const nicknameProfile = await this.storage.getCollectionStaffNicknameByName(currentNickname);
      const resolved = normalizeDailyUser(
        nicknameProfile?.id,
        nicknameProfile?.nickname || currentNickname,
        nicknameProfile?.roleScope || user.role,
      );
      return resolved ? [resolved] : [];
    }

    if (user.role === "admin") {
      const visibleNicknames = await getAdminVisibleNicknameValues(this.storage, user as any);
      if (visibleNicknames.length === 0) {
        return [];
      }
      const nicknameProfiles = await this.storage.getCollectionStaffNicknames();
      const profileByLower = new Map(
        nicknameProfiles.map((item) => [item.nickname.toLowerCase(), item]),
      );
      return visibleNicknames
        .map((nickname) => {
          const matched = profileByLower.get(nickname.toLowerCase());
          return normalizeDailyUser(
            matched?.id,
            matched?.nickname || nickname,
            matched?.roleScope || "user",
          );
        })
        .filter((item): item is DailyResolvedUser => Boolean(item));
    }

    const nicknameProfiles = await this.storage.getCollectionStaffNicknames();
    return nicknameProfiles
      .map((item) => normalizeDailyUser(item.id, item.nickname, item.roleScope))
      .filter((item): item is DailyResolvedUser => Boolean(item));
  }

  private resolveDailySelectedUsers(
    user: { username: string; role: string },
    requestedUsernames: string[],
    availableUsers: DailyResolvedUser[],
    preferredUsername?: string | null,
  ): DailyResolvedUser[] {
    const userMap = new Map<string, DailyResolvedUser>(
      availableUsers.map((item) => [
        item.username.toLowerCase(),
        item,
      ]),
    );
    if (user.role === "user") {
      const ownUsername = normalizeCollectionText(preferredUsername).toLowerCase();
      if (!ownUsername) {
        throw badRequest("Current staff nickname session could not be resolved.");
      }
      if (requestedUsernames.length > 0 && requestedUsernames.some((value) => value !== ownUsername)) {
        throw forbidden("User hanya boleh melihat data sendiri.");
      }
      const ownUser = userMap.get(ownUsername);
      if (!ownUser) {
        throw badRequest("Staff nickname not found.");
      }
      return [ownUser];
    }

    const preferredUsernameLower = normalizeCollectionText(preferredUsername).toLowerCase();
    const targetUsernames = requestedUsernames.length > 0
      ? requestedUsernames
      : (preferredUsernameLower && userMap.has(preferredUsernameLower)
          ? [preferredUsernameLower]
          : availableUsers.length > 0
            ? [availableUsers[0].username.toLowerCase()]
            : []);

    const selectedUsers: DailyResolvedUser[] = [];
    for (const username of targetUsernames) {
      const matched = userMap.get(username.toLowerCase());
      if (!matched) {
        throw badRequest(`Invalid staff nickname filter: ${username}`);
      }
      selectedUsers.push(matched);
    }

    if (selectedUsers.length === 0) {
      throw badRequest("No staff nicknames selected.");
    }

    return selectedUsers;
  }

  private async getDailyTargetForOwner(
    username: string,
    year: number,
    month: number,
    fallbackUsernames: string[] = [],
  ) {
    const normalizedFallbacks = Array.from(
      new Set(
        fallbackUsernames
          .map((value) => normalizeCollectionText(value).toLowerCase())
          .filter((value) => value && value !== username.toLowerCase()),
      ),
    );

    const directTarget = await this.storage.getCollectionDailyTarget({ username, year, month });
    if (directTarget) {
      return directTarget;
    }

    for (const fallbackUsername of normalizedFallbacks) {
      const fallbackTarget = await this.storage.getCollectionDailyTarget({
        username: fallbackUsername,
        year,
        month,
      });
      if (fallbackTarget) {
        return fallbackTarget;
      }
    }

    return undefined;
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

  private async buildDailyOverviewComputation(
    user: { username: string; role: string },
    year: number,
    month: number,
    query: ListQuery,
  ): Promise<DailyOverviewComputation> {
    const [users, currentNickname] = await Promise.all([
      this.listAvailableDailyUsers(user),
      resolveCurrentCollectionNicknameFromSession(this.storage, user as any),
    ]);
    const selectedUsers = this.resolveDailySelectedUsers(
      user,
      this.parseRequestedDailyUsernames(query),
      users,
      currentNickname,
    );

    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    const calendarRows = await this.storage.listCollectionDailyCalendar({ year, month });
    const currentNicknameLower = normalizeCollectionText(currentNickname).toLowerCase();
    const currentUsernameLower = normalizeCollectionText(user.username).toLowerCase();

    const bundles: DailyOverviewBundle[] = await Promise.all(
      selectedUsers.map(async (selectedUser) => {
        const fallbackUsernames =
          currentNicknameLower &&
          currentUsernameLower &&
          selectedUser.username.toLowerCase() === currentNicknameLower &&
          currentNicknameLower !== currentUsernameLower
            ? [currentUsernameLower]
            : [];
        const [target, records] = await Promise.all([
          this.getDailyTargetForOwner(selectedUser.username, year, month, fallbackUsernames),
          this.storage.listCollectionRecords({
            from: monthStart,
            to: monthEnd,
            nicknames: [selectedUser.username],
            limit: 5000,
            offset: 0,
          }),
        ]);

        const amountByDate = new Map<string, number>();
        const customerCountByDate = new Map<string, number>();
        for (const record of records) {
          const key = record.paymentDate;
          const amount = Number(record.amount || 0);
          amountByDate.set(key, roundMoney((amountByDate.get(key) || 0) + (Number.isFinite(amount) ? amount : 0)));
          customerCountByDate.set(key, (customerCountByDate.get(key) || 0) + 1);
        }

        return {
          user: selectedUser,
          timeline: computeCollectionDailyTimeline({
            year,
            month,
            monthlyTarget: Number(target?.monthlyTarget || 0),
            calendarRows,
            amountByDate,
            customerCountByDate,
          }),
        };
      }),
    );
    const aggregate = aggregateCollectionDailyTimelines(
      bundles.map((bundle) => bundle.timeline),
    );

    return {
      selectedUsers,
      summary: aggregate.summary,
      daysInMonth: aggregate.daysInMonth || daysInMonth,
      days: aggregate.days,
    };
  }

  async createRecord(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    const uploadedReceipts: Array<Awaited<ReturnType<typeof saveCollectionReceipt>>> = [];

    try {
      const body = (ensureLooseObject(bodyRaw) || {}) as CollectionCreatePayload;
      const customerName = normalizeCollectionText(body.customerName);
      const icNumber = normalizeCollectionText(body.icNumber);
      const customerPhone = normalizeCollectionText(body.customerPhone);
      const accountNumber = normalizeCollectionText(body.accountNumber);
      const batch = normalizeCollectionText(body.batch).toUpperCase();
      const paymentDate = normalizeCollectionText(body.paymentDate);
      const collectionStaffNickname = normalizeCollectionText(body.collectionStaffNickname);
      const amount = parseCollectionAmount(body.amount);

      if (!customerName) throw badRequest("Customer Name is required.");
      if (!icNumber) throw badRequest("IC Number is required.");
      if (!isValidCollectionPhone(customerPhone)) throw badRequest("Customer Phone Number is invalid.");
      if (!accountNumber) throw badRequest("Account Number is required.");
      if (!COLLECTION_BATCHES.has(batch)) throw badRequest("Invalid batch value.");
      if (!paymentDate || !isValidCollectionDate(paymentDate)) throw badRequest("Invalid payment date.");
      if (isFutureCollectionDate(paymentDate)) throw badRequest("Payment date cannot be in the future.");
      if (amount === null) throw badRequest("Amount must be a positive number.");
      if (collectionStaffNickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
        throw badRequest("Staff nickname must be at least 2 characters.");
      }

      const staffNickname = await this.storage.getCollectionStaffNicknameByName(collectionStaffNickname);
      if (!staffNickname?.isActive) {
        throw badRequest("Staff nickname tidak sah atau sudah inactive.");
      }
      if (user.role === "admin") {
        const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
        if (!hasNicknameValue(allowedNicknames, collectionStaffNickname)) {
          throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
        }
      } else if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
        throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
      }

      const receiptPayload = ensureLooseObject(body.receipt) as CollectionReceiptPayload | null;
      const receiptPayloads = [
        ...(receiptPayload ? [receiptPayload] : []),
        ...(Array.isArray(body.receipts)
          ? body.receipts
              .map((item) => ensureLooseObject(item) as CollectionReceiptPayload | null)
              .filter((item): item is CollectionReceiptPayload => Boolean(item))
          : []),
      ];
      for (const nextReceipt of receiptPayloads) {
        uploadedReceipts.push(await saveCollectionReceipt(nextReceipt));
      }

      const record = await this.storage.createCollectionRecord({
        customerName,
        icNumber,
        customerPhone,
        accountNumber,
        batch: batch as CollectionBatchValue,
        paymentDate,
        amount,
        receiptFile: uploadedReceipts[0]?.storagePath ?? null,
        createdByLogin: user.username,
        collectionStaffNickname,
      });
      if (uploadedReceipts.length > 0) {
        await this.storage.createCollectionRecordReceipts(record.id, uploadedReceipts);
      }
      const hydratedRecord = await this.storage.getCollectionRecordById(record.id);
      const finalRecord = hydratedRecord || record;

      await this.storage.createAuditLog({
        action: "COLLECTION_RECORD_CREATED",
        performedBy: user.username,
        targetResource: finalRecord.id,
        details: `Collection record created by ${user.username}`,
      });

      return { ok: true as const, record: finalRecord };
    } catch (err) {
      for (const uploadedReceipt of uploadedReceipts) {
        await removeCollectionReceiptFile(uploadedReceipt.storagePath);
      }
      throw err;
    }
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
      retentionMonths: COLLECTION_PURGE_RETENTION_MONTHS,
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
    const users = await this.listAvailableDailyUsers(user);
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
    const computation = await this.buildDailyOverviewComputation(user, year, month, query);
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
        "Daily shortfall is carried forward to the next working day. Excess collection reduces future required targets.",
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

    const computation = await this.buildDailyOverviewComputation(user, year, month, query);
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
    const user = this.requireUser(userInput);
    if (user.role !== "superuser") {
      throw forbidden("Purge data collection hanya untuk superuser.");
    }

    const actor =
      (user.userId ? await this.storage.getUser(user.userId) : undefined)
      || (await this.storage.getUserByUsername(user.username));
    if (!actor?.passwordHash) {
      throw forbidden("Tidak dapat sahkan kelayakan superuser.");
    }

    const body = ensureLooseObject(bodyRaw) || {};
    const currentPassword = String(body.currentPassword || "");
    if (!currentPassword) {
      throw badRequest("Password login superuser diperlukan untuk purge.");
    }

    const isValidPassword = await verifyPassword(currentPassword, actor.passwordHash);
    if (!isValidPassword) {
      await this.logRejectedPurgeAttempt(
        user.username,
        `Rejected collection purge attempt due to invalid superuser password by ${user.username}`,
      );
      throw forbidden("Password login superuser tidak sah.");
    }

    const cutoffDate = buildCollectionPurgeCutoffDate();
    const purged = await this.storage.purgeCollectionRecordsOlderThan(cutoffDate);
    if (purged.receiptPaths.length > 0) {
      await Promise.allSettled(
        purged.receiptPaths.map((receiptPath) => removeCollectionReceiptFile(receiptPath)),
      );
    }

    if (purged.totalRecords > 0) {
      await this.storage.createAuditLog({
        action: "COLLECTION_RECORDS_PURGED",
        performedBy: user.username,
        targetResource: "collection-records",
        details: `Purged ${purged.totalRecords} collection records older than ${cutoffDate} by ${user.username}`,
      });
    }

    return {
      ok: true as const,
      retentionMonths: COLLECTION_PURGE_RETENTION_MONTHS,
      cutoffDate,
      deletedRecords: purged.totalRecords,
      totalAmount: purged.totalAmount,
    };
  }

  async updateRecord(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    idRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const id = normalizeCollectionText(idRaw);
    if (!id) {
      throw badRequest("Collection id is required.");
    }

    const existing = await this.storage.getCollectionRecordById(id);
    if (!existing) {
      throw notFound("Collection record not found.");
    }
    if (!(await canUserAccessCollectionRecord(this.storage, user, existing))) {
      throw forbidden("Forbidden");
    }

    const uploadedReceipts: Array<Awaited<ReturnType<typeof saveCollectionReceipt>>> = [];
    try {
      const body = (ensureLooseObject(bodyRaw) || {}) as CollectionUpdatePayload;
      const updatePayload: Record<string, unknown> = {};
      const customerName = normalizeCollectionText(body.customerName);
      const icNumber = normalizeCollectionText(body.icNumber);
      const customerPhone = normalizeCollectionText(body.customerPhone);
      const accountNumber = normalizeCollectionText(body.accountNumber);
      const batch = normalizeCollectionText(body.batch).toUpperCase();
      const paymentDate = normalizeCollectionText(body.paymentDate);
      const collectionStaffNickname = normalizeCollectionText(body.collectionStaffNickname);
      const amount = body.amount !== undefined ? parseCollectionAmount(body.amount) : null;

      if (body.customerName !== undefined) {
        if (!customerName) throw badRequest("Customer Name cannot be empty.");
        updatePayload.customerName = customerName;
      }
      if (body.icNumber !== undefined) {
        if (!icNumber) throw badRequest("IC Number cannot be empty.");
        updatePayload.icNumber = icNumber;
      }
      if (body.customerPhone !== undefined) {
        if (!isValidCollectionPhone(customerPhone)) throw badRequest("Customer Phone Number is invalid.");
        updatePayload.customerPhone = customerPhone;
      }
      if (body.accountNumber !== undefined) {
        if (!accountNumber) throw badRequest("Account Number cannot be empty.");
        updatePayload.accountNumber = accountNumber;
      }
      if (body.batch !== undefined) {
        if (!COLLECTION_BATCHES.has(batch)) throw badRequest("Invalid batch value.");
        updatePayload.batch = batch;
      }
      if (body.paymentDate !== undefined) {
        if (!paymentDate || !isValidCollectionDate(paymentDate)) throw badRequest("Invalid payment date.");
        if (isFutureCollectionDate(paymentDate)) throw badRequest("Payment date cannot be in the future.");
        updatePayload.paymentDate = paymentDate;
      }
      if (body.amount !== undefined) {
        if (amount === null) throw badRequest("Amount must be a positive number.");
        updatePayload.amount = amount;
      }
      if (body.collectionStaffNickname !== undefined) {
        if (collectionStaffNickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
          throw badRequest("Staff nickname must be at least 2 characters.");
        }
        const staffNickname = await this.storage.getCollectionStaffNicknameByName(collectionStaffNickname);
        if (!staffNickname?.isActive) {
          throw badRequest("Staff nickname tidak sah atau sudah inactive.");
        }
        if (user.role === "admin") {
          const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
          if (!hasNicknameValue(allowedNicknames, collectionStaffNickname)) {
            throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
          }
        } else if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
          throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
        }
        updatePayload.collectionStaffNickname = collectionStaffNickname;
      }

      const shouldRemoveReceipt = body.removeReceipt === true;
      const receiptPayload = ensureLooseObject(body.receipt) as CollectionReceiptPayload | null;
      const receiptPayloads = [
        ...(receiptPayload ? [receiptPayload] : []),
        ...(Array.isArray(body.receipts)
          ? body.receipts
              .map((item) => ensureLooseObject(item) as CollectionReceiptPayload | null)
              .filter((item): item is CollectionReceiptPayload => Boolean(item))
          : []),
      ];
      const removeReceiptIds = Array.isArray(body.removeReceiptIds)
        ? normalizeCollectionStringList(body.removeReceiptIds)
        : [];
      for (const nextReceipt of receiptPayloads) {
        uploadedReceipts.push(await saveCollectionReceipt(nextReceipt));
      }

      const hasReceiptMutation = shouldRemoveReceipt || removeReceiptIds.length > 0 || uploadedReceipts.length > 0;
      if (Object.keys(updatePayload).length === 0 && !hasReceiptMutation) {
        return { ok: true as const, record: existing };
      }

      const removedReceipts = shouldRemoveReceipt
        ? await this.storage.deleteAllCollectionRecordReceipts(id)
        : removeReceiptIds.length > 0
          ? await this.storage.deleteCollectionRecordReceipts(id, removeReceiptIds)
          : [];
      if (uploadedReceipts.length > 0) {
        await this.storage.createCollectionRecordReceipts(id, uploadedReceipts);
      }

      const finalReceipts = hasReceiptMutation
        ? await this.storage.listCollectionRecordReceipts(id)
        : existing.receipts;
      if (hasReceiptMutation) {
        updatePayload.receiptFile = finalReceipts[0]?.storagePath ?? null;
      }

      const updated = await this.storage.updateCollectionRecord(id, updatePayload);
      if (!updated) {
        for (const uploadedReceipt of uploadedReceipts) {
          await removeCollectionReceiptFile(uploadedReceipt.storagePath);
        }
        throw notFound("Collection record not found.");
      }

      for (const removedReceipt of removedReceipts) {
        await removeCollectionReceiptFile(removedReceipt.storagePath);
      }

      await this.storage.createAuditLog({
        action: "COLLECTION_RECORD_UPDATED",
        performedBy: user.username,
        targetResource: updated.id,
        details: `Collection record updated by ${user.username}`,
      });

      return { ok: true as const, record: updated };
    } catch (err) {
      for (const uploadedReceipt of uploadedReceipts) {
        await removeCollectionReceiptFile(uploadedReceipt.storagePath);
      }
      throw err;
    }
  }

  async deleteRecord(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], idRaw: unknown) {
    const user = this.requireUser(userInput);
    const id = normalizeCollectionText(idRaw);
    if (!id) {
      throw badRequest("Collection id is required.");
    }

    const existing = await this.storage.getCollectionRecordById(id);
    if (!existing) {
      throw notFound("Collection record not found.");
    }
    if (!(await canUserAccessCollectionRecord(this.storage, user, existing))) {
      throw forbidden("Forbidden");
    }

    const removedReceipts = await this.storage.deleteAllCollectionRecordReceipts(id);
    await this.storage.deleteCollectionRecord(id);
    for (const receipt of removedReceipts) {
      await removeCollectionReceiptFile(receipt.storagePath);
    }
    if (removedReceipts.length === 0 && existing.receiptFile) {
      await removeCollectionReceiptFile(existing.receiptFile);
    }

    await this.storage.createAuditLog({
      action: "COLLECTION_RECORD_DELETED",
      performedBy: user.username,
      targetResource: existing.id,
      details: `Collection record deleted by ${user.username}`,
    });

    return { ok: true as const };
  }
}
