import { AlertTriangle, ChevronDown, Copy, FileStack } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { AllAnalysisResult, DuplicateItem } from "@/pages/analysis/types";
import { TABLE_PAGE_SIZE } from "@/pages/analysis/utils";

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
  if (allResult.imports.length === 0) {
    return null;
  }

  return (
    <Collapsible open={filesListOpen} onOpenChange={onFilesListOpenChange} className="mb-8">
      <div className="glass-wrapper p-4">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex items-center justify-between gap-2 p-0 h-auto" data-testid="button-toggle-files-list">
            <div className="flex items-center gap-2">
              <FileStack className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">Analyzed Files List</span>
              <span className="text-sm text-muted-foreground">({allResult.imports.length})</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${filesListOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-4 max-h-[400px] overflow-y-auto">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0 z-10">
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
            </div>
            {allResult.imports.length > TABLE_PAGE_SIZE ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Showing {filesPaged.start + 1}-{filesPaged.end} of {allResult.imports.length.toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange("files-list", filesPaged.page - 1, allResult.imports.length)}
                    disabled={filesPaged.page <= 0}
                  >
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {filesPaged.page + 1} / {filesPaged.totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange("files-list", filesPaged.page + 1, allResult.imports.length)}
                    disabled={filesPaged.page >= filesPaged.totalPages - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
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
  return (
    <Collapsible open={duplicatesOpen} onOpenChange={onDuplicatesOpenChange}>
      <div className="glass-wrapper p-4">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex items-center justify-between gap-2 p-0 h-auto" data-testid="button-toggle-duplicates">
            <div className="flex items-center gap-2">
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
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Value</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Count</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicatesPaged.items.map((duplicate, index) => (
                      <tr key={`${duplicate.value}-${duplicatesPaged.start + index}`} className="border-t border-border hover:bg-muted/50">
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
                            data-testid={`button-copy-dup-${index}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {duplicates.length > TABLE_PAGE_SIZE ? (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Showing {duplicatesPaged.start + 1}-{duplicatesPaged.end} of {duplicates.length.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onPageChange("duplicates-list", duplicatesPaged.page - 1, duplicates.length)}
                      disabled={duplicatesPaged.page <= 0}
                    >
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {duplicatesPaged.page + 1} / {duplicatesPaged.totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onPageChange("duplicates-list", duplicatesPaged.page + 1, duplicates.length)}
                      disabled={duplicatesPaged.page >= duplicatesPaged.totalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
