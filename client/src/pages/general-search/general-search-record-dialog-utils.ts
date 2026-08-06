import type { SearchResultRow } from "@/pages/general-search/types";
import {
  collectSearchHeaders,
  getCellDisplayText,
  getPriorityRank,
} from "@/pages/general-search/utils";

export type GeneralSearchRecordField = {
  header: string;
  value: string;
};

export type GeneralSearchRecordDialogView = {
  additionalFields: GeneralSearchRecordField[];
  contactFields: GeneralSearchRecordField[];
  emptyFields: GeneralSearchRecordField[];
  identityFields: GeneralSearchRecordField[];
  sourceFields: GeneralSearchRecordField[];
  summaryFields: GeneralSearchRecordField[];
  totalFields: number;
};

function hasRecordFieldValue(rawValue: unknown): boolean {
  if (rawValue === null || rawValue === undefined) return false;
  if (typeof rawValue === "string") {
    const normalized = rawValue.trim();
    return normalized !== "" && normalized !== "-";
  }
  if (Array.isArray(rawValue)) return rawValue.length > 0;
  return true;
}

function isSourceHeader(header: string): boolean {
  return header.trim().toLowerCase() === "source file";
}

export function buildGeneralSearchRecordDialogView(
  record: SearchResultRow,
  canSeeSourceFile: boolean,
): GeneralSearchRecordDialogView {
  const orderedHeaders = collectSearchHeaders([record], canSeeSourceFile);
  const sourceFields = orderedHeaders
    .filter((header) => isSourceHeader(header))
    .map((header) => ({
      header,
      value: getCellDisplayText(record[header]),
    }));
  const recordHeaders = orderedHeaders.filter((header) => !isSourceHeader(header));
  const populatedFields = recordHeaders
    .filter((header) => hasRecordFieldValue(record[header]))
    .map((header) => ({
      header,
      value: getCellDisplayText(record[header]),
    }));
  const emptyFields = recordHeaders
    .filter((header) => !hasRecordFieldValue(record[header]))
    .map((header) => ({
      header,
      value: getCellDisplayText(record[header]),
    }));
  const summaryFields = populatedFields
    .filter(({ header }) => getPriorityRank(header) <= 2)
    .slice(0, 3);
  const summaryHeaders = new Set(summaryFields.map(({ header }) => header));
  const remainingFields = populatedFields.filter(({ header }) => !summaryHeaders.has(header));

  return {
    additionalFields: remainingFields.filter(({ header }) => getPriorityRank(header) > 6),
    contactFields: remainingFields.filter(({ header }) => {
      const rank = getPriorityRank(header);
      return rank >= 4 && rank <= 6;
    }),
    emptyFields,
    identityFields: remainingFields.filter(({ header }) => getPriorityRank(header) <= 3),
    sourceFields,
    summaryFields,
    totalFields: orderedHeaders.length,
  };
}
