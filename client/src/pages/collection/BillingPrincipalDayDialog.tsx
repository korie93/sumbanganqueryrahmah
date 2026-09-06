import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBillingPrincipalDrilldown, type BillingPrincipalAging, type BillingPrincipalDrilldownItem, type BillingPrincipalSavedTarget } from "@/lib/api/collection-billing-principal";
import { parseApiError, parseCollectionApiErrorDetails } from "./utils";
import { BILLING_PRINCIPAL_AGINGS, formatOspCurrency } from "./billing-principal-report-utils";
import { getBillingPrincipalReportingWindow, isBillingPrincipalDateInRange } from "@/lib/billing-principal-date-domain";

export function buildBillingPrincipalDrilldownFilters(input: { selectedDate: string; periodEnd: string; page: number; aging: BillingPrincipalAging | "ALL" }) {
  return { asOf: input.periodEnd, date: input.selectedDate, page: input.page, pageSize: 10,
    ...(input.aging === "ALL" ? {} : { aging: input.aging }) };
}

function AccountTable({ items }: { items: BillingPrincipalDrilldownItem[] }) {
  return <div className="rounded-md border [&>div]:max-h-[calc(var(--viewport-min-height-value)*0.48)]" role="region" aria-label="Scrollable closed account details">
    <Table aria-label="Accounts closed on selected day" className="min-w-[1700px]">
      <TableHeader className="sticky top-0 z-10 bg-muted"><TableRow>
        {["Customer", "Account", "Card", "IC / identification", "Phone", "Aging", "Collector", "Payment date", "Closed date", "Classification", "Collection amount", "Billing OSP", "Total due", "Source"].map((label, index) => <TableHead key={label} className={index >= 10 && index <= 12 ? "text-right" : undefined}>{label}</TableHead>)}
      </TableRow></TableHeader>
      <TableBody>{items.map((row) => <TableRow key={`${row.accountNumber ?? row.cardNumber}:${row.aging}:${row.callingDate}:${row.effectiveClosedDate}`}>
        <TableCell className="min-w-40 break-words">{row.customerName ?? "—"}</TableCell>
        <TableCell className="select-all whitespace-nowrap font-mono">{row.accountNumber ?? "—"}</TableCell>
        <TableCell className="select-all whitespace-nowrap font-mono">{row.cardNumber ?? "—"}</TableCell>
        <TableCell className="select-all whitespace-nowrap">{row.identificationNumber ?? "—"}</TableCell>
        <TableCell className="select-all whitespace-nowrap">{row.phone ?? "—"}</TableCell>
        <TableCell>{row.aging}</TableCell><TableCell>{row.systemClosureStaffNickname ?? "—"}</TableCell>
        <TableCell className="whitespace-nowrap tabular-nums">{row.paymentDate}</TableCell><TableCell className="whitespace-nowrap tabular-nums">{row.effectiveClosedDate}</TableCell>
        <TableCell>{row.classification === "MANUAL_VERIFIED_ABORT" ? "Manual Verified ABORT" : "ABORT CP"}</TableCell>
        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatOspCurrency(row.systemClosureCollectionAmount)}</TableCell>
        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatOspCurrency(row.billingPrincipalOsp)}</TableCell>
        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatOspCurrency(row.totalDue)}</TableCell>
        <TableCell className="min-w-52 max-w-80 break-words"><span className="block">{row.sourceName}</span><span className="text-xs text-muted-foreground">{row.sourceFilename}</span></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </div>;
}

export function BillingPrincipalDayDialog({ target, date, onClose, onAccessLost }: {
  target: BillingPrincipalSavedTarget; date: string; onClose: () => void; onAccessLost: () => void;
}) {
  const [aging, setAging] = useState<BillingPrincipalAging | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<Awaited<ReturnType<typeof getBillingPrincipalDrilldown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const range = useMemo(() => getBillingPrincipalReportingWindow(target.activeRevision), [target.activeRevision]);
  useEffect(() => {
    const controller = new AbortController();
    setResponse(null); setLoading(true); setError("");
    if (!isBillingPrincipalDateInRange(date, range)) {
      setLoading(false); setError("This day is outside the current Collection Source validity. Close the dialog and refresh.");
      return () => controller.abort();
    }
    void getBillingPrincipalDrilldown(target.id, target.activeRevision.id, buildBillingPrincipalDrilldownFilters({ selectedDate: date, periodEnd: range.to, page, aging }), { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setResponse(result); })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(parseApiError(caught));
        if ([401, 403, 404].includes(parseCollectionApiErrorDetails(caught).status ?? 0)) onAccessLost();
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [aging, date, page, retry, target.id, target.activeRevision.id, range, onAccessLost]);
  const changePage = (value: number) => { setResponse(null); setPage(value); };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-6xl">
      <DialogHeader><DialogTitle>Accounts closed · {date}</DialogTitle><DialogDescription>Exact-day closures for {target.name}. Full details are available only within your authorized target. Each logical account is counted once.</DialogDescription></DialogHeader>
      <Tabs value={aging} onValueChange={(value) => { setResponse(null); setPage(1); setAging(value as BillingPrincipalAging | "ALL"); }}>
        <TabsList aria-label="Closed account aging" className="h-auto flex-wrap"><TabsTrigger value="ALL">ALL</TabsTrigger>{BILLING_PRINCIPAL_AGINGS.map((value) => <TabsTrigger key={value} value={value}>{value}</TabsTrigger>)}</TabsList>
        <TabsContent value={aging} className="space-y-3">
          {loading ? <p role="status" className="flex min-h-24 items-center justify-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading accounts…</p> : null}
          {error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry</Button></div> : null}
          {response ? <>
            <p className="text-sm tabular-nums"><strong>{response.summary.accountCount.toLocaleString("en-MY")} accounts</strong> · Billing OSP <strong>{formatOspCurrency(response.summary.ospClosed)}</strong><span className="ml-2 text-muted-foreground">All {aging} matches, not just this page.</span></p>
            {response.items.length ? <AccountTable items={response.items} /> : <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No {aging} accounts closed on this date.</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous accounts</Button>
              <span className="text-sm text-muted-foreground">Page {response.pagination.totalPages ? page : 0} of {response.pagination.totalPages} · 10 per page</span>
              <Button type="button" size="sm" variant="outline" disabled={page >= response.pagination.totalPages} onClick={() => changePage(page + 1)}>Next accounts</Button>
            </div>
          </> : null}
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>;
}
