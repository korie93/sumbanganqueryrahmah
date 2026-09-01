import { apiRequest } from "../api-client";
import { createClientRandomId } from "../secure-id";
import {
  collectionPurgeResponseSchema,
  collectionPurgeSummaryResponseSchema,
  collectionRecordListResponseSchema,
  collectionRecordResponseSchema,
  collectionSavedSourceFilesResponseSchema,
  collectionSourceMatchesResponseSchema,
} from "@shared/api-contracts";
import { parseApiJson } from "./contract";
import type {
  CollectionPurgeResponse,
  CollectionPurgeSummaryResponse,
  CollectionRecordListResponse,
  CollectionSavedSourceFilesResponse,
  CreateCollectionPayload,
  UpdateCollectionPayload,
  CollectionSourceMatchesResponse,
} from "./collection-types";
import { z } from "zod";

type CollectionMultipartPayload = Omit<UpdateCollectionPayload, "receipt" | "receipts">;
type CollectionMutationRequestOptions = {
  idempotencyFingerprint?: string;
  idempotencyKey?: string;
};

const COLLECTION_MUTATION_UPLOAD_TIMEOUT_MS = 2 * 60_000;
const COLLECTION_RECEIPT_DOWNLOAD_TIMEOUT_MS = 2 * 60_000;
const collectionRecordMutationResponseSchema = z.object({
  ok: z.literal(true),
  record: collectionRecordResponseSchema,
});
const collectionRecordDeleteResponseSchema = z.object({
  ok: z.literal(true),
});

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
  appendCollectionFormValue(formData, "cardNumber", payload.cardNumber);
  appendCollectionFormValue(formData, "sourceImportId", payload.sourceImportId);
  appendCollectionFormValue(formData, "agingBucket", payload.agingBucket);
  appendCollectionFormValue(formData, "batch", payload.batch);
  appendCollectionFormValue(formData, "paymentDate", payload.paymentDate);
  appendCollectionFormValue(formData, "amount", payload.amount);
  appendCollectionFormValue(formData, "collectionStaffNickname", payload.collectionStaffNickname);
  appendCollectionFormValue(formData, "expectedUpdatedAt", payload.expectedUpdatedAt);

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

function hashFingerprintInput(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
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
  return createClientRandomId("collection");
}

