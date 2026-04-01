import { apiRequest } from "../api-client";
import type {
  CollectionAdminGroup,
  CollectionAdminUser,
} from "./collection-types";

export async function getCollectionAdmins() {
  const response = await apiRequest("GET", "/api/collection/admins");
  return response.json() as Promise<{ ok: boolean; admins: CollectionAdminUser[] }>;
}

export async function getCollectionNicknameAssignments(adminId: string) {
  const response = await apiRequest("GET", `/api/collection/nickname-assignments/${encodeURIComponent(adminId)}`);
  return response.json() as Promise<{ ok: boolean; admin: CollectionAdminUser; nicknameIds: string[] }>;
}

export async function saveCollectionNicknameAssignments(adminId: string, nicknameIds: string[]) {
  const response = await apiRequest("PUT", `/api/collection/nickname-assignments/${encodeURIComponent(adminId)}`, {
    nicknameIds,
  });
  return response.json() as Promise<{ ok: boolean; adminId: string; nicknameIds: string[] }>;
}

export async function getCollectionAdminGroups() {
  const response = await apiRequest("GET", "/api/collection/admin-groups");
  return response.json() as Promise<{ ok: boolean; groups: CollectionAdminGroup[] }>;
}

export async function createCollectionAdminGroup(payload: {
  leaderNicknameId: string;
  memberNicknameIds?: string[];
}) {
  const response = await apiRequest("POST", "/api/collection/admin-groups", payload);
  return response.json() as Promise<{ ok: boolean; group: CollectionAdminGroup }>;
}

export async function updateCollectionAdminGroup(
  groupId: string,
  payload: {
    leaderNicknameId?: string;
    memberNicknameIds?: string[];
  },
) {
  const response = await apiRequest("PUT", `/api/collection/admin-groups/${encodeURIComponent(groupId)}`, payload);
  return response.json() as Promise<{ ok: boolean; group: CollectionAdminGroup }>;
}

export async function deleteCollectionAdminGroup(groupId: string) {
  const response = await apiRequest("DELETE", `/api/collection/admin-groups/${encodeURIComponent(groupId)}`);
  return response.json() as Promise<{ ok: boolean }>;
}
