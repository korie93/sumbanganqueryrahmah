import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStoredAuthenticatedUser } from "@/lib/auth-session";
import {
  downloadBillingPrincipalExport, getBillingPrincipalCalendar, getBillingPrincipalSavedTarget, getBillingPrincipalVisualExportDataset,
  type BillingPrincipalAging, type BillingPrincipalCalendarDay, type BillingPrincipalSavedTarget, type BillingPrincipalSavedTargetOverview,
} from "@/lib/api/collection-billing-principal";
import { parseApiError, parseCollectionApiErrorDetails } from "./utils";
import { BILLING_PRINCIPAL_AGINGS, formatOspCurrency, formatOspPercentage, formatOspPercentagePoint } from "./billing-principal-report-utils";
import { exportBillingPrincipalVisualReport, type BillingPrincipalVisualExportKind } from "./billing-principal-visual-export";
import { BillingPrincipalDayDialog } from "./BillingPrincipalDayDialog";
import { clampBillingPrincipalMonth, getBillingPrincipalReportingWindow, isBillingPrincipalDate, isBillingPrincipalDateInRange } from "@/lib/billing-principal-date-domain";
export { buildBillingPrincipalDrilldownFilters } from "./BillingPrincipalDayDialog";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
type ExportFormat = "xlsx" | BillingPrincipalVisualExportKind;

export class BillingPrincipalExportIdentityError extends Error {
  constructor() {
    super("Authenticated account changed. Reload targets before exporting again.");
    this.name = "BillingPrincipalExportIdentityError";
  }
}

export function assertBillingPrincipalExportOwner(expectedOwnerId: string, actualOwnerId: string): void {
  if (!expectedOwnerId || expectedOwnerId !== actualOwnerId) throw new BillingPrincipalExportIdentityError();
}

export function assertBillingPrincipalExportAuthorization(
  expectedOwnerId: string, expectedVersion: number,
  latest: { viewerUserId: string; target: { version: number; activeRevision?: BillingPrincipalSavedTarget["activeRevision"] } },
  expectedReportingVersion?: string,
): void {
  assertBillingPrincipalExportOwner(expectedOwnerId, latest.viewerUserId);
  if (latest.target.version !== expectedVersion) throw new Error("Target changed while rendering. Reload and export again.");
  if (expectedReportingVersion !== undefined && (!latest.target.activeRevision
    || getBillingPrincipalReportingWindow(latest.target.activeRevision).version !== expectedReportingVersion)) {
    throw new Error("Collection Source validity changed while rendering. Refresh and export again.");
  }
}
function dateAtNoon(value: string) { return new Date(value + "T12:00:00Z"); }
function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
function isValidMonth(value: string) { return isBillingPrincipalDate(value + "-01"); }

export function getBillingPrincipalCalendarMonthRange(input: { month: string; start: string; end: string }) {
  if (!isValidMonth(input.month)) return null;
  const first = input.month + "-01";
  const seed = dateAtNoon(first);
  seed.setUTCMonth(seed.getUTCMonth() + 1, 0);
  const last = isoDate(seed);
  const from = first < input.start ? input.start : first;
  const to = last > input.end ? input.end : last;
  return from <= to ? { from, to } : null;
}

export function getBillingPrincipalCalendarGridDates(month: string): Array<string | null> {
  if (!isValidMonth(month)) return Array.from({ length: 42 }, () => null);
  const first = dateAtNoon(month + "-01");
  const last = dateAtNoon(month + "-01");
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const days = last.getUTCDate();
  const values: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null);
  for (let day = 1; day <= days; day += 1) values.push(month + "-" + String(day).padStart(2, "0"));
  while (values.length < 42) values.push(null);
  return values.slice(0, 42);
}

