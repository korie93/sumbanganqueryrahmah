import { apiRequest, createApiHeaders } from "../queryClient";
import { API_BASE, getCsrfHeader } from "./shared";
import { ERROR_CODES } from "@shared/error-codes";

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

type RequestOptions = {
  signal?: AbortSignal;
};

export async function login(
  username: string,
  password: string,
  fingerprint?: string,
  options?: RequestOptions,
): Promise<LoginResponse | { banned: true }> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: createApiHeaders({
      "Content-Type": "application/json",
      ...(getCsrfHeader() as Record<string, string>),
    }),
    body: JSON.stringify({
      username: username.toLowerCase().trim(),
      password,
      fingerprint,
      browser: navigator.userAgent,
    }),
    credentials: "include",
    signal: options?.signal,
  });

  const data = await res.json();
  if (data.banned) {
    return { banned: true };
  }
  if (!res.ok) {
    const error = new Error(data?.message || data?.error?.message || "Login failed") as Error & {
      code?: string;
      locked?: boolean;
      status?: number;
      requestId?: string | null;
    };
    error.code = typeof data?.error?.code === "string" ? data.error.code : undefined;
    error.locked = data?.locked === true;
    if (error.code === ERROR_CODES.ACCOUNT_LOCKED) {
      error.locked = true;
    }
    error.status = res.status;
    error.requestId = res.headers.get("x-request-id");
    throw error;
  }

  return data as LoginResponse;
}

export async function verifyTwoFactorLogin(
  payload: { challengeToken: string; code: string },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/verify-two-factor-login", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<LoginSuccessResponse>;
}

export async function checkHealth(options?: RequestOptions) {
  const response = await fetch(`${API_BASE}/api/health`, {
    headers: createApiHeaders(),
    signal: options?.signal,
  });
  return response.json();
}

export async function getMe(options?: RequestOptions): Promise<CurrentUser> {
  const response = await apiRequest("GET", "/api/me", undefined, {
    signal: options?.signal,
  });
  const payload = (await response.json()) as AuthUserResponse;
  if (!payload.user) {
    throw new Error("Authenticated user payload is missing.");
  }
  return payload.user;
}

export async function validateActivationToken(
  payload: { token: string },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/validate-activation-token", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<{
    ok: boolean;
    activation: ActivationTokenValidationPayload;
  }>;
}

export async function activateAccount(payload: {
  username?: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}, options?: RequestOptions) {
  const response = await apiRequest("POST", "/api/auth/activate-account", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<AuthUserResponse>;
}

export async function requestPasswordReset(payload: {
  identifier: string;
}) {
  const response = await apiRequest("POST", "/api/auth/request-password-reset", payload);
  return response.json() as Promise<AuthMessageResponse>;
}

export async function validatePasswordResetToken(payload: { token: string }) {
  const response = await apiRequest("POST", "/api/auth/validate-password-reset-token", payload);
  return response.json() as Promise<{
    ok: boolean;
    reset: PasswordResetTokenValidationPayload;
  }>;
}

export async function resetPasswordWithToken(payload: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const response = await apiRequest("POST", "/api/auth/reset-password-with-token", payload);
  return response.json() as Promise<AuthUserResponse>;
}

export async function changeMyPassword(payload: {
  currentPassword: string;
  newPassword: string;
}, options?: RequestOptions) {
  const response = await apiRequest("POST", "/api/auth/change-password", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<AuthUserForceLogoutResponse>;
}

export async function getTwoFactorStatus(options?: RequestOptions) {
  const response = await apiRequest("GET", "/api/auth/two-factor", undefined, {
    signal: options?.signal,
  });
  return response.json() as Promise<TwoFactorStatusResponse>;
}

export async function startTwoFactorSetup(
  payload: { currentPassword: string },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/two-factor/setup", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<TwoFactorSetupResponse>;
}

export async function enableTwoFactor(
  payload: { code: string },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/two-factor/enable", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<AuthUserResponse>;
}

export async function disableTwoFactor(
  payload: { currentPassword: string; code: string },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/two-factor/disable", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<AuthUserResponse>;
}

export async function updateMyCredentials(payload: {
  newUsername?: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  const response = await apiRequest("PATCH", "/api/me/credentials", payload);
  return response.json() as Promise<AuthUserForceLogoutResponse>;
}

export async function getSuperuserManagedUsers(query?: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "all" | "admin" | "user";
  status?: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
}, options?: RequestOptions): Promise<ManagedUsersResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.pageSize) params.set("pageSize", String(query.pageSize));
  if (query?.search) params.set("search", query.search);
  if (query?.role && query.role !== "all") params.set("role", query.role);
  if (query?.status && query.status !== "all") params.set("status", query.status);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await apiRequest("GET", `/api/admin/users${suffix}`, undefined, {
    signal: options?.signal,
  });
  return response.json() as Promise<ManagedUsersResponse>;
}

