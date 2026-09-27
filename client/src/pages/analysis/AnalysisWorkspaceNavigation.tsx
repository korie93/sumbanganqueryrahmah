import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAriaCurrentPageProps } from "@/lib/aria-state-props";
import type {
  AnalysisData,
  AnalysisMode,
  AllAnalysisResult,
} from "@/pages/analysis/types";
import type { AnalysisWorkspaceSection } from "@/pages/analysis/analysis-workspace";
import { buildAnalysisWorkspaceNavigationItems } from "@/pages/analysis/analysis-workspace-navigation-items";

type AnalysisWorkspaceNavigationProps = {
  activeSection: AnalysisWorkspaceSection;
  allResult: AllAnalysisResult | null;
  analysis: AnalysisData;
  mode: AnalysisMode;
  onSelect: (section: string) => void;
};

export function AnalysisWorkspaceNavigation({
  activeSection,
  allResult,
  analysis,
  mode,
  onSelect,
}: AnalysisWorkspaceNavigationProps) {
  const items = useMemo(
    () => buildAnalysisWorkspaceNavigationItems({ allResult, analysis, mode }),
    [allResult, analysis, mode],
  );

  return (
    <nav
      className="flex min-w-0 flex-wrap gap-2 border-b border-border pb-3"
      aria-label="Analysis sections"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.key === activeSection;
        return (
          <Button
            key={item.key}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            className="min-h-11 max-w-full gap-2 sm:min-h-9"
            onClick={() => onSelect(item.key)}
            {...getAriaCurrentPageProps(active)}
            title={item.description}
            data-testid={`analysis-section-${item.key}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span data-testid={`analysis-sidebar-${item.key}`}>{item.label}</span>
            {item.badge !== undefined ? (
              <Badge
                variant={active ? "secondary" : "outline"}
                className="min-w-6 justify-center px-1.5 tabular-nums"
              >
                {item.badge}
              </Badge>
            ) : null}
          </Button>
        );
      })}
    </nav>
  );
}
