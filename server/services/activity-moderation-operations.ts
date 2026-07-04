import type {
  ActivityStorage,
  BanAccountResult,
  BanActivityResult,
  KickActivityResult,
} from "./activity-service-types";

type CloseActivitySocket = (
  activityId: string,
  payload?: Record<string, unknown>,
) => Promise<void>;

function buildSessionModerationAuditDetails(activityId: string, outcome: "banned" | "kicked") {
  return JSON.stringify({
    activityId,
    outcome,
  });
}

export function createActivityModerationOperations(
  storage: ActivityStorage,
  closeSocket: CloseActivitySocket,
) {
  return {
    async kickActivity(activityId: string, performedBy: string): Promise<KickActivityResult> {
      const activity = await storage.getActivityById(activityId);
      if (!activity) {
        return { status: "not_found" };
      }

      await storage.updateActivity(activityId, {
        isActive: false,
        logoutTime: new Date(),
        logoutReason: "KICKED",
      });

      await closeSocket(activityId, {
        type: "kicked",
        reason: "You have been logged out by an administrator.",
      });

      await storage.createAuditLog({
        action: "KICK_USER",
        performedBy,
        targetUser: activity.username,
        targetResource: `activity:${activityId}`,
        details: buildSessionModerationAuditDetails(activityId, "kicked"),
      });

      return { status: "ok" };
    },

    async banActivity(activityId: string, performedBy: string): Promise<BanActivityResult> {
      const activity = await storage.getActivityById(activityId);
      if (!activity) {
        return { status: "not_found" };
      }

      const targetUser = await storage.getUserByUsername(activity.username);
      const targetRole = targetUser?.role ?? activity.role;
      if (targetRole === "superuser") {
        return { status: "cannot_ban_superuser" };
      }

      await storage.banVisitor({
        username: activity.username,
        role: targetRole,
        activityId: activity.id,
        fingerprint: activity.fingerprint ?? null,
        ipAddress: activity.ipAddress ?? null,
        browser: activity.browser ?? null,
        pcName: activity.pcName ?? null,
        deviceType: activity.deviceType ?? null,
        platform: activity.platform ?? null,
      });

      await storage.updateUserBan(activity.username, true);

      await storage.updateActivity(activityId, {
        isActive: false,
        logoutTime: new Date(),
        logoutReason: "BANNED",
      });

      await closeSocket(activityId, {
        type: "banned",
        reason: "Your account has been banned.",
      });

      await storage.createAuditLog({
        action: "BAN_USER",
        performedBy,
        targetUser: activity.username,
        targetResource: `activity:${activityId}`,
        details: buildSessionModerationAuditDetails(activityId, "banned"),
      });

      return { status: "ok" };
    },

    async banAccount(username: string, performedBy: string): Promise<BanAccountResult> {
      const targetUser = await storage.getUserByUsername(username);
      if (!targetUser) {
        return { status: "not_found" };
      }
      if (targetUser.role === "superuser") {
        return { status: "cannot_ban_superuser" };
      }

      const activeSessions = await storage.getActiveActivitiesByUsername(username);

      await storage.updateUserBan(username, true);
      await storage.deactivateUserActivities(username, "BANNED");

      for (const activity of activeSessions) {
        await closeSocket(activity.id, {
          type: "banned",
          reason: "Your account has been banned.",
        });
      }

      await storage.createAuditLog({
        action: "BAN_USER",
        performedBy,
        targetUser: username,
        details: "Admin ban (account-level)",
      });

      return { status: "ok" };
    },

    async unbanUser(banId: string, performedBy: string) {
      const unbanned = await storage.unbanVisitor(banId);
      if (unbanned?.username) {
        const remainingBans = await storage.getBannedSessions();
        const hasRemainingBanForUser = remainingBans.some(
          (session) => session.username.toLowerCase() === unbanned.username.toLowerCase(),
        );
        if (!hasRemainingBanForUser) {
          await storage.updateUserBan(unbanned.username, false);
        }
      }

      await storage.createAuditLog({
        action: "UNBAN_USER",
        performedBy,
        targetUser: unbanned?.username ?? null,
        details: `Unbanned banId=${banId}`,
      });
    },

    async getBannedUsers() {
      const bannedSessions = await storage.getBannedSessions();
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
    },
  };
}
