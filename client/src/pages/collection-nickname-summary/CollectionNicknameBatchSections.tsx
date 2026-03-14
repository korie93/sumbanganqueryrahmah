import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { NicknameBatchSection, NicknameTotalSummary } from "@/pages/collection-nickname-summary/utils";
import { buildCustomerDisplayName } from "@/pages/collection-nickname-summary/utils";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionNicknameBatchSectionsProps = {
  loading: boolean;
  hasApplied: boolean;
  selectedNicknames: string[];
  fromDate: string;
  toDate: string;
  totalAmount: number;
  totalRecords: number;
  nicknameTotals: NicknameTotalSummary[];
  batchSections: NicknameBatchSection[];
};

function toDisplayDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

export function CollectionNicknameBatchSections({
  loading,
  hasApplied,
  selectedNicknames,
  fromDate,
  toDate,
  totalAmount,
  totalRecords,
  nicknameTotals,
  batchSections,
}: CollectionNicknameBatchSectionsProps) {
  if (!hasApplied) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
        Pilih staff nickname dan julat tarikh, kemudian tekan Apply untuk lihat ringkasan kutipan.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-md border border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
        Loading nickname summary...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60 bg-background/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Nickname Summary Report
            </p>
            <p className="mt-1 text-2xl font-semibold">Target Collection Overview</p>
            <p className="mt-2 text-sm font-semibold text-red-600">
              {fromDate && toDate
                ? `${toDisplayDate(fromDate)} - ${toDisplayDate(toDate)}`
                : "Julat tarikh dipilih"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Grand Total Collection</p>
            <p className="text-3xl font-bold">{formatAmountRM(totalAmount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{totalRecords} record(s)</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {selectedNicknames.map((nickname) => (
            <Badge key={nickname} variant="secondary">
              {nickname}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {nicknameTotals.map((item) => (
          <Card key={item.nickname} className="border-border/60 bg-background/60">
            <CardContent className="px-4 py-3">
              <p className="text-xs text-muted-foreground">Manager</p>
              <p className="mt-1 text-lg font-semibold">{item.nickname}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Records</p>
                  <p className="text-base font-semibold">{item.totalRecords}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">TT</p>
                  <p className="text-base font-semibold">{formatAmountRM(item.totalAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="max-h-[62vh] space-y-4 overflow-auto pr-1">
        {batchSections.length === 0 ? (
          <div className="rounded-md border border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
            Tiada rekod kutipan untuk kombinasi nickname dan julat tarikh yang dipilih.
          </div>
        ) : (
          batchSections.map((section) => (
            <div key={section.batch} className="overflow-hidden rounded-md border border-border/60 bg-background/70">
              <div className="border-b border-border/60 bg-slate-900 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-amber-300">
                {section.batch} Pool
              </div>

              <div className="overflow-auto">
                <Table className="min-w-[760px] text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[72px]">No.</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Staff Nickname</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">TT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {section.rows.map((record, index) => (
                      <TableRow key={record.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {buildCustomerDisplayName(record)}
                        </TableCell>
                        <TableCell>{record.collectionStaffNickname}</TableCell>
                        <TableCell>{toDisplayDate(record.paymentDate)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatAmountRM(record.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border bg-slate-950/90 text-amber-300 hover:bg-slate-950/90">
                      <TableCell colSpan={4} className="font-semibold uppercase">
                        Total Collection
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatAmountRM(section.totalAmount)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
