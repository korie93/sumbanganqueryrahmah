import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { DataRowWithId } from "@/pages/viewer/types";
import { filterViewerDetailFields, getViewerDetailFields, isViewerDetailValueEmpty } from "@/pages/viewer/viewer-column-presentation";
import { ViewerFieldCopyButton } from "@/pages/viewer/ViewerFieldCopyButton";
import styles from "./ViewerRowDetails.module.css";

interface ViewerDetailFieldsProps {
  row: DataRowWithId;
  headers: string[];
}

/** Local field-name search within one open, authorized record. */
export function ViewerDetailFields({ row, headers }: ViewerDetailFieldsProps) {
  const [search, setSearch] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hideEmptyRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const resultsId = `${searchId}-results`;
  const statusId = `${searchId}-status`;
  const hideEmptyId = `${searchId}-hide-empty`;
  const hiddenCountId = `${searchId}-hidden-count`;
  const fields = useMemo(() => getViewerDetailFields(row, headers), [row, headers]);
  const searchMatches = useMemo(() => filterViewerDetailFields(fields, search), [fields, search]);
  const matches = useMemo(() => hideEmpty
    ? searchMatches.filter(({ header }) => !isViewerDetailValueEmpty(row[header]))
    : searchMatches, [hideEmpty, searchMatches, row]);
  const hiddenCount = searchMatches.length - matches.length;
  const searching = search.trim().length > 0;
  const showSummary = searching || hideEmpty;
  const summaryDescription = showSummary
    ? `${statusId}${hiddenCount > 0 ? ` ${hiddenCountId}` : ""}` : undefined;
  const clearSearch = useCallback(() => {
    setSearch("");
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  const showEmptyFields = useCallback(() => {
    setHideEmpty(false);
    hideEmptyRef.current?.focus({ preventScroll: true });
  }, []);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [search, hideEmpty]);

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${styles.fields}`}>
      <div data-testid="viewer-detail-search-controls"
        className={`flex min-w-0 shrink-0 flex-col border-b border-border px-5 sm:px-6 ${styles.controls}`}>
        <Label htmlFor={searchId} className="text-xs font-medium">Cari medan</Label>
        <div className="relative">
          <Input
            ref={inputRef}
            id={searchId}
            name="viewerDetailSearchQuery"
            type="text"
            inputMode="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Taip nama medan…"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-controls={resultsId}
            aria-describedby={summaryDescription}
            className="h-11 min-w-0 pr-11 sm:h-9"
            data-testid="input-viewer-detail-search"
          />
          {search.length > 0 ? (
            <Button type="button" variant="ghost" size="icon"
              className="absolute right-0 top-0 h-11 w-11 sm:h-9 sm:w-9"
              aria-label="Kosongkan carian medan" onClick={clearSearch}
              data-testid="button-clear-viewer-detail-search">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <Label htmlFor={hideEmptyId} className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-xs font-normal"
          data-testid="label-viewer-hide-empty">
          <Switch ref={hideEmptyRef} id={hideEmptyId} type="button" name="viewerHideEmpty"
            checked={hideEmpty} onCheckedChange={setHideEmpty}
            aria-controls={resultsId} aria-describedby={summaryDescription}
            className="motion-reduce:transition-none motion-reduce:[&>span]:transition-none"
            data-testid="switch-viewer-hide-empty" />
          Sorok medan kosong
        </Label>
        <p id={statusId} role="status" aria-live="polite" aria-atomic="true"
          className={showSummary ? "text-xs text-muted-foreground" : "sr-only"}>
          {showSummary ? `${matches.length.toLocaleString("en-MY")} daripada ${fields.length.toLocaleString("en-MY")} medan` : ""}
        </p>
        {hiddenCount > 0 ? <p id={hiddenCountId} className="text-xs text-muted-foreground">
          {hiddenCount.toLocaleString("en-MY")} medan kosong disorok.
        </p> : null}
      </div>
      <div ref={scrollRef} data-testid="viewer-detail-scroll" role="region" aria-label="Medan rekod" tabIndex={0}
        className={`min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${styles.scroller}`}>
        <dl id={resultsId} data-testid="viewer-detail-search-results" className="min-w-0 divide-y divide-border px-5 sm:px-6">
          {matches.map(({ header, value }) => (
            <div key={header} className="grid min-w-0 gap-1.5 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
              <dt className="break-words text-xs font-medium leading-5 text-muted-foreground [overflow-wrap:anywhere]">{header}</dt>
              <dd className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 text-sm leading-6 text-foreground">
                <span data-viewer-detail-value className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{value}</span>
                <ViewerFieldCopyButton key={`${row.__rowId}-${header}`} header={header} value={value}
                  disabled={isViewerDetailValueEmpty(row[header])} />
              </dd>
            </div>
          ))}
        </dl>
        {matches.length === 0 ? (
          <div className="space-y-3 px-5 py-8 text-center sm:px-6">
            <p className="text-sm text-muted-foreground">{hiddenCount > 0 ? "Semua medan sepadan kosong." : "Tiada medan sepadan."}</p>
            {hiddenCount > 0 ? <Button type="button" variant="outline" size="sm" onClick={showEmptyFields}>
              Paparkan medan kosong
            </Button> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
