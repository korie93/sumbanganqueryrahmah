import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import type { CollectionSavedSourceFile, CollectionSourceMatch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  formatCollectionSourceMatchedFields,
  getCollectionSourceLabel,
} from "@/pages/collection/collection-source-match-diagnostics";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionSourceMatchFieldProps = {
  disabled: boolean;
  error: string;
  fieldError?: string | undefined;
  hasSearched: boolean;
  loading: boolean;
  matches: CollectionSourceMatch[];
  onMatch: () => void;
  onRefreshSourceFiles: () => void;
  onSelectSourceFile: (sourceImportId: string) => void;
  onSourceSearchChange: (value: string) => void;
  selectedMatch: CollectionSourceMatch | null;
  selectedSourceFile: CollectionSavedSourceFile | null;
  selectedSourceFileId: string;
  sourceFiles: CollectionSavedSourceFile[];
  sourceFilesError: string;
  sourceFilesLoading: boolean;
  sourceFilesTotal: number;
  sourceSearch: string;
};

function formatDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatUploadedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Tarikh tidak tersedia";
  return new Intl.DateTimeFormat("ms-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getSourceFilePrimaryLabel(sourceFile: CollectionSavedSourceFile) {
  return sourceFile.name.trim() || sourceFile.filename.trim() || "Saved file";
}

function getSourceFileOptionLabel(sourceFile: CollectionSavedSourceFile) {
  const primary = getSourceFilePrimaryLabel(sourceFile);
  const filename = sourceFile.filename.trim();
  const suffix = filename && filename !== primary ? ` — ${filename}` : "";
  return `${primary}${suffix} (${sourceFile.rowCount.toLocaleString("en-MY")} rows)`;
}

