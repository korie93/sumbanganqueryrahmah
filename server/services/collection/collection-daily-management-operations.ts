import { badRequest, forbidden } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import { parseCollectionAmountMyrInput } from "../../../shared/collection-amount-types";
import {
  isCollectionDailyCalendarStatus,
  isCollectionDailyLeaveType,
  type CollectionDailyCalendarStatus,
  type CollectionDailyLeaveType,
} from "../../../shared/collection-daily-status";
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
    if (user.role !== "superuser") {
      throw forbidden("Update daily calendar hanya untuk superuser.");
    }

    const body = ensureLooseObject(bodyRaw) || {};
    const username = normalizeCollectionText(body.nickname ?? body.username);
    const normalizedUsername = username.toLowerCase();
    const year = Number.parseInt(normalizeCollectionText(body.year), 10);
    const month = Number.parseInt(normalizeCollectionText(body.month), 10);
    const rawDays = Array.isArray(body.days) ? body.days : [];

    if (!normalizedUsername) throw badRequest("Staff nickname is required.");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Invalid year.");
    if (!Number.isInteger(month) || month < 1 || month > 12) throw badRequest("Invalid month.");

    const users = await this.dailyOverviewService.listAvailableDailyUsers(user);
    const foundUser = users.some((item) => item.username.toLowerCase() === normalizedUsername);
    if (!foundUser) {
      throw badRequest("Staff nickname not found.");
    }

    const maxDay = new Date(year, month, 0).getDate();
    const parsedDays = rawDays
      .map((item) => ensureLooseObject(item) || {})
      .map((item) => {
        const statusRaw = normalizeCollectionText(item.status).toUpperCase();
        const legacyHoliday = item.isHoliday === true || item.isWorkingDay === false;
        const status: CollectionDailyCalendarStatus = isCollectionDailyCalendarStatus(statusRaw)
          ? statusRaw
          : legacyHoliday
            ? "HOLIDAY"
            : "WORKING";
        const leaveTypeRaw = normalizeCollectionText(item.leaveType).toUpperCase();
        const leaveType: CollectionDailyLeaveType | null =
          status === "HOLIDAY" && isCollectionDailyLeaveType(leaveTypeRaw) ? leaveTypeRaw : null;
        const note = normalizeCollectionText(item.note) || null;

        return {
          day: Number.parseInt(normalizeCollectionText(item.day), 10),
          status,
          leaveType,
          note: status === "HOLIDAY" ? note : null,
          isWorkingDay: status === "WORKING",
          isHoliday: status === "HOLIDAY",
          holidayName: status === "HOLIDAY" ? (leaveType ?? note) : null,
        };
      })
      .filter((item) => Number.isInteger(item.day) && item.day >= 1 && item.day <= maxDay);

    if (parsedDays.length === 0) {
      throw badRequest("At least one valid calendar day is required.");
    }

    const missingLeaveTypeDay = parsedDays.find((item) =>
      item.status === "HOLIDAY" && !item.leaveType
    );
    if (missingLeaveTypeDay) {
      throw badRequest(
        `Leave type is required when status is Holiday/Leave for day ${missingLeaveTypeDay.day}.`,
      );
    }

    const uniqueByDay = new Map<number, (typeof parsedDays)[number]>();
    for (const day of parsedDays) {
      uniqueByDay.set(day.day, day);
    }

    const calendar = await this.storage.upsertCollectionDailyCalendarDays({
      username: normalizedUsername,
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

  async deleteDailyCalendar(userInput: AuthenticatedUser | undefined, inputRaw: unknown) {
    const user = this.requireUser(userInput);
    if (user.role !== "superuser") {
      throw forbidden("Delete daily calendar status hanya untuk superuser.");
    }

    const input = ensureLooseObject(inputRaw) || {};
    const username = normalizeCollectionText(input.nickname ?? input.username);
    const normalizedUsername = username.toLowerCase();
    const year = Number.parseInt(normalizeCollectionText(input.year), 10);
    const month = Number.parseInt(normalizeCollectionText(input.month), 10);
    const day = Number.parseInt(normalizeCollectionText(input.day), 10);

    if (!normalizedUsername) throw badRequest("Staff nickname is required.");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Invalid year.");
    if (!Number.isInteger(month) || month < 1 || month > 12) throw badRequest("Invalid month.");
    const maxDay = new Date(year, month, 0).getDate();
    if (!Number.isInteger(day) || day < 1 || day > maxDay) throw badRequest("Invalid day.");

    const users = await this.dailyOverviewService.listAvailableDailyUsers(user);
    const foundUser = users.some((item) => item.username.toLowerCase() === normalizedUsername);
    if (!foundUser) {
      throw badRequest("Staff nickname not found.");
    }

    const deleted = await this.storage.deleteCollectionDailyCalendarDay({
      username: normalizedUsername,
      year,
      month,
      day,
    });

    return {
      ok: true as const,
      deleted,
    };
  }
}
