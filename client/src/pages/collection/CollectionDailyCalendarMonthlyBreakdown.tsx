import type { CollectionDailyOverviewDay } from "@/lib/api";
import { summarizeCollectionDailyCalendarMonthlyBreakdown } from "@/pages/collection/collection-daily-calendar-monthly-breakdown-utils";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  COLLECTION_DAILY_LEAVE_TYPE_LABELS,
  COLLECTION_DAILY_LEAVE_TYPES,
} from "@shared/collection-daily-status";

type CollectionDailyCalendarMonthlyBreakdownProps = {
  days: CollectionDailyOverviewDay[];
};

export function CollectionDailyCalendarMonthlyBreakdown({
  days,
}: CollectionDailyCalendarMonthlyBreakdownProps) {
  const summary = summarizeCollectionDailyCalendarMonthlyBreakdown(days);

  return (
    <section
      className="collection-daily-monthly-breakdown"
      aria-label="Monthly status and collection breakdown"
    >
      <div className="collection-daily-monthly-breakdown-header">
        <div>
          <p className="collection-daily-monthly-breakdown-kicker">Monthly summary</p>
          <h3>Status harian dan kutipan bulan ini</h3>
        </div>
        <span>{summary.totalDays} hari</span>
      </div>

      <div className="collection-daily-monthly-breakdown-grid">
        <div>
          <span>Working days</span>
          <strong>{summary.workingDays}</strong>
          <small>{formatAmountRM(summary.workingAmount)} kutipan</small>
        </div>
        <div>
          <span>Holiday / Leave</span>
          <strong>{summary.holidayDays}</strong>
          <small>{formatAmountRM(summary.holidayAmount)} kutipan</small>
        </div>
        <div>
          <span>Conflict</span>
          <strong>{summary.conflictDays}</strong>
          <small>Cuti/OFF tetapi ada kutipan</small>
        </div>
      </div>

      <div className="collection-daily-monthly-breakdown-leaves" aria-label="Leave type totals">
        {COLLECTION_DAILY_LEAVE_TYPES.map((leaveType) => (
          <span key={leaveType}>
            <strong>{leaveType}</strong>
            {summary.leaveTypeCounts[leaveType]} hari
            <small>{COLLECTION_DAILY_LEAVE_TYPE_LABELS[leaveType]}</small>
          </span>
        ))}
      </div>
    </section>
  );
}
