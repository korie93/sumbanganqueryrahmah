import { sql, type SQL } from "drizzle-orm";
import {
  IMPORT_FILTER_COMPACT_DATE_PATTERN,
  IMPORT_FILTER_DATE_MAX_LENGTH,
  IMPORT_FILTER_DAY_FIRST_DATE_PATTERN,
  IMPORT_FILTER_ISO_DATE_PATTERN,
  normalizeImportFilterDateBound,
  type DateImportFilterOperator,
} from "../../shared/common/import-data-dates";

/** Calendar key YYYYMMDD; invalid/dirty cells yield NULL without date casts. */
export function buildViewerDateValue(column: string): SQL {
  const cell = sql`dr.json_data::jsonb -> ${column}`;
  const text = sql`dr.json_data::jsonb ->> ${column}`;
  // Native JSON numeric tokens such as 20261029.0 and 2.0261029e7 lose
  // their lexical form in browsers. Canonicalize only actual JSON numbers.
  const raw = sql`CASE WHEN jsonb_typeof(${cell}) = 'number' THEN
    CASE WHEN (${text})::numeric BETWEEN 10000000 AND 99999999
      AND (${text})::numeric = trunc((${text})::numeric)
    THEN ((${text})::numeric)::int::text ELSE NULL END
    ELSE btrim(${text}, E' \t\r\n') END`;
  return sql`(SELECT CASE
    WHEN p.parts[1] BETWEEN 1 AND 9999 AND p.parts[2] BETWEEN 1 AND 12
      AND p.parts[3] BETWEEN 1 AND CASE
        WHEN p.parts[2] = 2 THEN CASE WHEN p.parts[1] % 4 = 0
          AND (p.parts[1] % 100 <> 0 OR p.parts[1] % 400 = 0) THEN 29 ELSE 28 END
        WHEN p.parts[2] IN (4, 6, 9, 11) THEN 30 ELSE 31 END
    THEN p.parts[1] * 10000 + p.parts[2] * 100 + p.parts[3] ELSE NULL END
    FROM (SELECT CASE WHEN length(v.text) <= ${IMPORT_FILTER_DATE_MAX_LENGTH} THEN CASE
      WHEN v.text ~ ${IMPORT_FILTER_ISO_DATE_PATTERN}
        THEN ARRAY[substring(v.text FROM 1 FOR 4)::int, substring(v.text FROM 6 FOR 2)::int, substring(v.text FROM 9 FOR 2)::int]
      WHEN v.text ~ ${IMPORT_FILTER_COMPACT_DATE_PATTERN}
        THEN ARRAY[substring(v.text FROM 1 FOR 4)::int, substring(v.text FROM 5 FOR 2)::int, substring(v.text FROM 7 FOR 2)::int]
      WHEN v.text ~ ${IMPORT_FILTER_DAY_FIRST_DATE_PATTERN}
        THEN ARRAY[(regexp_match(v.text, ${IMPORT_FILTER_DAY_FIRST_DATE_PATTERN}))[4]::int,
          (regexp_match(v.text, ${IMPORT_FILTER_DAY_FIRST_DATE_PATTERN}))[3]::int,
          (regexp_match(v.text, ${IMPORT_FILTER_DAY_FIRST_DATE_PATTERN}))[1]::int]
      ELSE NULL END ELSE NULL END AS parts FROM (SELECT ${raw} AS text) v) p)`;
}

export function buildViewerDateFilterCondition(
  column: string, operator: DateImportFilterOperator, value: string, valueTo?: string,
): SQL {
  const lower = normalizeImportFilterDateBound(value);
  const upper = operator === "dateBetween" ? normalizeImportFilterDateBound(valueTo) : null;
  if (lower === null || (operator === "dateBetween" && (upper === null || lower > upper))) return sql`false`;
  const start = Number(lower.replace(/-/g, ""));
  const date = buildViewerDateValue(column);
  if (operator === "dateBefore") return sql`${date} < ${start}::int`;
  if (operator === "dateAfter") return sql`${date} > ${start}::int`;
  return sql`${date} BETWEEN ${start}::int AND ${Number(upper!.replace(/-/g, ""))}::int`;
}
