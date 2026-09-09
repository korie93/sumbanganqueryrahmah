import type { Request, RequestHandler } from "express";
import { getSessionSecret } from "../config/security";
import { AUTH_SESSION_COOKIE_NAME, readCookieValueFromHeader } from "./session-cookie";
import { verifySessionJwt } from "./session-jwt";
import {
  parseAuthenticatedSessionJwtPayload,
  type AuthenticatedSessionJwtPayload,
} from "./session-jwt-payload";

type SessionTokenSource = "bearer" | "cookie";
type VerifiedRequestSession = {
  token: string;
  secret: string;
} & ({ decoded: Readonly<AuthenticatedSessionJwtPayload> } | { error: unknown });

// Request lifetime only: never a session-validity cache. This stores cryptographic
// verification, not authorization, account state, or the result of revocation.
const verifiedRequestSessions = new WeakMap<Request, VerifiedRequestSession>();

export function readRequestSessionToken(req: Request): {
  source: SessionTokenSource | null;
  token: string | null;
} {
  const authorization = req.headers.authorization;
  const rawAuthorization = String(Array.isArray(authorization) ? authorization[0] || "" : authorization || "").trim();
  if (rawAuthorization.toLowerCase().startsWith("bearer ")) {
    const token = rawAuthorization.slice(7).trim();
    if (token) return { source: "bearer", token };
  }
  const token = readCookieValueFromHeader(req.headers.cookie, AUTH_SESSION_COOKIE_NAME);
  return token ? { source: "cookie", token } : { source: null, token: null };
}

function isUnexpired(decoded: Readonly<AuthenticatedSessionJwtPayload>): boolean {
  // A request can wait on Redis after pre-verification. Do not extend JWT expiry
  // while reusing its verified claims at the later authoritative route guard.
  return decoded.exp === undefined || decoded.exp > Math.floor(Date.now() / 1_000);
}

export function verifyRequestSessionIdentity(
  req: Request,
  token: string,
  secret: string,
): Readonly<AuthenticatedSessionJwtPayload> {
  const cached = verifiedRequestSessions.get(req);
  if (cached?.token === token && cached.secret === secret) {
    if ("error" in cached) throw cached.error;
    if (isUnexpired(cached.decoded)) return cached.decoded;
  }

  verifiedRequestSessions.delete(req);
  try {
    const decoded = Object.freeze(parseAuthenticatedSessionJwtPayload(verifySessionJwt<unknown>(token, secret)));
    verifiedRequestSessions.set(req, { token, secret, decoded });
    return decoded;
  } catch (error) {
    verifiedRequestSessions.set(req, { token, secret, error });
    throw error;
  }
}

/** A signed quota subject only. Never use this value to authorize access. */
export function getRateLimitIdentity(req: Request): string | null {
  const cached = verifiedRequestSessions.get(req);
  if (!cached || "error" in cached || readRequestSessionToken(req).token !== cached.token || !isUnexpired(cached.decoded)) {
    return null;
  }
  return cached.decoded.userId;
}

export function createRateLimitIdentityMiddleware(options: { secret?: string } = {}): RequestHandler {
  const secret = options.secret || getSessionSecret();
  return (req, _res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    const { token } = readRequestSessionToken(req);
    if (token) {
      try {
        verifyRequestSessionIdentity(req, token, secret);
      } catch {
        // Malformed/forged/expired sessions retain the strict anonymous quota.
        // Route auth still owns its original 401/cookie/error response behavior.
      }
    }
    // Never populate req.user here: live revocation, account, activity, forced
    // password change, and role checks remain mandatory at the existing guard.
    return next();
  };
}
