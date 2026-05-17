import { Loader2 } from "lucide-react";

type CollectionDailyCalendarStateProps = {
  loading: boolean;
  message: string;
};

export function CollectionDailyCalendarState({
  loading,
  message,
}: CollectionDailyCalendarStateProps) {
  if (loading) {
    return (
      <div
        className="collection-daily-state-card rounded-2xl border border-border/60 bg-background px-4 py-8 text-center text-sm text-muted-foreground shadow-sm"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" aria-hidden="true" />
        {message}
      </div>
    );
  }

  return (
    <div className="collection-daily-state-card rounded-2xl border border-border/60 bg-background px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
      {message}
    </div>
  );
}
