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

interface GeneralSearchExportMenuProps {
  exportingPdf: boolean;
  totalResults: number;
  visibleResultsCount: number;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

export function GeneralSearchExportMenu({
  exportingPdf,
  totalResults,
  visibleResultsCount,
  onExportCsv,
  onExportPdf,
}: GeneralSearchExportMenuProps) {
  const isMobile = useIsMobile();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const closeAfterAction = (action: () => void) => {
    action();
    setMobileSheetOpen(false);
  };

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      disabled={exportingPdf}
      data-testid="button-export"
      className="w-full sm:w-auto"
    >
      {exportingPdf ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      Export
    </Button>
  );

  const exportOptions = (
    <div className="space-y-1">
      <p className="px-2 pb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Available Exports
      </p>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={isMobile ? () => closeAfterAction(onExportCsv) : onExportCsv}
        data-testid="button-export-csv"
      >
        <Download className="mr-2 h-4 w-4" />
        Export CSV
      </Button>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={isMobile ? () => closeAfterAction(onExportPdf) : onExportPdf}
        disabled={exportingPdf}
        data-testid="button-export-pdf"
      >
        <FileText className="mr-2 h-4 w-4" />
        Export PDF
      </Button>
      <div className="border-t border-border/60 pt-2">
        <p className="px-2 text-xs text-muted-foreground">
          Showing {visibleResultsCount} result{visibleResultsCount === 1 ? "" : "s"} on this page from {totalResults} total matches.
        </p>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[75dvh] rounded-t-[24px] pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]"
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Export Results</SheetTitle>
            <SheetDescription>
              Export the current general search result set without leaving the page.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">{exportOptions}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-60" align="end">
        {exportOptions}
      </PopoverContent>
    </Popover>
  );
}
