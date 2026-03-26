import jwt, { type SignOptions } from "jsonwebtoken";
import { runtimeConfig } from "../config/runtime";

export const SESSION_JWT_ALGORITHM = "HS256" as const;
export const SESSION_JWT_DEFAULT_EXPIRY = "24h";

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
    ...options,
  });
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
