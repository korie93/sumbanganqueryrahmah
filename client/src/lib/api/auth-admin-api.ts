import { apiRequest } from "../api-client";
import type {
  AuthUserForceLogoutResponse,
  AuthUserResponse,
  DevMailOutboxClearResponse,
  DevMailOutboxDeleteResponse,
  DevMailOutboxPreviewsQuery,
  DevMailOutboxPreviewsResponse,
  ManagedAccountActivationResponse,
  ManagedAccountDeleteResponse,
  ManagedAccountPasswordResetResponse,
  ManagedUsersQuery,
  ManagedUsersResponse,
  PendingPasswordResetRequestsQuery,
  PendingPasswordResetRequestsResponse,
  RequestOptions,
} from "./auth-types";

export async function getSuperuserManagedUsers(
  query?: ManagedUsersQuery,
  options?: RequestOptions,
): Promise<ManagedUsersResponse> {
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
  const response = await apiRequest(
    "PATCH",
    `/api/admin/users/${encodeURIComponent(userId)}`,
    payload,
  );
  return response.json() as Promise<AuthUserResponse>;
}

export async function deleteManagedUserAccount(userId: string) {
  const response = await apiRequest("DELETE", `/api/admin/users/${encodeURIComponent(userId)}`);
  return response.json() as Promise<ManagedAccountDeleteResponse>;
}

export async function updateManagedUserRole(userId: string, role: "admin" | "user") {
  const response = await apiRequest(
    "PATCH",
    `/api/admin/users/${encodeURIComponent(userId)}/role`,
    { role },
  );
  return response.json() as Promise<AuthUserForceLogoutResponse>;
}

export async function updateManagedUserStatus(
  userId: string,
  payload: {
    status?: "pending_activation" | "active" | "suspended" | "disabled";
    isBanned?: boolean;
  },
) {
  const response = await apiRequest(
    "PATCH",
    `/api/admin/users/${encodeURIComponent(userId)}/status`,
    payload,
  );
  return response.json() as Promise<AuthUserForceLogoutResponse>;
}

export async function resetManagedUserPassword(userId: string) {
  const response = await apiRequest(
    "POST",
    `/api/admin/users/${encodeURIComponent(userId)}/reset-password`,
  );
  return response.json() as Promise<ManagedAccountPasswordResetResponse>;
}

export async function resendManagedUserActivation(userId: string) {
  const response = await apiRequest(
    "POST",
    `/api/admin/users/${encodeURIComponent(userId)}/resend-activation`,
  );
  return response.json() as Promise<ManagedAccountActivationResponse>;
}

export async function getPendingPasswordResetRequests(
  query?: PendingPasswordResetRequestsQuery,
  options?: RequestOptions,
): Promise<PendingPasswordResetRequestsResponse> {
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

export async function getDevMailOutboxPreviews(
  query?: DevMailOutboxPreviewsQuery,
  options?: RequestOptions,
): Promise<DevMailOutboxPreviewsResponse> {
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
  const response = await apiRequest(
    "DELETE",
    `/api/admin/dev-mail-outbox/${encodeURIComponent(previewId)}`,
  );
  return response.json() as Promise<DevMailOutboxDeleteResponse>;
}

export async function clearDevMailOutboxPreviews() {
  const response = await apiRequest("DELETE", "/api/admin/dev-mail-outbox");
  return response.json() as Promise<DevMailOutboxClearResponse>;
}
