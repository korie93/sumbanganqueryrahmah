import { apiRequest } from "../api-client";
import { z } from "zod";
import { parseApiJson } from "./contract";
import type {
  CollectionAdminGroup,
  CollectionAdminUser,
} from "./collection-types";

type CollectionAdminsResponse = {
  ok: boolean;
  admins: CollectionAdminUser[];
};

type CollectionNicknameAssignmentsResponse = {
  ok: boolean;
  admin: CollectionAdminUser;
  nicknameIds: string[];
};

type CollectionNicknameAssignmentsSaveResponse = {
  ok: boolean;
  adminId: string;
  nicknameIds: string[];
};

type CollectionAdminGroupsResponse = {
  ok: boolean;
  groups: CollectionAdminGroup[];
};

type CollectionAdminGroupMutationResponse = {
  ok: boolean;
  group: CollectionAdminGroup;
};

type CollectionAdminGroupDeleteResponse = {
  ok: boolean;
};

const nonEmptyStringSchema = z.string().min(1);
const nullableStringSchema = z.string().nullable();
const collectionNicknameRoleScopeSchema = z.enum(["admin", "user", "both"]);

const collectionAdminUserSchema: z.ZodType<CollectionAdminUser> = z.object({
  id: nonEmptyStringSchema,
  username: nonEmptyStringSchema,
  role: z.literal("admin"),
  isBanned: z.boolean().nullable(),
  createdAt: nonEmptyStringSchema,
  updatedAt: nonEmptyStringSchema,
});

const collectionAdminGroupSchema: z.ZodType<CollectionAdminGroup> = z.object({
  id: nonEmptyStringSchema,
  leaderNickname: nonEmptyStringSchema,
  leaderNicknameId: z.string().nullable(),
  leaderIsActive: z.boolean(),
  leaderRoleScope: collectionNicknameRoleScopeSchema.nullable(),
  memberNicknames: z.array(nonEmptyStringSchema),
  memberNicknameIds: z.array(nonEmptyStringSchema),
  createdBy: nullableStringSchema,
  createdAt: nonEmptyStringSchema,
  updatedAt: nonEmptyStringSchema,
});

const collectionAdminsResponseSchema: z.ZodType<CollectionAdminsResponse> = z.object({
  ok: z.boolean(),
  admins: z.array(collectionAdminUserSchema),
});

const collectionNicknameAssignmentsResponseSchema: z.ZodType<CollectionNicknameAssignmentsResponse> = z.object({
  ok: z.boolean(),
  admin: collectionAdminUserSchema,
  nicknameIds: z.array(nonEmptyStringSchema),
});

const collectionNicknameAssignmentsSaveResponseSchema: z.ZodType<CollectionNicknameAssignmentsSaveResponse> = z.object({
  ok: z.boolean(),
  adminId: nonEmptyStringSchema,
  nicknameIds: z.array(nonEmptyStringSchema),
});

const collectionAdminGroupsResponseSchema: z.ZodType<CollectionAdminGroupsResponse> = z.object({
  ok: z.boolean(),
  groups: z.array(collectionAdminGroupSchema),
});

const collectionAdminGroupMutationResponseSchema: z.ZodType<CollectionAdminGroupMutationResponse> = z.object({
  ok: z.boolean(),
  group: collectionAdminGroupSchema,
});

const collectionAdminGroupDeleteResponseSchema: z.ZodType<CollectionAdminGroupDeleteResponse> = z.object({
  ok: z.boolean(),
});

export async function getCollectionAdmins() {
  const response = await apiRequest("GET", "/api/collection/admins");
  return parseApiJson(response, collectionAdminsResponseSchema, "/api/collection/admins");
}

export async function getCollectionNicknameAssignments(adminId: string) {
  const response = await apiRequest("GET", `/api/collection/nickname-assignments/${encodeURIComponent(adminId)}`);
  return parseApiJson(
    response,
    collectionNicknameAssignmentsResponseSchema,
    "/api/collection/nickname-assignments/:adminId",
  );
}

export async function saveCollectionNicknameAssignments(adminId: string, nicknameIds: string[]) {
  const response = await apiRequest("PUT", `/api/collection/nickname-assignments/${encodeURIComponent(adminId)}`, {
    nicknameIds,
  });
  return parseApiJson(
    response,
    collectionNicknameAssignmentsSaveResponseSchema,
    "/api/collection/nickname-assignments/:adminId",
  );
}

export async function getCollectionAdminGroups() {
  const response = await apiRequest("GET", "/api/collection/admin-groups");
  return parseApiJson(response, collectionAdminGroupsResponseSchema, "/api/collection/admin-groups");
}

export async function createCollectionAdminGroup(payload: {
  leaderNicknameId: string;
  memberNicknameIds?: string[];
}) {
  const response = await apiRequest("POST", "/api/collection/admin-groups", payload);
  return parseApiJson(response, collectionAdminGroupMutationResponseSchema, "/api/collection/admin-groups");
}

export async function updateCollectionAdminGroup(
  groupId: string,
  payload: {
    leaderNicknameId?: string;
    memberNicknameIds?: string[];
  },
) {
  const response = await apiRequest("PUT", `/api/collection/admin-groups/${encodeURIComponent(groupId)}`, payload);
  return parseApiJson(response, collectionAdminGroupMutationResponseSchema, "/api/collection/admin-groups/:groupId");
}

export async function deleteCollectionAdminGroup(groupId: string) {
  const response = await apiRequest("DELETE", `/api/collection/admin-groups/${encodeURIComponent(groupId)}`);
  return parseApiJson(response, collectionAdminGroupDeleteResponseSchema, "/api/collection/admin-groups/:groupId");
}
