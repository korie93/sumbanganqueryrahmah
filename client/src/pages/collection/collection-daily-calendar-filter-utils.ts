import type { CollectionDailyOverviewDay } from "@/lib/api";

export const COLLECTION_DAILY_CALENDAR_FILTERS = [
  "all",
  "working",
  "holiday",
  "off",
  "unsaved",
] as const;

export type CollectionDailyCalendarFilter = typeof COLLECTION_DAILY_CALENDAR_FILTERS[number];

export type CollectionDailyCalendarFilterOption = {
  id: CollectionDailyCalendarFilter;
  label: string;
  count: number;
  description: string;
};

export function matchesCollectionDailyCalendarFilter(
  day: CollectionDailyOverviewDay,
  filter: CollectionDailyCalendarFilter,
  dirtyCalendarDayNumbers: ReadonlySet<number>,
) {
  if (filter === "all") return true;
  if (filter === "working") return day.calendarStatus === "WORKING";
  if (filter === "holiday") return day.calendarStatus === "HOLIDAY";
  if (filter === "off") return day.calendarStatus === "HOLIDAY" && day.leaveType === "OFF";
  return dirtyCalendarDayNumbers.has(day.day);
}

export function filterCollectionDailyCalendarDays(
  days: CollectionDailyOverviewDay[],
  filter: CollectionDailyCalendarFilter,
  dirtyCalendarDayNumbers: ReadonlySet<number>,
) {
  if (filter === "all") return days;
  return days.filter((day) =>
    matchesCollectionDailyCalendarFilter(day, filter, dirtyCalendarDayNumbers),
  );
}

export function countCollectionDailyCalendarFilterMatches(
  days: CollectionDailyOverviewDay[],
  filter: CollectionDailyCalendarFilter,
  dirtyCalendarDayNumbers: ReadonlySet<number>,
) {
  return filterCollectionDailyCalendarDays(days, filter, dirtyCalendarDayNumbers).length;
}

export function buildCollectionDailyCalendarFilterOptions(
  days: CollectionDailyOverviewDay[],
  dirtyCalendarDayNumbers: ReadonlySet<number>,
  canManage: boolean,
): CollectionDailyCalendarFilterOption[] {
  const options: CollectionDailyCalendarFilterOption[] = [
    {
      id: "all",
      label: "All",
      count: days.length,
      description: "Show every day in the selected month.",
    },
    {
      id: "working",
      label: "Working",
      count: countCollectionDailyCalendarFilterMatches(days, "working", dirtyCalendarDayNumbers),
      description: "Show normal working days.",
    },
    {
      id: "holiday",
      label: "Holiday / Leave",
      count: countCollectionDailyCalendarFilterMatches(days, "holiday", dirtyCalendarDayNumbers),
      description: "Show holiday, leave, and OFF days.",
    },
    {
      id: "off",
      label: "OFF",
      count: countCollectionDailyCalendarFilterMatches(days, "off", dirtyCalendarDayNumbers),
      description: "Show company closed days.",
    },
  ];

  if (canManage) {
    options.push({
      id: "unsaved",
      label: "Unsaved",
      count: countCollectionDailyCalendarFilterMatches(days, "unsaved", dirtyCalendarDayNumbers),
      description: "Show days with unsaved status changes.",
    });
  }

  return options;
}

export function getCollectionDailyCalendarFilterStatusText(
  filter: CollectionDailyCalendarFilter,
  matchingCount: number,
  totalDays: number,
) {
  if (filter === "all") {
    return `Showing all ${totalDays} days.`;
  }

  return `${matchingCount} of ${totalDays} days match this filter.`;
}
