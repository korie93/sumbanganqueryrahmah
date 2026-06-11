import { useEffect, useMemo, useRef } from "react";
import { Crown, Users } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import {
  buildDashboardRoleDistributionRowAriaLabel,
  buildDashboardTopUserRowAriaLabel,
} from "@/pages/dashboard/dashboard-row-aria";
import type { RoleData, TopUser } from "@/pages/dashboard/types";
import { formatDashboardUserLastLogin, ROLE_COLORS } from "@/pages/dashboard/utils";

interface DashboardUserInsightsGridProps {
  onRetryRoleDistribution: () => void;
  onRetryTopUsers: () => void;
  roleErrorMessage: string | null;
  roleDistribution: RoleData[] | undefined;
  roleLoading: boolean;
  roleRetrying: boolean;
  topUsersErrorMessage: string | null;
  topUsers: TopUser[] | undefined;
  topUsersLoading: boolean;
  topUsersRetrying: boolean;
}

type PieTooltipPayloadItem = {
  color?: string | undefined;
  name?: string | number | undefined;
  value?: string | number | readonly (string | number)[] | undefined;
};

type CompactRoleTooltipProps = {
  active?: boolean | undefined;
  payload?: PieTooltipPayloadItem[] | undefined;
};

const ROLE_DOT_CLASS_BY_ROLE: Record<string, string> = {
  admin: "bg-[hsl(var(--chart-2))]",
  superuser: "bg-[hsl(var(--chart-1))]",
  user: "bg-[hsl(var(--chart-3))]",
};

const DASHBOARD_ROLE_CHART_SLICE_LAYER_SELECTOR = "g.recharts-pie-sector";
const DASHBOARD_ROLE_CHART_SLICE_PATH_SELECTOR = "path.recharts-sector";
const DASHBOARD_ROLE_CHART_LABEL_SELECTOR = "text.recharts-text";

type DashboardRoleChartSurface = Pick<ParentNode, "querySelectorAll">;

export function sanitizeDashboardRoleDistributionChartSurface(
  container: DashboardRoleChartSurface | null | undefined,
) {
  if (!container) {
    return;
  }

  container.querySelectorAll<SVGGElement>(DASHBOARD_ROLE_CHART_SLICE_LAYER_SELECTOR).forEach((layer) => {
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("role", "presentation");
  });

  container.querySelectorAll<SVGPathElement>(DASHBOARD_ROLE_CHART_SLICE_PATH_SELECTOR).forEach((path) => {
    path.setAttribute("aria-hidden", "true");
    path.setAttribute("role", "presentation");
    path.setAttribute("focusable", "false");
    path.removeAttribute("name");
  });

  container.querySelectorAll<SVGTextElement>(DASHBOARD_ROLE_CHART_LABEL_SELECTOR).forEach((label) => {
    label.setAttribute("aria-hidden", "true");
    label.setAttribute("role", "presentation");
    label.setAttribute("focusable", "false");
    label.removeAttribute("name");
  });
}

function CompactRoleTooltip({ active, payload }: CompactRoleTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];
  const role = String(item.name || "Unknown");
  const value = Array.isArray(item.value) ? item.value.join(" / ") : String(item.value ?? "");

  return (
    <div className="min-w-[132px] rounded-xl border border-border/70 bg-popover px-3 py-2 text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${ROLE_DOT_CLASS_BY_ROLE[role] || "bg-muted-foreground"}`}
            aria-hidden="true"
          />
          <span className="truncate text-muted-foreground" title={role} aria-label={role}>
            {role}
          </span>
        </div>
        <span className="shrink-0 font-semibold text-foreground">{value}</span>
      </div>
    </div>
  );
}

