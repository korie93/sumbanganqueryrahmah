import { apiRequest } from "../api-client";
import { parseApiJson } from "./contract";
import { z } from "zod";
import {
  parseCollectionAmountMyrNumber,
  type CollectionAmountMyrNumber,
} from "@shared/collection-amount-types";
import {
  isCollectionDailyCalendarStatus,
  isCollectionDailyLeaveType,
  type CollectionDailyCalendarStatus,
  type CollectionDailyLeaveType,
} from "@shared/collection-daily-status";
import type {
  CollectionDailyDayDetailsResponse,
  CollectionDailyCalendarAuditEntry,
  CollectionDailyCalendarAuditResponse,
  CollectionDailyOverviewResponse,
  CollectionDailyUser,
  CollectionReportFreshness,
} from "./collection-types";

type CollectionDailyRequestOptions = {
  signal?: AbortSignal | undefined;
};

type UnknownRecord = Record<string, unknown>;

const nonNegativeAmountSchema = z.number().finite().nonnegative();
const collectionDailyCalendarStatusSchema = z.enum(["WORKING", "HOLIDAY"]);
const collectionDailyLeaveTypeSchema = z.enum(["AL", "MC", "EL", "UL", "RL", "OFF"]);

const collectionDailyTargetResponseSchema = z.object({
  ok: z.literal(true),
  target: z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    monthlyTarget: nonNegativeAmountSchema,
  }).passthrough(),
});

const collectionDailyCalendarRowSchema = z.object({
  day: z.number().int().min(1).max(31),
  status: collectionDailyCalendarStatusSchema.optional(),
  leaveType: collectionDailyLeaveTypeSchema.nullable().optional(),
  note: z.string().nullable().optional(),
  isWorkingDay: z.boolean().optional(),
  isHoliday: z.boolean().optional(),
  holidayName: z.string().nullable().optional(),
}).passthrough();

const collectionDailyCalendarMutationResponseSchema = z.object({
  ok: z.literal(true),
  calendar: z.array(collectionDailyCalendarRowSchema).max(31),
});

const collectionDailyCalendarDeleteResponseSchema = z.object({
  ok: z.literal(true),
  deleted: z.boolean(),
});

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function readNullableString(value: unknown): string | null {
  const normalized = readString(value);
  return normalized || null;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readInteger(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function readPositiveInteger(value: unknown, fallback = 0) {
  return Math.max(0, readInteger(value, fallback));
}

function readAmount(value: unknown, fallback: CollectionAmountMyrNumber = 0) {
  const normalized = parseCollectionAmountMyrNumber(value as string | number);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeUsernames(value: unknown, fallback?: string | null) {
  const normalized = Array.isArray(value)
    ? value.map((entry) => readString(entry)).filter(Boolean)
    : [];
  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }
  const fallbackValue = readString(fallback);
  return fallbackValue ? [fallbackValue] : [];
}

function normalizeCollectionDailyStatus(
  value: unknown,
): CollectionDailyOverviewResponse["days"][number]["status"] {
  if (value === "green" || value === "yellow" || value === "red" || value === "neutral") {
    return value;
  }
  return "neutral";
}

function normalizeCollectionDailyCalendarStatus(value: unknown) {
  const normalized = readString(value).toUpperCase();
  return isCollectionDailyCalendarStatus(normalized) ? normalized : "WORKING";
}

function normalizeCollectionDailyLeaveType(value: unknown) {
  const normalized = readString(value).toUpperCase();
  return isCollectionDailyLeaveType(normalized) ? normalized : null;
}

function normalizeFreshness(value: unknown): CollectionReportFreshness | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const status = record.status;
  if (status !== "fresh" && status !== "warming" && status !== "stale") {
    return undefined;
  }

  return {
    status,
    pendingCount: readPositiveInteger(record.pendingCount),
    runningCount: readPositiveInteger(record.runningCount),
    retryCount: readPositiveInteger(record.retryCount),
    oldestPendingAgeMs: readPositiveInteger(record.oldestPendingAgeMs),
    message: readString(record.message) || "Collection rollup freshness is unavailable.",
  };
}

function normalizeCollectionDailyUser(value: unknown, index: number): CollectionDailyUser | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const username = readString(record.username);
  if (!username) {
    return null;
  }

  return {
    id: readString(record.id) || `${username.toLowerCase()}-${index + 1}`,
    username,
    role: readString(record.role) || "user",
  };
}