function CalendarCell({ day, onSelect }: { day: BillingPrincipalCalendarDay; onSelect: () => void }) {
  return <button type="button" onClick={onSelect}
    aria-label={day.date + ", " + day.systemDailyAccounts + " accounts, new closed " + formatOspCurrency(day.systemOspClosedToday)}
    className="min-h-44 w-full rounded-md border border-border/70 bg-background p-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span className="text-sm font-semibold">{Number(day.date.slice(-2))}</span>
    <span className="ml-2 text-xs text-muted-foreground">{day.systemDailyAccounts} accounts</span>
    <span className="mt-2 block text-xs text-muted-foreground">New closed</span>
    <span className="block break-all text-sm font-semibold tabular-nums">{formatOspCurrency(day.systemOspClosedToday)}</span>
    <span className="mt-2 block text-xs tabular-nums">Cumulative {formatOspCurrency(day.systemCumulativeOspClosed)}</span>
    <span className="block text-xs tabular-nums">Result {formatOspPercentage(day.systemResultPercentage)}</span>
    <span className="block text-xs text-muted-foreground">Previous {formatOspPercentage(day.systemPreviousResultPercentage)} · {formatOspPercentagePoint(day.systemDailyMovementPercentagePoints)}</span>
    <span className="mt-1 block break-all text-xs tabular-nums">Balance {formatOspCurrency(day.balanceOsp)}</span>
  </button>;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url; link.download = fileName; document.body.appendChild(link); link.click();
  } finally { link.remove(); URL.revokeObjectURL(url); }
}

