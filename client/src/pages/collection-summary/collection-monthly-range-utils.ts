import {
  formatCollectionMonthInput,
  shiftCollectionMonthInput,
} from "./collection-monthly-format-utils";

export type CollectionMonthlyComparisonPresetRange = {
  id: "last-3" | "last-6" | "year-to-date" | "previous-year";
  label: string;
  startMonth: string;
  endMonth: string;
};

export function buildDefaultCollectionMonthlyComparisonRange(referenceDate = new Date()) {
  const endMonth = formatCollectionMonthInput(referenceDate);
  const startMonth = shiftCollectionMonthInput(endMonth, -1);
  return {
    startMonth,
    endMonth,
  };
}

export function buildCollectionMonthlyComparisonPresetRanges(
  referenceDate = new Date(),
): CollectionMonthlyComparisonPresetRange[] {
  const currentMonth = formatCollectionMonthInput(referenceDate);
  const currentYear = referenceDate.getFullYear();

  return [
    {
      id: "last-3",
      label: "Last 3 months",
      startMonth: shiftCollectionMonthInput(currentMonth, -2),
      endMonth: currentMonth,
    },
    {
      id: "last-6",
      label: "Last 6 months",
      startMonth: shiftCollectionMonthInput(currentMonth, -5),
      endMonth: currentMonth,
    },
    {
      id: "year-to-date",
      label: "Year to date",
      startMonth: `${currentYear}-01`,
      endMonth: currentMonth,
    },
    {
      id: "previous-year",
      label: "Previous year",
      startMonth: `${currentYear - 1}-01`,
      endMonth: `${currentYear - 1}-12`,
    },
  ];
}
