import { AlertCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { buildCollectionDailyCalendarChangeReviewItems } from "@/pages/collection/collection-daily-calendar-change-review-utils";

type CollectionDailyCalendarChangeReviewProps = {
  days: CollectionDailyOverviewDay[];
  editableCalendarByDay: ReadonlyMap<number, EditableCalendarDay>;
  dirtyCalendarDayNumbers: ReadonlySet<number>;
  savingCalendar: boolean;
  onSaveCalendar: () => void;
};

const MAX_VISIBLE_CHANGES = 4;

export function CollectionDailyCalendarChangeReview({
  days,
  editableCalendarByDay,
  dirtyCalendarDayNumbers,
  savingCalendar,
  onSaveCalendar,
}: CollectionDailyCalendarChangeReviewProps) {
  const items = buildCollectionDailyCalendarChangeReviewItems({
    days,
    editableCalendarByDay,
    dirtyCalendarDayNumbers,
  });

  if (!items.length) {
    return null;
  }

  const blockedByMissingLeaveType = items.some((item) => item.missingLeaveType);
  const hasConflict = items.some((item) => item.hasCollectionConflict);
  const visibleItems = items.slice(0, MAX_VISIBLE_CHANGES);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <section
      className="collection-daily-calendar-change-review"
      aria-label="Semakan perubahan status harian belum disimpan"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="collection-daily-calendar-change-review-header">
        <div className="min-w-0">
          <p className="collection-daily-calendar-change-review-kicker">
            {items.length} perubahan belum disimpan
          </p>
          <h3 className="collection-daily-calendar-change-review-title">
            Semak status sebelum simpan
          </h3>
          <p className="collection-daily-calendar-change-review-description">
            Save hanya update tarikh ini untuk nickname yang sedang dipilih.
          </p>
        </div>
        <Button
          type="button"
          className="collection-daily-calendar-change-review-save"
          onClick={onSaveCalendar}
          disabled={savingCalendar || blockedByMissingLeaveType}
        >
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          Simpan perubahan
        </Button>
      </div>

      <ul className="collection-daily-calendar-change-review-list">
        {visibleItems.map((item) => (
          <li key={item.day} className="collection-daily-calendar-change-review-item">
            <span className="collection-daily-calendar-change-review-date">
              {formatDateDDMMYYYY(item.date)}
            </span>
            <span className="collection-daily-calendar-change-review-status">
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            {item.note ? (
              <span className="collection-daily-calendar-change-review-note">{item.note}</span>
            ) : null}
            {item.hasCollectionConflict ? (
              <span className="collection-daily-calendar-change-review-conflict">
                Ada kutipan pada tarikh ini.
              </span>
            ) : null}
          </li>
        ))}
        {hiddenCount > 0 ? (
          <li className="collection-daily-calendar-change-review-more">
            +{hiddenCount} lagi perubahan status
          </li>
        ) : null}
      </ul>

      {blockedByMissingLeaveType ? (
        <p className="collection-daily-calendar-change-review-warning">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          Pilih leave type untuk semua Holiday/Leave sebelum simpan.
        </p>
      ) : null}
      {hasConflict ? (
        <p className="collection-daily-calendar-change-review-warning">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          Ada tarikh yang masih mempunyai kutipan. Semak sebelum simpan sebagai cuti/OFF.
        </p>
      ) : null}
    </section>
  );
}
