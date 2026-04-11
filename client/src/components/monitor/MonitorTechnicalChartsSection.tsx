import { memo, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { InfoHint } from "@/components/monitor/InfoHint";
import { MonitorSectionPaginationBar } from "@/components/monitor/MonitorSectionPaginationBar";
import { TimeSeriesChart } from "@/components/monitor/TimeSeriesChart";
import { buildChartSeries } from "@/components/monitor/monitorData";
import { paginateMonitorSectionItems } from "@/components/monitor/monitor-section-pagination";
import type { MonitorChartSeries, MonitorHistory } from "@/components/monitor/monitorData";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";

type MonitorTechnicalChartsSectionProps = {
  history: MonitorHistory;
  embedded?: boolean;
};

type MonitorChartCategoryGroup = {
  title: string;
  charts: MonitorChartSeries[];
};

function groupMonitorChartsByCategory(chartSeries: MonitorChartSeries[]): MonitorChartCategoryGroup[] {
  const groups = new Map<string, MonitorChartSeries[]>();

  chartSeries.forEach((chart) => {
    const current = groups.get(chart.category);
    if (current) {
      current.push(chart);
      return;
    }

    groups.set(chart.category, [chart]);
  });

  return Array.from(groups.entries()).map(([title, charts]) => ({
    title,
    charts,
  }));
}

function MonitorChartCategoryToggle({
  group,
  open,
  onToggle,
}: {
  group: MonitorChartCategoryGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const toggleContent = (
    <>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{group.title}</span>
          <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
            {group.charts.length} charts
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Open this subgroup only when you need these runtime trend charts.
        </p>
      </div>
      <span className="shrink-0 pt-1 text-muted-foreground">
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </span>
    </>
  );

  return open ? (
    <button
      type="button"
      className="flex w-full items-start justify-between gap-3 text-left"
      onClick={onToggle}
      aria-expanded="true"
    >
      {toggleContent}
    </button>
  ) : (
    <button
      type="button"
      className="flex w-full items-start justify-between gap-3 text-left"
      onClick={onToggle}
      aria-expanded="false"
    >
      {toggleContent}
    </button>
  );
}

function MonitorTechnicalChartsSectionImpl({
  history,
  embedded = false,
}: MonitorTechnicalChartsSectionProps) {
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const chartSeries = useMemo(() => buildChartSeries(history), [history]);
  const chartGroups = useMemo(() => groupMonitorChartsByCategory(chartSeries), [chartSeries]);
  const pageSize = isMobile ? 1 : 2;
  const pagedChartGroups = useMemo(
    () => paginateMonitorSectionItems(chartGroups, page, pageSize),
    [chartGroups, page, pageSize],
  );

  useEffect(() => {
    if (page !== pagedChartGroups.page) {
      setPage(pagedChartGroups.page);
    }
  }, [page, pagedChartGroups.page]);

  useEffect(() => {
    const visibleTitles = new Set(pagedChartGroups.items.map((group) => group.title));

    setOpenGroups((previous) => {
      const next = previous.filter((title) => visibleTitles.has(title));

      if (next.length > 0 || pagedChartGroups.items.length === 0) {
        if (next.length === previous.length && next.every((title, index) => title === previous[index])) {
          return previous;
        }

        return next;
      }

      return [pagedChartGroups.items[0].title];
    });
  }, [pagedChartGroups.items]);

  const toggleGroup = (title: string) => {
    setOpenGroups((previous) =>
      previous.includes(title)
        ? previous.filter((item) => item !== title)
        : [...previous, title],
    );
  };

  return (
    <section className={embedded ? "space-y-4" : "rounded-2xl border border-border/60 bg-slate-200/40 p-4 dark:bg-slate-900/60"}>
      {embedded ? null : (
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Technical DevOps View</h2>
            <InfoHint text="Rolling 60-point technical charts for deeper diagnostics and trend analysis." />
          </div>
          <p className="text-sm text-muted-foreground">
            Designed for operators to detect instability, latency spikes, and capacity pressure quickly.
          </p>
        </div>
      )}
      <div className="space-y-4">
        {pagedChartGroups.items.map((group) => (
          <div
            key={group.title}
            className="space-y-3 rounded-2xl border border-border/60 bg-background/35 p-4 backdrop-blur-sm"
          >
            <MonitorChartCategoryToggle
              group={group}
              open={openGroups.includes(group.title)}
              onToggle={() => toggleGroup(group.title)}
            />
            {openGroups.includes(group.title) ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {group.charts.map((chart) => (
                  <TimeSeriesChart
                    key={chart.title}
                    title={chart.title}
                    description={chart.description}
                    color={chart.color}
                    unit={chart.unit}
                    data={chart.data}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <MonitorSectionPaginationBar
        page={pagedChartGroups.page}
        totalPages={pagedChartGroups.totalPages}
        totalItems={pagedChartGroups.totalItems}
        label="technical chart groups"
        onPageChange={setPage}
      />
    </section>
  );
}

export const MonitorTechnicalChartsSection = memo(MonitorTechnicalChartsSectionImpl);
