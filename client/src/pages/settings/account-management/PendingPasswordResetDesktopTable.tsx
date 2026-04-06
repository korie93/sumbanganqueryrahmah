import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, getStatusVariant } from "@/pages/settings/account-management/utils";
import type { PendingPasswordResetRequest } from "@/pages/settings/types";

type PendingPasswordResetDesktopTableProps = {
  emptyMessage: string;
  loading: boolean;
  requests: PendingPasswordResetRequest[];
};

export function PendingPasswordResetDesktopTable({
  emptyMessage,
  loading,
  requests,
}: PendingPasswordResetDesktopTableProps) {
  return (
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
  );
}
