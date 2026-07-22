import { ERROR_CODES } from "../../shared/error-codes";
import { badRequest } from "../http/errors";
import {
  readInteger,
  readNonEmptyString,
  readOptionalString,
  readPageLimit,
} from "../http/validation";
import type { AnalyticsRepository } from "../repositories/analytics.repository";
import type {
  RecentLoginActivityFilter,
  RecentLoginActivityPageOptions,
  RecentLoginActivitySortBy,
  RecentLoginActivitySortOrder,
} from "../repositories/analytics-repository-shared";

type OperationsAnalyticsRepository = Pick<
  AnalyticsRepository,
  | "getDashboardSummary"
  | "getLoginTrends"
  | "getPeakHours"
  | "getRecentLoginActivity"
  | "getRecentLoginActivityPage"
  | "getRoleDistribution"
  | "getTopActiveUsers"
>;

export class OperationsAnalyticsService {
  constructor(private readonly analyticsRepository: OperationsAnalyticsRepository) {}

  async getDashboardSummary() {
    return this.analyticsRepository.getDashboardSummary();
  }

  async getLoginTrends(days?: unknown) {
    return this.analyticsRepository.getLoginTrends(Math.max(1, readInteger(days, 7)));
  }

  async getTopActiveUsers(limit?: unknown) {
    return this.analyticsRepository.getTopActiveUsers(readPageLimit(limit, 10, 100));
  }

  async getRecentLoginActivity(limit?: unknown) {
    return this.analyticsRepository.getRecentLoginActivity(readPageLimit(limit, 8, 25));
  }

  async getRecentLoginActivityPage(
    query: Record<string, unknown>,
    viewerRole?: string | null,
  ) {
    return this.analyticsRepository.getRecentLoginActivityPage(
      this.normalizeRecentLoginActivityPageQuery(query, viewerRole),
    );
  }

  async getPeakHours() {
    return this.analyticsRepository.getPeakHours();
  }

  async getRoleDistribution() {
    return this.analyticsRepository.getRoleDistribution();
  }

  private normalizeRecentLoginActivityPageQuery(
    query: Record<string, unknown>,
    viewerRole?: string | null,
  ): RecentLoginActivityPageOptions {
    const statusValue = readNonEmptyString(query.status, 20).toLowerCase() || "all";
    const allowedStatuses = new Set<RecentLoginActivityFilter>([
      "all",
      "active",
      "ended",
      "failed",
      "attention",
    ]);
    if (!allowedStatuses.has(statusValue as RecentLoginActivityFilter)) {
      throw badRequest(
        "Login activity status must be one of: all, active, ended, failed, attention.",
        ERROR_CODES.REQUEST_BODY_INVALID,
      );
    }

    const dateFrom = this.readOptionalDateFilter(query.dateFrom, "dateFrom");
    const dateTo = this.readOptionalDateFilter(query.dateTo, "dateTo");
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw badRequest(
        "Login activity dateFrom must be before or equal to dateTo.",
        ERROR_CODES.REQUEST_BODY_INVALID,
      );
    }

    const roleValue = readOptionalString(query.role, 24)?.toLowerCase();
    const allowedRoles = new Set(["admin", "manager", "superuser", "unknown", "user"]);
    if (roleValue && !allowedRoles.has(roleValue)) {
      throw badRequest(
        "Login activity role filter is invalid.",
        ERROR_CODES.REQUEST_BODY_INVALID,
      );
    }

    const sortByValue = readNonEmptyString(query.sortBy, 20) || "eventTime";
    const allowedSortFields = new Set<RecentLoginActivitySortBy>([
      "eventTime",
      "role",
      "status",
      "username",
    ]);
    if (!allowedSortFields.has(sortByValue as RecentLoginActivitySortBy)) {
      throw badRequest(
        "Login activity sortBy must be one of: eventTime, role, status, username.",
        ERROR_CODES.REQUEST_BODY_INVALID,
      );
    }

    const sortOrderValue = readNonEmptyString(query.sortOrder, 16).toLowerCase() || "desc";
    if (sortOrderValue !== "asc" && sortOrderValue !== "desc") {
      throw badRequest(
        "Login activity sortOrder must be asc or desc.",
        ERROR_CODES.REQUEST_BODY_INVALID,
      );
    }

    return {
      page: readPageLimit(query.page, 1, 100_000),
      pageSize: readPageLimit(query.pageSize ?? query.limit, 4, 25),
      includeExactIpAddress: viewerRole === "admin" || viewerRole === "superuser",
      includeInternalReason: viewerRole === "superuser",
      ...(roleValue ? { role: roleValue } : {}),
      search: readOptionalString(query.search, 80),
      sortBy: sortByValue as RecentLoginActivitySortBy,
      sortOrder: sortOrderValue as RecentLoginActivitySortOrder,
      status: statusValue as RecentLoginActivityFilter,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    };
  }

  private readOptionalDateFilter(value: unknown, field: string): string | undefined {
    const normalized = readNonEmptyString(value, 10);
    if (!normalized) {
      return undefined;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw badRequest(
        `Login activity ${field} must use YYYY-MM-DD format.`,
        ERROR_CODES.REQUEST_BODY_INVALID,
      );
    }
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== normalized
    ) {
      throw badRequest(
        `Login activity ${field} must be a valid calendar date.`,
        ERROR_CODES.REQUEST_BODY_INVALID,
      );
    }
    return normalized;
  }
}
