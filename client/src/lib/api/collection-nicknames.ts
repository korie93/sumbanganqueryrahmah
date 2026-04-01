import { apiRequest } from "../api-client";
import type {
  CollectionNicknameAuthCheckResult,
  CollectionStaffNickname,
} from "./collection-types";

type CollectionNicknameRequestOptions = {
  signal?: AbortSignal;
};

export async function getCollectionNicknames(
  filters?: { includeInactive?: boolean },
  options?: CollectionNicknameRequestOptions,
) {
  const params = new URLSearchParams();
  if (filters?.includeInactive) {
    params.set("includeInactive", "1");
  }
  const query = params.toString();
  const response = await apiRequest(
    "GET",
    query ? `/api/collection/nicknames?${query}` : "/api/collection/nicknames",
    undefined,
    options,
  );
  return response.json() as Promise<{ ok: boolean; nicknames: CollectionStaffNickname[] }>;
}

export async function checkCollectionNicknameAuth(nickname: string) {
  const response = await apiRequest("POST", "/api/collection/nickname-auth/check", { nickname });
  return response.json() as Promise<CollectionNicknameAuthCheckResult>;
}

export async function setupCollectionNicknamePassword(payload: {
  nickname: string;
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const response = await apiRequest("POST", "/api/collection/nickname-auth/setup-password", payload);
  return response.json() as Promise<{
    ok: boolean;
    nickname: {
      id: string;
      nickname: string;
      mustChangePassword: boolean;
      passwordResetBySuperuser: boolean;
    };
  }>;
}

export async function loginCollectionNickname(payload: { nickname: string; password: string }) {
  const response = await apiRequest("POST", "/api/collection/nickname-auth/login", payload);
  return response.json() as Promise<{
    ok: boolean;
    nickname: {
      id: string;
      nickname: string;
      mustChangePassword: boolean;
      passwordResetBySuperuser: boolean;
      requiresForcedPasswordChange: boolean;
    };
  }>;
}

export async function createCollectionNickname(payload: { nickname: string; roleScope?: "admin" | "user" | "both" }) {
  const response = await apiRequest("POST", "/api/collection/nicknames", payload);
  return response.json() as Promise<{ ok: boolean; nickname: CollectionStaffNickname }>;
}

export async function updateCollectionNickname(id: string, payload: { nickname: string; roleScope?: "admin" | "user" | "both" }) {
  const response = await apiRequest("PUT", `/api/collection/nicknames/${encodeURIComponent(id)}`, payload);
  return response.json() as Promise<{ ok: boolean; nickname: CollectionStaffNickname }>;
}

export async function setCollectionNicknameStatus(id: string, isActive: boolean) {
  const response = await apiRequest("PATCH", `/api/collection/nicknames/${encodeURIComponent(id)}`, { isActive });
  return response.json() as Promise<{ ok: boolean; nickname: CollectionStaffNickname }>;
}

export async function deleteCollectionNickname(id: string) {
  const response = await apiRequest("DELETE", `/api/collection/nicknames/${encodeURIComponent(id)}`);
  return response.json() as Promise<{ ok: boolean; deleted: boolean; deactivated: boolean }>;
}

export async function resetCollectionNicknamePassword(id: string) {
  const response = await apiRequest("POST", `/api/collection/nicknames/${encodeURIComponent(id)}/reset-password`);
  return response.json() as Promise<{
    ok: boolean;
    temporaryPassword: string;
    nickname: {
      id: string;
      nickname: string;
      mustChangePassword: boolean;
      passwordResetBySuperuser: boolean;
    };
  }>;
}
