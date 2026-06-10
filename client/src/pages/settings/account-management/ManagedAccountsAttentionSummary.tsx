import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ManagedAccountAttentionSummary,
  ManagedAccountsStatusFilter,
} from "@/pages/settings/account-management/managed-accounts-shared";

type ManagedAccountsAttentionSummaryProps = {
  activeStatus: ManagedAccountsStatusFilter;
  loading: boolean;
  summary: ManagedAccountAttentionSummary;
  totalUsers: number;
  onStatusChange: (value: string) => void;
};

/**
 * Shows the visible-page account attention queue without adding extra backend calls.
 */
export function ManagedAccountsAttentionSummary({
  activeStatus,
  loading,
  summary,
  totalUsers,
  onStatusChange,
}: ManagedAccountsAttentionSummaryProps) {
  const visibleAttentionItems = summary.items.filter((item) => item.count > 0);
  const hasVisibleAttention = visibleAttentionItems.length > 0;

  return (
    <section
      className="space-y-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm"
      aria-label="Managed account visible page summary"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 font-medium">
          <Users className="h-4 w-4 text-muted-foreground" />
          Total users: {totalUsers.toLocaleString()}
        </div>
        <Badge variant="secondary">Visible page {summary.visibleCount.toLocaleString()}</Badge>
        <Badge variant={hasVisibleAttention ? "destructive" : "secondary"}>
          {summary.totalAttentionCount.toLocaleString()} need attention
        </Badge>
        {loading ? <Badge variant="outline">Refreshing</Badge> : null}
      </div>

      {hasVisibleAttention ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            Visible attention queue
          </div>
          {visibleAttentionItems.map((item) => {
            const isActive = activeStatus === item.status;

            return (
              <Button
                key={item.status}
                type="button"
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onStatusChange(isActive ? "all" : item.status)}
                className={cn(
                  "h-8 rounded-full px-3 text-xs",
                  !isActive && item.tone === "danger"
                    ? "text-destructive hover:text-destructive"
                    : undefined,
                )}
                aria-label={`Filter managed accounts by ${item.label}: ${item.count} visible`}
              >
                <span>{item.label}</span>
                <span
                  className={cn(
                    "ml-1 rounded-full border px-1.5 py-0.5 text-2xs font-semibold",
                    isActive
                      ? "border-primary-foreground/40 text-primary-foreground"
                      : "border-border/70 text-muted-foreground",
                  )}
                >
                  {item.count.toLocaleString()}
                </span>
              </Button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
          No visible account risk on this page.
        </div>
      )}
    </section>
  );
}
