import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { LeaveTypeSelect } from "@/pages/collection/LeaveTypeSelect";
import type {
  CollectionDailyCalendarStatus,
  CollectionDailyLeaveType,
} from "@shared/collection-daily-status";

type DailyStatusFormProps = {
  day: EditableCalendarDay;
  label: string;
  onChange: (patch: Partial<EditableCalendarDay>) => void;
  compact?: boolean;
  disabled?: boolean;
};

function buildStatusPatch(status: CollectionDailyCalendarStatus): Partial<EditableCalendarDay> {
  if (status === "WORKING") {
    return {
      status,
      isWorkingDay: true,
      isHoliday: false,
      leaveType: null,
      note: "",
      holidayName: "",
    };
  }

  return {
    status,
    isWorkingDay: false,
    isHoliday: true,
  };
}

export function DailyStatusForm({
  day,
  label,
  onChange,
  compact = false,
  disabled = false,
}: DailyStatusFormProps) {
  const groupName = `collection-daily-status-${day.day}`;
  const workingId = `${groupName}-working`;
  const holidayId = `${groupName}-holiday`;
  const leaveTypeId = `${groupName}-leave-type`;
  const noteId = `${groupName}-note`;
  const status = day.status ?? (day.isHoliday ? "HOLIDAY" : "WORKING");
  const holidaySelected = status === "HOLIDAY";

  const setStatus = (nextStatus: CollectionDailyCalendarStatus) => {
    onChange(buildStatusPatch(nextStatus));
  };

  const setLeaveType = (leaveType: CollectionDailyLeaveType | null) => {
    onChange({
      leaveType,
      holidayName: leaveType ?? day.note ?? "",
    });
  };

  return (
    <fieldset
      className={cn(
        "collection-daily-status-fieldset space-y-3 rounded-xl border border-border/60 bg-background/80 p-3",
        compact ? "text-xs" : "text-sm",
      )}
      disabled={disabled}
    >
      <legend className="px-1 text-xs font-semibold text-foreground">{label}</legend>
      <div className={cn("grid gap-2", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-2 py-2 transition-colors",
            status === "WORKING" ? "bg-emerald-50 text-emerald-900" : "bg-muted/15",
          )}
          htmlFor={workingId}
        >
          <input
            id={workingId}
            name={groupName}
            type="radio"
            checked={status === "WORKING"}
            onChange={() => setStatus("WORKING")}
          />
          <span>Working</span>
        </label>
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-2 py-2 transition-colors",
            holidaySelected ? "bg-amber-50 text-amber-900" : "bg-muted/15",
          )}
          htmlFor={holidayId}
        >
          <input
            id={holidayId}
            name={groupName}
            type="radio"
            checked={holidaySelected}
            onChange={() => setStatus("HOLIDAY")}
          />
          <span>Holiday / Leave</span>
        </label>
      </div>

      {holidaySelected ? (
        <div className="grid gap-2">
          <div className="space-y-1">
            <Label htmlFor={leaveTypeId} className="text-xs">
              Leave type
            </Label>
            <LeaveTypeSelect
              id={leaveTypeId}
              value={day.leaveType ?? null}
              onChange={setLeaveType}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={noteId} className="text-xs">
              Note optional
            </Label>
            <Input
              id={noteId}
              value={day.note ?? ""}
              onChange={(event) =>
                onChange({
                  note: event.target.value,
                })
              }
              placeholder="Contoh: Annual leave"
              className="h-9 rounded-lg text-xs"
              maxLength={240}
            />
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
