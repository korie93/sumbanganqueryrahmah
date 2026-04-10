import { WebSocket } from "ws";
import { createActivityModerationOperations } from "./activity-moderation-operations";
import { createActivitySessionOperations } from "./activity-session-operations";
import type {
  ActivityClientRegistry,
  ActivityFilters,
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

  async getAllActivities(currentActivityId?: string) {
    return this.sessionOperations.getAllActivities(currentActivityId);
  }

  async getFilteredActivities(filters: ActivityFilters, currentActivityId?: string) {
    return this.sessionOperations.getFilteredActivities(filters, currentActivityId);
  }

  async deleteActivityLog(activityId: string) {
    return this.sessionOperations.deleteActivityLog(activityId);
  }

  async bulkDeleteActivityLogs(activityIds: string[]) {
    return this.sessionOperations.bulkDeleteActivityLogs(activityIds);
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
