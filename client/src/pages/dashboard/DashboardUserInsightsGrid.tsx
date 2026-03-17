import { Crown, Users } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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

export function DashboardUserInsightsGrid({
  roleDistribution,
  roleLoading,
  topUsers,
  topUsersLoading,
}: DashboardUserInsightsGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="glass-card lg:col-span-2" data-testid="card-top-users">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Crown className="w-5 h-5" />
            Top Active Users
          </CardTitle>
        </CardHeader>
        <CardContent aria-live="polite">
          {topUsersLoading ? (
            <div className="h-[300px] flex items-center justify-center" role="status" aria-label="Loading top users">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="sr-only">Loading top active users</span>
            </div>
          ) : topUsers && topUsers.length > 0 ? (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {topUsers.map((user, index) => (
                <div
                  key={user.username}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50"
                  data-testid={`row-top-user-${index}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{user.username}</p>
                      <p className="text-xs text-muted-foreground">
                        Last login: {user.lastLogin
                          ? formatDateTimeDDMMYYYY(user.lastLogin, { fallback: "Unknown" })
                          : "Unknown"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {user.role}
                    </Badge>
                    <div className="text-right">
                      <p className="font-bold text-foreground">{user.loginCount}</p>
                      <p className="text-xs text-muted-foreground">logins</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data available</div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card" data-testid="card-role-distribution">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" />
            User Roles
          </CardTitle>
        </CardHeader>
        <CardContent aria-live="polite">
          {roleLoading ? (
            <div className="h-[300px] flex items-center justify-center" role="status" aria-label="Loading user roles">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="sr-only">Loading user role distribution</span>
            </div>
          ) : roleDistribution && roleDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={roleDistribution}
                  dataKey="count"
                  nameKey="role"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ role, count }) => `${role}: ${count}`}
                >
                  {roleDistribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={ROLE_COLORS[entry.role] || `hsl(var(--chart-${(index % 5) + 1}))`}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
