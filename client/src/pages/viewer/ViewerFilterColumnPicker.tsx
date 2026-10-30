import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { findViewerFilterColumns, moveViewerFilterColumnIndex } from "@/pages/viewer/viewer-filter-column-search";

type ViewerFilterColumnPickerProps = {
  headers: string[];
  value: string;
  index: number;
  labelledBy: string;
  onValueChange: (column: string) => void;
};

/** Search affects only the available header names; selecting commits the exact header. */
function ViewerFilterColumnPickerImpl({
  headers, value, index, labelledBy, onValueChange,
}: ViewerFilterColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const pickerId = useId();
  const inputId = `${pickerId}-search`;
  const listId = `${pickerId}-columns`;
  const valueId = `viewer-filter-column-value-${index}`;
  const options = useMemo(() => findViewerFilterColumns(headers, query), [headers, query]);
  const activeOption = options[Math.max(0, Math.min(activeIndex, options.length - 1))];
  const activeOptionId = activeOption ? `${listId}-${activeOption.index}` : undefined;
  useEffect(() => {
    if (open) activeOptionRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open, activeOptionId]);
  const handleOpenChange = useCallback((next: boolean) => {
    setQuery("");
    setActiveIndex(0);
    setOpen(next);
  }, []);
  const handleTriggerKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      handleOpenChange(true);
      if (event.key === "ArrowUp") setActiveIndex(Math.max(0, headers.length - 1));
    }
  }, [handleOpenChange, headers.length]);
  const handleSelect = useCallback((column: string) => {
    if (column !== value) onValueChange(column);
    handleOpenChange(false);
  }, [handleOpenChange, onValueChange, value]);
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const next = moveViewerFilterColumnIndex(activeIndex, options.length, event.key);
    if (next !== null) {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (activeOption) handleSelect(activeOption.header);
    }
  };
  const handleEscape = useCallback((event: globalThis.KeyboardEvent) => {
    // Radix listens during document capture. Consume the inner Escape before
    // the surrounding mobile Sheet or page-level shortcut can also dismiss.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.isComposing || event.keyCode === 229) return;
    handleOpenChange(false);
  }, [handleOpenChange]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-labelledby={labelledBy}
          aria-describedby={valueId}
          className="h-11 w-full min-w-0 justify-between px-3 py-2 sm:h-9 sm:w-40"
          onKeyDown={handleTriggerKeyDown}
          data-testid={`select-filter-column-${index}`}
        >
          <span id={valueId} className="min-w-0 truncate text-left" title={value}>{value || "Select column"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={8}
        aria-label={`Filter ${index + 1} column picker`}
        className="w-80 max-h-[var(--radix-popover-content-available-height)] max-w-[calc(100vw-1rem)] overflow-hidden p-0"
        data-testid={`viewer-filter-column-picker-${index}`}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={handleEscape}
        data-floating-ai-avoid="true"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            id={inputId}
            name={`viewerFilterColumnSearch${index + 1}`}
            role="combobox"
            aria-label="Search filter columns"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            autoComplete="off"
            placeholder="Search columns…"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
            onKeyDown={handleInputKeyDown}
            className="h-11 min-w-0 border-0 bg-transparent px-0 shadow-none focus-visible:ring-inset"
            data-testid={`input-filter-column-search-${index}`}
          />
        </div>
          <div id={listId} role="listbox" aria-label="Filter columns" className="max-h-[min(18rem,45dvh,calc(var(--radix-popover-content-available-height)-3rem))] overflow-y-auto overscroll-contain p-1">
            {options.map(({ header, index: originalIndex }, optionIndex) => (
              <button
                key={originalIndex}
                type="button"
                tabIndex={-1}
                id={`${listId}-${originalIndex}`}
                ref={originalIndex === activeOption?.index ? activeOptionRef : undefined}
                role="option"
                aria-selected={originalIndex === activeOption?.index}
                data-selected={originalIndex === activeOption?.index}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={(event) => { if (event.pointerType === "mouse") setActiveIndex(optionIndex); }}
                onClick={() => handleSelect(header)}
                className="flex min-h-11 w-full cursor-default select-none items-start gap-2 rounded-sm px-3 py-2.5 text-left text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              >
                <Check className={`mt-0.5 h-4 w-4 shrink-0${header === value ? "" : " invisible"}`} aria-hidden="true" />
                <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">{header}</span>
              </button>
            ))}
          </div>
          {options.length === 0 ? (
            <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">No columns found.</p>
          ) : null}
      </PopoverContent>
    </Popover>
  );
}

export const ViewerFilterColumnPicker = memo(ViewerFilterColumnPickerImpl);
