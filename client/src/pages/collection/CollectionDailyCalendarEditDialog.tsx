import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { CollectionDailyCalendarEditPanel } from "@/pages/collection/CollectionDailyCalendarEditPanel";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

type CollectionDailyCalendarEditDialogProps = {
  open: boolean;
  day: CollectionDailyOverviewDay | null;
  editableDay: EditableCalendarDay | null;
  isDirty: boolean;
  savingCalendar: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveCalendar: () => void;
  onChange: (patch: Partial<EditableCalendarDay>) => void;
  onViewDetails: (date: string) => void;
};

export function CollectionDailyCalendarEditDialog({
  open,
  day,
  editableDay,
  isDirty,
  savingCalendar,
  onOpenChange,
  onSaveCalendar,
  onChange,
  onViewDetails,
}: CollectionDailyCalendarEditDialogProps) {
  const title = day
    ? `Edit status ${formatDateDDMMYYYY(day.date)}`
    : "Edit daily status";
  const handleViewDetails = (date: string) => {
    onOpenChange(false);
    onViewDetails(date);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="collection-daily-edit-dialog gap-4 p-0 sm:max-w-[36rem]">
        <DialogHeader className="border-b border-border/60 px-4 py-4 pr-12 text-left sm:px-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Update Working atau Holiday/Leave untuk nickname yang dipilih sahaja.
          </DialogDescription>
        </DialogHeader>

        <div className="collection-daily-edit-dialog-body px-4 pb-4 sm:px-5 sm:pb-5">
          <CollectionDailyCalendarEditPanel
            day={day}
            editableDay={editableDay}
            canManage={open}
            isDirty={isDirty}
            savingCalendar={savingCalendar}
            variant="dialog"
            onSaveCalendar={onSaveCalendar}
            onChange={onChange}
            onViewDetails={handleViewDetails}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
