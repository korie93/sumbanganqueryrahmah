export type CollectionSameDayPaceDailyInput = {
  day: number;
  date?: string | undefined;
  amount: number;
  customerCount?: number | undefined;
  isWorkingDay?: boolean | null | undefined;
  isHoliday?: boolean | null | undefined;
  holidayName?: string | null | undefined;
};

export type CollectionSameDayPaceDayRange = {
  startDay: number;
  endDay: number;
};

export type CollectionSameDayPaceCalendarStatus = {
  label: string;
  description: string;
  isWorkingDay: boolean | null;
  isHoliday: boolean;
  holidayName: string | null;
  tone: "working" | "non_working" | "unknown";
};

export type CollectionSameDayPacePoint = {
  day: number;
  rangeIndex: number;
  currentDate: string;
  previousDate: string;
  currentAmount: number;
  previousAmount: number;
  currentCumulative: number;
  previousCumulative: number;
  dailyDifference: number;
  cumulativeDifference: number;
  currentStatus: CollectionSameDayPaceCalendarStatus;
  previousStatus: CollectionSameDayPaceCalendarStatus;
};

export type CollectionSameDayPaceMomentum = {
  direction: "accelerating" | "slowing" | "steady" | "insufficient_data";
  splitDay: number;
  firstHalfAverage: number;
  secondHalfAverage: number;
  percentageChange: number | null;
  label: string;
  description: string;
};

export type CollectionSameDayPaceConsistency = {
  status: "consistent" | "mixed" | "inconsistent" | "no_data";
  coefficient: number | null;
  label: string;
  description: string;
};

export type CollectionSameDayPaceTarget = {
  monthlyTargetAmount: number;
  expectedByToday: number;
  expectedProgress: number;
  paceGap: number;
  projectedTotal: number;
  projectedTargetGap: number;
  requiredDailyAverageToTarget: number;
  status: "on_track" | "behind" | "needs_consistency";
  label: string;
};

export type CollectionSameDayPaceComparison = {
  currentMonth: string;
  previousMonth: string;
  currentLabel: string;
  previousLabel: string;
  startDay: number;
  endDay: number;
  comparisonDay: number;
  comparedDayCount: number;
  currentRangeLabel: string;
  previousRangeLabel: string;
  totalDaysInCurrentMonth: number;
  totalDaysInPreviousMonth: number;
  rangeCappedByPreviousMonth: boolean;
  currentMonthlyTargetAmount: number | null;
  previousMonthlyTargetAmount: number | null;
  currentTotal: number;
  previousTotal: number;
  difference: number;
  percentageChange: number | null;
  direction: "faster" | "slower" | "flat" | "no_previous_data";
  headline: string;
  summary: string;
  currentDailyAverage: number;
  previousDailyAverage: number;
  dailyAverageDifference: number;
  dailyAveragePercentageChange: number | null;
  momentum: CollectionSameDayPaceMomentum;
  consistency: CollectionSameDayPaceConsistency;
  target: CollectionSameDayPaceTarget | null;
  points: CollectionSameDayPacePoint[];
  insights: string[];
};