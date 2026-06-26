import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Columns3,
  FileSpreadsheet,
  PauseCircle,
  Play,
  Save,
  ShieldCheck,
  TableProperties,
  Upload,
  X,
} from "lucide-react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { getAriaCurrentStepProps } from "@/lib/aria-state-props";
import { getImportPreviewRowKey } from "@/pages/import/import-preview-row-key";
import { ImportColumnMappingPanel } from "@/pages/import/ImportColumnMappingPanel";
import { formatImportUploadSize } from "@/pages/import/upload-limits";
import type {
  ImportBackgroundJobContract,
  ImportColumnMappingEntry,
  ImportRow,
} from "@/pages/import/types";

type ImportWorkflowStep = 1 | 2 | 3 | 4;

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
  previewDeferred: boolean;
  columnMapping: ImportColumnMappingEntry[];
  backgroundJob: ImportBackgroundJobContract | null;
  onColumnMappingChange: (mapping: ImportColumnMappingEntry[]) => void;
  onCancelBackgroundJob: () => void;
  onResumeBackgroundJob: () => void;
}

const WORKFLOW_STEPS = [
  { id: 1, label: "Select file", shortLabel: "File", icon: Upload },
  { id: 2, label: "Map columns", shortLabel: "Mapping", icon: Columns3 },
  { id: 3, label: "Review data", shortLabel: "Review", icon: TableProperties },
  { id: 4, label: "Run import", shortLabel: "Import", icon: Save },
] as const;

function resolveInitialWorkflowStep(params: {
  file: File | null;
  parsedData: ImportRow[];
  previewDeferred: boolean;
  backgroundJob: ImportBackgroundJobContract | null;
}): ImportWorkflowStep {
  if (params.backgroundJob) {
    return 4;
  }
  if (params.file && (params.parsedData.length > 0 || params.previewDeferred)) {
    return 3;
  }
  return 1;
}

