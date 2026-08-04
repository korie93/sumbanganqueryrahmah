import { useMemo } from "react";
import { FileSpreadsheet, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import {
  type CollectionSourceImport,
  useCollectionSourceImports,
} from "@/pages/collection/useCollectionSourceImports";

type CollectionSourceFileFieldProps = {
  disabled: boolean;
  errorMessage?: string | undefined;
  onBlur: () => void;
  onChange: (source: CollectionSourceImport | null) => void;
  sourceFilename: string;
  sourceImportId: string;
  sourceImportName: string;
};

const SOURCE_SELECT_ID = "save-collection-source-import";

export function CollectionSourceFileField({
  disabled,
  errorMessage,
  onBlur,
  onChange,
  sourceFilename,
  sourceImportId,
  sourceImportName,
}: CollectionSourceFileFieldProps) {
  const { error, imports, loading, retry, search, setSearch } = useCollectionSourceImports();
  const sourceHelpId = `${SOURCE_SELECT_ID}-help`;
  const sourceErrorId = `${SOURCE_SELECT_ID}-error`;
  const invalidProps = getAriaInvalidProps(Boolean(errorMessage));
  const options = useMemo(() => {
    if (!sourceImportId || imports.some((item) => item.id === sourceImportId)) {
      return imports;
    }

    return [{
      id: sourceImportId,
      name: sourceImportName || sourceFilename || "Selected Saved file",
      filename: sourceFilename || sourceImportName || "-",
      rowCount: 0,
    }, ...imports];
  }, [imports, sourceFilename, sourceImportId, sourceImportName]);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="space-y-2">
        <Label htmlFor={`${SOURCE_SELECT_ID}-search`}>Cari fail Saved</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={`${SOURCE_SELECT_ID}-search`}
            name="collectionSourceSearch"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={disabled}
            placeholder="Contoh: NPL CC P10 JULY"
            autoComplete="off"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={SOURCE_SELECT_ID}>
          Source File <span className="text-muted-foreground">(required)</span>
        </Label>
        <select
          id={SOURCE_SELECT_ID}
          name="collectionSourceImport"
          value={sourceImportId}
          onChange={(event) => {
            const value = event.target.value;
            onChange(options.find((item) => item.id === value) ?? null);
          }}
          onBlur={onBlur}
          disabled={disabled || (loading && options.length === 0)}
          required
          aria-describedby={`${sourceHelpId}${errorMessage ? ` ${sourceErrorId}` : ""}`}
          {...invalidProps}
          className={cn(
            "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9",
          )}
        >
          <option value="">
            {loading ? "Loading Saved files..." : "Select a Saved source file"}
          </option>
          {options.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name} ({source.filename})
            </option>
          ))}
        </select>
        <p id={sourceHelpId} className="text-xs leading-relaxed text-muted-foreground">
          Rekod collection akan dipautkan kepada fail Saved ini untuk semakan dan General Search.
        </p>
        {sourceImportId ? (
          <div className="flex min-w-0 items-start gap-2 border-l-2 border-primary/50 pl-3 text-xs text-muted-foreground">
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 break-words">
              <strong className="font-semibold text-foreground">
                {sourceImportName || "Selected source"}
              </strong>
              {sourceFilename ? ` - ${sourceFilename}` : ""}
            </span>
          </div>
        ) : null}
        {errorMessage ? (
          <p id={sourceErrorId} className="text-xs text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {error ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
            <span>Saved files could not be loaded.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={retry}
              disabled={disabled}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : null}
        {!loading && !error && options.length === 0 ? (
          <p className="text-xs text-muted-foreground" role="status">
            Tiada fail Saved ditemui. Import dan simpan fail terlebih dahulu.
          </p>
        ) : null}
      </div>
    </div>
  );
}
