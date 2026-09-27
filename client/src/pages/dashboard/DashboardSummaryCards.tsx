import { memo, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SummaryCardItem } from "@/pages/dashboard/types";

interface DashboardSummaryCardsProps {
  items: SummaryCardItem[];
  summaryLoading: boolean;
}

function DashboardSummaryCardsImpl({ items, summaryLoading }: DashboardSummaryCardsProps) {
  const isMobile = useIsMobile();
  const primaryItems = useMemo(() => items.slice(0, 4), [items]);
  const supportingItems = useMemo(() => items.slice(4), [items]);

  return (
    <div className="space-y-4">
      <div className="dashboard-core-metrics">
        {primaryItems.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.title}
              className="dashboard-core-metric"
              data-testid={`card-${card.title.toLowerCase().replace(/\s+/g, "-")}`}
              data-floating-ai-avoid="true"
            >
                <div className="flex items-start justify-between gap-3">
                  <div className="order-2 shrink-0 text-muted-foreground">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div aria-live="polite" className="min-w-0 space-y-1">
                    {summaryLoading ? (
                      <div className="space-y-1">
                        <div className="h-7 w-12 rounded bg-muted/50 animate-pulse" aria-hidden="true" />
                        <p className="text-xs leading-5 text-muted-foreground">{card.title}</p>
                      </div>
                    ) : (
                      <>
                        <p className="break-words text-2xl font-semibold leading-none text-foreground sm:text-dashboard-metric">
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
            </article>
          );
        })}
      </div>

      {supportingItems.length > 0 ? (
        <section aria-label="Supporting Signals">
          <h3 className="text-sm font-medium text-foreground">Operational context</h3>

          <dl className="dashboard-supporting-metrics">
            {supportingItems.map((card) => {
              return (
                <div
                  key={card.title}
                  className="dashboard-supporting-metric"
                  data-testid={`card-${card.title.toLowerCase().replace(/\s+/g, "-")}`}
                  data-floating-ai-avoid="true"
                >
                  <dt className="min-w-0 text-xs leading-5 text-muted-foreground">
                    {isMobile && card.title === "Stale Record Conflicts (24h)"
                      ? "Stale Conflicts (24h)"
                      : card.title}
                  </dt>
                  <dd aria-live="polite" className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {summaryLoading ? (
                      <div className="h-5 w-8 rounded bg-muted/50 animate-pulse" aria-hidden="true" />
                    ) : card.value.toLocaleString()}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

export const DashboardSummaryCards = memo(DashboardSummaryCardsImpl);
DashboardSummaryCards.displayName = "DashboardSummaryCards";
