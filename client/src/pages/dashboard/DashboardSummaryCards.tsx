import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SummaryCardItem } from "@/pages/dashboard/types";

interface DashboardSummaryCardsProps {
  items: SummaryCardItem[];
  summaryLoading: boolean;
}

export function DashboardSummaryCards({ items, summaryLoading }: DashboardSummaryCardsProps) {
  const isMobile = useIsMobile();
  const primaryItems = items.slice(0, 4);
  const supportingItems = items.slice(4);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {primaryItems.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className="rounded-2xl border border-border/60 bg-background shadow-sm"
              data-testid={`card-${card.title.toLowerCase().replace(/\s+/g, "-")}`}
              data-floating-ai-avoid="true"
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className={`rounded-xl bg-primary/10 p-2 ${isMobile ? "shrink-0" : ""} ${card.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div aria-live="polite" className="min-w-0 space-y-1">
                    {summaryLoading ? (
                      <div className="space-y-1">
                        <div className="h-7 w-12 rounded bg-muted/50 animate-pulse" aria-hidden="true" />
                        <p className="text-xs leading-5 text-muted-foreground">{card.title}</p>
                      </div>
                    ) : (
                      <>
                        <p className="break-words text-xl font-bold leading-none text-foreground sm:text-[1.85rem]">
                          {card.value.toLocaleString()}
                        </p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {isMobile && card.title === "Stale Record Conflicts (24h)"
                            ? "Stale Conflicts (24h)"
                            : card.title}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {supportingItems.length > 0 ? (
        <section className="rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Supporting Signals
              </p>
              <h3 className="mt-1 text-base font-semibold text-foreground">Operational context</h3>
            </div>
            <p className="text-xs leading-5 text-muted-foreground sm:max-w-sm sm:text-right">
              Keep lower-frequency access and data integrity indicators visible without crowding the main KPI row.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {supportingItems.map((card) => {
              const Icon = card.icon;
              return (
                <Card
                  key={card.title}
                  className="rounded-2xl border border-border/60 bg-muted/10 shadow-none"
                  data-testid={`card-${card.title.toLowerCase().replace(/\s+/g, "-")}`}
                  data-floating-ai-avoid="true"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-xl bg-primary/10 p-2 ${isMobile ? "shrink-0" : ""} ${card.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div aria-live="polite" className="min-w-0 space-y-1">
                        {summaryLoading ? (
                          <div className="space-y-1">
                            <div className="h-7 w-12 rounded bg-muted/50 animate-pulse" aria-hidden="true" />
                            <p className="text-xs leading-5 text-muted-foreground">{card.title}</p>
                          </div>
                        ) : (
                          <>
                            <p className="break-words text-xl font-bold leading-none text-foreground">
                              {card.value.toLocaleString()}
                            </p>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {isMobile && card.title === "Stale Record Conflicts (24h)"
                                ? "Stale Conflicts (24h)"
                                : card.title}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
