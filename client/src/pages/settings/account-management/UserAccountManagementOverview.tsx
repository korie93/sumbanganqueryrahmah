import { Users } from "lucide-react";

type UserAccountManagementOverviewProps = {
  managedUserCount: number;
  visibleAttentionCount: number;
  pendingResetCount: number;
  loading: boolean;
};

export function UserAccountManagementOverview({ managedUserCount, visibleAttentionCount, pendingResetCount, loading }: UserAccountManagementOverviewProps) {
  return (
    <section aria-label="Account health summary" className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
      <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
      {loading ? <span role="status">Loading account summary...</span> : (
        <>
          <strong className="font-semibold text-foreground">
            {managedUserCount.toLocaleString()} accounts
          </strong>
          <span>{visibleAttentionCount.toLocaleString()} on this page need access review</span>
          <span className="text-foreground">
            {pendingResetCount.toLocaleString()} reset requests
          </span>
        </>
      )}
    </section>
  );
}
