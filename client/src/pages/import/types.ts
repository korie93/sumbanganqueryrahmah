export interface ImportProps {
  onNavigate: (page: string) => void;
  importUploadLimitBytes?: number | undefined;
}

export interface BulkFileResult {
  id: string;
  filename: string;
  sizeBytes?: number | undefined;
  status: "pending" | "processing" | "success" | "error";
  error?: string | undefined;
  rowCount?: number | undefined;
  blocked?: boolean | undefined;
  idempotencyKey?: string | undefined;
  idempotencyFingerprint?: string | undefined;
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
