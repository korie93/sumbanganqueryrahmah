import type {
  CollectionDailyPaidCustomer,
  CollectionDailyTarget,
  CollectionDailyUser,
} from "../storage-postgres";
import {
  getCollectionDailyTarget,
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
  year: number;
  month: number;
}) {
  return listCollectionDailyCalendar(params);
}

export async function upsertCollectionDailyCalendarDaysRepository(params: {
  year: number;
  month: number;
  actor: string;
  days: Array<{
    day: number;
    isWorkingDay: boolean;
    isHoliday: boolean;
    holidayName?: string | null;
  }>;
}) {
  return upsertCollectionDailyCalendarDays(params);
}

export async function listCollectionDailyPaidCustomersRepository(params: {
  username: string;
  date: string;
}): Promise<CollectionDailyPaidCustomer[]> {
  return listCollectionDailyPaidCustomers(params);
}
