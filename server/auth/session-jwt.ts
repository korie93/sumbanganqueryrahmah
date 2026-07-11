import { randomUUID } from "node:crypto";
import jwt, { type Algorithm, type SignOptions } from "jsonwebtoken";
import { runtimeConfig } from "../config/runtime";
import { internalMetrics } from "../internal/metrics";
import { logger } from "../lib/logger";
import { safeJsonParse } from "../lib/safe-json";
import { SESSION_JWT_DEFAULT_EXPIRY as SESSION_JWT_DEFAULT_EXPIRY_VALUE } from "./session-lifetime";

export const SESSION_JWT_ALGORITHM = "RS256" as const;
export const SESSION_JWT_LEGACY_ALGORITHM = "HS256" as const;
export const SESSION_JWT_ALLOWED_ALGORITHMS = [
  SESSION_JWT_ALGORITHM,
  SESSION_JWT_LEGACY_ALGORITHM,
] as const;
export const SESSION_JWT_REFRESH_REMAINING_TTL_RATIO = 0.2;
export const SESSION_JWT_DEFAULT_EXPIRY_JITTER_SECONDS = 15 * 60;
export const SESSION_JWT_MIN_DEFAULT_EXPIRY_SECONDS = Math.max(
  60,
  SESSION_JWT_DEFAULT_EXPIRY_VALUE - SESSION_JWT_DEFAULT_EXPIRY_JITTER_SECONDS,
);
export const SESSION_JWT_HS256_FALLBACK_WARNING =
  "WARNING: JWT using HS256 fallback. DO NOT use in production.";
export const SESSION_JWT_RS256_PRODUCTION_REQUIRED_ERROR =
  "FATAL: SESSION_JWT_PRIVATE_KEY and SESSION_JWT_PUBLIC_KEY are required in production; HS256 fallback is not allowed.";
export const SESSION_JWT_LEGACY_HS256_DISABLED_ERROR =
  "Legacy HS256 session token verification is disabled.";
export const SESSION_JWT_LEGACY_HS256_MAX_MIGRATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
export const SESSION_JWT_LEGACY_HS256_MIGRATION_WARNING =
  "Legacy HS256 session token verification is temporarily enabled during RS256 migration.";
export { SESSION_JWT_DEFAULT_EXPIRY } from "./session-lifetime";

const SESSION_JWT_HEADER_SEGMENT_MAX_LENGTH = 1_024;
const SESSION_JWT_HEADER_MAX_BYTES = 512;

type RefreshableSessionClaims = {
  exp?: number | undefined;
  iat?: number | undefined;
  jti?: string | undefined;
};

type SessionJwtAlgorithm = typeof SESSION_JWT_ALLOWED_ALGORITHMS[number];

type SessionJwtStartupValidationOptions = {
  legacyHs256VerifyUntilMs?: number | null | undefined;
  nodeEnv?: string | null | undefined;
  nowMs?: number | undefined;
  privateKey?: string | null | undefined;
  publicKey?: string | null | undefined;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
};

export type SessionJwtKeySet = {
  hsSecrets: readonly string[];
  legacyHs256VerifyUntilMs?: number | null | undefined;
  rsPrivateKey?: string | null | undefined;
  rsPublicKeys?: readonly string[] | null | undefined;
};

export class JwtAlgorithmError extends Error {
  constructor(message = "JWT uses an unsupported session signing algorithm.") {
    super(message);
    this.name = "JwtAlgorithmError";
  }
}

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

function getRuntimeSessionJwtKeySet(
  hsSecrets: string | readonly string[] | null | undefined = getSessionJwtVerificationSecrets(),
): SessionJwtKeySet {
  return {
    hsSecrets: normalizeVerificationSecrets(hsSecrets),
    legacyHs256VerifyUntilMs: runtimeConfig.auth.sessionJwtLegacyHs256VerifyUntilMs,
    rsPrivateKey: runtimeConfig.auth.sessionJwtPrivateKey,
    rsPublicKeys: runtimeConfig.auth.sessionJwtPublicKey ? [runtimeConfig.auth.sessionJwtPublicKey] : [],
  };
}

function normalizeRsaKey(key: string | null | undefined): string | null {
  const normalized = String(key || "").trim().replace(/\\n/g, "\n");
  return normalized || null;
}

let sessionJwtFallbackWarningEmitted = false;
let sessionJwtLegacyMigrationWarningEmitted = false;

