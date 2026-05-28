import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type DashboardSectionErrorProps = {
  title: string;
  description: string;
  onRetry: () => void;
  retrying?: boolean;
  minHeightClassName?: string;
};

export function DashboardSectionError({
  title,
  description,
  onRetry,
  retrying = false,
  minHeightClassName = "min-h-[180px]",
}: DashboardSectionErrorProps) {
  return (
    <div
      className={`flex flex-col justify-center rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive ${minHeightClassName}`}
      role="alert"
      aria-live="polite"
      data-testid="dashboard-section-error"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold">{title}</p>
          <p className="text-sm leading-6 text-destructive/90">{description}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 border-destructive/40 bg-background text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRetry}
            disabled={retrying}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${retrying ? "animate-spin" : ""}`} aria-hidden="true" />
            Cuba lagi
          </Button>
        </div>
      </div>
    </div>
  );
}
