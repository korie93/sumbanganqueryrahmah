import type {
  InsertUserActivity,
  User,
  UserActivity,
} from "../../../shared/schema-postgres";
import { PostgresImportsSearchStorage } from "./postgres-imports-search-storage";

export class PostgresActivityStorage extends PostgresImportsSearchStorage {
  async createActivity(data: InsertUserActivity): Promise<UserActivity> {
    return this.activityRepository.createActivity(data);
  }

  async touchActivity(activityId: string): Promise<void> {
    return this.activityRepository.touchActivity(activityId);
  }

  async getActiveActivitiesByUsername(username: string): Promise<UserActivity[]> {
    return this.activityRepository.getActiveActivitiesByUsername(username);
  }

  async updateActivity(id: string, data: Partial<UserActivity>): Promise<UserActivity | undefined> {
    return this.activityRepository.updateActivity(id, data);
  }

  async getActivityById(id: string): Promise<UserActivity | undefined> {
    return this.activityRepository.getActivityById(id);
  }

  async getActiveActivities(): Promise<UserActivity[]> {
    return this.activityRepository.getActiveActivities();
  }

  async getAllActivities(): Promise<(UserActivity & { status: string })[]> {
    return this.activityRepository.getAllActivities();
  }

  async deleteActivity(id: string): Promise<boolean> {
    return this.activityRepository.deleteActivity(id);
  }

  async getFilteredActivities(filters: {
    status?: string[];
    username?: string;
    ipAddress?: string;
    browser?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<UserActivity[]> {
    return this.activityRepository.getFilteredActivities(filters);
  }

  async deactivateUserActivities(username: string, reason?: string): Promise<void> {
    return this.activityRepository.deactivateUserActivities(username, reason);
  }

  async deactivateUserSessionsByFingerprint(username: string, fingerprint: string): Promise<void> {
    return this.activityRepository.deactivateUserSessionsByFingerprint(username, fingerprint);
  }

  async getBannedUsers(): Promise<
    Array<User & { banInfo?: { ipAddress: string | null; browser: string | null; bannedAt: Date | null } }>
  > {
    return this.activityRepository.getBannedUsers();
  }

  async isVisitorBanned(
    fingerprint?: string | null,
    ipAddress?: string | null,
    username?: string | null,
  ): Promise<boolean> {
    return this.activityRepository.isVisitorBanned(fingerprint, ipAddress, username);
  }

  async banVisitor(params: {
    username: string;
    role: string;
    activityId: string;
    fingerprint?: string | null;
    ipAddress?: string | null;
    browser?: string | null;
    pcName?: string | null;
  }): Promise<void> {
    return this.activityRepository.banVisitor(params);
  }

  async unbanVisitor(banId: string): Promise<void> {
    return this.activityRepository.unbanVisitor(banId);
  }

  async getBannedSessions(): Promise<
    Array<{
      banId: string;
      username: string;
      role: string;
      fingerprint: string | null;
      ipAddress: string | null;
      browser: string | null;
      bannedAt: Date | null;
    }>
  > {
    return this.activityRepository.getBannedSessions();
  }
}
