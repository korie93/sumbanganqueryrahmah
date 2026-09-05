import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  downloadBillingPrincipalExport,
  getBillingPrincipalCalendar,
  getBillingPrincipalDrilldown,
  getBillingPrincipalVisualExportDataset,
  type BillingPrincipalAging,
  type BillingPrincipalCalendarDay,
  type BillingPrincipalDrilldownItem,
  type BillingPrincipalPagination,
  type BillingPrincipalSavedTarget,
  type BillingPrincipalSavedTargetOverview,
  type BillingPrincipalVisualExportDataset,
} from "@/lib/api/collection-billing-principal";
import { parseApiError } from "@/pages/collection/utils";
import { formatOspCurrency, formatOspPercentage, formatOspPercentagePoint } from "./billing-principal-report-utils";
import { exportBillingPrincipalVisualReport, type BillingPrincipalVisualExportKind } from "./billing-principal-visual-export";

const PAGE_SIZE = 20;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
type CalendarAging = BillingPrincipalAging | "ALL";
type ExportFormat = "csv" | "xlsx" | BillingPrincipalVisualExportKind;

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00`);
}

function isoDate(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function trackingRange(target: BillingPrincipalSavedTarget) {
  return {
    start: target.activeRevision.trackingStartDate || target.activeRevision.from,
    end: target.activeRevision.trackingEndDate || target.activeRevision.to,
  };
}

export function getBillingPrincipalCalendarMonthRange(input: { month: string; start: string; end: string }) {
  if (!/^\d{4}-\d{2}$/.test(input.month)) return null;
  const first = `${input.month}-01`;
  const seed = dateAtNoon(first);
  const last = isoDate(new Date(seed.getFullYear(), seed.getMonth() + 1, 0, 12));
  const from = first < input.start ? input.start : first;
  const to = last > input.end ? input.end : last;
  return from <= to ? { from, to } : null;
}

export function clampBillingPrincipalTrackingRangeToAsOf(input: { start: string; end: string; asOf: string }) {
  return {
    start: input.start,
    end: input.end < input.asOf ? input.end : input.asOf,
  };
}

export function getBillingPrincipalCalendarGridDates(month: string): Array<string | null> {
  if (!/^\d{4}-\d{2}$/.test(month)) return Array.from({ length: 42 }, () => null);
  const first = dateAtNoon(`${month}-01`);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  const values: Array<string | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= days; day += 1) values.push(`${month}-${String(day).padStart(2, "0")}`);
  while (values.length < 42) values.push(null);
  return values.slice(0, 42);
}

export function buildBillingPrincipalDrilldownFilters(input: {
  reportAsOf: string;
  selectedDate?: string | null;
  page: number;
  aging?: BillingPrincipalAging | "";
}) {
  return {
    asOf: input.reportAsOf,
    ...(input.selectedDate ? { date: input.selectedDate } : {}),
    page: input.page,
    pageSize: PAGE_SIZE,
    ...(input.aging ? { aging: input.aging } : {}),
  };
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function CalendarCell({ day, selected, onSelect }: { day: BillingPrincipalCalendarDay; selected: boolean; onSelect: () => void }) {
  const selectedStateProps = selected
    ? { "aria-pressed": "true" as const }
    : { "aria-pressed": "false" as const };
  return (
    <button type="button" onClick={onSelect} {...selectedStateProps} className={`min-h-28 w-full rounded-lg border p-2 text-left transition-colors ${selected ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/50"}`}>
      <span className="text-xs font-semibold">{Number(day.date.slice(-2))}</span>
      <span className="mt-2 block text-xs text-muted-foreground">Today</span>
      <span className="block truncate text-sm font-semibold tabular-nums">{formatOspCurrency(day.systemOspClosedToday)}</span>
      <span className="mt-1 block text-xs text-muted-foreground">Cumulative {formatOspPercentage(day.systemResultPercentage)}</span>
      <span className="block text-xs text-muted-foreground">Move {formatOspPercentagePoint(day.systemDailyMovementPercentagePoints)}</span>
    </button>
  );
}

