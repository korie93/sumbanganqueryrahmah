import { getCollectionNicknameTempPassword } from "../config/security";

export const COLLECTION_BATCHES = new Set(["P10", "P25", "MDD02", "MDD10", "MDD18", "MDD25"]);
export const COLLECTION_STAFF_NICKNAME_MIN_LENGTH = 2;
export const COLLECTION_SUMMARY_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
export const COLLECTION_NICKNAME_TEMP_PASSWORD = getCollectionNicknameTempPassword();

const COLLECTION_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const COLLECTION_PHONE_REGEX = /^[0-9+\-\s]{8,20}$/;
const COLLECTION_NICKNAME_ROLE_SCOPE_SET = new Set(["admin", "user", "both"]);

export type CollectionReceiptPayload = {
  fileName?: string;
  mimeType?: string;
  contentBase64?: string;
};

export type CollectionCreatePayload = {
  customerName?: string;
  icNumber?: string;
  customerPhone?: string;
  accountNumber?: string;
  batch?: string;
  paymentDate?: string;
  amount?: number | string;
  collectionStaffNickname?: string;
  receipt?: CollectionReceiptPayload | null;
  receipts?: CollectionReceiptPayload[] | null;
};

export type CollectionUpdatePayload = Partial<CollectionCreatePayload> & {
  removeReceipt?: boolean;
  removeReceiptIds?: unknown;
};

export type CollectionNicknamePayload = {
  nickname?: string;
  isActive?: boolean;
  roleScope?: "admin" | "user" | "both" | string;
};

export type CollectionNicknameAssignmentPayload = {
  nicknameIds?: unknown;
};

export type CollectionAdminGroupPayload = {
  leaderNicknameId?: unknown;
  memberNicknameIds?: unknown;
};

export type CollectionNicknameAuthPayload = {
  nickname?: string;
  password?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

export type CollectionBatchValue = "P10" | "P25" | "MDD02" | "MDD10" | "MDD18" | "MDD25";

export function ensureLooseObject(value: unknown): Record<string, any> | null {
  if (value && typeof value === "object") {
    return value as Record<string, any>;
  }
  return null;
}

export function normalizeCollectionText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeCollectionStringList(values: unknown[]): string[] {
  return values
    .map((value) => normalizeCollectionText(value))
    .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
}

export function normalizeCollectionNicknameRoleScope(
  value: unknown,
  fallback: "admin" | "user" | "both" = "both",
): "admin" | "user" | "both" {
  const normalized = normalizeCollectionText(value).toLowerCase();
  if (COLLECTION_NICKNAME_ROLE_SCOPE_SET.has(normalized)) {
    return normalized as "admin" | "user" | "both";
  }
  return fallback;
}

export function isNicknameScopeAllowedForRole(scope: "admin" | "user" | "both", role: string): boolean {
  if (role === "superuser") return true;
  if (role === "admin") return scope === "admin" || scope === "both";
  if (role === "user") return scope === "user" || scope === "both";
  return false;
}

export function isValidCollectionDate(value: string): boolean {
  if (!COLLECTION_DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime());
}

export function parseCollectionAmount(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return null;
  return Math.round(num * 100) / 100;
}

export function isValidCollectionPhone(value: string): boolean {
  const normalized = String(value || "").trim();
  if (normalized.length < 8 || normalized.length > 20) return false;
  return COLLECTION_PHONE_REGEX.test(normalized);
}
