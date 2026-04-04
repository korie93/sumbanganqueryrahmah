import { Suspense, lazy } from "react";
import { Columns } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildViewerColumnSelectorLabel } from "@/pages/viewer/column-selector-utils";

const ViewerColumnSelectorList = lazy(() =>
  import("@/pages/viewer/ViewerColumnSelectorList").then((module) => ({
    default: module.ViewerColumnSelectorList,
  })),
);

interface ViewerColumnSelectorProps {
  open: boolean;
  headers: string[];
  selectedColumns: Set<string>;
  onOpenChange: (open: boolean) => void;
  onToggleColumn: (column: string) => void;
  onSelectAllColumns: () => void;
  onDeselectAllColumns: () => void;
}

export function ViewerColumnSelector({
  open,
  headers,
  selectedColumns,
  onOpenChange,
  onToggleColumn,
  onSelectAllColumns,
  onDeselectAllColumns,
}: ViewerColumnSelectorProps) {
  const isMobile = useIsMobile();

  const trigger = (
    <Button variant="outline" data-testid="button-column-selector" className="w-full sm:w-auto">
      <Columns className="w-4 h-4 mr-2" />
      {buildViewerColumnSelectorLabel(selectedColumns.size, headers.length)}
    </Button>
  );

  const selectorListFallback = (
    <div aria-hidden="true" className="max-h-48 space-y-2 overflow-y-auto">
      {Array.from({ length: Math.min(headers.length, 6) || 4 }).map((_, index) => (
        <div
          key={index}
          className="h-6 animate-pulse rounded-md border border-border/50 bg-muted/20"
        />
      ))}
    </div>
  );

  const selectorContent = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">Select Columns</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAllColumns}
            data-testid="button-select-all-columns"
          >
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeselectAllColumns}
            data-testid="button-deselect-columns"
          >
            Min
          </Button>
        </div>
      </div>
      {open ? (
        <Suspense fallback={selectorListFallback}>
          <ViewerColumnSelectorList
            headers={headers}
            selectedColumns={selectedColumns}
            onToggleColumn={onToggleColumn}
          />
        </Suspense>
      ) : null}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[80dvh] rounded-t-[24px] border-border/70 bg-background/98"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
          data-floating-ai-avoid="true"
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Select Columns</SheetTitle>
            <SheetDescription>
              Choose the fields that stay visible in the dataset preview.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">{selectorContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        {selectorContent}
      </PopoverContent>
    </Popover>
  );
}
