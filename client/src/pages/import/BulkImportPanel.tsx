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
  onBulkDrop,
  onBulkDragOver,
  onBulkFileSelect,
  onClearBulk,
  onStartBulkImport,
}: BulkImportPanelProps) {
  return (
    <div className="glass-wrapper p-6 mb-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground mb-2">Bulk Import</h2>
        <p className="text-sm text-muted-foreground">
          Select multiple files to import at once. Each file will be imported as a separate dataset.
        </p>
      </div>

      <div
        onDrop={onBulkDrop}
        onDragOver={onBulkDragOver}
        className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors"
        onClick={() => bulkInputRef.current?.click()}
        data-testid="dropzone-bulk"
      >
        <input
          ref={bulkInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.xlsb"
          multiple
          onChange={onBulkFileSelect}
          className="hidden"
          data-testid="input-bulk-files"
        />
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <FolderOpen className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="text-foreground font-medium">Click or drag multiple files here</p>
            <p className="text-sm text-muted-foreground mt-1">Select multiple CSV or Excel files at once</p>
          </div>
        </div>
      </div>

      {bulkFiles.length > 0 ? (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-foreground">Selected Files ({bulkFiles.length})</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClearBulk} disabled={bulkProcessing} data-testid="button-clear-bulk">
                Clear All
              </Button>
              <Button onClick={onStartBulkImport} disabled={bulkProcessing} data-testid="button-start-bulk">
                {bulkProcessing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
            <div className="mb-4">
              <Progress value={bulkProgress} className="h-2" />
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Processing: {Math.round(bulkProgress)}%
              </p>
            </div>
          ) : null}

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {bulkResults.map((result, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
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
                {result.status === "success" ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                ) : null}
                {result.status === "error" ? (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                ) : null}
                {result.status === "processing" ? (
                  <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
                ) : null}
                {result.status === "pending" ? (
                  <FileSpreadsheet className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                ) : null}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{result.filename}</p>
                  {result.status === "success" && result.rowCount ? (
                    <p className="text-xs text-green-600 dark:text-green-400">{result.rowCount} rows imported</p>
                  ) : null}
                  {result.status === "error" && result.error ? (
                    <p className="text-xs text-red-600 dark:text-red-400">{result.error}</p>
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
                  className="flex-shrink-0"
                >
                  {result.status === "success"
                    ? "Success"
                    : result.status === "error"
                      ? "Failed"
                      : result.status === "processing"
                        ? "Processing"
                        : "Pending"}
                </Badge>
              </div>
            ))}
          </div>

          {bulkResults.some((result) => result.status === "error") && !bulkProcessing ? (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">Failed Imports Summary</h4>
              <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                {bulkResults
                  .filter((result) => result.status === "error")
                  .map((result, index) => (
                    <li key={index}>
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
