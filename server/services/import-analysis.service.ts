import type { DataRow } from "../../shared/schema-postgres";
import type { ImportsRepository, ImportWithRowCount } from "../repositories/imports.repository";

const ANALYSIS_BATCH_SIZE = 500;
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

type AnalysisAccumulator = {
  icLelakiSet: Set<string>;
  icPerempuanSet: Set<string>;
  noPolisSet: Set<string>;
  noTenteraSet: Set<string>;
  passportMYSet: Set<string>;
  passportLuarNegaraSet: Set<string>;
  valueCounts: Record<string, number>;
  processedValues: Set<string>;
};

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

function createAccumulator(): AnalysisAccumulator {
  return {
    icLelakiSet: new Set(),
    icPerempuanSet: new Set(),
    noPolisSet: new Set(),
    noTenteraSet: new Set(),
    passportMYSet: new Set(),
    passportLuarNegaraSet: new Set(),
    valueCounts: {},
    processedValues: new Set(),
  };
}

function consumeRows(accumulator: AnalysisAccumulator, rows: DataRow[]) {
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

function finalizeAccumulator(accumulator: AnalysisAccumulator) {
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

  return {
    icLelaki: { count: icLelaki.length, samples: icLelaki.slice(0, 50) },
    icPerempuan: { count: icPerempuan.length, samples: icPerempuan.slice(0, 50) },
    noPolis: { count: noPolis.length, samples: noPolis.slice(0, 50) },
    noTentera: { count: noTentera.length, samples: noTentera.slice(0, 50) },
    passportMY: { count: passportMY.length, samples: passportMY.slice(0, 50) },
    passportLuarNegara: { count: passportLuarNegara.length, samples: passportLuarNegara.slice(0, 50) },
    duplicates: { count: duplicateItems.length, items: duplicateItems.slice(0, 50) },
  };
}

export class ImportAnalysisService {
  constructor(private readonly importsRepository: ImportsRepository) {}

  async analyzeImport(importRecord: { id: string; name: string; filename: string }) {
    const accumulator = createAccumulator();
    const totalRows = await this.importsRepository.getDataRowCountByImport(importRecord.id);

    for (let offset = 0; offset < totalRows; offset += ANALYSIS_BATCH_SIZE) {
      const rows = await this.importsRepository.getDataRowsByImportPage(
        importRecord.id,
        ANALYSIS_BATCH_SIZE,
        offset,
      );
      consumeRows(accumulator, rows);
    }

    return {
      import: {
        id: importRecord.id,
        name: importRecord.name,
        filename: importRecord.filename,
      },
      totalRows,
      analysis: finalizeAccumulator(accumulator),
    };
  }

  async analyzeAll(importsWithCounts: ImportWithRowCount[]) {
    if (importsWithCounts.length === 0) {
      return {
        totalImports: 0,
        totalRows: 0,
        imports: [],
        analysis: finalizeAccumulator(createAccumulator()),
      };
    }

    const accumulator = createAccumulator();
    let totalRows = 0;

    for (const importRecord of importsWithCounts) {
      totalRows += Number(importRecord.rowCount || 0);

      for (let offset = 0; offset < Number(importRecord.rowCount || 0); offset += ANALYSIS_BATCH_SIZE) {
        const rows = await this.importsRepository.getDataRowsByImportPage(
          importRecord.id,
          ANALYSIS_BATCH_SIZE,
          offset,
        );
        consumeRows(accumulator, rows);
      }
    }

    return {
      totalImports: importsWithCounts.length,
      totalRows,
      imports: importsWithCounts.map((importRecord) => ({
        id: importRecord.id,
        name: importRecord.name,
        filename: importRecord.filename,
        rowCount: importRecord.rowCount,
      })),
      analysis: finalizeAccumulator(accumulator),
    };
  }
}
