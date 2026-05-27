import { readInteger, readPageLimit } from "../http/validation";
import type { AnalyticsRepository } from "../repositories/analytics.repository";

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
    return this.analyticsRepository.getTopActiveUsers(readPageLimit(limit, 10, 100));
  }

  async getPeakHours() {
    return this.analyticsRepository.getPeakHours();
  }

  async getRoleDistribution() {
    return this.analyticsRepository.getRoleDistribution();
  }
}
