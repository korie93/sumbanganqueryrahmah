import { badRequest, forbidden } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import { parseCollectionAmountMyrInput } from "../../../shared/collection-amount-types";
import {
  ensureLooseObject,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import { CollectionDailyOverviewService } from "./collection-daily-overview.service";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

export class CollectionDailyManagementOperations {
  private readonly dailyOverviewService: CollectionDailyOverviewService;

  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {
    this.dailyOverviewService = new CollectionDailyOverviewService(this.storage);
  }

  async listDailyUsers(userInput: AuthenticatedUser | undefined) {
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

  async upsertDailyTarget(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    if (user.role !== "admin" && user.role !== "superuser") {
      throw forbidden("Set target harian hanya untuk admin atau superuser.");
    }

    const body = ensureLooseObject(bodyRaw) || {};
    const username = normalizeCollectionText(body.nickname ?? body.username);
    const normalizedUsername = username.toLowerCase();
    const year = Number.parseInt(normalizeCollectionText(body.year), 10);
    const month = Number.parseInt(normalizeCollectionText(body.month), 10);
    const monthlyTarget = parseCollectionAmountMyrInput(body.monthlyTarget, { allowZero: true });

    if (!normalizedUsername) throw badRequest("Staff nickname is required.");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Invalid year.");
    if (!Number.isInteger(month) || month < 1 || month > 12) throw badRequest("Invalid month.");
    if (monthlyTarget === null || monthlyTarget < 0) {
      throw badRequest("Monthly target must be a non-negative number.");
    }

    const users = await this.dailyOverviewService.listAvailableDailyUsers(user);
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

  async upsertDailyCalendar(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
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
}
