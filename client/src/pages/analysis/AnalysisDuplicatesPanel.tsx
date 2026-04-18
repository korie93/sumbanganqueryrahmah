import { AlertTriangle, ChevronDown, Copy } from "lucide-react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildAnalysisDuplicateRowAriaLabel } from "@/pages/analysis/analysis-row-aria";
import { AnalysisTablePagination } from "@/pages/analysis/AnalysisTablePagination";
import type { DuplicateItem } from "@/pages/analysis/types";

type AnalysisDuplicatesPanelProps = {
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
};

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
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="font-semibold text-foreground">Duplicate Values</span>
              <span className="text-sm text-muted-foreground">({count})</span>
            </div>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${duplicatesOpen ? "rotate-180" : ""}`} />
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
                      role="group"
                      aria-label={buildAnalysisDuplicateRowAriaLabel({
                        duplicate,
                        index: duplicatesPaged.start + index + 1,
                      })}
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
                        <th className="p-3 text-left font-medium text-muted-foreground">#</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Value</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Count</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicatesPaged.items.map((duplicate, index) => (
                        <tr
                          key={duplicate.value}
                          aria-label={buildAnalysisDuplicateRowAriaLabel({
                            duplicate,
                            index: duplicatesPaged.start + index + 1,
                          })}
                          className="border-t border-border hover:bg-muted/50"
                        >
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
                              <Copy className="h-4 w-4" />
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
