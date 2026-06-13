import { z } from "zod";
import { parseRequestBody } from "../../http/validation";

function nullableBoundedString(max: number) {
  return z.union([z.string().max(max), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" ? value.trim() || null : null));
}
const optionalString = z.union([z.string(), z.undefined()]);

const loginBodySchema = z.object({
  username: z.string().default(""),
  password: z.string().default(""),
  fingerprint: nullableBoundedString(512),
  pcName: nullableBoundedString(128),
  browser: nullableBoundedString(1024),
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

const twoFactorChallengeBodySchema = z.object({
  challengeToken: z.string().default(""),
  code: z.string().default(""),
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

export function readTwoFactorChallengeBody(bodyRaw: unknown) {
  return parseRequestBody(twoFactorChallengeBodySchema, bodyRaw);
}
