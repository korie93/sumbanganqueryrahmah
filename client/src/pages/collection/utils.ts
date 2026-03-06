import type { CollectionBatch, CollectionReceiptPayload, CollectionRecord } from "@/lib/api";

export const COLLECTION_BATCH_OPTIONS: CollectionBatch[] = ["P10", "P25", "MDD02", "MDD10", "MDD18", "MDD25"];
export const COLLECTION_ACCEPTED_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];
export const COLLECTION_MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const COLLECTION_STAFF_NICKNAME_KEY = "collection_staff_nickname";
export const COLLECTION_PHONE_REGEX = /^[0-9+\-\s]{8,20}$/;

export function parseApiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Request failed";
  const jsonPart = raw.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(jsonPart);
    return String(parsed?.message || parsed?.error?.message || raw);
  } catch {
    return raw;
  }
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime());
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
  try {
    const userRaw = localStorage.getItem("user");
    if (userRaw) {
      const parsed = JSON.parse(userRaw);
      return String(parsed?.role || localStorage.getItem("role") || "user").trim().toLowerCase();
    }
  } catch {
    // ignore parse issues
  }
  return String(localStorage.getItem("role") || "user").trim().toLowerCase();
}

export async function toReceiptPayload(file: File): Promise<CollectionReceiptPayload> {
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read receipt file."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });

  return {
    fileName: file.name,
    mimeType: file.type,
    contentBase64,
  };
}

export function validateReceiptFile(file: File): string | null {
  if (!COLLECTION_ACCEPTED_FILE_TYPES.includes(file.type)) {
    return "Receipt file must be JPG, PNG, or PDF.";
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
