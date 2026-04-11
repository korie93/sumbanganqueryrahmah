import { AlertTriangle, ChevronDown, Copy, FileStack } from "lucide-react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AllAnalysisResult, DuplicateItem } from "@/pages/analysis/types";
import { TABLE_PAGE_SIZE } from "@/pages/analysis/utils";

interface AnalysisTablePaginationProps {
  currentPage: number;
  end: number;
  label: string;
  start: number;
  totalItems: number;
  totalPages: number;
  onNext: () => void;
  onPrevious: () => void;
}

function AnalysisTablePagination({
  currentPage,
  end,
  label,
  start,
  totalItems,
  totalPages,
  onNext,
  onPrevious,
}: AnalysisTablePaginationProps) {
  if (totalItems <= TABLE_PAGE_SIZE) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-muted-foreground">
        Showing {start + 1}-{end} of {totalItems.toLocaleString()} {label}
      </span>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={currentPage <= 0}
          className="min-w-20"
        >
          Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {currentPage + 1} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={currentPage >= totalPages - 1}
          className="min-w-20"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

interface AnalysisFilesListProps {
  allResult: AllAnalysisResult;
  filesListOpen: boolean;
  filesPaged: {
    end: number;
    items: AllAnalysisResult["imports"];
    page: number;
    start: number;
    totalPages: number;
  };
  onFilesListOpenChange: (open: boolean) => void;
  onPageChange: (key: string, page: number, totalItems: number) => void;
}

export function AnalysisFilesList({
  allResult,
  filesListOpen,
  filesPaged,
  onFilesListOpenChange,
  onPageChange,
}: AnalysisFilesListProps) {
  const isMobile = useIsMobile();

  if (allResult.imports.length === 0) {
    return null;
  }

  return (
    <Collapsible open={filesListOpen} onOpenChange={onFilesListOpenChange} className="mb-8">
      <div className="glass-wrapper p-4">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-auto w-full items-start justify-between gap-3 p-0 text-left sm:items-center"
            data-testid="button-toggle-files-list"
          >
            <div className="flex min-w-0 items-center gap-2">
              <FileStack className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">Analyzed Files List</span>
              <span className="text-sm text-muted-foreground">({allResult.imports.length})</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${filesListOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-4 max-h-[400px] overflow-y-auto">
            {isMobile ? (
              <div className="space-y-3">
                {filesPaged.items.map((item, index) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          File {filesPaged.start + index + 1}
                        </p>
                        <p className="break-words font-medium text-foreground">{item.name}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {(item.rowCount || 0).toLocaleString()} rows
                      </Badge>
                    </div>

                    <dl className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                      <div className="space-y-1">
                        <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Filename
                        </dt>
                        <dd className="break-all text-sm text-foreground">{item.filename}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <HorizontalScrollHint className="rounded-lg border border-border" hint="Scroll table">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0 z-[var(--z-sticky-header)]">
                    <tr>
                      <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Filename</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Row Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filesPaged.items.map((item, index) => (
                      <tr key={item.id} className="border-t border-border hover:bg-muted/50">
                        <td className="p-3 text-muted-foreground">{filesPaged.start + index + 1}</td>
                        <td className="p-3 font-medium text-foreground">{item.name}</td>
                        <td className="p-3 text-muted-foreground">{item.filename}</td>
                        <td className="p-3 text-right">
                          <Badge variant="secondary">{(item.rowCount || 0).toLocaleString()}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </HorizontalScrollHint>
            )}
            <AnalysisTablePagination
              currentPage={filesPaged.page}
              end={filesPaged.end}
              label="files"
              start={filesPaged.start}
              totalItems={allResult.imports.length}
              totalPages={filesPaged.totalPages}
              onPrevious={() => onPageChange("files-list", filesPaged.page - 1, allResult.imports.length)}
              onNext={() => onPageChange("files-list", filesPaged.page + 1, allResult.imports.length)}
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface AnalysisDuplicatesPanelProps {
  count: number;
  duplicates: DuplicateItem[];
  duplicatesOpen: boolean;
  duplicatesPaged: {
    end: number;
    items: DuplicateItem[];
    page: number;
    start: number;
    totalPages: number;
  };
  onCopyDuplicate: (value: string) => void;
  onDuplicatesOpenChange: (open: boolean) => void;
  onPageChange: (key: string, page: number, totalItems: number) => void;
}

export function AnalysisDuplicatesPanel({
  count,
  duplicates,
  duplicatesOpen,
  duplicatesPaged,
  onCopyDuplicate,
  onDuplicatesOpenChange,
  onPageChange,
}: AnalysisDuplicatesPanelProps) {
  const isMobile = useIsMobile();

  return (
    <Collapsible open={duplicatesOpen} onOpenChange={onDuplicatesOpenChange}>
      <div className="glass-wrapper p-4">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-auto w-full items-start justify-between gap-3 p-0 text-left sm:items-center"
            data-testid="button-toggle-duplicates"
          >
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <span className="font-semibold text-foreground">Duplicate Values</span>
              <span className="text-sm text-muted-foreground">({count})</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${duplicatesOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {count === 0 ? (
            <div className="mt-4 p-6 text-center">
              <p className="text-muted-foreground">No duplicate values found.</p>
            </div>
          ) : (
            <div className="mt-4 max-h-[400px] overflow-y-auto">
              {isMobile ? (
                <div className="space-y-3">
                  {duplicatesPaged.items.map((duplicate, index) => (
                    <article
                      key={duplicate.value}
                      className="rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Duplicate {duplicatesPaged.start + index + 1}
                          </p>
                          <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                            <p className="break-all font-mono text-sm text-foreground">{duplicate.value}</p>
                          </div>
                        </div>
                        <Badge variant="destructive" className="shrink-0">
                          {duplicate.count}x
                        </Badge>
                      </div>
                      <Button
                        variant="outline"
                        className="mt-3 w-full justify-center"
                        onClick={() => onCopyDuplicate(duplicate.value)}
                        data-testid={`button-copy-dup-${index}`}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Value
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <HorizontalScrollHint className="rounded-lg border border-border" hint="Scroll table">
                  <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0 z-[var(--z-sticky-header)]">
                      <tr>
                        <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Value</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Count</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicatesPaged.items.map((duplicate, index) => (
                        <tr key={duplicate.value} className="border-t border-border hover:bg-muted/50">
                          <td className="p-3 text-muted-foreground">{duplicatesPaged.start + index + 1}</td>
                          <td className="p-3 font-mono text-foreground">{duplicate.value}</td>
                          <td className="p-3">
                            <Badge variant="destructive">{duplicate.count}x</Badge>
                          </td>
                          <td className="p-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onCopyDuplicate(duplicate.value)}
                              aria-label="Copy duplicate value"
                              title="Copy duplicate value"
                              data-testid={`button-copy-dup-${index}`}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </HorizontalScrollHint>
              )}
              <AnalysisTablePagination
                currentPage={duplicatesPaged.page}
                end={duplicatesPaged.end}
                label="duplicates"
                start={duplicatesPaged.start}
                totalItems={duplicates.length}
                totalPages={duplicatesPaged.totalPages}
                onPrevious={() => onPageChange("duplicates-list", duplicatesPaged.page - 1, duplicates.length)}
                onNext={() => onPageChange("duplicates-list", duplicatesPaged.page + 1, duplicates.length)}
              />
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
