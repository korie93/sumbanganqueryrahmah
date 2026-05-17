import { AlertTriangle } from "lucide-react";
import {
  buildDuplicateReceiptSummary,
  findDuplicateReceiptFiles,
} from "@/pages/collection/collection-receipt-duplicate-utils";
import { formatCollectionReceiptFileSize } from "@/pages/collection/useCollectionReceiptDraftPreviews";

type CollectionReceiptDuplicateWarningProps = {
  pendingFiles: File[];
};

export function CollectionReceiptDuplicateWarning({
  pendingFiles,
}: CollectionReceiptDuplicateWarningProps) {
  const duplicateGroups = findDuplicateReceiptFiles(pendingFiles);

  if (duplicateGroups.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Possible duplicate receipt</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {buildDuplicateReceiptSummary(duplicateGroups)} Semak sebelum save supaya receipt tidak
            tersimpan dua kali.
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {duplicateGroups.slice(0, 3).map((group) => (
              <li key={group.key}>
                {group.fileName} ({formatCollectionReceiptFileSize(group.size)}) muncul{" "}
                {group.indexes.length} kali.
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
