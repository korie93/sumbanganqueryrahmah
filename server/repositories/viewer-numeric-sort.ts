import { sql, type SQL } from "drizzle-orm";
import type { ImportDataNumericSort } from "../../shared/common/import-data-sort";
import { buildViewerNumericValue } from "./viewer-numeric-filter";

export function buildViewerNumericOrder(sort: ImportDataNumericSort): SQL {
  const value = buildViewerNumericValue(sort.column);
  return sort.direction === "desc"
    ? sql`${value} DESC NULLS LAST, dr.id ASC`
    : sql`${value} ASC NULLS LAST, dr.id ASC`;
}

/** Anchor comes from the same authorized, filtered import, never from cursor data. */
export function buildViewerNumericCursorCondition(sort: ImportDataNumericSort, cursor: string): SQL {
  const value = buildViewerNumericValue(sort.column);
  const comparison = sort.direction === "desc"
    ? sql`${value} < viewer_sort_anchor.value`
    : sql`${value} > viewer_sort_anchor.value`;
  return sql`(
    (viewer_sort_anchor.value IS NOT NULL AND (
      ${comparison}
      OR (${value} = viewer_sort_anchor.value AND dr.id > ${cursor})
      OR ${value} IS NULL
    ))
    OR (viewer_sort_anchor.value IS NULL AND ${value} IS NULL AND dr.id > ${cursor})
  )`;
}
