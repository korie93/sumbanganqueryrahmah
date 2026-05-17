import type { CollectionDailyOverviewDay } from "@/lib/api";
import { summarizeCollectionDailyCalendarStatus } from "@/pages/collection/collection-daily-calendar-summary-utils";

type CollectionDailyCalendarStatusSummaryProps = {
  days: CollectionDailyOverviewDay[];
  dirtyCalendarDayNumbers: ReadonlySet<number>;
  canManage: boolean;
};

function SummaryPill({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "working" | "holiday" | "off" | "dirty";
}) {
  return (
    <div className={`collection-daily-calendar-summary-pill collection-daily-calendar-summary-pill-${tone}`}>
      <span className="collection-daily-calendar-summary-value">{value}</span>
      <span className="collection-daily-calendar-summary-text">
        <span>{label}</span>
        <small>{detail}</small>
      </span>
    </div>
  );
}

export function CollectionDailyCalendarStatusSummary({
  days,
  dirtyCalendarDayNumbers,
  canManage,
}: CollectionDailyCalendarStatusSummaryProps) {
  const summary = summarizeCollectionDailyCalendarStatus(days, dirtyCalendarDayNumbers);

  return (
    <section
      className="collection-daily-calendar-summary"
      aria-label="Monthly daily status summary for selected nickname"
      data-testid="collection-daily-calendar-status-summary"
    >
      <SummaryPill
        label="Working"
        value={summary.workingDays}
        detail={`of ${summary.totalDays} days`}
        tone="working"
      />
      <SummaryPill
        label="Holiday / Leave"
        value={summary.holidayDays}
        detail="includes OFF days"
        tone="holiday"
      />
      <SummaryPill
        label="OFF"
        value={summary.offDays}
        detail="company closed"
        tone="off"
      />
      {canManage ? (
        <SummaryPill
          label="Unsaved"
          value={summary.unsavedChanges}
          detail={summary.unsavedChanges === 1 ? "changed day" : "changed days"}
          tone="dirty"
        />
      ) : null}
    </section>
  );
}
