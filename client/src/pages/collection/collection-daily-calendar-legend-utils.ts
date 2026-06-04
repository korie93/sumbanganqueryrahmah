import {
  COLLECTION_DAILY_LEAVE_TYPE_LABELS,
  COLLECTION_DAILY_LEAVE_TYPES,
  type CollectionDailyLeaveType,
} from "@shared/collection-daily-status";

export type CollectionDailyCalendarLegendItem = {
  code?: string;
  label: string;
  detail: string;
  className: string;
  dotClassName?: string;
};

export const COLLECTION_DAILY_RESULT_LEGEND_ITEMS: readonly CollectionDailyCalendarLegendItem[] = [
  {
    label: "No collection",
    detail: "No collection recorded",
    className: "border-rose-300/60 bg-rose-50/70 text-rose-700 dark:bg-rose-950/25 dark:text-rose-200",
    dotClassName: "bg-rose-500",
  },
  {
    label: "Below target",
    detail: "Collection exists but daily target is not achieved",
    className: "border-amber-300/60 bg-amber-50/70 text-amber-700 dark:bg-amber-950/25 dark:text-amber-200",
    dotClassName: "bg-amber-500",
  },
  {
    label: "Target achieved",
    detail: "Daily target achieved",
    className: "border-green-300/60 bg-green-50/70 text-green-700 dark:bg-green-950/25 dark:text-green-200",
    dotClassName: "bg-green-500",
  },
  {
    label: "Holiday / Leave",
    detail: "Holiday, leave, or company OFF day",
    className: "border-slate-300/60 bg-slate-100/80 text-slate-700 dark:border-border/70 dark:bg-card dark:text-card-foreground",
    dotClassName: "bg-slate-500",
  },
  {
    label: "Conflict",
    detail: "Holiday/OFF day still has collection activity",
    className: "border-orange-300/70 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-100",
    dotClassName: "bg-orange-500",
  },
] as const;

function getLeaveLegendClassName(leaveType: CollectionDailyLeaveType) {
  if (leaveType === "OFF") {
    return "border-slate-400/60 bg-slate-100 text-slate-800 dark:border-border/70 dark:bg-card dark:text-card-foreground";
  }

  if (leaveType === "MC") {
    return "border-sky-300/70 bg-sky-50 text-sky-800 dark:bg-sky-950/35 dark:text-sky-100";
  }

  if (leaveType === "EL") {
    return "border-rose-300/70 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-100";
  }

  return "border-violet-300/70 bg-violet-50 text-violet-800 dark:bg-violet-950/30 dark:text-violet-100";
}

export const COLLECTION_DAILY_STATUS_CODE_LEGEND_ITEMS: readonly CollectionDailyCalendarLegendItem[] = [
  {
    code: "WORK",
    label: "Working",
    detail: "Normal working day",
    className: "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100",
  },
  ...COLLECTION_DAILY_LEAVE_TYPES.map((leaveType) => ({
    code: leaveType,
    label: COLLECTION_DAILY_LEAVE_TYPE_LABELS[leaveType],
    detail:
      leaveType === "OFF"
        ? "Company closed for the selected staff/day"
        : COLLECTION_DAILY_LEAVE_TYPE_LABELS[leaveType],
    className: getLeaveLegendClassName(leaveType),
  })),
] as const;
