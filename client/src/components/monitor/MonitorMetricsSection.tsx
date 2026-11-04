import { memo, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { InfoHint } from "@/components/monitor/InfoHint";
import { MetricPanel } from "@/components/monitor/MetricPanel";
import { MonitorSectionPaginationBar } from "@/components/monitor/MonitorSectionPaginationBar";
import { getTrend, type MonitorMetricGroup } from "@/components/monitor/monitorData";
import {
  paginateMonitorSectionItems,
  resolveMonitorSectionPageSize,
} from "@/components/monitor/monitor-section-pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAriaExpandedProps } from "@/lib/aria-state-props";

type MonitorMetricsSectionProps = {
  metricGroups: MonitorMetricGroup[];
  embedded?: boolean;
};

function MonitorMetricGroupToggle({
  group,
  open,
  onToggle,
}: {
  group: MonitorMetricGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const toggleContent = (
    <>
      <span className="min-w-0 space-y-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</span>
          <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-xxs">
            {group.items.length} metrics
          </Badge>
        </span>
        <span className="block text-xs font-normal text-muted-foreground">{group.description}</span>
      </span>
      <span className="shrink-0 pt-1 text-muted-foreground">
        {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </span>
    </>
  );

  return (
    <div className="flex items-start gap-2">
      <h3 className="min-w-0 flex-1">
        <button
          type="button"
          className="flex min-h-8 w-full items-start justify-between gap-3 text-left"
          onClick={onToggle}
          {...getAriaExpandedProps(open)}
        >
          {toggleContent}
        </button>
      </h3>
      <InfoHint label={`Maklumat bantuan ${group.title}`} text={group.description} />
    </div>
  );
}

function MonitorMetricsSectionImpl({ metricGroups, embedded = false }: MonitorMetricsSectionProps) {
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);
  const [openGroups, setOpenGroups] = useState<string[]>(() =>
    metricGroups.length > 0 ? [metricGroups[0].title] : [],
  );
  const pageSize = resolveMonitorSectionPageSize("metrics", isMobile);
  const pagedMetricGroups = useMemo(
    () => paginateMonitorSectionItems(metricGroups, page, pageSize),
    [metricGroups, page, pageSize],
  );

  useEffect(() => {
    if (page !== pagedMetricGroups.page) {
      setPage(pagedMetricGroups.page);
    }
  }, [page, pagedMetricGroups.page]);

  useEffect(() => {
    const visibleTitles = new Set(pagedMetricGroups.items.map((group) => group.title));

    setOpenGroups((previous) => {
      const next = previous.filter((title) => visibleTitles.has(title));

      if (next.length > 0 || pagedMetricGroups.items.length === 0) {
        if (next.length === previous.length && next.every((title, index) => title === previous[index])) {
          return previous;
        }
        return next;
      }

      return [pagedMetricGroups.items[0].title];
    });
  }, [pagedMetricGroups.items]);

  const toggleGroup = (title: string) => {
    setOpenGroups((previous) =>
      previous.includes(title)
        ? previous.filter((item) => item !== title)
        : [...previous, title],
    );
  };

  return (
    <section className="space-y-4">
      {embedded ? null : (
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Key Metrics</h2>
            <span className="hidden sm:inline-flex">
              <InfoHint text="KPI panels grouped by layer: Infrastructure, Application, Database, and AI." />
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {isMobile
              ? "Core KPIs grouped by infrastructure, app, database, and AI."
              : "Each metric includes current value, status color, trend direction, and mini sparkline."}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {pagedMetricGroups.items.map((group) => (
          <Card
            key={group.title}
            className="border-border/60 bg-background/35 sqr-backdrop-blur-sm"
          >
            <CardContent className="space-y-3 p-4">
              <MonitorMetricGroupToggle
                group={group}
                open={openGroups.includes(group.title)}
                onToggle={() => toggleGroup(group.title)}
              />
              {openGroups.includes(group.title) ? (
                group.items.map((metric) => (
                  <MetricPanel
                    key={`${group.title}-${metric.label}`}
                    label={metric.label}
                    value={metric.value}
                    unit={metric.unit}
                    description={metric.description}
                    trend={getTrend(metric.history)}
                    status={metric.status}
                    history={metric.history}
                    decimals={metric.decimals ?? 1}
                  />
                ))
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      <MonitorSectionPaginationBar
        page={pagedMetricGroups.page}
        totalPages={pagedMetricGroups.totalPages}
        totalItems={pagedMetricGroups.totalItems}
        label="metric groups"
        onPageChange={setPage}
      />
    </section>
  );
}

/**
 * Renders the shared monitor metrics section component used across SQR screens.
 */
export const MonitorMetricsSection = memo(MonitorMetricsSectionImpl);
