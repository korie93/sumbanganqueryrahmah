export type EditableCalendarDay = {
  day: number;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string;
};

export function statusCardClass(status: "green" | "yellow" | "red" | "neutral") {
  if (status === "green") return "border-green-400/50 bg-green-50/70";
  if (status === "yellow") return "border-amber-400/60 bg-amber-50/70";
  if (status === "red") return "border-rose-400/50 bg-rose-50/70";
  return "border-slate-300/50 bg-slate-100/80";
}

export function statusLabel(status: "green" | "yellow" | "red" | "neutral") {
  if (status === "green") return "Target achieved";
  if (status === "yellow") return "Target not achieved";
  if (status === "red") return "No collection";
  return "Holiday / non-working";
}

export function statusTextClass(status: "green" | "yellow" | "red" | "neutral") {
  if (status === "green") return "text-green-700";
  if (status === "yellow") return "text-amber-700";
  if (status === "red") return "text-rose-700";
  return "text-slate-600";
}
