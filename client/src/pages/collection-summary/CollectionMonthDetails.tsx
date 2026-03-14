import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CollectionMonthlySummary, CollectionRecord } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

interface CollectionMonthDetailsProps {
  selectedMonth: number | null;
  selectedYear: string;
  selectedMonthSummary: CollectionMonthlySummary | null;
  selectedMonthRange: { from: string; to: string; label: string } | null;
  monthRecords: CollectionRecord[];
  loadingMonthRecords: boolean;
  monthRecordTotals: { totalRecords: number; totalAmount: number };
  toDisplayDate: (value: string) => string;
}

export function CollectionMonthDetails({
  selectedMonth,
  selectedYear,
  selectedMonthSummary,
  selectedMonthRange,
  monthRecords,
  loadingMonthRecords,
  monthRecordTotals,
  toDisplayDate,
}: CollectionMonthDetailsProps) {
  return (
    <div className="rounded-md border border-border/60 p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold">Senarai Kutipan Bulanan</p>
        {selectedMonthSummary && selectedMonthRange ? (
          <div className="text-xs text-muted-foreground">
            <p>
              {selectedMonthSummary.monthName} {selectedYear}
            </p>
            <p>{selectedMonthRange.label}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Klik mana-mana bulan di jadual summary untuk lihat senarai kutipan customer.
          </p>
        )}
      </div>

      {selectedMonthSummary ? (
        <div className="grid gap-2 md:grid-cols-2">
          <Card className="border-border/60 bg-background/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Records (Bulan Dipilih)</p>
              <p className="text-lg font-semibold">{monthRecordTotals.totalRecords}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-background/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Amount (Bulan Dipilih)</p>
              <p className="text-lg font-semibold">{formatAmountRM(monthRecordTotals.totalAmount)}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="max-h-[420px] overflow-auto rounded-md border border-border/60">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer Name</TableHead>
              <TableHead>IC Number</TableHead>
              <TableHead>Customer Phone</TableHead>
              <TableHead>Account Number</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Staff Nickname</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedMonth === null ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                  Sila pilih bulan terlebih dahulu.
                </TableCell>
              </TableRow>
            ) : loadingMonthRecords ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                  Loading monthly records...
                </TableCell>
              </TableRow>
            ) : monthRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                  Tiada rekod kutipan untuk bulan yang dipilih.
                </TableCell>
              </TableRow>
            ) : (
              monthRecords.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{toDisplayDate(row.paymentDate)}</TableCell>
                  <TableCell className="font-medium">{row.customerName}</TableCell>
                  <TableCell>{row.icNumber}</TableCell>
                  <TableCell>{row.customerPhone}</TableCell>
                  <TableCell>{row.accountNumber}</TableCell>
                  <TableCell>{row.batch}</TableCell>
                  <TableCell>{formatAmountRM(row.amount)}</TableCell>
                  <TableCell>{row.collectionStaffNickname}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
