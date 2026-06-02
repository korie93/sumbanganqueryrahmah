import {
  COLLECTION_DAILY_LEAVE_TYPE_LABELS,
  COLLECTION_DAILY_LEAVE_TYPES,
  type CollectionDailyLeaveType,
} from "@shared/collection-daily-status";
import { cn } from "@/lib/utils";

type LeaveTypeSelectProps = {
  id: string;
  value: CollectionDailyLeaveType | null;
  onChange: (value: CollectionDailyLeaveType | null) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function LeaveTypeSelect({
  id,
  value,
  onChange,
  disabled = false,
  required = false,
  className,
}: LeaveTypeSelectProps) {
  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(event) => {
        const nextValue = event.target.value as CollectionDailyLeaveType | "";
        onChange(nextValue ? nextValue : null);
      }}
      disabled={disabled}
      required={required}
      aria-label="Leave type"
      className={cn(
        "h-9 w-full rounded-lg border border-input bg-background px-2 text-xs text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      aria-required={required}
    >
      <option value="">Pilih leave type</option>
      {COLLECTION_DAILY_LEAVE_TYPES.map((leaveType) => (
        <option key={leaveType} value={leaveType}>
          {leaveType} - {COLLECTION_DAILY_LEAVE_TYPE_LABELS[leaveType]}
        </option>
      ))}
    </select>
  );
}
