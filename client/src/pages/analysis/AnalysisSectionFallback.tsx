import { OperationalSectionCard } from "@/components/layout/OperationalPage";

export function AnalysisSectionFallback({ label }: { label: string }) {
  return (
    <OperationalSectionCard className="bg-background/80" contentClassName="p-4 text-sm text-muted-foreground">
      <div role="status" aria-live="polite">
        {label}
      </div>
    </OperationalSectionCard>
  );
}
