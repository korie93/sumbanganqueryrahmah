/** Adjacent dates are bounded by the loaded month, not by the active quick filter. */
export function getCollectionDailyAdjacentDates(
  days: readonly { date: string }[],
  selectedDate: string | null,
) {
  if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return { previousDate: null, nextDate: null };
  }
  const monthPrefix = selectedDate.slice(0, 7);
  const dates = [...new Set(days.map((day) => day.date))]
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(0, 7) === monthPrefix)
    .sort();
  const index = dates.indexOf(selectedDate);
  return {
    previousDate: index > 0 ? dates[index - 1] : null,
    nextDate: index >= 0 && index < dates.length - 1 ? dates[index + 1] : null,
  };
}
