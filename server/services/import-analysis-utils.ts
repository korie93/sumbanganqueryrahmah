import type { DataRow } from "../../shared/schema-postgres";

const EXCLUDE_COLUMNS_FROM_IC = [
  "AGREEMENT",
  "LOAN",
  "ACCOUNT",
  "AKAUN",
  "PINJAMAN",
  "CONTRACT",
  "KONTRAK",
  "REFERENCE",
  "TRANSACTION",
  "TRANSAKSI",
  "PHONE",
  "TELEFON",
  "MOBILE",
  "HANDPHONE",
  "FAX",
  "FAKS",
  "E-MONEY",
] as const;
const EXCLUDE_COLUMNS_FROM_POLICE = [
  "VEHICLE",
  "KENDERAAN",
  "REGISTRATION",
  "PLATE",
  "RSTG",
  "CAR",
  "KERETA",
  "MOTOR",
  "MOTOSIKAL",
  "VEH",
  "PENDAFTARAN",
] as const;

export const IMPORT_ANALYSIS_BATCH_SIZE = 500;
export const IMPORT_ANALYSIS_MAX_PROFILED_COLUMNS = 300;
export const IMPORT_ANALYSIS_MAX_TRACKED_UNIQUE_VALUES = 512;

export type ImportAnalysisColumnValueType =
  | "boolean"
  | "date"
  | "empty"
  | "mixed"
  | "number"
  | "structured"
  | "text";

type ProfiledValueType = Exclude<ImportAnalysisColumnValueType, "empty" | "mixed">;

type ImportAnalysisColumnProfileAccumulator = {
  name: string;
  applicableRows: number;
  populatedCount: number;
  typeCounts: Record<ProfiledValueType, number>;
  trackedValues: Map<string, number>;
  uniqueCountIsApproximate: boolean;
};

export type ImportAnalysisDatasetScope = {
  observedColumns: Set<string>;
};

export type ImportAnalysisAccumulator = {
  icLelakiSet: Set<string>;
  icPerempuanSet: Set<string>;
  noPolisSet: Set<string>;
  noTenteraSet: Set<string>;
  passportMYSet: Set<string>;
  passportLuarNegaraSet: Set<string>;
  valueCounts: Record<string, number>;
  processedValues: Set<string>;
  columnProfiles: Map<string, ImportAnalysisColumnProfileAccumulator>;
  columnLimitReached: boolean;
};

const PROFILED_VALUE_TYPES: ProfiledValueType[] = [
  "boolean",
  "date",
  "number",
  "structured",
  "text",
];

function createColumnTypeCounts(): Record<ProfiledValueType, number> {
  return {
    boolean: 0,
    date: 0,
    number: 0,
    structured: 0,
    text: 0,
  };
}

function normalizeColumnName(rawName: string) {
  return rawName.trim().slice(0, 120);
}

function classifyProfiledValue(value: unknown): ProfiledValueType | "empty" {
  if (value === null || value === undefined) {
    return "empty";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? "number" : "text";
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return "empty";
    }

    if (/^(?:true|false)$/i.test(normalized)) {
      return "boolean";
    }

    if (
      normalized.length <= 64 &&
      /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized) &&
      Number.isFinite(Number(normalized))
    ) {
      return "number";
    }

    if (
      normalized.length <= 64 &&
      /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(normalized) &&
      Number.isFinite(Date.parse(normalized))
    ) {
      return "date";
    }

    return "text";
  }

  if (typeof value === "object") {
    return "structured";
  }

  return "text";
}

