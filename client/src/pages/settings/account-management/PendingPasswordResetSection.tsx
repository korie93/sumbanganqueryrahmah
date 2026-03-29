import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { LifeBuoy, RefreshCw, Search } from "lucide-react";
import { ActiveFilterChips } from "@/components/data/ActiveFilterChips";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { SideTabDataPanel } from "@/components/layout/SideTabDataPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, getStatusVariant, normalizeSearchValue } from "@/pages/settings/account-management/utils";
import type { PendingPasswordResetRequest } from "@/pages/settings/types";
import type {
  PendingResetRequestsPaginationState,
  PendingResetRequestsQueryState,
} from "@/pages/settings/useSettingsManagedUserData";

interface PendingPasswordResetSectionProps {
  loading: boolean;
  pagination: PendingResetRequestsPaginationState;
  query: PendingResetRequestsQueryState;
  onQueryChange: (query: Partial<PendingResetRequestsQueryState>) => void;
  onRefresh: () => void;
  requests: PendingPasswordResetRequest[];
}

export function PendingPasswordResetSection({
  loading,
  pagination,
  query,
  onQueryChange,
  onRefresh,
  requests,
}: PendingPasswordResetSectionProps) {
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState(query.search);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned"
  >(query.status);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedDeferredSearch = useMemo(
    () => normalizeSearchValue(deferredSearchQuery),
    [deferredSearchQuery],
  );
  const hasActiveFilters = normalizedDeferredSearch.length > 0 || statusFilter !== "all";
  const activeFilters = useMemo(
    () =>
      [
        normalizedDeferredSearch
          ? {
              id: "pending-reset-search",
              label: `Search: ${deferredSearchQuery.trim()}`,
              onRemove: () => setSearchQuery(""),
            }
          : null,
        statusFilter !== "all"
          ? {
              id: "pending-reset-status",
              label: `Status: ${statusFilter}`,
              onRemove: () => {
                setStatusFilter("all");
                onQueryChange({
                  page: 1,
                  status: "all",
                });
              },
            }
          : null,
      ].filter((item): item is NonNullable<typeof item> => item !== null),
    [deferredSearchQuery, normalizedDeferredSearch, onQueryChange, statusFilter],
  );

  useEffect(() => {
    const normalizedSearchFromQuery = normalizeSearchValue(query.search);
    if (normalizeSearchValue(searchQuery) !== normalizedSearchFromQuery) {
      setSearchQuery(query.search);
    }
  }, [query.search, searchQuery]);

  useEffect(() => {
    if (statusFilter !== query.status) {
      setStatusFilter(query.status);
    }
  }, [query.status, statusFilter]);

  useEffect(() => {
    if (normalizedDeferredSearch === normalizeSearchValue(query.search)) {
      return;
    }
    onQueryChange({
      page: 1,
      search: normalizedDeferredSearch,
    });
  }, [normalizedDeferredSearch, onQueryChange, query.search]);

  const emptyMessage = loading
    ? "Loading reset requests..."
    : pagination.total === 0 && !hasActiveFilters
      ? "No pending reset requests."
      : "No reset requests match the current filters.";

  return (
    <SideTabDataPanel
      title="Pending Password Reset Requests"
      description="Review requests submitted by users before superuser-triggered password reset action."
      icon={LifeBuoy}
      actions={
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
      filters={
        <div className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <p className="text-sm font-medium">Search by user</p>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search user, username, email, or requester"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="pending-reset-status-filter" className="text-sm font-medium">
                Status
              </label>
              <select
                id="pending-reset-status-filter"
                value={statusFilter}
                onChange={(event) => {
                  const nextStatus =
                    event.target.value === "active"
                    || event.target.value === "pending_activation"
                    || event.target.value === "suspended"
                    || event.target.value === "disabled"
                    || event.target.value === "locked"
                    || event.target.value === "banned"
                      ? event.target.value
                      : "all";
                  setStatusFilter(nextStatus);
                  onQueryChange({
                    page: 1,
                    status: nextStatus,
                  });
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="active">active</option>
                <option value="pending_activation">pending_activation</option>
                <option value="suspended">suspended</option>
                <option value="disabled">disabled</option>
                <option value="locked">locked</option>
                <option value="banned">banned</option>
              </select>
            </div>
          </div>
          <ActiveFilterChips
            items={activeFilters}
            onClearAll={
              hasActiveFilters
                ? () => {
                    setSearchQuery("");
                    setStatusFilter("all");
                    onQueryChange({
                      page: 1,
                      search: "",
                      status: "all",
                    });
                  }
                : undefined
            }
          />
        </div>
      }
      summary={
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
          <span className="font-medium">Total requests: {pagination.total}</span>
          <span className="text-muted-foreground">Current page: {requests.length}</span>
        </div>
      }
      pagination={
        <AppPaginationBar
          disabled={loading}
          page={pagination.page}
          totalPages={pagination.totalPages}
          pageSize={pagination.pageSize}
          totalItems={pagination.total}
          itemLabel="requests"
          onPageChange={(page) => {
            onQueryChange({ page });
          }}
          onPageSizeChange={(pageSize) => {
            onQueryChange({
              page: 1,
              pageSize,
            });
          }}
        />
      }
    >
      {isMobile ? (
        <div className="space-y-3 p-3">
          {loading || requests.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="space-y-3 rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
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
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Requested By</dt>
                    <dd className="break-words">{request.requestedByUser || "-"}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Created At</dt>
                    <dd>{formatDateTime(request.createdAt)}</dd>
                  </div>
                </dl>
              </div>
            ))
          )}
        </div>
      ) : (
        <Table className="min-w-[860px] text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading || requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{request.username}</div>
                      <div className="text-xs text-muted-foreground">
                        {request.fullName || request.email || "No profile details"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{request.requestedByUser || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(request.status, request.isBanned)}>
                      {request.isBanned ? "banned" : request.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(request.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </SideTabDataPanel>
  );
}
