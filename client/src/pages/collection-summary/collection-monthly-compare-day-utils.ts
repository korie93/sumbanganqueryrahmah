import {
  getCollectionDaysInMonth,
  parseCollectionMonthKey,
  shiftCollectionMonthInput,
} from "./collection-monthly-format-utils";

export type CollectionSameDayPaceComparisonMode =
  | "selected-start-month"
  | "previous-month"
  | "previous-year";

export type CollectionSameDayPaceWindowMode =
  | "cumulative"
  | "single-day"
  | "custom-range";

export type CollectionSameDayPaceQuickOptionId =
  | "today"
  | "yesterday"
  | "current-day-of-month"
  | "end-of-month-simulation"
  | "same-day-previous-month"
  | "same-day-previous-year"
  | "last-collection-day"
  | "best-current-day"
  | "weakest-current-day";

export type CollectionSameDayPaceDayRangeLike = {
  startDay: number;
  endDay: number;
};

export type CollectionSameDayPaceDayOption = {
  value: number;
  label: string;
};

export type CollectionSameDayPaceQuickOption = {
  id: CollectionSameDayPaceQuickOptionId;
  label: string;
  description: string;
  comparisonMode?: CollectionSameDayPaceComparisonMode | undefined;
  windowMode?: CollectionSameDayPaceWindowMode | undefined;
  range?: CollectionSameDayPaceDayRangeLike | undefined;
  disabled?: boolean | undefined;
};

type CollectionSameDayPaceQuickPoint = {
  day: number;
  currentAmount: number;
};