export function CollectionSourceMatchField({
  disabled,
  error,
  fieldError,
  hasSearched,
  loading,
  matches,
  onMatch,
  onRefreshSourceFiles,
  onSelectSourceFile,
  onSourceSearchChange,
  selectedMatch,
  selectedSourceFile,
  selectedSourceFileId,
  sourceFiles,
  sourceFilesError,
  sourceFilesLoading,
  sourceFilesTotal,
  sourceSearch,
}: CollectionSourceMatchFieldProps) {
  const sourceMatchInvalidProps = getAriaInvalidProps(Boolean(fieldError));
  const cpStatusLabel = selectedMatch?.projectedCpStatus === "abort_cp" ? "Abort CP" : "CP";
  const visibleSourceFiles = selectedSourceFile
    && !sourceFiles.some((sourceFile) => sourceFile.id === selectedSourceFile.id)
    ? [selectedSourceFile, ...sourceFiles]
    : sourceFiles;

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-1">
        <Label htmlFor="save-collection-source-file">1. Pilih Saved Source File</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Pilih fail dahulu. Backend hanya akan memadankan customer dalam fail ini dan tidak menghantar baris master ke browser.
        </p>
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative min-w-0">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={sourceSearch}
            onChange={(event) => onSourceSearchChange(event.target.value.slice(0, 120))}
            disabled={disabled}
            placeholder="Cari nama atau filename Saved..."
            aria-label="Cari Saved source file"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRefreshSourceFiles}
          disabled={disabled || sourceFilesLoading}
          className="w-full sm:w-auto"
        >
          <RefreshCw
            className={cn("mr-2 h-4 w-4", sourceFilesLoading && "animate-spin")}
            aria-hidden="true"
          />
          {sourceFilesLoading ? "Loading..." : "Muat Semula"}
        </Button>
      </div>

      <select
        id="save-collection-source-file"
        name="collectionSourceFile"
        value={selectedSourceFileId}
        onChange={(event) => onSelectSourceFile(event.target.value)}
        disabled={disabled || (sourceFilesLoading && visibleSourceFiles.length === 0)}
        required
        {...sourceMatchInvalidProps}
        aria-describedby={fieldError ? "save-collection-source-match-error" : undefined}
        className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">
          {sourceFilesLoading ? "Loading Saved files..." : "Select a Saved source file"}
        </option>
        {visibleSourceFiles.map((sourceFile) => (
          <option key={sourceFile.id} value={sourceFile.id}>
            {getSourceFileOptionLabel(sourceFile)}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {sourceFilesLoading
            ? "Memuatkan metadata fail..."
            : `${sourceFiles.length.toLocaleString("en-MY")} daripada ${sourceFilesTotal.toLocaleString("en-MY")} fail dipaparkan.`}
        </span>
        {sourceFilesTotal > sourceFiles.length ? <span>Gunakan carian untuk mengecilkan senarai.</span> : null}
      </div>

      {selectedSourceFile ? (
        <div className="min-w-0 rounded-lg border border-border/70 bg-muted/30 p-3">
          <div className="flex min-w-0 items-start gap-2">
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-foreground">
                {getSourceFilePrimaryLabel(selectedSourceFile)}
              </p>
              <p className="break-all text-xs text-muted-foreground">{selectedSourceFile.filename}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Uploaded {formatUploadedAt(selectedSourceFile.createdAt)} · {selectedSourceFile.rowCount.toLocaleString("en-MY")} rows
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {sourceFilesError ? (
        <p className="text-xs text-destructive" role="alert">{sourceFilesError}</p>
      ) : null}
      {fieldError ? (
        <p id="save-collection-source-match-error" className="text-xs text-destructive" role="alert">
          {fieldError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label htmlFor="save-collection-source-match-action">2. Verify Customer &amp; Coverage</Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            IC atau Phone + Account, Calling Date, TOTAL DUE dan jumlah kumulatif disahkan oleh backend.
          </p>
        </div>
        <Button
          id="save-collection-source-match-action"
          type="button"
          variant="outline"
          onClick={onMatch}
          disabled={disabled || loading || !selectedSourceFileId}
          aria-describedby={error ? "save-collection-source-match-action-error" : undefined}
          className="w-full shrink-0 sm:w-auto"
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          {loading ? "Checking..." : "Semak Matching"}
        </Button>
      </div>

      {error ? (
        <p id="save-collection-source-match-action-error" className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {hasSearched && matches.length === 0 && !error ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <p>Tiada baris customer yang sepadan dalam fail Saved yang dipilih.</p>
        </div>
      ) : null}

      {selectedMatch ? (
        <div className="min-w-0 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3" role="status">
          <div className="flex min-w-0 items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">{getCollectionSourceLabel(selectedMatch)}</p>
                <p className="break-all text-xs text-muted-foreground">{selectedMatch.sourceFilename || "-"}</p>
              </div>

              <dl className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2">
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Calling Date Window</dt>
                  <dd className="break-words font-semibold">
                    {formatDateOnly(selectedMatch.callingDate)} – {formatDateOnly(selectedMatch.callingWindowEnd)}
                  </dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">TOTAL DUE</dt>
                  <dd className="break-words font-semibold">
                    {selectedMatch.totalDue === null ? "-" : formatAmountRM(selectedMatch.totalDue)}
                  </dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Billing Principal (OSP)</dt>
                  <dd className="break-words font-semibold">
                    {selectedMatch.billingPrincipalOsp === null ? "-" : formatAmountRM(selectedMatch.billingPrincipalOsp)}
                  </dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Existing Collection</dt>
                  <dd className="break-words font-semibold">{formatAmountRM(selectedMatch.existingCumulative)}</dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Current Entry</dt>
                  <dd className="break-words font-semibold">{formatAmountRM(selectedMatch.currentEntry)}</dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Projected Cumulative</dt>
                  <dd className="break-words font-semibold">{formatAmountRM(selectedMatch.projectedCumulative)}</dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Remaining After Save</dt>
                  <dd className="break-words font-semibold">{formatAmountRM(selectedMatch.remainingAfterSave)}</dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Projected CP Status</dt>
                  <dd className={cn(
                    "break-words font-semibold",
                    selectedMatch.projectedTotalDueCovered
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-amber-700 dark:text-amber-300",
                  )}>
                    {cpStatusLabel}
                  </dd>
                </div>
              </dl>

              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
                <span className="break-words">Matched: {formatCollectionSourceMatchedFields(selectedMatch)}</span>
                <span>Accuracy: {selectedMatch.matchAccuracy}% · Server-authoritative projection</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
