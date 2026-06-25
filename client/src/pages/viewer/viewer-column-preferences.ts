import {
  getBrowserLocalStorage,
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
  type BrowserStorageLike,
} from "@/lib/browser-storage";
import { safeJsonParseResult } from "@/lib/utils/safe-json";

const VIEWER_COLUMN_PREFERENCE_STORAGE_KEY = "sqr.viewer.columns.v1";
const MAX_VIEWER_DATASET_PREFERENCES = 12;
const MAX_STORED_VIEWER_COLUMNS = 256;
const MAX_STORED_VIEWER_COLUMN_LENGTH = 160;

type StoredViewerColumnPreference = {
  datasetId: string;
  order: string[];
  visible: string[];
  updatedAt: number;
};

type StoredViewerColumnPreferences = {
  datasets: StoredViewerColumnPreference[];
};

export type ViewerColumnPreference = {
  order: string[];
  visible: string[];
};

function getStorage(storage?: BrowserStorageLike | null) {
  return storage === undefined ? getBrowserLocalStorage() : storage;
}

function normalizeDatasetId(value: string | undefined): string {
  return (value || "default").trim().slice(0, 160) || "default";
}

function normalizeHeaderList(value: unknown, headers: string[]): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowed = new Set(headers);
  return Array.from(
    new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string"
          && item.length <= MAX_STORED_VIEWER_COLUMN_LENGTH
          && allowed.has(item),
      ),
    ),
  );
}

export function normalizeViewerColumnPreference(
  value: unknown,
  headers: string[],
): ViewerColumnPreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { order: [...headers], visible: [...headers] };
  }

  const candidate = value as Record<string, unknown>;
  const storedOrder = normalizeHeaderList(candidate.order, headers);
  const order = [...storedOrder, ...headers.filter((header) => !storedOrder.includes(header))];
  const storedVisible = normalizeHeaderList(candidate.visible, headers);
  const visible = storedVisible.length > 0 ? storedVisible : order.slice(0, 1);

  return { order, visible };
}

function readStore(storage?: BrowserStorageLike | null): StoredViewerColumnPreferences {
  const resolvedStorage = getStorage(storage);
  const raw = safeGetStorageItem(resolvedStorage, VIEWER_COLUMN_PREFERENCE_STORAGE_KEY);
  if (!raw) {
    return { datasets: [] };
  }

  const parsed = safeJsonParseResult<unknown>(raw, {
    maxDepth: 5,
    maxNodes: 1_000,
    maxRawLength: 64_000,
    maxStringLength: 160,
  });
  if (!parsed.ok || !parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
    safeRemoveStorageItem(resolvedStorage, VIEWER_COLUMN_PREFERENCE_STORAGE_KEY);
    return { datasets: [] };
  }

  const datasets = (parsed.data as Record<string, unknown>).datasets;
  if (!Array.isArray(datasets)) {
    return { datasets: [] };
  }

  return {
    datasets: datasets
      .filter(
        (item): item is StoredViewerColumnPreference =>
          Boolean(item)
          && typeof item === "object"
          && !Array.isArray(item)
          && typeof (item as Record<string, unknown>).datasetId === "string"
          && typeof (item as Record<string, unknown>).updatedAt === "number",
      )
      .slice(0, MAX_VIEWER_DATASET_PREFERENCES),
  };
}

export function readViewerColumnPreference(
  datasetId: string | undefined,
  headers: string[],
  storage?: BrowserStorageLike | null,
): ViewerColumnPreference {
  const normalizedId = normalizeDatasetId(datasetId);
  const stored = readStore(storage).datasets.find((item) => item.datasetId === normalizedId);
  return normalizeViewerColumnPreference(stored, headers);
}

export function writeViewerColumnPreference(
  datasetId: string | undefined,
  preference: ViewerColumnPreference,
  storage?: BrowserStorageLike | null,
): boolean {
  const resolvedStorage = getStorage(storage);
  const normalizedId = normalizeDatasetId(datasetId);
  const normalizedPreference = normalizeViewerColumnPreference(preference, preference.order);
  const storedOrder = normalizedPreference.order
    .filter((column) => column.length <= MAX_STORED_VIEWER_COLUMN_LENGTH)
    .slice(0, MAX_STORED_VIEWER_COLUMNS);
  const storedVisible = normalizedPreference.visible.filter((column) =>
    storedOrder.includes(column),
  );
  const otherDatasets = readStore(resolvedStorage).datasets.filter(
    (item) => item.datasetId !== normalizedId,
  );
  const nextStore: StoredViewerColumnPreferences = {
    datasets: [
      {
        datasetId: normalizedId,
        order: storedOrder,
        visible: storedVisible.length > 0 ? storedVisible : storedOrder.slice(0, 1),
        updatedAt: Date.now(),
      },
      ...otherDatasets,
    ].slice(0, MAX_VIEWER_DATASET_PREFERENCES),
  };

  return safeSetStorageItem(
    resolvedStorage,
    VIEWER_COLUMN_PREFERENCE_STORAGE_KEY,
    JSON.stringify(nextStore),
    {
      onQuotaExceeded: () =>
        safeRemoveStorageItem(resolvedStorage, VIEWER_COLUMN_PREFERENCE_STORAGE_KEY),
    },
  );
}

export function buildViewerHeadersSignature(headers: string[]): string {
  let hash = 2_166_136_261;
  for (const header of headers) {
    for (let index = 0; index < header.length; index += 1) {
      hash ^= header.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
    hash ^= 31;
    hash = Math.imul(hash, 16_777_619);
  }
  return `${headers.length}:${hash >>> 0}`;
}

export function moveViewerColumn(
  order: string[],
  column: string,
  direction: -1 | 1,
): string[] {
  const index = order.indexOf(column);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= order.length) {
    return order;
  }

  const next = [...order];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
