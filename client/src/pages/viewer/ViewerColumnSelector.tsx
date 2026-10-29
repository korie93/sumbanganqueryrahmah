import { Suspense, lazy, memo, useCallback, useMemo, useRef } from "react";
import { Columns } from "lucide-react";
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
import { buildViewerColumnSelectorLabel } from "@/pages/viewer/column-selector-utils";

const ViewerColumnSelectorList = lazy(() =>
  import("@/pages/viewer/ViewerColumnSelectorList").then((module) => ({
    default: module.ViewerColumnSelectorList,
  })),
);

const VIEWER_COLUMN_SELECTOR_FALLBACK_KEYS = [
  "column-a",
  "column-b",
  "column-c",
  "column-d",
  "column-e",
  "column-f",
] as const;

interface ViewerColumnSelectorProps {
  open: boolean;
  headers: string[];
  selectedColumns: Set<string>;
  pinnedColumn?: string | null | undefined;
  onPinColumn?: ((column: string) => void) | undefined;
  onOpenChange: (open: boolean) => void;
  onToggleColumn: (column: string) => void;
  onMoveColumn: (column: string, direction: -1 | 1) => void;
  onResetColumns: () => void;
  canUndoColumnReset?: boolean | undefined;
  onUndoColumnReset?: (() => void) | undefined;
  onSelectAllColumns: () => void;
  onDeselectAllColumns: () => void;
}

function ViewerColumnSelectorImpl({
  open,
  headers,
  selectedColumns,
  pinnedColumn,
  onPinColumn,
  onOpenChange,
  onToggleColumn,
  onMoveColumn,
  onResetColumns,
  canUndoColumnReset = false,
  onUndoColumnReset,
  onSelectAllColumns,
  onDeselectAllColumns,
}: ViewerColumnSelectorProps) {
  const isMobile = useIsMobile();
  const showResetUndo = canUndoColumnReset && onUndoColumnReset !== undefined;
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const handleUndoColumnReset = useCallback(() => {
    onUndoColumnReset?.();
    // Undo removes its own button; keep keyboard focus inside the open picker.
    resetButtonRef.current?.focus({ preventScroll: true });
  }, [onUndoColumnReset]);

  const trigger = useMemo(
    () => (
      <Button
        variant="outline"
        data-testid="button-column-selector"
        className="w-full sm:w-auto"
        aria-label={buildViewerColumnSelectorLabel(selectedColumns.size, headers.length)}
      >
        <Columns className="h-4 w-4" aria-hidden="true" />
        <span className="viewer-column-label">{buildViewerColumnSelectorLabel(selectedColumns.size, headers.length)}</span>
        <span className="viewer-column-short-label" aria-hidden="true">Columns</span>
      </Button>
    ),
    [headers.length, selectedColumns.size],
  );

  const selectorListFallback = useMemo(
    () => (
      <div aria-hidden="true" className="max-h-48 space-y-2 overflow-y-auto">
        {VIEWER_COLUMN_SELECTOR_FALLBACK_KEYS.slice(0, Math.min(headers.length, 6) || 4).map((fallbackKey) => (
          <div
            key={fallbackKey}
            className="h-6 animate-pulse rounded-md border border-border/50 bg-muted/20"
          />
        ))}
      </div>
    ),
    [headers.length],
  );

  const selectorContent = useMemo(
    () => (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm">Select Columns</span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSelectAllColumns}
              title="Select all dataset columns"
              data-testid="button-select-all-columns"
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeselectAllColumns}
              title="Keep only the first dataset column"
              data-testid="button-deselect-columns"
            >
              Min
            </Button>
            <Button
              ref={resetButtonRef}
              variant="ghost"
              size="sm"
              onClick={onResetColumns}
              title="Reset all dataset columns"
              data-testid="button-reset-columns"
            >
              Reset
            </Button>
          </div>
        </div>
          <div data-testid={showResetUndo ? "viewer-column-reset-notice" : undefined}
            className={showResetUndo
              ? "flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
              : "sr-only"}>
            <p role="status" aria-live="polite" aria-atomic="true" data-testid="viewer-column-reset-status"
              className="min-w-0 text-xs text-muted-foreground">
              {showResetUndo ? "Column layout reset." : ""}
            </p>
            {showResetUndo ? <Button type="button" variant="ghost" size="sm" onClick={handleUndoColumnReset}
              aria-label="Undo column reset" data-testid="button-undo-viewer-column-reset">
              Undo
            </Button> : null}
          </div>
        {open ? (
          <Suspense fallback={selectorListFallback}>
            <ViewerColumnSelectorList
              headers={headers}
              selectedColumns={selectedColumns}
              pinnedColumn={pinnedColumn}
              onPinColumn={isMobile ? undefined : onPinColumn}
              onToggleColumn={onToggleColumn}
              onMoveColumn={onMoveColumn}
            />
          </Suspense>
        ) : null}
      </div>
    ),
    [
      headers,
      onDeselectAllColumns,
      onSelectAllColumns,
      onToggleColumn,
      onMoveColumn,
      onResetColumns,
      canUndoColumnReset,
      showResetUndo,
      onUndoColumnReset,
      handleUndoColumnReset,
      onPinColumn,
      pinnedColumn,
      isMobile,
      open,
      selectedColumns,
      selectorListFallback,
    ],
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-border bg-background pb-[calc(var(--safe-area-inset-bottom)+1rem)]"
          data-floating-ai-avoid="true"
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Select Columns</SheetTitle>
            <SheetDescription>
              Choose the fields that stay visible in the dataset preview.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">{selectorContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className={onPinColumn ? "w-80" : "w-72"} align="end" aria-label="Select Columns">
        {selectorContent}
      </PopoverContent>
    </Popover>
  );
}

export const ViewerColumnSelector = memo(ViewerColumnSelectorImpl);
