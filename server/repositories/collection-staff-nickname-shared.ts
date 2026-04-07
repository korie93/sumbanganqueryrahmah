import type {
  CollectionRepositoryExecutor,
  CollectionRepositoryQueryResult,
} from "./collection-nickname-utils";

export type CollectionRecordCountRow = {
  total?: unknown;
};

export type CollectionStaffNicknameExecutor = CollectionRepositoryExecutor;

export function normalizeCollectionText(value: unknown): string {
  return String(value || "").trim();
}

export function readRows<TRow>(result: CollectionRepositoryQueryResult): TRow[] {
  return Array.isArray(result.rows) ? (result.rows as TRow[]) : [];
}

export function readFirstRow<TRow>(result: CollectionRepositoryQueryResult): TRow | undefined {
  return readRows<TRow>(result)[0];
}
