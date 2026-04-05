import { z } from "zod";
import { parseRequestBody } from "../../http/validation";

const nullableString = z.union([z.string(), z.null(), z.undefined()]);
const optionalString = z.union([z.string(), z.undefined()]);

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