function assertValidSessionJwtRsaKeyPair(privateKey: string, publicKey: string): void {
  try {
    const probeToken = jwt.sign(
      { purpose: "session-jwt-startup-validation" },
      privateKey,
      {
        algorithm: SESSION_JWT_ALGORITHM,
        expiresIn: "1m",
        jwtid: "session-jwt-startup-validation",
      },
    );
    jwt.verify(probeToken, publicKey, {
      algorithms: [SESSION_JWT_ALGORITHM],
    });
  } catch {
    throw new Error(
      "FATAL: SESSION_JWT_PRIVATE_KEY and SESSION_JWT_PUBLIC_KEY must be a valid matching RSA key pair for RS256 session JWTs.",
    );
  }
}

export function resetSessionJwtStartupValidationWarningForTests(): void {
  sessionJwtFallbackWarningEmitted = false;
  sessionJwtLegacyMigrationWarningEmitted = false;
}

function normalizeLegacyHs256VerifyUntilMs(value: number | null | undefined): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0
    ? Math.trunc(normalized)
    : null;
}

function warnSessionJwtLegacyHs256Migration(
  verifyUntilMs: number,
  warn?: SessionJwtStartupValidationOptions["warn"],
): void {
  const metadata = {
    event: "session_jwt_legacy_hs256_migration_active",
    action: "remove_legacy_hs256_deadline_after_session_ttl",
    verifyUntil: new Date(verifyUntilMs).toISOString(),
  };
  if (warn) {
    warn(SESSION_JWT_LEGACY_HS256_MIGRATION_WARNING, metadata);
    return;
  }
  logger.warn(SESSION_JWT_LEGACY_HS256_MIGRATION_WARNING, metadata);
}

function validateLegacyHs256MigrationWindow(
  verifyUntilMs: number | null,
  nowMs: number,
  warn?: SessionJwtStartupValidationOptions["warn"],
): void {
  if (verifyUntilMs === null || verifyUntilMs <= nowMs) {
    return;
  }
  if (verifyUntilMs - nowMs > SESSION_JWT_LEGACY_HS256_MAX_MIGRATION_WINDOW_MS) {
    throw new Error(
      "FATAL: SESSION_JWT_LEGACY_HS256_VERIFY_UNTIL cannot extend more than 7 days beyond startup.",
    );
  }
  if (!sessionJwtLegacyMigrationWarningEmitted) {
    warnSessionJwtLegacyHs256Migration(verifyUntilMs, warn);
    sessionJwtLegacyMigrationWarningEmitted = true;
  }
}

function warnSessionJwtHs256Fallback(warn?: SessionJwtStartupValidationOptions["warn"]): void {
  if (warn) {
    warn(SESSION_JWT_HS256_FALLBACK_WARNING, {
      event: "session_jwt_hs256_fallback",
      mode: "non_production_only",
      action: "warn_only",
    });
    return;
  }

  logger.warn("Session JWT HS256 fallback is active because RS256 keys are not configured", {
    event: "session_jwt_hs256_fallback",
    mode: "non_production_only",
    action: "configure_rs256_keys_before_production",
  });
}

export function validateSessionJwtStartupConfiguration(
  options: SessionJwtStartupValidationOptions = {},
): SessionJwtAlgorithm {
  const nodeEnv = String(options.nodeEnv ?? runtimeConfig.app.nodeEnv)
    .trim()
    .toLowerCase();
  const privateKey = normalizeRsaKey(options.privateKey ?? runtimeConfig.auth.sessionJwtPrivateKey);
  const publicKey = normalizeRsaKey(options.publicKey ?? runtimeConfig.auth.sessionJwtPublicKey);
  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  const legacyHs256VerifyUntilMs = normalizeLegacyHs256VerifyUntilMs(
    options.legacyHs256VerifyUntilMs
      ?? runtimeConfig.auth.sessionJwtLegacyHs256VerifyUntilMs,
  );

  if (privateKey && publicKey) {
    assertValidSessionJwtRsaKeyPair(privateKey, publicKey);
    validateLegacyHs256MigrationWindow(
      legacyHs256VerifyUntilMs,
      nowMs,
      options.warn,
    );
    return SESSION_JWT_ALGORITHM;
  }

  if (privateKey || publicKey) {
    throw new Error(
      "FATAL: SESSION_JWT_PRIVATE_KEY and SESSION_JWT_PUBLIC_KEY must be configured together.",
    );
  }

  if (nodeEnv === "production") {
    throw new Error(SESSION_JWT_RS256_PRODUCTION_REQUIRED_ERROR);
  }

  if (!sessionJwtFallbackWarningEmitted) {
    warnSessionJwtHs256Fallback(options.warn);
    sessionJwtFallbackWarningEmitted = true;
  }

  return SESSION_JWT_LEGACY_ALGORITHM;
}