export async function createManagedUserAccount(payload: {
  username: string;
  fullName?: string | null;
  email?: string | null;
  role: "admin" | "user";
}) {
  const response = await apiRequest("POST", "/api/admin/users", payload);
  return response.json() as Promise<ManagedAccountActivationResponse>;
}

export async function updateManagedUserAccount(
  userId: string,
  payload: {
    username?: string;
    fullName?: string | null;
    email?: string | null;
  },
) {
  const response = await apiRequest("PATCH", `/api/admin/users/${encodeURIComponent(userId)}`, payload);
  return response.json() as Promise<AuthUserResponse>;
}

export async function deleteManagedUserAccount(userId: string) {
  const response = await apiRequest("DELETE", `/api/admin/users/${encodeURIComponent(userId)}`);
  return response.json() as Promise<ManagedAccountDeleteResponse>;
}

export async function updateManagedUserRole(
  userId: string,
  role: "admin" | "user",
) {
  const response = await apiRequest("PATCH", `/api/admin/users/${encodeURIComponent(userId)}/role`, { role });
  return response.json() as Promise<AuthUserForceLogoutResponse>;
}

export async function updateManagedUserStatus(
  userId: string,
  payload: {
    status?: "pending_activation" | "active" | "suspended" | "disabled";
    isBanned?: boolean;
  },
) {
  const response = await apiRequest("PATCH", `/api/admin/users/${encodeURIComponent(userId)}/status`, payload);
  return response.json() as Promise<AuthUserForceLogoutResponse>;
}

export async function resetManagedUserPassword(userId: string) {
  const response = await apiRequest("POST", `/api/admin/users/${encodeURIComponent(userId)}/reset-password`);
  return response.json() as Promise<ManagedAccountPasswordResetResponse>;
}

export async function resendManagedUserActivation(userId: string) {
  const response = await apiRequest("POST", `/api/admin/users/${encodeURIComponent(userId)}/resend-activation`);
  return response.json() as Promise<ManagedAccountActivationResponse>;
}

export async function getPendingPasswordResetRequests(query?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
}, options?: RequestOptions): Promise<PendingPasswordResetRequestsResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.pageSize) params.set("pageSize", String(query.pageSize));
  if (query?.search) params.set("search", query.search);
  if (query?.status && query.status !== "all") params.set("status", query.status);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await apiRequest(
    "GET",
    `/api/admin/password-reset-requests${suffix}`,
    undefined,
    { signal: options?.signal },
  );
  return response.json() as Promise<PendingPasswordResetRequestsResponse>;
}

export async function getDevMailOutboxPreviews(query?: {
  page?: number;
  pageSize?: number;
  searchEmail?: string;
  searchSubject?: string;
  sortDirection?: "asc" | "desc";
}, options?: RequestOptions): Promise<DevMailOutboxPreviewsResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.pageSize) params.set("pageSize", String(query.pageSize));
  if (query?.searchEmail) params.set("searchEmail", query.searchEmail);
  if (query?.searchSubject) params.set("searchSubject", query.searchSubject);
  if (query?.sortDirection) params.set("sortDirection", query.sortDirection);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await apiRequest("GET", `/api/admin/dev-mail-outbox${suffix}`, undefined, {
    signal: options?.signal,
  });
  return response.json() as Promise<DevMailOutboxPreviewsResponse>;
}

export async function deleteDevMailOutboxPreview(previewId: string) {
  const response = await apiRequest("DELETE", `/api/admin/dev-mail-outbox/${encodeURIComponent(previewId)}`);
  return response.json() as Promise<DevMailOutboxDeleteResponse>;
}

export async function clearDevMailOutboxPreviews() {
  const response = await apiRequest("DELETE", "/api/admin/dev-mail-outbox");
  return response.json() as Promise<DevMailOutboxClearResponse>;
}
