import type { User } from "@/app/types";
import { createClientRandomId } from "@/lib/secure-id";

const AUTH_SESSION_HINT_COOKIE_NAME = "sqr_auth_hint";
const AUTH_NOTICE_STORAGE_KEY = "auth_notice";
const FORCE_LOGOUT_STORAGE_KEY = "forceLogout";
const AUTH_SESSION_STORAGE_KEYS = [
  "activityId",
  "banned",
  "fingerprint",
  "forcePasswordChange",
  "role",
  "user",
  "username",
] as const;

type AuthSessionStorageKey = (typeof AUTH_SESSION_STORAGE_KEYS)[number];

type ForcedLogoutPayload = {
  message?: string;
  nonce?: string;
};

function canUseAuthStorage() {
  return typeof window !== "undefined"
    && typeof sessionStorage !== "undefined";
}

function removeLegacyAuthSessionValue(key: AuthSessionStorageKey) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage access failures during best-effort legacy cleanup.
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

    removeLegacyAuthSessionValue(key);
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
    removeLegacyAuthSessionValue(key);
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
    removeLegacyAuthSessionValue(key);
  } catch {
    // Ignore storage access failures during best-effort cleanup.
  }
}

function clearAuthSessionHintCookie() {
  if (typeof document === "undefined") return;

  document.cookie = `${AUTH_SESSION_HINT_COOKIE_NAME}=; Max-Age=0; path=/; SameSite=Lax`;
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

export function parseForcedLogoutStorageValue(raw: string | null | undefined): ForcedLogoutPayload | null {
  const normalized = String(raw || "").trim();
  if (!normalized) {
    return null;
  }

  if (normalized === "true") {
    return {};
  }

  try {
    const parsed = JSON.parse(normalized) as ForcedLogoutPayload;
    return {
      message: normalizeAuthNoticeMessage(parsed?.message),
    };
  } catch {
    return {};
  }
}

export function broadcastForcedLogout(message?: string | null | undefined) {
  const normalizedMessage = normalizeAuthNoticeMessage(message);
  const payload = normalizedMessage
    ? JSON.stringify({
      message: normalizedMessage,
      nonce: createClientRandomId("force-logout"),
    })
    : "true";

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(FORCE_LOGOUT_STORAGE_KEY, payload);
    } catch {
      // Ignore cross-tab broadcast storage failures.
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("force-logout", {
        detail: normalizedMessage ? { message: normalizedMessage } : undefined,
      }),
    );
  }
}

export function hasAuthSessionHintCookie() {
  if (typeof document === "undefined") return false;

  const cookiePrefix = `${AUTH_SESSION_HINT_COOKIE_NAME}=`;
  return document.cookie.split(";").some((part) => part.trim().startsWith(cookiePrefix));
}

export function getStoredAuthenticatedUser(): User | null {
  const raw = readAuthSessionValue("user");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as User;
    if (!parsed?.username || !parsed?.role) {
      throw new Error("Invalid cached user");
    }
    return parsed;
  } catch {
    removeAuthSessionValue("user");
    removeAuthSessionValue("username");
    removeAuthSessionValue("role");
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

export function persistAuthenticatedUser(user: User) {
  writeAuthSessionValue("username", String(user.username || "").trim());
  writeAuthSessionValue("role", String(user.role || "").trim());
  writeAuthSessionValue("user", JSON.stringify(user));
  setStoredForcePasswordChange(Boolean(user.mustChangePassword));
}

export function clearAuthenticatedUserStorage() {
  clearAuthSessionHintCookie();
  for (const key of AUTH_SESSION_STORAGE_KEYS) {
    removeAuthSessionValue(key);
  }
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("activeTab");
      localStorage.removeItem("lastPage");
      localStorage.removeItem("selectedImportId");
      localStorage.removeItem("selectedImportName");
    } catch {
      // Ignore storage cleanup failures.
    }
  }
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem("collection_staff_nickname");
      sessionStorage.removeItem("collection_staff_nickname_auth");
    } catch {
      // Ignore storage cleanup failures.
    }
  }
}
