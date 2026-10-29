import { memo, useCallback, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Pin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { filterViewerColumnSelectorHeaders } from "@/pages/viewer/column-selector-utils";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import styles from "./ViewerColumnSelectorList.module.css";

interface ViewerColumnSelectorListProps {
  headers: string[];
  selectedColumns: Set<string>;
  pinnedColumn?: string | null | undefined;
  onPinColumn?: ((column: string) => void) | undefined;
  onToggleColumn: (column: string) => void;
  onMoveColumn: (column: string, direction: -1 | 1) => void;
}

interface ViewerColumnSelectorItemProps {
  header: string;
  selected: boolean;
  pinned: boolean;
  onPinColumn?: ((column: string) => void) | undefined;
  onToggleColumn: (column: string) => void;
  onMoveColumn: (column: string, direction: -1 | 1) => void;
  canMoveDown: boolean;
  canMoveUp: boolean;
}

const ViewerColumnSelectorItem = memo(function ViewerColumnSelectorItem({
  header,
  selected,
  pinned,
  onPinColumn,
  onToggleColumn,
  onMoveColumn,
  canMoveDown,
  canMoveUp,
}: ViewerColumnSelectorItemProps) {
  const checkboxId = useId();
  const handleToggleColumn = useCallback(() => {
    onToggleColumn(header);
  }, [header, onToggleColumn]);
  const handleMoveUp = useCallback(() => {
    onMoveColumn(header, -1);
  }, [header, onMoveColumn]);
  const handleMoveDown = useCallback(() => {
    onMoveColumn(header, 1);
  }, [header, onMoveColumn]);
  const handlePinColumn = useCallback(() => {
    onPinColumn?.(header);
  }, [header, onPinColumn]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={selected}
          className="shrink-0"
          onCheckedChange={handleToggleColumn}
          data-testid={`checkbox-column-${header}`}
        />
        <Label htmlFor={checkboxId} title={header}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center text-sm md:min-h-8">
          <span data-viewer-column-name className={styles.columnName}>{header}</span>
        </Label>
      </div>
      <div className="flex items-center">
        {onPinColumn ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${pinned ? "bg-primary/10 text-primary" : ""}`}
            aria-label={`Pin ${header}`}
            {...getAriaPressedProps(pinned)}
            title={!selected ? `Show ${header} before pinning` : `${pinned ? "Unpin" : "Pin"} ${header}`}
            disabled={!selected}
            onClick={handlePinColumn}
            data-viewer-pin-control
          >
            <Pin className={pinned ? "fill-current" : undefined} aria-hidden="true" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 sm:h-8 sm:w-8"
          title={`Move ${header} up`}
          disabled={!canMoveUp}
          onClick={handleMoveUp}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 sm:h-8 sm:w-8"
          title={`Move ${header} down`}
          disabled={!canMoveDown}
          onClick={handleMoveDown}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
});

function ViewerColumnSelectorListImpl({
  headers,
  selectedColumns,
  pinnedColumn,
  onPinColumn,
  onToggleColumn,
  onMoveColumn,
}: ViewerColumnSelectorListProps) {
  // The list mounts only while Columns is open, keeping search local and short-lived.
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const resultsId = `${searchId}-results`;
  const statusId = `${searchId}-status`;
  const searching = search.trim().length > 0;
  const matches = useMemo(() => filterViewerColumnSelectorHeaders(headers, search), [headers, search]);
  const clearSearch = useCallback(() => {
    setSearch("");
    searchRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="min-w-0 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={searchId} className="text-xs font-medium">Cari lajur</Label>
        <div className="relative">
          <Input
            ref={searchRef}
            id={searchId}
            name="viewerColumnSearchQuery"
            type="text"
            inputMode="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Taip nama lajur…"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-controls={resultsId}
            aria-describedby={searching ? statusId : undefined}
            className="h-11 min-w-0 pr-11 sm:h-9"
            data-testid="input-viewer-column-search"
          />
          {search.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-11 w-11 sm:h-9 sm:w-9"
              onClick={clearSearch}
              aria-label="Kosongkan carian lajur"
              data-testid="button-clear-viewer-column-search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <p id={statusId} role="status" aria-live="polite" aria-atomic="true"
          className={searching ? "text-xs text-muted-foreground" : "sr-only"}>
          {searching ? `${matches.length.toLocaleString("en-MY")} daripada ${headers.length.toLocaleString("en-MY")} lajur` : ""}
        </p>
      </div>
      <div id={resultsId} data-testid="viewer-column-search-results" className="max-h-48 space-y-2 overflow-y-auto scroll-fade-y">
        {matches.map(({ header, index }) => (
          <ViewerColumnSelectorItem
            key={header}
            header={header}
            selected={selectedColumns.has(header)}
            pinned={pinnedColumn === header}
            onPinColumn={onPinColumn}
            onToggleColumn={onToggleColumn}
            onMoveColumn={onMoveColumn}
            canMoveUp={index > 0}
            canMoveDown={index < headers.length - 1}
          />
        ))}
        {matches.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Tiada lajur sepadan.</p> : null}
      </div>
      {onPinColumn ? <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {pinnedColumn ? `Lajur ${pinnedColumn} dipin di kiri untuk desktop.` : "Tiada lajur dipin."}
      </p> : null}
    </div>
  );
}

export const ViewerColumnSelectorList = memo(ViewerColumnSelectorListImpl);