function getLocalReferenceMonthKey(referenceDate: Date): string | null {
  if (!Number.isFinite(referenceDate.getTime())) {
    return null;
  }

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getSafeReferenceDay(referenceDate: Date): number | null {
  if (!Number.isFinite(referenceDate.getTime())) {
    return null;
  }

  return Math.max(1, Math.trunc(referenceDate.getDate()));
}

export function resolveCollectionSameDayPaceComparisonMonthKey(input: {
  currentMonthKey: string;
  selectedBaseMonthKey?: string | null | undefined;
  comparisonMode: CollectionSameDayPaceComparisonMode;
}): string | null {
  const currentMonth = parseCollectionMonthKey(input.currentMonthKey);
  if (!currentMonth) {
    return null;
  }

  if (input.comparisonMode === "previous-month") {
    return shiftCollectionMonthInput(input.currentMonthKey, -1);
  }

  if (input.comparisonMode === "previous-year") {
    return shiftCollectionMonthInput(input.currentMonthKey, -12);
  }

  const selectedBaseMonthKey = String(input.selectedBaseMonthKey || "").trim();
  return parseCollectionMonthKey(selectedBaseMonthKey)
    ? selectedBaseMonthKey
    : shiftCollectionMonthInput(input.currentMonthKey, -1);
}

export function resolveCollectionSameDayPaceMaxDay(input: {
  currentMonthKey: string;
  comparisonMonthKey: string;
}): number {
  const currentMonth = parseCollectionMonthKey(input.currentMonthKey);
  const comparisonMonth = parseCollectionMonthKey(input.comparisonMonthKey);
  if (!currentMonth || !comparisonMonth) {
    return 1;
  }

  return Math.max(
    1,
    Math.min(
      getCollectionDaysInMonth(currentMonth.year, currentMonth.month),
      getCollectionDaysInMonth(comparisonMonth.year, comparisonMonth.month),
    ),
  );
}

export function normalizeCollectionSameDayPaceDayRange(
  range: CollectionSameDayPaceDayRangeLike | null | undefined,
  maxDay: number,
): CollectionSameDayPaceDayRangeLike {
  const safeMaxDay = Math.max(1, Math.trunc(Number(maxDay || 1)));
  if (!range) {
    return {
      startDay: 1,
      endDay: safeMaxDay,
    };
  }

  const rawStartDay = Math.trunc(Number(range.startDay || 1));
  const rawEndDay = Math.trunc(Number(range.endDay || safeMaxDay));
  const startDay = Math.max(1, Math.min(safeMaxDay, Number.isFinite(rawStartDay) ? rawStartDay : 1));
  const endDay = Math.max(1, Math.min(safeMaxDay, Number.isFinite(rawEndDay) ? rawEndDay : safeMaxDay));

  return {
    startDay: Math.min(startDay, endDay),
    endDay: Math.max(startDay, endDay),
  };
}

export function buildCollectionSameDayPaceDayOptions(maxDay: number): CollectionSameDayPaceDayOption[] {
  const safeMaxDay = Math.max(1, Math.trunc(Number(maxDay || 1)));
  return Array.from({ length: safeMaxDay }, (_, index) => {
    const day = index + 1;
    return {
      value: day,
      label: `Day ${day}`,
    };
  });
}

export function resolveCollectionSameDayPaceWindowMode(
  range: CollectionSameDayPaceDayRangeLike | null | undefined,
): CollectionSameDayPaceWindowMode {
  if (!range) {
    return "cumulative";
  }

  if (range.startDay === range.endDay) {
    return "single-day";
  }

  return range.startDay === 1 ? "cumulative" : "custom-range";
}

export function resolveCollectionSameDayPaceRangeForSelection(input: {
  day: number;
  maxDay: number;
  windowMode: CollectionSameDayPaceWindowMode;
  currentRange?: CollectionSameDayPaceDayRangeLike | null | undefined;
}): CollectionSameDayPaceDayRangeLike {
  const safeMaxDay = Math.max(1, Math.trunc(Number(input.maxDay || 1)));
  const selectedDay = Math.max(1, Math.min(safeMaxDay, Math.trunc(Number(input.day || 1))));

  if (input.windowMode === "single-day") {
    return {
      startDay: selectedDay,
      endDay: selectedDay,
    };
  }

  if (input.windowMode === "custom-range") {
    const currentRange = normalizeCollectionSameDayPaceDayRange(input.currentRange, safeMaxDay);
    return normalizeCollectionSameDayPaceDayRange({
      startDay: currentRange.startDay,
      endDay: selectedDay,
    }, safeMaxDay);
  }

  return {
    startDay: 1,
    endDay: selectedDay,
  };
}

export function resolveCollectionSameDayPaceCompareModeLabel(
  mode: CollectionSameDayPaceComparisonMode,
): string {
  if (mode === "previous-year") {
    return "Hari sama tahun lepas";
  }

  if (mode === "previous-month") {
    return "Hari sama bulan lepas";
  }

  return "Bulan mula dipilih";
}

export function buildCollectionSameDayPaceQuickOptions(input: {
  points?: CollectionSameDayPaceQuickPoint[] | null | undefined;
  maxDay: number;
  currentMonthKey?: string | null | undefined;
  referenceDate?: Date | undefined;
}): CollectionSameDayPaceQuickOption[] {
  const safeMaxDay = Math.max(1, Math.trunc(Number(input.maxDay || 1)));
  const referenceDate = input.referenceDate ?? new Date();
  const referenceMonthKey = getLocalReferenceMonthKey(referenceDate);
  const referenceDay = getSafeReferenceDay(referenceDate);
  const currentMonthKey = String(input.currentMonthKey || "").trim();
  const selectedMonthIsCurrentMonth = Boolean(
    currentMonthKey
    && referenceMonthKey
    && currentMonthKey === referenceMonthKey,
  );
  const currentDayOfMonth = referenceDay === null
    ? safeMaxDay
    : Math.max(1, Math.min(safeMaxDay, referenceDay));
  const yesterdayDayOfMonth = referenceDay === null
    ? null
    : Math.max(1, Math.min(safeMaxDay, referenceDay - 1));
  const yesterdayAvailable = selectedMonthIsCurrentMonth
    && yesterdayDayOfMonth !== null
    && referenceDay !== null
    && referenceDay > 1;
  const points = (input.points || [])
    .filter((point) => point.day >= 1 && point.day <= safeMaxDay);
  const activePoints = points.filter((point) => point.currentAmount > 0);
  const lastCollectionPoint = activePoints.reduce<CollectionSameDayPaceQuickPoint | null>((latest, point) => (
    !latest || point.day > latest.day ? point : latest
  ), null);
  const bestPoint = activePoints.reduce<CollectionSameDayPaceQuickPoint | null>((best, point) => (
    !best || point.currentAmount > best.currentAmount ? point : best
  ), null);
  const weakestPoint = activePoints.reduce<CollectionSameDayPaceQuickPoint | null>((weakest, point) => (
    !weakest || point.currentAmount < weakest.currentAmount ? point : weakest
  ), null);

  return [
    {
      id: "today",
      label: "Today",
      description: selectedMonthIsCurrentMonth
        ? `Bandingkan jumlah terkumpul sehingga hari ${currentDayOfMonth} bulan semasa.`
        : "Today hanya aktif apabila end month ialah bulan semasa.",
      windowMode: "cumulative",
      range: selectedMonthIsCurrentMonth ? { startDay: 1, endDay: currentDayOfMonth } : undefined,
      disabled: !selectedMonthIsCurrentMonth,
    },
    {
      id: "yesterday",
      label: "Yesterday",
      description: yesterdayAvailable
        ? `Bandingkan jumlah terkumpul sehingga semalam, hari ${yesterdayDayOfMonth}.`
        : "Yesterday hanya aktif untuk bulan semasa selepas hari pertama bulan.",
      windowMode: "cumulative",
      range: yesterdayAvailable && yesterdayDayOfMonth !== null
        ? { startDay: 1, endDay: yesterdayDayOfMonth }
        : undefined,
      disabled: !yesterdayAvailable,
    },
    {
      id: "current-day-of-month",
      label: "Current day-of-month",
      description: referenceDay !== null && referenceDay > safeMaxDay
        ? `Hari semasa melebihi bulan dipilih, jadi comparison dikunci pada hari ${safeMaxDay}.`
        : `Gunakan nombor hari semasa, hari ${currentDayOfMonth}, pada bulan dipilih.`,
      windowMode: "cumulative",
      range: { startDay: 1, endDay: currentDayOfMonth },
    },
    {
      id: "end-of-month-simulation",
      label: "End-of-month simulation",
      description: `Simulasikan comparison penuh sehingga hari ${safeMaxDay}.`,
      windowMode: "cumulative",
      range: { startDay: 1, endDay: safeMaxDay },
    },
    {
      id: "same-day-previous-month",
      label: "Hari sama bulan lepas",
      description: "Bandingkan bulan semasa dengan hari sama pada bulan lepas.",
      comparisonMode: "previous-month",
      windowMode: "cumulative",
      range: { startDay: 1, endDay: safeMaxDay },
    },
    {
      id: "same-day-previous-year",
      label: "Hari sama tahun lepas",
      description: "Bandingkan bulan semasa dengan bulan yang sama pada tahun lepas.",
      comparisonMode: "previous-year",
      windowMode: "cumulative",
      range: { startDay: 1, endDay: safeMaxDay },
    },
    {
      id: "last-collection-day",
      label: "Hari terakhir ada kutipan",
      description: lastCollectionPoint
        ? `Fokus sehingga hari ${lastCollectionPoint.day}, hari terakhir yang mempunyai kutipan.`
        : "Tiada hari kutipan aktif dalam julat semasa.",
      windowMode: "cumulative",
      range: lastCollectionPoint ? { startDay: 1, endDay: lastCollectionPoint.day } : undefined,
      disabled: !lastCollectionPoint,
    },
    {
      id: "best-current-day",
      label: "Hari terbaik bulan ini",
      description: bestPoint
        ? `Fokus satu hari pada hari ${bestPoint.day}, kutipan harian tertinggi bulan semasa.`
        : "Tiada hari kutipan aktif untuk cari hari terbaik.",
      windowMode: "single-day",
      range: bestPoint ? { startDay: bestPoint.day, endDay: bestPoint.day } : undefined,
      disabled: !bestPoint,
    },
    {
      id: "weakest-current-day",
      label: "Hari terburuk bulan ini",
      description: weakestPoint
        ? `Fokus satu hari pada hari ${weakestPoint.day}, kutipan harian terendah bulan semasa.`
        : "Tiada hari kutipan aktif untuk cari hari terburuk.",
      windowMode: "single-day",
      range: weakestPoint ? { startDay: weakestPoint.day, endDay: weakestPoint.day } : undefined,
      disabled: !weakestPoint,
    },
  ];
}