function normalizeRsaPublicKeys(keys: readonly string[] | null | undefined): string[] {
  return (keys ?? [])
    .map((key) => normalizeRsaKey(key))
    .filter((key): key is string => Boolean(key));
}

function readJwtHeaderAlgorithm(token: string): string | null {
  const [headerSegment] = String(token || "").split(".");
  if (!headerSegment) {
    return null;
  }
  if (headerSegment.length > SESSION_JWT_HEADER_SEGMENT_MAX_LENGTH) {
    return null;
  }

  try {
    const parseResult = safeJsonParse<{
      alg?: unknown;
    }>(
      Buffer.from(headerSegment, "base64url").toString("utf8"),
      "session_jwt_header",
      {
        logFailures: false,
        maxDepth: 2,
        maxObjectKeys: 8,
        maxRawBytes: SESSION_JWT_HEADER_MAX_BYTES,
        maxStringLength: 64,
        maxTotalBytes: SESSION_JWT_HEADER_MAX_BYTES,
      },
    );
    if (!parseResult.success) {
      return null;
    }
    const header = parseResult.data;
    const algorithm = String(header.alg || "").trim();
    return algorithm || null;
  } catch {
    return null;
  }
}

function isSessionJwtAlgorithm(value: string | null): value is SessionJwtAlgorithm {
  return value === SESSION_JWT_ALGORITHM || value === SESSION_JWT_LEGACY_ALGORITHM;
}

export function validateJwtAlgorithm(token: string): SessionJwtAlgorithm {
  const algorithm = readJwtHeaderAlgorithm(token);
  if (algorithm?.toLowerCase() === "none") {
    throw new JwtAlgorithmError("JWT alg=none is not allowed for session tokens.");
  }
  if (!isSessionJwtAlgorithm(algorithm)) {
    throw new JwtAlgorithmError();
  }

  return algorithm;
}

function buildSessionJwtSignOptions(
  payload: object,
  algorithm: SessionJwtAlgorithm,
  options?: Omit<SignOptions, "algorithm">,
): SignOptions {
  const payloadJwtId = String((payload as { jti?: unknown }).jti || "").trim();
  const jwtid = options?.jwtid || (payloadJwtId ? undefined : randomUUID());
  const signOptions: SignOptions = {
    algorithm,
    ...options,
  };
  if (signOptions.expiresIn === undefined) {
    signOptions.expiresIn = resolveSessionJwtDefaultExpiresInSeconds();
  }
  if (jwtid) {
    signOptions.jwtid = jwtid;
  }
  return signOptions;
}

export function resolveSessionJwtDefaultExpiresInSeconds(
  randomSource: () => number = Math.random,
): number {
  const randomValue = randomSource();
  const boundedRandom = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0;
  const jitterSeconds = Math.floor(boundedRandom * SESSION_JWT_DEFAULT_EXPIRY_JITTER_SECONDS);
  return Math.max(
    SESSION_JWT_MIN_DEFAULT_EXPIRY_SECONDS,
    SESSION_JWT_DEFAULT_EXPIRY_VALUE - jitterSeconds,
  );
}

export function signSessionJwt<TPayload extends object>(
  payload: TPayload,
  options?: Omit<SignOptions, "algorithm">,
): string {
  return signSessionJwtWithKeySet(payload, getRuntimeSessionJwtKeySet(), options);
}

export function signSessionJwtWithSecret<TPayload extends object>(
  payload: TPayload,
  secret: string,
  options?: Omit<SignOptions, "algorithm">,
): string {
  return signSessionJwtWithKeySet(payload, getRuntimeSessionJwtKeySet(secret), options);
}

export function signSessionJwtWithKeySet<TPayload extends object>(
  payload: TPayload,
  keySet: SessionJwtKeySet,
  options?: Omit<SignOptions, "algorithm">,
): string {
  const rsaPrivateKey = normalizeRsaKey(keySet.rsPrivateKey);
  if (rsaPrivateKey) {
    return jwt.sign(
      payload,
      rsaPrivateKey,
      buildSessionJwtSignOptions(payload, SESSION_JWT_ALGORITHM, options),
    );
  }

  const [secret] = normalizeVerificationSecrets(keySet.hsSecrets);
  if (!secret) {
    throw new Error("No JWT signing secret is configured.");
  }

  return jwt.sign(
    payload,
    secret,
    buildSessionJwtSignOptions(payload, SESSION_JWT_LEGACY_ALGORITHM, options),
  );
}

