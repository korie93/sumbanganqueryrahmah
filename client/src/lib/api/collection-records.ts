import { apiRequest } from "../queryClient";
import type {
  CollectionPurgeResponse,
  CollectionPurgeSummaryResponse,
  CollectionReceiptInspectResponse,
  CollectionRecordListResponse,
  CreateCollectionPayload,
  UpdateCollectionPayload,
} from "./collection-types";

type CollectionMultipartPayload = Omit<UpdateCollectionPayload, "receipt" | "receipts">;
type CollectionMutationRequestOptions = {
  idempotencyFingerprint?: string;
  idempotencyKey?: string;
};

function appendCollectionFormValue(formData: FormData, key: string, value: unknown) {
  if (value === undefined || value === null) {
    return;
  }

  formData.append(key, String(value));
}

function appendCollectionJsonValue(formData: FormData, key: string, value: unknown) {
  if (value === undefined || value === null) {
    return;
  }

  formData.append(key, JSON.stringify(value));
}

export function buildCollectionRecordFormData(
  payload: CollectionMultipartPayload,
  receiptFiles: readonly File[] = [],
): FormData {
  const formData = new FormData();

  appendCollectionFormValue(formData, "customerName", payload.customerName);
  appendCollectionFormValue(formData, "icNumber", payload.icNumber);
  appendCollectionFormValue(formData, "customerPhone", payload.customerPhone);
  appendCollectionFormValue(formData, "accountNumber", payload.accountNumber);
  appendCollectionFormValue(formData, "batch", payload.batch);
  appendCollectionFormValue(formData, "paymentDate", payload.paymentDate);
  appendCollectionFormValue(formData, "amount", payload.amount);
  appendCollectionFormValue(formData, "collectionStaffNickname", payload.collectionStaffNickname);
  appendCollectionFormValue(formData, "expectedUpdatedAt", payload.expectedUpdatedAt);
  appendCollectionFormValue(
    formData,
    "receiptValidationOverrideReason",
    payload.receiptValidationOverrideReason,
  );

  if (Array.isArray(payload.newReceiptMetadata)) {
    appendCollectionJsonValue(formData, "newReceiptMetadata", payload.newReceiptMetadata);
  }
  if (Array.isArray(payload.existingReceiptMetadata)) {
    appendCollectionJsonValue(formData, "existingReceiptMetadata", payload.existingReceiptMetadata);
  }

  if (typeof payload.removeReceipt === "boolean") {
    formData.append("removeReceipt", payload.removeReceipt ? "true" : "false");
  }

  for (const receiptId of payload.removeReceiptIds || []) {
    const normalizedReceiptId = String(receiptId || "").trim();
    if (normalizedReceiptId) {
      formData.append("removeReceiptIds", normalizedReceiptId);
    }
  }

  for (const file of receiptFiles) {
    formData.append("receipts", file);
  }

  return formData;
}

function sortFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortFingerprintValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortFingerprintValue(nested)]),
    );
  }

  return value ?? null;
}

function buildCollectionMutationHeaders(options?: CollectionMutationRequestOptions) {
  const headers: Record<string, string> = {};
  const idempotencyKey = String(options?.idempotencyKey || "").trim();
  const idempotencyFingerprint = String(options?.idempotencyFingerprint || "").trim();

  if (idempotencyKey) {
    headers["x-idempotency-key"] = idempotencyKey;
  }
  if (idempotencyFingerprint) {
    headers["x-idempotency-fingerprint"] = idempotencyFingerprint;
  }

  return headers;
}

