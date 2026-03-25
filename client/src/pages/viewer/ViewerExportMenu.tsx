import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ViewerExportMenuProps {
  exportBusy: boolean;
  rowsCount: number;
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
  rowsCount,
  filteredRowsCount,
  selectedRowCount,
  selectedColumnsCount,
  headersCount,
  hasFilteredSubset,
  onExportCsv,
  onExportPdf,
  onExportExcel,
}: ViewerExportMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={exportBusy} data-testid="button-export-menu">
          {exportBusy ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Export
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-2 pb-1">CSV Export</p>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => onExportCsv(false, false)}
            data-testid="button-export-csv-all"
          >
            <Download className="w-4 h-4 mr-2" />
            All Data ({rowsCount} rows)
          </Button>
          {hasFilteredSubset ? (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => onExportCsv(true, false)}
              data-testid="button-export-csv-filtered"
            >
              <Download className="w-4 h-4 mr-2" />
              Filtered ({filteredRowsCount} rows)
            </Button>
          ) : null}
          {selectedRowCount > 0 ? (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => onExportCsv(true, true)}
              data-testid="button-export-csv-selected"
            >
              <Download className="w-4 h-4 mr-2" />
              Selected ({selectedRowCount} rows)
            </Button>
          ) : null}
          <div className="border-t my-2" />
          <p className="text-xs font-medium text-muted-foreground px-2 pb-1">PDF Export</p>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => onExportPdf(false, false)}
            disabled={exportBusy}
            data-testid="button-export-pdf-all"
          >
            <FileText className="w-4 h-4 mr-2" />
            All Data ({rowsCount} rows)
          </Button>
          {hasFilteredSubset ? (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => onExportPdf(true, false)}
              disabled={exportBusy}
              data-testid="button-export-pdf-filtered"
            >
              <FileText className="w-4 h-4 mr-2" />
              Filtered ({filteredRowsCount} rows)
            </Button>
          ) : null}
          {selectedRowCount > 0 ? (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => onExportPdf(true, true)}
              disabled={exportBusy}
              data-testid="button-export-pdf-selected"
            >
              <FileText className="w-4 h-4 mr-2" />
              Selected ({selectedRowCount} rows)
            </Button>
          ) : null}
          <div className="border-t my-2" />
          <p className="text-xs font-medium text-muted-foreground px-2 pb-1">Excel Export</p>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => onExportExcel(false, false)}
            disabled={exportBusy}
            data-testid="button-export-excel-all"
          >
            <Download className="w-4 h-4 mr-2" />
            All Data ({rowsCount} rows)
          </Button>
          {hasFilteredSubset ? (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => onExportExcel(true, false)}
              disabled={exportBusy}
              data-testid="button-export-excel-filtered"
            >
              <Download className="w-4 h-4 mr-2" />
              Filtered ({filteredRowsCount} rows)
            </Button>
          ) : null}
          {selectedRowCount > 0 ? (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => onExportExcel(true, true)}
              disabled={exportBusy}
              data-testid="button-export-excel-selected"
            >
              <Download className="w-4 h-4 mr-2" />
              Selected ({selectedRowCount} rows)
            </Button>
          ) : null}
          <div className="border-t pt-2 mt-2">
            <p className="text-xs text-muted-foreground px-2">
              Columns: {selectedColumnsCount} of {headersCount}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
