import { useDeferredValue, useMemo, useState } from "react";
import { LifeBuoy, RefreshCw, Search } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { SideTabDataPanel } from "@/components/layout/SideTabDataPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePaginatedItems } from "@/hooks/usePaginatedItems";
import { formatDateTime, getStatusVariant, normalizeSearchValue } from "@/pages/settings/account-management/utils";
import type { PendingPasswordResetRequest } from "@/pages/settings/types";

interface PendingPasswordResetSectionProps {
  loading: boolean;
  onRefresh: () => void;
  requests: PendingPasswordResetRequest[];
}

export function PendingPasswordResetSection({
  loading,
  onRefresh,
  requests,
}: PendingPasswordResetSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "pending_activation" | "suspended" | "disabled" | "banned"
  >("all");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredRequests = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(deferredSearchQuery);

    return requests.filter((request) => {
      const combinedText = [
        request.username,
        request.fullName || "",
        request.email || "",
        request.requestedByUser || "",
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !normalizedSearch || combinedText.includes(normalizedSearch);
      const effectiveStatus = request.isBanned ? "banned" : request.status;
      const matchesStatus = statusFilter === "all" || effectiveStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [deferredSearchQuery, requests, statusFilter]);

  const emptyMessage = loading
    ? "Loading reset requests..."
    : requests.length === 0
      ? "No pending reset requests."
      : "No reset requests match the current filters.";
  const pagination = usePaginatedItems(filteredRequests, {
    resetKey: `${deferredSearchQuery}::${statusFilter}`,
  });

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
              onChange={(event) =>
                setStatusFilter(
                  event.target.value === "active"
                  || event.target.value === "pending_activation"
                  || event.target.value === "suspended"
                  || event.target.value === "disabled"
                  || event.target.value === "banned"
                    ? event.target.value
                    : "all",
                )
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">active</option>
              <option value="pending_activation">pending_activation</option>
              <option value="suspended">suspended</option>
              <option value="disabled">disabled</option>
              <option value="banned">banned</option>
            </select>
          </div>
        </div>
      }
      summary={
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
          <span className="font-medium">Total requests: {requests.length}</span>
          <span className="text-muted-foreground">Filtered: {filteredRequests.length}</span>
        </div>
      }
      pagination={
        <AppPaginationBar
          disabled={loading}
          page={pagination.page}
          totalPages={pagination.totalPages}
          pageSize={pagination.pageSize}
          totalItems={filteredRequests.length}
          itemLabel="requests"
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
      }
    >
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
          {loading || filteredRequests.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            pagination.paginatedItems.map((request) => (
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
    </SideTabDataPanel>
  );
}
