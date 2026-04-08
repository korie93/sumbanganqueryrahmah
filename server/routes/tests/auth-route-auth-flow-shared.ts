import type { NextFunction, Request, Response } from "express";

export type AuditEntry = {
  action: string;
  performedBy?: string;
  targetUser?: string;
  details?: string;
};

export type TestAuthRouteTimestamp = Date | string;

export type ActivationRecord = {
  tokenId: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  activatedAt: TestAuthRouteTimestamp | null;
  expiresAt: TestAuthRouteTimestamp;
  usedAt: TestAuthRouteTimestamp | null;
  createdAt: TestAuthRouteTimestamp;
};

export type PasswordResetRecord = {
  requestId: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  activatedAt: TestAuthRouteTimestamp | null;
  expiresAt: TestAuthRouteTimestamp;
  usedAt: TestAuthRouteTimestamp | null;
  createdAt: TestAuthRouteTimestamp;
};

export type TestAuthRouteUser = {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  passwordHash: string | null;
  mustChangePassword: boolean;
  passwordResetBySuperuser: boolean;
  isBanned: boolean;
  activatedAt: TestAuthRouteTimestamp | null;
  passwordChangedAt: TestAuthRouteTimestamp | null;
  lastLoginAt: TestAuthRouteTimestamp | null;
  twoFactorEnabled?: boolean;
  twoFactorSecretEncrypted?: string | null;
  twoFactorConfiguredAt?: TestAuthRouteTimestamp | null;
  failedLoginAttempts?: number;
  lockedAt?: TestAuthRouteTimestamp | null;
  lockedReason?: string | null;
  lockedBySystem?: boolean;
} & Record<string, unknown>;

export type TestAuthRouteActivity = {
  id: string;
  username: string;
  isActive: boolean;
  loginTime: TestAuthRouteTimestamp;
  lastActivityTime: TestAuthRouteTimestamp;
  userId?: string;
  role?: string;
  logoutTime?: TestAuthRouteTimestamp | null;
  fingerprint?: string | null;
  ipAddress?: string | null;
} & Record<string, unknown>;

type MutableAuthenticatedRequest = Request & {
  user?: {
    userId?: string;
    username: string;
    role: string;
    activityId: string;
    mustChangePassword: boolean;
  };
};

export function authenticateAs(user: {
  id?: string;
  username: string;
  role: string;
  mustChangePassword?: boolean;
}) {
  return (req: MutableAuthenticatedRequest, _res: Response, next: NextFunction) => {
    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role,
      activityId: "activity-auth-test-1",
      mustChangePassword: user.mustChangePassword ?? false,
    };
    next();
  };
}
