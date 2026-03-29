import { Card, CardContent } from "@/components/ui/card";
import type { SummaryCardItem } from "@/pages/dashboard/types";

interface DashboardSummaryCardsProps {
  items: SummaryCardItem[];
  summaryLoading: boolean;
}

export function DashboardSummaryCards({ items, summaryLoading }: DashboardSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-7">
      {items.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.title}
            className="glass-card"
            data-testid={`card-${card.title.toLowerCase().replace(/\s+/g, "-")}`}
            data-floating-ai-avoid="true"
          >
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className={`rounded-xl bg-background/50 p-2.5 ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div aria-live="polite" className="min-w-0 space-y-1">
                  {summaryLoading ? (
                    <div className="space-y-1">
                      <div className="h-7 w-12 bg-muted/50 rounded animate-pulse" aria-label="Loading value" />
                      <p className="text-xs leading-5 text-muted-foreground">{card.title}</p>
                    </div>
                  ) : (
                    <>
                      <p className="break-words text-2xl font-bold leading-none text-foreground sm:text-[1.75rem]">
                        {card.value.toLocaleString()}
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">{card.title}</p>
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
