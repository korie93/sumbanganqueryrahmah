import {
  COLLECTION_STAFF_NICKNAME_AUTH_KEY,
  COLLECTION_STAFF_NICKNAME_KEY,
} from "@/pages/collection/utils";
import {
  getBrowserSessionStorage,
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
import type { CollectionSubPage } from "@/pages/collection-report/types";

export function hasLetterAndNumber(value: string) {
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

export function getSubPageFromPath(pathname: string): CollectionSubPage {
  const normalized = pathname.toLowerCase();
  if (normalized.startsWith("/collection/nicknames")) return "manage-nicknames";
  if (normalized.startsWith("/collection/nickname-summary")) return "nickname-summary";
  if (normalized.startsWith("/collection/daily")) return "daily";
  if (normalized.startsWith("/collection/summary")) return "summary";
  if (normalized.startsWith("/collection/records")) return "records";
  return "save";
}

export function getPathForSubPage(subPage: CollectionSubPage) {
  if (subPage === "manage-nicknames") return "/collection/nicknames";
  if (subPage === "nickname-summary") return "/collection/nickname-summary";
  if (subPage === "daily") return "/collection/daily";
  if (subPage === "summary") return "/collection/summary";
  return subPage === "records" ? "/collection/records" : "/collection/save";
}

export function isValidNicknameAuthSession(raw: string, username: string, role: string, nickname: string) {
  try {
    const parsed = JSON.parse(raw || "{}");
    const savedNickname = String(parsed?.nickname || "").trim().toLowerCase();
    const savedUsername = String(parsed?.username || "").trim().toLowerCase();
    const savedRole = String(parsed?.role || "").trim().toLowerCase();

    if (!savedNickname || !savedUsername || !savedRole) return false;
    if (!username || !nickname) return false;

    return savedNickname === nickname.toLowerCase() && savedUsername === username && savedRole === role;
  } catch {
    return false;
  }
}

export function getStoredCollectionNickname() {
  return String(
    safeGetStorageItem(getBrowserSessionStorage(), COLLECTION_STAFF_NICKNAME_KEY) || "",
  ).trim();
}

export function getStoredCollectionNicknameAuthRaw() {
  return String(
    safeGetStorageItem(getBrowserSessionStorage(), COLLECTION_STAFF_NICKNAME_AUTH_KEY) || "",
  );
}

export function persistCollectionNicknameSessionStorage(input: {
  nickname: string;
  username: string;
  role: string;
  verifiedAt?: number;
}) {
  const storage = getBrowserSessionStorage();
  const normalizedNickname = String(input.nickname || "").trim();
  if (!storage || !normalizedNickname) {
    return;
  }

  safeSetStorageItem(storage, COLLECTION_STAFF_NICKNAME_KEY, normalizedNickname);
  safeSetStorageItem(
    storage,
    COLLECTION_STAFF_NICKNAME_AUTH_KEY,
    JSON.stringify({
      nickname: normalizedNickname,
      username: input.username,
      role: input.role,
      verifiedAt: input.verifiedAt ?? Date.now(),
    }),
  );
}

export function clearCollectionNicknameSessionStorage() {
  const storage = getBrowserSessionStorage();
  safeRemoveStorageItem(storage, COLLECTION_STAFF_NICKNAME_KEY);
  safeRemoveStorageItem(storage, COLLECTION_STAFF_NICKNAME_AUTH_KEY);
}
