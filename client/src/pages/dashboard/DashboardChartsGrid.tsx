import { Clock, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LoginTrend, PeakHour } from "@/pages/dashboard/types";
import { formatDashboardDate, formatDashboardHour } from "@/pages/dashboard/utils";

interface DashboardChartsGridProps {
  onTrendDaysChange: (days: number) => void;
  peakHours: PeakHour[] | undefined;
  peakHoursLoading: boolean;
  trendDays: number;
  trends: LoginTrend[] | undefined;
  trendsLoading: boolean;
}

export function DashboardChartsGrid({
  onTrendDaysChange,
  peakHours,
  peakHoursLoading,
  trendDays,
  trends,
  trendsLoading,
}: DashboardChartsGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="glass-card" data-testid="card-login-trends">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5" />
            Login Trends
          </CardTitle>
          <div className="flex gap-1" role="group" aria-label="Select trend period">
            {[7, 14, 30].map((days) => (
              <Button
                key={days}
                variant={trendDays === days ? "default" : "ghost"}
                size="sm"
                onClick={() => onTrendDaysChange(days)}
                aria-pressed={trendDays === days}
                aria-label={`Show ${days} day trends`}
                data-testid={`button-trend-${days}d`}
              >
                {days}d
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent aria-live="polite">
          {trendsLoading ? (
            <div className="h-[250px] flex items-center justify-center" role="status" aria-label="Loading login trends">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="sr-only">Loading login trends chart</span>
            </div>
          ) : trends && trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="loginGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="logoutGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tickFormatter={formatDashboardDate} className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelFormatter={formatDashboardDate}
                />
                <Area type="monotone" dataKey="logins" stroke="hsl(var(--chart-1))" fill="url(#loginGradient)" name="Logins" />
                <Area type="monotone" dataKey="logouts" stroke="hsl(var(--chart-2))" fill="url(#logoutGradient)" name="Logouts" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">No data available</div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card" data-testid="card-peak-hours">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5" />
            Peak Activity Hours
          </CardTitle>
        </CardHeader>
        <CardContent aria-live="polite">
          {peakHoursLoading ? (
            <div className="h-[250px] flex items-center justify-center" role="status" aria-label="Loading peak hours">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="sr-only">Loading peak hours chart</span>
            </div>
          ) : peakHours && peakHours.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={peakHours}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="hour" tickFormatter={formatDashboardHour} className="text-xs" interval={2} />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelFormatter={(hour) => formatDashboardHour(hour as number)}
                  formatter={(value: number) => [value, "Logins"]}
                />
                <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} name="Logins" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">No data available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
