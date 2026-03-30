export interface ImportProps {
  onNavigate: (page: string) => void;
  importUploadLimitBytes?: number;
}

export interface BulkFileResult {
  filename: string;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  rowCount?: number;
  blocked?: boolean;
}

export type ImportRow = Record<string, string>;

export interface ParsedPreviewResult {
  headers: string[];
  rows: ImportRow[];
  error?: string;
}

export interface ParsedBulkResult {
  data: ImportRow[];
  error?: string;
}