export function createCollectionMutationIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `collection-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildCollectionMutationFingerprint(params: {
  operation: "create" | "delete" | "update";
  payload?: Record<string, unknown>;
  receiptFiles?: readonly Pick<File, "lastModified" | "name" | "size" | "type">[];
  recordId?: string;
}) {
  return JSON.stringify(sortFingerprintValue({
    operation: params.operation,
    payload: params.payload || {},
    receiptFiles: (params.receiptFiles || []).map((file) => ({
      lastModified: Number(file.lastModified || 0),
      name: String(file.name || ""),
      size: Number(file.size || 0),
      type: String(file.type || ""),
    })),
    recordId: String(params.recordId || ""),
  }));
}

export async function createCollectionRecord(
  payload: CreateCollectionPayload | FormData,
  options?: CollectionMutationRequestOptions,
) {
  const response = await apiRequest("POST", "/api/collection", payload, {
    headers: buildCollectionMutationHeaders(options),
  });
  return response.json();
}

export async function inspectCollectionReceiptFiles(
  receiptFiles: readonly File[],
  options?: { signal?: AbortSignal },
) {
  const formData = new FormData();
  for (const receiptFile of receiptFiles) {
    formData.append("receipts", receiptFile);
  }

  const response = await apiRequest("POST", "/api/collection/receipt-inspect", formData, {
    signal: options?.signal,
  });
  return response.json() as Promise<CollectionReceiptInspectResponse>;
}

export async function getCollectionRecords(filters?: {
  from?: string;
  to?: string;
  search?: string;
  nickname?: string;
  nicknames?: string[];
  limit?: number;
  offset?: number;
}, options?: { signal?: AbortSignal }) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.nickname) params.set("nickname", filters.nickname);
  if (Array.isArray(filters?.nicknames) && filters.nicknames.length > 0) {
    params.set(
      "nicknames",
      filters.nicknames.map((value) => String(value || "").trim()).filter(Boolean).join(","),
    );
  }
  if (typeof filters?.limit === "number" && Number.isFinite(filters.limit)) {
    params.set("limit", String(filters.limit));
  }
  if (typeof filters?.offset === "number" && Number.isFinite(filters.offset)) {
    params.set("offset", String(filters.offset));
  }
  const query = params.toString();
  const response = await apiRequest(
    "GET",
    query ? `/api/collection/list?${query}` : "/api/collection/list",
    undefined,
    { signal: options?.signal },
  );
  return response.json() as Promise<CollectionRecordListResponse>;
}

export async function getCollectionPurgeSummary() {
  const response = await apiRequest("GET", "/api/collection/purge-summary");
  return response.json() as Promise<CollectionPurgeSummaryResponse>;
}

export async function purgeOldCollectionRecords(currentPassword: string) {
  const response = await apiRequest("DELETE", "/api/collection/purge-old", {
    currentPassword,
  });
  return response.json() as Promise<CollectionPurgeResponse>;
}

function parseFilenameFromContentDisposition(contentDisposition: string | null): string | null {
  const raw = String(contentDisposition || "").trim();
  if (!raw) return null;

  const utfMatch = raw.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]).trim() || null;
    } catch {
      return utfMatch[1].trim() || null;
    }
  }

  const fallbackMatch = raw.match(/filename=\"?([^\";]+)\"?/i);
  if (!fallbackMatch?.[1]) return null;
  const normalized = fallbackMatch[1].trim();
  return normalized || null;
}

export async function fetchCollectionReceiptBlob(
  recordId: string,
  mode: "view" | "download",
  receiptId?: string | null,
  options?: { signal?: AbortSignal },
) {
  const receiptSegment = receiptId
    ? `/receipts/${encodeURIComponent(receiptId)}`
    : "/receipt";
  const response = await apiRequest(
    "GET",
    `/api/collection/${encodeURIComponent(recordId)}${receiptSegment}/${mode}`,
    undefined,
    { signal: options?.signal },
  );
  const blob = await response.blob();
  const mimeType = String(response.headers.get("Content-Type") || blob.type || "").toLowerCase();
  const fileName = parseFilenameFromContentDisposition(response.headers.get("Content-Disposition"));
  return { blob, mimeType, fileName };
}

export async function updateCollectionRecord(
  id: string,
  payload: UpdateCollectionPayload | FormData,
  options?: CollectionMutationRequestOptions,
) {
  const response = await apiRequest("PATCH", `/api/collection/${encodeURIComponent(id)}`, payload, {
    headers: buildCollectionMutationHeaders(options),
  });
  return response.json();
}

export async function deleteCollectionRecord(
  id: string,
  payload?: {
    expectedUpdatedAt?: string;
  },
  options?: CollectionMutationRequestOptions,
) {
  const response = await apiRequest("DELETE", `/api/collection/${encodeURIComponent(id)}`, payload, {
    headers: buildCollectionMutationHeaders(options),
  });
  return response.json();
}