function DrilldownTable({ items }: { items: BillingPrincipalDrilldownItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70">
      <Table aria-label="System OSP closed account drilldown" className="min-w-[1450px]">
        <TableHeader><TableRow className="bg-muted/30"><TableHead>Account</TableHead><TableHead>Card</TableHead><TableHead>Customer</TableHead><TableHead>Source</TableHead><TableHead>Aging</TableHead><TableHead>Effective date</TableHead><TableHead>Classification</TableHead><TableHead className="text-right">Total due</TableHead><TableHead className="text-right">System collected</TableHead><TableHead className="text-right">POOL</TableHead><TableHead className="text-right">Effective total</TableHead><TableHead className="text-right">Billing OSP</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
        <TableBody>
          {items.length === 0 ? <TableRow><TableCell colSpan={13} className="py-8 text-center text-muted-foreground">No matching closed accounts.</TableCell></TableRow> : items.map((row) => (
            <TableRow key={`${row.sourceName}:${row.sourceFilename}:${row.maskedAccountNumber}:${row.callingDate}:${row.aging}:${row.effectiveClosedDate}:${row.contributionSource}`}>
              <TableCell>{row.maskedAccountNumber}</TableCell>
              <TableCell className="select-all break-all font-mono">{row.cardNumber || "—"}</TableCell>
              <TableCell>{row.maskedCustomerName}</TableCell>
              <TableCell><span className="block">{row.sourceName}</span><span className="text-xs text-muted-foreground">{row.sourceFilename}</span></TableCell>
              <TableCell>{row.aging}</TableCell><TableCell>{row.effectiveClosedDate}</TableCell>
              <TableCell><Badge variant={row.contributionSource === "MANUAL_VERIFIED_ABORT" ? "secondary" : "outline"}>{row.contributionSource === "MANUAL_VERIFIED_ABORT" ? "Manual verified" : "Automatic"}</Badge></TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(row.totalDue)}</TableCell><TableCell className="text-right tabular-nums">{formatOspCurrency(row.systemEligibleCumulative)}</TableCell><TableCell className="text-right tabular-nums">{formatOspCurrency(row.poolAmount)}</TableCell><TableCell className="text-right tabular-nums">{formatOspCurrency(row.effectiveCumulative)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatOspCurrency(row.billingPrincipalOsp)}</TableCell>
              <TableCell className="max-w-72 text-xs">{[row.reason?.replace(/_/g, " "), row.reference, row.verifiedBy ? `Verified by ${row.verifiedBy}` : null].filter(Boolean).join(" · ") || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function BillingPrincipalInsights({ target, overview, requestedAging, onRequestHandled }: {
  target: BillingPrincipalSavedTarget;
  overview: BillingPrincipalSavedTargetOverview;
  requestedAging?: BillingPrincipalAging | "ALL" | null;
  onRequestHandled?: () => void;
}) {
  const range = useMemo(() => trackingRange(target), [target]);
  const systemRange = useMemo(
    () => clampBillingPrincipalTrackingRangeToAsOf({ ...range, asOf: overview.asOf }),
    [overview.asOf, range],
  );
  const [month, setMonth] = useState(overview.asOf.slice(0, 7));
  const [aging, setAging] = useState<CalendarAging>("ALL");
  const [calendar, setCalendar] = useState<BillingPrincipalCalendarDay[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [drilldownAging, setDrilldownAging] = useState<BillingPrincipalAging | "">("");
  const [items, setItems] = useState<BillingPrincipalDrilldownItem[]>([]);
  const [pagination, setPagination] = useState<BillingPrincipalPagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 });
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState("");
  const calendarSequence = useRef(0);
  const drilldownSequence = useRef(0);
  const exportSequence = useRef(0);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const exportInFlightRef = useRef(false);
  const visualExportCacheRef = useRef<{
    dataset: BillingPrincipalVisualExportDataset;
    key: string;
    overview: BillingPrincipalSavedTargetOverview;
  } | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      exportSequence.current += 1;
      exportAbortControllerRef.current?.abort();
      exportAbortControllerRef.current = null;
      visualExportCacheRef.current = null;
    };
  }, []);

  useEffect(() => {
    setSelectedDate(null);
    setPagination((current) => ({ ...current, page: 1 }));
  }, [overview.asOf]);

  useEffect(() => {
    if (!requestedAging) return;
    setDrilldownAging(requestedAging === "ALL" ? "" : requestedAging);
    setSelectedDate(null);
    setPagination((current) => ({ ...current, page: 1 }));
    onRequestHandled?.();
  }, [onRequestHandled, requestedAging]);

  const monthRange = getBillingPrincipalCalendarMonthRange({ month, ...systemRange });
  useEffect(() => {
    if (!monthRange) { setCalendar([]); return; }
    const controller = new AbortController();
    const sequence = ++calendarSequence.current;
    setCalendar([]); setCalendarLoading(true); setError("");
    getBillingPrincipalCalendar(target.id, target.activeRevision.id, { from: monthRange.from, to: monthRange.to, asOf: overview.asOf, ...(aging === "ALL" ? {} : { aging }) }, { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted && sequence === calendarSequence.current) setCalendar(response.days); })
      .catch((caught) => { if (!controller.signal.aborted && !isAbortError(caught)) setError(parseApiError(caught)); })
      .finally(() => { if (!controller.signal.aborted && sequence === calendarSequence.current) setCalendarLoading(false); });
    return () => controller.abort();
  }, [aging, monthRange?.from, monthRange?.to, overview.asOf, target.activeRevision.id, target.id]);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++drilldownSequence.current;
    setItems([]); setDrilldownLoading(true); setError("");
    getBillingPrincipalDrilldown(target.id, target.activeRevision.id, buildBillingPrincipalDrilldownFilters({ reportAsOf: overview.asOf, selectedDate, page: pagination.page, aging: drilldownAging }), { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted && sequence === drilldownSequence.current) { setItems(response.items); setPagination(response.pagination); } })
      .catch((caught) => { if (!controller.signal.aborted && !isAbortError(caught)) setError(parseApiError(caught)); })
      .finally(() => { if (!controller.signal.aborted && sequence === drilldownSequence.current) setDrilldownLoading(false); });
    return () => controller.abort();
  }, [drilldownAging, overview.asOf, pagination.page, selectedDate, target.activeRevision.id, target.id]);

  const calendarByDate = useMemo(() => new Map(calendar.map((day) => [day.date, day])), [calendar]);
  const grid = useMemo(() => getBillingPrincipalCalendarGridDates(month), [month]);
  const shiftMonth = (delta: number) => {
    const current = dateAtNoon(`${month}-01`);
    const candidate = isoDate(new Date(current.getFullYear(), current.getMonth() + delta, 1, 12)).slice(0, 7);
    if (candidate >= systemRange.start.slice(0, 7) && candidate <= systemRange.end.slice(0, 7)) {
      setMonth(candidate);
    }
  };

  const runExport = async (format: ExportFormat) => {
    if (exportInFlightRef.current) return;
    const exportRange = monthRange ?? { from: systemRange.start, to: systemRange.end };
    exportAbortControllerRef.current?.abort();
    const controller = new AbortController();
    exportAbortControllerRef.current = controller;
    const sequence = ++exportSequence.current;
    exportInFlightRef.current = true;
    setExporting(format); setError("");
    try {
      if (format === "csv" || format === "xlsx") {
        const result = await downloadBillingPrincipalExport(target.id, target.activeRevision.id, { asOf: overview.asOf, format, from: exportRange.from, to: exportRange.to, ...(selectedDate ? { date: selectedDate } : {}), ...(drilldownAging ? { aging: drilldownAging } : {}) }, { signal: controller.signal });
        triggerDownload(result.blob, result.fileName || `${target.name}-billing-principal.${format}`);
      } else {
        const visualFilters = { asOf: overview.asOf, from: exportRange.from, to: exportRange.to, ...(selectedDate ? { date: selectedDate } : {}), ...(drilldownAging ? { aging: drilldownAging } : {}) };
        const visualCacheKey = JSON.stringify(visualFilters);
        const cached = visualExportCacheRef.current;
        const dataset = cached?.overview === overview && cached.key === visualCacheKey
          ? cached.dataset
          : await getBillingPrincipalVisualExportDataset(target.id, target.activeRevision.id, visualFilters, { signal: controller.signal });
        if (!controller.signal.aborted && isMountedRef.current && sequence === exportSequence.current) {
          visualExportCacheRef.current = { dataset, key: visualCacheKey, overview };
        }
        await exportBillingPrincipalVisualReport(format, { dataset, signal: controller.signal });
      }
    } catch (caught) {
      if (!controller.signal.aborted && !isAbortError(caught) && isMountedRef.current && sequence === exportSequence.current) {
        setError(parseApiError(caught));
      }
    } finally {
      if (exportAbortControllerRef.current === controller) exportAbortControllerRef.current = null;
      if (isMountedRef.current && sequence === exportSequence.current) {
        exportInFlightRef.current = false;
        setExporting(null);
      }
    }
  };

  return (
    <section aria-labelledby="billing-system-analysis-heading" className="space-y-5 rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div><h3 id="billing-system-analysis-heading" className="font-semibold">Table A movement and account drill-down</h3><p className="mt-1 text-sm text-muted-foreground">Calendar data is System-only. Click a date to constrain the paginated account detail.</p></div>
        <div className="flex flex-wrap gap-2">{(["csv", "xlsx", "png", "pdf"] as const).map((format) => <Button key={format} type="button" size="sm" variant="outline" disabled={exporting !== null} aria-label={`Export complete Billing Principal report as ${format.toUpperCase()}`} onClick={() => void runExport(format)}>{exporting === format ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}{format.toUpperCase()}</Button>)}</div>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Previous month" disabled={month <= systemRange.start.slice(0, 7)} onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
        <div className="space-y-1"><Label htmlFor="billing-calendar-month">Month</Label><Input id="billing-calendar-month" type="month" value={month} min={systemRange.start.slice(0, 7)} max={systemRange.end.slice(0, 7)} onChange={(event) => setMonth(event.target.value)} /></div>
        <Button type="button" variant="outline" size="icon" aria-label="Next month" disabled={month >= systemRange.end.slice(0, 7)} onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
        <div className="space-y-1"><Label htmlFor="billing-calendar-aging">Aging</Label><select id="billing-calendar-aging" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={aging} onChange={(event) => setAging(event.target.value as CalendarAging)}><option value="ALL">ALL</option>{target.activeRevision.agingScope.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        {selectedDate ? <Button type="button" variant="ghost" onClick={() => { setSelectedDate(null); setPagination((current) => ({ ...current, page: 1 })); }}>Clear date · {selectedDate}</Button> : null}
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[56rem]">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">{WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}</div>
          <div className="relative grid grid-cols-7 gap-1" aria-busy={calendarLoading}>
            {calendarLoading ? <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />Loading Table A calendar…</div> : null}
            {grid.map((date, slot) => ({ date, key: date ?? `${month}:blank:${slot}` })).map(({ date, key }) => date && calendarByDate.get(date) ? <CalendarCell key={key} day={calendarByDate.get(date)!} selected={selectedDate === date} onSelect={() => { setSelectedDate(date); setPagination((current) => ({ ...current, page: 1 })); }} /> : <div key={key} className="min-h-28 rounded-lg border border-dashed border-border/40" aria-hidden="true" />)}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-4">
        <div><h4 className="font-semibold">OSP closed accounts</h4><p className="text-sm text-muted-foreground">{pagination.total.toLocaleString("en-MY")} account{pagination.total === 1 ? "" : "s"} · each Billing Principal OSP counted once.</p></div>
        <div className="space-y-1"><Label htmlFor="billing-drilldown-aging">Aging</Label><select id="billing-drilldown-aging" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={drilldownAging} onChange={(event) => { setDrilldownAging(event.target.value as BillingPrincipalAging | ""); setPagination((current) => ({ ...current, page: 1 })); }}><option value="">ALL</option>{target.activeRevision.agingScope.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
      </div>
      <div className="relative">{drilldownLoading ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70"><Loader2 className="h-5 w-5 animate-spin" /></div> : null}<DrilldownTable items={items} /></div>
      <div className="flex items-center justify-between"><Button type="button" size="sm" variant="outline" disabled={pagination.page <= 1 || drilldownLoading} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}>Previous</Button><span className="text-sm text-muted-foreground">Page {pagination.totalPages === 0 ? 0 : pagination.page} of {pagination.totalPages}</span><Button type="button" size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages || drilldownLoading} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}>Next</Button></div>
    </section>
  );
}
