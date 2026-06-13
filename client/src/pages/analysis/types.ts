import type {
  AllImportsAnalysisResponse,
  ImportAnalysisColumnProfileContract,
  ImportAnalysisDataContract,
  ImportAnalysisDuplicateItemContract,
  ImportAnalysisQualityContract,
  SingleImportAnalysisResponse,
} from "@shared/api-contracts";

export interface AnalysisProps {
  onNavigate: (page: string, importId?: string) => void;
}

export type AnalysisCategory = ImportAnalysisDataContract["icLelaki"];
export type AnalysisColumnProfile = ImportAnalysisColumnProfileContract;
export type AnalysisData = ImportAnalysisDataContract;
export type AnalysisQuality = ImportAnalysisQualityContract;
export type DuplicateItem = ImportAnalysisDuplicateItemContract;
export type SingleAnalysisResult = SingleImportAnalysisResponse;
export type AllAnalysisResult = AllImportsAnalysisResponse;

export type AnalysisMode = "single" | "all";
