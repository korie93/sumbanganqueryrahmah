import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
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

export function ViewerExportMenu({
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

  const renderExportOptions = (closeAfterAction: boolean) => {
    const runExport = (
      action: (exportFiltered?: boolean, exportSelected?: boolean) => void,
      exportFiltered?: boolean,
      exportSelected?: boolean,
    ) => {
      action(exportFiltered, exportSelected);
      if (closeAfterAction) {
        setMobileSheetOpen(false);
      }
    };

    return (
      <div className="space-y-1">
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">CSV Export</p>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => runExport(onExportCsv, false, false)}
          data-testid="button-export-csv-all"
        >
          <Download className="w-4 h-4 mr-2" />
          All Data ({totalRows} rows)
        </Button>
        {hasFilteredSubset ? (
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => runExport(onExportCsv, true, false)}
            data-testid="button-export-csv-filtered"
          >
            <Download className="w-4 h-4 mr-2" />
            Filtered View ({filteredRowsCount} shown)
          </Button>
        ) : null}
        {selectedRowCount > 0 ? (
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => runExport(onExportCsv, true, true)}
            data-testid="button-export-csv-selected"
          >
            <Download className="w-4 h-4 mr-2" />
            Selected ({selectedRowCount} rows)
          </Button>
        ) : null}
        <div className="border-t my-2" />
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">PDF Export</p>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => runExport(onExportPdf, false, false)}
          disabled={exportBusy}
          data-testid="button-export-pdf-all"
        >
          <FileText className="w-4 h-4 mr-2" />
          All Data ({totalRows} rows)
        </Button>
        {hasFilteredSubset ? (
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => runExport(onExportPdf, true, false)}
            disabled={exportBusy}
            data-testid="button-export-pdf-filtered"
          >
            <FileText className="w-4 h-4 mr-2" />
            Filtered View ({filteredRowsCount} shown)
          </Button>
        ) : null}
        {selectedRowCount > 0 ? (
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => runExport(onExportPdf, true, true)}
            disabled={exportBusy}
            data-testid="button-export-pdf-selected"
          >
            <FileText className="w-4 h-4 mr-2" />
            Selected ({selectedRowCount} rows)
          </Button>
        ) : null}
        <div className="border-t my-2" />
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Excel Export</p>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => runExport(onExportExcel, false, false)}
          disabled={exportBusy}
          data-testid="button-export-excel-all"
        >
          <Download className="w-4 h-4 mr-2" />
          All Data ({totalRows} rows)
        </Button>
        {hasFilteredSubset ? (
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => runExport(onExportExcel, true, false)}
            disabled={exportBusy}
            data-testid="button-export-excel-filtered"
          >
            <Download className="w-4 h-4 mr-2" />
            Filtered View ({filteredRowsCount} shown)
          </Button>
        ) : null}
        {selectedRowCount > 0 ? (
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => runExport(onExportExcel, true, true)}
            disabled={exportBusy}
            data-testid="button-export-excel-selected"
          >
            <Download className="w-4 h-4 mr-2" />
            Selected ({selectedRowCount} rows)
          </Button>
        ) : null}
        <div className="border-t mt-2 pt-2">
          <p className="px-2 text-xs text-muted-foreground">
            Columns: {selectedColumnsCount} of {headersCount}
          </p>
        </div>
      </div>
    );
  };

  const trigger = (
    <Button variant="outline" disabled={exportBusy} data-testid="button-export-menu" className="w-full sm:w-auto">
      {exportBusy ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Download className="w-4 h-4 mr-2" />
      )}
      Export
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[80dvh] rounded-t-[24px]"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Export Dataset</SheetTitle>
            <SheetDescription>
              Export all rows, filtered rows, or selected rows without leaving the viewer.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">{renderExportOptions(true)}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        {renderExportOptions(false)}
      </PopoverContent>
    </Popover>
  );
}
