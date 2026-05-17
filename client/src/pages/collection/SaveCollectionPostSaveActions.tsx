import { CalendarDays, CheckCircle2, ListChecks, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveCollectionLastSavedSummary } from "@/pages/collection/save-collection-post-save";

type SaveCollectionPostSaveActionsProps = {
  summary: SaveCollectionLastSavedSummary | null;
  onDismiss: () => void;
};

export function SaveCollectionPostSaveActions({
  summary,
  onDismiss,
}: SaveCollectionPostSaveActionsProps) {
  if (!summary) {
    return null;
  }

  return (
    <section
      className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4"
      aria-label="Tindakan selepas simpan collection berjaya"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Collection berjaya disimpan</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {summary.amountLabel} disimpan untuk {summary.staffNickname}, batch {summary.batch},{" "}
              {summary.receiptLabel}. Customer: {summary.customerName}. Masa: {summary.savedAtLabel}.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[28rem]">
          <Button type="button" variant="outline" className="bg-background/80" onClick={onDismiss}>
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Tambah rekod baru
          </Button>
          <Button asChild variant="outline" className="bg-background/80">
            <a href="/collection/records">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              View rekod
            </a>
          </Button>
          <Button asChild variant="outline" className="bg-background/80">
            <a href="/collection/daily">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Collection Daily
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
