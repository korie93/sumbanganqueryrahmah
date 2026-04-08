import { AlertCircle, FileSpreadsheet, Save, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImportRow } from "@/pages/import/types";

interface SingleImportPanelProps {
  error: string;
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  headers: string[];
  importName: string;
  loading: boolean;
  maxUploadSizeLabel: string;
  onClear: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onImportNameChange: (value: string) => void;
  onSave: () => void;
  parsedData: ImportRow[];
}

export function SingleImportPanel({
  error,
  file,
  fileInputRef,
  headers,
  importName,
  loading,
  maxUploadSizeLabel,
  onClear,
  onDrop,
  onDragOver,
  onFileChange,
  onImportNameChange,
  onSave,
  parsedData,
}: SingleImportPanelProps) {
  const loadingBusyProps = loading ? { "aria-busy": "true" as const } : {};

  return (
    <>
      <div className="glass-wrapper mb-4 p-4 sm:mb-6 sm:p-6" {...loadingBusyProps}>
        <div className="mb-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="block text-sm font-medium text-foreground">Import Name</label>
            {parsedData.length > 0 ? (
              <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px]">
                {parsedData.length.toLocaleString()} rows ready
              </Badge>
            ) : null}
          </div>
          <Input
            value={importName}
            onChange={(event) => onImportNameChange(event.target.value)}
            placeholder="Enter a name for this import"
            className="h-10 max-w-md"
            data-testid="input-import-name"
            disabled={loading}
          />
        </div>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          className={`rounded-xl border-2 border-dashed border-slate-300 p-5 text-center transition-colors dark:border-slate-600 sm:p-8 ${
            loading ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-primary"
          }`}
          onClick={() => {
            if (!loading) {
              fileInputRef.current?.click();
            }
          }}
          data-testid="dropzone-file"
          aria-disabled={loading}
        >
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Select single import file"
            accept=".csv,.xlsx,.xls,.xlsb"
            onChange={onFileChange}
            className="hidden"
            data-testid="input-file"
            disabled={loading}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 sm:h-16 sm:w-16">
              <Upload className="h-7 w-7 text-primary sm:h-8 sm:w-8" />
            </div>
            <div>
              <p className="text-foreground font-medium">Click or drag file here</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Supported: CSV, Excel (.xlsx, .xls, .xlsb)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Maximum upload size per file: {maxUploadSizeLabel}
              </p>
            </div>
          </div>
        </div>

        {file ? (
          <div className="mt-4 rounded-lg bg-primary/5 p-3">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-foreground">{file.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">File selected and ready for preview.</p>
              </div>
              <button
                type="button"
                aria-label="Clear selected file"
                onClick={onClear}
                disabled={loading}
                className="text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="button-clear-file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}

        {parsedData.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full">
              {headers.length} columns
            </Badge>
            <Badge variant="outline" className="rounded-full">
              Previewing first {Math.min(parsedData.length, 10)} rows
            </Badge>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        ) : null}
      </div>

      {parsedData.length > 0 ? (
        <div className="glass-wrapper p-4 sm:p-6" {...loadingBusyProps}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Data Preview ({parsedData.length} rows)
              </h2>
              <p className="mt-1 text-sm text-muted-foreground sm:hidden">
                Review the sample rows before saving this dataset.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:gap-2">
              <Button variant="outline" onClick={onClear} disabled={loading} data-testid="button-cancel">
                Cancel
              </Button>
              <Button onClick={onSave} disabled={loading} data-testid="button-save">
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    Saving...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    Save
                  </div>
                )}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left font-medium text-muted-foreground">#</th>
                  {headers.map((header) => (
                    <th key={header} className="p-3 text-left font-medium text-muted-foreground">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedData.slice(0, 10).map((row, rowIndex) => (
                  <tr key={`import-preview-row-${rowIndex}-${headers.map((header) => row[header] ?? "").join("|")}`} className="border-t border-border hover:bg-muted/50">
                    <td className="p-3 text-muted-foreground">{rowIndex + 1}</td>
                    {headers.map((header) => (
                      <td key={header} className="p-3 text-foreground">
                        {row[header] || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedData.length > 10 ? (
              <div className="bg-muted/30 p-3 text-center text-sm text-muted-foreground">
                ... and {parsedData.length - 10} more rows
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
