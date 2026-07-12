import type { CollectionBatch } from "@/lib/api";
import { SAVE_COLLECTION_DRAFT_STORAGE_PREFIX } from "@/app/constants";
import {
  getBrowserSessionStorage,
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
import { safeJsonParseResult } from "@/lib/utils/safe-json";
import { COLLECTION_BATCH_OPTIONS } from "@/pages/collection/utils";

export type SaveCollectionDraft = {
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
  hadPendingReceipts: boolean;
  savedAt: string;
};

const SAVE_COLLECTION_DRAFT_VERSION = "v2";

function normalizeDraftString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function buildLegacySaveCollectionDraftStorageKey(staffNickname: string): string {
  const normalized = staffNickname
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${SAVE_COLLECTION_DRAFT_STORAGE_PREFIX}${normalized || "default"}:v1`;
}

export function buildSaveCollectionDraftStorageKey(staffNickname: string): string {
  const normalized = staffNickname.trim().toLowerCase() || "default";

  return `${SAVE_COLLECTION_DRAFT_STORAGE_PREFIX}${encodeURIComponent(normalized)}:${SAVE_COLLECTION_DRAFT_VERSION}`;
}

export function isSaveCollectionDraftEmpty(draft: Omit<SaveCollectionDraft, "savedAt">): boolean {
  return !draft.paymentDate.trim()
    && !draft.amount.trim()
    && draft.batch === "P10"
    && !draft.hadPendingReceipts;
}

export function parseSaveCollectionDraft(raw: string | null | undefined): SaveCollectionDraft | null {
  if (!raw) {
    return null;
  }

  const parsedJson = safeJsonParseResult<Partial<SaveCollectionDraft>>(raw, {
    maxDepth: 4,
    maxRawLength: 4_096,
  });
  if (!parsedJson.ok || typeof parsedJson.data !== "object" || parsedJson.data === null) {
    return null;
  }

  const parsed = parsedJson.data;
  const batchCandidate = normalizeDraftString(parsed.batch, 16);
  const batch = COLLECTION_BATCH_OPTIONS.includes(batchCandidate as CollectionBatch)
    ? batchCandidate as CollectionBatch
    : "P10";

  return {
    batch,
    paymentDate: normalizeDraftString(parsed.paymentDate, 32),
    amount: normalizeDraftString(parsed.amount, 64),
    hadPendingReceipts: parsed.hadPendingReceipts === true,
    savedAt: normalizeDraftString(parsed.savedAt, 64),
  };
}

export function readSaveCollectionDraft(staffNickname: string): SaveCollectionDraft | null {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return null;
  }

  safeRemoveStorageItem(storage, buildLegacySaveCollectionDraftStorageKey(staffNickname));

  return parseSaveCollectionDraft(
    safeGetStorageItem(storage, buildSaveCollectionDraftStorageKey(staffNickname)),
  );
}

export function clearSaveCollectionDraft(staffNickname: string) {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return;
  }

  safeRemoveStorageItem(storage, buildSaveCollectionDraftStorageKey(staffNickname));
  safeRemoveStorageItem(storage, buildLegacySaveCollectionDraftStorageKey(staffNickname));
}

export function persistSaveCollectionDraft(
  staffNickname: string,
  draft: Omit<SaveCollectionDraft, "savedAt">,
) {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return;
  }

  const storageKey = buildSaveCollectionDraftStorageKey(staffNickname);
  safeRemoveStorageItem(storage, buildLegacySaveCollectionDraftStorageKey(staffNickname));
  if (isSaveCollectionDraftEmpty(draft)) {
    safeRemoveStorageItem(storage, storageKey);
    return;
  }

  const payload: SaveCollectionDraft = {
    batch: draft.batch,
    paymentDate: draft.paymentDate,
    amount: draft.amount,
    hadPendingReceipts: draft.hadPendingReceipts,
    savedAt: new Date().toISOString(),
  };
  safeSetStorageItem(storage, storageKey, JSON.stringify(payload));
}
