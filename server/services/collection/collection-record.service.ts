import { badRequest, forbidden, notFound } from "../../http/errors";
import { verifyPassword } from "../../auth/passwords";
import {
  getAdminGroupNicknameValues,
  getAdminVisibleNicknameValues,
  hasNicknameValue,
  readNicknameFiltersFromQuery,
} from "../../routes/collection-access";
import { removeCollectionReceiptFile, saveCollectionReceipt } from "../../routes/collection-receipt.service";
import {
  COLLECTION_BATCHES,
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
  ensureLooseObject,
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
import { CollectionServiceSupport, type ListQuery, type SummaryQuery } from "./collection-service-support";

const COLLECTION_PURGE_RETENTION_MONTHS = 6;

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
      nicknames: nicknameFilters,
      createdByLogin: user.role === "user" ? user.username : undefined,
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
      createdByLogin: user.role === "user" ? user.username : undefined,
      nicknames: nicknameFilters,
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
    const users = await this.storage.listCollectionDailyUsers();
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
    const username = normalizeCollectionText(body.username).toLowerCase();
    const year = Number.parseInt(normalizeCollectionText(body.year), 10);
    const month = Number.parseInt(normalizeCollectionText(body.month), 10);
    const monthlyTarget = Number(body.monthlyTarget);

    if (!username) throw badRequest("Username is required.");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Invalid year.");
    if (!Number.isInteger(month) || month < 1 || month > 12) throw badRequest("Invalid month.");
    if (!Number.isFinite(monthlyTarget) || monthlyTarget < 0) {
      throw badRequest("Monthly target must be a non-negative number.");
    }

    const users = await this.storage.listCollectionDailyUsers();
    const foundUser = users.some((item) => item.username.toLowerCase() === username);
    if (!foundUser) {
      throw badRequest("User not found.");
    }

    const target = await this.storage.upsertCollectionDailyTarget({
      username,
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
    const requestedUsername = normalizeCollectionText(query.username).toLowerCase();

    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Invalid year.");
    if (!Number.isInteger(month) || month < 1 || month > 12) throw badRequest("Invalid month.");

    const username = user.role === "user" ? user.username.toLowerCase() : (requestedUsername || user.username.toLowerCase());
    if (user.role === "user" && requestedUsername && requestedUsername !== username) {
      throw forbidden("User hanya boleh melihat data sendiri.");
    }

    const users = await this.storage.listCollectionDailyUsers();
    const foundUser = users.find((item) => item.username.toLowerCase() === username);
    if (!foundUser) throw badRequest("User not found.");

    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

    const [target, calendarRows, records] = await Promise.all([
      this.storage.getCollectionDailyTarget({ username, year, month }),
      this.storage.listCollectionDailyCalendar({ year, month }),
      this.storage.listCollectionRecords({
        from: monthStart,
        to: monthEnd,
        createdByLogin: username,
        limit: 5000,
        offset: 0,
      }),
    ]);

    const calendarByDay = new Map(calendarRows.map((item) => [item.day, item]));
    const amountByDate = new Map<string, number>();
    const customerCountByDate = new Map<string, number>();
    for (const record of records) {
      const key = record.paymentDate;
      const amount = Number(record.amount || 0);
      amountByDate.set(key, (amountByDate.get(key) || 0) + (Number.isFinite(amount) ? amount : 0));
      customerCountByDate.set(key, (customerCountByDate.get(key) || 0) + 1);
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const monthlyTarget = Number(target?.monthlyTarget || 0);
    let workingDays = 0;
    const workingFlags: boolean[] = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const override = calendarByDay.get(day);
      const defaultWorking = (() => {
        const weekday = new Date(year, month - 1, day).getDay();
        return weekday !== 0 && weekday !== 6;
      })();
      const isWorkingDay = override ? Boolean(override.isWorkingDay) && !Boolean(override.isHoliday) : defaultWorking;
      workingFlags.push(isWorkingDay);
      if (isWorkingDay) {
        workingDays += 1;
      }
    }

    const dailyTarget = workingDays > 0 ? monthlyTarget / workingDays : 0;
    let achievedAmount = 0;
    let metDays = 0;
    let yellowDays = 0;
    let redDays = 0;
    let neutralDays = 0;

    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const amount = amountByDate.get(date) || 0;
      achievedAmount += amount;
      const override = calendarByDay.get(day);
      const isWorkingDay = workingFlags[index];

      let status: "green" | "yellow" | "red" | "neutral" = "neutral";
      if (!isWorkingDay) {
        status = "neutral";
        neutralDays += 1;
      } else if (amount <= 0) {
        status = "red";
        redDays += 1;
      } else if (amount < dailyTarget) {
        status = "yellow";
        yellowDays += 1;
      } else {
        status = "green";
        metDays += 1;
      }

      return {
        day,
        date,
        amount,
        target: dailyTarget,
        isWorkingDay,
        isHoliday: Boolean(override?.isHoliday),
        holidayName: override?.holidayName || null,
        customerCount: customerCountByDate.get(date) || 0,
        status,
      };
    });

    const remainingAmount = Math.max(0, monthlyTarget - achievedAmount);

    return {
      ok: true as const,
      username,
      role: foundUser.role,
      month: {
        year,
        month,
        daysInMonth,
      },
      summary: {
        monthlyTarget,
        achievedAmount,
        remainingAmount,
        workingDays,
        metDays,
        yellowDays,
        redDays,
        neutralDays,
        dailyTarget,
      },
      days,
    };
  }

  async getDailyDayDetails(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    query: ListQuery,
  ) {
    const user = this.requireUser(userInput);
    const date = normalizeCollectionText(query.date);
    const requestedUsername = normalizeCollectionText(query.username).toLowerCase();
    if (!date || !isValidCollectionDate(date)) throw badRequest("Invalid date.");

    const username = user.role === "user" ? user.username.toLowerCase() : (requestedUsername || user.username.toLowerCase());
    if (user.role === "user" && requestedUsername && requestedUsername !== username) {
      throw forbidden("User hanya boleh melihat data sendiri.");
    }

    const [yearText, monthText, dayText] = date.split("-");
    const year = Number.parseInt(yearText, 10);
    const month = Number.parseInt(monthText, 10);
    const day = Number.parseInt(dayText, 10);

    const [target, calendarRows, customers] = await Promise.all([
      this.storage.getCollectionDailyTarget({ username, year, month }),
      this.storage.listCollectionDailyCalendar({ year, month }),
      this.storage.listCollectionDailyPaidCustomers({ username, date }),
    ]);

    const amount = customers.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const calendar = calendarRows.find((item) => item.day === day);
    const defaultWorking = (() => {
      const weekday = new Date(year, month - 1, day).getDay();
      return weekday !== 0 && weekday !== 6;
    })();
    const isWorkingDay = calendar ? Boolean(calendar.isWorkingDay) && !Boolean(calendar.isHoliday) : defaultWorking;
    const workingDays = (() => {
      const daysInMonth = new Date(year, month, 0).getDate();
      let total = 0;
      const byDay = new Map(calendarRows.map((item) => [item.day, item]));
      for (let d = 1; d <= daysInMonth; d += 1) {
        const override = byDay.get(d);
        const isWorking = override
          ? Boolean(override.isWorkingDay) && !Boolean(override.isHoliday)
          : (() => {
            const weekday = new Date(year, month - 1, d).getDay();
            return weekday !== 0 && weekday !== 6;
          })();
        if (isWorking) total += 1;
      }
      return total;
    })();
    const dailyTarget = workingDays > 0 ? Number(target?.monthlyTarget || 0) / workingDays : 0;

    let status: "green" | "yellow" | "red" | "neutral" = "neutral";
    let message = "";
    if (!isWorkingDay) {
      status = "neutral";
      message = "Non-working day.";
    } else if (amount <= 0) {
      status = "red";
      message = "No collection recorded for this day.";
    } else if (amount < dailyTarget) {
      status = "yellow";
      message = "Daily target not achieved";
    } else {
      status = "green";
      message = "Daily target achieved.";
    }

    return {
      ok: true as const,
      username,
      date,
      status,
      message,
      amount,
      dailyTarget,
      customers,
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
