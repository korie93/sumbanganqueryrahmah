import { getAuthErrorCode } from "@/lib/auth-flow-feedback";
import { safeJsonParseResult } from "@/lib/utils/safe-json";

const terminalCodes = new Set([
  "INVALID_TOKEN", "TOKEN_EXPIRED", "TOKEN_USED", "TOKEN_SUPERSEDED",
  "RESET_TOKEN_INVALID", "RESET_TOKEN_EXPIRED", "RESET_TOKEN_USED", "RESET_TOKEN_SUPERSEDED",
  "ACCOUNT_UNAVAILABLE",
]);

export function getResetTokenRecoveryAction(error: unknown): "sign-in" | "request-link" | null {
  const code = getAuthErrorCode(error);
  if (!terminalCodes.has(code ?? "")) return null;
  return code === "TOKEN_USED" || code === "RESET_TOKEN_USED" ? "sign-in" : "request-link";
}

/** A failed request cannot establish that a reset token is invalid. */
export function getResetTokenValidationFailure(error: unknown): {
  retryable: boolean;
  rateLimited: boolean;
  retryAfterMs: number;
} {
  const details = error && typeof error === "object"
    ? error as { message?: unknown; status?: unknown; retryAfterMs?: unknown }
    : {};
  const message = typeof details.message === "string" ? details.message : "";
  const statusMatch = /^(\d{3}):\s*/.exec(message);
  const status = typeof details.status === "number" ? details.status : Number(statusMatch?.[1]);
  const parsed = safeJsonParseResult<{ retryAfterMs?: unknown; error?: { retryAfterMs?: unknown } }>(
    message.replace(/^\d{3}:\s*/, ""), { maxRawLength: 64_000, maxDepth: 12 },
  );
  const retryAfter = details.retryAfterMs
    ?? (parsed.ok ? parsed.data?.retryAfterMs ?? parsed.data?.error?.retryAfterMs : undefined);
  const code = getAuthErrorCode(error);
  const rateLimited = status === 429 || code === "AUTH_RATE_LIMITED";
  const retryable = !terminalCodes.has(code ?? "")
    && !(status >= 400 && status < 500 && status !== 408 && status !== 429);
  return {
    retryable,
    rateLimited: retryable && rateLimited,
    retryAfterMs: retryable && rateLimited
      ? typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(Math.ceil(retryAfter), 2_147_483_647) : 60_000
      : 0,
  };
}
