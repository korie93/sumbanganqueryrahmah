import { useEffect, useRef, useState } from "react";
import { File, FolderOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createImport, createImportFromFile } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { BulkImportPanel } from "@/pages/import/BulkImportPanel";
import { parseImportPreview, stripImportExtension } from "@/pages/import/parsing";
import { SingleImportPanel } from "@/pages/import/SingleImportPanel";
import type { BulkFileResult, ImportProps, ImportRow } from "@/pages/import/types";

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function Import({ onNavigate }: ImportProps) {
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
  const [file, setFile] = useState<File | null>(null);
  const [importName, setImportName] = useState("");
  const [parsedData, setParsedData] = useState<ImportRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkFileResult[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const singleParseRequestIdRef = useRef(0);
  const singleSaveInFlightRef = useRef(false);
  const singleSaveAbortControllerRef = useRef<AbortController | null>(null);
  const bulkImportInFlightRef = useRef(false);
  const bulkImportAbortControllerRef = useRef<AbortController | null>(null);
  const bulkImportRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const { toast } = useToast();

  const resetSingleImport = () => {
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setImportName("");
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const requestId = ++singleParseRequestIdRef.current;
    setError("");
    setFile(selectedFile);
    setParsedData([]);
    setHeaders([]);

    try {
      const parsed = await parseImportPreview(selectedFile);
      if (requestId !== singleParseRequestIdRef.current) {
        return;
      }
      if (parsed.error) {
        setError(parsed.error);
        setFile(null);
        return;
      }

      setHeaders(parsed.headers);
      setParsedData(parsed.rows);
      if (!importName && selectedFile.name) {
        setImportName(stripImportExtension(selectedFile.name));
      }
    } catch (parseError) {
      if (requestId !== singleParseRequestIdRef.current) {
        return;
      }
      setError("Failed to read file. Please ensure the file format is correct.");
      console.error(parseError);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (!droppedFile) return;

    const input = fileInputRef.current;
    if (!input) return;

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(droppedFile);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleSave = async () => {
    if (loading || singleSaveInFlightRef.current) {
      return;
    }

    if (!importName.trim()) {
      setError("Please enter an import name.");
      return;
    }

    if (parsedData.length === 0) {
      setError("No data to save.");
      return;
    }

    setLoading(true);
    setError("");
    singleSaveInFlightRef.current = true;
    singleSaveAbortControllerRef.current?.abort();
    const controller = new AbortController();
    singleSaveAbortControllerRef.current = controller;

    try {
      const rowCount = parsedData.length;
      const savedName = importName.trim();
      await createImport(
        savedName,
        file?.name || "unknown.csv",
        parsedData,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || !isMountedRef.current) {
        return;
      }
      // Clear heavy state before navigating to release memory
      resetSingleImport();
      toast({
        title: "Success",
        description: `Data "${savedName}" has been saved (${rowCount} rows).`,
      });
      onNavigate("saved");
    } catch (saveError: unknown) {
      if (isAbortError(saveError) || !isMountedRef.current) {
        return;
      }
      setError(saveError instanceof Error ? saveError.message : "Failed to save data.");
    } finally {
      if (singleSaveAbortControllerRef.current === controller) {
        singleSaveAbortControllerRef.current = null;
      }
      singleSaveInFlightRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const setBulkSelection = (files: File[]) => {
    setBulkFiles(files);
    setBulkResults(files.map((selectedFile) => ({ filename: selectedFile.name, status: "pending" })));
  };

  const filterSupportedFiles = (files: File[]) =>
    files.filter((candidate) => /\.(csv|xlsx|xls|xlsb)$/i.test(candidate.name));

  const handleBulkFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setBulkSelection(filterSupportedFiles(Array.from(files)));
  };

  const handleBulkDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;
    setBulkSelection(filterSupportedFiles(Array.from(files)));
  };

  const handleBulkImport = async () => {
    if (bulkFiles.length === 0 || bulkProcessing || bulkImportInFlightRef.current) return;

    const requestId = ++bulkImportRequestIdRef.current;
    bulkImportAbortControllerRef.current?.abort();
    const controller = new AbortController();
    bulkImportAbortControllerRef.current = controller;
    bulkImportInFlightRef.current = true;
    setBulkProcessing(true);
    setBulkProgress(0);

    const results: BulkFileResult[] = [];

    for (let index = 0; index < bulkFiles.length; index += 1) {
      if (controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
        break;
      }
      const currentFile = bulkFiles[index];
      const nextPending: BulkFileResult = { filename: currentFile.name, status: "processing" };

      if (isMountedRef.current) {
        setBulkResults((previous) => previous.map((result, resultIndex) => (
          resultIndex === index ? { ...result, status: "processing" } : result
        )));
      }

      try {
        await createImportFromFile(
          stripImportExtension(currentFile.name),
          currentFile,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
          break;
        }
        nextPending.status = "success";
      } catch (bulkError: unknown) {
        if (isAbortError(bulkError) || controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
          break;
        }
        nextPending.status = "error";
        nextPending.error = bulkError instanceof Error ? bulkError.message : "Failed to import";
      }

      results.push(nextPending);
      if (isMountedRef.current) {
        setBulkResults((previous) => previous.map((result, resultIndex) => (
          resultIndex === index ? nextPending : result
        )));
        setBulkProgress(((index + 1) / bulkFiles.length) * 100);
      }
    }

    if (bulkImportAbortControllerRef.current === controller) {
      bulkImportAbortControllerRef.current = null;
    }
    bulkImportInFlightRef.current = false;
    if (!isMountedRef.current || controller.signal.aborted || requestId !== bulkImportRequestIdRef.current) {
      if (isMountedRef.current) {
        setBulkProcessing(false);
      }
      return;
    }

    setBulkProcessing(false);

    const successCount = results.filter((result) => result.status === "success").length;
    const errorCount = results.filter((result) => result.status === "error").length;

    toast({
      title: "Bulk Import Complete",
      description: `${successCount} file(s) imported successfully, ${errorCount} file(s) failed.`,
      variant: errorCount > 0 ? "destructive" : "default",
    });
  };

  const handleClearBulk = () => {
    setBulkFiles([]);
    setBulkResults([]);
    setBulkProgress(0);
    if (bulkInputRef.current) {
      bulkInputRef.current.value = "";
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    if (activeTab === "bulk") {
      singleParseRequestIdRef.current += 1;
      resetSingleImport();
      return;
    }

    if (!bulkProcessing) {
      handleClearBulk();
    }
  }, [activeTab]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      singleSaveAbortControllerRef.current?.abort();
      bulkImportAbortControllerRef.current?.abort();
      singleParseRequestIdRef.current += 1;
      bulkImportRequestIdRef.current += 1;
    };
  }, []);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Import Data</h1>
          <p className="text-muted-foreground">Import data from CSV or Excel files</p>
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
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="single" data-testid="tab-single-import">
              <File className="w-4 h-4 mr-2" />
              Single File
            </TabsTrigger>
            <TabsTrigger value="bulk" data-testid="tab-bulk-import">
              <FolderOpen className="w-4 h-4 mr-2" />
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
              onBulkDrop={handleBulkDrop}
              onBulkDragOver={handleDragOver}
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
