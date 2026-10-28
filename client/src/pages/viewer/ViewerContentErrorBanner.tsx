import { AlertCircle } from "lucide-react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";

type ViewerContentErrorBannerProps = {
  error: string;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
  onBackToSaved: () => void;
};

/** Shows a normalized Viewer error with explicit retry and a working return to Saved. */
export function ViewerContentErrorBanner({
  error, canRetry, retrying, onRetry, onBackToSaved,
}: ViewerContentErrorBannerProps) {
  return (
    <OperationalSectionCard className="border-destructive/35 bg-destructive/5" contentClassName="space-y-0">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 break-words text-sm font-medium" role="alert">{error}</p>
        </div>
        <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!canRetry || retrying}
            onClick={onRetry}
            data-testid="button-retry-viewer"
          >
            {retrying ? "Memuat semula…" : "Cuba Semula"}
          </Button>
          <Button type="button" variant="ghost" onClick={onBackToSaved} className="w-full text-destructive sm:w-auto">
            Back to Saved Imports
          </Button>
        </div>
      </div>
    </OperationalSectionCard>
  );
}
