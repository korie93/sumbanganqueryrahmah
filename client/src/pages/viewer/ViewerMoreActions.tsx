import { memo, useId, useMemo, useRef, useState } from "react";
import { Download, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildViewerExportMenuSections, VIEWER_EXPORT_PAGE_HINT } from "@/pages/viewer/export-menu-utils";

type ViewerMoreActionsProps = {
  isSuperuser: boolean;
  exportBusy: boolean;
  rowsCount: number;
  totalRows: number;
  filteredRowsCount: number;
  selectedRowCount: number;
  hasFilteredSubset: boolean;
  onClearAllData: () => void;
  onExportCsv: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onExportPdf: (exportFiltered?: boolean, exportSelected?: boolean) => void;
  onExportExcel: (exportFiltered?: boolean, exportSelected?: boolean) => void;
};

function ViewerMoreActionsImpl({
  isSuperuser,
  exportBusy,
  rowsCount,
  totalRows,
  filteredRowsCount,
  selectedRowCount,
  hasFilteredSubset,
  onClearAllData,
  onExportCsv,
  onExportPdf,
  onExportExcel,
}: ViewerMoreActionsProps) {
  const isMobile = useIsMobile();
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const [mobileExportOpen, setMobileExportOpen] = useState(false);
  const exportScopeHintId = useId();
  const sections = useMemo(() => buildViewerExportMenuSections({
    exportBusy, totalRows, filteredRowsCount, selectedRowCount, hasFilteredSubset,
  }), [exportBusy, filteredRowsCount, hasFilteredSubset, selectedRowCount, totalRows]);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={moreTriggerRef}
          type="button"
          variant="outline"
          data-testid="button-viewer-more-actions"
          aria-label="More dataset actions"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          <span className="viewer-more-label">More</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={12}
        className="w-56 max-w-[calc(100vw-1.5rem)]"
        onCloseAutoFocus={(event) => {
          if (mobileExportOpen) event.preventDefault();
        }}
      >
        {isSuperuser && rowsCount > 0 ? (
          <>
            {isMobile ? (
              <DropdownMenuItem
                disabled={exportBusy}
                data-testid="button-export-menu"
                className="min-h-11"
                onSelect={() => setMobileExportOpen(true)}
              >
                <Download aria-hidden="true" />
                Export
              </DropdownMenuItem>
            ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={exportBusy} data-testid="button-export-menu" className="min-h-11 sm:min-h-9">
                <Download aria-hidden="true" />
                Export
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent collisionPadding={12} className="max-h-[min(70dvh,32rem)] w-64 max-w-[calc(100vw-1.5rem)] overflow-y-auto">
                  {sections.map((section, index) => (
                    <div key={section.id}>
                      {index > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuLabel>{section.title}</DropdownMenuLabel>
                      {section.options.map((option) => (
                        <DropdownMenuItem
                          key={option.id}
                          disabled={exportBusy || option.disabled}
                          data-testid={`button-export-${option.id}`}
                          className="min-h-11 whitespace-normal break-words py-2 leading-snug sm:min-h-9"
                          aria-describedby={option.exportFiltered && !option.exportSelected ? `${exportScopeHintId}-desktop` : undefined}
                          onSelect={() => {
                            const runExport = option.kind === "csv" ? onExportCsv
                              : option.kind === "pdf" ? onExportPdf : onExportExcel;
                            runExport(option.exportFiltered, option.exportSelected);
                          }}
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                  {hasFilteredSubset ? <p id={`${exportScopeHintId}-desktop`} className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">{VIEWER_EXPORT_PAGE_HINT}</p> : null}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          onSelect={onClearAllData}
          data-testid="button-clear-all"
          className="min-h-11 text-destructive focus:text-destructive sm:min-h-9"
        >
          <Trash2 aria-hidden="true" />
          Clear viewer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {isSuperuser && rowsCount > 0 ? (
      <Sheet open={isMobile && mobileExportOpen} onOpenChange={setMobileExportOpen}>
        <SheetContent
          side="bottom"
          className="pb-[calc(var(--safe-area-inset-bottom)+1rem)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (moreTriggerRef.current?.isConnected) moreTriggerRef.current.focus({ preventScroll: true });
          }}
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Export Dataset</SheetTitle>
            <SheetDescription>Pilih skop eksport mengikut bilangan rekod yang dipaparkan.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {sections.map((section) => (
              <section key={section.id} aria-label={section.title}>
                <h3 className="mb-2 text-sm font-semibold">{section.title}</h3>
                <div className="grid gap-2">
                  {section.options.map((option) => (
                    <Button
                      key={option.id}
                      type="button"
                      variant="outline"
                      disabled={exportBusy || option.disabled}
                      data-testid={`button-export-${option.id}`}
                      className="h-auto min-h-11 justify-start whitespace-normal break-words text-left leading-snug"
                      aria-describedby={option.exportFiltered && !option.exportSelected ? `${exportScopeHintId}-mobile` : undefined}
                      onClick={() => {
                        const runExport = option.kind === "csv" ? onExportCsv
                          : option.kind === "pdf" ? onExportPdf : onExportExcel;
                        runExport(option.exportFiltered, option.exportSelected);
                        setMobileExportOpen(false);
                      }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </section>
            ))}
            {hasFilteredSubset ? <p id={`${exportScopeHintId}-mobile`} className="text-xs leading-relaxed text-muted-foreground">{VIEWER_EXPORT_PAGE_HINT}</p> : null}
          </div>
        </SheetContent>
      </Sheet>
    ) : null}
    </>
  );
}

export const ViewerMoreActions = memo(ViewerMoreActionsImpl);
