import type { CollectionRecordEditChanges } from "./collection-record-edit-changes";

type CollectionRecordEditChangeSummaryProps = {
  changeReview: CollectionRecordEditChanges;
};

export function CollectionRecordEditChangeSummary({
  changeReview,
}: CollectionRecordEditChangeSummaryProps) {
  if (!changeReview.hasChanges) return null;

  return (
    <details
      data-testid="edit-collection-change-summary"
      className="min-w-0 max-w-full rounded-lg border bg-muted/30 text-sm md:col-span-2"
    >
      <summary className="cursor-pointer px-4 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        {changeReview.changes.length} perubahan
      </summary>
      <ul className="min-w-0 divide-y border-t">
        {changeReview.changes.map((change) => (
          <li key={change.key} className="min-w-0 space-y-2 px-4 py-3">
            <p className="font-medium [overflow-wrap:anywhere]">{change.label}</p>
            <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <dt className="text-xs text-muted-foreground">Asal</dt>
                <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{change.before}</dd>
              </div>
              <div className="min-w-0 space-y-1">
                <dt className="text-xs text-muted-foreground">Baharu</dt>
                <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{change.after}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </details>
  );
}
