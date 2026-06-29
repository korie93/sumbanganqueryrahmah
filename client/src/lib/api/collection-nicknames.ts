import { apiRequest } from "../api-client";
import { z } from "zod";
import { parseApiJson } from "./contract";
import type {
  CollectionNicknameAuthCheckResult,
  CollectionStaffNickname,
} from "./collection-types";

type CollectionNicknameRequestOptions = {
  signal?: AbortSignal | undefined;
};

type CollectionNicknamesResponse = {
  ok: boolean;
  nicknames: CollectionStaffNickname[];
};

type CollectionNicknamePasswordResponse = {
  ok: boolean;
  nickname: {
    id: string;
    nickname: string;
    mustChangePassword: boolean;
    passwordResetBySuperuser: boolean;
  };
};

type CollectionNicknameLoginResponse = {
  ok: boolean;
  nickname: CollectionNicknamePasswordResponse["nickname"] & {
    requiresForcedPasswordChange: boolean;
  };
};

type CollectionNicknameMutationResponse = {
  ok: boolean;
  nickname: CollectionStaffNickname;
};

type CollectionNicknameDeleteResponse = {
  ok: boolean;
  deleted: boolean;
  deactivated: boolean;
};

type CollectionNicknameResetPasswordResponse = CollectionNicknamePasswordResponse & {
  temporaryPassword: string;
};

const collectionNicknameRoleScopeSchema = z.enum(["admin", "user", "both"]);
const nonEmptyStringSchema = z.string().min(1);

const collectionStaffNicknameSchema: z.ZodType<CollectionStaffNickname> = z.object({
  id: nonEmptyStringSchema,
  nickname: nonEmptyStringSchema,
  isActive: z.boolean(),
  roleScope: collectionNicknameRoleScopeSchema,
  createdBy: z.string().nullable(),
  createdAt: nonEmptyStringSchema,
});

const collectionNicknamePasswordProfileObjectSchema = z.object({
  id: nonEmptyStringSchema,
  nickname: nonEmptyStringSchema,
  mustChangePassword: z.boolean(),
  passwordResetBySuperuser: z.boolean(),
});

const collectionNicknamePasswordProfileSchema: z.ZodType<CollectionNicknamePasswordResponse["nickname"]> =
  collectionNicknamePasswordProfileObjectSchema;

const collectionNicknameAuthCheckProfileSchema: z.ZodType<CollectionNicknameAuthCheckResult["nickname"]> =
  collectionNicknamePasswordProfileObjectSchema.extend({
    requiresPasswordSetup: z.boolean(),
    requiresPasswordLogin: z.boolean(),
    requiresForcedPasswordChange: z.boolean(),
  });

const collectionNicknamesResponseSchema: z.ZodType<CollectionNicknamesResponse> = z.object({
  ok: z.boolean(),
  nicknames: z.array(collectionStaffNicknameSchema),
});

const collectionNicknameAuthCheckResponseSchema: z.ZodType<CollectionNicknameAuthCheckResult> = z.object({
  ok: z.boolean(),
  nickname: collectionNicknameAuthCheckProfileSchema,
});

const collectionNicknamePasswordResponseSchema: z.ZodType<CollectionNicknamePasswordResponse> = z.object({
  ok: z.boolean(),
  nickname: collectionNicknamePasswordProfileSchema,
});

const collectionNicknameLoginResponseSchema: z.ZodType<CollectionNicknameLoginResponse> = z.object({
  ok: z.boolean(),
  nickname: collectionNicknamePasswordProfileObjectSchema.extend({
    requiresForcedPasswordChange: z.boolean(),
  }),
});

const collectionNicknameMutationResponseSchema: z.ZodType<CollectionNicknameMutationResponse> = z.object({
  ok: z.boolean(),
  nickname: collectionStaffNicknameSchema,
});

const collectionNicknameDeleteResponseSchema: z.ZodType<CollectionNicknameDeleteResponse> = z.object({
  ok: z.boolean(),
  deleted: z.boolean(),
  deactivated: z.boolean(),
});

const collectionNicknameResetPasswordResponseSchema: z.ZodType<CollectionNicknameResetPasswordResponse> = z.object({
  ok: z.boolean(),
  temporaryPassword: nonEmptyStringSchema,
  nickname: collectionNicknamePasswordProfileSchema,
});

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
  return parseApiJson(response, collectionNicknamesResponseSchema, "/api/collection/nicknames");
}

export async function checkCollectionNicknameAuth(nickname: string) {
  const response = await apiRequest("POST", "/api/collection/nickname-auth/check", { nickname });
  return parseApiJson(response, collectionNicknameAuthCheckResponseSchema, "/api/collection/nickname-auth/check");
}

export async function setupCollectionNicknamePassword(payload: {
  nickname: string;
  currentPassword?: string | undefined;
  newPassword: string;
  confirmPassword: string;
}) {
  const response = await apiRequest("POST", "/api/collection/nickname-auth/setup-password", payload);
  return parseApiJson(
    response,
    collectionNicknamePasswordResponseSchema,
    "/api/collection/nickname-auth/setup-password",
  );
}

export async function loginCollectionNickname(payload: { nickname: string; password: string }) {
  const response = await apiRequest("POST", "/api/collection/nickname-auth/login", payload);
  return parseApiJson(response, collectionNicknameLoginResponseSchema, "/api/collection/nickname-auth/login");
}

export async function createCollectionNickname(payload: { nickname: string; roleScope?: "admin" | "user" | "both" }) {
  const response = await apiRequest("POST", "/api/collection/nicknames", payload);
  return parseApiJson(response, collectionNicknameMutationResponseSchema, "/api/collection/nicknames");
}

export async function updateCollectionNickname(id: string, payload: { nickname: string; roleScope?: "admin" | "user" | "both" }) {
  const response = await apiRequest("PUT", `/api/collection/nicknames/${encodeURIComponent(id)}`, payload);
  return parseApiJson(response, collectionNicknameMutationResponseSchema, "/api/collection/nicknames/:id");
}

export async function setCollectionNicknameStatus(id: string, isActive: boolean) {
  const response = await apiRequest("PATCH", `/api/collection/nicknames/${encodeURIComponent(id)}`, { isActive });
  return parseApiJson(response, collectionNicknameMutationResponseSchema, "/api/collection/nicknames/:id");
}

export async function deleteCollectionNickname(id: string) {
  const response = await apiRequest("DELETE", `/api/collection/nicknames/${encodeURIComponent(id)}`);
  return parseApiJson(response, collectionNicknameDeleteResponseSchema, "/api/collection/nicknames/:id");
}

export async function resetCollectionNicknamePassword(id: string) {
  const response = await apiRequest("POST", `/api/collection/nicknames/${encodeURIComponent(id)}/reset-password`);
  return parseApiJson(
    response,
    collectionNicknameResetPasswordResponseSchema,
    "/api/collection/nicknames/:id/reset-password",
  );
}
