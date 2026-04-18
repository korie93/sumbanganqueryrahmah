import { memo } from "react";
import { Crown, Users } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type PieLabelRenderProps,
  type TooltipContentProps,
  type TooltipValueType,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorFallback } from "@/components/QueryErrorFallback";
import { AccessibleChartSummary } from "@/components/ui/chart-accessibility";
import {
  buildDashboardRoleDistributionRowAriaLabel,
  buildDashboardTopUserRowAriaLabel,
} from "@/pages/dashboard/dashboard-row-aria";
import type { RoleData, TopUser } from "@/pages/dashboard/types";
import { formatDashboardUserLastLogin, ROLE_COLORS } from "@/pages/dashboard/utils";

interface DashboardUserInsightsGridProps {
  onRetryRoleDistribution: () => void;
  onRetryTopUsers: () => void;
  roleDistribution: RoleData[] | undefined;
  roleErrorMessage?: string | null;
  roleLoading: boolean;
  topUsers: TopUser[] | undefined;
  topUsersErrorMessage?: string | null;
  topUsersLoading: boolean;
}

type CompactRoleTooltipProps = Pick<
  TooltipContentProps<TooltipValueType, string | number>,
  "active" | "payload"
>;

const ROLE_DOT_CLASS_BY_ROLE: Record<string, string> = {
  admin: "bg-[hsl(var(--chart-2))]",
  superuser: "bg-[hsl(var(--chart-1))]",
  user: "bg-[hsl(var(--chart-3))]",
};

function CompactRoleTooltip({ active, payload }: CompactRoleTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];
  if (!item) {
    return null;
  }
  const role = String(item.name || "Unknown");
  const value = Array.isArray(item.value) ? item.value.join(" / ") : String(item.value ?? "");

  return (
    <div className="min-w-[132px] rounded-xl border border-border/70 bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${ROLE_DOT_CLASS_BY_ROLE[role] || "bg-muted-foreground"}`}
            aria-hidden="true"
          />
          <span className="truncate text-muted-foreground">{role}</span>
        </div>
        <span className="shrink-0 font-semibold text-foreground">{value}</span>
      </div>
    </div>
  );
}

