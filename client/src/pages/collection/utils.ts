import type { CollectionBatch, CollectionReceiptPayload, CollectionRecord } from "@/lib/api";
import {
  getStoredAuthenticatedUser,
  getStoredRole,
  getStoredUsername,
} from "@/lib/auth-session";

export const COLLECTION_BATCH_OPTIONS: CollectionBatch[] = ["P10", "P25", "MDD02", "MDD10", "MDD18", "MDD25"];
export const COLLECTION_ACCEPTED_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf", "image/webp"];
export const COLLECTION_MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const COLLECTION_STAFF_NICKNAME_KEY = "collection_staff_nickname";
export const COLLECTION_STAFF_NICKNAME_AUTH_KEY = "collection_staff_nickname_auth";
export const COLLECTION_DATA_CHANGED_EVENT = "collection:data-changed";
export const COLLECTION_PHONE_REGEX = /^[0-9+\-\s]{8,20}$/;
const COLLECTION_RECEIPT_MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/jfif": "image/jpeg",
  "image/jpe": "image/jpeg",
  "image/x-png": "image/png",
  "application/x-pdf": "application/pdf",
};

export type CollectionApiErrorDetails = {
  status: number | null;
  code: string | null;
  requestId: string | null;
  message: string;
};

export function parseCollectionApiErrorDetails(error: unknown): CollectionApiErrorDetails {
  const raw = error instanceof Error ? error.message : "Request failed";
  const statusMatch = raw.match(/^(\d+):\s*/);
  const fallbackStatus = statusMatch?.[1] ? Number.parseInt(statusMatch[1], 10) : null;
  const jsonPart = raw.replace(/^\d+:\s*/, "");

  try {
    const parsed = JSON.parse(jsonPart);
    const parsedStatus = Number(parsed?.status);
    const status = Number.isFinite(parsedStatus) ? parsedStatus : fallbackStatus;
    const code =
      typeof parsed?.code === "string"
        ? parsed.code
        : typeof parsed?.error?.code === "string"
          ? parsed.error.code
          : null;
    const requestId =
      typeof parsed?.requestId === "string"
        ? parsed.requestId
        : typeof parsed?.error?.requestId === "string"
          ? parsed.error.requestId
          : null;
    return {
      status: Number.isFinite(Number(status)) ? Number(status) : null,
      code,
      requestId,
      message: String(parsed?.message || parsed?.error?.message || raw),
    };
  } catch {
    return {
      status: fallbackStatus,
      code: null,
      requestId: null,
      message: raw,
    };
  }
}

export function parseApiError(error: unknown): string {
  return parseCollectionApiErrorDetails(error).message;
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime());
}

export function getTodayIsoDate(referenceDate = new Date()): string {
  return `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}-${String(referenceDate.getDate()).padStart(2, "0")}`;
}

export function isFutureDate(value: string, referenceDate = new Date()): boolean {
  if (!isValidDate(value)) return false;
  return value > getTodayIsoDate(referenceDate);
}

export function isPositiveAmount(value: string): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

export function formatAmountRM(raw: string | number): string {
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return "RM 0.00";
  return amount.toLocaleString("en-MY", {
    style: "currency",
    currency: "MYR",
  });
}

export function getCurrentRole(): string {
  const cachedUser = getStoredAuthenticatedUser();
  if (cachedUser?.role) {
    return String(cachedUser.role).trim().toLowerCase();
  }

  return String(getStoredRole() || "user").trim().toLowerCase();
}

export function getCurrentUsername(): string {
  const cachedUser = getStoredAuthenticatedUser();
  if (cachedUser?.username) {
    return String(cachedUser.username).trim().toLowerCase();
  }

  return String(getStoredUsername() || "").trim().toLowerCase();
}

export function getCurrentCollectionStaffNickname(): string {
  try {
    return String(sessionStorage.getItem(COLLECTION_STAFF_NICKNAME_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function emitCollectionDataChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COLLECTION_DATA_CHANGED_EVENT));
}

function normalizeCollectionReceiptMimeType(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return COLLECTION_RECEIPT_MIME_ALIASES[normalized] || normalized;
}

function inferCollectionReceiptMimeTypeFromFileName(fileName: string): string {
  const normalized = String(fileName || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".pdf")) return "application/pdf";
  return "";
}

function resolveCollectionAcceptedReceiptMimeType(input: {
  fileName: string;
  mimeType: string;
}): string {
  const normalizedMimeType = normalizeCollectionReceiptMimeType(input.mimeType);
  if (COLLECTION_ACCEPTED_FILE_TYPES.includes(normalizedMimeType)) {
    return normalizedMimeType;
  }
  const inferredMimeType = inferCollectionReceiptMimeTypeFromFileName(input.fileName);
  if (COLLECTION_ACCEPTED_FILE_TYPES.includes(inferredMimeType)) {
    return inferredMimeType;
  }
  return normalizedMimeType || inferredMimeType;
}

export async function toReceiptPayload(file: File): Promise<CollectionReceiptPayload> {
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => {
      reader.onerror = null;
      reader.onload = null;
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error("Failed to read receipt file."));
    };
    reader.onload = () => {
      const result = String(reader.result || "");
      cleanup();
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
  const mimeType =
    resolveCollectionAcceptedReceiptMimeType({
      fileName: file.name,
      mimeType: file.type,
    })
    || "application/octet-stream";

  return {
    fileName: file.name,
    mimeType,
    contentBase64,
  };
}

export async function toReceiptPayloads(files: File[]): Promise<CollectionReceiptPayload[]> {
  const payloads: CollectionReceiptPayload[] = [];

  for (const file of files) {
    payloads.push(await toReceiptPayload(file));
  }

  return payloads;
}

export function validateReceiptFile(file: File): string | null {
  const effectiveMimeType = resolveCollectionAcceptedReceiptMimeType({
    fileName: file.name,
    mimeType: file.type,
  });
  if (!COLLECTION_ACCEPTED_FILE_TYPES.includes(effectiveMimeType)) {
    return "Receipt file must be JPG, PNG, WebP, or PDF.";
  }
  if (file.size > COLLECTION_MAX_RECEIPT_BYTES) {
    return "Receipt file cannot exceed 5MB.";
  }
  return null;
}

export function computeSummary(records: CollectionRecord[]): { totalRecords: number; totalAmount: number } {
  const totalRecords = records.length;
  const totalAmount = records.reduce((sum, record) => {
    const amount = Number(record.amount);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
  return { totalRecords, totalAmount };
}

export function isValidCustomerPhone(value: string): boolean {
  const normalized = String(value || "").trim();
  if (normalized.length < 8 || normalized.length > 20) return false;
  return COLLECTION_PHONE_REGEX.test(normalized);
}
