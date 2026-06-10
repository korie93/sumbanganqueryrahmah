import { AlertTriangle, CheckCircle2, Inbox, LifeBuoy, ShieldAlert, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AccountActionQueueItem,
  AccountHealthMetric,
} from "@/pages/settings/account-management/user-account-management-shared";
import type { UserAccountManagementTabId } from "@/pages/settings/types";

type UserAccountManagementOverviewProps = {
  actions: AccountActionQueueItem[];
  activeTab: UserAccountManagementTabId;
  metrics: AccountHealthMetric[];
  onActionSelect: (action: AccountActionQueueItem) => void;
};

function getMetricIcon(metric: AccountHealthMetric) {
  if (metric.id === "visible-restricted") return ShieldAlert;
  if (metric.id === "pending-resets") return LifeBuoy;
  if (metric.tone === "success") return CheckCircle2;
  return Users;
}

function getMetricClassName(metric: AccountHealthMetric) {
  if (metric.tone === "danger") {
    return "border-destructive/40 bg-destructive/10";
  }
  if (metric.tone === "warning") {
    return "border-border/70 bg-muted/25";
  }
  if (metric.tone === "success") {
    return "border-border/70 bg-muted/20";
  }
  return "border-border/70 bg-background/65";
}

function getActionIcon(action: AccountActionQueueItem) {
  if (action.id === "pending-reset-requests") return LifeBuoy;
  if (action.id === "local-outbox-review") return Inbox;
  if (action.priority === "high") return AlertTriangle;
  return CheckCircle2;
}

function getPriorityVariant(action: AccountActionQueueItem) {
  return action.priority === "high" ? "destructive" : action.priority === "medium" ? "secondary" : "outline";
}

export function UserAccountManagementOverview({
  actions,
  activeTab,
  metrics,
  onActionSelect,
}: UserAccountManagementOverviewProps) {
  return (
    <section className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
      <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Account health summary</h3>
            <p className="text-xs leading-5 text-muted-foreground">
              Directory totals plus visible-page risk signals for quick account review.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full">
            Live workspace
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {metrics.map((metric) => {
            const MetricIcon = getMetricIcon(metric);
            return (
              <div
                key={metric.id}
                className={`rounded-xl border p-3 ${getMetricClassName(metric)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <MetricIcon className="h-4 w-4" aria-hidden="true" />
                    {metric.label}
                  </div>
                  <span className="text-lg font-semibold tabular-nums text-foreground">
                    {metric.value.toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {metric.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
        <div className="mb-3 space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Action queue</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Jump straight to account work that needs a superuser decision.
          </p>
        </div>
        <div className="space-y-2" aria-label="User account action queue">
          {actions.map((action) => {
            const ActionIcon = getActionIcon(action);
            const isActive = activeTab === action.targetTab;
            return (
              <div
                key={action.id}
                className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/70 p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionIcon className="h-4 w-4 text-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium text-foreground">{action.label}</span>
                    <Badge variant={getPriorityVariant(action)} className="rounded-full">
                      {action.count.toLocaleString()}
                    </Badge>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{action.description}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={isActive}
                  onClick={() => onActionSelect(action)}
                >
                  {isActive ? "Open" : "Go"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