function normalizeTrackedProfileValue(value: unknown, valueType: ProfiledValueType) {
  if (valueType === "structured") {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const bounded = normalized.length > 160
    ? `${normalized.slice(0, 152)}:${normalized.length}`
    : normalized;
  return valueType === "text" ? bounded.toLowerCase() : bounded;
}

function getOrCreateColumnProfile(
  accumulator: ImportAnalysisAccumulator,
  rawName: string,
) {
  const name = normalizeColumnName(rawName);
  if (!name) {
    return null;
  }

  const existing = accumulator.columnProfiles.get(name);
  if (existing) {
    return existing;
  }

  if (accumulator.columnProfiles.size >= IMPORT_ANALYSIS_MAX_PROFILED_COLUMNS) {
    accumulator.columnLimitReached = true;
    return null;
  }

  const profile: ImportAnalysisColumnProfileAccumulator = {
    name,
    applicableRows: 0,
    populatedCount: 0,
    typeCounts: createColumnTypeCounts(),
    trackedValues: new Map(),
    uniqueCountIsApproximate: false,
  };
  accumulator.columnProfiles.set(name, profile);
  return profile;
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 10_000) / 100;
}

function resolveQualityGrade(score: number, hasData: boolean) {
  if (!hasData) return "no_data" as const;
  if (score >= 95) return "excellent" as const;
  if (score >= 85) return "good" as const;
  if (score >= 70) return "review" as const;
  return "poor" as const;
}

