export interface ImportProps {
  onNavigate: (page: string) => void;
}

export interface BulkFileResult {
  filename: string;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  rowCount?: number;
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
