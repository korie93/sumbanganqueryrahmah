import { Card, CardContent } from "@/components/ui/card";
import type { SummaryCardItem } from "@/pages/dashboard/types";

interface DashboardSummaryCardsProps {
  items: SummaryCardItem[];
  summaryLoading: boolean;
}

export function DashboardSummaryCards({ items, summaryLoading }: DashboardSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {items.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="glass-card" data-testid={`card-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-background/50 ${card.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div aria-live="polite">
                  {summaryLoading ? (
                    <div className="space-y-1">
                      <div className="h-7 w-12 bg-muted/50 rounded animate-pulse" aria-label="Loading value" />
                      <p className="text-xs text-muted-foreground">{card.title}</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-foreground">{card.value.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{card.title}</p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
