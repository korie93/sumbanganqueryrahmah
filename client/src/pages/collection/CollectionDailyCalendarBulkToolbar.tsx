import { CalendarDays, CheckSquare, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { LeaveTypeSelect } from "@/pages/collection/LeaveTypeSelect";
import {
  DEFAULT_COLLECTION_DAILY_BULK_DRAFT,
  buildCollectionDailyBulkPatch,
  getCollectionDailyBulkSelectableDays,
  hasCollectionDailyBulkDraftError,
  type CollectionDailyCalendarBulkDraft,
} from "@/pages/collection/collection-daily-calendar-bulk-utils";

type CollectionDailyCalendarBulkToolbarProps = {
  days: CollectionDailyOverviewDay[];
  selectedDayNumbers: ReadonlySet<number>;
  onSelectDays: (dayNumbers: number[]) => void;
  onClearSelection: () => void;
  onApply: (dayNumbers: number[], patch: ReturnType<typeof buildCollectionDailyBulkPatch>) => void;
};

export function CollectionDailyCalendarBulkToolbar({
  days,
  selectedDayNumbers,
  onSelectDays,
  onClearSelection,
  onApply,
}: CollectionDailyCalendarBulkToolbarProps) {
  const [draft, setDraft] = useState<CollectionDailyCalendarBulkDraft>(
    DEFAULT_COLLECTION_DAILY_BULK_DRAFT,
  );
  const selectableDays = getCollectionDailyBulkSelectableDays(days);
  const hasError = hasCollectionDailyBulkDraftError(selectedDayNumbers, draft);
  const selectedDays = Array.from(selectedDayNumbers).sort((left, right) => left - right);

  return (
    <section
      className="collection-daily-bulk-toolbar"
      aria-label="Bulk daily status update"
      data-floating-ai-avoid="true"
    >
      <div className="collection-daily-bulk-toolbar-header">
        <div>
          <p className="collection-daily-bulk-toolbar-kicker">Bulk update</p>
          <h3 className="collection-daily-bulk-toolbar-title">Set status untuk banyak tarikh</h3>
          <p className="collection-daily-bulk-toolbar-description">
            Pilih tarikh di calendar, preview perubahan, kemudian save bersama perubahan lain.
          </p>
        </div>
        <div className="collection-daily-bulk-toolbar-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => onSelectDays(selectableDays)}
          >
            <CheckSquare className="mr-2 h-4 w-4" aria-hidden="true" />
            Pilih semua
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl"
            onClick={onClearSelection}
            disabled={selectedDayNumbers.size === 0}
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Clear
          </Button>
        </div>
      </div>

      <div className="collection-daily-bulk-toolbar-grid">
        <div className="space-y-1">
          <Label htmlFor="collection-daily-bulk-status" className="text-xs">
            Status
          </Label>
          <select
            id="collection-daily-bulk-status"
            aria-label="Bulk daily status"
            title="Bulk daily status"
            value={draft.status}
            onChange={(event) => {
              const status = event.target.value === "WORKING" ? "WORKING" : "HOLIDAY";
              setDraft((previous) => ({
                ...previous,
                status,
                leaveType: status === "WORKING" ? null : previous.leaveType ?? "OFF",
                note: status === "WORKING" ? "" : previous.note,
              }));
            }}
            className="collection-daily-bulk-toolbar-select"
          >
            <option value="HOLIDAY">Holiday / Leave</option>
            <option value="WORKING">Working</option>
          </select>
        </div>

        {draft.status === "HOLIDAY" ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="collection-daily-bulk-leave-type" className="text-xs">
                Leave type
              </Label>
              <LeaveTypeSelect
                id="collection-daily-bulk-leave-type"
                value={draft.leaveType}
                onChange={(leaveType) => setDraft((previous) => ({ ...previous, leaveType }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="collection-daily-bulk-note" className="text-xs">
                Note optional
              </Label>
              <Input
                id="collection-daily-bulk-note"
                value={draft.note}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, note: event.target.value }))
                }
                placeholder="Contoh: Company closed"
                className="h-9 rounded-lg text-xs"
                maxLength={240}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="collection-daily-bulk-toolbar-footer">
        <p className="collection-daily-bulk-toolbar-selection" aria-live="polite" aria-atomic="true">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {selectedDayNumbers.size > 0
            ? `${selectedDayNumbers.size} tarikh dipilih: ${selectedDays.join(", ")}`
            : "Belum ada tarikh dipilih."}
        </p>
        <Button
          type="button"
          className="rounded-xl"
          onClick={() => onApply(selectedDays, buildCollectionDailyBulkPatch(draft))}
          disabled={hasError}
        >
          Apply to selected days
        </Button>
      </div>
    </section>
  );
}
