export const ANALYSIS_WORKSPACE_QUERY_KEY = "analysisView";

export const ANALYSIS_WORKSPACE_SECTIONS = [
  "overview",
  "quality",
  "compare",
  "trends",
  "issues",
] as const;

export type AnalysisWorkspaceSection =
  (typeof ANALYSIS_WORKSPACE_SECTIONS)[number];

const analysisWorkspaceSectionSet = new Set<string>(
  ANALYSIS_WORKSPACE_SECTIONS,
);

export function isAnalysisWorkspaceSection(
  value: string | null | undefined,
): value is AnalysisWorkspaceSection {
  return Boolean(value && analysisWorkspaceSectionSet.has(value));
}

export function resolveAnalysisWorkspaceSection(
  location: string,
): AnalysisWorkspaceSection {
  try {
    const url = new URL(location, "https://app.sqr.invalid");
    const requestedSection = url.searchParams.get(
      ANALYSIS_WORKSPACE_QUERY_KEY,
    );
    return isAnalysisWorkspaceSection(requestedSection)
      ? requestedSection
      : "overview";
  } catch {
    return "overview";
  }
}

export function buildAnalysisWorkspaceLocation(
  location: string,
  section: AnalysisWorkspaceSection,
): string {
  const url = new URL(location, "https://app.sqr.invalid");
  url.searchParams.set(ANALYSIS_WORKSPACE_QUERY_KEY, section);
  return `${url.pathname}${url.search}${url.hash}`;
}
