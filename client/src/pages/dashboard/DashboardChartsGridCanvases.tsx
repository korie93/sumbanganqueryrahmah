import { memo } from "react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LoginTrend, PeakHour } from "@/pages/dashboard/types";
import {
  formatDashboardAxisDate,
  formatDashboardHour,
} from "@/pages/dashboard/utils";
import {
  formatDashboardHourCompact,
  type DashboardTooltipProps,
} from "@/pages/dashboard/DashboardChartsGridParts";

interface DashboardLoginTrendChartProps {
  className: string;
  detailed: boolean;
  isMobile: boolean;
  renderTooltip: (props: DashboardTooltipProps) => ReactNode;
  tickDates: string[];
  trends: LoginTrend[];
  variantId: string;
}

interface DashboardPeakHoursChartProps {
  className: string;
  detailed: boolean;
  isMobile: boolean;
  peakHours: PeakHour[];
  renderTooltip: (props: DashboardTooltipProps) => ReactNode;
}

export const DashboardLoginTrendChart = memo(function DashboardLoginTrendChart({
  className,
  detailed,
  isMobile,
  renderTooltip,
  tickDates,
  trends,
  variantId,
}: DashboardLoginTrendChartProps) {
  const loginGradientId = `dashboard-login-gradient-${variantId}`;
  const logoutGradientId = `dashboard-logout-gradient-${variantId}`;

  return (
    <div
      className={`min-w-0 ${className}`}
      role="img"
      aria-label={detailed
        ? "Detailed daily login and logout trend chart"
        : "Daily login and logout trend chart"}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          accessibilityLayer={false}
          data={trends}
          margin={{
            top: 10,
            right: detailed ? 20 : isMobile ? 8 : 16,
            left: isMobile ? -18 : detailed ? 0 : -8,
            bottom: detailed ? 8 : 0,
          }}
        >
          <defs>
            <linearGradient id={loginGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={logoutGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/70" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={tickDates}
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            height={detailed ? 42 : isMobile ? 30 : 36}
            minTickGap={isMobile ? 20 : 24}
            interval={0}
            tickFormatter={(value) => formatDashboardAxisDate(String(value))}
            className="text-2xs text-muted-foreground"
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            width={isMobile ? 32 : detailed ? 48 : 36}
            className="text-2xs text-muted-foreground"
          />
          <Tooltip content={renderTooltip} />
          <Area
            type="monotone"
            dataKey="logins"
            stroke="hsl(var(--chart-1))"
            fill={`url(#${loginGradientId})`}
            strokeWidth={detailed ? 3 : 2}
            name="Logins"
          />
          <Area
            type="monotone"
            dataKey="logouts"
            stroke="hsl(var(--chart-2))"
            fill={`url(#${logoutGradientId})`}
            strokeWidth={detailed ? 3 : 2}
            name="Logouts"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export const DashboardPeakHoursChart = memo(function DashboardPeakHoursChart({
  className,
  detailed,
  isMobile,
  peakHours,
  renderTooltip,
}: DashboardPeakHoursChartProps) {
  return (
    <div
      className={`min-w-0 ${className}`}
      role="img"
      aria-label={detailed ? "Detailed peak activity hours chart" : "Peak activity hours chart"}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={peakHours}
          margin={{
            top: 10,
            right: detailed ? 20 : isMobile ? 8 : 16,
            left: isMobile ? -18 : detailed ? 0 : -8,
            bottom: detailed ? 8 : 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/70" vertical={false} />
          <XAxis
            dataKey="hour"
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            height={detailed ? 40 : isMobile ? 28 : 34}
            interval={detailed ? (isMobile ? 3 : 0) : isMobile ? 5 : 2}
            tickFormatter={(hour) =>
              isMobile
                ? formatDashboardHourCompact(Number(hour))
                : formatDashboardHour(Number(hour))
            }
            className="text-2xs text-muted-foreground"
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            width={isMobile ? 32 : detailed ? 48 : 36}
            className="text-2xs text-muted-foreground"
          />
          <Tooltip content={renderTooltip} />
          <Bar
            dataKey="count"
            fill="hsl(var(--chart-3))"
            radius={[8, 8, 0, 0]}
            name="Logins"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
