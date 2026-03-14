import { AlertCircle, FileSpreadsheet, Save, Upload, X } from "lucide-react";
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
  onClear,
  onDrop,
  onDragOver,
  onFileChange,
  onImportNameChange,
  onSave,
  parsedData,
}: SingleImportPanelProps) {
  return (
    <>
      <div className="glass-wrapper p-6 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">Import Name</label>
          <Input
            value={importName}
            onChange={(event) => onImportNameChange(event.target.value)}
            placeholder="Enter a name for this import"
            className="max-w-md"
            data-testid="input-import-name"
          />
        </div>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors"
          onClick={() => fileInputRef.current?.click()}
          data-testid="dropzone-file"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsb"
            onChange={onFileChange}
            className="hidden"
            data-testid="input-file"
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-foreground font-medium">Click or drag file here</p>
              <p className="text-sm text-muted-foreground mt-1">Supported: CSV, Excel (.xlsx, .xls, .xlsb)</p>
            </div>
          </div>
        </div>

        {file ? (
          <div className="mt-4 flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <span className="text-sm text-foreground">{file.name}</span>
            <button
              onClick={onClear}
              className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
              data-testid="button-clear-file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        ) : null}
      </div>

      {parsedData.length > 0 ? (
        <div className="glass-wrapper p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-foreground">Data Preview ({parsedData.length} rows)</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClear} disabled={loading} data-testid="button-cancel">
                Cancel
              </Button>
              <Button onClick={onSave} disabled={loading} data-testid="button-save">
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                  <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                  {headers.map((header, index) => (
                    <th key={index} className="text-left p-3 font-medium text-muted-foreground">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedData.slice(0, 10).map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-border hover:bg-muted/50">
                    <td className="p-3 text-muted-foreground">{rowIndex + 1}</td>
                    {headers.map((header, columnIndex) => (
                      <td key={columnIndex} className="p-3 text-foreground">
                        {row[header] || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedData.length > 10 ? (
              <div className="p-3 text-center text-sm text-muted-foreground bg-muted/30">
                ... and {parsedData.length - 10} more rows
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
