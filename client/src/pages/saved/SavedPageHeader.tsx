import type { RefObject } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SavedPageHeaderProps = {
  loading: boolean;
  error: boolean;
  totalImports: number;
  filtered: boolean;
  selectedCount: number;
  actionsDisabled: boolean;
  refreshRef: RefObject<HTMLButtonElement>;
  onRefresh: () => void;
  onBulkDelete: (trigger: HTMLButtonElement) => void;
};

export function SavedPageHeader({
  loading, error, totalImports, filtered, selectedCount, actionsDisabled,
  refreshRef, onRefresh, onBulkDelete,
}: SavedPageHeaderProps) {
  return (
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3" data-saved-ai-avoid="true">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Saved Imports</h1>
          {!loading && !error ? (
            <Badge variant="secondary" className="max-w-full rounded-full text-xs tabular-nums" data-testid="text-import-count">
              {totalImports.toLocaleString()} {filtered ? "matching" : totalImports === 1 ? "file" : "files"}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Reopen files in Viewer or Analysis.</p>
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        {selectedCount > 0 ? (
          <Button
            variant="destructive"
            className="h-11 px-3 md:h-9"
            onClick={(event) => onBulkDelete(event.currentTarget)}
            disabled={actionsDisabled}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Delete Selected ({selectedCount})
          </Button>
        ) : null}
        <Button
          ref={refreshRef}
          variant="outline"
          className="h-11 px-3 md:h-9"
          onClick={onRefresh}
          disabled={actionsDisabled}
          data-testid="button-refresh"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>
    </header>
  );
}
