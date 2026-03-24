import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
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
  return (result.rows || []).map((row: any) => ({
    id: String(row.id),
    username: String(row.username || "").toLowerCase(),
    role: String(row.role || "user"),
  }));
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
  monthlyTarget: number;
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
  year: number;
  month: number;
}): Promise<CollectionDailyCalendarDay[]> {
  const result = await db.execute(sql`
    SELECT
      id,
      year,
      month,
      day,
      is_working_day,
      is_holiday,
      holiday_name,
      created_by,
      updated_by,
      created_at,
      updated_at
    FROM public.collection_daily_calendar
    WHERE year = ${params.year}
      AND month = ${params.month}
    ORDER BY day ASC
  `);
  return (result.rows || []).map((row: any) => mapCollectionDailyCalendarRow(row));
}

export async function upsertCollectionDailyCalendarDays(params: {
  year: number;
  month: number;
  actor: string;
  days: Array<{
    day: number;
    isWorkingDay: boolean;
    isHoliday: boolean;
    holidayName?: string | null;
  }>;
}): Promise<CollectionDailyCalendarDay[]> {
  if (!params.days.length) {
    return [];
  }

  for (const day of params.days) {
    await db.execute(sql`
      INSERT INTO public.collection_daily_calendar (
        id,
        year,
        month,
        day,
        is_working_day,
        is_holiday,
        holiday_name,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${params.year},
        ${params.month},
        ${day.day},
        ${day.isWorkingDay},
        ${day.isHoliday},
        ${day.holidayName ?? null},
        ${params.actor},
        ${params.actor},
        now(),
        now()
      )
      ON CONFLICT (year, month, day)
      DO UPDATE SET
        is_working_day = EXCLUDED.is_working_day,
        is_holiday = EXCLUDED.is_holiday,
        holiday_name = EXCLUDED.holiday_name,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
    `);
  }

  return listCollectionDailyCalendar({
    year: params.year,
    month: params.month,
  });
}

export async function listCollectionDailyPaidCustomers(params: {
  username: string;
  date: string;
}): Promise<CollectionDailyPaidCustomer[]> {
  const result = await db.execute(sql`
    SELECT
      id,
      customer_name,
      account_number,
      amount,
      collection_staff_nickname
    FROM public.collection_records
    WHERE lower(created_by_login) = lower(${params.username})
      AND payment_date = ${params.date}::date
    ORDER BY created_at ASC, id ASC
  `);
  return (result.rows || []).map((row: any) => ({
    id: String(row.id),
    customerName: String(row.customer_name || ""),
    accountNumber: String(row.account_number || ""),
    amount: Number(row.amount || 0),
    collectionStaffNickname: String(row.collection_staff_nickname || ""),
  }));
}
