export type AuditEntry = {
  action: string;
  performedBy?: string;
  targetUser?: string;
  details?: string;
};

export type ActivationRecord = {
  tokenId: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  activatedAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
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
  activatedAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export function authenticateAs(user: {
  id?: string;
  username: string;
  role: string;
  mustChangePassword?: boolean;
}) {
  return (req: any, _res: any, next: () => void) => {
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
