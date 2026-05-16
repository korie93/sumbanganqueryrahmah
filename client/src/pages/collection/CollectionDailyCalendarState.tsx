import { Loader2 } from "lucide-react";

type CollectionDailyCalendarStateProps = {
  loading: boolean;
  message: string;
};

export function CollectionDailyCalendarState({
  loading,
  message,
}: CollectionDailyCalendarStateProps) {
  return (
    <div
      className="collection-daily-state-card rounded-2xl border border-border/60 bg-background px-4 py-8 text-center text-sm text-muted-foreground shadow-sm"
      role={loading ? "status" : undefined}
      aria-live={loading ? "polite" : undefined}
      aria-atomic={loading ? "true" : undefined}
    >
      {loading ? <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" aria-hidden="true" /> : null}
      {message}
    </div>
  );
}
