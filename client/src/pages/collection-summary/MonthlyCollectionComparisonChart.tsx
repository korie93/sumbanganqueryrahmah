import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
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
  return (
    <div className="space-y-2">
      <div className="h-[260px] min-w-0 rounded-xl border border-border/60 bg-background/40 p-3">
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
      <p className="text-xs text-muted-foreground">
        Bar chart compares total collection amount by month for the selected nickname.
      </p>
    </div>
  );
}
