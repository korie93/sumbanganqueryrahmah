import { Badge } from "@/components/ui/badge";
import { buildPendingPasswordResetRowAriaLabel } from "@/pages/settings/account-management/account-management-row-aria";
import { PendingPasswordResetEmptyState } from "@/pages/settings/account-management/PendingPasswordResetEmptyState";
import type { PendingResetEmptyStateContent } from "@/pages/settings/account-management/pending-reset-shared";
import { formatDateTime, getStatusVariant } from "@/pages/settings/account-management/utils";
import type { PendingPasswordResetRequest } from "@/pages/settings/types";

type PendingPasswordResetMobileListProps = {
  emptyState: PendingResetEmptyStateContent;
  loading: boolean;
  requests: PendingPasswordResetRequest[];
  onClearFilters?: (() => void) | undefined;
};

export function PendingPasswordResetMobileList({
  emptyState,
  loading,
  onClearFilters,
  requests,
}: PendingPasswordResetMobileListProps) {
  if (loading || requests.length === 0) {
    return (
      <div className="space-y-3 p-3">
        <div className="rounded-lg border border-border/60 bg-background/70">
          <PendingPasswordResetEmptyState
            state={emptyState}
            onClearFilters={onClearFilters}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {requests.map((request) => (
        <div
          key={request.id}
          aria-label={buildPendingPasswordResetRowAriaLabel({
            formattedCreatedAt: formatDateTime(request.createdAt),
            request,
          })}
          className="space-y-3 rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
          role="group"
        >
          <div className="space-y-1">
            <div className="break-words font-medium">{request.username}</div>
            <div className="break-words text-xs text-muted-foreground">
              {request.fullName || request.email || "No profile details"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={getStatusVariant(request.status, request.isBanned)}>
              {request.isBanned ? "banned" : request.status}
            </Badge>
          </div>
          <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 text-sm">
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-label-md text-muted-foreground">Requested By</dt>
              <dd className="break-words">{request.requestedByUser || "-"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-label-md text-muted-foreground">Created At</dt>
              <dd>{formatDateTime(request.createdAt)}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
