import { CalendarDays, Loader2 } from "lucide-react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { CollectionDailyDesktopFiltersLayout } from "@/pages/collection/CollectionDailyDesktopFiltersLayout";
import { CollectionDailyMobileFiltersLayout } from "@/pages/collection/CollectionDailyMobileFiltersLayout";
import type { CollectionDailyFiltersCardProps } from "@/pages/collection/collection-daily-filters-card-shared";

export function CollectionDailyFiltersCard({
  loadingOverview,
  onRefresh,
  ...props
}: CollectionDailyFiltersCardProps) {
  const isMobile = useIsMobile();

  return (
    <OperationalSectionCard
      title={
        <span className="flex items-center gap-2" data-testid="collection-daily-title">
          <CalendarDays className="h-5 w-5" />
          Collection Daily
        </span>
      }
      description="Set month, selected staff nicknames, and working-day targets from one place."
      actions={
        <Button
          variant="outline"
          className={isMobile ? "w-full sm:w-auto" : undefined}
          onClick={onRefresh}
          disabled={loadingOverview}
          data-testid="collection-daily-refresh"
        >
          {loadingOverview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
      }
    >
      {isMobile ? (
        <CollectionDailyMobileFiltersLayout
          loadingOverview={loadingOverview}
          onRefresh={onRefresh}
          {...props}
        />
      ) : (
        <CollectionDailyDesktopFiltersLayout
          loadingOverview={loadingOverview}
          onRefresh={onRefresh}
          {...props}
        />
      )}
    </OperationalSectionCard>
  );
}
