import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CollectionRecord } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

interface ViewAllRecordsDialogProps {
  open: boolean;
  fromDate: string;
  toDate: string;
  viewAllRecords: CollectionRecord[];
  viewAllSummary: { totalRecords: number; totalAmount: number };
  onOpenChange: (open: boolean) => void;
  onViewReceipt: (record: CollectionRecord) => void;
  toDisplayDate: (value: string) => string;
}

export function ViewAllRecordsDialog({
  open,
  fromDate,
  toDate,
  viewAllRecords,
  viewAllSummary,
  onOpenChange,
  onViewReceipt,
  toDisplayDate,
}: ViewAllRecordsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] w-[96vw] max-w-[96vw] gap-0 overflow-hidden p-0">
        <div className="flex h-full flex-col">
          <div className="border-b bg-background/95 px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">Senarai Penuh Rekod Collection</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Dari {toDisplayDate(fromDate)} hingga {toDisplayDate(toDate)}
                </p>
                <div className="mt-2 text-sm text-muted-foreground">
                  Total Records:{" "}
                  <span className="font-medium text-foreground">
                    {viewAllSummary.totalRecords}
                  </span>
                  {" | "}
                  Total Collection:{" "}
                  <span className="font-medium text-foreground">
                    {formatAmountRM(viewAllSummary.totalAmount)}
                  </span>
                </div>
              </div>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-4">
            <div className="h-full overflow-auto rounded-md border border-border/60">
              <Table className="min-w-[1100px] text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-10 bg-background">
                      Customer Name
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-background">
                      IC Number
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-background">
                      Account Number
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-background">
                      Customer Phone Number
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-background">
                      Amount
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-background">
                      Payment Date
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-background">
                      Receipt
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-background">
                      Staff Nickname
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewAllRecords.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-6 text-center text-muted-foreground"
                      >
                        Tiada rekod dalam julat tarikh yang dipilih.
                      </TableCell>
                    </TableRow>
                  ) : (
                    viewAllRecords.map((record) => (
                      <TableRow key={`view-all-${record.id}`}>
                        <TableCell className="py-2">{record.customerName}</TableCell>
                        <TableCell className="py-2">{record.icNumber}</TableCell>
                        <TableCell className="py-2">{record.accountNumber}</TableCell>
                        <TableCell className="py-2">{record.customerPhone}</TableCell>
                        <TableCell className="py-2">
                          {formatAmountRM(record.amount)}
                        </TableCell>
                        <TableCell className="py-2">{record.paymentDate}</TableCell>
                        <TableCell className="py-2">
                          {record.receiptFile ? (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto px-0 text-primary"
                              onClick={() => onViewReceipt(record)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          {record.collectionStaffNickname}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
