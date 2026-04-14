import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { buildLocalMailOutboxRowAriaLabel } from "@/pages/settings/account-management/account-management-row-aria";
import { formatDateTime } from "@/pages/settings/account-management/utils";
import type { DevMailOutboxPreview } from "@/pages/settings/types";

type LocalMailOutboxDesktopTableProps = {
  clearingDevMailOutbox: boolean;
  deletingDevMailOutboxId: string | null;
  emptyMessage: string;
  entries: DevMailOutboxPreview[];
  loading: boolean;
  onCopyPreviewLink: (previewUrl: string) => Promise<void>;
  onOpenDeleteDialog: (entry: DevMailOutboxPreview) => void;
  onOpenPreviewDialog: (entry: DevMailOutboxPreview) => void;
};

export function LocalMailOutboxDesktopTable({
  clearingDevMailOutbox,
  deletingDevMailOutboxId,
  emptyMessage,
  entries,
  loading,
  onCopyPreviewLink,
  onOpenDeleteDialog,
  onOpenPreviewDialog,
}: LocalMailOutboxDesktopTableProps) {
  return (
    <Table className="min-w-[920px] text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Recipient</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading || entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          entries.map((entry) => (
            <TableRow
              key={entry.id}
              aria-label={buildLocalMailOutboxRowAriaLabel({
                entry,
                formattedCreatedAt: formatDateTime(entry.createdAt),
              })}
            >
              <TableCell className="font-medium">{entry.to}</TableCell>
              <TableCell>{entry.subject}</TableCell>
              <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
              <TableCell className="text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenPreviewDialog(entry)}
                  >
                    Open
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void onCopyPreviewLink(entry.previewUrl);
                    }}
                  >
                    Copy Link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenDeleteDialog(entry)}
                    disabled={deletingDevMailOutboxId === entry.id || clearingDevMailOutbox}
                  >
                    {deletingDevMailOutboxId === entry.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