export function shouldRefreshSessionJwt(
  claims: RefreshableSessionClaims,
  nowMs = Date.now(),
): boolean {
  const issuedAtSeconds = Number(claims.iat);
  const expiresAtSeconds = Number(claims.exp);
  const jwtId = String(claims.jti || "").trim();

  if (!jwtId || !Number.isFinite(issuedAtSeconds) || !Number.isFinite(expiresAtSeconds)) {
    return false;
  }

  const totalTtlMs = (expiresAtSeconds - issuedAtSeconds) * 1000;
  const remainingTtlMs = (expiresAtSeconds * 1000) - nowMs;
  if (!Number.isFinite(totalTtlMs) || !Number.isFinite(remainingTtlMs) || totalTtlMs <= 0) {
    return false;
  }

  if (remainingTtlMs <= 0) {
    return false;
  }

  return remainingTtlMs / totalTtlMs <= SESSION_JWT_REFRESH_REMAINING_TTL_RATIO;
}

export function resolveSessionJwtExpiresAt(
  token: string,
  secrets?: string | readonly string[] | null,
): Date | null {
  let claims: { exp?: unknown };
  try {
    claims = verifySessionJwt<{ exp?: unknown }>(token, secrets);
  } catch {
    return null;
  }

  const expSeconds = Number(claims.exp);
  if (!Number.isFinite(expSeconds) || expSeconds <= 0) {
    return null;
  }
  const expiresAtMs = expSeconds * 1000;
  return Number.isFinite(expiresAtMs) && expiresAtMs > 0
    ? new Date(expiresAtMs)
    : null;
}

export function resolveSessionJwtId(
  token: string,
  secrets?: string | readonly string[] | null,
): string | null {
  let claims: { jti?: unknown };
  try {
    claims = verifySessionJwt<{ jti?: unknown }>(token, secrets);
  } catch {
    return null;
  }

  const jwtId = String(claims.jti || "").trim();
  return jwtId || null;
}

export function verifyJwtWithAnySecret<TPayload>(
  token: string,
  secrets: string | readonly string[],
): TPayload {
  return verifySessionJwtWithKeySet<TPayload>(token, getRuntimeSessionJwtKeySet(secrets));
}

export function verifySessionJwtWithKeySet<TPayload>(
  token: string,
  keySet: SessionJwtKeySet,
): TPayload {
  const algorithm = validateJwtAlgorithm(token);
  const rsaPublicKeys = normalizeRsaPublicKeys(keySet.rsPublicKeys);
  const legacyHs256VerifyUntilMs = normalizeLegacyHs256VerifyUntilMs(
    keySet.legacyHs256VerifyUntilMs,
  );
  const nowMs = Date.now();
  const isRs256MigrationKeySet = rsaPublicKeys.length > 0;
  const legacyHs256Allowed = !isRs256MigrationKeySet || (
    legacyHs256VerifyUntilMs !== null
    && legacyHs256VerifyUntilMs >= nowMs
    && legacyHs256VerifyUntilMs - nowMs <= SESSION_JWT_LEGACY_HS256_MAX_MIGRATION_WINDOW_MS
  );
  if (algorithm === SESSION_JWT_LEGACY_ALGORITHM && !legacyHs256Allowed) {
    internalMetrics.increment("sessionJwtLegacyHs256RejectionsTotal");
    throw new JwtAlgorithmError(SESSION_JWT_LEGACY_HS256_DISABLED_ERROR);
  }

  const candidates = algorithm === SESSION_JWT_ALGORITHM
    ? rsaPublicKeys
    : normalizeVerificationSecrets(keySet.hsSecrets);

  if (candidates.length === 0) {
    throw new Error(
      algorithm === SESSION_JWT_ALGORITHM
        ? "No JWT public verification keys are configured."
        : "No JWT verification secrets are configured.",
    );
  }

  let lastError: unknown = null;
  for (const key of candidates) {
    try {
      const payload = jwt.verify(token, key, {
        algorithms: [algorithm as Algorithm],
      }) as TPayload;
      if (algorithm === SESSION_JWT_LEGACY_ALGORITHM && isRs256MigrationKeySet) {
        internalMetrics.increment("sessionJwtLegacyHs256VerificationsTotal");
      }
      return payload;
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
  return verifySessionJwtWithKeySet<TPayload>(
    token,
    getRuntimeSessionJwtKeySet(candidates.length > 0 ? candidates : getSessionJwtVerificationSecrets()),
  );
}
