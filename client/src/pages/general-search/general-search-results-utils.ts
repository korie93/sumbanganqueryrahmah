import type { SearchResultRow } from "@/pages/general-search/types";
import { getCellDisplayText } from "@/pages/general-search/utils";

const VIRTUAL_ROW_HEIGHT_PX = 52;
export const DEFAULT_GENERAL_SEARCH_VIEWPORT_HEIGHT_PX = 540;
const VIRTUAL_OVERSCAN_ROWS = 8;

export function buildGeneralSearchResultsRange(
  currentPage: number,
  resultsPerPage: number,
  totalResults: number,
) {
  const totalPages = Math.ceil(totalResults / resultsPerPage);
  const rangeStart = totalResults > 0 ? (currentPage - 1) * resultsPerPage + 1 : 0;
  const rangeEnd = Math.min(currentPage * resultsPerPage, totalResults);

  return { rangeEnd, rangeStart, totalPages };
}

export function buildGeneralSearchPaginationItems(
  currentPage: number,
  totalPages: number,
) {
  const items: Array<number | "ellipsis"> = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const isVisible =
      pageNumber === 1
      || pageNumber === totalPages
      || (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1);

    if (!isVisible) {
      if (pageNumber === currentPage - 2) {
        items.push("ellipsis");
      }
      continue;
    }

    items.push(pageNumber);
  }

  return items;
}

export function buildGeneralSearchVirtualRowsState(
  resultsLength: number,
  isLowSpecMode: boolean,
  tableScrollTop: number,
  viewportHeight = DEFAULT_GENERAL_SEARCH_VIEWPORT_HEIGHT_PX,
  rowHeight = VIRTUAL_ROW_HEIGHT_PX,
  headerHeight = 0,
) {
  const measuredRowHeight = Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : VIRTUAL_ROW_HEIGHT_PX;
  const measuredViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0
    ? viewportHeight : DEFAULT_GENERAL_SEARCH_VIEWPORT_HEIGHT_PX;
  const measuredHeaderHeight = Number.isFinite(headerHeight) ? Math.max(0, headerHeight) : 0;
  // The sticky header still occupies its original flow height: scrollTop is
  // already the body offset beneath it; only the visible height excludes it.
  const bodyScrollTop = Number.isFinite(tableScrollTop) ? Math.max(0, tableScrollTop) : 0;
  const enableVirtualRows = isLowSpecMode && resultsLength > 40;
  const visibleRows = Math.max(1, Math.ceil(Math.max(0, measuredViewportHeight - measuredHeaderHeight) / measuredRowHeight));
  const virtualVisibleRows = enableVirtualRows
    ? visibleRows + VIRTUAL_OVERSCAN_ROWS * 2
    : resultsLength;
  const virtualStartRow = enableVirtualRows
    ? Math.max(
        0,
        Math.min(
          Math.floor(bodyScrollTop / measuredRowHeight) - VIRTUAL_OVERSCAN_ROWS,
          resultsLength - virtualVisibleRows,
        ),
      )
    : 0;
  const virtualEndRow = enableVirtualRows
    ? Math.min(resultsLength, virtualStartRow + virtualVisibleRows)
    : resultsLength;
  const topSpacerHeight = enableVirtualRows ? virtualStartRow * measuredRowHeight : 0;
  const bottomSpacerHeight = enableVirtualRows
    ? Math.max(0, (resultsLength - virtualEndRow) * measuredRowHeight)
    : 0;

  return {
    bottomSpacerHeight,
    enableVirtualRows,
    topSpacerHeight,
    virtualEndRow,
    virtualStartRow,
  };
}

export function getGeneralSearchPopulatedHeaders(
  headers: string[],
  row: SearchResultRow,
) {
  const populatedHeaders = headers.filter((header) => {
    const safeText = getCellDisplayText(row?.[header]).trim();
    return safeText !== "" && safeText !== "-";
  });

  return populatedHeaders.length > 0 ? populatedHeaders : headers;
}