export function DashboardUserInsightsGrid({
  onRetryRoleDistribution,
  onRetryTopUsers,
  roleErrorMessage,
  roleDistribution,
  roleLoading,
  roleRetrying,
  topUsersErrorMessage,
  topUsers,
  topUsersLoading,
  topUsersRetrying,
}: DashboardUserInsightsGridProps) {
  const isMobile = useIsMobile();
  const roleChartSurfaceRef = useRef<HTMLDivElement | null>(null);
  const chartHeightClassName = isMobile ? "h-[260px]" : "h-[360px]";
  const donutOuterRadius = isMobile ? 72 : 104;
  const donutInnerRadius = isMobile ? 44 : 66;
  const totalRoleUsers = useMemo(
    () => (roleDistribution ?? []).reduce((total, item) => total + item.count, 0),
    [roleDistribution],
  );

  useEffect(() => {
    const container = roleChartSurfaceRef.current;
    if (!container) {
      return;
    }

    sanitizeDashboardRoleDistributionChartSurface(container);

    const sanitizeChartSurface = () => {
      sanitizeDashboardRoleDistributionChartSurface(container);
    };
    let sanitizeFrameId = 0;
    let followUpFrameId = 0;
    const scheduleChartSurfaceSanitization = () => {
      if (sanitizeFrameId !== 0 || followUpFrameId !== 0) {
        return;
      }

      sanitizeFrameId = window.requestAnimationFrame(() => {
        sanitizeFrameId = 0;
        sanitizeChartSurface();
        followUpFrameId = window.requestAnimationFrame(() => {
          followUpFrameId = 0;
          sanitizeChartSurface();
        });
      });
    };
    const observer = typeof MutationObserver === "function"
      ? new MutationObserver(scheduleChartSurfaceSanitization)
      : null;

    observer?.observe(container, { childList: true, subtree: true });
    scheduleChartSurfaceSanitization();

    return () => {
      observer?.disconnect();
      if (sanitizeFrameId !== 0) {
        window.cancelAnimationFrame(sanitizeFrameId);
      }
      if (followUpFrameId !== 0) {
        window.cancelAnimationFrame(followUpFrameId);
      }
    };
  }, [isMobile, roleDistribution, roleLoading]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
      <Card
        className="rounded-2xl border border-border/60 bg-background shadow-sm"
        data-testid="card-top-users"
        data-floating-ai-avoid="true"
      >
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
        <CardContent aria-live="polite">
          {topUsersErrorMessage ? (
            <DashboardSectionError
              title="Pengguna aktif gagal dimuat"
              description={topUsersErrorMessage}
              onRetry={onRetryTopUsers}
              retrying={topUsersRetrying}
              minHeightClassName={chartHeightClassName}
            />
          ) : topUsersLoading ? (
            <div
              className={`flex items-center justify-center rounded-xl border border-border/50 bg-muted/10 ${chartHeightClassName}`}
              role="status"
              aria-label="Loading top users"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              <span className="sr-only">Loading top active users</span>
            </div>
          ) : topUsers && topUsers.length > 0 ? (
            <div
              className="max-h-[340px] space-y-3 overflow-y-auto pr-1"
              role="region"
              tabIndex={0}
              aria-label="Top active users list"
            >
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
                    className="rounded-xl border border-border/60 bg-background p-3.5 shadow-sm sm:p-4"
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
                          <Badge variant="outline" className="w-fit rounded-full text-2xs capitalize">
                            {user.role}
                          </Badge>
                        </div>
                      </div>
                      <div className="shrink-0 rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-center">
                        <p className="text-lg font-bold leading-none text-foreground">{user.loginCount}</p>
                        <p className="mt-1 text-2xs uppercase tracking-label-sm text-muted-foreground">
                          logins
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Last login: <span className="text-foreground">{formattedLastLogin}</span>
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div
              className={`flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 text-muted-foreground ${chartHeightClassName}`}
            >
              No data available
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        className="rounded-2xl border border-border/60 bg-background shadow-sm"
        data-testid="card-role-distribution"
        data-floating-ai-avoid="true"
      >
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="h-5 w-5" />
            User Roles
          </CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {isMobile
              ? "Role mix with a larger visual and direct account counts."
              : "Larger role distribution view for faster comparison across access levels."}
          </p>
        </CardHeader>
        <CardContent className="space-y-3" aria-live="polite">
          {roleErrorMessage ? (
            <DashboardSectionError
              title="Taburan peranan gagal dimuat"
              description={roleErrorMessage}
              onRetry={onRetryRoleDistribution}
              retrying={roleRetrying}
              minHeightClassName={chartHeightClassName}
            />
          ) : roleLoading ? (
            <div
              className={`flex items-center justify-center rounded-xl border border-border/50 bg-muted/10 ${chartHeightClassName}`}
              role="status"
              aria-label="Loading user roles"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              <span className="sr-only">Loading user role distribution</span>
            </div>
          ) : roleDistribution && roleDistribution.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-label-md text-muted-foreground">
                    Total accounts
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {totalRoleUsers.toLocaleString()}
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full">
                  {roleDistribution.length} roles
                </Badge>
              </div>
              <div
                ref={roleChartSurfaceRef}
                className={`min-w-0 ${chartHeightClassName}`}
                role="img"
                aria-label="User role distribution chart"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart accessibilityLayer={false} tabIndex={-1} role="presentation">
                    <Pie
                      data={roleDistribution}
                      dataKey="count"
                      nameKey="role"
                      cx="50%"
                      cy="50%"
                      innerRadius={donutInnerRadius}
                      outerRadius={donutOuterRadius}
                      paddingAngle={isMobile ? 3 : 2}
                      label={false}
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
              <div className="grid gap-2 sm:grid-cols-2">
                {roleDistribution.map((item) => (
                  <div
                    key={item.role}
                    role="group"
                    aria-label={buildDashboardRoleDistributionRowAriaLabel({ item })}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${ROLE_DOT_CLASS_BY_ROLE[item.role] || "bg-muted-foreground"}`}
                        aria-hidden="true"
                      />
                      <span className="truncate capitalize text-foreground" title={item.role} aria-label={item.role}>
                        {item.role}
                      </span>
                    </div>
                    <span className="shrink-0 font-semibold text-foreground">{item.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div
              className={`flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 text-muted-foreground ${chartHeightClassName}`}
            >
              No data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
