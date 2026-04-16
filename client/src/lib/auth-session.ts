import type { User } from "@/app/types";
import {
  getBrowserSessionStorage,
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
import { createClientRandomId } from "@/lib/secure-id";
import {
  clearLegacyAuthLocalStorage,
  clearLegacyAuthLocalStorageValue,
} from "@/lib/legacy-auth-storage";

const AUTH_SESSION_HINT_COOKIE_NAME = "sqr_auth_hint";
const AUTH_NOTICE_STORAGE_KEY = "auth_notice";
const FORCE_LOGOUT_EVENT_NAME = "force-logout";
const FORCE_LOGOUT_BROADCAST_CHANNEL_NAME = "sqr-auth-force-logout";
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

type ForcedLogoutListener = (payload: ForcedLogoutPayload) => void;

function canUseAuthStorage() {
  return typeof window !== "undefined"
    && typeof sessionStorage !== "undefined";
}

function getAuthSessionStorage() {
  return canUseAuthStorage() ? getBrowserSessionStorage() : null;
}

function clearAuthSessionStorageKeys(
  storage: Storage | null,
  preservedKey?: AuthSessionStorageKey | typeof AUTH_NOTICE_STORAGE_KEY,
) {
  for (const key of AUTH_SESSION_STORAGE_KEYS) {
    if (key === preservedKey) {
      continue;
    }
    safeRemoveStorageItem(storage, key);
  }

  if (preservedKey !== AUTH_NOTICE_STORAGE_KEY) {
    safeRemoveStorageItem(storage, AUTH_NOTICE_STORAGE_KEY);
  }
}

function readAuthSessionValue(key: AuthSessionStorageKey): string | null {
  const storage = getAuthSessionStorage();
  const sessionValue = safeGetStorageItem(storage, key);
  if (sessionValue !== null) {
    clearLegacyAuthLocalStorageValue(key);
    return sessionValue;
  }

  clearLegacyAuthLocalStorageValue(key);
  return null;
}

function writeAuthSessionValue(key: AuthSessionStorageKey, value: string) {
  const storage = getAuthSessionStorage();
  if (!storage) {
    return;
  }

  if (
    safeSetStorageItem(storage, key, value, {
      onQuotaExceeded: () => {
        clearAuthSessionStorageKeys(storage, key);
      },
    })
  ) {
    clearLegacyAuthLocalStorageValue(key);
  }
}

function removeAuthSessionValue(key: AuthSessionStorageKey) {
  safeRemoveStorageItem(getAuthSessionStorage(), key);
  clearLegacyAuthLocalStorageValue(key);
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
  const storage = getAuthSessionStorage();
  if (!storage) {
    return;
  }

  const normalized = normalizeAuthNoticeMessage(message);
  if (!normalized) {
    safeRemoveStorageItem(storage, AUTH_NOTICE_STORAGE_KEY);
    return;
  }

  safeSetStorageItem(
    storage,
    AUTH_NOTICE_STORAGE_KEY,
    JSON.stringify({
      message: normalized,
    }),
    {
      onQuotaExceeded: () => {
        clearAuthSessionStorageKeys(storage, AUTH_NOTICE_STORAGE_KEY);
      },
    },
  );
}

export function consumeStoredAuthNotice(): string {
  const storage = getAuthSessionStorage();
  if (!storage) {
    return "";
  }

  const raw = safeGetStorageItem(storage, AUTH_NOTICE_STORAGE_KEY);
  safeRemoveStorageItem(storage, AUTH_NOTICE_STORAGE_KEY);
  return parseAuthNoticePayload(raw);
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

function normalizeForcedLogoutPayload(raw: unknown): ForcedLogoutPayload | null {
  if (typeof raw === "string" || raw === null || raw === undefined) {
    return parseForcedLogoutStorageValue(raw);
  }

  if (typeof raw !== "object") {
    return null;
  }

  const parsed = raw as {
    message?: unknown;
    nonce?: unknown;
  };

  const message = normalizeAuthNoticeMessage(
    typeof parsed.message === "string" ? parsed.message : "",
  );
  const nonce = typeof parsed.nonce === "string" ? parsed.nonce.trim() : "";

  return {
    ...(message ? { message } : {}),
    ...(nonce ? { nonce } : {}),
  };
}

function createForcedLogoutPayload(message?: string | null | undefined): ForcedLogoutPayload {
  const normalizedMessage = normalizeAuthNoticeMessage(message);
  return normalizedMessage
    ? {
      message: normalizedMessage,
      nonce: createClientRandomId("force-logout"),
    }
    : {};
}

function createForceLogoutBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel !== "function") {
    return null;
  }

  try {
    return new BroadcastChannel(FORCE_LOGOUT_BROADCAST_CHANNEL_NAME);
  } catch {
    return null;
  }
}

export function broadcastForcedLogoutToOtherTabs(message?: string | null | undefined) {
  const payload = createForcedLogoutPayload(message);
  const channel = createForceLogoutBroadcastChannel();
  if (!channel) {
    return;
  }

  try {
    channel.postMessage(payload);
  } catch {
    // Ignore cross-tab broadcast channel failures.
  } finally {
    channel.close();
  }
}

export function broadcastForcedLogout(message?: string | null | undefined) {
  const payload = createForcedLogoutPayload(message);
  broadcastForcedLogoutToOtherTabs(payload.message);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(FORCE_LOGOUT_EVENT_NAME, {
        detail: Object.keys(payload).length > 0 ? payload : undefined,
      }),
    );
  }
}

export function subscribeForcedLogout(listener: ForcedLogoutListener) {
  const handleForcedLogoutEvent = (event: Event) => {
    const payload = normalizeForcedLogoutPayload(
      (event as CustomEvent<ForcedLogoutPayload | undefined>).detail,
    );
    if (payload) {
      listener(payload);
    }
  };

  let channel: BroadcastChannel | null = null;
  const handleChannelMessage = (event: MessageEvent<unknown>) => {
    const payload = normalizeForcedLogoutPayload(event.data);
    if (payload) {
      listener(payload);
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener(FORCE_LOGOUT_EVENT_NAME, handleForcedLogoutEvent);
  }

  channel = createForceLogoutBroadcastChannel();
  if (channel) {
    channel.addEventListener("message", handleChannelMessage);
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener(FORCE_LOGOUT_EVENT_NAME, handleForcedLogoutEvent);
    }
    if (channel) {
      channel.removeEventListener("message", handleChannelMessage);
      channel.close();
    }
  };
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
  const storage = getAuthSessionStorage();
  for (const key of AUTH_SESSION_STORAGE_KEYS) {
    removeAuthSessionValue(key);
  }
  safeRemoveStorageItem(storage, AUTH_NOTICE_STORAGE_KEY);
  clearLegacyAuthLocalStorage();
  safeRemoveStorageItem(storage, "collection_staff_nickname");
  safeRemoveStorageItem(storage, "collection_staff_nickname_auth");
}
