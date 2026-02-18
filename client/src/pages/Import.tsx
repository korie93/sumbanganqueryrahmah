import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, Save, AlertCircle, CheckCircle2, XCircle, FolderOpen, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { createImport } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

interface ImportProps {
  onNavigate: (page: string) => void;
}

interface BulkFileResult {
  filename: string;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  rowCount?: number;
}

export default function Import({ onNavigate }: ImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importName, setImportName] = useState("");
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkFileResult[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setError("");
    setFile(selectedFile);

    const fileName = selectedFile.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx") && !fileName.endsWith(".xls") && !fileName.endsWith(".xlsb")) {
      setError("Please select a CSV or Excel file (.xlsx, .xls, .xlsb)");
      setFile(null);
      return;
    }

    try {
      if (fileName.endsWith(".csv")) {
        await parseCSV(selectedFile);
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".xlsb")) {
        await parseExcel(selectedFile);
      }
    } catch (err) {
      setError("Failed to read file. Please ensure the file format is correct.");
      console.error(err);
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const parseCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/);

    if (lines.length === 0) {
      setError("CSV file is empty.");
      return;
    }

    let headerLineIndex = 0;
    while (headerLineIndex < lines.length && !lines[headerLineIndex].trim()) {
      headerLineIndex++;
    }
    
    if (headerLineIndex >= lines.length) {
      setError("CSV file is empty.");
      return;
    }

    const headerLine = lines[headerLineIndex];
    const csvHeaders = parseCSVLine(headerLine);
    setHeaders(csvHeaders);

    const rows: any[] = [];
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const values = parseCSVLine(line);
      const row: Record<string, string> = {};
      csvHeaders.forEach((header, idx) => {
        row[header] = values[idx] || "";
      });
      
      const hasData = Object.values(row).some(v => v !== "");
      if (hasData) {
        rows.push(row);
      }
    }

    setParsedData(rows);
    if (!importName && file.name) {
      setImportName(file.name.replace(/\.(csv|xlsx|xls|xlsb)$/i, ""));
    }
  };

  const parseExcel = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true, cellNF: false, cellText: false });
    
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      setError("Excel file does not have any sheets.");
      return;
    }
    
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false }) as any[][];
    
    if (jsonData.length === 0) {
      setError("Excel file is empty.");
      return;
    }
    
    let headerRowIndex = 0;
    let maxNonEmptyCols = 0;
    for (let i = 0; i < Math.min(5, jsonData.length); i++) {
      const row = jsonData[i] as any[];
      const nonEmptyCount = row.filter(cell => cell !== "" && cell !== null && cell !== undefined).length;
      if (nonEmptyCount > maxNonEmptyCols) {
        maxNonEmptyCols = nonEmptyCount;
        headerRowIndex = i;
      }
    }
    
    const excelHeaders = (jsonData[headerRowIndex] as any[]).map((h, idx) => {
      const val = String(h || "").trim();
      return val || `Column_${idx + 1}`;
    });
    setHeaders(excelHeaders);
    
    const rows: any[] = [];
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const rowData = jsonData[i] as any[];
      
      const hasAnyData = rowData.some((cell, idx) => {
        if (idx >= excelHeaders.length) return false;
        const val = String(cell ?? "").trim();
        return val !== "";
      });
      
      if (!hasAnyData) continue;
      
      const row: Record<string, string> = {};
      excelHeaders.forEach((header, idx) => {
        const cellVal = rowData[idx];
        if (cellVal instanceof Date) {
          row[header] = cellVal.toLocaleDateString('en-MY');
        } else {
          row[header] = String(cellVal ?? "").trim();
        }
      });
      rows.push(row);
    }
    
    setParsedData(rows);
    if (!importName && file.name) {
      setImportName(file.name.replace(/\.(csv|xlsx|xls|xlsb)$/i, ""));
    }
  };

  const parseFileForBulk = async (file: File): Promise<{ data: any[]; error?: string }> => {
    const fileName = file.name.toLowerCase();
    
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx") && !fileName.endsWith(".xls") && !fileName.endsWith(".xlsb")) {
      return { data: [], error: "Unsupported file format" };
    }

    try {
      if (fileName.endsWith(".csv")) {
        const text = await file.text();
        const lines = text.split(/\r?\n/);

        if (lines.length === 0) {
          return { data: [], error: "CSV file is empty" };
        }

        let headerLineIndex = 0;
        while (headerLineIndex < lines.length && !lines[headerLineIndex].trim()) {
          headerLineIndex++;
        }
        
        if (headerLineIndex >= lines.length) {
          return { data: [], error: "CSV file is empty" };
        }

        const headerLine = lines[headerLineIndex];
        const csvHeaders = parseCSVLine(headerLine);

        const rows: any[] = [];
        for (let i = headerLineIndex + 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;
          
          const values = parseCSVLine(line);
          const row: Record<string, string> = {};
          csvHeaders.forEach((header, idx) => {
            row[header] = values[idx] || "";
          });
          
          const hasData = Object.values(row).some(v => v !== "");
          if (hasData) {
            rows.push(row);
          }
        }

        return { data: rows };
      } else {
        const arrayBuffer = await file.arrayBuffer();
        let workbook;
        try {
          workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true, cellNF: false, cellText: false });
        } catch (xlsxError: any) {
          if (xlsxError.message?.includes("password") || xlsxError.message?.includes("encrypt")) {
            return { data: [], error: "File is password protected" };
          }
          if (xlsxError.message?.includes("Unsupported") || xlsxError.message?.includes("corrupt")) {
            return { data: [], error: "File is corrupted or unsupported format" };
          }
          return { data: [], error: xlsxError.message || "Failed to read Excel file" };
        }
        
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          return { data: [], error: "Excel file has no sheets" };
        }
        
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false }) as any[][];
        
        if (jsonData.length === 0) {
          return { data: [], error: "Excel file is empty" };
        }
        
        let headerRowIndex = 0;
        let maxNonEmptyCols = 0;
        for (let i = 0; i < Math.min(5, jsonData.length); i++) {
          const row = jsonData[i] as any[];
          const nonEmptyCount = row.filter(cell => cell !== "" && cell !== null && cell !== undefined).length;
          if (nonEmptyCount > maxNonEmptyCols) {
            maxNonEmptyCols = nonEmptyCount;
            headerRowIndex = i;
          }
        }
        
        const excelHeaders = (jsonData[headerRowIndex] as any[]).map((h, idx) => {
          const val = String(h || "").trim();
          return val || `Column_${idx + 1}`;
        });
        
        const rows: any[] = [];
        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const rowData = jsonData[i] as any[];
          
          const hasAnyData = rowData.some((cell, idx) => {
            if (idx >= excelHeaders.length) return false;
            const val = String(cell ?? "").trim();
            return val !== "";
          });
          
          if (!hasAnyData) continue;
          
          const row: Record<string, string> = {};
          excelHeaders.forEach((header, idx) => {
            const cellVal = rowData[idx];
            if (cellVal instanceof Date) {
              row[header] = cellVal.toLocaleDateString('en-MY');
            } else {
              row[header] = String(cellVal ?? "").trim();
            }
          });
          rows.push(row);
        }
        
        return { data: rows };
      }
    } catch (err: any) {
      return { data: [], error: err.message || "Failed to parse file" };
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const input = fileInputRef.current;
      if (input) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(droppedFile);
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleBulkFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files).filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsb");
    });

    setBulkFiles(fileArray);
    setBulkResults(fileArray.map(f => ({ filename: f.name, status: "pending" })));
  };

  const handleBulkDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files).filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsb");
    });

    setBulkFiles(fileArray);
    setBulkResults(fileArray.map(f => ({ filename: f.name, status: "pending" })));
  };

  const handleBulkImport = async () => {
    if (bulkFiles.length === 0) return;

    setBulkProcessing(true);
    setBulkProgress(0);

    const results: BulkFileResult[] = [];

    for (let i = 0; i < bulkFiles.length; i++) {
      const file = bulkFiles[i];
      const result: BulkFileResult = { filename: file.name, status: "processing" };
      
      setBulkResults(prev => prev.map((r, idx) => 
        idx === i ? { ...r, status: "processing" } : r
      ));

      try {
        const { data, error } = await parseFileForBulk(file);
        
        if (error) {
          result.status = "error";
          result.error = error;
        } else if (data.length === 0) {
          result.status = "error";
          result.error = "No data found in file";
        } else {
          const importName = file.name.replace(/\.(csv|xlsx|xls|xlsb)$/i, "");
          await createImport(importName, file.name, data);
          result.status = "success";
          result.rowCount = data.length;
        }
      } catch (err: any) {
        result.status = "error";
        result.error = err.message || "Failed to import";
      }

      results.push(result);
      setBulkResults(prev => prev.map((r, idx) => 
        idx === i ? result : r
      ));
      setBulkProgress(((i + 1) / bulkFiles.length) * 100);
    }

    setBulkProcessing(false);

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;

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

  const handleSave = async () => {
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

    try {
      await createImport(importName.trim(), file?.name || "unknown.csv", parsedData);
      
      toast({
        title: "Success",
        description: `Data "${importName}" has been saved (${parsedData.length} rows).`,
      });
      onNavigate("saved");
    } catch (err: any) {
      setError(err?.message || "Failed to save data.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setImportName("");
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Import Data</h1>
          <p className="text-muted-foreground">Import data from CSV or Excel files</p>
        </div>

        <Tabs defaultValue="single" className="w-full">
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
            <div className="glass-wrapper p-6 mb-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">Import Name</label>
                <Input
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="Enter a name for this import"
                  className="max-w-md"
                  data-testid="input-import-name"
                />
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-file"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.xlsb"
                  onChange={handleFileChange}
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

              {file && (
                <div className="mt-4 flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                  <span className="text-sm text-foreground">{file.name}</span>
                  <button
                    onClick={handleClear}
                    className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                    data-testid="button-clear-file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>

            {parsedData.length > 0 && (
              <div className="glass-wrapper p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    Data Preview ({parsedData.length} rows)
                  </h2>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleClear} disabled={loading} data-testid="button-cancel">
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={loading} data-testid="button-save">
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
                        {headers.map((header, idx) => (
                          <th key={idx} className="text-left p-3 font-medium text-muted-foreground">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 10).map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-t border-border hover:bg-muted/50">
                          <td className="p-3 text-muted-foreground">{rowIdx + 1}</td>
                          {headers.map((header, colIdx) => (
                            <td key={colIdx} className="p-3 text-foreground">
                              {row[header] || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedData.length > 10 && (
                    <div className="p-3 text-center text-sm text-muted-foreground bg-muted/30">
                      ... and {parsedData.length - 10} more rows
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="bulk">
            <div className="glass-wrapper p-6 mb-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground mb-2">Bulk Import</h2>
                <p className="text-sm text-muted-foreground">
                  Select multiple files to import at once. Each file will be imported as a separate dataset.
                </p>
              </div>

              <div
                onDrop={handleBulkDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => bulkInputRef.current?.click()}
                data-testid="dropzone-bulk"
              >
                <input
                  ref={bulkInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.xlsb"
                  multiple
                  onChange={handleBulkFileSelect}
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

              {bulkFiles.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-foreground">
                      Selected Files ({bulkFiles.length})
                    </h3>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleClearBulk} disabled={bulkProcessing} data-testid="button-clear-bulk">
                        Clear All
                      </Button>
                      <Button onClick={handleBulkImport} disabled={bulkProcessing} data-testid="button-start-bulk">
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

                  {bulkProcessing && (
                    <div className="mb-4">
                      <Progress value={bulkProgress} className="h-2" />
                      <p className="text-sm text-muted-foreground mt-2 text-center">
                        Processing: {Math.round(bulkProgress)}%
                      </p>
                    </div>
                  )}

                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {bulkResults.map((result, idx) => (
                      <div 
                        key={idx} 
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          result.status === "success" 
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                            : result.status === "error"
                            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                            : result.status === "processing"
                            ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                            : "bg-muted/50 border-border"
                        }`}
                        data-testid={`bulk-file-${idx}`}
                      >
                        {result.status === "success" && (
                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                        )}
                        {result.status === "error" && (
                          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                        )}
                        {result.status === "processing" && (
                          <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
                        )}
                        {result.status === "pending" && (
                          <FileSpreadsheet className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {result.filename}
                          </p>
                          {result.status === "success" && result.rowCount && (
                            <p className="text-xs text-green-600 dark:text-green-400">
                              {result.rowCount} rows imported
                            </p>
                          )}
                          {result.status === "error" && result.error && (
                            <p className="text-xs text-red-600 dark:text-red-400">
                              {result.error}
                            </p>
                          )}
                        </div>

                        <Badge 
                          variant={
                            result.status === "success" ? "default" : 
                            result.status === "error" ? "destructive" : 
                            "secondary"
                          }
                          className="flex-shrink-0"
                        >
                          {result.status === "success" ? "Success" : 
                           result.status === "error" ? "Failed" : 
                           result.status === "processing" ? "Processing" : 
                           "Pending"}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {bulkResults.some(r => r.status === "error") && !bulkProcessing && (
                    <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                        Failed Imports Summary
                      </h4>
                      <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                        {bulkResults.filter(r => r.status === "error").map((r, idx) => (
                          <li key={idx}>
                            <span className="font-medium">{r.filename}</span>: {r.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