function isValidMalaysianIC(ic: string): boolean {
  if (!/^\d{12}$/.test(ic)) return false;
  if (ic.startsWith("01")) return false;

  const month = Number.parseInt(ic.substring(2, 4), 10);
  const day = Number.parseInt(ic.substring(4, 6), 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function splitCellValue(value: string): string[] {
  const withoutLabels = value.replace(/\b(IC\d*|NRIC|NO\.?\s*IC|KAD PENGENALAN|KP)\s*[:=]/gi, " ");
  return withoutLabels
    .split(/[\/,;|\n\r\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createImportAnalysisAccumulator(): ImportAnalysisAccumulator {
  return {
    icLelakiSet: new Set(),
    icPerempuanSet: new Set(),
    noPolisSet: new Set(),
    noTenteraSet: new Set(),
    passportMYSet: new Set(),
    passportLuarNegaraSet: new Set(),
    valueCounts: {},
    processedValues: new Set(),
    columnProfiles: new Map(),
    columnLimitReached: false,
  };
}

export function createImportAnalysisDatasetScope(): ImportAnalysisDatasetScope {
  return {
    observedColumns: new Set(),
  };
}

export function finalizeImportAnalysisDatasetScope(
  accumulator: ImportAnalysisAccumulator,
  scope: ImportAnalysisDatasetScope,
  processedRows: number,
) {
  const applicableRows = Math.max(0, Math.trunc(processedRows));
  for (const columnName of scope.observedColumns) {
    const profile = accumulator.columnProfiles.get(columnName);
    if (profile) {
      profile.applicableRows += applicableRows;
    }
  }
}

export function consumeImportAnalysisRows(
  accumulator: ImportAnalysisAccumulator,
  rows: DataRow[],
  datasetScope?: ImportAnalysisDatasetScope,
) {
  const passportPattern = /^[A-Z]{1,2}\d{6,9}$/i;
  const malaysiaPassportPrefixes = ["A", "H", "K", "Q"];
  const excludePrefixes = ["LOT", "NO", "PT", "KM", "JLN", "BLK", "TMN", "KG", "SG", "BTU", "RM"];

  const isValidPolisNo = (value: string): boolean => {
    if (/^P\d{3,}$/i.test(value)) return false;
    if (/^G\d{5,10}$/i.test(value)) return true;
    if (/^(RF|SW)\d{4,10}$/i.test(value)) return true;
    if (/^(RFT|PDRM|POLIS|POL)\d{3,10}$/i.test(value)) return true;
    return false;
  };

  const isValidTenteraNo = (value: string): boolean => {
    if (/^M\d{3,}$/i.test(value)) return false;
    if (/^T\d{5,10}$/i.test(value)) return true;
    if (/^(TD|TA|TT)\d{4,10}$/i.test(value)) return true;
    if (/^(TLDM|TUDM|ARMY|ATM|MAF|TEN|MIL)\d{3,10}$/i.test(value)) return true;
    return false;
  };

  for (const row of rows) {
    const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object"
      ? row.jsonDataJsonb as Record<string, unknown>
      : {};

    for (const [key, rawValue] of Object.entries(data)) {
      const profile = getOrCreateColumnProfile(accumulator, key);
      if (profile) {
        if (datasetScope) {
          datasetScope.observedColumns.add(profile.name);
        } else {
          profile.applicableRows += 1;
        }

        const valueType = classifyProfiledValue(rawValue);
        if (valueType !== "empty") {
          profile.populatedCount += 1;
          profile.typeCounts[valueType] += 1;

          const trackedValue = normalizeTrackedProfileValue(rawValue, valueType);
          if (trackedValue) {
            const existingCount = profile.trackedValues.get(trackedValue);
            if (existingCount !== undefined) {
              profile.trackedValues.set(trackedValue, existingCount + 1);
            } else if (
              profile.trackedValues.size < IMPORT_ANALYSIS_MAX_TRACKED_UNIQUE_VALUES
            ) {
              profile.trackedValues.set(trackedValue, 1);
            } else {
              profile.uniqueCountIsApproximate = true;
            }
          }
        }
      }

      if (typeof rawValue !== "string") continue;

      const keyUpper = key.toUpperCase();
      const isExcludedFromIC = EXCLUDE_COLUMNS_FROM_IC.some((value) => keyUpper.includes(value));
      const isExcludedFromPolice = EXCLUDE_COLUMNS_FROM_POLICE.some((value) => keyUpper.includes(value));

      for (const fragment of splitCellValue(rawValue)) {
        const cleaned = fragment.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!cleaned) continue;

        accumulator.valueCounts[cleaned] = (accumulator.valueCounts[cleaned] || 0) + 1;

        if (accumulator.processedValues.has(cleaned)) continue;
        accumulator.processedValues.add(cleaned);

        if (!isExcludedFromIC && isValidMalaysianIC(cleaned)) {
          const lastDigit = Number.parseInt(cleaned.charAt(11), 10);
          if (lastDigit % 2 === 1) accumulator.icLelakiSet.add(cleaned);
          else accumulator.icPerempuanSet.add(cleaned);
          continue;
        }

        if (!isExcludedFromPolice && isValidPolisNo(cleaned)) {
          accumulator.noPolisSet.add(cleaned);
          continue;
        }

        if (isValidTenteraNo(cleaned)) {
          accumulator.noTenteraSet.add(cleaned);
          continue;
        }

        if (!passportPattern.test(cleaned)) continue;
        if (excludePrefixes.some((prefix) => cleaned.startsWith(prefix))) continue;

        const firstChar = cleaned.charAt(0);
        if (malaysiaPassportPrefixes.includes(firstChar)) {
          accumulator.passportMYSet.add(cleaned);
        } else {
          accumulator.passportLuarNegaraSet.add(cleaned);
        }
      }
    }
  }
}

export function finalizeImportAnalysisAccumulator(accumulator: ImportAnalysisAccumulator) {
  const duplicateItems = Object.entries(accumulator.valueCounts)
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count);

  const icLelaki = Array.from(accumulator.icLelakiSet);
  const icPerempuan = Array.from(accumulator.icPerempuanSet);
  const noPolis = Array.from(accumulator.noPolisSet);
  const noTentera = Array.from(accumulator.noTenteraSet);
  const passportMY = Array.from(accumulator.passportMYSet);
  const passportLuarNegara = Array.from(accumulator.passportLuarNegaraSet);
  const columns = Array.from(accumulator.columnProfiles.values())
    .map((profile) => {
      const populatedTypes = PROFILED_VALUE_TYPES.filter(
        (valueType) => profile.typeCounts[valueType] > 0,
      );
      const dominantTypeCount = Math.max(
        0,
        ...PROFILED_VALUE_TYPES.map((valueType) => profile.typeCounts[valueType]),
      );
      const inferredType: ImportAnalysisColumnValueType =
        populatedTypes.length === 0
          ? "empty"
          : populatedTypes.length === 1
            ? populatedTypes[0]!
            : "mixed";
      const emptyCount = Math.max(0, profile.applicableRows - profile.populatedCount);
      const duplicateCount = Array.from(profile.trackedValues.values())
        .reduce((sum, count) => sum + Math.max(0, count - 1), 0);

      return {
        name: profile.name,
        inferredType,
        applicableRows: profile.applicableRows,
        populatedCount: profile.populatedCount,
        emptyCount,
        completenessPercent: toPercent(profile.populatedCount, profile.applicableRows),
        typeConsistencyPercent: toPercent(dominantTypeCount, profile.populatedCount),
        uniqueCount: profile.trackedValues.size,
        uniqueCountIsApproximate: profile.uniqueCountIsApproximate,
        duplicateCount,
        typeDistribution: { ...profile.typeCounts },
      };
    })
    .sort((left, right) => {
      const leftNeedsReview =
        left.emptyCount > 0 ||
        left.inferredType === "mixed";
      const rightNeedsReview =
        right.emptyCount > 0 ||
        right.inferredType === "mixed";
      if (leftNeedsReview !== rightNeedsReview) {
        return leftNeedsReview ? -1 : 1;
      }
      if (left.completenessPercent !== right.completenessPercent) {
        return left.completenessPercent - right.completenessPercent;
      }
      return left.name.localeCompare(right.name);
    });

  const totalApplicableCells = columns.reduce(
    (sum, profile) => sum + profile.applicableRows,
    0,
  );
  const populatedCells = columns.reduce(
    (sum, profile) => sum + profile.populatedCount,
    0,
  );
  const consistentCells = columns.reduce((sum, profile) => {
    return sum + Math.max(0, ...Object.values(profile.typeDistribution));
  }, 0);
  const completenessPercent = toPercent(populatedCells, totalApplicableCells);
  const typeConsistencyPercent = toPercent(consistentCells, populatedCells);
  const hasQualityData = totalApplicableCells > 0;
  const score = hasQualityData
    ? Math.round((completenessPercent * 0.7) + (typeConsistencyPercent * 0.3))
    : 0;
  const columnsNeedingReview = columns.filter(
    (profile) =>
      profile.emptyCount > 0 ||
      profile.inferredType === "mixed",
  ).length;

  return {
    icLelaki: { count: icLelaki.length, samples: icLelaki.slice(0, 50) },
    icPerempuan: { count: icPerempuan.length, samples: icPerempuan.slice(0, 50) },
    noPolis: { count: noPolis.length, samples: noPolis.slice(0, 50) },
    noTentera: { count: noTentera.length, samples: noTentera.slice(0, 50) },
    passportMY: { count: passportMY.length, samples: passportMY.slice(0, 50) },
    passportLuarNegara: { count: passportLuarNegara.length, samples: passportLuarNegara.slice(0, 50) },
    duplicates: { count: duplicateItems.length, items: duplicateItems.slice(0, 50) },
    quality: {
      score,
      grade: resolveQualityGrade(score, hasQualityData),
      completenessPercent,
      typeConsistencyPercent,
      profiledColumns: columns.length,
      columnsNeedingReview,
      columnsWithMissingValues: columns.filter((profile) => profile.emptyCount > 0).length,
      mixedTypeColumns: columns.filter((profile) => profile.inferredType === "mixed").length,
      limitedCardinalityColumns: columns.filter(
        (profile) => profile.uniqueCountIsApproximate,
      ).length,
      totalApplicableCells,
      populatedCells,
      emptyCells: Math.max(0, totalApplicableCells - populatedCells),
      columnLimitReached: accumulator.columnLimitReached,
    },
    columns,
  };
}
