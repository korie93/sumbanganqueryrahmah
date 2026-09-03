import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAriaSelectedProps } from "@/lib/aria-state-props";
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
} from "@/lib/api/collection-billing-principal";
import { parseApiError } from "@/pages/collection/utils";
import {
  BILLING_PRINCIPAL_AGINGS,
  formatOspCurrency,
  formatOspPercentage,
  formatOspPercentagePoint,
} from "./billing-principal-report-utils";
import {
  exportBillingPrincipalVisualReport,
  type BillingPrincipalVisualExportKind,
} from "./billing-principal-visual-export";

const PAGE_SIZE = 20;
const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
type BillingPrincipalExportFormat = "csv" | "xlsx" | BillingPrincipalVisualExportKind;
export type BillingPrincipalDrilldownScope = "daily" | "cumulative";
export type BillingPrincipalCalendarAging = BillingPrincipalAging | "ALL";

type DrilldownIntent = {
  date: string;
  aging: BillingPrincipalAging | "";
  source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "";
  scope: BillingPrincipalDrilldownScope;
};

function isIsoMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function monthFromDate(value: string) {
  return value.slice(0, 7);
}

function dateForCalendar(value: string) {
  return new Date(`${value}T12:00:00`);
}

function toIsoDate(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function getBillingPrincipalCalendarMonthRange(input: {
  month: string;
  start: string;
  end: string;
}) {
  if (!isIsoMonth(input.month) || input.start > input.end) return null;
  const first = `${input.month}-01`;
  const last = toIsoDate(new Date(Number(input.month.slice(0, 4)), Number(input.month.slice(5, 7)), 0, 12));
  if (last < input.start || first > input.end) return null;
  return {
    from: first < input.start ? input.start : first,
    to: last > input.end ? input.end : last,
  };
}

export function getBillingPrincipalCalendarGridDates(month: string) {
  if (!isIsoMonth(month)) return [] as Array<string | null>;
  const first = dateForCalendar(`${month}-01`);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const days: Array<string | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= lastDay; day += 1) {
    days.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (days.length < 42) days.push(null);
  return days;
}

function addCalendarMonths(month: string, delta: number) {
  if (!isIsoMonth(month)) return month;
  const value = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1, 12);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function formatCalendarMonth(month: string) {
  if (!isIsoMonth(month)) return month;
  return new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric" }).format(dateForCalendar(`${month}-01`));
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function emptyPagination(page = 1): BillingPrincipalPagination {
  return { page, pageSize: PAGE_SIZE, total: 0, totalPages: 0 };
}

function formatPercentagePoint(value: string | null) {
  return value === null ? "—" : formatOspPercentagePoint(value);
}

export function buildBillingPrincipalDrilldownFilters(input: {
  reportAsOf: string;
  selectedDate: string;
  scope: BillingPrincipalDrilldownScope;
  page: number;
  aging: BillingPrincipalAging | "";
  source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "";
}) {
  const selectedDate = input.selectedDate || input.reportAsOf;
  return {
    asOf: input.scope === "cumulative" ? selectedDate : input.reportAsOf,
    ...(input.scope === "daily" ? { date: selectedDate } : {}),
    page: input.page,
    pageSize: PAGE_SIZE,
    ...(input.aging ? { aging: input.aging } : {}),
    ...(input.source ? { contributionSource: input.source } : {}),
  };
}

function OspDrilldownButton({
  value,
  label,
  onClick,
  supporting,
}: {
  value: string;
  label: string;
  onClick: () => void;
  supporting?: string | undefined;
}) {
  return (
    <Button
      type="button"
      variant="link"
      className="h-auto min-h-11 max-w-full flex-col items-end whitespace-normal px-0 py-1 text-right font-semibold tabular-nums sm:min-h-0"
      aria-label={`${label}: ${formatOspCurrency(value)}`}
      onClick={onClick}
    >
      <span>{formatOspCurrency(value)}</span>
      {supporting ? <span className="text-xs font-normal text-muted-foreground">{supporting}</span> : null}
    </Button>
  );
}

function ComparisonView({
  overview,
  onDrilldown,
}: {
  overview: BillingPrincipalSavedTargetOverview;
  onDrilldown: (intent: DrilldownIntent) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70">
      <Table aria-label="System, reconciled, and client comparison" className="min-w-[1120px]">
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Aging</TableHead>
            <TableHead className="text-right">System result</TableHead>
            <TableHead className="text-right">Reconciled result</TableHead>
            <TableHead className="text-right">Client result</TableHead>
            <TableHead className="text-right">System OSP</TableHead>
            <TableHead className="text-right">Table C OSP</TableHead>
            <TableHead className="text-right">Reconciled OSP</TableHead>
            <TableHead className="text-right">Client OSP</TableHead>
            <TableHead className="text-right">System vs client</TableHead>
            <TableHead className="text-right">Reconciled vs client</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {overview.comparison.rows.map((row) => (
            <TableRow key={row.aging} className={row.aging === "ALL" ? "bg-muted/20 font-semibold" : undefined}>
              <TableCell>{row.aging}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspPercentage(row.systemResultPercentage)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspPercentage(row.reconciledResultPercentage)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.clientResultPercentage === null ? "—" : formatOspPercentage(row.clientResultPercentage)}</TableCell>
              <TableCell className="text-right">
                <OspDrilldownButton
                  value={row.systemOspClosed}
                  label={`Open cumulative System OSP drilldown for ${row.aging}`}
                  onClick={() => onDrilldown({
                    date: overview.asOf,
                    aging: row.aging === "ALL" ? "" : row.aging,
                    source: "SYSTEM_ABORT_CP",
                    scope: "cumulative",
                  })}
                />
              </TableCell>
              <TableCell className="text-right">
                <OspDrilldownButton
                  value={row.manualReconciledOsp}
                  label={`Open cumulative Table C OSP drilldown for ${row.aging}`}
                  onClick={() => onDrilldown({
                    date: overview.asOf,
                    aging: row.aging === "ALL" ? "" : row.aging,
                    source: "MANUAL_RECONCILIATION",
                    scope: "cumulative",
                  })}
                />
              </TableCell>
              <TableCell className="text-right">
                <OspDrilldownButton
                  value={row.reconciledOspClosed}
                  label={`Open cumulative reconciled OSP drilldown for ${row.aging}`}
                  onClick={() => onDrilldown({
                    date: overview.asOf,
                    aging: row.aging === "ALL" ? "" : row.aging,
                    source: "",
                    scope: "cumulative",
                  })}
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.clientOspClosed === null ? "—" : formatOspCurrency(row.clientOspClosed)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block">{formatPercentagePoint(row.systemVsClientResultPercentagePointDifference)}</span>
                <span className="block text-xs text-muted-foreground">{row.systemVsClientOspDifference === null ? "—" : formatOspCurrency(row.systemVsClientOspDifference)}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="block">{formatPercentagePoint(row.reconciledVsClientResultPercentagePointDifference)}</span>
                <span className="block text-xs text-muted-foreground">{row.reconciledVsClientOspDifference === null ? "—" : formatOspCurrency(row.reconciledVsClientOspDifference)}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CalendarView({
  target,
  asOf,
  onDrilldown,
}: {
  target: BillingPrincipalSavedTarget;
  asOf: string;
  onDrilldown: (intent: DrilldownIntent) => void;
}) {
  const start = target.activeRevision.trackingStartDate || target.activeRevision.from;
  const end = target.activeRevision.trackingEndDate || target.activeRevision.to;
  const maximumDate = asOf < end ? asOf : end;
  const [month, setMonth] = useState(() => monthFromDate(maximumDate));
  const [aging, setAging] = useState<BillingPrincipalCalendarAging>("ALL");
  const [selectedDate, setSelectedDate] = useState(maximumDate);
  const [days, setDays] = useState<BillingPrincipalCalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const targetScope = `${target.id}:${target.activeRevision.id}`;
  const range = useMemo(() => getBillingPrincipalCalendarMonthRange({
    month,
    start,
    end: maximumDate,
  }), [maximumDate, month, start]);
  const gridDates = useMemo(() => getBillingPrincipalCalendarGridDates(month), [month]);
  const daysByDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const selectedDay = daysByDate.get(selectedDate) || null;
  const earliestMonth = monthFromDate(start);
  const latestMonth = monthFromDate(maximumDate);
  const drilldownAging = aging === "ALL" ? "" : aging;

  useEffect(() => {
    setMonth(monthFromDate(maximumDate));
    setAging("ALL");
    setSelectedDate(maximumDate);
    setDays([]);
    setError("");
    setRefreshVersion(0);
  }, [maximumDate, start, targetScope]);

  useEffect(() => {
    if (!range) {
      setDays([]);
      setLoading(false);
      setError("This month is outside the Saved Target tracking period.");
      return;
    }
    setSelectedDate((current) => (
      current < range.from || current > range.to ? range.to : current
    ));
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getBillingPrincipalCalendar(
      target.id,
      target.activeRevision.id,
      {
        from: range.from,
        to: range.to,
        asOf,
        ...(aging === "ALL" ? {} : { aging }),
      },
      { signal: controller.signal },
    )
      .then((response) => {
        if (!controller.signal.aborted) setDays(response.days);
      })
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) {
          setDays([]);
          setError(parseApiError(caught));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [aging, asOf, range, refreshVersion, target.activeRevision.id, target.id]);

  const selectMonth = (nextMonth: string) => {
    const nextRange = getBillingPrincipalCalendarMonthRange({ month: nextMonth, start, end: maximumDate });
    if (!nextRange) return;
    setMonth(nextMonth);
    setSelectedDate(nextRange.to);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/10 p-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="billing-calendar-month">Month</Label>
          <div className="flex min-h-10 items-center gap-1 rounded-md border border-input bg-background px-1">
            <Button type="button" size="icon" variant="ghost" aria-label="Previous calendar month" onClick={() => selectMonth(addCalendarMonths(month, -1))} disabled={month <= earliestMonth || loading}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Input id="billing-calendar-month" type="month" value={month} min={earliestMonth} max={latestMonth} onChange={(event) => selectMonth(event.target.value)} className="border-0 px-1 shadow-none focus-visible:ring-0" />
            <Button type="button" size="icon" variant="ghost" aria-label="Next calendar month" onClick={() => selectMonth(addCalendarMonths(month, 1))} disabled={month >= latestMonth || loading}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-calendar-aging">Aging</Label>
          <select id="billing-calendar-aging" value={aging} onChange={(event) => setAging(event.target.value as BillingPrincipalCalendarAging)} className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="ALL">ALL scoped aging</option>
            {target.activeRevision.agingScope.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="self-end text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{formatCalendarMonth(month)}</p>
          <p>{aging === "ALL" ? target.activeRevision.agingScope.join(", ") : aging} from the loaded target revision</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setRefreshVersion((value) => value + 1)} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Reload
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
        <div className="grid min-w-[700px] grid-cols-7 border-b border-border/60 bg-muted/20 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {CALENDAR_WEEKDAYS.map((weekday) => <div key={weekday} className="px-2 py-2">{weekday}</div>)}
        </div>
        <div className="grid min-w-[700px] grid-cols-7" aria-label={`${formatCalendarMonth(month)} Billing Principal month calendar`}>
          {(() => {
            let blankCell = 0;
            return gridDates.map((date) => {
              const day = date ? daysByDate.get(date) : undefined;
              if (!date) {
                blankCell += 1;
                return <div key={`blank-${month}-${blankCell}`} className="min-h-24 border-b border-r border-border/40 bg-muted/5" aria-hidden="true" />;
              }
              const inTargetRange = Boolean(range && date >= range.from && date <= range.to);
              const selectedDateAriaProps = date === selectedDate
                ? { "aria-pressed": "true" as const }
                : { "aria-pressed": "false" as const };
              return (
              <button
                key={date}
                type="button"
                disabled={!day || !inTargetRange}
                {...selectedDateAriaProps}
                aria-label={day
                  ? `${date}: reconciled ${formatOspPercentage(day.reconciledResultPercentage)}, movement ${formatOspPercentagePoint(day.reconciledDailyMovementPercentagePoints)}`
                  : `${date}: outside target range`}
                onClick={() => setSelectedDate(date)}
                className={`min-h-24 border-b border-r border-border/40 p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                  date === selectedDate ? "bg-primary/10 ring-1 ring-inset ring-primary/50" : "bg-card hover:bg-muted/30"
                } disabled:cursor-not-allowed disabled:bg-muted/10 disabled:text-muted-foreground`}
              >
                <span className="block text-sm font-semibold">{Number(date.slice(-2))}</span>
                {day ? (
                  <span className="mt-2 block space-y-1 text-xs tabular-nums">
                    <span className="block font-medium">R {formatOspPercentage(day.reconciledResultPercentage)}</span>
                    <span className="block text-muted-foreground">Δ {formatOspPercentagePoint(day.reconciledDailyMovementPercentagePoints)}</span>
                    <span className="block truncate text-muted-foreground">Today {formatOspCurrency(day.reconciledOspClosedToday)}</span>
                  </span>
                ) : null}
              </button>
              );
            });
          })()}
        </div>
      </div>
      {selectedDay ? (
        <section aria-labelledby="billing-calendar-selected-day" className="rounded-xl border border-border/70 bg-muted/10 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 id="billing-calendar-selected-day" className="font-semibold">{selectedDay.date} · {selectedDay.aging}</h4>
              <p className="text-sm text-muted-foreground">
                TT OSP {formatOspCurrency(selectedDay.totalOsp)} · Target OSP {formatOspCurrency(selectedDay.targetOsp)}
              </p>
            </div>
            {selectedDay.clientResultPercentage === null ? (
              <p role="status" className="max-w-md text-sm text-amber-700 dark:text-amber-300">
                Audit warning: no complete client snapshot is saved for this exact date. A prior client snapshot is not carried forward.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Exact Client snapshot: {formatOspPercentage(selectedDay.clientResultPercentage)}
              </p>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raw System</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatOspPercentage(selectedDay.systemResultPercentage)}</p>
              <p className="text-xs text-muted-foreground">
                Previous {formatOspPercentage(selectedDay.systemPreviousResultPercentage)} · movement {formatOspPercentagePoint(selectedDay.systemDailyMovementPercentagePoints)} · target achievement {formatOspPercentage(selectedDay.systemAchievementVsTargetPercentage)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reconciled Internal</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatOspPercentage(selectedDay.reconciledResultPercentage)}</p>
              <p className="text-xs text-muted-foreground">
                Previous {formatOspPercentage(selectedDay.reconciledPreviousResultPercentage)} · movement {formatOspPercentagePoint(selectedDay.reconciledDailyMovementPercentagePoints)} · target achievement {formatOspPercentage(selectedDay.reconciledAchievementVsTargetPercentage)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onDrilldown({ date: selectedDay.date, aging: drilldownAging, source: "SYSTEM_ABORT_CP", scope: "daily" })}>System today</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onDrilldown({ date: selectedDay.date, aging: drilldownAging, source: "MANUAL_RECONCILIATION", scope: "daily" })}>Table C today</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onDrilldown({ date: selectedDay.date, aging: drilldownAging, source: "", scope: "daily" })}>Reconciled today</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onDrilldown({ date: selectedDay.date, aging: drilldownAging, source: "SYSTEM_ABORT_CP", scope: "cumulative" })}>System cumulative</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onDrilldown({ date: selectedDay.date, aging: drilldownAging, source: "MANUAL_RECONCILIATION", scope: "cumulative" })}>Table C cumulative</Button>
            <Button type="button" size="sm" onClick={() => onDrilldown({ date: selectedDay.date, aging: drilldownAging, source: "", scope: "cumulative" })}>Reconciled cumulative</Button>
          </div>
        </section>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-border/70" aria-busy={loading}>
        <Table aria-label="Billing Principal daily calendar" className="min-w-[1100px]">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Date</TableHead>
              <TableHead className="text-right">System today</TableHead>
              <TableHead className="text-right">Table C today</TableHead>
              <TableHead className="text-right">Reconciled today</TableHead>
              <TableHead className="text-right">System cumulative</TableHead>
              <TableHead className="text-right">Table C cumulative</TableHead>
              <TableHead className="text-right">Reconciled cumulative</TableHead>
              <TableHead className="text-right">System %</TableHead>
              <TableHead className="text-right">Reconciled %</TableHead>
              <TableHead className="text-right">Target achievement</TableHead>
              <TableHead className="text-right">Client %</TableHead>
              <TableHead className="text-right">Drilldown</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && days.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="h-24 text-center text-muted-foreground">Loading calendar...</TableCell></TableRow>
            ) : days.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="h-24 text-center text-muted-foreground">No daily movement in this range.</TableCell></TableRow>
            ) : days.map((day) => (
              <TableRow key={day.date} className={day.date === selectedDate ? "bg-primary/5" : undefined}>
                <TableCell className="font-medium"><Button type="button" variant="link" className="h-auto p-0" onClick={() => setSelectedDate(day.date)}>{day.date}</Button></TableCell>
                <TableCell className="text-right">
                  <OspDrilldownButton
                    value={day.systemOspClosedToday}
                    supporting={`${day.systemDailyAccounts.toLocaleString()} accounts`}
                    label={`Open daily System OSP drilldown for ${day.date}`}
                    onClick={() => onDrilldown({ date: day.date, aging: drilldownAging, source: "SYSTEM_ABORT_CP", scope: "daily" })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <OspDrilldownButton
                    value={day.manualReconciliationOspClosedToday}
                    supporting={`${day.manualDailyAccounts.toLocaleString()} accounts`}
                    label={`Open daily Table C OSP drilldown for ${day.date}`}
                    onClick={() => onDrilldown({ date: day.date, aging: drilldownAging, source: "MANUAL_RECONCILIATION", scope: "daily" })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <OspDrilldownButton
                    value={day.reconciledOspClosedToday}
                    supporting={`${day.reconciledDailyAccounts.toLocaleString()} accounts`}
                    label={`Open daily reconciled OSP drilldown for ${day.date}`}
                    onClick={() => onDrilldown({ date: day.date, aging: drilldownAging, source: "", scope: "daily" })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <OspDrilldownButton
                    value={day.systemCumulativeOspClosed}
                    label={`Open cumulative System OSP drilldown through ${day.date}`}
                    onClick={() => onDrilldown({ date: day.date, aging: drilldownAging, source: "SYSTEM_ABORT_CP", scope: "cumulative" })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <OspDrilldownButton
                    value={day.manualReconciliationCumulativeOsp}
                    label={`Open cumulative Table C OSP drilldown through ${day.date}`}
                    onClick={() => onDrilldown({ date: day.date, aging: drilldownAging, source: "MANUAL_RECONCILIATION", scope: "cumulative" })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <OspDrilldownButton
                    value={day.reconciledCumulativeOspClosed}
                    label={`Open cumulative reconciled OSP drilldown through ${day.date}`}
                    onClick={() => onDrilldown({ date: day.date, aging: drilldownAging, source: "", scope: "cumulative" })}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatOspPercentage(day.systemResultPercentage)}
                  <span className="block text-xs text-muted-foreground">Prev {formatOspPercentage(day.systemPreviousResultPercentage)} · {formatOspPercentagePoint(day.systemDailyMovementPercentagePoints)}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatOspPercentage(day.reconciledResultPercentage)}
                  <span className="block text-xs text-muted-foreground">Prev {formatOspPercentage(day.reconciledPreviousResultPercentage)} · {formatOspPercentagePoint(day.reconciledDailyMovementPercentagePoints)}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className="block">R {formatOspPercentage(day.reconciledAchievementVsTargetPercentage)}</span>
                  <span className="block text-xs text-muted-foreground">S {formatOspPercentage(day.systemAchievementVsTargetPercentage)}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{day.clientResultPercentage === null ? "—" : formatOspPercentage(day.clientResultPercentage)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDrilldown({ date: day.date, aging: drilldownAging, source: "", scope: "daily" })}
                  >
                    All today
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DrilldownView({
  target,
  asOf,
  date,
  onDateChange,
  aging,
  onAgingChange,
  source,
  onSourceChange,
  scope,
  onScopeChange,
}: {
  target: BillingPrincipalSavedTarget;
  asOf: string;
  date: string;
  onDateChange: (date: string) => void;
  aging: BillingPrincipalAging | "";
  onAgingChange: (aging: BillingPrincipalAging | "") => void;
  source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "";
  onSourceChange: (source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "") => void;
  scope: BillingPrincipalDrilldownScope;
  onScopeChange: (scope: BillingPrincipalDrilldownScope) => void;
}) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<BillingPrincipalDrilldownItem[]>([]);
  const [pagination, setPagination] = useState(() => emptyPagination());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => setPage(1), [aging, date, scope, source]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getBillingPrincipalDrilldown(
      target.id,
      target.activeRevision.id,
      buildBillingPrincipalDrilldownFilters({
        reportAsOf: asOf,
        selectedDate: date,
        scope,
        page,
        aging,
        source,
      }),
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setItems(response.items);
        setPagination(response.pagination);
      })
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) {
          setItems([]);
          setError(parseApiError(caught));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [aging, asOf, date, page, scope, source, target.activeRevision.id, target.id]);

  const totalPages = Math.max(1, pagination.totalPages);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/10 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="billing-drilldown-date">Selected date</Label>
          <Input
            id="billing-drilldown-date"
            type="date"
            value={date}
            min={target.activeRevision.trackingStartDate || target.activeRevision.from}
            max={asOf < (target.activeRevision.trackingEndDate || target.activeRevision.to)
              ? asOf
              : (target.activeRevision.trackingEndDate || target.activeRevision.to)}
            onChange={(event) => { onDateChange(event.target.value); setPage(1); }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-drilldown-scope">Date semantics</Label>
          <select
            id="billing-drilldown-scope"
            value={scope}
            onChange={(event) => onScopeChange(event.target.value as BillingPrincipalDrilldownScope)}
            className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="daily">Closed exactly on selected date</option>
            <option value="cumulative">Closed through selected date</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-drilldown-aging">Aging</Label>
          <select
            id="billing-drilldown-aging"
            value={aging}
            onChange={(event) => onAgingChange(event.target.value as BillingPrincipalAging | "")}
            className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All aging</option>
            {BILLING_PRINCIPAL_AGINGS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-drilldown-source">Contribution source</Label>
          <select
            id="billing-drilldown-source"
            value={source}
            onChange={(event) => onSourceChange(event.target.value as typeof source)}
            className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All sources</option>
            <option value="SYSTEM_ABORT_CP">System Abort CP</option>
            <option value="MANUAL_RECONCILIATION">Table C</option>
          </select>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        {scope === "daily"
          ? `Showing contributions whose effective close date is exactly ${date || asOf}.`
          : `Showing unique contributions closed from target start through ${date || asOf}.`}
      </p>
      <div className="overflow-x-auto rounded-xl border border-border/70" aria-busy={loading}>
        <Table aria-label="Billing Principal account drilldown" className="min-w-[1320px]">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Account / customer</TableHead>
              <TableHead>Source / evidence</TableHead>
              <TableHead>Aging</TableHead>
              <TableHead className="text-right">Total due</TableHead>
              <TableHead className="text-right">System cumulative</TableHead>
              <TableHead className="text-right">Manual prior</TableHead>
              <TableHead className="text-right">Reconciled cumulative</TableHead>
              <TableHead className="text-right">Billing Principal</TableHead>
              <TableHead>Effective close</TableHead>
              <TableHead>Reference / audit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">Loading drilldown...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No contributions found for this scope.</TableCell></TableRow>
            ) : items.map((item) => (
              <TableRow key={`${item.contributionSource}:${item.effectiveClosedDate}:${item.maskedAccountNumber}:${item.aging}:${item.billingPrincipalOsp}`}>
                <TableCell>
                  <p className="font-medium">{item.maskedAccountNumber}</p>
                  <p className="max-w-52 truncate text-xs text-muted-foreground">{item.maskedCustomerName}</p>
                  <p className="text-xs text-muted-foreground">Card {item.cardNumberLast4 ? `ending ${item.cardNumberLast4}` : "—"}</p>
                </TableCell>
                <TableCell className="max-w-64">
                  <Badge variant="outline">{item.contributionSource === "SYSTEM_ABORT_CP" ? "System Abort CP" : "Table C"}</Badge>
                  <p className="mt-1 truncate text-xs font-medium" title={item.sourceName}>{item.sourceName}</p>
                  <p className="truncate text-xs text-muted-foreground" title={item.sourceFilename}>{item.sourceFilename}</p>
                  <p className="text-xs text-muted-foreground">Calling date {item.callingDate}</p>
                  {item.systemClosureCollectionAmount ? (
                    <p className="text-xs text-muted-foreground">
                      Closure row {formatOspCurrency(item.systemClosureCollectionAmount)}{item.systemClosureStaffNickname ? ` · ${item.systemClosureStaffNickname}` : ""}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>{item.aging}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(item.totalDue)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(item.systemEligibleCumulative)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(item.manualPriorAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(item.reconciledCumulative)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(item.billingPrincipalOsp)}</TableCell>
                <TableCell>{item.effectiveClosedDate}</TableCell>
                <TableCell className="max-w-64">
                  <p className="truncate" title={item.reference || undefined}>{item.reference || "—"}</p>
                  {item.reason ? <p className="text-xs text-muted-foreground">{item.reason.replace(/_/g, " ")}</p> : null}
                  {item.reconciliationCreatedAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">Created {item.reconciliationCreatedAt} by {item.reconciliationCreatedBy || "—"}</p>
                  ) : null}
                  {item.reconciliationUpdatedAt ? (
                    <p className="text-xs text-muted-foreground">Updated {item.reconciliationUpdatedAt} by {item.reconciliationUpdatedBy || "—"}</p>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-col gap-2 border-t border-border/60 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{pagination.total.toLocaleString()} contribution{pagination.total === 1 ? "" : "s"} · page {pagination.page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" aria-label="Previous drilldown page" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || page <= 1}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" size="sm" variant="outline" aria-label="Next drilldown page" onClick={() => setPage((value) => value + 1)} disabled={loading || pagination.totalPages === 0 || page >= pagination.totalPages}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BillingPrincipalInsights({
  target,
  overview,
  drilldownRequest,
}: {
  target: BillingPrincipalSavedTarget;
  overview: BillingPrincipalSavedTargetOverview;
  drilldownRequest?: {
    sequence: number;
    date: string;
    aging: BillingPrincipalAging | "";
    source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "";
    scope?: BillingPrincipalDrilldownScope | undefined;
  } | null;
}) {
  const [view, setView] = useState<"comparison" | "calendar" | "drilldown">("comparison");
  const [drilldownDate, setDrilldownDate] = useState(overview.asOf);
  const [drilldownAging, setDrilldownAging] = useState<BillingPrincipalAging | "">("");
  const [drilldownSource, setDrilldownSource] = useState<"SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "">("");
  const [drilldownScope, setDrilldownScope] = useState<BillingPrincipalDrilldownScope>("cumulative");
  const [exportFormat, setExportFormat] = useState<BillingPrincipalExportFormat>("xlsx");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportControllerRef = useRef<AbortController | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const targetScope = `${target.id}:${target.activeRevision.id}`;
  const trackingRange = useMemo(() => ({
    from: target.activeRevision.trackingStartDate || target.activeRevision.from,
    to: target.activeRevision.trackingEndDate || target.activeRevision.to,
  }), [target.activeRevision]);

  useEffect(() => () => exportControllerRef.current?.abort(), []);
  useEffect(() => {
    exportControllerRef.current?.abort();
    exportControllerRef.current = null;
    setView("comparison");
    setDrilldownDate(overview.asOf);
    setDrilldownAging("");
    setDrilldownSource("");
    setDrilldownScope("cumulative");
    setExporting(false);
    setExportError("");
  }, [targetScope]);
  useEffect(() => setDrilldownDate(overview.asOf), [overview.asOf]);
  useEffect(() => {
    if (!drilldownRequest) return;
    setDrilldownDate(drilldownRequest.date || overview.asOf);
    setDrilldownAging(drilldownRequest.aging);
    setDrilldownSource(drilldownRequest.source);
    setDrilldownScope(drilldownRequest.scope || "cumulative");
    setView("drilldown");
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [drilldownRequest]);

  const openDrilldown = (intent: DrilldownIntent) => {
    setDrilldownDate(intent.date || overview.asOf);
    setDrilldownAging(intent.aging);
    setDrilldownSource(intent.source);
    setDrilldownScope(intent.scope);
    setView("drilldown");
  };

  const exportReport = async () => {
    exportControllerRef.current?.abort();
    const controller = new AbortController();
    exportControllerRef.current = controller;
    setExporting(true);
    setExportError("");
    try {
      const selectedDrilldownFilters = buildBillingPrincipalDrilldownFilters({
        reportAsOf: overview.asOf,
        selectedDate: drilldownDate,
        scope: drilldownScope,
        page: 1,
        aging: drilldownAging,
        source: drilldownSource,
      });
      const exportAsOf = view === "drilldown"
        ? selectedDrilldownFilters.asOf
        : overview.asOf;
      const exportTo = trackingRange.to < exportAsOf ? trackingRange.to : exportAsOf;
      const exportDate = view === "drilldown" ? selectedDrilldownFilters.date : undefined;
      const exportAging = view === "drilldown" && drilldownAging ? drilldownAging : undefined;
      const exportContributionSource = view === "drilldown" && drilldownSource
        ? drilldownSource
        : undefined;
      if (exportFormat === "png" || exportFormat === "pdf") {
        const dataset = await getBillingPrincipalVisualExportDataset(
          target.id,
          target.activeRevision.id,
          {
            asOf: exportAsOf,
            from: trackingRange.from,
            to: exportTo,
            date: exportDate,
            aging: exportAging,
            contributionSource: exportContributionSource,
          },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        await exportBillingPrincipalVisualReport(exportFormat, {
          dataset,
          signal: controller.signal,
        });
        return;
      }
      const result = await downloadBillingPrincipalExport(
        target.id,
        target.activeRevision.id,
        {
          asOf: exportAsOf,
          format: exportFormat,
          from: trackingRange.from,
          to: exportTo,
          date: exportDate,
          aging: exportAging,
          contributionSource: exportContributionSource,
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      try {
        anchor.href = objectUrl;
        anchor.download = result.fileName || `billing-principal-${overview.asOf}.${exportFormat}`;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      }
    } catch (caught) {
      if (!controller.signal.aborted && !isAbortError(caught)) setExportError(parseApiError(caught));
    } finally {
      if (exportControllerRef.current === controller) {
        exportControllerRef.current = null;
        if (!controller.signal.aborted) setExporting(false);
      }
    }
  };

  return (
    <section ref={sectionRef} aria-labelledby="billing-analysis-heading" className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 id="billing-analysis-heading" className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" /> Comparison & Evidence
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">Compare outcomes, follow daily movement, inspect account contributions, or export the governed revision.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="billing-export-format" className="sr-only">Export format</Label>
            <select
              id="billing-export-format"
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as BillingPrincipalExportFormat)}
              className="min-h-10 rounded-md border border-input bg-background px-3 text-sm"
              disabled={exporting}
            >
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
              <option value="pdf">Complete PDF (.pdf)</option>
              <option value="png">Complete PNG page(s)</option>
            </select>
          </div>
          <Button type="button" variant="outline" onClick={() => void exportReport()} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
            {exporting ? "Exporting..." : "Export"}
          </Button>
        </div>
      </div>
      {exportError ? <p role="alert" className="mt-3 text-sm text-destructive">{exportError}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Billing Principal analysis views">
        <Button id="billing-analysis-tab-comparison" aria-controls="billing-analysis-panel" type="button" size="sm" variant={view === "comparison" ? "default" : "outline"} role="tab" {...getAriaSelectedProps(view === "comparison")} onClick={() => setView("comparison")}>
          <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" /> Comparison
        </Button>
        <Button id="billing-analysis-tab-calendar" aria-controls="billing-analysis-panel" type="button" size="sm" variant={view === "calendar" ? "default" : "outline"} role="tab" {...getAriaSelectedProps(view === "calendar")} onClick={() => setView("calendar")}>
          <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" /> Calendar
        </Button>
        <Button id="billing-analysis-tab-drilldown" aria-controls="billing-analysis-panel" type="button" size="sm" variant={view === "drilldown" ? "default" : "outline"} role="tab" {...getAriaSelectedProps(view === "drilldown")} onClick={() => setView("drilldown")}>
          <Search className="mr-2 h-4 w-4" aria-hidden="true" /> Drilldown
        </Button>
      </div>

      <div
        id="billing-analysis-panel"
        className="mt-4"
        role="tabpanel"
        aria-labelledby={`billing-analysis-tab-${view}`}
      >
        {view === "comparison" ? <ComparisonView overview={overview} onDrilldown={openDrilldown} /> : null}
        {view === "calendar" ? (
          <CalendarView
            key={targetScope}
            target={target}
            asOf={overview.asOf}
            onDrilldown={openDrilldown}
          />
        ) : null}
        {view === "drilldown" ? (
          <DrilldownView
            key={`${targetScope}:${overview.asOf}`}
            target={target}
            asOf={overview.asOf}
            date={drilldownDate}
            onDateChange={setDrilldownDate}
            aging={drilldownAging}
            onAgingChange={setDrilldownAging}
            source={drilldownSource}
            onSourceChange={setDrilldownSource}
            scope={drilldownScope}
            onScopeChange={setDrilldownScope}
          />
        ) : null}
      </div>
    </section>
  );
}
