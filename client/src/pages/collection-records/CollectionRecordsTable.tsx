import { Edit3, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CollectionRecord } from "@/lib/api";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { formatAmountRM } from "@/pages/collection/utils";

export interface CollectionRecordsTableProps {
  loadingRecords: boolean;
  visibleRecords: CollectionRecord[];
  paginatedRecords: CollectionRecord[];
  pageOffset: number;
  canEdit: boolean;
  onViewReceipt: (record: CollectionRecord) => void;
  onEdit: (record: CollectionRecord) => void;
  onDelete: (record: CollectionRecord) => void;
  canDeleteRow: (record: CollectionRecord) => boolean;
}

export function CollectionRecordsTable({
  loadingRecords,
  visibleRecords,
  paginatedRecords,
  pageOffset,
  canEdit,
  onViewReceipt,
  onEdit,
  onDelete,
  canDeleteRow,
}: CollectionRecordsTableProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="min-h-[320px] space-y-3 rounded-md border border-border/60 bg-background/40 p-3">
        {loadingRecords ? (
          <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
            Loading records...
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
            No collection records found.
          </div>
        ) : (
          paginatedRecords.map((record, index) => (
            <article
              key={record.id}
              className="space-y-3 rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Record #{pageOffset + index + 1}
                  </p>
                  <h3 className="break-words text-base font-semibold text-foreground">
                    {record.customerName}
                  </h3>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300">
                    {formatAmountRM(record.amount)}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {formatIsoDateToDDMMYYYY(record.paymentDate)}
                </p>
              </div>

              <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 text-sm">
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">IC Number</dt>
                  <dd className="break-all">{record.icNumber || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Account Number</dt>
                  <dd className="break-all">{record.accountNumber || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Customer Phone</dt>
                  <dd>{record.customerPhone || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Batch</dt>
                  <dd>{record.batch || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Staff Nickname</dt>
                  <dd>{record.collectionStaffNickname || "-"}</dd>
                </div>
              </dl>

              <div className="flex flex-col gap-2" data-floating-ai-avoid="true">
                {(record.receipts?.length || 0) > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center"
                    onClick={() => onViewReceipt(record)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    {(record.receipts?.length || 0) > 1 ? `View Receipt (${record.receipts.length})` : "View Receipt"}
                  </Button>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  {canEdit ? (
                    <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => onEdit(record)}>
                      <Edit3 className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : null}
                  {canDeleteRow(record) ? (
                    <Button className="w-full sm:w-auto" size="sm" variant="destructive" onClick={() => onDelete(record)}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/60 min-h-[420px] max-h-[64vh] overflow-auto">
      <Table className="min-w-[1280px] text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky top-0 bg-background z-10 w-[72px]">No.</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">Customer Name</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">IC Number</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">Account Number</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">Customer Phone Number</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">Batch</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">Amount</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">Payment Date</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">Receipt</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">Staff Nickname</TableHead>
            <TableHead className="sticky top-0 bg-background z-10 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loadingRecords ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground py-6">
                Loading records...
              </TableCell>
            </TableRow>
          ) : visibleRecords.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground py-6">
                No collection records found.
              </TableCell>
            </TableRow>
          ) : (
            paginatedRecords.map((record, index) => (
              <TableRow key={record.id}>
                <TableCell className="py-1.5 text-muted-foreground">
                  {pageOffset + index + 1}
                </TableCell>
                <TableCell className="py-1.5">{record.customerName}</TableCell>
                <TableCell className="py-1.5 whitespace-nowrap">{record.icNumber}</TableCell>
                <TableCell className="py-1.5 whitespace-nowrap">{record.accountNumber}</TableCell>
                <TableCell className="py-1.5 whitespace-nowrap">{record.customerPhone}</TableCell>
                <TableCell className="py-1.5 whitespace-nowrap">{record.batch}</TableCell>
                <TableCell className="py-1.5 whitespace-nowrap">{formatAmountRM(record.amount)}</TableCell>
                <TableCell className="py-1.5 whitespace-nowrap">{formatIsoDateToDDMMYYYY(record.paymentDate)}</TableCell>
                <TableCell className="py-1.5 whitespace-nowrap">
                  {(record.receipts?.length || 0) > 0 ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0 text-primary"
                      onClick={() => onViewReceipt(record)}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {(record.receipts?.length || 0) > 1 ? `View (${record.receipts.length})` : "View"}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="py-1.5 whitespace-nowrap">{record.collectionStaffNickname}</TableCell>
                <TableCell className="py-1.5 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-2">
                    {canEdit ? (
                      <Button size="sm" variant="outline" onClick={() => onEdit(record)}>
                        <Edit3 className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                    ) : null}
                    {canDeleteRow(record) ? (
                      <Button size="sm" variant="destructive" onClick={() => onDelete(record)}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
