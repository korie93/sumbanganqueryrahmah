import {
  BarChart3,
  CircleAlert,
  GitCompareArrows,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  AnalysisData,
  AnalysisMode,
  AllAnalysisResult,
} from "@/pages/analysis/types";
import type { AnalysisWorkspaceSection } from "@/pages/analysis/analysis-workspace";

export type AnalysisWorkspaceNavigationItem = {
  key: AnalysisWorkspaceSection;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string | number;
};

type BuildAnalysisWorkspaceNavigationItemsOptions = {
  allResult: AllAnalysisResult | null;
  analysis: AnalysisData;
  mode: AnalysisMode;
};

export function buildAnalysisWorkspaceNavigationItems({
  allResult,
  analysis,
  mode,
}: BuildAnalysisWorkspaceNavigationItemsOptions): AnalysisWorkspaceNavigationItem[] {
  return [
    {
      key: "overview",
      label: "Overview",
      description: "Scope and headline totals",
      icon: LayoutDashboard,
    },
    {
      key: "quality",
      label: "Quality",
      description: "Completeness and column health",
      icon: ShieldCheck,
      badge: `${analysis.quality.score}%`,
    },
    {
      key: "compare",
      label: "Compare",
      description: "Saved file differences",
      icon: GitCompareArrows,
      badge: mode === "all" ? allResult?.totalImports ?? 0 : "All",
    },
    {
      key: "trends",
      label: "Trends",
      description: "Distribution charts",
      icon: BarChart3,
    },
    {
      key: "issues",
      label: "Issues",
      description: "Duplicates and ID signals",
      icon: CircleAlert,
      badge: analysis.duplicates.count,
    },
  ];
}
