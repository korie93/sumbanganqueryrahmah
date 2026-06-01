import { Suspense, lazy, memo, useCallback, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
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
import {
  buildViewerExportMenuSections,
  type ViewerExportActionKind,
} from "@/pages/viewer/export-menu-utils";

const ViewerExportOptionsList = lazy(() =>
  import("@/pages/viewer/ViewerExportOptionsList").then((module) => ({
    default: module.ViewerExportOptionsList,
  })),
);

const VIEWER_EXPORT_OPTION_FALLBACK_KEYS = [
  "csv-option",
  "pdf-option",
  "excel-option",
  "selected-option",
] as const;

interface ViewerExportMenuProps {
  exportBusy: boolean;
  totalRows: number;
  filteredRowsCount: number;
  selectedRowCount: number;
  selectedColumnsCount: number;
  headersCount: number;
  hasFilteredSubset: boolean;
  onExportCsv: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onExportPdf: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onExportExcel: (exportFiltered?: boolean, exportSelected?: boolean) => void;
}

function ViewerExportMenuImpl({
  exportBusy,
  totalRows,
  filteredRowsCount,
  selectedRowCount,
  selectedColumnsCount,
  headersCount,
  hasFilteredSubset,
  onExportCsv,
  onExportPdf,
  onExportExcel,
}: ViewerExportMenuProps) {
  const isMobile = useIsMobile();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [desktopPopoverOpen, setDesktopPopoverOpen] = useState(false);
  const sections = useMemo(
    () =>
      buildViewerExportMenuSections({
        exportBusy,
        totalRows,
        filteredRowsCount,
        selectedRowCount,
        hasFilteredSubset,
      }),
    [exportBusy, filteredRowsCount, hasFilteredSubset, selectedRowCount, totalRows],
  );

  const runExport = useCallback((
    closeAfterAction: boolean,
    kind: ViewerExportActionKind,
    exportFiltered = false,
    exportSelected = false,
  ) => {
    if (kind === "csv") {
      onExportCsv(exportFiltered, exportSelected);
    } else if (kind === "pdf") {
      onExportPdf(exportFiltered, exportSelected);
    } else {
      onExportExcel(exportFiltered, exportSelected);
    }

    if (closeAfterAction) {
      setMobileSheetOpen(false);
    }
  }, [onExportCsv, onExportExcel, onExportPdf]);

  const runMobileExport = useCallback((
    kind: ViewerExportActionKind,
    exportFiltered: boolean,
    exportSelected: boolean,
  ) => {
    runExport(true, kind, exportFiltered, exportSelected);
  }, [runExport]);

  const runDesktopExport = useCallback((
    kind: ViewerExportActionKind,
    exportFiltered: boolean,
    exportSelected: boolean,
  ) => {
    runExport(false, kind, exportFiltered, exportSelected);
  }, [runExport]);

  const trigger = useMemo(
    () => (
      <Button variant="outline" disabled={exportBusy} data-testid="button-export-menu" className="w-full sm:w-auto">
        {exportBusy ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Download className="w-4 h-4 mr-2" />
        )}
        Export
      </Button>
    ),
    [exportBusy],
  );

  const exportOptionsFallback = useMemo(
    () => (
      <div aria-hidden="true" className="space-y-2">
        {VIEWER_EXPORT_OPTION_FALLBACK_KEYS.map((fallbackKey) => (
          <div
            key={fallbackKey}
            className="h-9 animate-pulse rounded-md border border-border/50 bg-muted/20"
          />
        ))}
      </div>
    ),
    [],
  );

  if (isMobile) {
    return (
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[80dvh] rounded-t-[24px] pb-[calc(var(--safe-area-inset-bottom)+1rem)]"
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Export Dataset</SheetTitle>
            <SheetDescription>
              Export all rows, filtered rows, or selected rows without leaving the viewer.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {mobileSheetOpen ? (
              <Suspense fallback={exportOptionsFallback}>
                <ViewerExportOptionsList
                  headersCount={headersCount}
                  sections={sections}
                  selectedColumnsCount={selectedColumnsCount}
                  onRunExport={runMobileExport}
                />
              </Suspense>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={desktopPopoverOpen} onOpenChange={setDesktopPopoverOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        {desktopPopoverOpen ? (
          <Suspense fallback={exportOptionsFallback}>
            <ViewerExportOptionsList
              headersCount={headersCount}
              sections={sections}
              selectedColumnsCount={selectedColumnsCount}
              onRunExport={runDesktopExport}
            />
          </Suspense>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export const ViewerExportMenu = memo(ViewerExportMenuImpl);
