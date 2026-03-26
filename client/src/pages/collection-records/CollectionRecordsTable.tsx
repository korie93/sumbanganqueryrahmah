import { Edit3, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CollectionRecord } from "@/lib/api";
import { CollectionReceiptValidationBadge } from "@/pages/collection/CollectionReceiptValidationBadge";
import { formatAmountRM } from "@/pages/collection/utils";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";

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
  return (
    <div className="rounded-md border border-border/60 min-h-[420px] max-h-[64vh] overflow-auto">
      <Table className="min-w-[1420px] text-sm">
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
            <TableHead className="sticky top-0 bg-background z-10">Receipt Validation</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">Receipt</TableHead>
            <TableHead className="sticky top-0 bg-background z-10">Staff Nickname</TableHead>
            <TableHead className="sticky top-0 bg-background z-10 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loadingRecords ? (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground py-6">
                Loading records...
              </TableCell>
            </TableRow>
          ) : visibleRecords.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground py-6">
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
                <TableCell className="py-1.5 align-top">
                  <CollectionReceiptValidationBadge
                    status={record.receiptValidationStatus}
                    duplicateFlag={record.duplicateReceiptFlag}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {record.receiptCount} receipt(s) · {formatAmountRM(record.receiptTotalAmount)}
                  </p>
                  {record.receiptValidationMessage ? (
                    <p className="mt-1 max-w-[280px] text-xs leading-5 text-muted-foreground">
                      {record.receiptValidationMessage}
                    </p>
                  ) : null}
                </TableCell>
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