function normalizeCollectionDailyAuditAction(
  value: unknown,
): CollectionDailyCalendarAuditEntry["action"] {
  return value === "CREATE" || value === "UPDATE" || value === "DELETE" ? value : "UPDATE";
}

function normalizeCollectionDailyCalendarAuditEntry(
  value: unknown,
  index: number,
  filters: { username: string; year: number; month: number; day: number },
): CollectionDailyCalendarAuditEntry | null {
  const record = asRecord(value);
  if (!record) return null;
  const day = Math.max(1, readPositiveInteger(record.day, filters.day));
  const date =
    readString(record.date)
    || readString(record.calendarDate ?? record.calendar_date)
    || `${filters.year}-${String(filters.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return {
    id: readString(record.id) || `${date}-${index + 1}`,
    calendarId: readNullableString(record.calendarId ?? record.calendar_id),
    username: readString(record.username) || filters.username,
    date,
    year: readPositiveInteger(record.year, filters.year) || filters.year,
    month: Math.min(12, Math.max(1, readPositiveInteger(record.month, filters.month) || filters.month)),
    day,
    action: normalizeCollectionDailyAuditAction(record.action),
    oldStatus: record.oldStatus || record.old_status
      ? normalizeCollectionDailyCalendarStatus(record.oldStatus ?? record.old_status)
      : null,
    newStatus: record.newStatus || record.new_status
      ? normalizeCollectionDailyCalendarStatus(record.newStatus ?? record.new_status)
      : null,
    oldLeaveType: normalizeCollectionDailyLeaveType(record.oldLeaveType ?? record.old_leave_type),
    newLeaveType: normalizeCollectionDailyLeaveType(record.newLeaveType ?? record.new_leave_type),
    oldNote: readNullableString(record.oldNote ?? record.old_note),
    newNote: readNullableString(record.newNote ?? record.new_note),
    oldHolidayName: readNullableString(record.oldHolidayName ?? record.old_holiday_name),
    newHolidayName: readNullableString(record.newHolidayName ?? record.new_holiday_name),
    actor: readNullableString(record.actor),
    createdAt: readString(record.createdAt ?? record.created_at),
  };
}

function normalizeCollectionDailyCalendarAuditResponse(
  value: unknown,
  filters: { username: string; year: number; month: number; day: number },
): CollectionDailyCalendarAuditResponse {
  const record = asRecord(value);
  return {
    ok: readBoolean(record?.ok, true),
    username: readString(record?.username) || filters.username,
    year: readPositiveInteger(record?.year, filters.year) || filters.year,
    month: Math.min(12, Math.max(1, readPositiveInteger(record?.month, filters.month) || filters.month)),
    day: Math.max(1, readPositiveInteger(record?.day, filters.day)),
    audit: Array.isArray(record?.audit)
      ? record.audit
          .map((entry, index) => normalizeCollectionDailyCalendarAuditEntry(entry, index, filters))
          .filter((entry): entry is CollectionDailyCalendarAuditEntry => Boolean(entry))
      : [],
  };
}

function normalizeCollectionDailyOverviewResponse(
  value: unknown,
  filters: { year: number; month: number },
): CollectionDailyOverviewResponse {
  const record = asRecord(value);
  const monthRecord = asRecord(record?.month);
  const summaryRecord = asRecord(record?.summary);
  const year = readPositiveInteger(monthRecord?.year, filters.year) || filters.year;
  const month = Math.min(12, Math.max(1, readPositiveInteger(monthRecord?.month, filters.month) || filters.month));
  const daysInMonth = Math.max(28, readPositiveInteger(monthRecord?.daysInMonth, new Date(year, month, 0).getDate()));
  const username = readString(record?.username);
  const usernames = normalizeUsernames(record?.usernames, username);
  const carryForwardRule = readString(record?.carryForwardRule);
  const freshness = normalizeFreshness(record?.freshness);

  return {
    ok: readBoolean(record?.ok, true),
    username: username || usernames[0] || "",
    usernames,
    role: readString(record?.role) || "user",
    month: {
      year,
      month,
      daysInMonth,
    },
    summary: {
      monthlyTarget: readAmount(summaryRecord?.monthlyTarget),
      collectedToDate: readAmount(summaryRecord?.collectedToDate),
      collectedAmount: readAmount(summaryRecord?.collectedAmount),
      remainingTarget: readAmount(summaryRecord?.remainingTarget),
      balancedAmount: readAmount(summaryRecord?.balancedAmount),
      workingDays: readPositiveInteger(summaryRecord?.workingDays),
      elapsedWorkingDays: readPositiveInteger(summaryRecord?.elapsedWorkingDays),
      remainingWorkingDays: readPositiveInteger(summaryRecord?.remainingWorkingDays),
      requiredPerRemainingWorkingDay: readAmount(summaryRecord?.requiredPerRemainingWorkingDay),
      completedDays: readPositiveInteger(summaryRecord?.completedDays),
      incompleteDays: readPositiveInteger(summaryRecord?.incompleteDays),
      noCollectionDays: readPositiveInteger(summaryRecord?.noCollectionDays),
      neutralDays: readPositiveInteger(summaryRecord?.neutralDays),
      baseDailyTarget: readAmount(summaryRecord?.baseDailyTarget),
      dailyTarget: readAmount(summaryRecord?.dailyTarget),
      expectedProgressAmount: readAmount(summaryRecord?.expectedProgressAmount),
      progressVarianceAmount: readAmount(summaryRecord?.progressVarianceAmount),
      achievedAmount: readAmount(summaryRecord?.achievedAmount),
      remainingAmount: readAmount(summaryRecord?.remainingAmount),
      metDays: readPositiveInteger(summaryRecord?.metDays),
      yellowDays: readPositiveInteger(summaryRecord?.yellowDays),
      redDays: readPositiveInteger(summaryRecord?.redDays),
    },
    days: Array.isArray(record?.days)
      ? record.days.map((entry, index) => {
          const dayRecord = asRecord(entry);
          const day = Math.max(1, readPositiveInteger(dayRecord?.day, index + 1));
          const isHoliday = readBoolean(dayRecord?.isHoliday);
          return {
            day,
            date:
              readString(dayRecord?.date)
              || `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
            amount: readAmount(dayRecord?.amount),
            target: readAmount(dayRecord?.target),
            calendarStatus: dayRecord?.calendarStatus || dayRecord?.calendar_status
              ? normalizeCollectionDailyCalendarStatus(dayRecord?.calendarStatus ?? dayRecord?.calendar_status)
              : isHoliday
                ? "HOLIDAY"
                : "WORKING",
            leaveType: normalizeCollectionDailyLeaveType(dayRecord?.leaveType ?? dayRecord?.leave_type),
            note: readNullableString(dayRecord?.note),
            createdBy: readNullableString(dayRecord?.createdBy ?? dayRecord?.created_by),
            updatedBy: readNullableString(dayRecord?.updatedBy ?? dayRecord?.updated_by),
            createdAt: readNullableString(dayRecord?.createdAt ?? dayRecord?.created_at),
            updatedAt: readNullableString(dayRecord?.updatedAt ?? dayRecord?.updated_at),
            isWorkingDay: readBoolean(dayRecord?.isWorkingDay),
            isHoliday,
            holidayName: readNullableString(dayRecord?.holidayName),
            customerCount: readPositiveInteger(dayRecord?.customerCount),
            status: normalizeCollectionDailyStatus(dayRecord?.status),
          };
        })
      : [],
    ...(carryForwardRule ? { carryForwardRule } : {}),
    ...(freshness ? { freshness } : {}),
  };
}

