import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import type {
  SaveCollectionFormValues,
  SaveCollectionReadiness,
} from "@/pages/collection/save-collection-page-utils";
import {
  buildSaveCollectionReadySummary,
  buildSaveCollectionReceiptReviewHints,
} from "@/pages/collection/save-collection-ready-summary";

type SaveCollectionReadySummaryProps = {
  values: SaveCollectionFormValues;
  readiness: SaveCollectionReadiness;
  receiptCount: number;
  receiptDrafts: CollectionReceiptDraftInput[];
};

export function SaveCollectionReadySummary({
  values,
  readiness,
  receiptCount,
  receiptDrafts,
}: SaveCollectionReadySummaryProps) {
  const items = buildSaveCollectionReadySummary({ values, receiptCount, readiness });
  const reviewHints = buildSaveCollectionReceiptReviewHints({ values, receiptDrafts });
  const isReady = readiness.isReady;

  return (
    <section
      className={isReady
        ? "rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"
        : "rounded-xl border border-amber-500/35 bg-amber-500/5 p-3"}
      aria-label={isReady ? "Ready to save summary" : "Incomplete save summary"}
      data-ready={isReady ? "true" : "false"}
      data-testid="save-collection-readiness"
    >
      <div
        id="save-collection-readiness-status"
        className="mb-3 flex items-start gap-3"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {isReady ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {isReady ? "Ready to Save" : "Belum Sedia Disimpan"}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isReady
              ? "Semak ringkasan ini sebelum klik Save Collection."
              : `${readiness.invalidFields.length} medan perlu dilengkapkan atau diperbetulkan.`}
          </p>
        </div>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
            <dt className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {item.label}
            </dt>
            <dd className={item.missing
              ? "break-words text-sm font-medium text-destructive"
              : "break-words text-sm font-medium text-foreground"}
            >
              {item.value}
            </dd>
            {item.error ? (
              <dd className="mt-1 text-xs leading-relaxed text-destructive">{item.error}</dd>
            ) : null}
          </div>
        ))}
      </dl>
      {reviewHints.length > 0 ? (
        <div
          className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <h4 className="text-xs font-semibold text-foreground">Receipt review hint</h4>
              <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                {reviewHints.slice(0, 4).map((hint) => (
                  <li key={hint.id}>{hint.message}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
