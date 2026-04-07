import { CheckCircle2, FileSpreadsheet, FolderOpen, Upload, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { BulkFileResult } from "@/pages/import/types";

interface BulkImportPanelProps {
  bulkFiles: File[];
  bulkInputRef: React.RefObject<HTMLInputElement>;
  bulkProcessing: boolean;
  bulkProgress: number;
  bulkResults: BulkFileResult[];
  maxUploadSizeLabel: string;
  onBulkDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onBulkDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onBulkFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearBulk: () => void;
  onStartBulkImport: () => void;
}

export function BulkImportPanel({
  bulkFiles,
  bulkInputRef,
  bulkProcessing,
  bulkProgress,
  bulkResults,
  maxUploadSizeLabel,
  onBulkDrop,
  onBulkDragOver,
  onBulkFileSelect,
  onClearBulk,
  onStartBulkImport,
}: BulkImportPanelProps) {
  const blockedCount = bulkResults.filter((result) => result.blocked).length;
  const hasImportableFiles = bulkResults.some((result) => !result.blocked);
  const failedCount = bulkResults.filter((result) => result.status === "error").length;
  const successCount = bulkResults.filter((result) => result.status === "success").length;

  return (
    <div className="glass-wrapper mb-4 p-4 sm:mb-6 sm:p-6" aria-busy={bulkProcessing}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground mb-2">Bulk Import</h2>
        <p className="text-sm text-muted-foreground">
          Select multiple files to import at once. Each file will be imported as a separate dataset.
        </p>
      </div>

      <div
        onDrop={onBulkDrop}
        onDragOver={onBulkDragOver}
        className={`rounded-xl border-2 border-dashed border-slate-300 p-5 text-center transition-colors dark:border-slate-600 sm:p-8 ${
          bulkProcessing ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-primary"
        }`}
        onClick={() => {
          if (!bulkProcessing) {
            bulkInputRef.current?.click();
          }
        }}
        data-testid="dropzone-bulk"
        aria-disabled={bulkProcessing}
      >
        <input
          ref={bulkInputRef}
          type="file"
          aria-label="Select bulk import files"
          accept=".csv,.xlsx,.xls,.xlsb"
          multiple
          onChange={onBulkFileSelect}
          className="hidden"
          data-testid="input-bulk-files"
          disabled={bulkProcessing}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 sm:h-16 sm:w-16">
            <FolderOpen className="h-7 w-7 text-primary sm:h-8 sm:w-8" />
          </div>
          <div>
            <p className="text-foreground font-medium">Click or drag multiple files here</p>
            <p className="mt-1 text-sm text-muted-foreground">Select multiple CSV or Excel files at once</p>
            <p className="mt-1 text-xs text-muted-foreground">Maximum upload size per file: {maxUploadSizeLabel}</p>
          </div>
        </div>
      </div>

      {bulkFiles.length > 0 ? (
        <div className="mt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h3 className="font-medium text-foreground">Selected Files ({bulkFiles.length})</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full">
                  {successCount} success
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {failedCount} failed
                </Badge>
                {blockedCount > 0 ? (
                  <Badge variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                    {blockedCount} too large
                  </Badge>
                ) : null}
              </div>
              {blockedCount > 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  {blockedCount} file(s) exceed the current upload limit and will be skipped.
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:gap-2">
              <Button variant="outline" onClick={onClearBulk} disabled={bulkProcessing} data-testid="button-clear-bulk">
                Clear All
              </Button>
              <Button onClick={onStartBulkImport} disabled={bulkProcessing || !hasImportableFiles} data-testid="button-start-bulk">
                {bulkProcessing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    Importing...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Start Import
                  </div>
                )}
              </Button>
            </div>
          </div>

          {bulkProcessing ? (
            <div className="mb-4" role="status" aria-live="polite">
              <Progress value={bulkProgress} className="h-2" />
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Processing: {Math.round(bulkProgress)}%
              </p>
            </div>
          ) : null}

          <div className="max-h-[400px] space-y-2 overflow-y-auto">
            {bulkResults.map((result, index) => (
              <div
                key={result.id}
                className={`rounded-lg border p-3 ${
                  result.status === "success"
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                    : result.status === "error"
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                      : result.status === "processing"
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                        : "bg-muted/50 border-border"
                }`}
                data-testid={`bulk-file-${index}`}
              >
                <div className="flex items-start gap-3">
                  {result.status === "success" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  ) : null}
                  {result.status === "error" ? (
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  ) : null}
                  {result.status === "processing" ? (
                    <div className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin" aria-hidden="true" />
                  ) : null}
                  {result.status === "pending" ? (
                    <FileSpreadsheet className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{result.filename}</p>
                        {result.status === "success" && result.rowCount ? (
                          <p className="text-xs text-green-600 dark:text-green-400">{result.rowCount} rows imported</p>
                        ) : null}
                        {result.status === "error" && result.error ? (
                          <p className="text-xs text-red-600 dark:text-red-400 break-words">{result.error}</p>
                        ) : null}
                      </div>
                      <Badge
                        variant={
                          result.status === "success"
                            ? "default"
                            : result.status === "error"
                              ? "destructive"
                              : "secondary"
                        }
                        className="w-fit flex-shrink-0"
                      >
                        {result.blocked
                          ? "Too Large"
                          : result.status === "success"
                          ? "Success"
                          : result.status === "error"
                            ? "Failed"
                            : result.status === "processing"
                              ? "Processing"
                              : "Pending"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {bulkResults.some((result) => result.status === "error") && !bulkProcessing ? (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800" role="alert">
              <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">Failed Imports Summary</h4>
              <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                {bulkResults
                  .filter((result) => result.status === "error")
                  .map((result) => (
                    <li key={result.id} className="break-words">
                      <span className="font-medium">{result.filename}</span>: {result.error}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
