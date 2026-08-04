import type { CollectionRecord } from "@/lib/api";

export function getCollectionRecordSourceLabel(record: CollectionRecord): string {
  return String(record.sourceImportName || record.sourceFilename || "").trim()
    || "Source not recorded";
}
