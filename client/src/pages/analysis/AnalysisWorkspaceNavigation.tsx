import { useMemo, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAriaCurrentPageProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
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
  const [collapsed, setCollapsed] = useState(false);
  const items = useMemo(
    () =>
      buildAnalysisWorkspaceNavigationItems({
        allResult,
        analysis,
        mode,
      }),
    [allResult, analysis, mode],
  );

  return (
    <>
      <HorizontalScrollHint
        className="xl:hidden"
        viewportClassName="flex gap-2 pb-1"
        hint="More sections"
      >
        <nav
          className="flex min-w-max gap-2"
          aria-label="Analysis sections"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeSection;
            return (
              <Button
                key={`analysis-mobile-${item.key}`}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                className="h-10 shrink-0 gap-2"
                onClick={() => onSelect(item.key)}
                {...getAriaCurrentPageProps(active)}
                data-testid={`analysis-section-${item.key}`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {item.badge !== undefined ? (
                  <Badge
                    variant={active ? "secondary" : "outline"}
                    className="min-w-6 justify-center px-1.5"
                  >
                    {item.badge}
                  </Badge>
                ) : null}
              </Button>
            );
          })}
        </nav>
      </HorizontalScrollHint>

      <aside
        className={cn(
          "sticky top-4 hidden shrink-0 self-start border-r border-border/65 pr-3 transition-[width] duration-150 motion-reduce:transition-none xl:block",
          collapsed ? "w-16" : "w-56",
        )}
      >
        <div className={cn("mb-2 flex", collapsed ? "justify-center" : "justify-end")}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? "Expand analysis sidebar" : "Collapse analysis sidebar"}
            title={collapsed ? "Expand analysis sidebar" : "Collapse analysis sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        <nav className="space-y-1" aria-label="Analysis sections">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeSection;
            const collapsedItemLabelProps = collapsed ? { "aria-label": item.label } : {};
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                className={cn(
                  "flex min-h-14 w-full items-center rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                  collapsed ? "justify-center" : "gap-3",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/78 hover:bg-accent hover:text-foreground",
                )}
                {...collapsedItemLabelProps}
                {...getAriaCurrentPageProps(active)}
                title={collapsed ? item.label : item.description}
                data-testid={`analysis-sidebar-${item.key}`}
              >
                <span
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {!collapsed ? (
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{item.label}</span>
                      {item.badge !== undefined ? (
                        <Badge
                          variant={active ? "default" : "secondary"}
                          className="shrink-0 px-1.5"
                        >
                          {item.badge}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