export const DashboardUserInsightsGrid = memo(function DashboardUserInsightsGrid({
  onRetryRoleDistribution,
  onRetryTopUsers,
  roleDistribution,
  roleErrorMessage,
  roleLoading,
  topUsers,
  topUsersErrorMessage,
  topUsersLoading,
}: DashboardUserInsightsGridProps) {
  const isMobile = useIsMobile();
  const chartHeightClassName = isMobile ? "h-[220px]" : "h-[300px]";
  const donutOuterRadius = isMobile ? 58 : 78;
  const donutInnerRadius = isMobile ? 36 : 50;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
      <Card className="glass-card lg:col-span-2" data-testid="card-top-users" data-floating-ai-avoid="true">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Crown className="h-5 w-5" />
            Top Active Users
          </CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {isMobile
              ? "Most active accounts with login count and latest access."
              : "Most active accounts, with login count and latest access kept readable on narrow screens."}
          </p>
        </CardHeader>
        <CardContent aria-live="polite" aria-busy={topUsersLoading}>
          {topUsersLoading ? (
            <div
              className={`flex items-center justify-center rounded-xl border border-border/50 bg-background/35 ${chartHeightClassName}`}
              role="status"
              aria-label="Loading top users"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              <span className="sr-only">Loading top active users</span>
            </div>
          ) : topUsersErrorMessage ? (
            <QueryErrorFallback
              compact
              title="Top active users are unavailable"
              description={topUsersErrorMessage}
              onRetry={onRetryTopUsers}
              data-testid="dashboard-top-users-error"
            />
          ) : topUsers && topUsers.length > 0 ? (
            <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {topUsers.map((user, index) => {
                const formattedLastLogin = formatDashboardUserLastLogin(user.lastLogin);

                return (
                <article
                  key={user.username}
                  role="group"
                  aria-label={buildDashboardTopUserRowAriaLabel({
                    formattedLastLogin,
                    index: index + 1,
                    user,
                  })}
                  className="rounded-xl border border-border/60 bg-background/55 p-3.5 shadow-sm sm:p-4"
                  data-testid={`row-top-user-${index}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {index + 1}
                      </div>
                      <div className="min-w-0 space-y-2">
                        <p className="break-words text-sm font-semibold text-foreground sm:text-base">
                          {user.username}
                        </p>
                        <Badge variant="outline" className="w-fit rounded-full text-[11px] capitalize">
                          {user.role}
                        </Badge>
                      </div>
                    </div>
                    <div className="shrink-0 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-center">
                      <p className="text-lg font-bold leading-none text-foreground">{user.loginCount}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        logins
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Last login:{" "}
                    <span className="text-foreground">
                      {formattedLastLogin}
                    </span>
                  </p>
                </article>
              );
              })}
            </div>
          ) : (
            <EmptyState
              className={chartHeightClassName}
              title="No active-user insights yet"
              description="Top user activity will appear here after successful sign-ins are recorded for this environment."
            />
          )}
        </CardContent>
      </Card>

      <Card className="glass-card" data-testid="card-role-distribution" data-floating-ai-avoid="true">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="h-5 w-5" />
            User Roles
          </CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {isMobile
              ? "Role mix shown in a compact donut with quick counts."
              : "Role mix shown in a smaller donut with a clearer breakdown for phone screens."}
          </p>
        </CardHeader>
        <CardContent className="space-y-3" aria-live="polite" aria-busy={roleLoading}>
          {roleLoading ? (
            <div
              className={`flex items-center justify-center rounded-xl border border-border/50 bg-background/35 ${chartHeightClassName}`}
              role="status"
              aria-label="Loading user roles"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              <span className="sr-only">Loading user role distribution</span>
            </div>
          ) : roleErrorMessage ? (
            <QueryErrorFallback
              compact
              title="User role distribution is unavailable"
              description={roleErrorMessage}
              onRetry={onRetryRoleDistribution}
              data-testid="dashboard-role-error"
            />
          ) : roleDistribution && roleDistribution.length > 0 ? (
            <>
              <div className={`min-w-0 ${chartHeightClassName}`} aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={roleDistribution}
                      dataKey="count"
                      nameKey="role"
                      cx="50%"
                      cy="50%"
                      innerRadius={donutInnerRadius}
                      outerRadius={donutOuterRadius}
                      paddingAngle={isMobile ? 3 : 2}
                      label={!isMobile
                        ? ({ name, value }: PieLabelRenderProps) => (
                            `${String(name ?? "")}: ${typeof value === "number" ? value.toLocaleString() : String(value ?? "")}`
                          )
                        : false}
                      labelLine={false}
                    >
                      {roleDistribution.map((entry, index) => (
                        <Cell
                          key={entry.role}
                          fill={ROLE_COLORS[entry.role] || `hsl(var(--chart-${(index % 5) + 1}))`}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={(props) => <CompactRoleTooltip {...props} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <AccessibleChartSummary
                title="User Roles summary"
                summary="User role distribution across the current account set."
                items={roleDistribution.map((item) => ({
                  label: item.role,
                  value: `${item.count} accounts`,
                }))}
              />
              <div className="grid gap-2">
                {roleDistribution.map((item) => (
                  <div
                    key={item.role}
                    role="group"
                    aria-label={buildDashboardRoleDistributionRowAriaLabel({ item })}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${ROLE_DOT_CLASS_BY_ROLE[item.role] || "bg-muted-foreground"}`}
                        aria-hidden="true"
                      />
                      <span className="truncate capitalize text-foreground">{item.role}</span>
                    </div>
                    <span className="shrink-0 font-semibold text-foreground">{item.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              className={chartHeightClassName}
              title="No role distribution data yet"
              description="Role counts will appear here once the current account set is available to the dashboard."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
});
