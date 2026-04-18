import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
  type TooltipValueType,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccessibleChartSummary } from "@/components/ui/chart-accessibility";
import { useIsMobile } from "@/hooks/use-mobile";

interface AnalysisChartsProps {
  categoryBarData: { name: string; count: number; fill: string }[];
  genderPieData: { name: string; value: number; color: string }[];
}

const PIE_LEGEND_DOT_CLASS_BY_COLOR: Record<string, string> = {
  "#3b82f6": "bg-blue-500",
  "#ec4899": "bg-pink-500",
  "#ca8a04": "bg-yellow-600",
  "#16a34a": "bg-green-600",
  "#9333ea": "bg-purple-600",
  "#ea580c": "bg-orange-600",
};

function formatChartTooltipValue(value: TooltipValueType | undefined) {
  if (Array.isArray(value)) {
    return value.join(" / ");
  }

  if (typeof value === "number") {
    return value.toLocaleString();
  }

  return String(value ?? "");
}

export function AnalysisCharts({ categoryBarData, genderPieData }: AnalysisChartsProps) {
  const isMobile = useIsMobile();

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
      <Card className="glass-wrapper border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">Gender Distribution (IC)</CardTitle>
        </CardHeader>
        <CardContent>
          {genderPieData.length > 0 ? (
            <>
              <div aria-hidden="true">
                <ResponsiveContainer width="100%" height={isMobile ? 220 : 250}>
                  <PieChart>
                    <Pie
                      data={genderPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={isMobile
                        ? false
                        : ({ name, percent }: PieLabelRenderProps) => `${String(name ?? "")}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                      outerRadius={isMobile ? 68 : 80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {genderPieData.map((entry) => (
                        <Cell key={`${entry.name}-${entry.color}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatChartTooltipValue(value)} />
                    {!isMobile ? <Legend /> : null}
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <AccessibleChartSummary
                title="Gender Distribution summary"
                summary="Gender distribution derived from IC data."
                items={genderPieData.map((entry) => ({
                  label: entry.name,
                  value: entry.value.toLocaleString(),
                }))}
              />

              {isMobile ? (
                <div className="mt-3 grid gap-2">
                  {genderPieData.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${PIE_LEGEND_DOT_CLASS_BY_COLOR[entry.color] ?? "bg-muted-foreground"}`}
                          aria-hidden="true"
                        />
                        <span className="text-foreground">{entry.name}</span>
                      </div>
                      <span className="font-medium text-foreground">{entry.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground">
              No IC data to display
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-wrapper border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">ID Category Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={isMobile ? 240 : 250}>
              <BarChart
                data={categoryBarData}
                layout="vertical"
                margin={isMobile ? { top: 4, right: 8, bottom: 4, left: 0 } : { top: 0, right: 0, bottom: 0, left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={isMobile ? 88 : 100}
                  tick={{ fontSize: isMobile ? 11 : 12 }}
                />
                <Tooltip formatter={(value) => formatChartTooltipValue(value)} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <AccessibleChartSummary
            title="ID Category Distribution summary"
            summary="Distribution of rows by ID category."
            items={categoryBarData.map((entry) => ({
              label: entry.name,
              value: entry.count.toLocaleString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
