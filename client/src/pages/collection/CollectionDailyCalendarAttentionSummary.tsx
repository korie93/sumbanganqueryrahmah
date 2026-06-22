import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { buildCollectionDailyCalendarAttentionSummary } from "@/pages/collection/collection-daily-calendar-attention-summary-utils";

type CollectionDailyCalendarAttentionSummaryProps = {
  days: CollectionDailyOverviewDay[];
  editableCalendarByDay: ReadonlyMap<number, EditableCalendarDay>;
  dirtyCalendarDayNumbers: ReadonlySet<number>;
};

export function CollectionDailyCalendarAttentionSummary({
  days,
  editableCalendarByDay,
  dirtyCalendarDayNumbers,
}: CollectionDailyCalendarAttentionSummaryProps) {
  const summary = buildCollectionDailyCalendarAttentionSummary({
    days,
    editableCalendarByDay,
    dirtyCalendarDayNumbers,
  });
  const Icon =
    summary.tone === "warning" ? AlertTriangle : summary.tone === "notice" ? Clock3 : CheckCircle2;

  return (
    <section
      className={`collection-daily-attention-summary collection-daily-attention-summary-${summary.tone}`}
      aria-label="Daily calendar attention summary"
    >
      <span className="collection-daily-attention-summary-icon" aria-hidden="true">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="collection-daily-attention-summary-copy">
        <p>{summary.title}</p>
        <span>{summary.description}</span>
      </div>
      <div className="collection-daily-attention-summary-chips" aria-label="Attention counts">
        <span>{summary.holidayWithCollectionCount} cuti ada kutipan</span>
        <span>{summary.workingWithoutCollectionCount} working tanpa kutipan</span>
        <span>{summary.unsavedChangesCount} belum save</span>
      </div>
    </section>
  );
}
