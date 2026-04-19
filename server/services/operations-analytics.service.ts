import { readBoundedPageSize, readInteger } from "../http/validation";
import type { AnalyticsRepository } from "../repositories/analytics.repository";

const TOP_ACTIVE_USERS_MAX_LIMIT = 100;

type OperationsAnalyticsRepository = Pick<
  AnalyticsRepository,
  | "getDashboardSummary"
  | "getLoginTrends"
  | "getPeakHours"
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
    return this.analyticsRepository.getTopActiveUsers(
      readBoundedPageSize(limit, 10, TOP_ACTIVE_USERS_MAX_LIMIT),
    );
  }

  async getPeakHours() {
    return this.analyticsRepository.getPeakHours();
  }

  async getRoleDistribution() {
    return this.analyticsRepository.getRoleDistribution();
  }
}