function normalizeCollectionDailyDayDetailsResponse(
  value: unknown,
  filters: { date: string; page?: number | undefined; pageSize?: number | undefined },
): CollectionDailyDayDetailsResponse {
  const record = asRecord(value);
  const summaryRecord = asRecord(record?.summary);
  const paginationRecord = asRecord(record?.pagination);
  const username = readString(record?.username);
  const usernames = normalizeUsernames(record?.usernames, username);
  const pageSize = Math.max(1, readPositiveInteger(paginationRecord?.pageSize, filters.pageSize ?? 10));
  const totalRecords = readPositiveInteger(paginationRecord?.totalRecords);
  const totalPages = Math.max(1, readPositiveInteger(paginationRecord?.totalPages, totalRecords > 0 ? Math.ceil(totalRecords / pageSize) : 1));
  const page = Math.min(totalPages, Math.max(1, readPositiveInteger(paginationRecord?.page, filters.page ?? 1)));
  const freshness = normalizeFreshness(record?.freshness);

  return {
    ok: readBoolean(record?.ok, true),
    username: username || usernames[0] || "",
    usernames,
    date: readString(record?.date) || filters.date,
    status: normalizeCollectionDailyStatus(record?.status),
    message: readString(record?.message) || "No day-details summary is available yet.",
    amount: readAmount(record?.amount),
    dailyTarget: readAmount(record?.dailyTarget),
    customers: Array.isArray(record?.customers)
      ? record.customers.map((entry, index) => {
          const customerRecord = asRecord(entry);
          return {
            id: readString(customerRecord?.id) || `customer-${index + 1}`,
            customerName: readString(customerRecord?.customerName) || "-",
            accountNumber: readString(customerRecord?.accountNumber) || "-",
            amount: readAmount(customerRecord?.amount),
            collectionStaffNickname: readString(customerRecord?.collectionStaffNickname) || "-",
          };
        })
      : [],
    summary: {
      monthlyTarget: readAmount(summaryRecord?.monthlyTarget),
      collected: readAmount(summaryRecord?.collected),
      balanced: readAmount(summaryRecord?.balanced),
      totalForDate: readAmount(summaryRecord?.totalForDate),
      targetForDate: readAmount(summaryRecord?.targetForDate),
    },
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages,
      hasNextPage: readBoolean(paginationRecord?.hasNextPage, page < totalPages),
      hasPreviousPage: readBoolean(paginationRecord?.hasPreviousPage, page > 1),
    },
    records: Array.isArray(record?.records)
      ? record.records.map((entry, index) => {
          const entryRecord = asRecord(entry);
          const accountNumber = readString(entryRecord?.accountNumber) || "-";
          return {
            id: readString(entryRecord?.id) || `record-${index + 1}`,
            customerName: readString(entryRecord?.customerName) || "-",
            accountNumber,
            paymentDate: readString(entryRecord?.paymentDate) || filters.date,
            amount: readAmount(entryRecord?.amount),
            batch: readString(entryRecord?.batch) || "-",
            paymentReference: readString(entryRecord?.paymentReference) || accountNumber,
            username: readString(entryRecord?.username) || "",
            collectionStaffNickname: readString(entryRecord?.collectionStaffNickname) || "-",
            createdAt: readString(entryRecord?.createdAt) || "",
            receiptFile: readNullableString(entryRecord?.receiptFile),
            receipts: Array.isArray(entryRecord?.receipts)
              ? entryRecord.receipts.map((receiptEntry, receiptIndex) => {
                  const receiptRecord = asRecord(receiptEntry);
                  return {
                    id: readString(receiptRecord?.id) || `receipt-${index + 1}-${receiptIndex + 1}`,
                    storagePath: readString(receiptRecord?.storagePath),
                    originalFileName: readString(receiptRecord?.originalFileName) || "Receipt",
                    originalMimeType: readString(receiptRecord?.originalMimeType) || "application/octet-stream",
                    fileSize: readPositiveInteger(receiptRecord?.fileSize),
                    createdAt: readString(receiptRecord?.createdAt) || "",
                  };
                })
              : [],
          };
        })
      : [],
    ...(freshness ? { freshness } : {}),
  };
}

