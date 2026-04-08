export interface ImportProps {
  onNavigate: (page: string) => void;
  importUploadLimitBytes?: number | undefined;
}

export interface BulkFileResult {
  id: string;
  filename: string;
  status: "pending" | "processing" | "success" | "error";
  error?: string | undefined;
  rowCount?: number | undefined;
  blocked?: boolean | undefined;
}

export type ImportRow = Record<string, string>;

export interface ParsedPreviewResult {
  headers: string[];
  rows: ImportRow[];
  error?: string | undefined;
}

export interface ParsedBulkResult {
  data: ImportRow[];
  error?: string | undefined;
}
