export type CurrentUser = {
  id: string;
  username: string;
  fullName?: string | null;
  email?: string | null;
  role: string;
  status: string;
  mustChangePassword: boolean;
  passwordResetBySuperuser?: boolean;
  isBanned?: boolean | null;
  twoFactorEnabled?: boolean;
  twoFactorPendingSetup?: boolean;
  twoFactorConfiguredAt?: string | null;
};

export type ActivationTokenValidationPayload = {
  email: string | null;
  expiresAt: string;
  fullName: string | null;
  role: string;
  username: string;
};

export type PasswordResetTokenValidationPayload = {
  email: string | null;
  expiresAt: string;
  fullName: string | null;
  role: string;
  username: string;
};

export type ActivationDeliveryPayload = {
  deliveryMode: "dev_outbox" | "none" | "smtp";
  errorCode: string | null;
  errorMessage: string | null;
  expiresAt: string;
  previewUrl: string | null;
  recipientEmail: string;
  sent: boolean;
};

export type DevMailOutboxPreviewPayload = {
  createdAt: string;
  id: string;
  previewUrl: string;
  subject: string;
  to: string;
};

export type PaginatedListPayload = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AuthOkResponse<T extends Record<string, unknown>> = {
  ok: true;
} & T;

export type ManagedUserSummary = Omit<
  CurrentUser,
  "fullName" | "email" | "passwordResetBySuperuser" | "isBanned"
> & {
  fullName: string | null;
  email: string | null;
  passwordResetBySuperuser: boolean;
  isBanned: boolean | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  failedLoginAttempts: number;
  lockedAt: string | null;
  lockedReason: string | null;
  lockedBySystem: boolean;
};

export type PendingPasswordResetRequestSummary = {
  id: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  requestedByUser: string | null;
  approvedBy: string | null;
  resetType: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
};

export type LoginSuccessResponse = AuthOkResponse<{
  username: string;
  role: string;
  activityId: string;
  mustChangePassword: boolean;
  status: string;
  user: CurrentUser | null;
}>;

export type LoginTwoFactorChallengeResponse = AuthOkResponse<{
  twoFactorRequired: true;
  challengeToken: string;
  username: string;
  role: string;
  mustChangePassword: boolean;
  status: string;
  user: CurrentUser | null;
}>;

export type LoginResponse = LoginSuccessResponse | LoginTwoFactorChallengeResponse;

export type AuthUserResponse = AuthOkResponse<{
  user: CurrentUser | null;
}>;

export type AuthUserForceLogoutResponse = AuthOkResponse<{
  forceLogout: boolean;
  user: CurrentUser | null;
}>;

export type AuthMessageResponse = AuthOkResponse<{
  message: string;
}>;

export type TwoFactorStatusResponse = AuthOkResponse<{
  twoFactor: {
    enabled: boolean;
    pendingSetup: boolean;
    configuredAt: string | null;
  };
  user: CurrentUser | null;
}>;

export type TwoFactorSetupResponse = AuthOkResponse<{
  setup: {
    accountName: string;
    issuer: string;
    otpauthUrl: string;
    secret: string;
  };
  user: CurrentUser | null;
}>;

export type ManagedUsersResponse = AuthOkResponse<{
  users: ManagedUserSummary[];
  pagination?: PaginatedListPayload;
}>;

export type ManagedAccountActivationResponse = AuthOkResponse<{
  user: CurrentUser | null;
  activation: ActivationDeliveryPayload;
}>;

export type ManagedAccountPasswordResetResponse = AuthOkResponse<{
  forceLogout: boolean;
  user: CurrentUser | null;
  reset: ActivationDeliveryPayload;
}>;

export type ManagedAccountDeleteResponse = AuthOkResponse<{
  deleted: boolean;
  user: CurrentUser | null;
}>;

export type DevMailOutboxPreviewsResponse = AuthOkResponse<{
  enabled: boolean;
  previews: DevMailOutboxPreviewPayload[];
  pagination?: PaginatedListPayload;
}>;

export type DevMailOutboxDeleteResponse = AuthOkResponse<{
  deleted: boolean;
}>;

export type DevMailOutboxClearResponse = AuthOkResponse<{
  deletedCount: number;
}>;

export type PendingPasswordResetRequestsResponse = AuthOkResponse<{
  requests: PendingPasswordResetRequestSummary[];
  pagination?: PaginatedListPayload;
}>;

export type RequestOptions = {
  signal?: AbortSignal;
};

export type ManagedUsersQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "all" | "admin" | "user";
  status?: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
};

export type PendingPasswordResetRequestsQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
};

export type DevMailOutboxPreviewsQuery = {
  page?: number;
  pageSize?: number;
  searchEmail?: string;
  searchSubject?: string;
  sortDirection?: "asc" | "desc";
};
