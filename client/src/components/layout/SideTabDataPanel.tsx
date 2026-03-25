import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SideTabDataPanelProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: ReactNode;
  filters?: ReactNode;
  summary?: ReactNode;
  pagination?: ReactNode;
  children: ReactNode;
};

export function SideTabDataPanel({
  title,
  description,
  icon: Icon,
  actions,
  filters,
  summary,
  pagination,
  children,
}: SideTabDataPanelProps) {
  return (
    <Card className="ops-section-card">
      <CardHeader className="gap-4 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Icon className="h-5 w-5" />
            {title}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className="flex min-h-[420px] flex-col gap-4">
        {filters ? <div className="ops-toolbar">{filters}</div> : null}
        {summary ? <div>{summary}</div> : null}
        <div className="min-h-0 flex-1 overflow-auto rounded-[18px] border border-border/60 bg-background/45">
          {children}
        </div>
        {pagination ? <div data-floating-ai-avoid="true">{pagination}</div> : null}
      </CardContent>
    </Card>
  );
}
