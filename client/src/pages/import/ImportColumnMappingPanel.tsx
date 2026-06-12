import { Columns3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ImportColumnMappingEntry } from "@/pages/import/types";

type ImportColumnMappingPanelProps = {
  disabled: boolean;
  mapping: ImportColumnMappingEntry[];
  onChange: (mapping: ImportColumnMappingEntry[]) => void;
};

export function ImportColumnMappingPanel({
  disabled,
  mapping,
  onChange,
}: ImportColumnMappingPanelProps) {
  if (mapping.length === 0) {
    return null;
  }

  const updateEntry = (
    index: number,
    update: Partial<ImportColumnMappingEntry>,
  ) => {
    onChange(mapping.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, ...update } : entry
    )));
  };

  const resetMapping = () => {
    onChange(mapping.map((entry) => ({
      source: entry.source,
      target: entry.source,
    })));
  };

  return (
    <section className="mt-4 border-t border-border pt-4" aria-labelledby="import-column-mapping-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="import-column-mapping-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Columns3 className="h-4 w-4 text-primary" aria-hidden="true" />
            Column Mapping
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Rename fields before saving, or exclude columns that are not needed.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={resetMapping}
          disabled={disabled}
        >
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Reset
        </Button>
      </div>

      <div className="mt-3 max-h-72 overflow-y-auto rounded-md border border-border">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Use</span>
          <span>Source</span>
          <span>System field</span>
        </div>
        {mapping.map((entry, index) => {
          const included = entry.target !== null;
          return (
            <div
              key={entry.source}
              className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
            >
              <Checkbox
                checked={included}
                disabled={disabled}
                aria-label={`Include ${entry.source}`}
                onCheckedChange={(checked) => {
                  updateEntry(index, {
                    target: checked === true ? entry.source : null,
                  });
                }}
              />
              <span className="truncate text-sm text-foreground" title={entry.source}>
                {entry.source}
              </span>
              <Input
                value={entry.target ?? ""}
                disabled={disabled || !included}
                aria-label={`Map ${entry.source} to system field`}
                onChange={(event) => {
                  updateEntry(index, { target: event.target.value });
                }}
                className="h-8 min-w-0"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
