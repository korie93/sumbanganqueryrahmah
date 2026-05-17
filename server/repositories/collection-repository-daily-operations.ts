import type {
  CollectionDailyPaidCustomer,
  CollectionDailyTarget,
  CollectionDailyUser,
  CollectionDailyCalendarAuditEntry,
} from "../storage-postgres";
import type {
  CollectionDailyCalendarStatus,
  CollectionDailyLeaveType,
} from "../../shared/collection-daily-status";
import {
  deleteCollectionDailyCalendarDay,
  getCollectionDailyTarget,
  listCollectionDailyCalendarAudit,
  listCollectionDailyCalendar,
  listCollectionDailyPaidCustomers,
  listCollectionDailyUsers,
  upsertCollectionDailyCalendarDays,
  upsertCollectionDailyTarget,
} from "./collection-daily-repository-utils";

export async function listCollectionDailyUsersRepository(): Promise<CollectionDailyUser[]> {
  return listCollectionDailyUsers();
}

export async function getCollectionDailyTargetRepository(params: {
  username: string;
  year: number;
  month: number;
}): Promise<CollectionDailyTarget | undefined> {
  return getCollectionDailyTarget(params);
}

export async function upsertCollectionDailyTargetRepository(params: {
  username: string;
  year: number;
  month: number;
  monthlyTarget: number;
  actor: string;
}): Promise<CollectionDailyTarget> {
  return upsertCollectionDailyTarget(params);
}

export async function listCollectionDailyCalendarRepository(params: {
  username: string;
  year: number;
  month: number;
}) {
  return listCollectionDailyCalendar(params);
}

export async function upsertCollectionDailyCalendarDaysRepository(params: {
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
}) {
  return upsertCollectionDailyCalendarDays(params);
}

export async function deleteCollectionDailyCalendarDayRepository(params: {
  username: string;
  year: number;
  month: number;
  day: number;
  actor?: string | undefined;
}): Promise<boolean> {
  return deleteCollectionDailyCalendarDay(params);
}

export async function listCollectionDailyCalendarAuditRepository(params: {
  username: string;
  year: number;
  month: number;
  day: number;
  limit?: number | undefined;
}): Promise<CollectionDailyCalendarAuditEntry[]> {
  return listCollectionDailyCalendarAudit(params);
}

export async function listCollectionDailyPaidCustomersRepository(params: {
  username: string;
  date: string;
}): Promise<CollectionDailyPaidCustomer[]> {
  return listCollectionDailyPaidCustomers(params);
}
