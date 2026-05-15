import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import type { CollectionAmountMyrNumber } from "../../shared/collection-amount-types";
import {
  isCollectionDailyCalendarStatus,
  isCollectionDailyLeaveType,
  type CollectionDailyCalendarStatus,
  type CollectionDailyLeaveType,
} from "../../shared/collection-daily-status";
import { db } from "../db-postgres";
import type {
  CollectionDailyCalendarDay,
  CollectionDailyPaidCustomer,
  CollectionDailyTarget,
  CollectionDailyUser,
} from "../storage-postgres";
import {
  mapCollectionDailyCalendarRow,
  mapCollectionDailyTargetRow,
} from "./collection-repository-mappers";
import { buildProtectedCollectionPiiSelect } from "./collection-pii-select-utils";
import {
  mapCollectionDailyPaidCustomerRow,
  mapCollectionDailyUserRow,
  readCollectionDailyRows,
} from "./collection-daily-repository-row-utils";
import type {
  CollectionDailyExecutor,
  CollectionDailyPaidCustomerRow,
  CollectionDailyUserRow,
} from "./collection-daily-repository-types";

export async function listCollectionDailyUsers(): Promise<CollectionDailyUser[]> {
  const result = await db.execute(sql`
    SELECT id, username, role
    FROM public.users
    WHERE role IN ('user', 'admin', 'superuser')
      AND COALESCE(is_banned, false) = false
      AND COALESCE(status, 'active') <> 'disabled'
    ORDER BY lower(username) ASC
    LIMIT 5000
  `);
  return readCollectionDailyRows<CollectionDailyUserRow>(result).map((row) =>
    mapCollectionDailyUserRow(row),
  );
}

export async function getCollectionDailyTarget(params: {
  username: string;
  year: number;
  month: number;
}): Promise<CollectionDailyTarget | undefined> {
  const result = await db.execute(sql`
    SELECT
      id,
      username,
      year,
      month,
      monthly_target,
      created_by,
      updated_by,
      created_at,
      updated_at
    FROM public.collection_daily_targets
    WHERE lower(username) = lower(${params.username})
      AND year = ${params.year}
      AND month = ${params.month}
    LIMIT 1
  `);
  const row = result.rows?.[0];
  return row ? mapCollectionDailyTargetRow(row) : undefined;
}

export async function upsertCollectionDailyTarget(params: {
  username: string;
  year: number;
  month: number;
  monthlyTarget: CollectionAmountMyrNumber;
  actor: string;
}): Promise<CollectionDailyTarget> {
  const result = await db.execute(sql`
    INSERT INTO public.collection_daily_targets (
      id,
      username,
      year,
      month,
      monthly_target,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    VALUES (
      ${randomUUID()}::uuid,
      lower(${params.username}),
      ${params.year},
      ${params.month},
      ${params.monthlyTarget},
      ${params.actor},
      ${params.actor},
      now(),
      now()
    )
    ON CONFLICT ((lower(username)), year, month)
    DO UPDATE SET
      monthly_target = EXCLUDED.monthly_target,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING
      id,
      username,
      year,
      month,
      monthly_target,
      created_by,
      updated_by,
      created_at,
      updated_at
  `);
  const row = result.rows?.[0];
  if (!row) {
    throw new Error("Failed to upsert collection daily target.");
  }
  return mapCollectionDailyTargetRow(row);
}

export async function listCollectionDailyCalendar(params: {
  username: string;
  year: number;
  month: number;
}, executor: CollectionDailyExecutor = db): Promise<CollectionDailyCalendarDay[]> {
  const result = await executor.execute(sql`
    SELECT
      id,
      username,
      calendar_date,
      year,
      month,
      day,
      status,
      leave_type,
      note,
      is_working_day,
      is_holiday,
      holiday_name,
      created_by,
      updated_by,
      created_at,
      updated_at
    FROM public.collection_daily_calendar
    WHERE lower(username) = lower(${params.username})
      AND year = ${params.year}
      AND month = ${params.month}
    ORDER BY day ASC
  `);
  return readCollectionDailyRows(result).map((row) => mapCollectionDailyCalendarRow(row));
}

function buildCalendarDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function resolveCalendarDayStatus(day: {
  status?: CollectionDailyCalendarStatus | undefined;
  isWorkingDay: boolean;
  isHoliday: boolean;
}) {
  if (isCollectionDailyCalendarStatus(day.status)) {
    return day.status;
  }
  return day.isHoliday || !day.isWorkingDay ? "HOLIDAY" : "WORKING";
}

function resolveCalendarDayLeaveType(
  status: CollectionDailyCalendarStatus,
  leaveType: CollectionDailyLeaveType | null | undefined,
) {
  if (status !== "HOLIDAY") {
    return null;
  }
  return isCollectionDailyLeaveType(leaveType) ? leaveType : null;
}

export async function upsertCollectionDailyCalendarDays(params: {
  username: string;
  year: number;
  month: number;
  actor: string;
  days: Array<{
    day: number;
    status?: CollectionDailyCalendarStatus | undefined;
    leaveType?: CollectionDailyLeaveType | null | undefined;
    note?: string | null | undefined;
    isWorkingDay: boolean;
    isHoliday: boolean;
    holidayName?: string | null;
  }>;
}, executor: CollectionDailyExecutor = db): Promise<CollectionDailyCalendarDay[]> {
  if (!params.days.length) {
    return [];
  }

  const valuesSql = sql.join(
    params.days.map((day) => {
      const status = resolveCalendarDayStatus(day);
      const leaveType = resolveCalendarDayLeaveType(status, day.leaveType);
      const note = status === "HOLIDAY" ? (day.note ?? day.holidayName ?? null) : null;
      const isHoliday = status === "HOLIDAY";
      const holidayName = isHoliday ? (leaveType ?? note) : null;
      return sql`(
        ${randomUUID()}::uuid,
        lower(${params.username}),
        ${buildCalendarDateKey(params.year, params.month, day.day)}::date,
        ${params.year},
        ${params.month},
        ${day.day},
        ${status},
        ${leaveType},
        ${note},
        ${!isHoliday},
        ${isHoliday},
        ${holidayName},
        ${params.actor},
        ${params.actor},
        now(),
        now()
      )`;
    }),
    sql`, `,
  );

  await executor.execute(sql`
    INSERT INTO public.collection_daily_calendar (
      id,
      username,
      calendar_date,
      year,
      month,
      day,
      status,
      leave_type,
      note,
      is_working_day,
      is_holiday,
      holiday_name,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    VALUES ${valuesSql}
    ON CONFLICT ((lower(username)), calendar_date)
    DO UPDATE SET
      status = EXCLUDED.status,
      leave_type = EXCLUDED.leave_type,
      note = EXCLUDED.note,
      is_working_day = EXCLUDED.is_working_day,
      is_holiday = EXCLUDED.is_holiday,
      holiday_name = EXCLUDED.holiday_name,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  `);

  return listCollectionDailyCalendar({
    username: params.username,
    year: params.year,
    month: params.month,
  }, executor);
}

export async function deleteCollectionDailyCalendarDay(params: {
  username: string;
  year: number;
  month: number;
  day: number;
}, executor: CollectionDailyExecutor = db): Promise<boolean> {
  const result = await executor.execute(sql`
    DELETE FROM public.collection_daily_calendar
    WHERE lower(username) = lower(${params.username})
      AND calendar_date = ${buildCalendarDateKey(params.year, params.month, params.day)}::date
    RETURNING id
  `);
  return (result.rows?.length ?? 0) > 0;
}

export async function listCollectionDailyPaidCustomers(params: {
  username: string;
  date: string;
}, executor: CollectionDailyExecutor = db): Promise<CollectionDailyPaidCustomer[]> {
  const result = await executor.execute(sql`
    SELECT
      id,
      ${buildProtectedCollectionPiiSelect("customer_name", "customer_name_encrypted", "customer_name", "customerName")},
      customer_name_encrypted,
      ${buildProtectedCollectionPiiSelect("account_number", "account_number_encrypted", "account_number", "accountNumber")},
      account_number_encrypted,
      amount,
      collection_staff_nickname
    FROM public.collection_records
    WHERE lower(created_by_login) = lower(${params.username})
      AND payment_date = ${params.date}::date
    ORDER BY created_at ASC, id ASC
  `);
  return readCollectionDailyRows<CollectionDailyPaidCustomerRow>(result).map((row) =>
    mapCollectionDailyPaidCustomerRow(row),
  );
}
