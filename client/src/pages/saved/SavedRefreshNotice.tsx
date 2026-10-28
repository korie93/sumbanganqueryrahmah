import { Button } from "@/components/ui/button";
import { READ_DEADLINE_MESSAGE } from "@/lib/read-deadline";

type SavedRefreshNoticeProps = {
  refreshing: boolean;
  isStale: boolean;
  refreshDisabled: boolean;
  timedOut?: boolean | undefined;
  onRefresh: () => void;
};

/** Explains a retained Saved page without replacing its rows or exposing request errors. */
export function SavedRefreshNotice({
  refreshing, isStale, refreshDisabled, onRefresh, timedOut = false,
}: SavedRefreshNoticeProps) {
  if (!refreshing && !isStale) return null;

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"
      data-saved-ai-avoid="true"
      data-testid="saved-refresh-notice"
    >
      <div className="min-w-0 text-sm" role="status" aria-live="polite" aria-atomic="true">
        <p className="font-medium text-foreground">
          {refreshing ? "Mengemas kini senarai…" : timedOut ? READ_DEADLINE_MESSAGE : "Senarai belum dapat dikemas kini."}
        </p>
        <p className="mt-1 text-muted-foreground">
          {refreshing
            ? "Paparan terakhir dikekalkan sementara senarai dimuat semula."
            : "Paparan terakhir ditunjukkan. Muat semula sebelum membuat perubahan."}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full shrink-0 sm:w-auto md:h-9"
        disabled={refreshDisabled}
        onClick={onRefresh}
        data-testid="button-retry-saved"
      >
        Cuba Semula
      </Button>
    </section>
  );
}
