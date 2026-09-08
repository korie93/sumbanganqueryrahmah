import type { BillingPrincipalCalendarDay } from "@/lib/api/collection-billing-principal";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import { formatOspCurrency, formatOspPercentage } from "./billing-principal-report-utils";

export function BillingPrincipalCalendarDayCard({ day, asOf, selected, onSelect }: {
  day: BillingPrincipalCalendarDay; asOf: string; selected: boolean; onSelect: () => void;
}) {
  const active = day.dailyMovement.all.closedAccountCount > 0;
  const dateLabel = new Intl.DateTimeFormat("en-MY", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(`${day.date}T12:00:00Z`));
  return <button type="button" onClick={onSelect} data-testid={`billing-calendar-day-${day.date}`}
    aria-label={`${day.date}, ${day.dailyMovement.all.closedAccountCount} accounts, new closed ${formatOspCurrency(day.dailyMovement.all.ospClosed)}, daily result ${formatOspPercentage(day.dailyMovement.all.resultPercentage)}. View closed accounts.`}
    {...(day.date === asOf ? { "aria-current": "date" as const } : {})} {...getAriaPressedProps(selected)}
    className={`min-w-0 w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected || day.date === asOf ? "border-primary" : "border-border"} ${active ? "bg-background" : "bg-muted/20"}`}>
    <span className="flex flex-wrap items-center justify-between gap-1">
      <span className="text-base font-semibold">{dateLabel}</span>
      <span className="text-xs text-muted-foreground">{day.date === asOf ? "System As Of" : active ? `${day.dailyMovement.all.closedAccountCount} accounts` : "No movement"}</span>
    </span>
    <span className="mt-3 grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.7fr)] gap-x-2 text-xs text-muted-foreground">
      <span>Aging</span><span className="text-right">Daily result</span><span className="text-right">OSP closed</span>
    </span>
    {[...day.dailyMovement.rows, day.dailyMovement.all].map((row) => <span key={row.aging}
      className={`grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.7fr)] items-start gap-x-2 py-2 text-sm tabular-nums ${row.aging === "ALL" ? "border-t font-semibold" : ""}`}>
      <span>{row.aging === "ALL" ? "TOTAL" : row.aging}</span>
      <span className="min-w-0 text-right [overflow-wrap:anywhere]">{formatOspPercentage(row.resultPercentage)}</span>
      <span className="min-w-0 text-right [overflow-wrap:anywhere]">{formatOspCurrency(row.ospClosed)}</span>
    </span>)}
    <span className="mt-1 block border-t pt-2 text-xs text-muted-foreground">
      Cumulative · {day.aging}<span className="mt-1 block tabular-nums [overflow-wrap:anywhere]">{formatOspCurrency(day.systemCumulativeOspClosed)} · Result {formatOspPercentage(day.systemResultPercentage)}</span>
      <span className="mt-1 block tabular-nums [overflow-wrap:anywhere]">Balance {formatOspCurrency(day.balanceOsp)}</span>
    </span>
  </button>;
}
