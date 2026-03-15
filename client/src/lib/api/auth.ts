import { apiRequest } from "../queryClient";
import { API_BASE } from "./shared";

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

export async function login(username: string, password: string, fingerprint?: string) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: username.toLowerCase().trim(),
      password,
      fingerprint,
      browser: navigator.userAgent,
    }),
    credentials: "include",
  });

  const data = await res.json();
  if (data.banned) {
    return { banned: true };
  }
  if (!res.ok) {
    throw new Error(data.message || "Login failed");
  }

  return data;
}

export async function checkHealth() {
  const response = await fetch(`${API_BASE}/api/health`);
  return response.json();
}

export async function getMe(): Promise<CurrentUser> {
  const response = await apiRequest("GET", "/api/me");
  return response.json();
}

export async function validateActivationToken(payload: { token: string }) {
  const response = await apiRequest("POST", "/api/auth/validate-activation-token", payload);
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
}) {
  const response = await apiRequest("POST", "/api/auth/activate-account", payload);
  return response.json();
}

export async function requestPasswordReset(payload: {
  identifier: string;
}) {
  const response = await apiRequest("POST", "/api/auth/request-password-reset", payload);
  return response.json();
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
  return response.json();
}

export async function changeMyPassword(payload: {
  currentPassword: string;
  newPassword: string;
}) {
  const response = await apiRequest("POST", "/api/auth/change-password", payload);
  return response.json();
}

export async function updateMyCredentials(payload: {
  newUsername?: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  const response = await apiRequest("PATCH", "/api/me/credentials", payload);
  return response.json();
}

export async function getSuperuserManagedUsers(): Promise<{
  ok: boolean;
  users: Array<{
    id: string;
    username: string;
    fullName: string | null;
    email: string | null;
    role: string;
    status: string;
    mustChangePassword: boolean;
    passwordResetBySuperuser: boolean;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    activatedAt: string | null;
    lastLoginAt: string | null;
    passwordChangedAt: string | null;
    isBanned: boolean | null;
  }>;
}> {
  const response = await apiRequest("GET", "/api/admin/users");
  return response.json();
}

export async function createManagedUserAccount(payload: {
  username: string;
  fullName?: string | null;
  email?: string | null;
  role: "admin" | "user";
}) {
  const response = await apiRequest("POST", "/api/admin/users", payload);
  return response.json() as Promise<{
    ok: boolean;
    user: CurrentUser;
    activation: ActivationDeliveryPayload;
  }>;
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
  return response.json();
}

export async function deleteManagedUserAccount(userId: string) {
  const response = await apiRequest("DELETE", `/api/admin/users/${encodeURIComponent(userId)}`);
  return response.json() as Promise<{
    ok: boolean;
    deleted: boolean;
    user: CurrentUser | null;
  }>;
}

export async function updateManagedUserRole(
  userId: string,
  role: "admin" | "user",
) {
  const response = await apiRequest("PATCH", `/api/admin/users/${encodeURIComponent(userId)}/role`, { role });
  return response.json();
}

export async function updateManagedUserStatus(
  userId: string,
  payload: {
    status?: "pending_activation" | "active" | "suspended" | "disabled";
    isBanned?: boolean;
  },
) {
  const response = await apiRequest("PATCH", `/api/admin/users/${encodeURIComponent(userId)}/status`, payload);
  return response.json();
}

export async function resetManagedUserPassword(userId: string) {
  const response = await apiRequest("POST", `/api/admin/users/${encodeURIComponent(userId)}/reset-password`);
  return response.json() as Promise<{
    ok: boolean;
    forceLogout: boolean;
    user: CurrentUser;
    reset: ActivationDeliveryPayload;
  }>;
}

export async function resendManagedUserActivation(userId: string) {
  const response = await apiRequest("POST", `/api/admin/users/${encodeURIComponent(userId)}/resend-activation`);
  return response.json() as Promise<{
    ok: boolean;
    user: CurrentUser;
    activation: ActivationDeliveryPayload;
  }>;
}

export async function getPendingPasswordResetRequests(): Promise<{
  ok: boolean;
  requests: Array<{
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
  }>;
}> {
  const response = await apiRequest("GET", "/api/admin/password-reset-requests");
  return response.json();
}

export async function getDevMailOutboxPreviews(): Promise<{
  ok: boolean;
  enabled: boolean;
  previews: DevMailOutboxPreviewPayload[];
}> {
  const response = await apiRequest("GET", "/api/admin/dev-mail-outbox");
  return response.json();
}

export async function deleteDevMailOutboxPreview(previewId: string) {
  const response = await apiRequest("DELETE", `/api/admin/dev-mail-outbox/${encodeURIComponent(previewId)}`);
  return response.json() as Promise<{
    ok: boolean;
    deleted: boolean;
  }>;
}

export async function clearDevMailOutboxPreviews() {
  const response = await apiRequest("DELETE", "/api/admin/dev-mail-outbox");
  return response.json() as Promise<{
    ok: boolean;
    deletedCount: number;
  }>;
}
