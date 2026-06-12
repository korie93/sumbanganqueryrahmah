import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Files,
  FolderOpen,
  LoaderCircle,
  RotateCcw,
  Upload,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatImportUploadSize } from "@/pages/import/upload-limits";
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

function getBulkFileStatusLabel(result: BulkFileResult): string {
  if (result.blocked) return "Too large";
  if (result.status === "success") return "Imported";
  if (result.status === "error") return "Failed";
  if (result.status === "processing") return "Processing";
  return "Ready";
}

function getBulkFileStatusClasses(result: BulkFileResult): string {
  if (result.blocked) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200";
  }
  if (result.status === "success") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200";
  }
  if (result.status === "error") {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }
  if (result.status === "processing") {
    return "border-primary/40 bg-primary/10 text-primary";
  }
  return "border-border bg-muted/40 text-foreground";
}

function BulkFileStatusIcon({ result }: { result: BulkFileResult }) {
  if (result.blocked) {
    return <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300" aria-hidden="true" />;
  }
  if (result.status === "success") {
    return <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />;
  }
  if (result.status === "error") {
    return <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />;
  }
  if (result.status === "processing") {
    return <LoaderCircle className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />;
  }
  return <FileSpreadsheet className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
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
  const pendingCount = bulkResults.filter((result) => result.status === "pending").length;
  const processingCount = bulkResults.filter((result) => result.status === "processing").length;
  const failedCount = bulkResults.filter(
    (result) => result.status === "error" && !result.blocked,
  ).length;
  const successCount = bulkResults.filter((result) => result.status === "success").length;
  const totalSizeBytes = bulkFiles.reduce((total, file) => total + file.size, 0);
  const completedCount = successCount + failedCount + blockedCount;
  const importableCount = bulkResults.length - blockedCount;
  const hasFiles = bulkFiles.length > 0;
  const hasRetryableFiles = pendingCount > 0 || failedCount > 0;
  const isRetryMode = pendingCount === 0 && failedCount > 0;
  const roundedBulkProgress = Math.round(bulkProgress);
  const bulkBusyProps = bulkProcessing ? { "aria-busy": "true" as const } : {};
  const bulkDropzoneDisabledProps = bulkProcessing
    ? { "aria-disabled": "true" as const }
    : {};

  return (
    <section className="space-y-4" {...bulkBusyProps}>
      <label htmlFor="bulk-import-file-input" className="sr-only">
        Select bulk import files
      </label>
      <input
        id="bulk-import-file-input"
        name="bulkImportFiles"
        ref={bulkInputRef}
        type="file"
        aria-label="Select bulk import files"
        accept=".csv,.xlsx,.xlsb"
        multiple
        onChange={onBulkFileSelect}
        className="hidden"
        data-testid="input-bulk-files"
        disabled={bulkProcessing}
      />

      {!hasFiles ? (
        <div className="border border-border bg-background p-4 sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase text-primary">Bulk workspace</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Build an import queue</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Select several files. Each file is validated and stored as a separate dataset.
            </p>
          </div>

          <div
            onDrop={onBulkDrop}
            onDragOver={onBulkDragOver}
            onKeyDown={(event) => {
              if (bulkProcessing || (event.key !== "Enter" && event.key !== " ")) {
                return;
              }
              event.preventDefault();
              bulkInputRef.current?.click();
            }}
            role="button"
            tabIndex={bulkProcessing ? -1 : 0}
            aria-label="Select bulk import files"
            className={`border-2 border-dashed border-border p-6 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-8 ${
              bulkProcessing
                ? "cursor-not-allowed opacity-70"
                : "cursor-pointer hover:border-primary hover:bg-muted/30"
            }`}
            onClick={() => {
              if (!bulkProcessing) {
                bulkInputRef.current?.click();
              }
            }}
            data-testid="dropzone-bulk"
            {...bulkDropzoneDisabledProps}
          >
            <FolderOpen className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
            <p className="mt-3 font-medium text-foreground">Drop multiple files here or browse</p>
            <p className="mt-1 text-sm text-muted-foreground">
              CSV, XLSX, or XLSB up to {maxUploadSizeLabel} per file
            </p>
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 border border-border bg-background">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-primary">Bulk import queue</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {bulkFiles.length} file{bulkFiles.length === 1 ? "" : "s"} selected
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Files run one at a time to keep memory and server load predictable.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => bulkInputRef.current?.click()}
                disabled={bulkProcessing}
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                Replace files
              </Button>
            </div>

            {bulkProcessing ? (
              <div className="border-b border-border bg-primary/5 p-4" role="status" aria-live="polite">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">Importing queue</span>
                  <span className="text-muted-foreground">{roundedBulkProgress}%</span>
                </div>
                <Progress
                  value={bulkProgress}
                  className="h-2"
                  aria-label="Bulk import progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={roundedBulkProgress}
                  aria-valuetext={`${roundedBulkProgress}% processed`}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {processingCount > 0 ? "Processing the current file." : "Preparing the next file."}
                  {" "}Do not close this page until the queue finishes.
                </p>
              </div>
            ) : null}

            <div className="divide-y divide-border lg:max-h-[34rem] lg:overflow-y-auto lg:scroll-fade-y">
              {bulkResults.map((result, index) => (
                <article
                  key={result.id}
                  className="p-4"
                  data-testid={`bulk-file-${index}`}
                  aria-label={`${result.filename}: ${getBulkFileStatusLabel(result)}`}
                >
                  <div className="flex items-start gap-3">
                    <BulkFileStatusIcon result={result} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-medium text-foreground"
                            title={result.filename}
                            aria-label={result.filename}
                          >
                            {result.filename}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {typeof result.sizeBytes === "number" ? (
                              <span>{formatImportUploadSize(result.sizeBytes)}</span>
                            ) : null}
                            {result.status === "success" && result.rowCount !== undefined ? (
                              <span>{result.rowCount.toLocaleString()} rows imported</span>
                            ) : null}
                            {result.status === "pending" ? <span>Waiting to start</span> : null}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`w-fit shrink-0 ${getBulkFileStatusClasses(result)}`}
                        >
                          {getBulkFileStatusLabel(result)}
                        </Badge>
                      </div>
                      {result.status === "error" && result.error ? (
                        <p className="mt-2 break-words text-xs text-destructive">{result.error}</p>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="sticky bottom-0 z-10 grid gap-2 border-t border-border bg-background p-3 pb-20 sm:flex sm:items-center sm:justify-end sm:pb-3">
              <Button
                variant="outline"
                onClick={onClearBulk}
                disabled={bulkProcessing}
                data-testid="button-clear-bulk"
              >
                Clear queue
              </Button>
              <Button
                onClick={onStartBulkImport}
                disabled={bulkProcessing || !hasRetryableFiles}
                data-testid="button-start-bulk"
              >
                {bulkProcessing ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Importing...
                  </>
                ) : (
                  <>
                    {isRetryMode ? (
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Upload className="h-4 w-4" aria-hidden="true" />
                    )}
                    {isRetryMode ? "Retry failed" : hasRetryableFiles ? "Start import" : "Import complete"}
                  </>
                )}
              </Button>
            </div>
          </div>

          <aside className="border border-border bg-background lg:sticky lg:top-4" aria-label="Bulk import summary">
            <div className="border-b border-border p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Queue summary</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {bulkProcessing ? "Import in progress" : hasRetryableFiles ? "Ready for review" : "Queue complete"}
              </p>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex items-start gap-3">
                <Files className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {bulkFiles.length} selected file{bulkFiles.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatImportUploadSize(totalSizeBytes)} combined
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Importable</dt>
                  <dd className="mt-0.5 font-medium text-foreground">{importableCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Completed</dt>
                  <dd className="mt-0.5 font-medium text-foreground">{completedCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Successful</dt>
                  <dd className="mt-0.5 font-medium text-emerald-700 dark:text-emerald-300">{successCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Needs attention</dt>
                  <dd className="mt-0.5 font-medium text-destructive">{failedCount + blockedCount}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2" aria-label="Bulk import status counts">
                {pendingCount > 0 ? <Badge variant="outline">{pendingCount} ready</Badge> : null}
                {processingCount > 0 ? <Badge variant="outline">{processingCount} processing</Badge> : null}
                {successCount > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                  >
                    {successCount} imported
                  </Badge>
                ) : null}
                {failedCount > 0 ? <Badge variant="destructive">{failedCount} failed</Badge> : null}
                {blockedCount > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                  >
                    {blockedCount} too large
                  </Badge>
                ) : null}
              </div>

              {blockedCount > 0 ? (
                <div className="border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100">
                  Oversized files are skipped automatically. Other files can still be imported.
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
