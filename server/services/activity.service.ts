import { WebSocket } from "ws";
import type { PostgresStorage } from "../storage-postgres";

type ActivityFilters = {
  status?: string[];
  username?: string;
  ipAddress?: string;
  browser?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

type ActivityStorage = Pick<
  PostgresStorage,
  | "banVisitor"
  | "clearCollectionNicknameSessionByActivity"
  | "createAuditLog"
  | "deactivateUserActivities"
  | "deleteActivity"
  | "getActiveActivities"
  | "getActiveActivitiesByUsername"
  | "getActivityById"
  | "getAllActivities"
  | "getBannedSessions"
  | "getFilteredActivities"
  | "getUserByUsername"
  | "unbanVisitor"
  | "updateActivity"
  | "updateUserBan"
>;

type KickActivityResult = {
  status: "ok" | "not_found";
};

type BanActivityResult = {
  status: "ok" | "not_found" | "cannot_ban_superuser";
};

type BanAccountResult = {
  status: "ok" | "not_found" | "cannot_ban_superuser";
};

export class ActivityService {
  constructor(
    private readonly storage: ActivityStorage,
    private readonly connectedClients: Map<string, WebSocket>,
  ) {}

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
    const activity = await this.storage.getActivityById(activityId);
    if (!activity || activity.isActive === false) {
      return;
    }

    await this.storage.updateActivity(activityId, {
      isActive: false,
      logoutTime: new Date(),
      logoutReason: "USER_LOGOUT",
    });

    await this.closeSocket(activityId, {
      type: "logout",
      reason: "User logged out",
    });

    await this.storage.createAuditLog({
      action: "LOGOUT",
      performedBy: username,
    });
  }

  async getAllActivities() {
    return this.storage.getAllActivities();
  }

  async getFilteredActivities(filters: ActivityFilters) {
    return this.storage.getFilteredActivities(filters);
  }

  async deleteActivityLog(activityId: string) {
    await this.storage.deleteActivity(activityId);
    await this.closeSocket(activityId);
  }

  async bulkDeleteActivityLogs(activityIds: string[]) {
    let deletedCount = 0;
    const notFoundIds: string[] = [];

    for (const activityId of activityIds) {
      const activity = await this.storage.getActivityById(activityId);
      if (!activity) {
        notFoundIds.push(activityId);
        continue;
      }

      await this.storage.deleteActivity(activityId);
      await this.closeSocket(activityId);
      deletedCount += 1;
    }

    return {
      deletedCount,
      notFoundIds,
    };
  }

  async kickActivity(activityId: string, performedBy: string): Promise<KickActivityResult> {
    const activity = await this.storage.getActivityById(activityId);
    if (!activity) {
      return { status: "not_found" };
    }

    await this.storage.updateActivity(activityId, {
      isActive: false,
      logoutTime: new Date(),
      logoutReason: "KICKED",
    });

    await this.closeSocket(activityId, {
      type: "kicked",
      reason: "You have been logged out by an administrator.",
    });

    await this.storage.createAuditLog({
      action: "KICK_USER",
      performedBy,
      targetUser: activity.username,
      details: `Kicked activityId=${activityId}`,
    });

    return { status: "ok" };
  }

  async banActivity(activityId: string, performedBy: string): Promise<BanActivityResult> {
    const activity = await this.storage.getActivityById(activityId);
    if (!activity) {
      return { status: "not_found" };
    }

    const targetUser = await this.storage.getUserByUsername(activity.username);
    if (targetUser?.role === "superuser") {
      return { status: "cannot_ban_superuser" };
    }

    await this.storage.banVisitor({
      username: activity.username,
      role: activity.role,
      activityId: activity.id,
      fingerprint: activity.fingerprint ?? null,
      ipAddress: activity.ipAddress ?? null,
      browser: activity.browser ?? null,
      pcName: activity.pcName ?? null,
    });

    await this.storage.updateActivity(activityId, {
      isActive: false,
      logoutTime: new Date(),
      logoutReason: "BANNED",
    });

    await this.closeSocket(activityId, {
      type: "banned",
      reason: "Your account has been banned.",
    });

    await this.storage.createAuditLog({
      action: "BAN_USER",
      performedBy,
      targetUser: activity.username,
      details: `Banned via activityId=${activityId}`,
    });

    return { status: "ok" };
  }

  async banAccount(username: string, performedBy: string): Promise<BanAccountResult> {
    const targetUser = await this.storage.getUserByUsername(username);
    if (!targetUser) {
      return { status: "not_found" };
    }
    if (targetUser.role === "superuser") {
      return { status: "cannot_ban_superuser" };
    }

    const activeSessions = await this.storage.getActiveActivitiesByUsername(username);

    await this.storage.updateUserBan(username, true);
    await this.storage.deactivateUserActivities(username, "BANNED");

    for (const activity of activeSessions) {
      await this.closeSocket(activity.id, {
        type: "banned",
        reason: "Your account has been banned.",
      });
    }

    await this.storage.createAuditLog({
      action: "BAN_USER",
      performedBy,
      targetUser: username,
      details: "Admin ban (account-level)",
    });

    return { status: "ok" };
  }

  async unbanUser(banId: string, performedBy: string) {
    await this.storage.unbanVisitor(banId);
    await this.storage.createAuditLog({
      action: "UNBAN_USER",
      performedBy,
      details: `Unbanned banId=${banId}`,
    });
  }

  async getBannedUsers() {
    const bannedSessions = await this.storage.getBannedSessions();
    return bannedSessions.map((session) => ({
      visitorId: session.banId,
      banId: session.banId,
      username: session.username,
      role: session.role,
      banInfo: {
        ipAddress: session.ipAddress ?? null,
        browser: session.browser ?? null,
        bannedAt: session.bannedAt ?? null,
      },
    }));
  }

  async heartbeat(activityId: string) {
    const now = new Date();
    await this.storage.updateActivity(activityId, {
      lastActivityTime: now,
      isActive: true,
    });

    return {
      ok: true,
      status: "ONLINE" as const,
      lastActivityTime: now.toISOString(),
    };
  }

  async getActiveActivities() {
    return this.storage.getActiveActivities();
  }
}
