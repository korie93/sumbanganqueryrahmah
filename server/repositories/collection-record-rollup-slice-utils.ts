import type {
  CollectionRecordDailyRollupSlice,
  NormalizedCollectionRecordDailyRollupSlice,
} from "./collection-record-rollup-types";

export function normalizeCollectionRecordDailyRollupSlice(
  slice: CollectionRecordDailyRollupSlice | null | undefined,
): NormalizedCollectionRecordDailyRollupSlice | null {
  const paymentDate = String(slice?.paymentDate || "").trim();
  const createdByLogin = String(slice?.createdByLogin || "").trim();
  const collectionStaffNickname = String(slice?.collectionStaffNickname || "").trim();
  if (!paymentDate || !createdByLogin || !collectionStaffNickname) {
    return null;
  }

  return {
    paymentDate,
    createdByLogin,
    collectionStaffNickname,
  };
}

export function mapCollectionRecordRowToDailyRollupSlice(
  row: Record<string, unknown> | null | undefined,
): NormalizedCollectionRecordDailyRollupSlice | null {
  return normalizeCollectionRecordDailyRollupSlice({
    paymentDate: String(row?.payment_date || row?.paymentDate || ""),
    createdByLogin: String(row?.created_by_login || row?.createdByLogin || ""),
    collectionStaffNickname: String(row?.collection_staff_nickname || row?.collectionStaffNickname || ""),
  });
}

export function buildCollectionRecordDailyRollupSliceKey(
  slice: NormalizedCollectionRecordDailyRollupSlice,
): string {
  return `${slice.paymentDate}::${slice.createdByLogin}::${slice.collectionStaffNickname}`;
}

export function dedupeCollectionRecordDailyRollupSlices(
  slices: Array<CollectionRecordDailyRollupSlice | null | undefined>,
): NormalizedCollectionRecordDailyRollupSlice[] {
  const pending = new Map<string, NormalizedCollectionRecordDailyRollupSlice>();
  for (const slice of slices) {
    const normalized = normalizeCollectionRecordDailyRollupSlice(slice);
    if (!normalized) continue;
    pending.set(buildCollectionRecordDailyRollupSliceKey(normalized), normalized);
  }
  return Array.from(pending.values());
}
