import jwt, { type SignOptions } from "jsonwebtoken";
import { runtimeConfig } from "../config/runtime";

export const SESSION_JWT_ALGORITHM = "HS256" as const;
export const SESSION_JWT_NON_PRODUCTION_EXPIRY = "24h";
export const SESSION_JWT_PRODUCTION_EXPIRY = "8h";
export const SESSION_JWT_DEFAULT_EXPIRY = resolveSessionJwtExpiry(runtimeConfig.app.isProduction);

type SessionJwtVerificationOptions = {
  clockToleranceSeconds?: number;
};

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
  return jwt.sign(payload, runtimeConfig.auth.sessionSecret, {
    algorithm: SESSION_JWT_ALGORITHM,
    expiresIn: SESSION_JWT_DEFAULT_EXPIRY,
    ...options,
  });
}

export function resolveSessionJwtExpiry(isProduction: boolean) {
  return isProduction ? SESSION_JWT_PRODUCTION_EXPIRY : SESSION_JWT_NON_PRODUCTION_EXPIRY;
}

export function verifyJwtWithAnySecret<TPayload>(
  token: string,
  secrets: string | readonly string[],
  options?: SessionJwtVerificationOptions,
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
        ...(options?.clockToleranceSeconds && options.clockToleranceSeconds > 0
          ? { clockTolerance: options.clockToleranceSeconds }
          : {}),
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
  options?: SessionJwtVerificationOptions,
): TPayload {
  const candidates = normalizeVerificationSecrets(secrets);
  return verifyJwtWithAnySecret<TPayload>(
    token,
    candidates.length > 0 ? candidates : getSessionJwtVerificationSecrets(),
    options,
  );
}
