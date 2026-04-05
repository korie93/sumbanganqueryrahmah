import { z } from "zod";
import { parseRequestBody } from "../../http/validation";

const optionalString = z.union([z.string(), z.undefined()]);

const passwordChangeBodySchema = z.object({
  currentPassword: z.string().default(""),
  newPassword: z.string().default(""),
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

export function readPasswordChangeBody(bodyRaw: unknown) {
  return parseRequestBody(passwordChangeBodySchema, bodyRaw);
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
