import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { runtimeConfig } from "../config/runtime";
import { SESSION_JWT_DEFAULT_EXPIRY as SESSION_JWT_DEFAULT_EXPIRY_VALUE } from "./session-lifetime";

export const SESSION_JWT_ALGORITHM = "HS256" as const;
export { SESSION_JWT_DEFAULT_EXPIRY } from "./session-lifetime";

function normalizeVerificationSecrets(secrets: string | readonly string[] | null | undefined): string[] {
  if (Array.isArray(secrets)) {
    return secrets.map((value) => String(value || "").trim()).filter(Boolean);
  }

  const normalized = String(secrets || "").trim();
  return normalized ? [normalized] : [];
}

export function getSessionJwtVerificationSecrets(): readonly string[] {
  return [
    runtimeConfig.auth.sessionSecret,
    ...runtimeConfig.auth.previousSessionSecrets,
  ];
}

export function signSessionJwt<TPayload extends object>(
  payload: TPayload,
  options?: Omit<SignOptions, "algorithm">,
): string {
  const payloadJwtId = String((payload as { jti?: unknown }).jti || "").trim();
  const jwtid = options?.jwtid || (payloadJwtId ? undefined : randomUUID());
  const signOptions: SignOptions = {
    algorithm: SESSION_JWT_ALGORITHM,
    expiresIn: SESSION_JWT_DEFAULT_EXPIRY_VALUE,
    ...options,
  };
  if (jwtid) {
    signOptions.jwtid = jwtid;
  }
  return jwt.sign(payload, runtimeConfig.auth.sessionSecret, signOptions);
}

export function resolveSessionJwtExpiresAt(token: string): Date | null {
  const decoded = jwt.decode(token) as { exp?: unknown } | null;
  const expSeconds = Number(decoded?.exp);
  if (!Number.isFinite(expSeconds) || expSeconds <= 0) {
    return null;
  }
  const expiresAtMs = expSeconds * 1000;
  return Number.isFinite(expiresAtMs) && expiresAtMs > 0
    ? new Date(expiresAtMs)
    : null;
}

export function resolveSessionJwtId(token: string): string | null {
  const decoded = jwt.decode(token) as { jti?: unknown } | null;
  const jwtId = String(decoded?.jti || "").trim();
  return jwtId || null;
}

export function verifyJwtWithAnySecret<TPayload>(
  token: string,
  secrets: string | readonly string[],
): TPayload {
  const candidates = normalizeVerificationSecrets(secrets);
  if (candidates.length === 0) {
    throw new Error("No JWT verification secrets are configured.");
  }

  let lastError: unknown = null;
  for (const secret of candidates) {
    try {
      return jwt.verify(token, secret, {
        algorithms: [SESSION_JWT_ALGORITHM],
      }) as TPayload;
    } catch (error) {
      lastError = error;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("JWT verification failed."));
}

export function verifySessionJwt<TPayload>(
  token: string,
  secrets?: string | readonly string[] | null,
): TPayload {
  const candidates = normalizeVerificationSecrets(secrets);
  return verifyJwtWithAnySecret<TPayload>(
    token,
    candidates.length > 0 ? candidates : getSessionJwtVerificationSecrets(),
  );
}
