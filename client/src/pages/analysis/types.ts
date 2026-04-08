export interface AnalysisProps {
  onNavigate: (page: string) => void;
}

export interface AnalysisCategory {
  count: number;
  samples: string[];
}

export interface DuplicateItem {
  value: string;
  count: number;
}

export interface AnalysisData {
  icLelaki: AnalysisCategory;
  icPerempuan: AnalysisCategory;
  noPolis: AnalysisCategory;
  noTentera: AnalysisCategory;
  passportMY: AnalysisCategory;
  passportLuarNegara: AnalysisCategory;
  duplicates: { count: number; items: DuplicateItem[] };
}

export interface SingleAnalysisResult {
  import: { id: string; name: string; filename: string };
  totalRows: number;
  analysis: AnalysisData;
}

export interface AllAnalysisResult {
  totalImports: number;
  totalRows: number;
  imports: { id: string; name: string; filename: string; rowCount: number }[];
  analysis: AnalysisData;
}

export type AnalysisMode = "single" | "all";
