import { parseCollectionAmountMyrNumber } from "../../../shared/collection-amount-types";

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
  collectedToDate: number;
  collectedAmount: number;
  remainingTarget: number;
  balancedAmount: number;
  workingDays: number;
  elapsedWorkingDays: number;
  remainingWorkingDays: number;
  requiredPerRemainingWorkingDay: number;
  completedDays: number;
  incompleteDays: number;
  noCollectionDays: number;
  neutralDays: number;
  baseDailyTarget: number;
  dailyTarget: number;
  expectedProgressAmount: number;
  progressVarianceAmount: number;
};

export type CollectionDailyTimeline = {
  daysInMonth: number;
  days: CollectionDailyTimelineDay[];
  summary: CollectionDailyTimelineSummary;
};

export type CollectionDailyOverviewSummary = CollectionDailyTimelineSummary & {
  achievedAmount: number;
  remainingAmount: number;
  metDays: number;
  yellowDays: number;
  redDays: number;
};

export type CollectionDailyTimelineAggregate = {
  daysInMonth: number;
  days: CollectionDailyTimelineDay[];
  summary: CollectionDailyOverviewSummary;
};

type ComputeCollectionDailyTimelineParams = {
  year: number;
  month: number;
  monthlyTarget: number;
  calendarRows: CollectionDailyCalendarInput[];
  amountByDate: Map<string, number>;
  customerCountByDate?: Map<string, number>;
  referenceDate?: Date;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getRequiredPerRemainingWorkingDay(
  remainingTarget: number,
  remainingWorkingDays: number,
): number {
  if (remainingWorkingDays <= 0) return 0;
  return roundMoney(Math.max(0, remainingTarget) / remainingWorkingDays);
}

function buildDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isDefaultWorkingDay(year: number, month: number, day: number): boolean {
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday !== 0 && weekday !== 6;
}

function getElapsedWorkingDaysCount(
  year: number,
  month: number,
  workingFlags: boolean[],
  referenceDate: Date,
): number {
  const daysInMonth = workingFlags.length;
  const referenceYear = referenceDate.getFullYear();
  const referenceMonth = referenceDate.getMonth() + 1;
  const referenceDay = referenceDate.getDate();

  if (referenceYear < year || (referenceYear === year && referenceMonth < month)) {
    return 0;
  }

  const effectiveLastDay =
    referenceYear > year || (referenceYear === year && referenceMonth > month)
      ? daysInMonth
      : Math.min(daysInMonth, Math.max(0, referenceDay));

  let elapsedWorkingDays = 0;
  for (let day = 1; day <= effectiveLastDay; day += 1) {
    if (workingFlags[day - 1]) {
      elapsedWorkingDays += 1;
    }
  }

  return elapsedWorkingDays;
}

export function getCollectionDailyStatus(params: {
  isWorkingDay: boolean;
  amount: number;
  target: number;
}): CollectionDailyStatus {
  const amount = roundMoney(Math.max(0, parseCollectionAmountMyrNumber(params.amount || 0)));
  const target = roundMoney(Math.max(0, parseCollectionAmountMyrNumber(params.target || 0)));
  if (!params.isWorkingDay) {
    return "neutral";
  }
  if (target <= 0) {
    return amount > 0 ? "green" : "neutral";
  }
  if (amount <= 0) {
    return "red";
  }
  if (amount < target) {
    return "yellow";
  }
  return "green";
}

export function getCollectionDailyStatusMessage(status: CollectionDailyStatus): string {
  if (status === "neutral") return "Holiday / non-working day or no required target for this day.";
  if (status === "red") return "No collection on this working day.";
  if (status === "yellow") return "Collection recorded but daily target not achieved.";
  return "Daily target achieved.";
}

function buildEmptyCollectionDailyOverviewSummary(): CollectionDailyOverviewSummary {
  return {
    monthlyTarget: 0,
    collectedToDate: 0,
    collectedAmount: 0,
    remainingTarget: 0,
    balancedAmount: 0,
    workingDays: 0,
    elapsedWorkingDays: 0,
    remainingWorkingDays: 0,
    requiredPerRemainingWorkingDay: 0,
    completedDays: 0,
    incompleteDays: 0,
    noCollectionDays: 0,
    neutralDays: 0,
    baseDailyTarget: 0,
    dailyTarget: 0,
    expectedProgressAmount: 0,
    progressVarianceAmount: 0,
    achievedAmount: 0,
    remainingAmount: 0,
    metDays: 0,
    yellowDays: 0,
    redDays: 0,
  };
}

export function aggregateCollectionDailyTimelines(
  timelines: CollectionDailyTimeline[],
): CollectionDailyTimelineAggregate {
  if (timelines.length === 0) {
    return {
      daysInMonth: 0,
      days: [],
      summary: buildEmptyCollectionDailyOverviewSummary(),
    };
  }

  const daysInMonth = timelines[0]?.daysInMonth || 0;
  let completedDays = 0;
  let incompleteDays = 0;
  let noCollectionDays = 0;
  let neutralDays = 0;

  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const dayEntries = timelines
      .map((timeline) => timeline.days[index])
      .filter((entry): entry is CollectionDailyTimelineDay => Boolean(entry));
    const sample = dayEntries[0];
    const amount = roundMoney(dayEntries.reduce((sum, entry) => sum + entry.amount, 0));
    const target = roundMoney(dayEntries.reduce((sum, entry) => sum + entry.target, 0));
    const carryIn = roundMoney(dayEntries.reduce((sum, entry) => sum + entry.carryIn, 0));
    const carryOut = roundMoney(dayEntries.reduce((sum, entry) => sum + entry.carryOut, 0));
    const customerCount = dayEntries.reduce((sum, entry) => sum + entry.customerCount, 0);
    const status = getCollectionDailyStatus({
      isWorkingDay: sample?.isWorkingDay ?? false,
      amount,
      target,
    });

    if (status === "green") completedDays += 1;
    else if (status === "yellow") incompleteDays += 1;
    else if (status === "red") noCollectionDays += 1;
    else neutralDays += 1;

    return {
      day: sample?.day ?? index + 1,
      date:
        sample?.date
        || `0000-00-${String(index + 1).padStart(2, "0")}`,
      amount,
      target,
      carryIn,
      carryOut,
      isWorkingDay: sample?.isWorkingDay ?? false,
      isHoliday: sample?.isHoliday ?? false,
      holidayName: sample?.holidayName ?? null,
      customerCount,
      status,
    };
  });

  const monthlyTarget = roundMoney(
    timelines.reduce((sum, timeline) => sum + timeline.summary.monthlyTarget, 0),
  );
  const collectedAmount = roundMoney(
    timelines.reduce((sum, timeline) => sum + timeline.summary.collectedAmount, 0),
  );
  const balancedAmount = roundMoney(Math.max(0, monthlyTarget - collectedAmount));
  const baseDailyTarget = roundMoney(
    timelines.reduce((sum, timeline) => sum + timeline.summary.baseDailyTarget, 0),
  );
  const expectedProgressAmount = roundMoney(
    timelines.reduce((sum, timeline) => sum + timeline.summary.expectedProgressAmount, 0),
  );
  const progressVarianceAmount = roundMoney(collectedAmount - expectedProgressAmount);
  const workingDays = timelines[0]?.summary.workingDays || 0;
  const elapsedWorkingDays = timelines[0]?.summary.elapsedWorkingDays || 0;
  const remainingWorkingDays = timelines[0]?.summary.remainingWorkingDays || 0;
  const requiredPerRemainingWorkingDay = getRequiredPerRemainingWorkingDay(
    balancedAmount,
    remainingWorkingDays,
  );

  return {
    daysInMonth,
    days,
    summary: {
      monthlyTarget,
      collectedToDate: collectedAmount,
      collectedAmount,
      remainingTarget: balancedAmount,
      balancedAmount,
      workingDays,
      elapsedWorkingDays,
      remainingWorkingDays,
      requiredPerRemainingWorkingDay,
      completedDays,
      incompleteDays,
      noCollectionDays,
      neutralDays,
      baseDailyTarget,
      dailyTarget: baseDailyTarget,
      expectedProgressAmount,
      progressVarianceAmount,
      achievedAmount: collectedAmount,
      remainingAmount: balancedAmount,
      metDays: completedDays,
      yellowDays: incompleteDays,
      redDays: noCollectionDays,
    },
  };
}

