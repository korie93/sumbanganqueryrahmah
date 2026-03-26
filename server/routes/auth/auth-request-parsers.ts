import { z } from "zod";
import { parseRequestBody } from "../../http/validation";

const nullableString = z.union([z.string(), z.null(), z.undefined()]);
const optionalString = z.union([z.string(), z.undefined()]);

const loginBodySchema = z.object({
  username: z.string().default(""),
  password: z.string().default(""),
  fingerprint: nullableString.transform((value) => (typeof value === "string" ? value : null)),
  pcName: nullableString.transform((value) => (typeof value === "string" ? value : null)),
  browser: nullableString.transform((value) => (typeof value === "string" ? value : null)),
});

const activationBodySchema = z.object({
  username: optionalString.transform((value) => (typeof value === "string" ? value : undefined)),
  token: z.string().default(""),
  newPassword: z.string().default(""),
  confirmPassword: z.string().default(""),
});

const tokenBodySchema = z.object({
  token: z.string().default(""),
});

const passwordResetRequestBodySchema = z.object({
  identifier: optionalString,
  username: optionalString,
  email: optionalString,
});

const passwordChangeBodySchema = z.object({
  currentPassword: z.string().default(""),
  newPassword: z.string().default(""),
});

const twoFactorChallengeBodySchema = z.object({
  challengeToken: z.string().default(""),
  code: z.string().default(""),
});

const twoFactorSetupBodySchema = z.object({
  currentPassword: z.string().default(""),
});

const twoFactorCodeBodySchema = z.object({
  code: z.string().default(""),
});

const twoFactorDisableBodySchema = z.object({
  currentPassword: z.string().default(""),
  code: z.string().default(""),
});

const ownCredentialPatchBodySchema = z.object({
  newUsername: optionalString,
  currentPassword: optionalString,
  newPassword: optionalString,
}).passthrough();

const managedUserBodySchema = z.object({
  username: z.string().default(""),
  fullName: nullableString.transform((value) => (typeof value === "string" ? value : null)),
  email: nullableString.transform((value) => (typeof value === "string" ? value : null)),
  role: z.string().default("user"),
});

const managedUserPatchBodySchema = z.object({
  username: optionalString,
  fullName: nullableString,
  email: nullableString,
});

const managedUserRoleBodySchema = z.object({
  role: z.string().default(""),
});

const managedUserStatusBodySchema = z.object({
  status: optionalString,
  isBanned: z.union([z.boolean(), z.undefined()]),
});

const managedCredentialsBodySchema = z.object({
  newPassword: z.string().default(""),
  newUsername: optionalString,
});

export function readLoginBody(bodyRaw: unknown) {
  return parseRequestBody(loginBodySchema, bodyRaw);
}

export function readActivationBody(bodyRaw: unknown) {
  const body = parseRequestBody(activationBodySchema, bodyRaw);
  return {
    username: body.username,
    token: body.token,
    newPassword: body.newPassword,
    confirmPassword: body.confirmPassword,
  };
}

export function readTokenBody(bodyRaw: unknown) {
  return parseRequestBody(tokenBodySchema, bodyRaw);
}

export function readPasswordResetRequestBody(bodyRaw: unknown) {
  const body = parseRequestBody(passwordResetRequestBodySchema, bodyRaw);
  return {
    identifier: String(body.identifier ?? body.username ?? body.email ?? ""),
  };
}

export function readPasswordChangeBody(bodyRaw: unknown) {
  return parseRequestBody(passwordChangeBodySchema, bodyRaw);
}

export function readTwoFactorChallengeBody(bodyRaw: unknown) {
  return parseRequestBody(twoFactorChallengeBodySchema, bodyRaw);
}

export function readTwoFactorSetupBody(bodyRaw: unknown) {
  return parseRequestBody(twoFactorSetupBodySchema, bodyRaw);
}

export function readTwoFactorCodeBody(bodyRaw: unknown) {
  return parseRequestBody(twoFactorCodeBodySchema, bodyRaw);
}

export function readTwoFactorDisableBody(bodyRaw: unknown) {
  return parseRequestBody(twoFactorDisableBodySchema, bodyRaw);
}

export function readOwnCredentialPatchBody(bodyRaw: unknown) {
  const body = parseRequestBody(ownCredentialPatchBodySchema, bodyRaw);
  return {
    body,
    hasUsernameField: Object.prototype.hasOwnProperty.call(body, "newUsername"),
    hasPasswordField:
      Object.prototype.hasOwnProperty.call(body, "newPassword")
      || Object.prototype.hasOwnProperty.call(body, "currentPassword"),
    newUsername: body.newUsername !== undefined ? String(body.newUsername ?? "") : undefined,
    currentPassword: String(body.currentPassword ?? ""),
    newPassword: String(body.newPassword ?? ""),
  };
}

export function readManagedUserBody(bodyRaw: unknown) {
  return parseRequestBody(managedUserBodySchema, bodyRaw);
}

export function readManagedUserPatchBody(bodyRaw: unknown) {
  const body = parseRequestBody(managedUserPatchBodySchema, bodyRaw);
  return {
    username: body.username !== undefined ? String(body.username) : undefined,
    fullName: body.fullName !== undefined ? String(body.fullName ?? "") : undefined,
    email: body.email !== undefined ? String(body.email ?? "") : undefined,
  };
}

export function readManagedUserRoleBody(bodyRaw: unknown) {
  return parseRequestBody(managedUserRoleBodySchema, bodyRaw);
}

export function readManagedUserStatusBody(bodyRaw: unknown) {
  const body = parseRequestBody(managedUserStatusBodySchema, bodyRaw);
  return {
    status: body.status !== undefined ? String(body.status) : undefined,
    isBanned: body.isBanned,
  };
}

export function readManagedCredentialsBody(bodyRaw: unknown) {
  return parseRequestBody(managedCredentialsBodySchema, bodyRaw);
}