export function buildCollectionMutationFingerprint(params: {
  operation: "create" | "delete" | "update";
  payload?: Record<string, unknown>;
  receiptFiles?: readonly Pick<File, "lastModified" | "name" | "size" | "type">[];
  recordId?: string;
}) {
  const canonicalFingerprint = JSON.stringify(sortFingerprintValue({
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

  return JSON.stringify({
    algorithm: "fnv1a64",
    hash: hashFingerprintInput(canonicalFingerprint),
    version: 1,
  });
}

export async function createCollectionRecord(
  payload: CreateCollectionPayload | FormData,
  options?: CollectionMutationRequestOptions,
) {
  const response = await apiRequest("POST", "/api/collection", payload, {
    headers: buildCollectionMutationHeaders(options),
    timeoutMs: payload instanceof FormData ? COLLECTION_MUTATION_UPLOAD_TIMEOUT_MS : undefined,
  });
  return parseApiJson(
    response,
    collectionRecordMutationResponseSchema,
    "/api/collection",
  );
}

export async function getCollectionSourceMatches(
  payload: {
    customerName: string;
    icNumber: string;
    customerPhone: string;
    accountNumber: string;
    cardNumber?: string;
    paymentDate: string;
    amount: string;
  },
  options?: { signal?: AbortSignal | undefined },
) {
  const response = await apiRequest(
    "POST",
    "/api/collection/source-matches",
    payload,
    { signal: options?.signal },
  );
  return parseApiJson(
    response,
    collectionSourceMatchesResponseSchema,
    "/api/collection/source-matches",
  ) as Promise<CollectionSourceMatchesResponse>;
}

export async function getCollectionSavedSourceFiles(
  filters?: {
    search?: string | undefined;
    limit?: number | undefined;
    cursor?: string | null | undefined;
  },
  options?: { signal?: AbortSignal | undefined },
) {
  const params = new URLSearchParams();
  const search = String(filters?.search || "").trim();
  if (search) params.set("search", search);
  if (typeof filters?.limit === "number" && Number.isFinite(filters.limit)) {
    params.set("limit", String(Math.max(1, Math.min(100, Math.trunc(filters.limit)))));
  }
  const cursor = String(filters?.cursor || "").trim();
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  const endpoint = query
    ? `/api/collection/source-files?${query}`
    : "/api/collection/source-files";
  const response = await apiRequest("GET", endpoint, undefined, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    collectionSavedSourceFilesResponseSchema,
    "/api/collection/source-files",
  ) as Promise<CollectionSavedSourceFilesResponse>;
}

export async function getCollectionRecords(filters?: {
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  nickname?: string | undefined;
  nicknames?: string[] | undefined;
  sourceImportIds?: string[] | undefined;
  agingBuckets?: Array<"D3" | "D4" | "D5" | "D6"> | undefined;
  classifications?: Array<"cp" | "abort_cp"> | undefined;
  sortBy?: "paymentDate" | "amount" | "customerName" | "source" | "aging" | "classification" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
  receiptValidationStatus?: "matched" | "underpaid" | "overpaid" | "unverified" | "needs_review" | "flagged" | undefined;
  duplicateOnly?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  cursor?: string | null | undefined;
}, options?: { signal?: AbortSignal | undefined }) {
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
  if (Array.isArray(filters?.sourceImportIds) && filters.sourceImportIds.length > 0) {
    params.set(
      "sourceImportIds",
      filters.sourceImportIds.map((value) => String(value || "").trim()).filter(Boolean).join(","),
    );
  }
  if (Array.isArray(filters?.agingBuckets) && filters.agingBuckets.length > 0) {
    params.set("agingBuckets", filters.agingBuckets.join(","));
  }
  if (Array.isArray(filters?.classifications) && filters.classifications.length > 0) {
    params.set("classifications", filters.classifications.join(","));
  }
  if (filters?.sortBy) params.set("sortBy", filters.sortBy);
  if (filters?.sortDirection) params.set("sortDirection", filters.sortDirection);
  if (filters?.receiptValidationStatus) {
    params.set("receiptValidationStatus", filters.receiptValidationStatus);
  }
  if (filters?.duplicateOnly) {
    params.set("duplicateOnly", "1");
  }
  if (typeof filters?.page === "number" && Number.isFinite(filters.page)) {
    params.set("page", String(filters.page));
  }
  const pageSize = filters?.pageSize ?? filters?.limit;
  if (typeof pageSize === "number" && Number.isFinite(pageSize)) {
    params.set("pageSize", String(pageSize));
  }
  if (typeof filters?.offset === "number" && Number.isFinite(filters.offset)) {
    params.set("offset", String(filters.offset));
  }
  if (typeof filters?.cursor === "string" && filters.cursor.trim()) {
    params.set("cursor", filters.cursor.trim());
  }
  const query = params.toString();
  const response = await apiRequest(
    "GET",
    query ? `/api/collection/list?${query}` : "/api/collection/list",
    undefined,
    { signal: options?.signal },
  );
  return parseApiJson(
    response,
    collectionRecordListResponseSchema,
    "/api/collection/list",
  ) as Promise<CollectionRecordListResponse>;
}

export async function getCollectionPurgeSummary() {
  const response = await apiRequest("GET", "/api/collection/purge-summary");
  return parseApiJson(
    response,
    collectionPurgeSummaryResponseSchema,
    "/api/collection/purge-summary",
  ) as Promise<CollectionPurgeSummaryResponse>;
}

export async function purgeOldCollectionRecords(currentPassword: string) {
  const response = await apiRequest("DELETE", "/api/collection/purge-old", {
    currentPassword,
  });
  return parseApiJson(
    response,
    collectionPurgeResponseSchema,
    "/api/collection/purge-old",
  ) as Promise<CollectionPurgeResponse>;
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

  const fallbackMatch = raw.match(/filename="?([^";]+)"?/i);
  if (!fallbackMatch?.[1]) return null;
  const normalized = fallbackMatch[1].trim();
  return normalized || null;
}

export async function fetchCollectionReceiptBlob(
  recordId: string,
  mode: "view" | "download",
  receiptId?: string | null,
  options?: { signal?: AbortSignal | undefined },
) {
  const receiptSegment = receiptId
    ? `/receipts/${encodeURIComponent(receiptId)}`
    : "/receipt";
  const response = await apiRequest(
    "GET",
    `/api/collection/${encodeURIComponent(recordId)}${receiptSegment}/${mode}`,
    undefined,
    {
      signal: options?.signal,
      timeoutMs: COLLECTION_RECEIPT_DOWNLOAD_TIMEOUT_MS,
    },
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
    timeoutMs: payload instanceof FormData ? COLLECTION_MUTATION_UPLOAD_TIMEOUT_MS : undefined,
  });
  return parseApiJson(
    response,
    collectionRecordMutationResponseSchema,
    "/api/collection/:id",
  );
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
  return parseApiJson(
    response,
    collectionRecordDeleteResponseSchema,
    "/api/collection/:id",
  );
}
