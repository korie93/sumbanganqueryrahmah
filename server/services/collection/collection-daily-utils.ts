export type CollectionDailyStatus = "green" | "yellow" | "red" | "neutral";

export type CollectionDailyCalendarInput = {
  day: number;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName?: string | null;
};

export type CollectionDailyTimelineDay = {
  day: number;
  date: string;
  amount: number;
  target: number;
  carryIn: number;
  carryOut: number;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  customerCount: number;
  status: CollectionDailyStatus;
};

export type CollectionDailyTimelineSummary = {
  monthlyTarget: number;
  collectedAmount: number;
  balancedAmount: number;
  workingDays: number;
  completedDays: number;
  incompleteDays: number;
  noCollectionDays: number;
  neutralDays: number;
  baseDailyTarget: number;
  dailyTarget: number;
};

export type CollectionDailyTimeline = {
  daysInMonth: number;
  days: CollectionDailyTimelineDay[];
  summary: CollectionDailyTimelineSummary;
};

type ComputeCollectionDailyTimelineParams = {
  year: number;
  month: number;
  monthlyTarget: number;
  calendarRows: CollectionDailyCalendarInput[];
  amountByDate: Map<string, number>;
  customerCountByDate?: Map<string, number>;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isDefaultWorkingDay(year: number, month: number, day: number): boolean {
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday !== 0 && weekday !== 6;
}

export function computeCollectionDailyTimeline({
  year,
  month,
  monthlyTarget,
  calendarRows,
  amountByDate,
  customerCountByDate = new Map<string, number>(),
}: ComputeCollectionDailyTimelineParams): CollectionDailyTimeline {
  const daysInMonth = new Date(year, month, 0).getDate();
  const calendarByDay = new Map<number, CollectionDailyCalendarInput>();
  for (const row of calendarRows) {
    calendarByDay.set(Number(row.day), row);
  }

  const workingFlags: boolean[] = [];
  let workingDays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const override = calendarByDay.get(day);
    const isWorkingDay = override
      ? Boolean(override.isWorkingDay) && !Boolean(override.isHoliday)
      : isDefaultWorkingDay(year, month, day);
    workingFlags.push(isWorkingDay);
    if (isWorkingDay) {
      workingDays += 1;
    }
  }

  const safeMonthlyTarget = roundMoney(Math.max(0, Number(monthlyTarget || 0)));
  const baseDailyTarget = workingDays > 0 ? roundMoney(safeMonthlyTarget / workingDays) : 0;

  let collectedAmount = 0;
  let completedDays = 0;
  let incompleteDays = 0;
  let noCollectionDays = 0;
  let neutralDays = 0;
  let carryForward = 0;

  const days: CollectionDailyTimelineDay[] = [];
  for (let index = 0; index < daysInMonth; index += 1) {
    const day = index + 1;
    const date = buildDateKey(year, month, day);
    const amount = roundMoney(Math.max(0, Number(amountByDate.get(date) || 0)));
    collectedAmount = roundMoney(collectedAmount + amount);

    const override = calendarByDay.get(day);
    const isWorkingDay = workingFlags[index];
    const carryIn = roundMoney(carryForward);
    const target = isWorkingDay ? roundMoney(Math.max(0, baseDailyTarget + carryIn)) : 0;

    let status: CollectionDailyStatus = "neutral";
    let carryOut = carryIn;
    if (!isWorkingDay) {
      status = "neutral";
      neutralDays += 1;
    } else if (amount <= 0) {
      status = "red";
      noCollectionDays += 1;
      carryOut = roundMoney(target - amount);
    } else if (amount < target) {
      status = "yellow";
      incompleteDays += 1;
      carryOut = roundMoney(target - amount);
    } else {
      status = "green";
      completedDays += 1;
      carryOut = roundMoney(target - amount);
    }

    carryForward = carryOut;

    days.push({
      day,
      date,
      amount,
      target,
      carryIn,
      carryOut,
      isWorkingDay,
      isHoliday: Boolean(override?.isHoliday),
      holidayName: override?.holidayName || null,
      customerCount: Number(customerCountByDate.get(date) || 0),
      status,
    });
  }

  return {
    daysInMonth,
    days,
    summary: {
      monthlyTarget: safeMonthlyTarget,
      collectedAmount,
      balancedAmount: roundMoney(Math.max(0, safeMonthlyTarget - collectedAmount)),
      workingDays,
      completedDays,
      incompleteDays,
      noCollectionDays,
      neutralDays,
      baseDailyTarget,
      dailyTarget: baseDailyTarget,
    },
  };
}