export async function getCollectionDailyUsers(options?: CollectionDailyRequestOptions) {
  const response = await apiRequest(
    "GET",
    "/api/collection/daily/users",
    undefined,
    options,
  );
  const payload = await response.json();
  const record = asRecord(payload);
  return {
    ok: readBoolean(record?.ok, true),
    users: Array.isArray(record?.users)
      ? record.users
          .map((entry, index) => normalizeCollectionDailyUser(entry, index))
          .filter((entry): entry is CollectionDailyUser => Boolean(entry))
      : [],
  };
}

export async function setCollectionDailyTarget(payload: {
  username: string;
  year: number;
  month: number;
  monthlyTarget: CollectionAmountMyrNumber;
}) {
  const response = await apiRequest("PUT", "/api/collection/daily/target", payload);
  return parseApiJson(
    response,
    collectionDailyTargetResponseSchema,
    "/api/collection/daily/target",
  );
}

export async function setCollectionDailyCalendar(payload: {
  username: string;
  year: number;
  month: number;
  days: Array<{
    day: number;
    status?: CollectionDailyCalendarStatus;
    leaveType?: CollectionDailyLeaveType | null;
    note?: string | null;
    isWorkingDay: boolean;
    isHoliday: boolean;
    holidayName?: string | null;
  }>;
}) {
  const response = await apiRequest("PUT", "/api/collection/daily/calendar", payload);
  return parseApiJson(
    response,
    collectionDailyCalendarMutationResponseSchema,
    "/api/collection/daily/calendar",
  );
}

