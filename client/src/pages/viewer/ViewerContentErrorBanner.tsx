import { AlertCircle } from "lucide-react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";

type ViewerContentErrorBannerProps = {
  error: string;
  onBackToSaved: () => void;
};

export function ViewerContentErrorBanner({ error, onBackToSaved }: ViewerContentErrorBannerProps) {
  return (
    <OperationalSectionCard className="border-destructive/35 bg-destructive/5" contentClassName="space-y-0">
      <div className="flex flex-wrap items-center gap-3 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm font-medium">{error}</span>
        <Button variant="ghost" onClick={onBackToSaved} className="ml-auto text-destructive">
          Back to Saved Imports
        </Button>
      </div>
    </OperationalSectionCard>
  );
}
