import { File, FolderOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { OperationalPage, OperationalPageHeader } from "@/components/layout/OperationalPage";
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
    <OperationalPage>
        <OperationalPageHeader
          eyebrow="Workspace Import"
          title="Import Data"
          description="Prepare, review, and save datasets through one guided workflow."
          actions={
            <Badge variant="secondary" className="w-fit">
              Max file size {maxUploadSizeLabel}
            </Badge>
          }
        />

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value === "single" || value === "bulk") {
              setActiveTab(value);
            }
          }}
          className="w-full"
        >
          <TabsList className="mb-4 grid h-auto w-full grid-cols-2 border border-border bg-muted/40 p-1 sm:w-80">
            <TabsTrigger value="single" data-testid="tab-single-import" className="min-h-11 sm:min-h-9">
              <File className="mr-2 h-4 w-4" />
              Single File
            </TabsTrigger>
            <TabsTrigger value="bulk" data-testid="tab-bulk-import" className="min-h-11 sm:min-h-9">
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
    </OperationalPage>
  );
}
