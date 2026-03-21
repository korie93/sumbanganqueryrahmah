import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { NicknameTotalSummary } from "@/pages/collection-nickname-summary/utils";
import { formatAmountRM } from "@/pages/collection/utils";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";

type CollectionNicknameBatchSectionsProps = {
  loading: boolean;
  hasApplied: boolean;
  selectedNicknames: string[];
  fromDate: string;
  toDate: string;
  totalAmount: number;
  totalRecords: number;
  nicknameTotals: NicknameTotalSummary[];
};

export function CollectionNicknameBatchSections({
  loading,
  hasApplied,
  selectedNicknames,
  fromDate,
  toDate,
  totalAmount,
  totalRecords,
  nicknameTotals,
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
            <p className="mt-1 text-2xl font-semibold">Aggregate by Nickname Only</p>
            <p className="mt-2 text-sm font-semibold text-red-600">
              {fromDate && toDate
                ? `${formatIsoDateToDDMMYYYY(fromDate)} - ${formatIsoDateToDDMMYYYY(toDate)}`
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

      <div className="overflow-hidden rounded-md border border-border/60 bg-background/70">
        <div className="overflow-auto">
          <Table className="min-w-[760px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px]">No.</TableHead>
                <TableHead>NAME</TableHead>
                <TableHead className="text-right">TOTAL RECORDS</TableHead>
                <TableHead className="text-right">TOTAL COLLECTION</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nicknameTotals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    Tiada rekod kutipan untuk kombinasi nickname dan julat tarikh yang dipilih.
                  </TableCell>
                </TableRow>
              ) : (
                nicknameTotals.map((item, index) => (
                  <TableRow key={item.nickname}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{item.nickname}</TableCell>
                    <TableCell className="text-right">{item.totalRecords}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatAmountRM(item.totalAmount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
              <TableRow className="border-t-2 border-border bg-slate-950/90 text-amber-300 hover:bg-slate-950/90">
                <TableCell colSpan={3} className="font-semibold uppercase">
                  Total
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatAmountRM(totalAmount)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

