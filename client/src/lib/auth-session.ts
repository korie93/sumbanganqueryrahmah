import type { User } from "@/app/types";
import { LEGACY_AUTH_LOCAL_STORAGE_KEYS } from "@/app/constants";
import {
  clearLegacyAuthLocalStorage,
  clearLegacyAuthLocalStorageValue,
} from "@/lib/legacy-auth-storage";
import {
  calculateSessionExpiry,
  isSessionExpired,
  normalizeSessionExpiry,
} from "@shared/auth-session-expiry";
export {
  calculateSessionExpiry,
  isSessionExpired,
  normalizeSessionExpiry,
} from "@shared/auth-session-expiry";
export {
  broadcastForcedLogout,
  broadcastForcedLogoutToOtherTabs,
  parseForcedLogoutStorageValue,
  subscribeForcedLogout,
} from "@/lib/auth-forced-logout";

const AUTH_SESSION_HINT_COOKIE_NAME = "sqr_auth_hint";
const AUTH_NOTICE_STORAGE_KEY = "auth_notice";
const AUTH_SESSION_STORED_AT_KEY = "sessionStoredAt";
const AUTH_SESSION_EXPIRES_AT_KEY = "sessionExpiresAt";
const AUTH_SESSION_STORAGE_KEYS = [
  "activityId",
  "banned",
  "fingerprint",
  "forcePasswordChange",
  "role",
  AUTH_SESSION_EXPIRES_AT_KEY,
  AUTH_SESSION_STORED_AT_KEY,
  "user",
  "username",
] as const;

type AuthSessionStorageKey = (typeof AUTH_SESSION_STORAGE_KEYS)[number];
type LegacyAuthLocalStorageKey = (typeof LEGACY_AUTH_LOCAL_STORAGE_KEYS)[number];
type LegacyCompatAuthSessionStorageKey = Extract<AuthSessionStorageKey, LegacyAuthLocalStorageKey>;

type PersistAuthenticatedUserOptions = {
  sessionExpiresAt?: string | number | Date | null | undefined;
};

function canUseAuthStorage() {
  return typeof window !== "undefined"
    && typeof sessionStorage !== "undefined";
}

function isLegacyAuthLocalStorageKey(key: AuthSessionStorageKey): key is LegacyCompatAuthSessionStorageKey {
  return (LEGACY_AUTH_LOCAL_STORAGE_KEYS as readonly string[]).includes(key);
}

function clearLegacyAuthSessionValue(key: AuthSessionStorageKey) {
  if (isLegacyAuthLocalStorageKey(key)) {
    clearLegacyAuthLocalStorageValue(key);
  }
}

function readAuthSessionValue(key: AuthSessionStorageKey): string | null {
  if (!canUseAuthStorage()) {
    return null;
  }

  try {
    const sessionValue = sessionStorage.getItem(key);
    if (sessionValue !== null) {
      return sessionValue;
    }

    clearLegacyAuthSessionValue(key);
  } catch {
    return null;
  }

  return null;
}

function writeAuthSessionValue(key: AuthSessionStorageKey, value: string) {
  if (!canUseAuthStorage()) {
    return;
  }

  try {
    sessionStorage.setItem(key, value);
    clearLegacyAuthSessionValue(key);
  } catch {
    // Ignore storage access failures and fall back to the active in-memory session.
  }
}

function removeAuthSessionValue(key: AuthSessionStorageKey) {
  if (!canUseAuthStorage()) {
    return;
  }

  try {
    sessionStorage.removeItem(key);
    clearLegacyAuthSessionValue(key);
  } catch {
    // Ignore storage access failures during best-effort cleanup.
  }
}

function clearAuthSessionHintCookie() {
  if (typeof document === "undefined") return;

  document.cookie = `${AUTH_SESSION_HINT_COOKIE_NAME}=; Max-Age=0; path=/; SameSite=Lax`;
}

function readAuthSessionTimestamp(key: typeof AUTH_SESSION_STORED_AT_KEY | typeof AUTH_SESSION_EXPIRES_AT_KEY): number | null {
  const raw = readAuthSessionValue(key);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    removeAuthSessionValue(key);
    return null;
  }

  return value;
}

function resolveAuthSessionExpiry(
  explicitExpiry: PersistAuthenticatedUserOptions["sessionExpiresAt"],
  nowMs = Date.now(),
): number {
  const normalizedExplicit = normalizeSessionExpiry(explicitExpiry, { nowMs });
  if (normalizedExplicit) {
    return normalizedExplicit.expiresAtMs;
  }

  const storedExpiry = normalizeSessionExpiry(
    readAuthSessionTimestamp(AUTH_SESSION_EXPIRES_AT_KEY),
    { nowMs },
  );
  if (storedExpiry) {
    return storedExpiry.expiresAtMs;
  }

  return calculateSessionExpiry(nowMs).expiresAtMs;
}

function writeAuthSessionMetadata(
  options: PersistAuthenticatedUserOptions = {},
  nowMs = Date.now(),
) {
  const expiresAtMs = resolveAuthSessionExpiry(options.sessionExpiresAt, nowMs);
  writeAuthSessionValue(AUTH_SESSION_STORED_AT_KEY, String(nowMs));
  writeAuthSessionValue(AUTH_SESSION_EXPIRES_AT_KEY, String(expiresAtMs));
}

