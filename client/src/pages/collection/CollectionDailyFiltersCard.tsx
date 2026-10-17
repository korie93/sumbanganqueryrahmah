import { CalendarDays, Loader2 } from "lucide-react";
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
    <section className="collection-daily-filter-region space-y-3" aria-labelledby="collection-daily-filters-heading">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="collection-daily-filters-heading" className="collection-daily-title flex items-center gap-2 text-lg font-semibold" data-testid="collection-daily-title">
            <CalendarDays className="collection-daily-title-icon h-4 w-4" aria-hidden="true" />
            Collection Daily
          </h2>
        </div>
        <Button
          id="collection-daily-refresh"
          type="button"
          variant="outline"
          className="collection-daily-refresh-button h-11 min-h-11 sm:min-h-11"
          onClick={onRefresh}
          disabled={loadingOverview || props.savingCalendar || props.savingTarget}
          data-testid="collection-daily-refresh"
        >
          {loadingOverview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Refresh
        </Button>
      </header>
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
    </section>
  );
}
