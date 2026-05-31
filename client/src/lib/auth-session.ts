import type { User } from "@/app/types";
import { z } from "zod";
import { LEGACY_AUTH_LOCAL_STORAGE_KEYS } from "@/app/constants";
import {
  clearLegacyAuthLocalStorage,
  clearLegacyAuthLocalStorageValue,
} from "@/lib/legacy-auth-storage";
import {
  getBrowserSessionStorage,
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
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

const authSessionUserSchema = z.object({
  id: z.string().optional(),
  username: z.string().trim().min(1),
  role: z.string().trim().min(1),
  fullName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  status: z.string().optional(),
  mustChangePassword: z.boolean().optional(),
  passwordResetBySuperuser: z.boolean().optional(),
  isBanned: z.boolean().nullable().optional(),
  twoFactorEnabled: z.boolean().optional(),
  twoFactorPendingSetup: z.boolean().optional(),
  twoFactorConfiguredAt: z.string().nullable().optional(),
  sessionExpiresAt: z.string().nullable().optional(),
}).strict();

type AuthSessionStorageKey = (typeof AUTH_SESSION_STORAGE_KEYS)[number];
type LegacyAuthLocalStorageKey = (typeof LEGACY_AUTH_LOCAL_STORAGE_KEYS)[number];
type LegacyCompatAuthSessionStorageKey = Extract<AuthSessionStorageKey, LegacyAuthLocalStorageKey>;

type PersistAuthenticatedUserOptions = {
  sessionExpiresAt?: string | number | Date | null | undefined;
};

function sanitizeAuthenticatedUserForStorage(user: User): User {
  const candidate = {
    id: user.id,
    username: String(user.username || "").trim(),
    role: String(user.role || "").trim(),
    fullName: user.fullName ?? null,
    email: user.email ?? null,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    passwordResetBySuperuser: user.passwordResetBySuperuser,
    isBanned: user.isBanned,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorPendingSetup: user.twoFactorPendingSetup,
    twoFactorConfiguredAt: user.twoFactorConfiguredAt ?? null,
    sessionExpiresAt: user.sessionExpiresAt ?? null,
  };
  const parsed = authSessionUserSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  return {
    username: candidate.username || "unknown",
    role: candidate.role || "user",
  };
}

function canUseAuthStorage() {
  return typeof window !== "undefined"
    && getBrowserSessionStorage() !== null;
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

  const sessionValue = safeGetStorageItem(getBrowserSessionStorage(), key);
  if (sessionValue !== null) {
    return sessionValue;
  }

  clearLegacyAuthSessionValue(key);
  return null;
}

function writeAuthSessionValue(key: AuthSessionStorageKey, value: string) {
  if (!canUseAuthStorage()) {
    return;
  }

  if (safeSetStorageItem(getBrowserSessionStorage(), key, value)) {
    clearLegacyAuthSessionValue(key);
  }
}

function removeAuthSessionValue(key: AuthSessionStorageKey) {
  if (!canUseAuthStorage()) {
    return;
  }

  safeRemoveStorageItem(getBrowserSessionStorage(), key);
  clearLegacyAuthSessionValue(key);
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
    safeRemoveStorageItem(getBrowserSessionStorage(), AUTH_NOTICE_STORAGE_KEY);
    return;
  }

  safeSetStorageItem(
    getBrowserSessionStorage(),
    AUTH_NOTICE_STORAGE_KEY,
    JSON.stringify({
      message: normalized,
    }),
  );
}

export function consumeStoredAuthNotice(): string {
  if (!canUseAuthStorage()) {
    return "";
  }

  const storage = getBrowserSessionStorage();
  const raw = safeGetStorageItem(storage, AUTH_NOTICE_STORAGE_KEY);
  safeRemoveStorageItem(storage, AUTH_NOTICE_STORAGE_KEY);
  return parseAuthNoticePayload(raw);
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
    const parsed = authSessionUserSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      throw new Error("Invalid cached user");
    }
    if (readAuthSessionTimestamp(AUTH_SESSION_STORED_AT_KEY) === null) {
      writeAuthSessionMetadata();
    }
    return parsed.data;
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
  const storedUser = sanitizeAuthenticatedUserForStorage(user);
  writeAuthSessionMetadata({
    sessionExpiresAt: options.sessionExpiresAt ?? storedUser.sessionExpiresAt,
  });
  writeAuthSessionValue("username", String(storedUser.username || "").trim());
  writeAuthSessionValue("role", String(storedUser.role || "").trim());
  writeAuthSessionValue("user", JSON.stringify(storedUser));
  setStoredForcePasswordChange(Boolean(storedUser.mustChangePassword));
}

export function clearAuthenticatedUserStorage() {
  clearAuthSessionHintCookie();
  clearStoredAuthSessionValues();
  clearLegacyAuthLocalStorage();
  const storage = getBrowserSessionStorage();
  safeRemoveStorageItem(storage, "collection_staff_nickname");
  safeRemoveStorageItem(storage, "collection_staff_nickname_auth");
}
