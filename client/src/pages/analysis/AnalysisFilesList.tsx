import { ChevronDown, FileStack } from "lucide-react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildAnalysisFileRowAriaLabel } from "@/pages/analysis/analysis-row-aria";
import { AnalysisTablePagination } from "@/pages/analysis/AnalysisTablePagination";
import type { AllAnalysisResult } from "@/pages/analysis/types";

type AnalysisFilesListProps = {
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
};

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
              <FileStack className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Analyzed Files List</span>
              <span className="text-sm text-muted-foreground">({allResult.imports.length})</span>
            </div>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${filesListOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-4 max-h-[400px] overflow-y-auto">
            {isMobile ? (
              <div className="space-y-3">
                {filesPaged.items.map((item, index) => (
                  <article
                    key={item.id}
                    role="group"
                    aria-label={buildAnalysisFileRowAriaLabel({
                      index: filesPaged.start + index + 1,
                      item,
                    })}
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
                      <th className="p-3 text-left font-medium text-muted-foreground">#</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Filename</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">Row Count</th>
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
