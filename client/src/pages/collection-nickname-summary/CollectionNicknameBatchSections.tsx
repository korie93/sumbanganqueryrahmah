import { Badge } from "@/components/ui/badge";
import {
  OperationalMetric,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();

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
      <OperationalSectionCard
        title="Aggregate by Nickname"
        description={
          fromDate && toDate
            ? `${formatIsoDateToDDMMYYYY(fromDate)} - ${formatIsoDateToDDMMYYYY(toDate)}`
            : "Julat tarikh dipilih"
        }
      >
        <OperationalSummaryStrip className="grid gap-3 md:grid-cols-2">
          <OperationalMetric
            label="Grand Total Collection"
            value={formatAmountRM(totalAmount)}
            supporting={`${totalRecords} record(s)`}
            tone="success"
          />
          <OperationalMetric
            label="Selected Nicknames"
            value={selectedNicknames.length}
            supporting={selectedNicknames.length === 1 ? "1 nickname" : `${selectedNicknames.length} nicknames`}
          />
        </OperationalSummaryStrip>

        <div className="mt-4 flex flex-wrap gap-2">
          {selectedNicknames.map((nickname) => (
            <Badge key={nickname} variant="secondary">
              {nickname}
            </Badge>
          ))}
        </div>
      </OperationalSectionCard>

      {isMobile ? (
        <div className="space-y-3" data-floating-ai-avoid="true">
          {nicknameTotals.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
              Tiada rekod kutipan untuk kombinasi nickname dan julat tarikh yang dipilih.
            </div>
          ) : (
            nicknameTotals.map((item, index) => (
              <article
                key={item.nickname}
                className="space-y-3 rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
              >
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Nickname {index + 1}
                  </p>
                  <p className="break-words font-medium text-foreground">{item.nickname}</p>
                </div>
                <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 text-sm">
                  <div className="space-y-1">
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Total Records</dt>
                    <dd>{item.totalRecords}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Total Collection</dt>
                    <dd className="font-medium">{formatAmountRM(item.totalAmount)}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}

          {nicknameTotals.length > 0 ? (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/35">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Total
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatAmountRM(totalAmount)}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="ops-table-shell overflow-hidden">
          <div className="overflow-auto">
            <Table className="ops-data-table min-w-[760px] text-sm">
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
                <TableRow className="border-t-2 border-border bg-amber-50/80 hover:bg-amber-50/80 dark:bg-amber-950/35 dark:hover:bg-amber-950/35">
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
      )}
    </div>
  );
}