export function BillingPrincipalInsights({ target, overview, disabled = false, onAccessLost, onExportBusy }: {
  target: BillingPrincipalSavedTarget; overview: BillingPrincipalSavedTargetOverview; disabled?: boolean;
  onAccessLost: () => void; onExportBusy: (busy: boolean) => void;
}) {
  const range = useMemo(() => getBillingPrincipalReportingWindow(target.activeRevision), [target.activeRevision]);
  const start = range.from;
  const end = range.to;
  // Capture the mounted workspace owner. A later cookie/session replacement
  // must never authorize this owner's already fetched private export.
  const [ownerUserId] = useState(() => getStoredAuthenticatedUser()?.id ?? "");
  const [selectedMonth, setMonth] = useState(start.slice(0, 7));
  const month = clampBillingPrincipalMonth(selectedMonth, range);
  const [aging, setAging] = useState<BillingPrincipalAging | "ALL">("ALL");
  const [calendar, setCalendar] = useState<BillingPrincipalCalendarDay[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [retry, setRetry] = useState(0);
  const exportRef = useRef<AbortController | null>(null);
  useEffect(() => () => exportRef.current?.abort(), []);
  useEffect(() => {
    setMonth((current) => clampBillingPrincipalMonth(current, range));
    setSelectedDate(null);
  }, [range]);
  const handleAccessError = useCallback((caught: unknown) => {
    if ([401, 403, 404].includes(parseCollectionApiErrorDetails(caught).status ?? 0)) onAccessLost();
  }, [onAccessLost]);

  useEffect(() => {
    const controller = new AbortController();
    setCalendar([]); setCalendarLoading(true); setCalendarError("");
    // Fetch the configured validity once per aging; changing the visible month only changes presentation.
    void getBillingPrincipalCalendar(target.id, target.activeRevision.id, { from: start, to: end, ...(aging === "ALL" ? {} : { aging }) }, { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) setCalendar(response.days); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) { setCalendarError(parseApiError(caught)); handleAccessError(caught); } })
      .finally(() => { if (!controller.signal.aborted) setCalendarLoading(false); });
    return () => controller.abort();
  }, [aging, start, end, range.version, target.id, target.activeRevision.id, retry, handleAccessError]);

  const byDate = useMemo(() => new Map(calendar.map((day) => [day.date, day])), [calendar]);
  const grid = useMemo(() => getBillingPrincipalCalendarGridDates(month), [month]);
  const shiftMonth = (delta: number) => {
    const seed = dateAtNoon(month + "-01");
    seed.setUTCMonth(seed.getUTCMonth() + delta);
    const candidate = isoDate(seed).slice(0, 7);
    if (candidate >= start.slice(0, 7) && candidate <= end.slice(0, 7)) setMonth(candidate);
  };
  const runExport = async (format: ExportFormat) => {
    if (exportRef.current || disabled) return;
    const controller = new AbortController(); exportRef.current = controller;
    setExporting(format); onExportBusy(true); setExportError("");
    try {
      const filters = { asOf: overview.asOf, from: start, to: end };
      assertBillingPrincipalExportOwner(ownerUserId, getStoredAuthenticatedUser()?.id ?? "");
      if (format === "xlsx") {
        const result = await downloadBillingPrincipalExport(target.id, target.activeRevision.id, { ...filters, format }, { signal: controller.signal });
        assertBillingPrincipalExportOwner(ownerUserId, result.generatedByUserId);
        const latest = await getBillingPrincipalSavedTarget(target.id, { signal: controller.signal });
        assertBillingPrincipalExportAuthorization(ownerUserId, overview.target.version, latest, getBillingPrincipalReportingWindow(overview.revision).version);
        if (!controller.signal.aborted) triggerDownload(result.blob, result.fileName || "billing-principal.xlsx");
      } else {
        // Always request fresh owner-scoped data; never cache private/PII export datasets.
        const dataset = await getBillingPrincipalVisualExportDataset(target.id, target.activeRevision.id, filters, { signal: controller.signal });
        assertBillingPrincipalExportOwner(ownerUserId, dataset.generatedByUserId);
        if (!controller.signal.aborted) await exportBillingPrincipalVisualReport(format, { dataset, signal: controller.signal, beforeDownload: async () => {
          const latest = await getBillingPrincipalSavedTarget(target.id, { signal: controller.signal });
          assertBillingPrincipalExportAuthorization(dataset.generatedByUserId, dataset.overview.target.version, latest, getBillingPrincipalReportingWindow(dataset.overview.revision).version);
        } });
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        setExportError(parseApiError(caught));
        if (caught instanceof BillingPrincipalExportIdentityError) onAccessLost();
        else handleAccessError(caught);
      }
    } finally {
      if (exportRef.current === controller) { exportRef.current = null; setExporting(null); onExportBusy(false); }
    }
  };

  return <section aria-labelledby="billing-system-analysis-heading" className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><h3 id="billing-system-analysis-heading" className="font-semibold">System calendar</h3><p className="mt-1 text-sm text-muted-foreground">{range.sourceValidityVerified ? "Full current source validity" : "Reporting period (includes legacy source fallback)"}: {start} — {end}. Click a day for its closed accounts. Balance = shared target OSP − cumulative closed.</p></div>
      <div className="flex flex-wrap gap-2">{(["xlsx", "png", "pdf"] as const).map((format) => <Button key={format} type="button" size="sm" variant="outline" disabled={disabled || exporting !== null} aria-label={"Export Billing Principal report as " + format.toUpperCase()} onClick={() => void runExport(format)}>{exporting === format ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}{format.toUpperCase()}</Button>)}
        {exporting ? <Button type="button" size="sm" variant="ghost" onClick={() => exportRef.current?.abort()}>Cancel export</Button> : null}
      </div>
    </div>
    <p className="text-xs text-muted-foreground">Exports contain saved shared values and only your saved private results. Save or discard private changes before exporting.</p>
    {exportError ? <p role="alert" className="text-sm text-destructive">{exportError}</p> : null}
    <div className="flex flex-wrap items-end gap-2">
      <Button type="button" variant="outline" size="icon" aria-label="Previous month" disabled={month <= start.slice(0, 7)} onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
      <div className="space-y-1"><Label htmlFor="billing-calendar-month">Month</Label><Input id="billing-calendar-month" type="month" value={month} min={start.slice(0, 7)} max={end.slice(0, 7)} onChange={(event) => { const value = event.target.value; if (isValidMonth(value) && value >= start.slice(0, 7) && value <= end.slice(0, 7)) setMonth(value); }} /></div>
      <Button type="button" variant="outline" size="icon" aria-label="Next month" disabled={month >= end.slice(0, 7)} onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
      <div className="space-y-1"><Label htmlFor="billing-calendar-aging">Calendar aging</Label><select id="billing-calendar-aging" className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring" value={aging} onChange={(event) => setAging(event.target.value as BillingPrincipalAging | "ALL")}><option value="ALL">ALL</option>{BILLING_PRINCIPAL_AGINGS.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
    </div>
    {calendarError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{calendarError}</p><Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry calendar</Button></div> : null}
    {calendarLoading ? <p role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading full-validity calendar…</p> : null}
    {!calendarLoading && !calendarError ? <div className="overflow-x-auto pb-1" tabIndex={0} role="region" aria-label="Scrollable system calendar">
      <div className="min-w-[70rem]">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">{WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">{grid.map((date, index) => {
          const day = date && isBillingPrincipalDateInRange(date, range) ? byDate.get(date) : undefined;
          return day ? <CalendarCell key={date} day={day} onSelect={() => setSelectedDate(day.date)} /> : <div key={date ?? "blank-" + index} className="min-h-44 rounded-md border border-dashed border-border/40" aria-hidden="true" />;
        })}</div>
      </div>
    </div> : null}
    {selectedDate && isBillingPrincipalDateInRange(selectedDate, range) ? <BillingPrincipalDayDialog key={target.id + ":" + range.version + ":" + selectedDate} target={target} date={selectedDate} onClose={() => setSelectedDate(null)} onAccessLost={onAccessLost} /> : null}
  </section>;
}