function getJobStatusLabel(status: ImportBackgroundJobContract["status"]): string {
  switch (status) {
    case "queued":
      return "Waiting in queue";
    case "running":
      return "Import in progress";
    case "completed":
      return "Import completed";
    case "failed":
      return "Import needs attention";
    case "cancelled":
      return "Import paused";
    case "duplicate":
      return "Duplicate detected";
  }
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
  previewDeferred,
  columnMapping,
  backgroundJob,
  onColumnMappingChange,
  onCancelBackgroundJob,
  onResumeBackgroundJob,
}: SingleImportPanelProps) {
  const [activeStep, setActiveStep] = useState<ImportWorkflowStep>(() =>
    resolveInitialWorkflowStep({ file, parsedData, previewDeferred, backgroundJob }),
  );
  const hasReviewData = parsedData.length > 0 || previewDeferred;
  const hasColumnMapping = columnMapping.length > 0;
  const includedColumnCount = useMemo(
    () => columnMapping.filter((entry) => entry.target !== null).length,
    [columnMapping],
  );
  const loadingBusyProps = loading ? { "aria-busy": "true" as const } : {};
  const loadingDropzoneDisabledProps = loading
    ? { "aria-disabled": "true" as const }
    : {};

  useEffect(() => {
    if (!file) {
      setActiveStep(1);
      return;
    }
    if (backgroundJob || loading) {
      setActiveStep(4);
      return;
    }
    setActiveStep((currentStep) => {
      if (currentStep !== 1) {
        return currentStep;
      }
      if (hasColumnMapping) {
        return 2;
      }
      return hasReviewData ? 3 : currentStep;
    });
  }, [backgroundJob, file, hasColumnMapping, hasReviewData, loading]);

  const isStepAvailable = (step: ImportWorkflowStep) => {
    if (step === 1) {
      return true;
    }
    if (step === 2) {
      return Boolean(file && hasColumnMapping);
    }
    return Boolean(file && hasReviewData);
  };

  const clearWorkflow = () => {
    setActiveStep(1);
    onClear();
  };

  const goToReview = () => {
    if (hasReviewData) {
      setActiveStep(3);
    }
  };

  const goToImport = () => {
    if (hasReviewData) {
      setActiveStep(4);
    }
  };

  const goToPreviousStep = () => {
    if (activeStep === 4) {
      setActiveStep(3);
      return;
    }
    if (activeStep === 3) {
      setActiveStep(hasColumnMapping ? 2 : 1);
      return;
    }
    setActiveStep(1);
  };

  return (
    <section className="space-y-4" {...loadingBusyProps}>
      <nav
        aria-label="Import workflow progress"
        className="overflow-hidden border border-border bg-background"
      >
        <ol className="grid grid-cols-4">
          {WORKFLOW_STEPS.map((step) => {
            const Icon = step.icon;
            const available = isStepAvailable(step.id);
            const completed = step.id < activeStep && available;
            const active = step.id === activeStep;
            return (
              <li key={step.id} className="min-w-0 border-r border-border last:border-r-0">
                <button
                  type="button"
                  onClick={() => {
                    if (available && !loading) {
                      setActiveStep(step.id);
                    }
                  }}
                  disabled={!available || loading}
                  {...getAriaCurrentStepProps(active)}
                  className={`flex min-h-16 w-full min-w-0 items-center justify-center gap-2 px-2 py-3 text-left transition-colors sm:justify-start sm:px-4 ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : available
                        ? "bg-background text-foreground hover:bg-muted"
                        : "cursor-not-allowed bg-muted/30 text-muted-foreground"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                      active
                        ? "border-primary-foreground/40"
                        : completed
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-current"
                    }`}
                    aria-hidden="true"
                  >
                    {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block text-2xs font-medium uppercase">Step {step.id}</span>
                    <span className="block truncate text-sm font-semibold">{step.label}</span>
                  </span>
                  <span className="truncate text-xs font-semibold sm:hidden">{step.shortLabel}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {error ? (
        <div
          className="flex items-start gap-2 border border-destructive/30 bg-destructive/10 p-3 text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 border border-border bg-background">
          {activeStep === 1 ? (
            <div className="p-4 sm:p-6">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase text-primary">Step 1 of 4</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Choose the source file</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Name the dataset and select one CSV or Excel file.
                </p>
              </div>

              <div className="mb-4">
                <label htmlFor="single-import-name" className="block text-sm font-medium text-foreground">
                  Import name
                </label>
                <Input
                  id="single-import-name"
                  name="singleImportName"
                  value={importName}
                  onChange={(event) => onImportNameChange(event.target.value)}
                  placeholder="Example: June customer list"
                  autoComplete="off"
                  className="mt-2 h-10 max-w-lg"
                  data-testid="input-import-name"
                  disabled={loading}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  This name appears in Saved Imports, Viewer, and Analysis.
                </p>
              </div>

              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onKeyDown={(event) => {
                  if (loading || (event.key !== "Enter" && event.key !== " ")) {
                    return;
                  }
                  event.preventDefault();
                  fileInputRef.current?.click();
                }}
                role="button"
                tabIndex={loading ? -1 : 0}
                aria-label="Select single import file"
                className={`border-2 border-dashed border-border p-6 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-8 ${
                  loading ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-primary hover:bg-muted/30"
                }`}
                onClick={() => {
                  if (!loading) {
                    fileInputRef.current?.click();
                  }
                }}
                data-testid="dropzone-file"
                {...loadingDropzoneDisabledProps}
              >
                <input
                  id="single-import-file-input"
                  name="singleImportFile"
                  ref={fileInputRef}
                  type="file"
                  aria-label="Select single import file"
                  accept=".csv,.xlsx,.xlsb"
                  onChange={onFileChange}
                  className="hidden"
                  data-testid="input-file"
                  disabled={loading}
                />
                <Upload className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
                <p className="mt-3 font-medium text-foreground">Drop a file here or browse</p>
                <p className="mt-1 text-sm text-muted-foreground">CSV, XLSX, or XLSB up to {maxUploadSizeLabel}</p>
              </div>
            </div>
          ) : null}

          {activeStep === 2 ? (
            <div className="p-4 sm:p-6">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase text-primary">Step 2 of 4</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Confirm column mapping</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Rename fields or exclude columns before any rows are stored.
                </p>
              </div>
              <ImportColumnMappingPanel
                disabled={loading}
                mapping={columnMapping}
                onChange={onColumnMappingChange}
              />
            </div>
          ) : null}

          {activeStep === 3 ? (
            <div className="p-4 sm:p-6">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase text-primary">Step 3 of 4</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {previewDeferred ? "Ready for server validation" : "Review sample data"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {previewDeferred
                    ? "The server will validate this large file without loading the complete dataset into browser memory."
                    : `Reviewing the first ${Math.min(parsedData.length, 10)} of ${parsedData.length.toLocaleString()} rows.`}
                </p>
              </div>

              {previewDeferred ? (
                <div className="flex items-start gap-3 border border-border bg-muted/30 p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Memory-safe upload mode</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The server checks file structure and limits before committing data. Invalid imports
                      are rolled back without retaining partial rows.
                    </p>
                  </div>
                </div>
              ) : (
                <HorizontalScrollHint
                  ariaLabel="Import preview columns"
                  className="border border-border"
                  hint="Scroll preview"
                  navigationLabel="Import preview column navigation"
                  showNavigationControls
                  showScrollbar
                >
                  <table className="w-full min-w-max text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th scope="col" className="w-12 p-3 text-left font-medium text-muted-foreground">#</th>
                        {headers.map((header) => (
                          <th
                            key={header}
                            scope="col"
                            className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 10).map((row, rowIndex) => (
                        <tr key={getImportPreviewRowKey(row)} className="border-t border-border hover:bg-muted/50">
                          <td className="p-3 text-muted-foreground">{rowIndex + 1}</td>
                          {headers.map((header) => (
                            <td
                              key={header}
                              className="max-w-72 truncate whitespace-nowrap p-3 text-foreground"
                              title={row[header] || "-"}
                            >
                              {row[header] || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </HorizontalScrollHint>
              )}
            </div>
          ) : null}

          {activeStep === 4 ? (
            <div className="p-4 sm:p-6">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase text-primary">Step 4 of 4</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {backgroundJob ? getJobStatusLabel(backgroundJob.status) : "Ready to import"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {backgroundJob
                    ? "Large imports continue securely in the background and may be resumed if interrupted."
                    : "Review the summary, then start the import when everything looks correct."}
                </p>
              </div>

              {!backgroundJob ? (
                <div className="divide-y divide-border border border-border">
                  <div className="flex items-center justify-between gap-4 p-4">
                    <span className="text-sm text-muted-foreground">Dataset name</span>
                    <span className="max-w-[60%] truncate text-sm font-medium text-foreground">{importName || "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 p-4">
                    <span className="text-sm text-muted-foreground">Validation mode</span>
                    <span className="text-sm font-medium text-foreground">
                      {previewDeferred ? "Secure server validation" : "Browser preview checked"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 p-4">
                    <span className="text-sm text-muted-foreground">Columns included</span>
                    <span className="text-sm font-medium text-foreground">
                      {includedColumnCount || headers.length}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border border-border bg-muted/30 p-4" role="status" aria-live="polite">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {getJobStatusLabel(backgroundJob.status)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        You may leave this page. The staged file is retained only for the configured recovery period.
                      </p>
                    </div>
                    {backgroundJob.canCancel ? (
                      <Button type="button" variant="outline" size="sm" onClick={onCancelBackgroundJob}>
                        <PauseCircle className="h-4 w-4" aria-hidden="true" />
                        Cancel
                      </Button>
                    ) : null}
                    {backgroundJob.canResume ? (
                      <Button type="button" variant="outline" size="sm" onClick={onResumeBackgroundJob}>
                        <Play className="h-4 w-4" aria-hidden="true" />
                        Resume
                      </Button>
                    ) : null}
                  </div>
                  <Progress
                    value={backgroundJob.progress}
                    className="mt-4 h-2"
                    aria-label="Background import progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={backgroundJob.progress}
                  />
                  <p className="mt-2 text-right text-xs font-medium text-muted-foreground">
                    {backgroundJob.progress}% complete
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-border bg-background p-3 pb-20 sm:flex-row sm:items-center sm:justify-between sm:pb-3">
            <div>
              {activeStep > 1 && !loading ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={goToPreviousStep}
                  data-testid="button-import-back"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:flex">
              {file && !loading ? (
                <Button type="button" variant="outline" onClick={clearWorkflow} data-testid="button-cancel">
                  Clear
                </Button>
              ) : null}
              {activeStep === 1 ? (
                <Button
                  type="button"
                  onClick={() => setActiveStep(hasColumnMapping ? 2 : 3)}
                  disabled={!file || !hasReviewData}
                  data-testid="button-import-next"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
              {activeStep === 2 ? (
                <Button type="button" onClick={goToReview} disabled={!hasReviewData} data-testid="button-import-next">
                  Review data
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
              {activeStep === 3 ? (
                <Button type="button" onClick={goToImport} data-testid="button-import-next">
                  Continue to import
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
              {activeStep === 4 && !backgroundJob ? (
                <Button onClick={onSave} disabled={loading} data-testid="button-save">
                  {loading ? (
                    <>
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                        aria-hidden="true"
                      />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Start import
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="border border-border bg-background lg:sticky lg:top-4" aria-label="Import summary">
          <div className="border-b border-border p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Import summary</p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">
              {importName || "New import"}
            </p>
          </div>
          {file ? (
            <div className="space-y-4 p-4">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground" title={file.name}>{file.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatImportUploadSize(file.size)}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Rows</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {previewDeferred ? "Server check" : parsedData.length.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Columns</dt>
                  <dd className="mt-0.5 font-medium text-foreground">{headers.length || "Pending"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Included</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {includedColumnCount || headers.length || "Pending"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Mode</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {previewDeferred ? "Background" : "Standard"}
                  </dd>
                </div>
              </dl>
              {parsedData.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{parsedData.length.toLocaleString()} rows ready</Badge>
                  <Badge variant="outline">{headers.length} columns</Badge>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Select a file to see its size, rows, columns, and validation mode here.
            </div>
          )}
          {file && !loading ? (
            <div className="border-t border-border p-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={clearWorkflow}
                data-testid="button-clear-file"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Remove file
              </Button>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
