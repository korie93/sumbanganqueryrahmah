import { Crown, Users } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import type { RoleData, TopUser } from "@/pages/dashboard/types";
import { ROLE_COLORS } from "@/pages/dashboard/utils";

interface DashboardUserInsightsGridProps {
  roleDistribution: RoleData[] | undefined;
  roleLoading: boolean;
  topUsers: TopUser[] | undefined;
  topUsersLoading: boolean;
}

type PieTooltipPayloadItem = {
  color?: string;
  name?: string | number;
  value?: string | number | readonly (string | number)[];
};

type CompactRoleTooltipProps = {
  active?: boolean;
  payload?: PieTooltipPayloadItem[];
};

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

export function DashboardUserInsightsGrid({
  roleDistribution,
  roleLoading,
  topUsers,
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
            Most active accounts, with login count and latest access kept readable on narrow screens.
          </p>
        </CardHeader>
        <CardContent aria-live="polite">
          {topUsersLoading ? (
            <div
              className={`flex items-center justify-center rounded-xl border border-border/50 bg-background/35 ${chartHeightClassName}`}
              role="status"
              aria-label="Loading top users"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              <span className="sr-only">Loading top active users</span>
            </div>
          ) : topUsers && topUsers.length > 0 ? (
            <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {topUsers.map((user, index) => (
                <article
                  key={user.username}
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
                        <Badge variant="outline" className="w-fit text-[11px] capitalize">
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
                      {user.lastLogin
                        ? formatDateTimeDDMMYYYY(user.lastLogin, { fallback: "Unknown" })
                        : "Unknown"}
                    </span>
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div
              className={`flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/35 text-muted-foreground ${chartHeightClassName}`}
            >
              No data available
            </div>
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
            Role mix shown in a smaller donut with a clearer breakdown for phone screens.
          </p>
        </CardHeader>
        <CardContent className="space-y-3" aria-live="polite">
          {roleLoading ? (
            <div
              className={`flex items-center justify-center rounded-xl border border-border/50 bg-background/35 ${chartHeightClassName}`}
              role="status"
              aria-label="Loading user roles"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              <span className="sr-only">Loading user role distribution</span>
            </div>
          ) : roleDistribution && roleDistribution.length > 0 ? (
            <>
              <div className={`min-w-0 ${chartHeightClassName}`}>
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
                      label={!isMobile ? ({ role, count }) => `${role}: ${count}` : false}
                      labelLine={false}
                    >
                      {roleDistribution.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={ROLE_COLORS[entry.role] || `hsl(var(--chart-${(index % 5) + 1}))`}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={(props) => <CompactRoleTooltip {...props} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2">
                {roleDistribution.map((item) => (
                  <div
                    key={item.role}
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
            <div
              className={`flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/35 text-muted-foreground ${chartHeightClassName}`}
            >
              No data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
