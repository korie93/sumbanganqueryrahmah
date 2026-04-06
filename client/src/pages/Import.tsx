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
    loading,
    error,
    fileInputRef,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleSave,
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
    <div className="app-shell-min-height bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm sm:mb-8 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Workspace Import
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Import Data</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Upload CSV or Excel files, preview the dataset, then save it into Viewer and Analysis.
              </p>
            </div>
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-xs font-medium">
              Max file size {maxUploadSizeLabel}
            </Badge>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value === "single" || value === "bulk") {
              setActiveTab(value);
            }
          }}
          className="w-full"
        >
          <TabsList className="mb-4 grid w-full grid-cols-2 rounded-xl border border-border/70 bg-background/70 p-1 sm:mx-auto sm:mb-6 sm:max-w-md">
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
              importName={importName}
              loading={loading}
              maxUploadSizeLabel={maxUploadSizeLabel}
              onClear={resetSingleImport}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onFileChange={handleFileChange}
              onImportNameChange={setImportName}
              onSave={handleSave}
              parsedData={parsedData}
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
