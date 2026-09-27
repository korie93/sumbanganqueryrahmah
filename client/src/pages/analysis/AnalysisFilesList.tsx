import { ChevronDown, FileStack } from "lucide-react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildAnalysisFileRowAriaLabel } from "@/pages/analysis/analysis-row-aria";
import { AnalysisTablePagination } from "@/pages/analysis/AnalysisTablePagination";
import type { AllAnalysisResult } from "@/pages/analysis/types";

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
    <Collapsible open={filesListOpen} onOpenChange={onFilesListOpenChange} className="mb-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex min-h-11 h-auto w-full items-center justify-between gap-3 p-0 text-left sm:min-h-9"
            data-testid="button-toggle-files-list"
          >
            <div className="flex min-w-0 items-center gap-2">
              <FileStack className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="font-semibold text-foreground">Analyzed Files List</span>
              <span className="text-sm text-muted-foreground">({allResult.imports.length})</span>
            </div>
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${filesListOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-4 max-h-[400px] overflow-y-auto">
            {isMobile ? (
              <div className="divide-y divide-border">
                {filesPaged.items.map((item, index) => (
                  <article
                    key={item.id}
                    role="group"
                    aria-label={buildAnalysisFileRowAriaLabel({
                      index: filesPaged.start + index + 1,
                      item,
                    })}
                    className="py-3 first:pt-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs text-muted-foreground">
                          File {filesPaged.start + index + 1}
                        </p>
                        <p className="break-words font-medium text-foreground">{item.name}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 tabular-nums">
                        {(item.rowCount || 0).toLocaleString()} rows
                      </Badge>
                    </div>

                    <dl className="mt-2">
                      <div className="space-y-1">
                        <dt className="text-xs text-muted-foreground">
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
                  <thead className="sticky top-0 z-[var(--z-sticky-header)] bg-muted">
                    <tr>
                      <th scope="col" className="p-3 text-left font-medium text-muted-foreground">#</th>
                      <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Name</th>
                      <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Filename</th>
                      <th scope="col" className="p-3 text-right font-medium text-muted-foreground">Row Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filesPaged.items.map((item, index) => (
                      <tr
                        key={item.id}
                        aria-label={buildAnalysisFileRowAriaLabel({
                          index: filesPaged.start + index + 1,
                          item,
                        })}
                        className="border-t border-border hover:bg-muted/50"
                      >
                        <td className="p-3 text-muted-foreground">{filesPaged.start + index + 1}</td>
                        <td className="p-3 font-medium text-foreground">{item.name}</td>
                        <td className="p-3 text-muted-foreground">{item.filename}</td>
                        <td className="p-3 text-right tabular-nums">
                          {(item.rowCount || 0).toLocaleString()}
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
