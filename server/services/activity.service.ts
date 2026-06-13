import { WebSocket } from "ws";
import { createActivityModerationOperations } from "./activity-moderation-operations";
import { createActivitySessionOperations } from "./activity-session-operations";
import type {
  ActivityClientRegistry,
  ActivityFilters,
  ActivityPageOptions,
  ActivityResponseAccess,
  ActivityRetentionCleanupSource,
  ActivityStorage,
  BanAccountResult,
  BanActivityResult,
  KickActivityResult,
} from "./activity-service-types";

export class ActivityService {
  private readonly sessionOperations;
  private readonly moderationOperations;

  constructor(
    private readonly storage: ActivityStorage,
    private readonly connectedClients: ActivityClientRegistry,
  ) {
    this.sessionOperations = createActivitySessionOperations(
      this.storage,
      this.closeSocket.bind(this),
    );
    this.moderationOperations = createActivityModerationOperations(
      this.storage,
      this.closeSocket.bind(this),
    );
  }

  private async closeSocket(activityId: string, payload?: Record<string, unknown>) {
    const socket = this.connectedClients.get(activityId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (payload) {
        socket.send(JSON.stringify(payload));
      }
      socket.close();
    }
    this.connectedClients.delete(activityId);
    await this.storage.clearCollectionNicknameSessionByActivity(activityId);
  }

  async logout(activityId: string, username: string) {
    return this.sessionOperations.logout(activityId, username);
  }

  async getAllActivities(
    currentActivityId?: string,
    access?: ActivityResponseAccess,
  ) {
    return this.sessionOperations.getAllActivities(currentActivityId, access);
  }

  async getActivityInvestigation(activityId: string) {
    return this.sessionOperations.getActivityInvestigation(activityId);
  }

  async getFilteredActivities(
    filters: ActivityFilters,
    currentActivityId?: string,
    access?: ActivityResponseAccess,
  ) {
    return this.sessionOperations.getFilteredActivities(filters, currentActivityId, access);
  }

  async listActivityPage(
    options: ActivityPageOptions,
    filters: ActivityFilters,
    currentActivityId?: string,
    access?: ActivityResponseAccess,
  ) {
    return this.sessionOperations.listActivityPage(options, filters, currentActivityId, access);
  }

  async deleteActivityLog(activityId: string) {
    return this.sessionOperations.deleteActivityLog(activityId);
  }

  async bulkDeleteActivityLogs(activityIds: string[], performedBy: string) {
    return this.sessionOperations.bulkDeleteActivityLogs(activityIds, performedBy);
  }

  async getActivityRetentionStatus(now?: Date) {
    return this.sessionOperations.getActivityRetentionStatus(now);
  }

  async cleanupEndedActivityLogs(params: {
    limit?: number | undefined;
    now?: Date | undefined;
    olderThanDays?: number | undefined;
    performedBy: string;
    securityOlderThanDays?: number | undefined;
    source: ActivityRetentionCleanupSource;
  }) {
    return this.sessionOperations.cleanupEndedActivityLogs(params);
  }

  async kickActivity(activityId: string, performedBy: string): Promise<KickActivityResult> {
    return this.moderationOperations.kickActivity(activityId, performedBy);
  }

  async banActivity(activityId: string, performedBy: string): Promise<BanActivityResult> {
    return this.moderationOperations.banActivity(activityId, performedBy);
  }

  async banAccount(username: string, performedBy: string): Promise<BanAccountResult> {
    return this.moderationOperations.banAccount(username, performedBy);
  }

  async unbanUser(banId: string, performedBy: string) {
    return this.moderationOperations.unbanUser(banId, performedBy);
  }

  async getBannedUsers() {
    return this.moderationOperations.getBannedUsers();
  }

  async heartbeat(activityId: string) {
    return this.sessionOperations.heartbeat(activityId);
  }

  async getActiveActivities() {
    return this.sessionOperations.getActiveActivities();
  }
}
