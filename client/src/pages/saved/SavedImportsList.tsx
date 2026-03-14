import { BarChart3, BookMarked, ChevronDown, Edit2, Eye, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ImportItem } from "@/pages/saved/types";

interface SavedImportsListProps {
  imports: ImportItem[];
  isSuperuser: boolean;
  filesOpen: boolean;
  onFilesOpenChange: (open: boolean) => void;
  onView: (item: ImportItem) => void;
  onRename: (item: ImportItem) => void;
  onAnalysis: (item: ImportItem) => void;
  onDelete: (item: ImportItem) => void;
  formatDate: (dateStr: string) => string;
}

export function SavedImportsList({
  imports,
  isSuperuser,
  filesOpen,
  onFilesOpenChange,
  onView,
  onRename,
  onAnalysis,
  onDelete,
  formatDate,
}: SavedImportsListProps) {
  if (imports.length === 0) {
    return (
      <div className="glass-wrapper p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Search className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-foreground font-medium mb-2">No results found</p>
        <p className="text-sm text-muted-foreground mb-4">
          Try adjusting your search or filter criteria.
        </p>
      </div>
    );
  }

  return (
    <Collapsible open={filesOpen} onOpenChange={onFilesOpenChange}>
      <div className="glass-wrapper p-4">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between gap-2 p-0 h-auto"
            data-testid="button-toggle-files"
          >
            <div className="flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">Saved Files</span>
              <span className="text-sm text-muted-foreground">({imports.length} files)</span>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                filesOpen ? "rotate-180" : ""
              }`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-4 max-h-[400px] overflow-y-auto pr-2 space-y-3">
            {imports.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-lg border bg-muted/30 flex items-center justify-between gap-4"
                data-testid={`card-import-${item.id}`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <BookMarked className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-foreground truncate">{item.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {item.filename} • {formatDate(item.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onView(item)}
                    data-testid={`button-view-${item.id}`}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    View
                  </Button>
                  {isSuperuser ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRename(item)}
                      data-testid={`button-rename-${item.id}`}
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Rename
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAnalysis(item)}
                    data-testid={`button-analysis-${item.id}`}
                  >
                    <BarChart3 className="w-4 h-4 mr-1" />
                    Analysis
                  </Button>
                  {isSuperuser ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(item)}
                      className="text-destructive"
                      data-testid={`button-delete-${item.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
