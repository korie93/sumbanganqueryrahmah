import { sql, type SQL } from "drizzle-orm";
import {
  compareImportFilterNumbers,
  IMPORT_FILTER_NUMBER_MAX_LENGTH,
  IMPORT_FILTER_NUMBER_PATTERN,
  normalizeImportFilterNumber,
  type NumericImportFilterOperator,
} from "../../shared/common/import-data-filters";

/** Shared Viewer numeric expression; dirty imported cells cannot reach a cast. */
export function buildViewerNumericValue(column: string): SQL {
  const text = sql`btrim(dr.json_data::jsonb ->> ${column}, E' \t\r\n')`;
  // The cast belongs inside CASE: a separate WHERE predicate is not an
  // evaluation-order guarantee when mixed numeric/text values share a column.
  return sql`CASE
    WHEN length(${text}) <= ${IMPORT_FILTER_NUMBER_MAX_LENGTH}
      AND ${text} ~ ${IMPORT_FILTER_NUMBER_PATTERN}
    THEN replace(${text}, ',', '')::numeric
    ELSE NULL
  END`;
}

/** Viewer-only exact decimal comparison; dirty imported cells cannot reach a cast. */
export function buildViewerNumericFilterCondition(
  column: string,
  operator: NumericImportFilterOperator,
  value: string,
  valueTo?: string,
): SQL {
  const lower = normalizeImportFilterNumber(value);
  const upper = operator === "between" ? normalizeImportFilterNumber(valueTo) : null;
  const order = lower !== null && upper !== null ? compareImportFilterNumbers(lower, upper) : null;
  if (lower === null || (operator === "between"
    && (upper === null || order === null || order === 1))) {
    return sql`false`;
  }

  const numeric = buildViewerNumericValue(column);
  if (operator === "greaterThan") return sql`${numeric} > ${lower}::numeric`;
  if (operator === "lessThan") return sql`${numeric} < ${lower}::numeric`;
  return sql`${numeric} BETWEEN ${lower}::numeric AND ${upper}::numeric`;
}
