import { Suspense, lazy } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ColumnFilter, ViewerFilterMutableField } from "@/pages/viewer/types";
import { ViewerFiltersPanelFallback } from "@/pages/viewer/ViewerContentFallbacks";

const ViewerFiltersPanel = lazy(() =>
  import("@/pages/viewer/ViewerFiltersPanel").then((module) => ({
    default: module.ViewerFiltersPanel,
  })),
);

type ViewerContentFiltersSectionProps = {
  hasRows: boolean;
  isMobile: boolean;
  showFilters: boolean;
  headers: string[];
  columnFilters: ColumnFilter[];
  onAddFilter: () => void;
  onClearAllFilters: () => void;
  onUpdateFilter: (index: number, field: ViewerFilterMutableField, value: string) => void;
  onRemoveFilter: (index: number) => void;
  onShowFiltersChange: (open: boolean) => void;
};

export function ViewerContentFiltersSection({
  hasRows,
  isMobile,
  showFilters,
  headers,
  columnFilters,
  onAddFilter,
  onClearAllFilters,
  onUpdateFilter,
  onRemoveFilter,
  onShowFiltersChange,
}: ViewerContentFiltersSectionProps) {
  if (!hasRows) {
    return null;
  }

  const filtersPanel = (
    <Suspense fallback={<ViewerFiltersPanelFallback />}>
      <ViewerFiltersPanel
        headers={headers}
        columnFilters={columnFilters}
        onAddFilter={onAddFilter}
        onClearAllFilters={onClearAllFilters}
        onUpdateFilter={onUpdateFilter}
        onRemoveFilter={onRemoveFilter}
      />
    </Suspense>
  );

  return (
    <>
      {!isMobile && showFilters ? filtersPanel : null}
      {isMobile ? (
        <Sheet open={showFilters} onOpenChange={onShowFiltersChange}>
          {showFilters ? (
            <SheetContent
              side="bottom"
              className="max-h-[88dvh] rounded-t-[1.75rem] border-border/70 bg-background/98 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4"
              data-floating-ai-avoid="true"
            >
              <SheetHeader className="pr-8 text-left">
                <SheetTitle>Column Filters</SheetTitle>
                <SheetDescription>
                  Narrow matching rows across the dataset without leaving the viewer.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">{filtersPanel}</div>
            </SheetContent>
          ) : null}
        </Sheet>
      ) : null}
    </>
  );
}