export function computeCollectionDailyTimeline({
  year,
  month,
  monthlyTarget,
  calendarRows,
  amountByDate,
  customerCountByDate = new Map<string, number>(),
  referenceDate = new Date(),
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

  const safeMonthlyTarget = roundMoney(Math.max(0, parseCollectionAmountMyrNumber(monthlyTarget || 0)));
  const baseDailyTarget = workingDays > 0 ? roundMoney(safeMonthlyTarget / workingDays) : 0;
  const elapsedWorkingDays = getElapsedWorkingDaysCount(year, month, workingFlags, referenceDate);
  const remainingWorkingDays = Math.max(0, workingDays - elapsedWorkingDays);

  let collectedAmount = 0;
  let completedDays = 0;
  let incompleteDays = 0;
  let noCollectionDays = 0;
  let neutralDays = 0;
  let workingDaysElapsedInMonth = 0;

  const days: CollectionDailyTimelineDay[] = [];
  for (let index = 0; index < daysInMonth; index += 1) {
    const day = index + 1;
    const date = buildDateKey(year, month, day);
    const collectedBeforeDay = collectedAmount;
    const amount = roundMoney(Math.max(0, parseCollectionAmountMyrNumber(amountByDate.get(date) || 0)));
    const override = calendarByDay.get(day);
    const isWorkingDay = workingFlags[index];
    if (isWorkingDay) {
      workingDaysElapsedInMonth += 1;
    }
    const elapsedBeforeDay = isWorkingDay
      ? Math.max(0, workingDaysElapsedInMonth - 1)
      : workingDaysElapsedInMonth;
    const expectedBeforeDay = roundMoney(
      Math.min(safeMonthlyTarget, baseDailyTarget * elapsedBeforeDay),
    );
    const carryIn = roundMoney(Math.max(0, expectedBeforeDay - collectedBeforeDay));
    const remainingTargetBeforeDay = roundMoney(
      Math.max(0, safeMonthlyTarget - collectedBeforeDay),
    );
    const remainingWorkingDaysIncludingToday = isWorkingDay
      ? Math.max(1, workingDays - elapsedBeforeDay)
      : 0;
    const target = isWorkingDay
      ? getRequiredPerRemainingWorkingDay(remainingTargetBeforeDay, remainingWorkingDaysIncludingToday)
      : 0;
    const status = getCollectionDailyStatus({ isWorkingDay, amount, target });
    collectedAmount = roundMoney(collectedBeforeDay + amount);
    const expectedAfterDay = roundMoney(
      Math.min(safeMonthlyTarget, baseDailyTarget * workingDaysElapsedInMonth),
    );
    const carryOut = roundMoney(Math.max(0, expectedAfterDay - collectedAmount));
    if (status === "neutral") {
      neutralDays += 1;
    } else if (status === "red") {
      noCollectionDays += 1;
    } else if (status === "yellow") {
      incompleteDays += 1;
    } else {
      completedDays += 1;
    }

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

  const remainingTarget = roundMoney(Math.max(0, safeMonthlyTarget - collectedAmount));
  const expectedProgressAmount = roundMoney(
    Math.min(safeMonthlyTarget, baseDailyTarget * elapsedWorkingDays),
  );

  return {
    daysInMonth,
    days,
    summary: {
      monthlyTarget: safeMonthlyTarget,
      collectedToDate: collectedAmount,
      collectedAmount,
      remainingTarget,
      balancedAmount: remainingTarget,
      workingDays,
      elapsedWorkingDays,
      remainingWorkingDays,
      requiredPerRemainingWorkingDay: getRequiredPerRemainingWorkingDay(
        remainingTarget,
        remainingWorkingDays,
      ),
      completedDays,
      incompleteDays,
      noCollectionDays,
      neutralDays,
      baseDailyTarget,
      dailyTarget: baseDailyTarget,
      expectedProgressAmount,
      progressVarianceAmount: roundMoney(
        collectedAmount - expectedProgressAmount,
      ),
    },
  };
}
