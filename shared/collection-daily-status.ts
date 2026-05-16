export const COLLECTION_DAILY_CALENDAR_STATUSES = ["WORKING", "HOLIDAY"] as const;

export type CollectionDailyCalendarStatus = typeof COLLECTION_DAILY_CALENDAR_STATUSES[number];

export const COLLECTION_DAILY_LEAVE_TYPES = ["AL", "MC", "EL", "UL", "RL", "OFF"] as const;

export type CollectionDailyLeaveType = typeof COLLECTION_DAILY_LEAVE_TYPES[number];

export const COLLECTION_DAILY_LEAVE_TYPE_LABELS: Record<CollectionDailyLeaveType, string> = {
  AL: "Annual Leave",
  MC: "Medical Checkup / Medical Leave",
  EL: "Emergency Leave",
  UL: "Unpaid Leave",
  RL: "Replacement Leave",
  OFF: "Company Closed",
};

export function isCollectionDailyCalendarStatus(
  value: unknown,
): value is CollectionDailyCalendarStatus {
  return value === "WORKING" || value === "HOLIDAY";
}

export function isCollectionDailyLeaveType(value: unknown): value is CollectionDailyLeaveType {
  return (
    value === "AL"
    || value === "MC"
    || value === "EL"
    || value === "UL"
    || value === "RL"
    || value === "OFF"
  );
}
