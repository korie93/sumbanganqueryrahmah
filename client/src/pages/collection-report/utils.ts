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
import { safeJsonParseResult } from "@/lib/utils/safe-json";
import type { CollectionSubPage } from "@/pages/collection-report/types";

export function hasLetterAndNumber(value: string) {
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

export function getSubPageFromPath(pathname: string): CollectionSubPage {
  const normalized = pathname.toLowerCase();
  if (normalized.startsWith("/collection/nicknames")) return "manage-nicknames";
  if (normalized.startsWith("/collection/nickname-summary")) return "nickname-summary";
  if (normalized.startsWith("/collection/daily")) return "daily";
  if (normalized.startsWith("/collection/billing-principal")) return "billing-principal";
  if (normalized.startsWith("/collection/monthly-comparison")) return "monthly-comparison";
  if (normalized.startsWith("/collection/summary")) return "summary";
  if (normalized.startsWith("/collection/records")) return "records";
  return "save";
}

export function getPathForSubPage(subPage: CollectionSubPage) {
  if (subPage === "manage-nicknames") return "/collection/nicknames";
  if (subPage === "nickname-summary") return "/collection/nickname-summary";
  if (subPage === "daily") return "/collection/daily";
  if (subPage === "billing-principal") return "/collection/billing-principal";
  if (subPage === "monthly-comparison") return "/collection/monthly-comparison";
  if (subPage === "summary") return "/collection/summary";
  return subPage === "records" ? "/collection/records" : "/collection/save";
}

export function isValidNicknameAuthSession(raw: string, username: string, role: string, nickname: string) {
  const parsed = safeJsonParseResult<Record<string, unknown>>(raw || "{}", {
    maxDepth: 4,
    maxRawLength: 2_048,
  });
  if (!parsed.ok) {
    return false;
  }

  const savedNickname = String(parsed.data.nickname || "").trim().toLowerCase();
  const savedUsername = String(parsed.data.username || "").trim().toLowerCase();
  const savedRole = String(parsed.data.role || "").trim().toLowerCase();

  if (!savedNickname || !savedUsername || !savedRole) return false;
  if (!username || !nickname) return false;

  return savedNickname === nickname.toLowerCase() && savedUsername === username && savedRole === role;
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
