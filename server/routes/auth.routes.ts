import bcrypt from "bcrypt";
import type { Express, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import { getSessionSecret } from "../config/security";
import {
  buildCredentialAuditDetails,
  CREDENTIAL_BCRYPT_COST,
  CREDENTIAL_USERNAME_REGEX,
  isStrongPassword,
  normalizeUsernameInput,
  sendCredentialError,
} from "../auth/credentials";
import type { AuthenticatedRequest } from "../auth/guards";
import { ensureObject } from "../http/validation";
import { parseBrowser } from "../lib/browser";
import { logger } from "../lib/logger";
import type { PostgresStorage } from "../storage-postgres";

type AuthRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  connectedClients: Map<string, WebSocket>;
};

export function registerAuthRoutes(app: Express, deps: AuthRouteDeps) {
  const { storage, authenticateToken, requireRole, connectedClients } = deps;
  const jwtSecret = getSessionSecret();

  const closeActivitySockets = (activityIds: string[], reason: string) => {
    for (const activityId of activityIds) {
      const socket = connectedClients.get(activityId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "logout", reason }));
        socket.close();
      }
      connectedClients.delete(activityId);
      void storage.clearCollectionNicknameSessionByActivity(activityId);
    }
  };

  async function handleLogin(req: AuthenticatedRequest, res: Response) {
    try {
      const body = ensureObject(req.body) || {};
      const username = normalizeUsernameInput(body.username);
      const password = String(body.password ?? "");
      const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : null;
      const pcName = typeof body.pcName === "string" ? body.pcName : null;
      const browser = typeof body.browser === "string" ? body.browser : null;

      const user = await storage.getUserByUsername(username);
      if (!user) {
        await storage.createAuditLog({
          action: "LOGIN_FAILED",
          performedBy: username || "unknown",
          details: "User not found",
        });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const visitorBanned = await storage.isVisitorBanned(
        fingerprint,
        req.ip || req.socket.remoteAddress || null,
      );

      if (visitorBanned || user.isBanned) {
        await storage.createAuditLog({
          action: "LOGIN_FAILED_BANNED",
          performedBy: user.username,
          details: visitorBanned ? "Visitor is banned" : "User is banned",
        });
        return res.status(403).json({ message: "Account is banned", banned: true });
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        await storage.createAuditLog({
          action: "LOGIN_FAILED",
          performedBy: user.username,
          details: "Invalid password",
        });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const browserName = parseBrowser(browser || req.headers["user-agent"]);

      if (user.role === "superuser") {
        const enforceSingleSession = await storage.getBooleanSystemSetting(
          "enforce_superuser_single_session",
          false,
        );

        if (enforceSingleSession) {
          const activeSessions = await storage.getActiveActivitiesByUsername(user.username);
          if (activeSessions.length > 0) {
            await storage.createAuditLog({
              action: "LOGIN_BLOCKED_SINGLE_SESSION",
              performedBy: user.username,
              details: `Superuser single-session policy blocked login. Active sessions: ${activeSessions.length}`,
            });
            return res.status(409).json({
              message: "Single superuser session is enforced. Logout from the current session first.",
              code: "SUPERUSER_SINGLE_SESSION_ENFORCED",
            });
          }
        }
      } else if (user.role === "admin" && fingerprint) {
        await storage.deactivateUserSessionsByFingerprint(user.username, fingerprint);
      }

      const activity = await storage.createActivity({
        userId: user.id,
        username: user.username,
        role: user.role,
        pcName,
        browser: browserName,
        fingerprint,
        ipAddress: req.ip || req.socket.remoteAddress || null,
      });

      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          role: user.role,
          activityId: activity.id,
        },
        jwtSecret,
        { expiresIn: "24h" },
      );

      await storage.createAuditLog({
        action: "LOGIN_SUCCESS",
        performedBy: user.username,
        details: `Login from ${browserName}`,
      });

      return res.json({
        token,
        username: user.username,
        role: user.role,
        user: { username: user.username, role: user.role },
        activityId: activity.id,
      });
    } catch (error) {
      logger.error("Login error", { message: (error as Error)?.message });
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  app.post("/api/login", handleLogin);
  app.post("/api/auth/login", handleLogin);

  app.get("/api/auth/me", authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    return res.json({
      user: {
        username: req.user.username,
        role: req.user.role,
        activityId: req.user.activityId,
      },
    });
  });

  app.get("/api/me", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return sendCredentialError(res, 401, "PERMISSION_DENIED", "Authentication required.");
      }

      const user = req.user.userId
        ? await storage.getUser(req.user.userId)
        : await storage.getUserByUsername(req.user.username);

      if (!user) {
        return sendCredentialError(res, 404, "USER_NOT_FOUND", "User not found.");
      }

      return res.json({
        id: user.id,
        username: user.username,
        role: user.role,
      });
    } catch (error) {
      return sendCredentialError(res, 500, "PERMISSION_DENIED", "Failed to load user profile.");
    }
  });

  app.patch("/api/me/credentials", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return sendCredentialError(res, 401, "PERMISSION_DENIED", "Authentication required.");
      }

      const actor = req.user.userId
        ? await storage.getUser(req.user.userId)
        : await storage.getUserByUsername(req.user.username);

      if (!actor) {
        return sendCredentialError(res, 404, "USER_NOT_FOUND", "User not found.");
      }

      const body = ensureObject(req.body) || {};
      const hasUsernameField = Object.prototype.hasOwnProperty.call(body, "newUsername");
      const hasPasswordField = Object.prototype.hasOwnProperty.call(body, "newPassword");

      let nextUsername: string | undefined;
      let nextPasswordHash: string | undefined;
      let usernameChanged = false;
      let passwordChanged = false;

      if (hasUsernameField) {
        const normalized = normalizeUsernameInput(body.newUsername);
        if (!normalized || !CREDENTIAL_USERNAME_REGEX.test(normalized)) {
          return sendCredentialError(res, 400, "USERNAME_TAKEN", "Username must match ^[a-zA-Z0-9._-]{3,32}$.");
        }

        const existing = await storage.getUserByUsername(normalized);
        if (existing && existing.id !== actor.id) {
          return sendCredentialError(res, 409, "USERNAME_TAKEN", "Username already exists.");
        }

        if (normalized !== actor.username) {
          nextUsername = normalized;
          usernameChanged = true;
        }
      }

      if (hasPasswordField) {
        const nextPasswordRaw = String(body.newPassword ?? "");
        const currentPasswordRaw = String(body.currentPassword ?? "");

        if (!currentPasswordRaw) {
          return sendCredentialError(res, 400, "INVALID_CURRENT_PASSWORD", "Current password is required.");
        }

        const currentPasswordMatch = await bcrypt.compare(currentPasswordRaw, actor.passwordHash);
        if (!currentPasswordMatch) {
          return sendCredentialError(res, 400, "INVALID_CURRENT_PASSWORD", "Current password is invalid.");
        }

        if (!isStrongPassword(nextPasswordRaw)) {
          return sendCredentialError(
            res,
            400,
            "INVALID_PASSWORD",
            "Password must be at least 8 characters and include at least one letter and one number.",
          );
        }

        const sameAsCurrent = await bcrypt.compare(nextPasswordRaw, actor.passwordHash);
        if (sameAsCurrent) {
          return sendCredentialError(res, 400, "INVALID_PASSWORD", "New password must be different from current password.");
        }

        nextPasswordHash = await bcrypt.hash(nextPasswordRaw, CREDENTIAL_BCRYPT_COST);
        passwordChanged = true;
      }

      if (!usernameChanged && !passwordChanged) {
        return res.json({
          ok: true,
          user: { id: actor.id, username: actor.username, role: actor.role },
        });
      }

      const activeSessions = passwordChanged
        ? await storage.getActiveActivitiesByUsername(actor.username)
        : [];

      const updatedUser = await storage.updateUserCredentials({
        userId: actor.id,
        newUsername: nextUsername,
        newPasswordHash: nextPasswordHash,
        passwordChangedAt: passwordChanged ? new Date() : undefined,
      });

      if (!updatedUser) {
        return sendCredentialError(res, 404, "USER_NOT_FOUND", "User not found.");
      }

      if (usernameChanged && !passwordChanged && nextUsername) {
        await storage.updateActivitiesUsername(actor.username, nextUsername);
      }

      if (usernameChanged) {
        await storage.createAuditLog({
          action: "USER_USERNAME_CHANGED",
          performedBy: actor.id,
          targetUser: updatedUser.id,
          details: buildCredentialAuditDetails({
            actor_user_id: actor.id,
            target_user_id: updatedUser.id,
            changedField: "username",
          }),
        });
      }

      if (passwordChanged) {
        await storage.createAuditLog({
          action: "USER_PASSWORD_CHANGED",
          performedBy: actor.id,
          targetUser: updatedUser.id,
          details: buildCredentialAuditDetails({
            actor_user_id: actor.id,
            target_user_id: updatedUser.id,
            changedField: "password",
          }),
        });

        await storage.deactivateUserActivities(actor.username, "PASSWORD_CHANGED");
        if (updatedUser.username !== actor.username) {
          await storage.deactivateUserActivities(updatedUser.username, "PASSWORD_CHANGED");
        }
        closeActivitySockets(
          activeSessions.map((activity) => activity.id),
          "Password changed. Please login again.",
        );
      }

      return res.json({
        ok: true,
        forceLogout: passwordChanged,
        user: { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role },
      });
    } catch (error: any) {
      if (String(error?.code || "") === "23505") {
        return sendCredentialError(res, 409, "USERNAME_TAKEN", "Username already exists.");
      }
      return sendCredentialError(res, 500, "PERMISSION_DENIED", "Failed to update credentials.");
    }
  });

  app.get("/api/admin/users", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user || req.user.role !== "superuser") {
        return sendCredentialError(res, 403, "PERMISSION_DENIED", "Only superuser can access this resource.");
      }

      const users = await storage.getUsersByRoles(["admin", "user"]);
      return res.json({
        ok: true,
        users: users.map((item) => ({
          id: item.id,
          username: item.username,
          role: item.role,
        })),
      });
    } catch {
      return sendCredentialError(res, 500, "PERMISSION_DENIED", "Failed to load users.");
    }
  });

  app.patch("/api/admin/users/:id/credentials", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user || req.user.role !== "superuser") {
        return sendCredentialError(res, 403, "PERMISSION_DENIED", "Only superuser can access this resource.");
      }

      const actor = req.user.userId
        ? await storage.getUser(req.user.userId)
        : await storage.getUserByUsername(req.user.username);
      if (!actor) {
        return sendCredentialError(res, 404, "USER_NOT_FOUND", "Actor user not found.");
      }

      const targetUserId = String(req.params.id || "").trim();
      if (!targetUserId) {
        return sendCredentialError(res, 404, "USER_NOT_FOUND", "Target user not found.");
      }

      const target = await storage.getUser(targetUserId);
      if (!target) {
        return sendCredentialError(res, 404, "USER_NOT_FOUND", "Target user not found.");
      }
      if (target.role !== "admin" && target.role !== "user") {
        return sendCredentialError(res, 403, "PERMISSION_DENIED", "Target role is not allowed.");
      }

      const body = ensureObject(req.body) || {};
      const hasUsernameField = Object.prototype.hasOwnProperty.call(body, "newUsername");
      const hasPasswordField = Object.prototype.hasOwnProperty.call(body, "newPassword");

      let nextUsername: string | undefined;
      let nextPasswordHash: string | undefined;
      let usernameChanged = false;
      let passwordChanged = false;

      if (hasUsernameField) {
        const normalized = normalizeUsernameInput(body.newUsername);
        if (!normalized || !CREDENTIAL_USERNAME_REGEX.test(normalized)) {
          return sendCredentialError(res, 400, "USERNAME_TAKEN", "Username must match ^[a-zA-Z0-9._-]{3,32}$.");
        }

        const existing = await storage.getUserByUsername(normalized);
        if (existing && existing.id !== target.id) {
          return sendCredentialError(res, 409, "USERNAME_TAKEN", "Username already exists.");
        }

        if (normalized !== target.username) {
          nextUsername = normalized;
          usernameChanged = true;
        }
      }

      if (hasPasswordField) {
        const nextPasswordRaw = String(body.newPassword ?? "");
        if (!isStrongPassword(nextPasswordRaw)) {
          return sendCredentialError(
            res,
            400,
            "INVALID_PASSWORD",
            "Password must be at least 8 characters and include at least one letter and one number.",
          );
        }

        const sameAsCurrent = await bcrypt.compare(nextPasswordRaw, target.passwordHash);
        if (sameAsCurrent) {
          return sendCredentialError(res, 400, "INVALID_PASSWORD", "New password must be different from current password.");
        }

        nextPasswordHash = await bcrypt.hash(nextPasswordRaw, CREDENTIAL_BCRYPT_COST);
        passwordChanged = true;
      }

      if (!usernameChanged && !passwordChanged) {
        return res.json({ ok: true });
      }

      const activeSessions = passwordChanged
        ? await storage.getActiveActivitiesByUsername(target.username)
        : [];

      const updatedUser = await storage.updateUserCredentials({
        userId: target.id,
        newUsername: nextUsername,
        newPasswordHash: nextPasswordHash,
        passwordChangedAt: passwordChanged ? new Date() : undefined,
      });

      if (!updatedUser) {
        return sendCredentialError(res, 404, "USER_NOT_FOUND", "Target user not found.");
      }

      if (usernameChanged && !passwordChanged && nextUsername) {
        await storage.updateActivitiesUsername(target.username, nextUsername);
      }

      if (usernameChanged) {
        await storage.createAuditLog({
          action: "USER_USERNAME_CHANGED",
          performedBy: actor.id,
          targetUser: updatedUser.id,
          details: buildCredentialAuditDetails({
            actor_user_id: actor.id,
            target_user_id: updatedUser.id,
            changedField: "username",
          }),
        });
      }

      if (passwordChanged) {
        await storage.createAuditLog({
          action: "USER_PASSWORD_CHANGED",
          performedBy: actor.id,
          targetUser: updatedUser.id,
          details: buildCredentialAuditDetails({
            actor_user_id: actor.id,
            target_user_id: updatedUser.id,
            changedField: "password",
          }),
        });

        await storage.deactivateUserActivities(target.username, "PASSWORD_RESET_BY_SUPERUSER");
        if (updatedUser.username !== target.username) {
          await storage.deactivateUserActivities(updatedUser.username, "PASSWORD_RESET_BY_SUPERUSER");
        }
        closeActivitySockets(
          activeSessions.map((activity) => activity.id),
          "Password reset by superuser. Please login again.",
        );
      }

      return res.json({ ok: true });
    } catch (error: any) {
      if (String(error?.code || "") === "23505") {
        return sendCredentialError(res, 409, "USERNAME_TAKEN", "Username already exists.");
      }
      return sendCredentialError(res, 500, "PERMISSION_DENIED", "Failed to update credentials.");
    }
  });

  app.get("/api/accounts", authenticateToken, requireRole("superuser"), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const accounts = await storage.getAccounts();
      return res.json(accounts);
    } catch {
      return res.status(500).json({ message: "Failed to load accounts." });
    }
  });

  app.post("/api/users", authenticateToken, requireRole("superuser"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required." });
      }

      const body = ensureObject(req.body) || {};
      const username = normalizeUsernameInput(body.username);
      const password = String(body.password ?? "");
      const role = String(body.role ?? "user").trim().toLowerCase();

      if (!CREDENTIAL_USERNAME_REGEX.test(username)) {
        return res.status(400).json({ message: "Invalid username format." });
      }
      if (!isStrongPassword(password)) {
        return res.status(400).json({ message: "Password does not meet minimum strength requirements." });
      }
      if (!["superuser", "admin", "user"].includes(role)) {
        return res.status(400).json({ message: "Invalid role." });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ message: "Username already exists." });
      }

      const user = await storage.createUser({ username, password, role });
      await storage.createAuditLog({
        action: "CREATE_USER",
        performedBy: req.user.username,
        targetUser: user.id,
        details: `Created user with role: ${user.role}`,
      });

      return res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        isBanned: user.isBanned,
      });
    } catch (error) {
      logger.error("Create user error", { message: (error as Error)?.message });
      return res.status(500).json({ message: "Failed to create user." });
    }
  });
}
