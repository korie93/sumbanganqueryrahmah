import { useState, type ReactNode } from "react";
import { Filter, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const hasMobileFilters = isMobile && Boolean(filters);

  return (
    <Card className="ops-section-card">
      <CardHeader className="gap-4 pb-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Icon className="h-5 w-5" />
            {title}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {actions ? (
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
            {hasMobileFilters ? (
              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-open-mobile-filters">
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  className="max-h-[82dvh] rounded-t-[24px] pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]"
                >
                  <SheetHeader className="pr-8 text-left">
                    <SheetTitle>{title} Filters</SheetTitle>
                    <SheetDescription>{description}</SheetDescription>
                  </SheetHeader>
                  <div className="mt-4">{filters}</div>
                </SheetContent>
              </Sheet>
            ) : null}
            {actions}
          </div>
        ) : hasMobileFilters ? (
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-open-mobile-filters">
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[82dvh] rounded-t-[24px] pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]"
              >
                <SheetHeader className="pr-8 text-left">
                  <SheetTitle>{title} Filters</SheetTitle>
                  <SheetDescription>{description}</SheetDescription>
                </SheetHeader>
                <div className="mt-4">{filters}</div>
              </SheetContent>
            </Sheet>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-h-[360px] flex-col gap-4 sm:min-h-[420px]">
        {filters && !isMobile ? <div className="ops-toolbar">{filters}</div> : null}
        {summary ? <div>{summary}</div> : null}
        <div className="min-h-0 flex-1 overflow-auto rounded-[18px] border border-border/60 bg-background/45">
          {children}
        </div>
        {pagination ? <div data-floating-ai-avoid="true">{pagination}</div> : null}
      </CardContent>
    </Card>
  );
}
