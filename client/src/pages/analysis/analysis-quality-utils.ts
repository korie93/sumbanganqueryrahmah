import type {
  AnalysisColumnProfile,
  AnalysisQuality,
} from "@/pages/analysis/types";

export const ANALYSIS_QUALITY_PAGE_SIZE = 8;

export function getAnalysisQualityLabel(grade: AnalysisQuality["grade"]) {
  switch (grade) {
    case "excellent":
      return "Excellent";
    case "good":
      return "Good";
    case "review":
      return "Needs review";
    case "poor":
      return "Poor";
    case "no_data":
      return "No data";
  }
}

export function getAnalysisColumnTypeLabel(
  valueType: AnalysisColumnProfile["inferredType"],
) {
  switch (valueType) {
    case "boolean":
      return "Boolean";
    case "date":
      return "Date";
    case "empty":
      return "Empty";
    case "mixed":
      return "Mixed";
    case "number":
      return "Number";
    case "structured":
      return "Structured";
    case "text":
      return "Text";
  }
}

export function filterAnalysisColumnProfiles(
  profiles: AnalysisColumnProfile[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return profiles;
  }

  return profiles.filter((profile) =>
    profile.name.toLowerCase().includes(normalizedQuery) ||
    profile.inferredType.includes(normalizedQuery),
  );
}

export function getAnalysisColumnIssueCount(profile: AnalysisColumnProfile) {
  return Number(profile.emptyCount > 0)
    + Number(profile.inferredType === "mixed");
}

export function formatAnalysisUniqueCount(profile: AnalysisColumnProfile) {
  const value = profile.uniqueCount.toLocaleString();
  return profile.uniqueCountIsApproximate ? `${value}+` : value;
}