function isStoredAuthSessionExpired(nowMs = Date.now()): boolean {
  const expiresAt = readAuthSessionTimestamp(AUTH_SESSION_EXPIRES_AT_KEY);
  if (expiresAt !== null) {
    return isSessionExpired(expiresAt, nowMs);
  }

  const storedAt = readAuthSessionTimestamp(AUTH_SESSION_STORED_AT_KEY);
  if (storedAt === null) {
    return false;
  }

  return isSessionExpired(calculateSessionExpiry(storedAt).expiresAtMs, nowMs);
}

function clearStoredAuthSessionValues() {
  for (const key of AUTH_SESSION_STORAGE_KEYS) {
    removeAuthSessionValue(key);
  }
}

function normalizeAuthNoticeMessage(message: string | null | undefined): string {
  return String(message || "").trim();
}

function parseAuthNoticePayload(raw: string | null | undefined): string {
  const normalized = String(raw || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    const parsed = JSON.parse(normalized) as { message?: unknown };
    return normalizeAuthNoticeMessage(typeof parsed?.message === "string" ? parsed.message : "");
  } catch {
    return normalized;
  }
}

export function persistAuthNotice(message: string | null | undefined) {
  if (!canUseAuthStorage()) {
    return;
  }

  const normalized = normalizeAuthNoticeMessage(message);
  if (!normalized) {
    try {
      sessionStorage.removeItem(AUTH_NOTICE_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
    return;
  }

  try {
    sessionStorage.setItem(
      AUTH_NOTICE_STORAGE_KEY,
      JSON.stringify({
        message: normalized,
      }),
    );
  } catch {
    // Ignore storage write failures during best-effort notice persistence.
  }
}

export function consumeStoredAuthNotice(): string {
  if (!canUseAuthStorage()) {
    return "";
  }

  try {
    const raw = sessionStorage.getItem(AUTH_NOTICE_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_NOTICE_STORAGE_KEY);
    return parseAuthNoticePayload(raw);
  } catch {
    return "";
  }
}

export function hasAuthSessionHintCookie() {
  if (typeof document === "undefined") return false;

  const cookiePrefix = `${AUTH_SESSION_HINT_COOKIE_NAME}=`;
  return document.cookie.split(";").some((part) => part.trim().startsWith(cookiePrefix));
}

export function getStoredAuthenticatedUser(): User | null {
  if (isStoredAuthSessionExpired()) {
    clearStoredAuthSessionValues();
    return null;
  }

  const raw = readAuthSessionValue("user");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as User;
    if (!parsed?.username || !parsed?.role) {
      throw new Error("Invalid cached user");
    }
    if (readAuthSessionTimestamp(AUTH_SESSION_STORED_AT_KEY) === null) {
      writeAuthSessionMetadata();
    }
    return parsed;
  } catch {
    clearStoredAuthSessionValues();
    return null;
  }
}

export function getStoredUsername(): string {
  const cachedUser = getStoredAuthenticatedUser();
  if (cachedUser?.username) {
    return String(cachedUser.username).trim();
  }

  return String(readAuthSessionValue("username") || "").trim();
}

export function getStoredRole(): string {
  const cachedUser = getStoredAuthenticatedUser();
  if (cachedUser?.role) {
    return String(cachedUser.role).trim();
  }

  return String(readAuthSessionValue("role") || "").trim();
}

export function getStoredForcePasswordChange(): boolean {
  return readAuthSessionValue("forcePasswordChange") === "1";
}

export function setStoredForcePasswordChange(required: boolean) {
  if (required) {
    writeAuthSessionValue("forcePasswordChange", "1");
    return;
  }

  removeAuthSessionValue("forcePasswordChange");
}

export function getStoredActivityId(): string {
  return String(readAuthSessionValue("activityId") || "").trim();
}

export function setStoredActivityId(activityId: string | null | undefined) {
  const normalized = String(activityId || "").trim();
  if (!normalized) {
    removeAuthSessionValue("activityId");
    return;
  }

  writeAuthSessionValue("activityId", normalized);
}

export function getStoredFingerprint(): string {
  return String(readAuthSessionValue("fingerprint") || "").trim();
}

export function setStoredFingerprint(fingerprint: string | null | undefined) {
  const normalized = String(fingerprint || "").trim();
  if (!normalized) {
    removeAuthSessionValue("fingerprint");
    return;
  }

  writeAuthSessionValue("fingerprint", normalized);
}

export function isBannedSessionFlagSet(): boolean {
  return readAuthSessionValue("banned") === "1";
}

export function setBannedSessionFlag(isBanned: boolean) {
  if (isBanned) {
    writeAuthSessionValue("banned", "1");
    return;
  }

  removeAuthSessionValue("banned");
}

export function persistAuthenticatedUser(
  user: User,
  options: PersistAuthenticatedUserOptions = {},
) {
  writeAuthSessionMetadata({
    sessionExpiresAt: options.sessionExpiresAt ?? user.sessionExpiresAt,
  });
  writeAuthSessionValue("username", String(user.username || "").trim());
  writeAuthSessionValue("role", String(user.role || "").trim());
  writeAuthSessionValue("user", JSON.stringify(user));
  setStoredForcePasswordChange(Boolean(user.mustChangePassword));
}

export function clearAuthenticatedUserStorage() {
  clearAuthSessionHintCookie();
  clearStoredAuthSessionValues();
  clearLegacyAuthLocalStorage();
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem("collection_staff_nickname");
      sessionStorage.removeItem("collection_staff_nickname_auth");
    } catch {
      // Ignore storage cleanup failures.
    }
  }
}
