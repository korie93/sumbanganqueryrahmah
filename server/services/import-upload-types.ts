export type ImportRow = Record<string, string>;

export type ParsedImportUploadResult = {
  headers: string[];
  rows: ImportRow[];
  error?: string;
};
