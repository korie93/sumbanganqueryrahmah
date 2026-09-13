import type { Request } from "express";
import { getOpaqueTokenHashCandidates } from "../auth/passwords";
import { verifySessionJwt } from "../auth/session-jwt";
import type { PostgresStorage } from "../storage-postgres";

export type AuthRecoveryRateLimitStorage = Pick<PostgresStorage,
  "getActivationTokenRecordByHash" | "getPasswordResetTokenRecordByHash">;

export const ACCOUNT_RECOVERY_TOKEN_PATHS = new Set([
  "/api/auth/activate-account",
  "/api/auth/validate-activation-token",
  "/api/auth/validate-password-reset-token",
  "/api/auth/reset-password-with-token",
]);

export const SUBJECT_GUARDED_PUBLIC_AUTH_PATHS = new Set([
  ...ACCOUNT_RECOVERY_TOKEN_PATHS,
  "/api/auth/request-password-reset",
  "/api/auth/verify-two-factor-login",
]);

export function canonicalAuthRateLimitPath(req: Request): string {
  return req.path.toLowerCase().replace(/\/$/, "");
}

function readBoundedBodyString(req: Request, field: string, maxLength: number): string | null {
  const raw = req.body && typeof req.body === "object" ? req.body[field] : undefined;
  return typeof raw === "string" && raw.trim() && raw.length <= maxLength ? raw.trim() : null;
}

// Rate-limit identity only: this does not authenticate a request or consume a
// challenge. The route still verifies current account state and the actual OTP.
export function resolveTwoFactorRateLimitAccount(req: Request): string | null {
  const token = readBoundedBodyString(req, "challengeToken", 8_192);
  if (!token) return null;
  try {
    const claims = verifySessionJwt<{ purpose?: unknown; userId?: unknown; exp?: number }>(token);
    return claims.purpose === "two_factor_login"
      && typeof claims.userId === "string" && claims.userId.length > 0 && claims.userId.length <= 200
      && Number.isSafeInteger(claims.exp)
      ? claims.userId : null;
  } catch {
    // Invalid/expired/wrong-purpose tokens share the strict unverified-network
    // bucket. Rotating arbitrary tokens or ignored username hints cannot reset it.
    return null;
  }
}

export async function resolveRecoveryRateLimitAccount(
  req: Request,
  storage?: AuthRecoveryRateLimitStorage,
): Promise<string | null> {
  const path = canonicalAuthRateLimitPath(req);
  if (!storage || !ACCOUNT_RECOVERY_TOKEN_PATHS.has(path)) return null;
  const token = readBoundedBodyString(req, "token", 1_024);
  if (!token) return null;
  const activation = path === "/api/auth/activate-account" || path === "/api/auth/validate-activation-token";
  for (const hash of getOpaqueTokenHashCandidates(token)) {
    const record = activation
      ? await storage.getActivationTokenRecordByHash(hash)
      : await storage.getPasswordResetTokenRecordByHash(hash);
    // Even used/expired records bind safely to their account for admission;
    // token validity/lifecycle and safe error messages remain the route's job.
    if (record && typeof record.userId === "string" && record.userId) return record.userId;
  }
  return null;
}
