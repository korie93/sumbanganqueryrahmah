import { AUTH_SESSION_TTL_SECONDS as AUTH_SESSION_TTL_SECONDS_VALUE } from "../../shared/auth-session-expiry";

export {
  AUTH_SESSION_MAX_AGE_MS,
  AUTH_SESSION_TTL_SECONDS,
  calculateSessionExpiry,
  isSessionExpired,
  normalizeSessionExpiry,
} from "../../shared/auth-session-expiry";

export const SESSION_JWT_DEFAULT_EXPIRY = AUTH_SESSION_TTL_SECONDS_VALUE;
