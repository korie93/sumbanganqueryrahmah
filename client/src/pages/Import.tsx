import { File, FolderOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BulkImportPanel } from "@/pages/import/BulkImportPanel";
import { SingleImportPanel } from "@/pages/import/SingleImportPanel";
import type { ImportProps } from "@/pages/import/types";
import { useImportPageState } from "@/pages/import/useImportPageState";

export default function Import({ onNavigate, importUploadLimitBytes }: ImportProps) {
  const {
    activeTab,
    setActiveTab,
    maxUploadSizeLabel,
    file,
    importName,
    setImportName,
    parsedData,
    headers,
    columnMapping,
    setColumnMapping,
    backgroundJob,
    previewDeferred,
    loading,
    error,
    fileInputRef,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleSave,
    handleCancelBackgroundJob,
    handleResumeBackgroundJob,
    resetSingleImport,
    bulkFiles,
    bulkResults,
    bulkProcessing,
    bulkProgress,
    bulkInputRef,
    handleBulkFileSelect,
    handleBulkDrop,
    handleBulkDragOver,
    handleBulkImport,
    handleClearBulk,
  } = useImportPageState({ onNavigate, importUploadLimitBytes });

  return (
    <div className="app-shell-min-height bg-background p-3 sm:p-5">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 border-b border-border pb-4 sm:mb-6 sm:pb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-primary">Workspace Import</p>
              <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">Import Data</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Prepare, review, and save datasets through one guided workflow.
              </p>
            </div>
            <Badge variant="secondary" className="w-fit px-3 py-1 text-xs font-medium">
              Max file size {maxUploadSizeLabel}
            </Badge>
          </div>
        </header>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value === "single" || value === "bulk") {
              setActiveTab(value);
            }
          }}
          className="w-full"
        >
          <TabsList className="mb-4 grid w-full grid-cols-2 border border-border bg-muted/40 p-1 sm:mb-6 sm:w-80">
            <TabsTrigger value="single" data-testid="tab-single-import">
              <File className="mr-2 h-4 w-4" />
              Single File
            </TabsTrigger>
            <TabsTrigger value="bulk" data-testid="tab-bulk-import">
              <FolderOpen className="mr-2 h-4 w-4" />
              Bulk Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            <SingleImportPanel
              error={error}
              file={file}
              fileInputRef={fileInputRef}
              headers={headers}
              columnMapping={columnMapping}
              backgroundJob={backgroundJob}
              importName={importName}
              loading={loading}
              maxUploadSizeLabel={maxUploadSizeLabel}
              onClear={resetSingleImport}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onFileChange={handleFileChange}
              onColumnMappingChange={setColumnMapping}
              onCancelBackgroundJob={handleCancelBackgroundJob}
              onResumeBackgroundJob={handleResumeBackgroundJob}
              onImportNameChange={setImportName}
              onSave={handleSave}
              parsedData={parsedData}
              previewDeferred={previewDeferred}
            />
          </TabsContent>

          <TabsContent value="bulk">
            <BulkImportPanel
              bulkFiles={bulkFiles}
              bulkInputRef={bulkInputRef}
              bulkProcessing={bulkProcessing}
              bulkProgress={bulkProgress}
              bulkResults={bulkResults}
              maxUploadSizeLabel={maxUploadSizeLabel}
              onBulkDrop={handleBulkDrop}
              onBulkDragOver={handleBulkDragOver}
              onBulkFileSelect={handleBulkFileSelect}
              onClearBulk={handleClearBulk}
              onStartBulkImport={handleBulkImport}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