export async function deleteCollectionDailyCalendarStatus(payload: {
  username: string;
  year: number;
  month: number;
  day: number;
}) {
  const params = new URLSearchParams();
  params.set("username", payload.username);
  params.set("year", String(payload.year));
  params.set("month", String(payload.month));
  params.set("day", String(payload.day));
  const response = await apiRequest(
    "DELETE",
    `/api/collection/daily/calendar?${params.toString()}`,
  );
  return parseApiJson(
    response,
    collectionDailyCalendarDeleteResponseSchema,
    "/api/collection/daily/calendar",
  );
}

export async function getCollectionDailyCalendarAudit(filters: {
  username: string;
  year: number;
  month: number;
  day: number;
  limit?: number | undefined;
}, options?: CollectionDailyRequestOptions) {
  const params = new URLSearchParams();
  params.set("username", filters.username);
  params.set("year", String(filters.year));
  params.set("month", String(filters.month));
  params.set("day", String(filters.day));
  if (typeof filters.limit === "number" && Number.isFinite(filters.limit)) {
    params.set("limit", String(Math.trunc(filters.limit)));
  }
  const response = await apiRequest(
    "GET",
    `/api/collection/daily/calendar/audit?${params.toString()}`,
    undefined,
    options,
  );
  return normalizeCollectionDailyCalendarAuditResponse(await response.json(), filters);
}

export async function getCollectionDailyOverview(filters: {
  year: number;
  month: number;
  username?: string | undefined;
  usernames?: string[] | undefined;
}, options?: CollectionDailyRequestOptions) {
  const params = new URLSearchParams();
  params.set("year", String(filters.year));
  params.set("month", String(filters.month));
  if (Array.isArray(filters.usernames) && filters.usernames.length > 0) {
    params.set(
      "usernames",
      filters.usernames.map((value) => String(value || "").trim()).filter(Boolean).join(","),
    );
  }
  if (filters.username) {
    params.set("username", filters.username);
  }
  const response = await apiRequest(
    "GET",
    `/api/collection/daily/overview?${params.toString()}`,
    undefined,
    options,
  );
  return normalizeCollectionDailyOverviewResponse(await response.json(), filters);
}

export async function getCollectionDailyDayDetails(filters: {
  date: string;
  username?: string | undefined;
  usernames?: string[] | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}, options?: CollectionDailyRequestOptions) {
  const params = new URLSearchParams();
  params.set("date", filters.date);
  if (Array.isArray(filters.usernames) && filters.usernames.length > 0) {
    params.set(
      "usernames",
      filters.usernames.map((value) => String(value || "").trim()).filter(Boolean).join(","),
    );
  }
  if (filters.username) {
    params.set("username", filters.username);
  }
  if (typeof filters.page === "number" && Number.isFinite(filters.page)) {
    params.set("page", String(filters.page));
  }
  if (typeof filters.pageSize === "number" && Number.isFinite(filters.pageSize)) {
    params.set("pageSize", String(filters.pageSize));
  }
  const response = await apiRequest(
    "GET",
    `/api/collection/daily/day-details?${params.toString()}`,
    undefined,
    options,
  );
  return normalizeCollectionDailyDayDetailsResponse(await response.json(), filters);
}
