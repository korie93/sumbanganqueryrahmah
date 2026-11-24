export const COLLECTION_OFFLINE_EXPORT_MAX_RECORDS = 1000;
export const COLLECTION_OFFLINE_EXPORT_MAX_RECEIPTS = 3000;

export const collectionOfflineRecordId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CollectionOfflineExportExpectation = { id: string; cents: number; receipts: number };
