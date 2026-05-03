import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import { useId, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatAmountRM } from "@/pages/collection/utils";

type MonthlyCollectionComparisonChartProps = {
  data: CollectionMonthlyComparisonResponse;
};

type TooltipEntry = {
  payload?: {
    totalCollection?: number;
    recordCount?: number;
  };
};

function MonthlyCollectionComparisonTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean | undefined;
  label?: string | number | undefined;
  payload?: TooltipEntry[] | undefined;
}) {
  if (!active || typeof label !== "string" || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-muted-foreground">
        {formatAmountRM(point?.totalCollection || 0)}
      </p>
      <p className="text-muted-foreground">
        {Number(point?.recordCount || 0)} record(s)
      </p>
    </div>
  );
}

export function MonthlyCollectionComparisonChart({
  data,
}: MonthlyCollectionComparisonChartProps) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const chartRegionId = useId();

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Monthly bar chart</p>
          <p className="text-xs text-muted-foreground">
            Compare total collection by month for the selected nickname.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 rounded-full px-3 text-xs"
            onClick={() => {
              setCollapsed((previous) => {
                const nextCollapsed = !previous;
                if (nextCollapsed) {
                  setExpanded(false);
                }
                return nextCollapsed;
              });
            }}
            aria-expanded={!collapsed}
            aria-controls={chartRegionId}
          >
            {collapsed ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                Show chart
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                Minimize chart
              </>
            )}
          </Button>
          {!collapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 rounded-full px-3 text-xs"
              onClick={() => setExpanded((previous) => !previous)}
              aria-pressed={expanded}
              aria-controls={chartRegionId}
            >
              {expanded ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Compact view
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Expand chart
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>

      {!collapsed ? (
        <div
          id={chartRegionId}
          className={`mt-3 min-w-0 rounded-xl border border-border/60 bg-background p-3 ${expanded ? "h-[340px]" : "h-[220px]"}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.months}
              margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tickMargin={10}
                className="text-[11px] text-muted-foreground"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                tickFormatter={(value) => formatAmountRM(Number(value || 0))}
                className="text-[11px] text-muted-foreground"
                width={72}
              />
              <Tooltip content={(props) => <MonthlyCollectionComparisonTooltip {...props} />} />
              <Bar
                dataKey="totalCollection"
                name="Total collection"
                fill="hsl(var(--chart-3))"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p
          id={chartRegionId}
          className="mt-3 rounded-xl border border-dashed border-border/60 bg-background px-3 py-3 text-xs text-muted-foreground"
        >
          Chart is minimized. Expand it again to review the monthly bar trend.
        </p>
      )}
    </div>
  );
}
